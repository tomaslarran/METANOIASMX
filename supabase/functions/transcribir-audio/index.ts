import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://tomaslarran.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXT_BY_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
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
    const { audio_base64, mime_type } = await req.json();
    if (!audio_base64) throw new Error("audio_base64 requerido");

    const GROQ_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_KEY) throw new Error("Transcripción no configurada (falta GROQ_API_KEY)");

    const bytes = Uint8Array.from(atob(audio_base64), (c) => c.charCodeAt(0));
    const mime = mime_type || "audio/webm";
    const ext = EXT_BY_MIME[mime.split(";")[0]] || "webm";

    const formData = new FormData();
    formData.append("file", new Blob([bytes], { type: mime }), `audio.${ext}`);
    formData.append("model", "whisper-large-v3");
    formData.append("language", "es");

    const tr = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${GROQ_KEY}` },
      body: formData,
    });
    if (!tr.ok) {
      const errTxt = await tr.text();
      throw new Error(`Groq error: ${errTxt.slice(0, 300)}`);
    }
    const trData = await tr.json();
    const text = (trData.text || "").trim();
    if (!text) return new Response(JSON.stringify({ error: "No se pudo entender el audio" }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });

    return new Response(JSON.stringify({ text }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
