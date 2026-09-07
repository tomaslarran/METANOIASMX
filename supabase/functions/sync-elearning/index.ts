import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://tomaslarran.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ELEARNING_URL = Deno.env.get("ELEARNING_URL") || "https://plataforma.metanoiasmx.com";
const ELEARNING_TOKEN = Deno.env.get("ELEARNING_API_TOKEN") || "";

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${ELEARNING_URL}/api${path}`, {
    ...opts,
    headers: {
      "Authorization": `Bearer ${ELEARNING_TOKEN}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`E-learning API error ${res.status}: ${path}`);
  return res.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Webhook de e-learning (sin JWT — viene de Laravel, no del panel)
  const url = new URL(req.url);
  const isWebhook = url.searchParams.get("source") === "webhook";

  if (!isWebhook) {
    // Llamada desde el panel — validar JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const action = body.action || url.searchParams.get("action") || "sync_all";

  try {
    if (action === "webhook_inscripcion") {
      // Laravel nos avisa que alguien se inscribió
      const ins = body.inscripcion;
      if (!ins) return new Response(JSON.stringify({ error: "No inscripcion data" }), { status: 400, headers: cors });

      await supabase.from("elearning_inscripciones").upsert({
        elearning_id: String(ins.id),
        elearning_curso_id: String(ins.curso_id),
        alumno_nombre: ins.alumno_nombre,
        alumno_email: ins.alumno_email,
        alumno_cuit: ins.alumno_cuit || null,
        alumno_telefono: ins.alumno_telefono || null,
        fecha_inscripcion: ins.fecha_inscripcion,
        estado: ins.estado || "inscripto",
        monto_pagado: ins.monto_pagado || null,
        raw: ins,
        synced_at: new Date().toISOString(),
      }, { onConflict: "elearning_id" });

      await logSync(supabase, "webhook_inscripcion", 1, 0, `Inscripción ${ins.id} recibida`);
      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }

    if (action === "sync_cursos" || action === "sync_all") {
      const data = await apiFetch("/cursos");
      const cursos = Array.isArray(data) ? data : data.data || [];
      let ok = 0, err = 0;

      for (const c of cursos) {
        const { error } = await supabase.from("elearning_cursos").upsert({
          elearning_id: String(c.id),
          nombre: c.nombre || c.title || c.name,
          descripcion: c.descripcion || c.description || null,
          estado: c.estado || c.status || null,
          fecha_inicio: c.fecha_inicio || c.start_date || null,
          fecha_fin: c.fecha_fin || c.end_date || null,
          cupos_max: c.cupos_max || c.capacity || null,
          cupos_inscriptos: c.cupos_inscriptos || c.enrolled || 0,
          precio: c.precio || c.price || null,
          raw: c,
          synced_at: new Date().toISOString(),
        }, { onConflict: "elearning_id" });
        error ? err++ : ok++;
      }

      await logSync(supabase, "sync_cursos", ok, err, `${cursos.length} cursos procesados`);
      if (action !== "sync_all") return new Response(JSON.stringify({ ok, err, total: cursos.length }), { headers: cors });
    }

    if (action === "sync_inscripciones" || action === "sync_all") {
      const data = await apiFetch("/inscripciones");
      const inscripciones = Array.isArray(data) ? data : data.data || [];
      let ok = 0, err = 0;

      for (const i of inscripciones) {
        const { error } = await supabase.from("elearning_inscripciones").upsert({
          elearning_id: String(i.id),
          elearning_curso_id: String(i.curso_id),
          alumno_nombre: i.alumno_nombre || i.student_name || null,
          alumno_email: i.alumno_email || i.email || null,
          alumno_cuit: i.alumno_cuit || i.cuit || null,
          alumno_telefono: i.alumno_telefono || i.telefono || null,
          fecha_inscripcion: i.fecha_inscripcion || i.created_at || null,
          estado: i.estado || i.status || "inscripto",
          monto_pagado: i.monto_pagado || i.amount || null,
          raw: i,
          synced_at: new Date().toISOString(),
        }, { onConflict: "elearning_id" });
        error ? err++ : ok++;
      }

      await logSync(supabase, "sync_inscripciones", ok, err, `${inscripciones.length} inscripciones procesadas`);
      if (action !== "sync_all") return new Response(JSON.stringify({ ok, err, total: inscripciones.length }), { headers: cors });
    }

    if (action === "publish_curso") {
      // Panel → e-learning: publicar un curso
      const curso = body.curso;
      if (!curso) return new Response(JSON.stringify({ error: "No curso data" }), { status: 400, headers: cors });
      const result = await apiFetch("/cursos", { method: "POST", body: JSON.stringify(curso) });
      // Guardar elearning_id en nuestra tabla si viene en la respuesta
      if (result.id && curso.panel_id) {
        await supabase.from("elearning_cursos").upsert({
          elearning_id: String(result.id),
          nombre: curso.nombre,
          panel_curso_id: curso.panel_id,
          raw: result,
          synced_at: new Date().toISOString(),
        }, { onConflict: "elearning_id" });
      }
      return new Response(JSON.stringify({ ok: true, elearning_id: result.id }), { headers: cors });
    }

    // sync_all completado
    return new Response(JSON.stringify({ ok: true, action: "sync_all" }), { headers: cors });

  } catch (e) {
    await logSync(supabase, action, 0, 1, e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
  }
});

async function logSync(supabase: ReturnType<typeof createClient>, tipo: string, ok: number, err: number, detalle: string) {
  await supabase.from("elearning_sync_log").insert({ tipo, registros_synced: ok, errores: err, detalle });
}
