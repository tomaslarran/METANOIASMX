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

  if (isWebhook) {
    // Webhook de Laravel — validar secreto compartido (falla cerrado si no está configurado)
    const secret = Deno.env.get("ELEARNING_WEBHOOK_SECRET") || "";
    const recibido = req.headers.get("X-Webhook-Secret") || "";
    if (!secret || !safeEqual(recibido, secret)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: cors });
    }
  } else {
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

  // Las acciones webhook_* solo por webhook; las demás solo desde el panel
  if (isWebhook !== action.startsWith("webhook_")) {
    return new Response(JSON.stringify({ error: "Acción no permitida" }), { status: 403, headers: cors });
  }

  try {
    if (action === "webhook_evento") {
      // Estado de cuenta: alta de cliente, pagos, facturas, suscripciones (spec sección 6)
      const ev = body.evento;
      if (!ev?.id || !ev?.tipo || !ev?.alumno) {
        return new Response(JSON.stringify({ error: "Evento incompleto (id, tipo, alumno)" }), { status: 400, headers: cors });
      }
      const cuit = normCuit(ev.alumno.cuit);

      // Idempotencia: si el evento ya se procesó, no hacer nada
      const { error: dupErr } = await supabase.from("elearning_eventos").insert({
        evento_id: String(ev.id),
        tipo: ev.tipo,
        alumno_cuit: cuit,
        ocurrido_en: ev.ocurrido_en || null,
        payload: ev,
      });
      if (dupErr) {
        if (dupErr.code === "23505") return new Response(JSON.stringify({ ok: true, duplicado: true }), { headers: cors });
        throw new Error(dupErr.message);
      }

      try {
        await procesarEvento(supabase, ev, cuit);
      } catch (e) {
        // Liberar el id para que el reintento de Laravel vuelva a procesarlo
        await supabase.from("elearning_eventos").delete().eq("evento_id", String(ev.id));
        throw e;
      }

      await logSync(supabase, "webhook_evento", 1, 0, `${ev.tipo} · ${cuit || "sin CUIT"}`);
      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }

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

type SB = ReturnType<typeof createClient>;

async function procesarEvento(supabase: SB, ev: any, cuit: string | null) {
  const a = ev.alumno || {};
  const d = ev.datos || {};
  const ahora = new Date().toISOString();

  // Todo evento refresca la ficha del cliente (mismos datos que pide el registro del campus)
  if (cuit) {
    // Vincular con la ficha de Alumnos del panel si ya existe ese CUIT (con o sin guiones)
    const cuitGuiones = `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`;
    const { data: alu } = await supabase.from("alumnos").select("id")
      .or(`cuit.eq.${cuit},cuit.eq.${cuitGuiones}`).limit(1);

    const { error } = await supabase.from("elearning_clientes").upsert({
      cuit,
      elearning_alumno_id: a.id != null ? String(a.id) : null,
      nombre_completo: a.nombre_completo || [a.nombre, a.apellido].filter(Boolean).join(" ") || null,
      email: a.email || null,
      dni: a.dni != null ? String(a.dni) : null,
      telefono: a.telefono || null,
      matricula: a.matricula || null,
      profesion: a.profesion || null,
      condicion_fiscal: a.condicion_fiscal || null,
      tipo_persona: a.tipo_persona || null,
      razon_social: a.razon_social || null,
      provincia: a.provincia || null,
      documentos_aceptados: Array.isArray(a.documentos_aceptados) ? a.documentos_aceptados : null,
      registrado_en: a.registrado_en || null,
      finnegans_cliente_codigo: a.finnegans_cliente_codigo || null,
      ...(alu?.[0]?.id ? { alumno_id: alu[0].id } : {}),
      raw: a,
      updated_at: ahora,
    }, { onConflict: "cuit" });
    if (error) throw new Error(error.message);
  }

  let pagoYaResuelto = false;
  if (ev.tipo === "pago.pendiente") {
    const { data: prev } = await supabase.from("elearning_pagos").select("estado").eq("pago_id", String(d.pago_id)).limit(1);
    pagoYaResuelto = !!prev?.[0]?.estado && prev[0].estado !== "pendiente";
  }

  if (!pagoYaResuelto && (ev.tipo === "pago.pendiente" || ev.tipo === "pago.aprobado" || ev.tipo === "pago.rechazado")) {
    const { error } = await supabase.from("elearning_pagos").upsert({
      pago_id: String(d.pago_id),
      cuit,
      concepto: d.concepto || null,
      elearning_curso_id: d.curso_id != null ? String(d.curso_id) : null,
      suscripcion_id: d.suscripcion_id != null ? String(d.suscripcion_id) : null,
      monto: d.monto ?? null,
      moneda: d.moneda || "ARS",
      medio_pago: d.medio_pago || null,
      referencia_externa: d.referencia_externa || null,
      fecha_pago: d.fecha_pago || ev.ocurrido_en || null,
      estado: ev.tipo.slice("pago.".length),
      updated_at: ahora,
    }, { onConflict: "pago_id" });
    if (error) throw new Error(error.message);
  }

  if (ev.tipo === "factura.emitida" || ev.tipo === "factura.error") {
    const campos = ev.tipo === "factura.emitida"
      ? {
          factura_estado: d.cae ? "emitida" : "borrador",
          factura_tipo: d.tipo_comprobante || null,
          factura_punto_venta: d.punto_venta || null,
          factura_numero: d.numero || null,
          factura_fecha: d.fecha || null,
          factura_neto: d.neto ?? null,
          factura_iva: d.iva ?? null,
          factura_total: d.total ?? null,
          cae: d.cae || null,
          cae_vencimiento: d.cae_vencimiento || null,
          finnegans_comprobante_id: d.finnegans_comprobante_id || null,
          factura_pdf_url: d.pdf_url || null,
          factura_error: null,
        }
      : { factura_estado: "error", factura_error: d.error || "Error sin detalle" };
    const { error } = await supabase.from("elearning_pagos").upsert(
      { pago_id: String(d.pago_id), cuit, ...campos, updated_at: ahora },
      { onConflict: "pago_id" },
    );
    if (error) throw new Error(error.message);
    if (ev.tipo === "factura.error") {
      await notificarAdmins(supabase, "elearning_factura_error",
        `🧾 Finnegans rechazó la factura del pago ${d.pago_id} (${nombreAlumno(a)}): ${d.error || "sin detalle"}`);
    }
  }

  if (ev.tipo.startsWith("suscripcion.")) {
    const estado = ev.tipo === "suscripcion.vencida" ? "vencida" : "activa";
    const fila: Record<string, unknown> = {
      suscripcion_id: String(d.suscripcion_id),
      cuit,
      plan: d.plan || null,
      periodicidad: d.periodicidad || null,
      monto: d.monto ?? null,
      fecha_inicio: d.fecha_inicio || null,
      fecha_vencimiento: d.fecha_vencimiento || null,
      renovacion_automatica: d.renovacion_automatica ?? null,
      estado,
      updated_at: ahora,
    };
    if (ev.tipo === "suscripcion.por_vencer") fila.aviso_por_vencer_en = ahora;
    const { error } = await supabase.from("elearning_suscripciones").upsert(fila, { onConflict: "suscripcion_id" });
    if (error) throw new Error(error.message);

    // Agrupado por fecha de vencimiento: la promo sin cargo vence para todos el mismo día,
    // así que un aviso por alumno inundaría la campanita
    if (ev.tipo === "suscripcion.por_vencer" || ev.tipo === "suscripcion.vencida") {
      const porVencer = ev.tipo === "suscripcion.por_vencer";
      const fecha = d.fecha_vencimiento ? String(d.fecha_vencimiento).slice(0, 10) : null;
      let q = supabase.from("elearning_suscripciones").select("id", { count: "exact", head: true })
        .eq("estado", porVencer ? "activa" : "vencida");
      q = fecha ? q.eq("fecha_vencimiento", fecha) : q.is("fecha_vencimiento", null);
      if (porVencer) q = q.not("aviso_por_vencer_en", "is", null);
      const { count } = await q;
      const n = count || 1;
      const mensaje = porVencer
        ? (n === 1
            ? `⏰ La suscripción "${d.plan || ""}" de ${nombreAlumno(a)} vence el ${fmtFecha(fecha)} — contactar para renovar`
            : `⏰ ${n} suscripciones vencen el ${fmtFecha(fecha)} (última: ${nombreAlumno(a)}) — contactar para renovar`)
        : (n === 1
            ? `⌛ Venció la suscripción "${d.plan || ""}" de ${nombreAlumno(a)} sin renovar`
            : `⌛ ${n} suscripciones vencieron el ${fmtFecha(fecha)} sin renovar (última: ${nombreAlumno(a)})`);
      await notificarAdminsAgrupado(supabase,
        porVencer ? "elearning_suscripcion_por_vencer" : "elearning_suscripcion_vencida",
        fecha || "sin_fecha", mensaje);
    }
  }
}

// Si ya hay una notificación no leída del mismo tipo y fecha, se actualiza el texto en vez de crear otra
async function notificarAdminsAgrupado(supabase: SB, tipo: string, clave: string, mensaje: string) {
  try {
    const { data: existentes } = await supabase.from("notificaciones").select("id")
      .eq("tipo", tipo).eq("leida", false).eq("meta->>clave", clave);
    if (existentes?.length) {
      await supabase.from("notificaciones").update({ mensaje })
        .in("id", existentes.map((n: any) => n.id));
      return;
    }
    const { data: admins } = await supabase.from("usuarios").select("id").eq("rol", "admin").eq("activo", true);
    if (!admins?.length) return;
    await supabase.from("notificaciones").insert(
      admins.map((u: any) => ({ usuario_id: u.id, tipo, mensaje, leida: false, meta: { clave } })),
    );
  } catch (_) { /* la notificación no debe hacer fallar el webhook */ }
}

async function notificarAdmins(supabase: SB, tipo: string, mensaje: string) {
  try {
    const { data: admins } = await supabase.from("usuarios").select("id").eq("rol", "admin").eq("activo", true);
    if (!admins?.length) return;
    await supabase.from("notificaciones").insert(
      admins.map((u: any) => ({ usuario_id: u.id, tipo, mensaje, leida: false })),
    );
  } catch (_) { /* la notificación no debe hacer fallar el webhook */ }
}

function normCuit(v: unknown): string | null {
  const s = String(v ?? "").replace(/\D/g, "");
  return s.length === 11 ? s : null;
}

function nombreAlumno(a: any): string {
  return a.nombre_completo || [a.nombre, a.apellido].filter(Boolean).join(" ") || a.email || "alumno sin nombre";
}

function fmtFecha(f: string | null | undefined): string {
  if (!f) return "(sin fecha)";
  const [y, m, d] = String(f).slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function logSync(supabase: ReturnType<typeof createClient>, tipo: string, ok: number, err: number, detalle: string) {
  await supabase.from("elearning_sync_log").insert({ tipo, registros_synced: ok, errores: err, detalle });
}
