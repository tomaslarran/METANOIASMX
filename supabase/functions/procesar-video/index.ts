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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { cola_id } = await req.json();
    if (!cola_id) throw new Error("cola_id requerido");

    const { data: row, error: rowErr } = await supabase
      .from("video_cola")
      .select("*")
      .eq("id", cola_id)
      .single();
    if (rowErr || !row) throw new Error("Solicitud no encontrada");

    await supabase.from("video_cola").update({ estado: "transcribiendo" }).eq("id", cola_id);

    let transcripcion = "";

    // ── Transcripción con AssemblyAI (si hay URL) ─────────────────────────────
    if (row.video_url) {
      const ASSEMBLY_KEY = Deno.env.get("ASSEMBLYAI_API_KEY");
      if (ASSEMBLY_KEY) {
        try {
          // Iniciar transcripción
          const txRes = await fetch("https://api.assemblyai.com/v2/transcript", {
            method: "POST",
            headers: { "Authorization": ASSEMBLY_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({ audio_url: row.video_url, language_code: "es", punctuate: true, format_text: true })
          });
          const txData = await txRes.json();
          const txId = txData.id;

          if (txId) {
            // Guardar job_id para polling externo si se necesita
            await supabase.from("video_cola").update({ assembly_job_id: txId }).eq("id", cola_id);

            // Polling hasta 90 segundos (límite edge function ~150s)
            for (let i = 0; i < 15; i++) {
              await new Promise(r => setTimeout(r, 6000));
              const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${txId}`, {
                headers: { "Authorization": ASSEMBLY_KEY }
              });
              const pollData = await pollRes.json();
              if (pollData.status === "completed") {
                transcripcion = pollData.text || "";
                break;
              }
              if (pollData.status === "error") break;
            }
          }
        } catch (_) { /* transcripción opcional — continuar sin ella */ }
      }
    }

    // ── Generar spec con Claude ───────────────────────────────────────────────
    const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

    const systemPrompt = `Sos un editor de video profesional especializado en contenido educativo médico para Metanoia SMX.
Tu tarea es generar una spec técnica de edición detallada basada en las instrucciones del instructor y la transcripción del video (si está disponible).

La spec debe incluir:
1. CORTES: timestamps exactos de segmentos a eliminar (formato HH:MM:SS - HH:MM:SS + motivo)
2. INSERCIONES: qué agregar y dónde (intro Metanoia 30s, outro, slides, etc.)
3. SUBTÍTULOS: si se piden, indicar herramienta sugerida (CapCut, DaVinci, Adobe Premiere)
4. AUDIO: ajustes de volumen, música de fondo si aplica
5. EXPORTACIÓN: resolución y formato sugerido para YouTube (1080p MP4)

Si no hay transcripción, generá la spec basada solo en las instrucciones, indicando que los timestamps son estimativos.
Usá formato claro con secciones, sin markdown pesado. Solo texto plano con guiones y números.`;

    const userMsg = `INSTRUCCIONES DEL INSTRUCTOR:
${row.instrucciones}

${transcripcion ? `TRANSCRIPCIÓN DEL VIDEO:
${transcripcion.slice(0, 8000)}` : "No se pudo obtener la transcripción automática. Los timestamps son estimativos."}`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: "user", content: userMsg }]
      })
    });
    const aiData = await aiRes.json();
    const spec = aiData.content?.[0]?.text || "Error al generar spec";

    await supabase.from("video_cola").update({
      transcripcion: transcripcion || null,
      spec_ia: spec,
      estado: "con_spec",
      updated_at: new Date().toISOString()
    }).eq("id", cola_id);

    return new Response(JSON.stringify({ ok: true, spec }), { headers: { ...cors, "Content-Type": "application/json" } });

  } catch (e) {
    await supabase.from("video_cola").update({ estado: "error" }).eq("id", (await req.json().catch(() => ({}))).cola_id || "");
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: cors });
  }
});
