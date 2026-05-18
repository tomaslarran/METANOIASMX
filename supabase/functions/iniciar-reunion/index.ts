import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { titulo, fecha, participantes, sociedad, audio_url, creado_por, notas } = await req.json();
    if (!audio_url) throw new Error("audio_url requerida");
    if (!titulo) throw new Error("titulo requerido");

    const ASSEMBLY_KEY = Deno.env.get("ASSEMBLYAI_API_KEY")!;

    // Enviar a AssemblyAI directamente con la URL pública de Supabase Storage
    const transcriptRes = await fetch("https://api.assemblyai.com/v2/transcript", {
      method: "POST",
      headers: {
        "Authorization": ASSEMBLY_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        audio_url,
        speech_models: ["universal-3-pro", "universal-2"],
        speaker_labels: true,
        language_code: "es",
        format_text: true,
      }),
    });

    if (!transcriptRes.ok) {
      const err = await transcriptRes.json();
      throw new Error("AssemblyAI error: " + JSON.stringify(err));
    }

    const transcript = await transcriptRes.json();

    // Crear registro en la base de datos
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: reunion, error } = await supabase
      .from("reuniones")
      .insert({
        titulo,
        fecha: fecha || new Date().toISOString().split("T")[0],
        participantes: participantes || [],
        sociedad: sociedad || "SUDES",
        audio_url,
        assembly_job_id: transcript.id,
        estado: "procesando",
        creado_por: creado_por || null,
        notas: notas || null,
      })
      .select()
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, reunion_id: reunion.id, assembly_id: transcript.id }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
