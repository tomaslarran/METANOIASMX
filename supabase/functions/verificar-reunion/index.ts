import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EQUIPO: Record<string, string> = {
  "335d872b-594c-8130-87af-000274e4aae6": "Tomás",
  "335d872b-594c-81f8-908b-00029b173f99": "Mario",
  "335d872b-594c-8152-a424-00024820cc46": "Valentina",
  "335d872b-594c-81e8-9623-00023e80a236": "Amparo",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { reunion_id } = await req.json();
    if (!reunion_id) throw new Error("reunion_id requerido");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const ASSEMBLY_KEY = Deno.env.get("ASSEMBLYAI_API_KEY")!;

    // Obtener reunión de la DB
    const { data: reunion, error: dbErr } = await supabase
      .from("reuniones")
      .select("*")
      .eq("id", reunion_id)
      .single();

    if (dbErr || !reunion) throw new Error("Reunión no encontrada");
    if (!reunion.assembly_job_id) throw new Error("Sin job_id de AssemblyAI");

    // Si ya está lista, devolver resultado
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

    // Mapear speakers a participantes si los hay
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
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: `Sos el asistente de Metanoia SMX. Analizás transcripciones de reuniones de la empresa.
La empresa tiene dos sociedades: SUDES (capacitación médica) y POINTERS (logística/servicios).
El equipo es: Tomás (gestión económica), Mario (cursos/relaciones), Valentina (contratos/redes), Amparo (administración).

Dado el transcript de una reunión, devolvé ÚNICAMENTE un JSON válido (sin markdown, sin texto extra):
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
        messages: [{
          role: "user",
          content: `TRANSCRIPT:\n\n${transcripcionTexto.slice(0, 60000)}`,
        }],
      }),
    });

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content?.[0]?.text ?? "{}";
    let analisis: any = {};
    try {
      analisis = JSON.parse(rawText.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim());
    } catch {
      analisis = { resumen: rawText.slice(0, 500), decisiones: [], tareas_extraidas: [], proximos_pasos: [], temas_tratados: [] };
    }

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
