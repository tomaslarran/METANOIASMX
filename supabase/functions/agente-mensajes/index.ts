import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERIFY_TOKEN = Deno.env.get("META_WH_VERIFY_TOKEN") || "metanoia_wh_2026";
const PHONE_NUMBER_ID = Deno.env.get("WA_PHONE_NUMBER_ID") || "1064395966761110";
const WA_API = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;
const IG_PAGE_ID = "17841470857318268";
const FB_PAGE_ID = "478694861999786";

const EQUIPO = [
  { nombre: "Amparo", wa: Deno.env.get("WA_AMPARO") || "5493874462320" },
  { nombre: "Valentina", wa: Deno.env.get("WA_VALENTINA") || "5493875094959" },
  { nombre: "Dani", wa: Deno.env.get("WA_DANI") || "5493875374699" },
  { nombre: "Flor", wa: Deno.env.get("WA_FLOR") || "5493875031295" },
];

serve(async (req) => {
  // ── Verificación del webhook (GET) ──────────────────────────────────────────
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("Unauthorized", { status: 403 });
  }

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // ── Verificación de firma Meta (X-Hub-Signature-256) ────────────────────────
  const rawBody = await req.text();
  const appSecret = Deno.env.get("META_APP_SECRET");
  if (appSecret) {
    const signature = req.headers.get("X-Hub-Signature-256") || "";
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", encoder.encode(appSecret),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
    const expected = "sha256=" + Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
    if (signature !== expected) {
      console.error("Invalid Meta signature:", signature, "expected:", expected);
      return new Response("Forbidden", { status: 403 });
    }
  }

  let body: any;
  try { body = JSON.parse(rawBody); } catch { return new Response("OK", { status: 200 }); }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const object = body.object as string;

  // ── WhatsApp ─────────────────────────────────────────────────────────────────
  if (object === "whatsapp_business_account") {
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    if (!value?.messages?.[0]) return new Response("OK", { status: 200 });

    const msg = value.messages[0];
    const fromId = msg.from as string;
    const fromName = (value.contacts?.[0]?.profile?.name as string) || fromId;
    const msgId = msg.id as string;
    const waToken = Deno.env.get("META_WA_TOKEN")!;

    const tiposSoportados = ["text", "audio", "image", "document"];
    if (!tiposSoportados.includes(msg.type)) return new Response("OK", { status: 200 });

    let texto = "";
    let imageBase64: string | null = null;
    let imageMediaType = "image/jpeg";

    if (msg.type === "text") {
      texto = (msg.text.body as string).trim();

    } else if (msg.type === "audio") {
      try {
        const media = await downloadMedia(msg.audio.id, waToken);
        const formData = new FormData();
        formData.append("file", new Blob([media.buffer], { type: media.mimeType }), "audio.ogg");
        formData.append("model", "whisper-large-v3");
        formData.append("language", "es");
        const tr = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${Deno.env.get("GROQ_API_KEY")}` },
          body: formData,
        });
        const trData = await tr.json();
        texto = trData.text?.trim() || "";
        if (!texto) {
          await sendWA(fromId, "No pude entender el audio. ¿Podés escribirme tu consulta? 😊");
          return new Response("OK", { status: 200 });
        }
      } catch (_) {
        await sendWA(fromId, "Hubo un problema con el audio. ¿Podés escribirme tu consulta? 😊");
        return new Response("OK", { status: 200 });
      }

    } else if (msg.type === "image") {
      try {
        const media = await downloadMedia(msg.image.id, waToken);
        const bytes = new Uint8Array(media.buffer);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        imageBase64 = btoa(binary);
        imageMediaType = media.mimeType || "image/jpeg";
        texto = msg.image?.caption?.trim() || "[imagen]";
      } catch (_) {
        await sendWA(fromId, "No pude procesar la imagen. ¿Podés describirme lo que necesitás? 😊");
        return new Response("OK", { status: 200 });
      }

    } else if (msg.type === "document") {
      const caption = msg.document?.caption?.trim() || "";
      await sendWA(fromId, `Recibí tu archivo${caption ? ` con el mensaje: "${caption}"` : ""}. Por ahora solo proceso texto, audios e imágenes. 😊`);
      await supabase.from("mensajes_publico").insert({
        plataforma: "whatsapp", from_id: fromId, from_name: fromName,
        mensaje: `[Documento] ${caption}`, estado: "respondido",
        respuesta: "Archivo recibido.", wa_message_id: msgId,
      });
      return new Response("OK", { status: 200 });
    }

    await procesarMensaje({
      supabase, fromId, fromName, texto, plataforma: "whatsapp", msgId,
      imageBase64, imageMediaType,
      sendReply: (t) => sendWA(fromId, t),
      sendEscalacion: (t) => Promise.all(EQUIPO.map(p => sendWA(p.wa, t))).then(() => {}),
    });

    return new Response("OK", { status: 200 });
  }

  // ── Instagram / Facebook Messenger ───────────────────────────────────────────
  if (object === "instagram" || object === "page") {
    const entry = body.entry?.[0];
    const messaging = entry?.messaging?.[0];
    if (!messaging?.message || messaging.message.is_echo) return new Response("OK", { status: 200 });

    const plataforma = object === "instagram" ? "instagram" : "facebook";
    // Ambos usan el Page Token — es el único válido para /{page-id}/messages
    const apiToken = Deno.env.get("META_FB_PAGE_TOKEN")!;
    // Messenger Platform siempre usa el Facebook Page ID para enviar (incluso para IG DMs)
    const pageId = FB_PAGE_ID;

    const fromId = messaging.sender.id as string;
    const msgId = messaging.message.mid as string;

    // Obtener nombre del usuario
    let fromName = fromId;
    try {
      const nameRes = await fetch(
        `https://graph.facebook.com/v21.0/${fromId}?fields=name&access_token=${apiToken}`
      );
      const nameData = await nameRes.json();
      if (nameData.name) fromName = nameData.name;
    } catch (_) {}

    let texto = messaging.message.text?.trim() || "";
    let imageBase64: string | null = null;
    let imageMediaType = "image/jpeg";

    // Attachments (imágenes, audio)
    if (messaging.message.attachments?.length) {
      const att = messaging.message.attachments[0];

      if (att.type === "image" && att.payload?.url) {
        try {
          const imgRes = await fetch(att.payload.url);
          const bytes = new Uint8Array(await imgRes.arrayBuffer());
          let binary = "";
          for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
          imageBase64 = btoa(binary);
          imageMediaType = "image/jpeg";
          texto = "[imagen]";
        } catch (_) {
          texto = "[imagen no procesada]";
        }

      } else if (att.type === "audio" && att.payload?.url) {
        try {
          const audioRes = await fetch(att.payload.url);
          const audioBuffer = await audioRes.arrayBuffer();
          const formData = new FormData();
          formData.append("file", new Blob([audioBuffer], { type: "audio/mpeg" }), "audio.mp3");
          formData.append("model", "whisper-large-v3");
          formData.append("language", "es");
          const tr = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${Deno.env.get("GROQ_API_KEY")}` },
            body: formData,
          });
          const trData = await tr.json();
          texto = trData.text?.trim() || "[audio no transcripto]";
        } catch (_) {
          texto = "[audio no procesado]";
        }

      } else {
        texto = `[${att.type}]`;
      }
    }

    if (!texto && !imageBase64) return new Response("OK", { status: 200 });

    await procesarMensaje({
      supabase, fromId, fromName, texto, plataforma, msgId,
      imageBase64, imageMediaType,
      sendReply: (t) => sendMessenger(fromId, t, pageId, apiToken),
      sendEscalacion: (t) => Promise.all(EQUIPO.map(p => sendWA(p.wa, t))).then(() => {}),
    });

    return new Response("OK", { status: 200 });
  }

  return new Response("OK", { status: 200 });
});

// ── Procesamiento común (Claude + DB) ─────────────────────────────────────────
async function procesarMensaje({ supabase, fromId, fromName, texto, plataforma, msgId, imageBase64, imageMediaType, sendReply, sendEscalacion }: {
  supabase: any;
  fromId: string;
  fromName: string;
  texto: string;
  plataforma: string;
  msgId: string;
  imageBase64: string | null;
  imageMediaType: string;
  sendReply: (text: string) => Promise<void>;
  sendEscalacion: (text: string) => Promise<void>;
}) {
  // Deduplicar
  const { data: yaExiste } = await supabase
    .from("mensajes_publico").select("id").eq("wa_message_id", msgId).limit(1);
  if (yaExiste && yaExiste.length > 0) return;

  const mensajeGuardado = imageBase64
    ? `🖼️ ${texto}` : texto.startsWith("🎤") ? texto : texto;

  await supabase.from("mensajes_publico").insert({
    plataforma, from_id: fromId, from_name: fromName,
    mensaje: mensajeGuardado, estado: "pendiente", wa_message_id: msgId,
  });

  // Debounce
  await new Promise(r => setTimeout(r, 2000));

  const { data: masNuevos } = await supabase
    .from("mensajes_publico").select("id")
    .eq("from_id", fromId).eq("plataforma", plataforma).eq("estado", "pendiente")
    .gt("created_at", new Date(Date.now() - 1800000).toISOString())
    .order("created_at", { ascending: false }).limit(2);

  if (masNuevos && masNuevos.length > 1) return;

  const { data: pendientes } = await supabase
    .from("mensajes_publico").select("id, mensaje")
    .eq("from_id", fromId).eq("plataforma", plataforma).eq("estado", "pendiente")
    .order("created_at", { ascending: true });

  const textoCombinado = pendientes?.map((p: any) => p.mensaje).join("\n") || texto;
  const idsPendientes = pendientes?.map((p: any) => p.id) || [];

  const seisHorasAtras = new Date(Date.now() - 6 * 3600000).toISOString();
  const { data: historial } = await supabase
    .from("mensajes_publico").select("mensaje, respuesta")
    .eq("from_id", fromId).eq("plataforma", plataforma).eq("estado", "respondido")
    .gt("created_at", seisHorasAtras)
    .order("created_at", { ascending: false }).limit(5);

  const { data: cursos } = await supabase
    .from("cursos").select("nombre, estado, fecha_inicio, fecha_fin, arancel, cupos_max, descripcion")
    .in("estado", ["Confirmado", "Próximo", "En curso", "Convocatoria"])
    .order("fecha_inicio", { ascending: true });

  const { data: publicaciones } = await supabase
    .from("publicaciones").select("plataforma, tipo, tema, caption, fecha_publicacion, url")
    .eq("estado", "publicado")
    .order("fecha_publicacion", { ascending: false })
    .limit(15);

  // Armar mensajes para Claude
  const messages: any[] = [];
  if (historial) {
    for (const h of [...historial].reverse()) {
      messages.push({ role: "user", content: h.mensaje });
      if (h.respuesta) messages.push({ role: "assistant", content: h.respuesta });
    }
  }

  if (imageBase64) {
    messages.push({
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: imageMediaType, data: imageBase64 } },
        { type: "text", text: texto === "[imagen]" ? "El usuario envió esta imagen." : textoCombinado },
      ],
    });
  } else {
    messages.push({ role: "user", content: textoCombinado });
  }

  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: imageBase64 ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: buildSistema(cursos ?? [], publicaciones ?? [], fromName, plataforma),
      messages,
    }),
  });

  const aiData = await aiRes.json();
  const rawResp: string = aiData.content?.[0]?.text ?? "";

  let escalado = false;
  let motivoEscalado: string | null = null;
  let respuesta = rawResp;

  try {
    const parsed = JSON.parse(rawResp);
    if (parsed.escalar === true) {
      escalado = true;
      motivoEscalado = parsed.motivo ?? null;
      respuesta = parsed.mensaje_usuario ?? "¡Perfecto! Le paso tus datos al equipo y en breve se comunican con vos. 😊";
      const platLabel = plataforma === "whatsapp" ? "WhatsApp" : plataforma === "instagram" ? "Instagram DM" : "Facebook Messenger";
      const notif = `🚨 *Consulta derivada — Metanoia SMX*\n\n*De:* ${fromName}\n*Canal:* ${platLabel}\n*Mensaje:* "${texto}"\n*Motivo:* ${motivoEscalado}\n\nResponder por ${platLabel}.`;
      await sendEscalacion(notif);
    }
  } catch (_) {}

  await sendReply(respuesta);

  if (idsPendientes.length > 0) {
    await supabase.from("mensajes_publico")
      .update({ respuesta, escalado, motivo_escalado: motivoEscalado, estado: escalado ? "escalado" : "respondido" })
      .in("id", idsPendientes);
  }
}

// ── Helpers de envío ──────────────────────────────────────────────────────────
async function sendWA(to: string, text: string): Promise<void> {
  const token = Deno.env.get("META_WA_TOKEN");
  await fetch(WA_API, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  }).catch(() => {});
}

async function sendMessenger(recipientId: string, text: string, pageId: string, token: string): Promise<void> {
  const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
      messaging_type: "RESPONSE",
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`sendMessenger error [${pageId}→${recipientId}]:`, err);
  }
}

async function downloadMedia(mediaId: string, token: string): Promise<{ buffer: Uint8Array; mimeType: string }> {
  const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  const metaData = await metaRes.json();
  const fileRes = await fetch(metaData.url, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  const buffer = new Uint8Array(await fileRes.arrayBuffer());
  return { buffer, mimeType: metaData.mime_type || "application/octet-stream" };
}

// ── System prompt ─────────────────────────────────────────────────────────────
function buildSistema(cursos: any[], publicaciones: any[], fromName: string, plataforma: string): string {
  const hoy = new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Salta" });

  const cursosTexto = cursos.length > 0
    ? cursos.map(c =>
        `• ${c.nombre} | ${c.estado} | Inicio: ${c.fecha_inicio ?? "a confirmar"} | Arancel: ${c.arancel ? "$" + Number(c.arancel).toLocaleString("es-AR") : "a consultar"}`
      ).join("\n")
    : "No hay cursos próximos publicados en este momento.";

  const pubTexto = publicaciones.length > 0
    ? publicaciones.map((p: any) => {
        const fecha = p.fecha_publicacion ? new Date(p.fecha_publicacion).toLocaleDateString("es-AR") : "—";
        const caption = p.caption ? p.caption.slice(0, 120) + (p.caption.length > 120 ? "…" : "") : "sin descripción";
        return `• [${p.plataforma}] ${fecha}${p.tema ? ` — ${p.tema}` : ""}: "${caption}"${p.url ? ` (${p.url})` : ""}`;
      }).join("\n")
    : "No hay publicaciones recientes registradas.";

  const canalNombre = plataforma === "whatsapp" ? "WhatsApp" : plataforma === "instagram" ? "Instagram" : "Facebook";

  return `Eres el asistente virtual de Metanoia SMX, centro de capacitación médica en simulación clínica de Salta, Argentina. Tu nombre es "Asistente de Metanoia". Hoy es ${hoy}. Estás hablando con ${fromName} por ${canalNombre}.

## QUIÉNES SOMOS
Metanoia SMX forma profesionales de la salud mediante simulación médica con rigor académico y certificación. Somos referentes en el NOA en educación médica basada en simulación.

Sede: España 1440, Salta capital (predio Colmedsa)
WhatsApp: +54 9 387 210-8071
Instagram: @metanoiasmx
Web: metanoiasme.com

## METODOLOGÍA
Todos nuestros cursos usan la metodología PEV (Planificar, Ejecutar, Verificar). Son 100% prácticos — simuladores de alta fidelidad, debriefing guiado y certificación académica. No son cursos teóricos.

## CERTIFICACIÓN
Certificados por Colmedsa (Colegio Médico de Salta). Validez académica reconocida en la provincia.

## CURSOS DISPONIBLES AHORA
${cursosTexto}

## PUBLICACIONES RECIENTES EN REDES SOCIALES
${pubTexto}
Si alguien menciona algo que vio en redes, intentá relacionarlo con estas publicaciones y respondé en contexto.

## CÓMO INSCRIBIRSE
1. Elegís el curso que te interesa
2. Completás el formulario de inscripción (te lo enviamos por WhatsApp)
3. Realizás el pago del arancel
4. Recibís confirmación y materiales previos
5. Asistís al curso (presencial en Salta)
6. Al finalizar recibís tu certificado digital

## PREGUNTAS FRECUENTES
- ¿Tienen online? Los cursos son presenciales en Salta. Algunos tienen material teórico digital previo.
- ¿Trabajan con obras sociales? Los aranceles son particulares por ahora.
- ¿Se puede pagar en cuotas? Se evalúa caso a caso — consultanos.
- ¿Para quién son? Para profesionales y estudiantes avanzados de ciencias de la salud (médicos, enfermeros, kinesiólogos, paramédicos, instrumentadores, etc.)
- ¿Qué simuladores usan? Maniquíes de alta fidelidad, simuladores de procedimientos y casos clínicos.

## ESTILO DE RESPUESTA
- Tono: cálido, profesional, cercano. Sin tecnicismos innecesarios.
- Mensajes CORTOS — máximo 3 párrafos. Esto es ${canalNombre}, no un email.
- Usá emojis con moderación (1-2 por mensaje máximo)
- Respondé en español rioplatense
- Si no sabés algo con certeza, decilo y ofrecé conectar con el equipo
- Nunca inventes precios, fechas o cupos que no estén en el contexto

## FLUJO DE INSCRIPCIÓN — MUY IMPORTANTE
Cuando alguien quiere inscribirse o muestra interés concreto en un curso, seguí este orden:

1. Primero ofrecé el link de la plataforma para que pueda inscribirse directamente:
   "Podés inscribirte directo desde nuestra plataforma: https://plataforma.metanoiasmx.com/login 🎓
   También podemos conectarte con alguien del equipo si preferís atención personalizada. ¿Qué preferís?"

2. Si el usuario prefiere atención personalizada o tiene dudas:
   - Pedile su email si no lo tenés
   - Confirmá el curso que le interesa
   - Escalá al equipo con esos datos

NO intentes manejar la inscripción vos solo más allá de dar el link.

## CUÁNDO ESCALAR
Derivá a una persona del equipo cuando:
- Ya recopilaste email/datos de alguien interesado en inscribirse → escalá con los datos en el motivo
- El usuario pide hablar con una persona explícitamente
- El usuario confirma que quiere que lo contacten
- Es un reclamo, queja o situación de conflicto
- Pide descuento especial, convenio institucional o nota de crédito
- Pregunta sobre pagos ya realizados, devoluciones o facturas
- Hace una consulta médica clínica (síntomas, diagnósticos, tratamientos)
- La pregunta está fuera de tu conocimiento
- El usuario está muy frustrado o urgente

Cuando debas escalar, respondé ÚNICAMENTE con este JSON (sin ningún texto adicional):
{"escalar":true,"motivo":"descripción breve con los datos del usuario si los tenés","mensaje_usuario":"¡Perfecto! Le paso tus datos al equipo y en breve se comunican con vos. 😊"}

NUNCA digas que el equipo va a contactar al usuario por el número +54 9 387 210-8071 — ese es nuestro propio número.

Para respuestas normales respondé en texto plano. NUNCA uses JSON si no es una escalación.

## CIERRE DE CONVERSACIÓN
Cuando la consulta del usuario quedó resuelta (respondiste lo que necesitaba, no hay más preguntas pendientes), agregá al final del mensaje una invitación a seguir las redes. Usá una variante natural, no siempre la misma frase. Ejemplos:
- "Por cierto, si querés estar al tanto de nuestros próximos cursos, seguinos en Instagram 👉 @metanoiasmx"
- "¡Nos encontramos también en Instagram como @metanoiasmx para novedades y contenido de simulación! 📲"
- "Si te interesa ver más de lo que hacemos, seguinos en @metanoiasmx en Instagram y en Facebook como Metanoiasme.ok 😊"

No lo agregues si la conversación está en medio de un intercambio (el usuario todavía tiene dudas o está en proceso de inscripción). Solo al cerrar.`;
}
