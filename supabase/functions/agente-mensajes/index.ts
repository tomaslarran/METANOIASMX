import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERIFY_TOKEN = Deno.env.get("META_WH_VERIFY_TOKEN") || "metanoia_wh_2026";
const PHONE_NUMBER_ID = Deno.env.get("WA_PHONE_NUMBER_ID") || "1064395966761110";
const WA_API = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;
const IG_PAGE_ID = "17841470857318268";
const FB_PAGE_ID = "478694861999786";

// Chequea el límite mensual de tokens de IA. Sin JWT en este webhook — se asume
// la única organización activa (single-tenant hoy; revisar cuando haya multi-tenant real).
async function chequearLimiteIA(supabase: any) {
  const inicioMes = new Date();
  inicioMes.setUTCDate(1);
  inicioMes.setUTCHours(0, 0, 0, 0);
  const inicioMesISO = inicioMes.toISOString();
  const renuevaMes = new Date(inicioMes);
  renuevaMes.setUTCMonth(renuevaMes.getUTCMonth() + 1);
  const renuevaStr = renuevaMes.toLocaleDateString("es-AR", { day: "2-digit", month: "long", timeZone: "America/Argentina/Salta" });

  const { data: organizacion } = await supabase.from("organizaciones").select("id,limite_tokens_mensual").limit(1).maybeSingle();
  if (!organizacion?.limite_tokens_mensual) return { bloqueado: false, mensaje: null as string | null, organizacionId: organizacion?.id ?? null };

  const { data: usoOrg } = await supabase.from("ia_uso").select("input_tokens,output_tokens,cache_creation_input_tokens,cache_read_input_tokens").eq("organizacion_id", organizacion.id).gte("created_at", inicioMesISO);
  const totalOrg = (usoOrg || []).reduce((s: number, r: any) => s + (r.input_tokens || 0) + (r.output_tokens || 0) + (r.cache_creation_input_tokens || 0) + (r.cache_read_input_tokens || 0), 0);
  if (totalOrg >= organizacion.limite_tokens_mensual) {
    return { bloqueado: true, mensaje: `límite mensual de IA de la organización alcanzado (se renueva el ${renuevaStr})`, organizacionId: organizacion.id };
  }
  return { bloqueado: false, mensaje: null as string | null, organizacionId: organizacion.id };
}

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
    const key = await crypto.subtle.importKey("raw", encoder.encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
    const expected = "sha256=" + Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
    if (signature !== expected) {
      console.warn("Firma Meta inválida (ignorada temporalmente):", signature.slice(0, 30));
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
    let imageUrl: string | null = null;

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
        // Subir imagen a Storage para mostrar en el panel
        try {
          const ext = imageMediaType.split("/")[1]?.split(";")[0] || "jpg";
          const storePath = `wa/${fromId.replace(/\D/g,"")}/${Date.now()}.${ext}`;
          const { data: upData } = await supabase.storage.from("mensajes-media").upload(storePath, bytes, { contentType: imageMediaType, upsert: false });
          if (upData) {
            const { data: { publicUrl } } = supabase.storage.from("mensajes-media").getPublicUrl(storePath);
            imageUrl = publicUrl;
          }
        } catch (_) {}
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

    // ── Detectar respuesta NPS (número 0-10) ──────────────────────────────────
    if (msg.type === "text" && texto) {
      const npsScore = parseInt(texto);
      if (!isNaN(npsScore) && npsScore >= 0 && npsScore <= 10 && texto === String(npsScore)) {
        const { data: pendingNPS } = await supabase
          .from("nps_envios")
          .select("*")
          .eq("telefono", fromId)
          .eq("estado", "enviado")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (pendingNPS) {
          await supabase.from("nps_respuestas").insert({
            curso_id: pendingNPS.curso_id,
            alumno_id: pendingNPS.alumno_id,
            alumno_nombre: pendingNPS.alumno_nombre,
            score: npsScore,
            canal: "whatsapp",
          });
          await supabase.from("nps_envios").update({ estado: "respondido" }).eq("id", pendingNPS.id);
          await supabase.from("mensajes_publico").insert({
            plataforma: "whatsapp", from_id: fromId, from_name: fromName,
            mensaje: texto, estado: "respondido",
            respuesta: `[NPS ${npsScore}/10 registrado]`, wa_message_id: msgId,
          });
          await sendWA(fromId, `¡Gracias por tu respuesta! Tu calificación (${npsScore}/10) fue registrada. ¡Hasta la próxima! 🙌`);
          return new Response("OK", { status: 200 });
        }
      }
    }

    await procesarMensaje({
      supabase, fromId, fromName, texto, plataforma: "whatsapp", msgId,
      imageBase64, imageMediaType, imageUrl,
      sendReply: (t) => sendWA(fromId, t),
      sendEscalacion: (t) => Promise.all(EQUIPO.map(p => sendWA(p.wa, t))).then(() => {}),
    });

    return new Response("OK", { status: 200 });
  }

  // ── Instagram / Facebook Messenger ───────────────────────────────────────────
  if (object === "instagram" || object === "page") {
    const entry = body.entry?.[0];
    const messaging = entry?.messaging?.[0];

    const plataforma = object === "instagram" ? "instagram" : "facebook";
    // Instagram DMs: usa el token de usuario IG (META_ACCESS_TOKEN) + IG_PAGE_ID
    // Facebook Messenger: usa el Page Token (META_FB_PAGE_TOKEN) + FB_PAGE_ID
    const isIG = object === "instagram";
    const apiToken = isIG ? Deno.env.get("META_ACCESS_TOKEN")! : Deno.env.get("META_FB_PAGE_TOKEN")!;
    const pageId = isIG ? IG_PAGE_ID : FB_PAGE_ID;

    // Reacción (❤️/👍/🔥/etc.) sobre un mensaje nuestro -- no es una consulta, así que
    // no pasa por la IA: agradecimiento directo y listo, sin preguntar "¿algo más?".
    if (messaging?.reaction && messaging.reaction.action === "react") {
      const fromReact = messaging.sender?.id as string | undefined;
      if (fromReact) {
        const gracias = "¡Muchas gracias por el apoyo! 🙌";
        await sendMessenger(fromReact, gracias, pageId, apiToken, isIG);
        await supabase.from("mensajes_publico").insert({
          plataforma, from_id: fromReact, from_name: fromReact,
          mensaje: `[Reacción ${messaging.reaction.emoji || messaging.reaction.reaction || ""}]`.trim(),
          estado: "respondido", respuesta: gracias,
        });
      }
      return new Response("OK", { status: 200 });
    }

    if (!messaging?.message || messaging.message.is_echo) return new Response("OK", { status: 200 });

    const fromId = messaging.sender.id as string;
    const msgId = messaging.message.mid as string;

    // Obtener nombre del usuario. Instagram-scoped IDs (IGSID) solo se resuelven contra
    // graph.instagram.com -- graph.facebook.com no los reconoce y devuelve sin "name",
    // así que el bot se quedaba mudo mostrando el ID numérico en vez del nombre real.
    let fromName = fromId;
    try {
      const nameBase = isIG ? "https://graph.instagram.com" : "https://graph.facebook.com";
      const nameRes = await fetch(
        `${nameBase}/v21.0/${fromId}?fields=name,username&access_token=${apiToken}`
      );
      const nameData = await nameRes.json();
      if (nameData.name) fromName = nameData.name;
      else if (nameData.username) fromName = `@${nameData.username}`;
    } catch (_) {}

    let texto = messaging.message.text?.trim() || "";
    let imageBase64: string | null = null;
    let imageMediaType = "image/jpeg";
    let imageUrl: string | null = null;

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
          // Subir imagen a Storage para mostrar en el panel
          try {
            const storePath = `${plataforma}/${fromId.replace(/[^a-zA-Z0-9]/g,"_")}/${Date.now()}.jpg`;
            const { data: upData } = await supabase.storage.from("mensajes-media").upload(storePath, bytes, { contentType: "image/jpeg", upsert: false });
            if (upData) {
              const { data: { publicUrl } } = supabase.storage.from("mensajes-media").getPublicUrl(storePath);
              imageUrl = publicUrl;
            }
          } catch (_) {}
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

      } else if (att.type === "share" || att.type === "story_mention" || att.type === "template") {
        // Mención/compartido de una publicación -- agradecimiento directo sin pasar por la
        // IA y sin la pregunta de cierre habitual ("¿algo más?"): no es una consulta.
        const gracias = "¡Gracias por la mención! 🙌 Nos alegra mucho el apoyo.";
        await sendMessenger(fromId, gracias, pageId, apiToken, isIG);
        await supabase.from("mensajes_publico").insert({
          plataforma, from_id: fromId, from_name: fromName,
          mensaje: `[${att.type}]`, estado: "respondido", respuesta: gracias, wa_message_id: msgId,
        });
        return new Response("OK", { status: 200 });

      } else {
        texto = `[${att.type}]`;
      }
    }

    if (!texto && !imageBase64) return new Response("OK", { status: 200 });

    await procesarMensaje({
      supabase, fromId, fromName, texto, plataforma, msgId,
      imageBase64, imageMediaType, imageUrl,
      sendReply: (t) => sendMessenger(fromId, t, pageId, apiToken, isIG),
      sendEscalacion: (t) => Promise.all(EQUIPO.map(p => sendWA(p.wa, t))).then(() => {}),
    });

    return new Response("OK", { status: 200 });
  }

  return new Response("OK", { status: 200 });
});

// ── Respuesta directa (sin IA) para preguntas de cupos/precio de un curso concreto ────────
// Tercer paso de la iniciativa de estandarización (ver CLAUDE.md "Estandarizar respuestas").
// Muy conservador a propósito: es de cara al cliente, así que ante cualquier ambigüedad
// (no se identifica un único curso con confianza, o el mensaje no matchea el patrón) se
// deja pasar de largo y responde la IA como siempre.
function _normTxt(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
const _STOPWORDS_CURSO = new Set(["curso", "taller", "workshop", "nivel", "de", "del", "la", "el", "los", "las", "y", "en", "con", "para", "básico", "basico", "avanzado"]);
function _matchCursoEnTexto(texto: string, cursosList: any[]): any | null {
  const t = _normTxt(texto);
  let best: any = null, bestScore = 0, segundo = 0;
  for (const c of cursosList) {
    if (!c.nombre) continue;
    const palabras = _normTxt(c.nombre).split(/[^a-z0-9]+/).filter((w: string) => w.length >= 4 && !_STOPWORDS_CURSO.has(w));
    if (!palabras.length) continue;
    const score = palabras.filter((w: string) => t.includes(w)).length;
    if (score > bestScore) { segundo = bestScore; best = c; bestScore = score; }
    else if (score > segundo) { segundo = score; }
  }
  // Exigimos al menos 1 palabra distintiva matcheada y que no haya ambigüedad con un segundo curso
  return (best && bestScore >= 1 && bestScore > segundo) ? best : null;
}
function _fmtFechaCorta(f: string | null): string {
  if (!f) return "";
  const d = new Date(f + "T12:00:00");
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Argentina/Salta" });
}
function _tryRespuestaDirectaCurso(texto: string, cursosList: any[]): string | null {
  if (!texto || texto.length > 150) return null; // mensaje largo -> mejor que lo maneje la IA
  const t = _normTxt(texto);
  const esCupos = /cupo|vacante|lugar(es)?\s*(disponible|libre)/.test(t);
  const esPrecio = /precio|arancel|cuesta|vale|costo/.test(t);
  const esFecha = /cuando (es|empieza|arranca|comienza|termina)|fecha (de inicio|de fin|del curso)|que dia (es|empieza)/.test(t);
  if (!esCupos && !esPrecio && !esFecha) return null;
  const curso = _matchCursoEnTexto(texto, cursosList);
  if (!curso) return null;
  if (esCupos) {
    return curso.cupos_max
      ? `El curso "${curso.nombre}" tiene un cupo máximo de ${curso.cupos_max} participantes. ¿Querés que te cuente más para anotarte? 😊`
      : `Por ahora no tengo el cupo exacto cargado para "${curso.nombre}" — dejame tus datos y el equipo te confirma. 😊`;
  }
  if (esPrecio) {
    return curso.arancel
      ? `El arancel de "${curso.nombre}" es de $${Number(curso.arancel).toLocaleString("es-AR")}. Hasta el 31 de octubre la suscripción anual a la plataforma es sin cargo 🎉 ¿Te cuento más sobre el curso?`
      : `Por ahora no tengo el arancel cargado para "${curso.nombre}" — dejame tus datos y el equipo te confirma. 😊`;
  }
  if (!curso.fecha_inicio) return `Por ahora no tengo la fecha cargada para "${curso.nombre}" — dejame tus datos y el equipo te confirma. 😊`;
  const rango = curso.fecha_fin && curso.fecha_fin !== curso.fecha_inicio
    ? `del ${_fmtFechaCorta(curso.fecha_inicio)} al ${_fmtFechaCorta(curso.fecha_fin)}`
    : `el ${_fmtFechaCorta(curso.fecha_inicio)}`;
  return `El curso "${curso.nombre}" es ${rango}. ¿Te cuento más para anotarte? 😊`;
}

// ── Procesamiento común (Claude + DB) ─────────────────────────────────────────
async function procesarMensaje({ supabase, fromId, fromName, texto, plataforma, msgId, imageBase64, imageMediaType, imageUrl, sendReply, sendEscalacion }: {
  supabase: any;
  fromId: string;
  fromName: string;
  texto: string;
  plataforma: string;
  msgId: string;
  imageBase64: string | null;
  imageMediaType: string;
  imageUrl: string | null;
  sendReply: (text: string) => Promise<boolean>;
  sendEscalacion: (text: string) => Promise<void>;
}) {
  // Deduplicar
  const { data: yaExiste } = await supabase
    .from("mensajes_publico").select("id").eq("wa_message_id", msgId).limit(1);
  if (yaExiste && yaExiste.length > 0) return;

  const mensajeGuardado = imageBase64
    ? `🖼️ ${texto}` : texto.startsWith("🎤") ? texto : texto;

  const insertData: any = { plataforma, from_id: fromId, from_name: fromName, mensaje: mensajeGuardado, estado: "pendiente", wa_message_id: msgId };
  if (imageUrl) insertData.imagen_url = imageUrl;
  const { data: insertedRow } = await supabase.from("mensajes_publico").insert(insertData).select("id").single();
  const miRowId = insertedRow?.id;

  // Debounce
  await new Promise(r => setTimeout(r, 2000));

  // ¿Soy el mensaje pendiente más reciente de esta conversación? Si llegó uno más nuevo mientras esperaba,
  // dejo que la invocación de ESE mensaje sea la que procese y combine todo — evita que dos invocaciones
  // concurrentes se cancelen mutuamente (antes: si había 2+ pendientes TODAS las invocaciones abortaban
  // y la conversación quedaba sin ninguna respuesta).
  const { data: masReciente } = await supabase
    .from("mensajes_publico").select("id")
    .eq("from_id", fromId).eq("plataforma", plataforma).eq("estado", "pendiente")
    .gt("created_at", new Date(Date.now() - 1800000).toISOString())
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  if (masReciente && miRowId && masReciente.id !== miRowId) return;

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
    // Postgres: NULL != false, así que un .eq("es_respuesta_manual", false) estricto
    // excluye también las filas viejas donde esa columna quedó en NULL (nunca se seteó explícitamente)
    .or("es_respuesta_manual.eq.false,es_respuesta_manual.is.null")
    .gt("created_at", seisHorasAtras)
    .order("created_at", { ascending: false }).limit(5);

  const { data: cursos } = await supabase
    .from("cursos").select("nombre, estado, fecha_inicio, fecha_fin, arancel, cupos_max, descripcion, instructor_nombre, linea_negocio, descuento_colegio, recurrencia, respaldo_institucional")
    .in("estado", ["Convocatoria", "Inscripciones", "En curso"])
    .order("fecha_inicio", { ascending: true });

  // Respuesta directa sin IA para preguntas puntuales de cupos/precio con un curso identificado
  // sin ambigüedad. Solo aplica a mensajes de texto (una imagen siempre necesita razonamiento).
  if (!imageBase64) {
    const directa = _tryRespuestaDirectaCurso(textoCombinado, cursos ?? []);
    if (directa) {
      await sendReply(directa);
      if (idsPendientes.length > 0) {
        await supabase.from("mensajes_publico").update({ respuesta: directa, estado: "respondido" }).in("id", idsPendientes);
      }
      return;
    }
  }

  const { data: publicaciones } = await supabase
    .from("publicaciones").select("plataforma, tipo, tema, caption, fecha_publicacion, url")
    .eq("estado", "publicado")
    .order("fecha_publicacion", { ascending: false })
    .limit(15);

  const { data: mejoras } = await supabase
    .from("agente_mejoras")
    .select("regla")
    .eq("estado", "aprobada")
    .order("created_at", { ascending: true });

  const { data: planes } = await supabase
    .from("plataforma_planes")
    .select("nombre, descripcion, precio_mensual, precio_anual, sin_costo, requisito")
    .eq("activo", true)
    .order("orden", { ascending: true });

  // Armar mensajes para Claude
  const messages: any[] = [];
  if (historial) {
    for (const h of [...historial].reverse()) {
      if (!h.mensaje?.trim()) continue;
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

  const siteContent = await fetchWebContent("https://metanoiasmx.com/");

  const limite = await chequearLimiteIA(supabase);
  if (limite.bloqueado) {
    console.warn("Bot pausado por límite de IA:", limite.mensaje);
    await sendReply("En este momento no puedo responder automáticamente. El equipo se va a comunicar con vos en breve. 😊");
    await sendEscalacion(`⚠️ Bot ${plataforma} pausado — ${limite.mensaje}. Mensaje de ${fromName} sin responder por IA: "${texto}"`);
    if (idsPendientes.length > 0) {
      await supabase.from("mensajes_publico").update({ respuesta: "[Bot pausado — límite de IA alcanzado]", estado: "pendiente" }).in("id", idsPendientes);
    }
    return;
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
      system: buildSistema(cursos ?? [], publicaciones ?? [], fromName, plataforma, mejoras ?? [], planes ?? [], siteContent),
      messages,
    }),
  });

  if (!aiRes.ok) {
    const errBody = await aiRes.text();
    console.error(`Claude API error ${aiRes.status}:`, errBody.slice(0, 300));
    await sendReply("En este momento tengo inconvenientes técnicos. El equipo se va a comunicar con vos pronto. 😊");
    await sendEscalacion(`⚠️ Error bot ${plataforma} — Claude ${aiRes.status} para ${fromName}: ${errBody.slice(0, 100)}`);
    if (idsPendientes.length > 0) {
      await supabase.from("mensajes_publico").update({ respuesta: `[Error IA ${aiRes.status}]`, estado: "pendiente" }).in("id", idsPendientes);
    }
    return;
  }

  const aiData = await aiRes.json();
  const rawResp: string = aiData.content?.[0]?.text ?? "";

  if (aiData.usage) {
    try {
      await supabase.from("ia_uso").insert({
        funcion: "agente-mensajes", modelo: aiData.model || null,
        input_tokens: aiData.usage.input_tokens || 0, output_tokens: aiData.usage.output_tokens || 0,
        cache_creation_input_tokens: aiData.usage.cache_creation_input_tokens || 0,
        cache_read_input_tokens: aiData.usage.cache_read_input_tokens || 0,
        organizacion_id: limite.organizacionId,
      });
    } catch (_) {}
  }

  if (!rawResp) {
    console.error("Claude devolvió respuesta vacía:", JSON.stringify(aiData).slice(0, 300));
    await sendReply("En este momento no puedo responder. Por favor escribime de nuevo en unos minutos. 😊");
    if (idsPendientes.length > 0) {
      await supabase.from("mensajes_publico").update({ respuesta: "[Error IA — vacío]", estado: "pendiente" }).in("id", idsPendientes);
    }
    return;
  }

  let escalado = false;
  let cerrado = false;
  let motivoEscalado: string | null = null;
  let respuesta = rawResp;

  try {
    const parsed = JSON.parse(rawResp);

    // Mensaje automático / sin interés — ignorar sin responder
    if (parsed.ignorar === true) {
      if (idsPendientes.length > 0) {
        await supabase.from("mensajes_publico")
          .update({ estado: "ignorado", respuesta: "[Mensaje automático — ignorado]" })
          .in("id", idsPendientes);
      }
      return;
    }

    if (parsed.escalar === true) {
      escalado = true;
      motivoEscalado = parsed.motivo ?? null;
      respuesta = parsed.mensaje_usuario ?? "¡Perfecto! Le paso tus datos al equipo y en breve se comunican con vos. 😊";
      const platLabel = plataforma === "whatsapp" ? "WhatsApp" : plataforma === "instagram" ? "Instagram DM" : "Facebook Messenger";
      const contactoLinea = plataforma === "whatsapp"
        ? `\n*Número:* https://wa.me/${fromId.replace(/\D/g, "")}`
        : `\n*ID:* ${fromId}`;
      const notif = `🚨 *Consulta derivada — Metanoia SMX*\n\n*De:* ${fromName}${contactoLinea}\n*Canal:* ${platLabel}\n*Mensaje:* "${texto}"\n*Motivo:* ${motivoEscalado}\n\nTocá el link para escribirle directo por WhatsApp.`;
      await sendEscalacion(notif);
    }

    // Conversación cerrada explícitamente por el usuario
    if (parsed.cerrar === true) {
      cerrado = true;
      respuesta = parsed.mensaje ?? "¡Hasta pronto! Cualquier consulta que tengas, acá estamos 😊";
    }
  } catch (_) {}

  const entregado = await _enviarRespuestaCompleta(sendReply, respuesta, plataforma);
  if (!entregado) {
    console.error(`No se pudo entregar la respuesta completa a ${fromName} por ${plataforma}`);
    await sendEscalacion(`⚠️ La respuesta del bot a ${fromName} por ${plataforma === "whatsapp" ? "WhatsApp" : plataforma === "instagram" ? "Instagram DM" : "Facebook Messenger"} no se pudo entregar completa (falló el envío). Revisar la conversación manualmente.`);
  }

  if (idsPendientes.length > 0) {
    const estadoFinal = escalado ? "escalado" : cerrado ? "cerrado" : "respondido";
    await supabase.from("mensajes_publico")
      .update({ respuesta, escalado, motivo_escalado: motivoEscalado, estado: estadoFinal })
      .in("id", idsPendientes);
  }
}

// ── Helpers de envío ──────────────────────────────────────────────────────────
// Devuelven boolean (éxito real de entrega) -- antes eran void y un fallo de la API
// (ej. texto que supera el límite de caracteres de Messenger/Instagram) quedaba solo
// en el log del servidor, mientras la conversación se marcaba igual como "respondido".
async function sendWA(to: string, text: string): Promise<boolean> {
  const token = Deno.env.get("META_WA_TOKEN");
  try {
    const res = await fetch(WA_API, {
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
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`sendWA error [→${to}] ${res.status}:`, err.slice(0, 200));
      return false;
    }
    return true;
  } catch (e) {
    console.error("sendWA fetch error:", (e as Error).message);
    return false;
  }
}

async function sendMessenger(recipientId: string, text: string, pageId: string, token: string, isInstagram = false): Promise<boolean> {
  const base = isInstagram ? "https://graph.instagram.com" : "https://graph.facebook.com";
  try {
    const res = await fetch(`${base}/v21.0/${pageId}/messages`, {
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
      return false;
    }
    return true;
  } catch (e) {
    console.error("sendMessenger fetch error:", (e as Error).message);
    return false;
  }
}

// Divide un texto largo en partes que respetan el límite de caracteres de la
// plataforma (Instagram/Messenger rechazan un solo mensaje muy largo -- WhatsApp
// tolera mucho más, ~4096). Corta en el borde de párrafo/línea/espacio más cercano
// por debajo del límite para no partir una palabra a la mitad.
function _splitMensaje(texto: string, maxLen: number): string[] {
  if (texto.length <= maxLen) return [texto];
  const partes: string[] = [];
  let resto = texto;
  while (resto.length > maxLen) {
    let corte = resto.lastIndexOf("\n\n", maxLen);
    if (corte < maxLen * 0.4) corte = resto.lastIndexOf("\n", maxLen);
    if (corte < maxLen * 0.4) corte = resto.lastIndexOf(" ", maxLen);
    if (corte < maxLen * 0.4) corte = maxLen;
    partes.push(resto.slice(0, corte).trim());
    resto = resto.slice(corte).trim();
  }
  if (resto) partes.push(resto);
  return partes;
}

// Envía un texto completo, partiéndolo en varios mensajes si hace falta. Devuelve
// false si alguna parte no se pudo entregar (para poder escalar en vez de dar
// la conversación por respondida en silencio).
async function _enviarRespuestaCompleta(sendReply: (t: string) => Promise<boolean>, texto: string, plataforma: string): Promise<boolean> {
  const maxLen = plataforma === "whatsapp" ? 3500 : 900;
  const partes = _splitMensaje(texto, maxLen);
  let ok = true;
  for (const parte of partes) {
    const enviado = await sendReply(parte);
    if (!enviado) ok = false;
  }
  return ok;
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

// ── Fetch contenido web público ───────────────────────────────────────────────
async function fetchWebContent(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "MetanoiaBot/1.0" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return "";
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2500);
  } catch {
    return "";
  }
}

// ── System prompt ─────────────────────────────────────────────────────────────
function buildSistema(cursos: any[], publicaciones: any[], fromName: string, plataforma: string, mejoras: any[] = [], planes: any[] = [], siteContent = ""): string {
  const hoy = new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Salta" });

  const fmtFecha = (f: string | null) => {
    if (!f) return "a confirmar";
    const d = new Date(f + "T12:00:00");
    return d.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Argentina/Salta" });
  };

  const cursosTexto = cursos.length > 0
    ? cursos.map((c: any) => {
        const partes = [
          `• ${c.nombre} [${c.estado}]`,
          `  Inicio: ${fmtFecha(c.fecha_inicio)} — Fin: ${fmtFecha(c.fecha_fin)}`,
          `  Arancel: ${c.arancel ? "$" + Number(c.arancel).toLocaleString("es-AR") : "a consultar"}${c.descuento_colegio ? ` (descuento Colmedsa: ${c.descuento_colegio}%)` : ""}`,
          `  Cupos máximos: ${c.cupos_max ?? "a confirmar"}`,
          c.instructor_nombre ? `  Instructor: ${c.instructor_nombre}` : null,
          c.linea_negocio ? `  Línea: ${c.linea_negocio}` : null,
          c.respaldo_institucional ? `  Respaldo: ${c.respaldo_institucional}` : null,
          c.descripcion ? `  Descripción completa: ${c.descripcion.slice(0, 1200)}` : null,
        ].filter(Boolean).join("\n");
        return partes;
      }).join("\n\n")
    : "No hay cursos próximos publicados en este momento.";

  const pubTexto = publicaciones.length > 0
    ? publicaciones.map((p: any) => {
        const fecha = p.fecha_publicacion ? new Date(p.fecha_publicacion).toLocaleDateString("es-AR") : "—";
        const caption = p.caption ? p.caption.slice(0, 120) + (p.caption.length > 120 ? "…" : "") : "sin descripción";
        return `• [${p.plataforma}] ${fecha}${p.tema ? ` — ${p.tema}` : ""}: "${caption}"${p.url ? ` (${p.url})` : ""}`;
      }).join("\n")
    : "No hay publicaciones recientes registradas.";

  const canalNombre = plataforma === "whatsapp" ? "WhatsApp" : plataforma === "instagram" ? "Instagram" : "Facebook";

  return `## ROL
Sos el asistente virtual de Metanoia SMX. Tu nombre es "Asistente de Metanoia". Respondés consultas de profesionales y estudiantes de salud por ${canalNombre}. Hoy es ${hoy}. Estás hablando con ${fromName}.

## CONTEXTO
Metanoia SMX es un centro de simulación médica en Salta, Argentina. Entrenamos profesionales de la salud con simuladores de alta fidelidad en un entorno seguro y sin estrés. Todas nuestras actividades están protocolizadas y cumplen con estándares de referencia nacional e internacional. Los cursos están guiados por instructores con experiencia en docencia médica y certificados en simulación médica.

Sede: España 1440, Salta capital (espacio del Colegio Médico de Salta, con convenio marco vigente)
Web: https://www.metanoiasmx.com/
Instagram: @metanoiasmx · https://www.instagram.com/metanoiasme.ok/
Facebook: https://www.facebook.com/profile.php?id=61570221265320
Plataforma online: https://plataforma.metanoiasmx.com/login

IMPORTANTE — relación con el Colegio Médico de Salta (Colmedsa):
Metanoia tiene un convenio marco con Colmedsa y desarrolla sus actividades en un espacio del mismo, manteniéndolo debidamente informado. Esto NO implica que todas las actividades estén avaladas o certificadas por Colmedsa. Cuando una actividad cuente con aval explícito de Colmedsa, será aclarado expresamente por ambas instituciones con firma y sello de sus representantes. NUNCA digas que una actividad está "avalada por el Colegio Médico" salvo que el curso lo indique explícitamente.

Valores:
- Excelencia y Profesionalismo: precisión, innovación y el más alto nivel de calidad.
- Generosidad y Gratitud: compartimos conocimiento y valoramos el crecimiento en comunidad.
- Honestidad y Empatía: espacio de aprendizaje seguro, transparente y humano.

Ofrecemos:
- Cursos presenciales de entrenamiento con simuladores (cirugía general, laparoscópica, ginecológica, urología, traumatología, clínica y más)
- Plataforma de aprendizaje online con suscripción mensual o anual
- Certificación de participación en cada actividad realizada

## INSTRUCCIÓN

### REGLA GLOBAL — promo activa (aplicá siempre)
Hasta el 31 de octubre de 2026, la suscripción anual a la plataforma online está disponible SIN CARGO. Mencionalo en TODAS las conversaciones sobre cursos, precios, formación o lo que ofrecemos — aunque el usuario no lo haya pedido. Integralo naturalmente: "Por otro lado, la plataforma online tiene una promo vigente: la suscripción anual está sin cargo hasta el 31 de octubre 🎉". Si la conversación es solo sobre temas administrativos o reclamos, podés omitirlo.

### REGLA — cursos disponibles: respondé directo, no pidas datos
Si el usuario pregunta por un curso que está en el listado de cursos disponibles, respondé DIRECTAMENTE con la info que tenés (fecha, arancel, descripción, cupo, etc.). NO pidas datos de contacto solo para dar información de un curso — ya la tenés. Podés ofrecer al final conectarlos con el equipo para inscribirse, pero primero dá la info.

### Preguntas frecuentes — respondé directamente con esta info
- ¿Qué es Metanoia? → Centro de simulación integral (clínica y quirúrgica) en Salta. Entrenamiento avanzado en entorno seguro, protocolizado con estándares nacionales e internacionales, con instructores certificados en simulación médica.
- ¿Por qué elegir Metanoia? → Potenciamos la curva de aprendizaje con un enfoque sin estrés. Alta fidelidad, supervisión experta, certificación de participación medible.
- ¿Cómo y dónde se entrena? → Simuladores de alta fidelidad, modalidad presencial en España 1440 (espacio del Colegio Médico de Salta).
- ¿Para quién es? → Cirujanos, residentes y profesionales de la salud en distintos niveles de formación. También enfermeros, kinesiólogos, instrumentadores quirúrgicos, técnicos y afines.
- ¿Tienen cursos online? → Los cursos prácticos son presenciales. Tenemos una plataforma de aprendizaje online con suscripción anual — y hasta el 31 de octubre está disponible sin cargo 🎉
- ¿Están certificados/avalados por el Colegio Médico? → Desarrollamos nuestras actividades en un espacio del Colegio Médico de Salta con convenio marco vigente, pero eso no implica que todas las actividades estén avaladas por ellos. Cuando un curso cuente con aval explícito, lo aclaramos expresamente con firma y sello de ambas instituciones.
- ¿Modalidades individuales o grupales? → Ambas, según el programa.
- ¿Qué especialidades? → Cirugía general, laparoscópica, ginecológica, urología, traumatología, clínica, entre otras.
- ¿Qué tecnología usan? → Simuladores laparoscópicos, microquirúrgicos con IA, realidad virtual, modelos básicos con IA.
- ¿Trabajan con obras sociales? → Los aranceles son particulares por ahora.
- ¿Se puede pagar en cuotas? → Se evalúa caso a caso — consultanos.

### Plataforma online — PROMOCIÓN ACTIVA
IMPORTANTE: Hasta el 31 de octubre de 2026, la suscripción ANUAL a la plataforma está disponible sin cargo. Mencioná esto siempre que hables de la plataforma, aunque no te lo pidan. Es una oportunidad concreta y vale la pena ofrecerla.

Planes disponibles (preguntan por suscripción, acceso online o plataforma):

${planes.length > 0
  ? planes.map((p: any) => {
      const precio = p.sin_costo
        ? "Sin costo"
        : [
            p.precio_mensual ? `$${Number(p.precio_mensual).toLocaleString("es-AR")}/mes` : null,
            p.precio_anual ? `$${Number(p.precio_anual).toLocaleString("es-AR")}/año` : null,
          ].filter(Boolean).join(" · ");
      return `${p.nombre} — ${precio}\n${p.descripcion ?? ""}${p.requisito ? `\nRequiere: ${p.requisito}` : ""}`;
    }).join("\n\n")
  : "Consultá con el equipo los planes disponibles."
}

Recordá: la suscripción ANUAL está sin cargo hasta el 31 de octubre. Cuando el usuario pregunte por precios o planes, siempre mencioná esta promo primero.

### Cursos presenciales disponibles
La "Descripción completa" de cada curso contiene información detallada: fechas de prácticas, modalidad, cupo por fecha, formato (teoría + práctica), requisitos, etc. Usala para responder preguntas específicas como "¿cuándo son las prácticas?", "¿cómo es el formato?", "¿hasta cuándo puedo inscribirme?", "¿qué incluye el curso?". No inventes datos que no estén ahí.

${cursosTexto}

### Contenido actual del sitio web (https://metanoiasmx.com/)
${siteContent ? siteContent : "No disponible en este momento."}

### Cómo inscribirse a un curso
1. Primero ofrecé el link del sitio: "Podés ver toda la info y anotarte desde nuestro sitio: https://metanoiasmx.com/ 🎓 ¿Querés que te conecte con alguien del equipo para atención personalizada?"
2. Si prefieren atención personalizada o tienen dudas: pedí su email, confirmá el curso y escalá con esos datos.
NO intentes manejar la inscripción vos solo más allá de dar el link.

### Programa MSP Salta — Residentes del sistema público
Metanoia SMX ejecuta el Programa Provincial de Capacitación en Simulación Médica para las residencias del sistema público de salud de Salta (MSP Salta), vigente desde el 1/8/2026 (6 meses, renovable).

Alcance: 365 residentes de 52 residencias + hasta 35 fellows/concurrentes. 24 horas netas de simulación práctica por residente en el período, acumulables.

Las 7 estaciones de entrenamiento:
- E1 Sutura y nudos quirúrgicos
- E2 Laparoscopía por competencia (con métricas objetivas GOALS/FLS)
- E3 Manejo de vía aérea e intubación
- E4 Accesos vasculares guiados por ecografía
- E5 Venopunción / flebotomía
- E6 Cuidados del paciente adulto
- E7 Emergencias pediátricas y neonatales
Y además: módulo RCP/BLS (desde octubre) y escenarios de parto/neonato (media fidelidad, oct–nov).

Fases del programa:
- Fase A (agosto): E1, E5, E6 — baja fidelidad, fundamentos
- Fase B (sep–oct): E3, E4, E1 completa, RCP/BLS
- Fase C (oct–nov): E7, escenarios media fidelidad, ECOE
- Fase D (nov–dic): E2 laparoscopía, cierre y certificación de instructores

Plataforma e historial académico individual: https://plataforma.metanoiasmx.com

SI un residente o instructor del programa MSP consulta por su horario, qué estación le toca, cuándo empieza su residencia o su avance en el programa: NO confirmes nada. Decí que el equipo lo está coordinando y escalá con los datos del contacto. Motivo de escalación: "Consulta MSP — [nombre], [residencia si la mencionó]".

### Publicaciones recientes en redes
${pubTexto}
Si alguien menciona algo que vio en redes, relacionalo con estas publicaciones y respondé en contexto.

### Cuando comparten una publicación o nos etiquetan
Respondé con un mensaje cálido y breve agradeciendo. No hagas pitch de ventas a menos que lo traigan ellos.
Ejemplo: "¡Gracias por compartir! 🙌 Nos alegra mucho el apoyo." / "¡Qué bueno verte por acá! Gracias por la mención 😊"

## FORMATO
- Tono: cálido, amable, profesional. Empezá con un saludo si es el primer mensaje ("¡Hola! 👋" o "¡Hola, ${fromName}! 😊").
- Mensajes CORTOS — máximo 3 párrafos. Esto es ${canalNombre}, no un email.
- Emojis con moderación (1-2 por mensaje máximo).
- Español rioplatense.
- Si no sabés algo con certeza, decilo y ofrecé conectar con el equipo.
- Cuando la consulta quedó resuelta, invitá a seguir las redes al final. Variá la frase:
  · "Si querés estar al tanto de nuestros próximos cursos, seguinos en Instagram 👉 @metanoiasmx"
  · "Nos encontramos también en Instagram como @metanoiasmx para novedades 📲"
  No lo agregues si todavía hay dudas en curso.

## RESTRICCIONES
- NUNCA inventes precios, fechas o cupos que no estén en este contexto.
- NUNCA digas que el equipo va a contactar al usuario por el número +54 9 387 210-8071 — ese es nuestro propio número.
- NUNCA uses frases agresivas, jerga interna o vocabulario que suene poco profesional para un desconocido.
- Para respuestas normales: texto plano. NUNCA uses JSON salvo para ignorar o escalar.
- NUNCA uses markdown en las respuestas: sin asteriscos (**), sin guiones como bullets, sin #. Los links van siempre solos, sin ningún carácter extra alrededor.

### Cómo cerrar una conversación
Cuando la consulta del usuario quedó resuelta y NO dejó datos de contacto para que lo llamen, antes de despedirte siempre preguntá: "¿Hay algo más en lo que te pueda ayudar? 😊"

Si el usuario responde que no, que está todo bien, que gracias, o cualquier señal de cierre (ej: "no, listo", "era eso", "todo bien", "gracias, eso era todo", "ok perfecto", etc.):
Respondé ÚNICAMENTE con este JSON:
{"cerrar":true,"mensaje":"¡Perfecto! Cualquier consulta que tengas, por acá estamos. ¡Hasta pronto! 😊"}

Podés variar levemente el mensaje de cierre para que no suene robótico.

IMPORTANTE: Si en algún punto de la conversación el usuario dejó sus datos de contacto (email, teléfono, nombre para que lo llamen), la conversación ya fue escalada. En ese caso NO uses el cierre con {"cerrar":true} aunque el usuario diga "no" o "gracias" al final — ya está escalada y el equipo se va a contactar.

### Mensajes a ignorar — respondé ÚNICAMENTE con {"ignorar":true}
- Autorespuestas de otras empresas o bots
- Mensajes que claramente no tienen intención real de contacto con Metanoia (spam, cadenas, notificaciones automáticas)

### Cuándo escalar — respondé ÚNICAMENTE con el JSON de escalación
Escalá cuando:
- El usuario proporcionó su email (contiene @) o número de teléfono (8+ dígitos) — aunque vos lo hayas pedido
- El usuario pidió hablar con una persona del equipo explícitamente
- Reclamo, queja o situación de conflicto
- Descuento especial, convenio institucional, nota de crédito
- Pagos realizados, devoluciones o facturas
- Consulta médica clínica (síntomas, diagnósticos, tratamientos)
- El usuario está muy frustrado o urgente

CRÍTICO: Cuando el usuario deja sus datos (nombre, email, teléfono), NO los confirmes en texto. NO digas "¡Perfecto! Confirmo tus datos:...". Respondé ÚNICAMENTE con el JSON de escalación — el sistema se encarga del resto.

NO escalés solo porque la pregunta sea difícil o esté fuera de tu conocimiento — en ese caso respondé lo que puedas y ofrecé conectarlos con el equipo si quieren más info.

JSON de escalación (sin texto adicional, sin nada más):
{"escalar":true,"motivo":"descripción breve con datos del usuario si los tenés","mensaje_usuario":"¡Perfecto! Le paso tus datos al equipo y en breve se comunican con vos. 😊"}

## EJEMPLOS

Usuario: "¿Qué es Metanoia?"
Asistente: "¡Hola! 👋 Metanoia SMX es un centro de simulación médica en Salta, Argentina. Entrenamos a médicos, residentes, enfermeros y otros profesionales de la salud con simuladores de alta fidelidad en un entorno seguro y sin estrés, con instructores certificados en simulación médica. ¿Te cuento sobre nuestros cursos o la plataforma online?"

Usuario: "¿Tienen cursos de laparoscopía?"
Asistente: "¡Sí! Tenemos entrenamiento en cirugía laparoscópica con simuladores especializados y métricas objetivas (GOALS/OSATS). Es uno de nuestros fuertes 💪 Te paso el link para ver la oferta actual y anotarte: https://metanoiasmx.com/ — ¿Sos médico o residente? Así te oriento mejor con el plan que más te conviene."

Usuario: "Cuánto sale la suscripción a la plataforma?"
Asistente: "¡Buenas noticias! Hasta el 31 de octubre la suscripción anual está disponible sin cargo 🎉 El acceso depende de tu perfil — tenemos planes para médicos matriculados en Colmedsa, médicos externos, residentes del Ministerio de Salta, personal de salud no médico y más. ¿Cuál es tu situación? Así te digo exactamente cómo accedés 😊"

Usuario: "Me comentaron que tienen una plataforma online"
Asistente: "¡Sí! Tenemos una plataforma de aprendizaje en https://plataforma.metanoiasmx.com/ con contenido para profesionales de la salud. Y hay una promoción vigente hasta el 31 de octubre: la suscripción anual está disponible sin cargo 🎉 ¿Querés que te cuente los planes según tu perfil?"

Usuario: "Mi nombre es Laura Gomez, mi email es laura@gmail.com y mi tel es 3874001122"
Asistente: {"escalar":true,"motivo":"Laura Gomez — laura@gmail.com — tel 3874001122","mensaje_usuario":"¡Perfecto! Le paso tus datos al equipo y en breve se comunican con vos. 😊"}

Usuario: "Soy Daiana Rodriguez, rodriguezdaiana12@hotmail.com, tel 1153241597"
Asistente: {"escalar":true,"motivo":"Daiana Rodriguez — rodriguezdaiana12@hotmail.com — tel 1153241597","mensaje_usuario":"¡Perfecto! Le paso tus datos al equipo y en breve se comunican con vos. 😊"}

Usuario: "Gracias por ponerse en contacto con nosotros, pronto nos comunicaremos."
Asistente: {"ignorar":true}

Usuario: "Quiero inscribirme, mi email es ejemplo@gmail.com, me interesa el curso de sutura"
Asistente: {"escalar":true,"motivo":"Usuario interesado en curso de sutura. Email: ejemplo@gmail.com","mensaje_usuario":"¡Perfecto! Le paso tus datos al equipo y en breve se comunican con vos. 😊"}
${mejoras.length > 0 ? `

## REGLAS APRENDIDAS DEL EQUIPO (prioridad alta — aplicar siempre)
El equipo revisó conversaciones reales y definió estas reglas. Son de cumplimiento obligatorio:
${mejoras.map((m: any, i: number) => `${i + 1}. ${m.regla}`).join("\n")}` : ""}`;
}
