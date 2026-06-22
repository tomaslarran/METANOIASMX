import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://tomaslarran.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Extrae y parsea JSON de la respuesta de Claude, tolerando markdown code fences
function parsearAnalisis(rawText: string): any {
  let txt = rawText.trim();
  // Quitar ```json ... ``` o ``` ... ```
  txt = txt.replace(/^```[\w]*\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  // Si sigue sin empezar con {, buscar el primer objeto JSON dentro del texto
  if (!txt.startsWith("{")) {
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) txt = m[0];
  }
  return JSON.parse(txt);
}

async function analizarConClaude(transcripcionTexto: string, anthropicKey: string): Promise<any> {
  const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: `Sos el asistente de Metanoia SMX. Analizás transcripciones de reuniones de la empresa.
La empresa tiene dos sociedades: SUDES (capacitación médica) y POINTERS (logística/servicios).
El equipo es: Tomás (gestión económica), Mario (cursos/relaciones), Valentina (contratos/redes), Amparo (administración).

Dado el transcript de una reunión, analizalo y devolvé ÚNICAMENTE un objeto JSON válido.
No uses bloques de código markdown. No escribas nada antes ni después del JSON.
Empezá tu respuesta directamente con { y terminá con }.

Formato exacto:
{
  "resumen": "Resumen ejecutivo claro de 3-5 oraciones",
  "temas_tratados": ["tema 1", "tema 2"],
  "decisiones": ["Decisión concreta 1", "Decisión concreta 2"],
  "tareas_extraidas": [
    {"tarea": "descripción de la tarea", "responsable": "Nombre o null", "fecha_sugerida": "YYYY-MM-DD o null"}
  ],
  "proximos_pasos": ["paso 1", "paso 2"]
}

Si el transcript está vacío o es incomprensible, devolvé el JSON con campos vacíos.`,
      messages: [
        { role: "user", content: `TRANSCRIPT:\n\n${transcripcionTexto.slice(0, 60000)}` },
      ],
    }),
  });

  if (!claudeRes.ok) {
    const errBody = await claudeRes.text();
    throw new Error(`Claude API error ${claudeRes.status}: ${errBody.slice(0, 300)}`);
  }
  const claudeData = await claudeRes.json();
  // Si Claude devuelve un error en el cuerpo (ej: overloaded, invalid_request)
  if (claudeData.type === "error") {
    throw new Error(`Claude error: ${claudeData.error?.message || JSON.stringify(claudeData.error)}`);
  }
  const rawText = claudeData.content?.[0]?.text ?? "{}";
  try {
    return parsearAnalisis(rawText);
  } catch (e) {
    console.error("parsearAnalisis falló:", e, "raw:", rawText.slice(0, 500));
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
  const supabaseAuth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

  try {
    const { reunion_id, reanalizar } = await req.json();
    if (!reunion_id) throw new Error("reunion_id requerido");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const ASSEMBLY_KEY = Deno.env.get("ASSEMBLYAI_API_KEY")!;
    const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

    // Obtener reunión de la DB
    const { data: reunion, error: dbErr } = await supabase
      .from("reuniones")
      .select("*")
      .eq("id", reunion_id)
      .single();

    if (dbErr || !reunion) throw new Error("Reunión no encontrada");

    // ── Modo re-análisis: usar transcripción ya guardada, llamar solo a Claude ──
    if (reanalizar && reunion.transcripcion) {
      const analisis = await analizarConClaude(reunion.transcripcion, ANTHROPIC_KEY);
      if (!analisis) throw new Error("Claude no pudo parsear la respuesta como JSON. Revisá los logs de la función.");

      await supabase.from("reuniones").update({
        resumen: analisis.resumen || null,
        decisiones: analisis.decisiones || [],
        tareas_extraidas: analisis.tareas_extraidas || [],
      }).eq("id", reunion_id);

      return new Response(JSON.stringify({
        estado: "listo",
        resumen: analisis.resumen,
        temas_tratados: analisis.temas_tratados,
        decisiones: analisis.decisiones,
        tareas_extraidas: analisis.tareas_extraidas,
        proximos_pasos: analisis.proximos_pasos,
        transcripcion_diarizada: reunion.transcripcion_diarizada,
        duracion_min: reunion.duracion_min,
      }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Si ya está lista y no es re-análisis, devolver resultado cacheado
    if (reunion.estado === "listo") {
      return new Response(JSON.stringify({
        estado: "listo",
        resumen: reunion.resumen,
        decisiones: reunion.decisiones,
        tareas_extraidas: reunion.tareas_extraidas,
        transcripcion_diarizada: reunion.transcripcion_diarizada,
        duracion_min: reunion.duracion_min,
      }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    if (!reunion.assembly_job_id) throw new Error("Sin job_id de AssemblyAI");

    // Consultar estado en AssemblyAI
    const aaiRes = await fetch(`https://api.assemblyai.com/v2/transcript/${reunion.assembly_job_id}`, {
      headers: { "Authorization": ASSEMBLY_KEY },
    });
    const aaiData = await aaiRes.json();

    if (aaiData.status === "error") {
      await supabase.from("reuniones").update({ estado: "error" }).eq("id", reunion_id);
      return new Response(JSON.stringify({ estado: "error", error: aaiData.error }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (aaiData.status !== "completed") {
      return new Response(JSON.stringify({ estado: "procesando" }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // ── Transcripción completa ──
    const utterances: { speaker: string; text: string; start: number; end: number }[] = aaiData.utterances || [];
    const letrasHablantes = ["A","B","C","D","E","F","G","H","I","J"];

    const participantes: string[] = reunion.participantes || [];
    const speakerMap: Record<string, string> = {};
    utterances.forEach(u => {
      if (!speakerMap[u.speaker]) {
        const idx = letrasHablantes.indexOf(u.speaker);
        speakerMap[u.speaker] = participantes[idx] ?? `Hablante ${u.speaker}`;
      }
    });

    const transcripcionDiarizada = utterances.map(u => ({
      speaker: speakerMap[u.speaker] || `Hablante ${u.speaker}`,
      texto: u.text,
      inicio_ms: u.start,
      fin_ms: u.end,
    }));

    const transcripcionTexto = utterances.length
      ? utterances.map(u => `${speakerMap[u.speaker] || `Hablante ${u.speaker}`}: ${u.text}`).join("\n")
      : (aaiData.text || "");

    const duracionMin = aaiData.audio_duration ? Math.round(aaiData.audio_duration / 60) : null;

    // ── Análisis con Claude ──
    const analisis = await analizarConClaude(transcripcionTexto, ANTHROPIC_KEY) ?? {
      resumen: null, decisiones: [], tareas_extraidas: [], proximos_pasos: [], temas_tratados: [],
    };

    // Guardar en DB
    await supabase.from("reuniones").update({
      transcripcion: transcripcionTexto,
      transcripcion_diarizada: transcripcionDiarizada,
      resumen: analisis.resumen || null,
      decisiones: analisis.decisiones || [],
      tareas_extraidas: analisis.tareas_extraidas || [],
      duracion_min: duracionMin,
      estado: "listo",
    }).eq("id", reunion_id);

    return new Response(JSON.stringify({
      estado: "listo",
      resumen: analisis.resumen,
      temas_tratados: analisis.temas_tratados,
      decisiones: analisis.decisiones,
      tareas_extraidas: analisis.tareas_extraidas,
      proximos_pasos: analisis.proximos_pasos,
      transcripcion_diarizada: transcripcionDiarizada,
      duracion_min: duracionMin,
    }), { headers: { ...cors, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
