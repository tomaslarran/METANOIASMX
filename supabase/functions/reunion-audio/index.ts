import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://tomaslarran.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-action, x-reunion-id, x-nombre, x-hash",
};
const J = { ...cors, "Content-Type": "application/json" };
const resp = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: J });

// Acciones:
//  crear  (JSON)  -> crea la reunión vacía (estado procesando, audios [])
//  subir  (binario, headers x-action:subir, x-reunion-id, x-nombre, x-hash) -> sube UN audio a AssemblyAI,
//          lanza su transcripción y lo registra en reuniones.audios (detecta duplicados por hash o nombre+tamaño)
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return resp({ error: "Unauthorized" }, 401);
  const supabaseAuth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return resp({ error: "Unauthorized" }, 401);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const AAI = Deno.env.get("ASSEMBLYAI_API_KEY")!;

  try {
    const accion = req.headers.get("x-action") || "crear";

    if (accion === "crear") {
      const b = await req.json();
      if (!b.titulo) throw new Error("titulo requerido");
      const { data, error } = await supabase.from("reuniones").insert({
        titulo: b.titulo,
        fecha: b.fecha || new Date().toISOString().split("T")[0],
        participantes: b.participantes || [],
        sociedad: b.sociedad || "SUDES",
        notas: b.notas || null,
        estado: "procesando",
        creado_por: b.creado_por || user.email || null,
        audios: [],
      }).select("id").single();
      if (error) throw error;
      return resp({ ok: true, reunion_id: data.id });
    }

    if (accion === "subir") {
      const reunionId = req.headers.get("x-reunion-id");
      const nombre = decodeURIComponent(req.headers.get("x-nombre") || "audio");
      const hash = req.headers.get("x-hash") || "";
      const size = Number(req.headers.get("content-length") || 0);
      if (!reunionId) throw new Error("x-reunion-id requerido");
      if (!req.body) throw new Error("Sin archivo");

      const { data: r, error: e0 } = await supabase.from("reuniones").select("*").eq("id", reunionId).single();
      if (e0 || !r) throw new Error("Reunión no encontrada");
      let audios: any[] = Array.isArray(r.audios) ? r.audios : [];

      // Duplicado: mismo hash, o mismo nombre y tamaño
      const dup = audios.find((a) => (hash && a.hash === hash) || (a.nombre === nombre && size && a.size === size));
      if (dup) return resp({ ok: true, duplicado: true, nombre: dup.nombre });

      // Reunión creada con el flujo viejo: preservar su transcripción como "audio original"
      if (!audios.length && (r.transcripcion || r.assembly_job_id)) {
        if (r.transcripcion) {
          audios.push({
            id: "original", nombre: "Audio original", estado: "completed",
            texto: r.transcripcion, diarizada: r.transcripcion_diarizada || [],
            duracion_min: r.duracion_min || null, subido_en: r.created_at, legacy: true,
          });
        } else if (r.assembly_job_id) {
          audios.push({ id: "original", nombre: "Audio original", estado: "processing", job_id: r.assembly_job_id, subido_en: r.created_at, legacy: true });
        }
      }

      // 1) Subir el archivo a AssemblyAI en streaming (la clave nunca sale del servidor)
      const up = await fetch("https://api.assemblyai.com/v2/upload", {
        method: "POST",
        headers: { Authorization: AAI, "Content-Type": "application/octet-stream" },
        body: req.body,
        // @ts-ignore: necesario para enviar un stream como cuerpo
        duplex: "half",
      });
      if (!up.ok) throw new Error("AssemblyAI upload " + up.status + ": " + (await up.text()).slice(0, 200));
      const { upload_url } = await up.json();

      // 2) Lanzar la transcripción de este audio
      const tr = await fetch("https://api.assemblyai.com/v2/transcript", {
        method: "POST",
        headers: { Authorization: AAI, "Content-Type": "application/json" },
        body: JSON.stringify({
          audio_url: upload_url,
          speech_models: ["universal-3-pro", "universal-2"],
          speaker_labels: true, language_code: "es", format_text: true,
        }),
      });
      if (!tr.ok) throw new Error("AssemblyAI transcript " + tr.status + ": " + (await tr.text()).slice(0, 200));
      const job = await tr.json();

      const entrada = {
        id: crypto.randomUUID(), nombre, size, hash, url: upload_url, job_id: job.id,
        estado: "processing", subido_en: new Date().toISOString(),
      };
      audios.push(entrada);

      const upd: any = { audios, estado: "procesando" };
      if (!r.audio_url) upd.audio_url = upload_url;
      const { error: e1 } = await supabase.from("reuniones").update(upd).eq("id", reunionId);
      if (e1) throw e1;

      return resp({ ok: true, audio_id: entrada.id, nombre });
    }

    throw new Error("Acción desconocida: " + accion);
  } catch (err) {
    return resp({ error: (err as Error).message }, 500);
  }
});
