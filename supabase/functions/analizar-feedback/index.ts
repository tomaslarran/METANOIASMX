import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://tomaslarran.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
  const supabaseAuth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const haceUnaSemana = new Date(Date.now() - 7 * 24 * 3600000).toISOString();

    // Leer feedback de la semana con comentario
    const { data: feedbacks } = await supabase
      .from("mensajes_publico")
      .select("feedback, feedback_comentario, mensaje, respuesta, plataforma, created_at")
      .not("feedback_comentario", "is", null)
      .gt("created_at", haceUnaSemana)
      .order("created_at", { ascending: false });

    if (!feedbacks || feedbacks.length === 0) {
      return new Response(JSON.stringify({ ok: true, mensaje: "No hay feedback nuevo esta semana.", generadas: 0 }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Leer mejoras ya existentes (para evitar duplicados)
    const { data: mejoras_existentes } = await supabase
      .from("agente_mejoras")
      .select("regla")
      .in("estado", ["pendiente", "aprobada"]);

    const reglasExistentes = (mejoras_existentes || []).map((m: any) => m.regla).join("\n");

    // Armar contexto de feedback
    const feedbackTexto = feedbacks.map((f: any) => {
      const tipo = f.feedback === "like" ? "👍 BUENA" : "👎 MEJORAR";
      return `[${tipo}] Mensaje: "${f.mensaje?.slice(0, 120)}" → Respuesta: "${f.respuesta?.slice(0, 120)}" → Comentario del equipo: "${f.feedback_comentario}"`;
    }).join("\n\n");

    const prompt = `Sos un experto en mejora de chatbots de atención al cliente. Analizás el feedback del equipo de Metanoia SMX sobre las respuestas de su agente de Instagram/WhatsApp/Facebook.

FEEDBACK DE LA SEMANA:
${feedbackTexto}

REGLAS YA EXISTENTES (no repetir):
${reglasExistentes || "Ninguna aún."}

Tu tarea: analizá los patrones del feedback y generá REGLAS CONCRETAS Y ACCIONABLES para mejorar el agente.

Cada regla debe ser:
- Específica y aplicable ("Cuando el usuario pregunte X, respondé Y" o "Evitar Z porque...")
- Basada en el feedback real, no en suposiciones
- Diferente a las reglas ya existentes

Devolvé ÚNICAMENTE un array JSON con este formato (sin texto adicional, sin markdown):
[
  {
    "regla": "texto de la regla concreta",
    "motivo": "en qué feedback se basa esta sugerencia"
  }
]

Si no hay patrones claros o el feedback es muy escaso para generar reglas útiles, devolvé un array vacío: []`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const aiData = await aiRes.json();
    const rawText = aiData.content?.[0]?.text ?? "[]";

    let mejoras: { regla: string; motivo: string }[] = [];
    try {
      const txt = rawText.trim().replace(/^```[\w]*\s*/i, "").replace(/\s*```\s*$/i, "").trim();
      mejoras = JSON.parse(txt);
      if (!Array.isArray(mejoras)) mejoras = [];
    } catch (_) {
      mejoras = [];
    }

    if (mejoras.length === 0) {
      return new Response(JSON.stringify({ ok: true, mensaje: "No se encontraron patrones suficientes para generar reglas.", generadas: 0 }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Guardar mejoras como pendientes
    const rows = mejoras.map((m) => ({
      regla: m.regla,
      motivo: m.motivo,
      estado: "pendiente",
      feedback_count: feedbacks.length,
    }));

    await supabase.from("agente_mejoras").insert(rows);

    return new Response(JSON.stringify({ ok: true, generadas: mejoras.length, mejoras }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
