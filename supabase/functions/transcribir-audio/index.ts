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

  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

  try {
    const { audio_base64 } = await req.json();
    if (!audio_base64) throw new Error("audio_base64 requerido");

    const ASSEMBLY_KEY = Deno.env.get("ASSEMBLYAI_API_KEY");
    if (!ASSEMBLY_KEY) throw new Error("Transcripción no configurada (falta ASSEMBLYAI_API_KEY)");

    const bytes = Uint8Array.from(atob(audio_base64), (c) => c.charCodeAt(0));

    // 1. Subir el audio a AssemblyAI — mismo mecanismo que usa Reuniones
    const uploadRes = await fetch("https://api.assemblyai.com/v2/upload", {
      method: "POST",
      headers: { "Authorization": ASSEMBLY_KEY, "Content-Type": "application/octet-stream" },
      body: bytes,
    });
    if (!uploadRes.ok) throw new Error("Error al subir audio a AssemblyAI: " + uploadRes.status);
    const { upload_url } = await uploadRes.json();

    // 2. Iniciar transcripción
    const transcRes = await fetch("https://api.assemblyai.com/v2/transcript", {
      method: "POST",
      headers: { "Authorization": ASSEMBLY_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ audio_url: upload_url, language_code: "es", format_text: true }),
    });
    if (!transcRes.ok) throw new Error("Error iniciando transcripción: " + transcRes.status);
    const { id: jobId } = await transcRes.json();

    // 3. Poll — audios de chat son cortos, no debería tardar más de un minuto
    let data: any = null;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${jobId}`, {
        headers: { "Authorization": ASSEMBLY_KEY },
      });
      data = await pollRes.json();
      if (data.status === "completed" || data.status === "error") break;
    }
    if (!data || data.status !== "completed") {
      throw new Error(data?.error || "No se pudo transcribir el audio (timeout de AssemblyAI)");
    }

    const text = (data.text || "").trim();
    if (!text) {
      return new Response(JSON.stringify({ error: "No se pudo entender el audio" }), {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ text }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
