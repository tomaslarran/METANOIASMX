import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERIFY_TOKEN = "metanoia_wh_2026";
const PHONE_NUMBER_ID = "1064395966761110";
const WA_API = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;

// Equipo que recibe derivaciones
const EQUIPO = [
  { nombre: "Amparo", wa: "5493874462320" },
  { nombre: "Valentina", wa: "5493875094959" },
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

  // ── Mensajes entrantes (POST) ───────────────────────────────────────────────
  let body: any;
  try { body = await req.json(); } catch { return new Response("OK", { status: 200 }); }

  const value = body?.entry?.[0]?.changes?.[0]?.value;
  if (!value?.messages?.[0]) return new Response("OK", { status: 200 });

  const msg = value.messages[0];
  // Solo texto por ahora
  if (msg.type !== "text") return new Response("OK", { status: 200 });

  const fromId = msg.from as string;
  const fromName = (value.contacts?.[0]?.profile?.name as string) || fromId;
  const texto = (msg.text.body as string).trim();

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Historial reciente de esta conversación
  const { data: historial } = await supabase
    .from("mensajes_publico")
    .select("mensaje, respuesta")
    .eq("from_id", fromId)
    .eq("plataforma", "whatsapp")
    .order("created_at", { ascending: false })
    .limit(5);

  // Cursos activos con cupos
  const { data: cursos } = await supabase
    .from("cursos")
    .select("nombre, estado, fecha_inicio, fecha_fin, arancel, cupos_max, descripcion")
    .in("estado", ["Confirmado", "Próximo", "En curso"])
    .order("fecha_inicio", { ascending: true });

  // Armar historial para Claude (cronológico)
  const messages: { role: string; content: string }[] = [];
  if (historial) {
    for (const h of [...historial].reverse()) {
      messages.push({ role: "user", content: h.mensaje });
      if (h.respuesta) messages.push({ role: "assistant", content: h.respuesta });
    }
  }
  messages.push({ role: "user", content: texto });

  // Llamar a Claude Haiku (rápido y económico para atención al público)
  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: buildSistema(cursos ?? [], fromName),
      messages,
    }),
  });

  const aiData = await aiRes.json();
  const rawResp: string = aiData.content?.[0]?.text ?? "";

  // Detectar si el agente quiere escalar
  let escalado = false;
  let motivoEscalado: string | null = null;
  let respuesta = rawResp;

  try {
    const parsed = JSON.parse(rawResp);
    if (parsed.escalar === true) {
      escalado = true;
      motivoEscalado = parsed.motivo ?? null;
      respuesta = parsed.mensaje_usuario ?? "Un momento, te conecto con alguien del equipo. 😊";

      // Notificar al equipo por WhatsApp
      const notif = `🚨 *Consulta derivada — Metanoia SMX*\n\n*De:* ${fromName} (+${fromId})\n*Mensaje:* "${texto}"\n*Motivo:* ${motivoEscalado}\n\nPodés responderle directamente en WhatsApp.`;
      await Promise.all(EQUIPO.map(p => sendWA(p.wa, notif)));
    }
  } catch (_) {
    // No es JSON — respuesta normal de texto
  }

  // Enviar respuesta al usuario
  await sendWA(fromId, respuesta);

  // Guardar en BD
  await supabase.from("mensajes_publico").insert({
    plataforma: "whatsapp",
    from_id: fromId,
    from_name: fromName,
    mensaje: texto,
    respuesta,
    escalado,
    motivo_escalado: motivoEscalado,
    estado: escalado ? "escalado" : "respondido",
  });

  return new Response("OK", { status: 200 });
});

// ── Enviar mensaje por WhatsApp Cloud API ──────────────────────────────────────
async function sendWA(to: string, text: string): Promise<void> {
  await fetch(WA_API, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${Deno.env.get("META_WA_TOKEN")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  }).catch(() => {}); // silencioso — no interrumpir el flujo si falla el envío
}

// ── System prompt completo de Metanoia ────────────────────────────────────────
function buildSistema(cursos: any[], fromName: string): string {
  const hoy = new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Salta" });

  const cursosTexto = cursos.length > 0
    ? cursos.map(c =>
        `• ${c.nombre} | ${c.estado} | Inicio: ${c.fecha_inicio ?? "a confirmar"} | Arancel: ${c.arancel ? "$" + Number(c.arancel).toLocaleString("es-AR") : "a consultar"}`
      ).join("\n")
    : "No hay cursos próximos publicados en este momento. Podés consultar para que te avisemos cuando abran nuevas fechas.";

  return `Sos el asistente virtual de *Metanoia SMX*, centro de capacitación médica en simulación clínica de Salta, Argentina. Hoy es ${hoy}. Estás hablando con ${fromName} por WhatsApp.

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
- Mensajes CORTOS — máximo 3 párrafos. Esto es WhatsApp, no un email.
- Usá emojis con moderación (1-2 por mensaje máximo)
- Respondé en español rioplatense
- Si no sabés algo con certeza, decilo y ofrecé conectar con el equipo
- Nunca inventes precios, fechas o cupos que no estén en el contexto

## CUÁNDO ESCALAR
Derivá a una persona del equipo cuando:
- El usuario pide hablar con una persona explícitamente
- Es un reclamo, queja o situación de conflicto
- Pide descuento especial, convenio institucional o nota de crédito
- Pregunta sobre pagos ya realizados, devoluciones o facturas
- Hace una consulta médica clínica (síntomas, diagnósticos, tratamientos)
- La pregunta está fuera de tu conocimiento
- El usuario está muy frustrado o urgente

Cuando debas escalar, respondé ÚNICAMENTE con este JSON (sin ningún texto adicional):
{"escalar":true,"motivo":"descripción breve","mensaje_usuario":"Entiendo tu consulta. Te voy a conectar con alguien del equipo que te puede ayudar mejor. En breve se comunican con vos. 😊"}

Para respuestas normales respondé en texto plano. NUNCA uses JSON si no es una escalación.`;
}
