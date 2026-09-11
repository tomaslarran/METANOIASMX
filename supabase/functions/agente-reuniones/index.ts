import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://tomaslarran.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Chequea el límite mensual de tokens de IA de la organización y del usuario.
async function chequearLimiteIA(supabase: any, email: string | null) {
  const inicioMes = new Date();
  inicioMes.setUTCDate(1);
  inicioMes.setUTCHours(0, 0, 0, 0);
  const inicioMesISO = inicioMes.toISOString();
  const renuevaMes = new Date(inicioMes);
  renuevaMes.setUTCMonth(renuevaMes.getUTCMonth() + 1);
  const renuevaStr = renuevaMes.toLocaleDateString("es-AR", { day: "2-digit", month: "long", timeZone: "America/Argentina/Salta" });

  let usuario: any = null;
  if (email) {
    const { data } = await supabase.from("usuarios").select("id,organizacion_id,limite_tokens_mensual").ilike("email", email).maybeSingle();
    usuario = data;
  }
  let organizacionId: string | null = usuario?.organizacion_id ?? null;
  let organizacion: any = null;
  if (organizacionId) {
    const { data } = await supabase.from("organizaciones").select("id,limite_tokens_mensual").eq("id", organizacionId).maybeSingle();
    organizacion = data;
  } else if (!email) {
    const { data } = await supabase.from("organizaciones").select("id,limite_tokens_mensual").limit(1).maybeSingle();
    organizacion = data;
    organizacionId = organizacion?.id ?? null;
  }

  if (organizacion?.limite_tokens_mensual) {
    const { data: usoOrg } = await supabase.from("ia_uso").select("input_tokens,output_tokens").eq("organizacion_id", organizacionId).gte("created_at", inicioMesISO);
    const totalOrg = (usoOrg || []).reduce((s: number, r: any) => s + (r.input_tokens || 0) + (r.output_tokens || 0), 0);
    if (totalOrg >= organizacion.limite_tokens_mensual) {
      return { bloqueado: true, motivo: "organizacion", mensaje: `Se alcanzó el límite mensual de uso de IA de la organización. Se renueva el ${renuevaStr}. Pedile a un admin que amplíe el plan.`, usuarioId: usuario?.id ?? null, organizacionId };
    }
  }
  if (usuario?.limite_tokens_mensual) {
    const { data: usoUser } = await supabase.from("ia_uso").select("input_tokens,output_tokens").eq("usuario_id", usuario.id).gte("created_at", inicioMesISO);
    const totalUser = (usoUser || []).reduce((s: number, r: any) => s + (r.input_tokens || 0) + (r.output_tokens || 0), 0);
    if (totalUser >= usuario.limite_tokens_mensual) {
      return { bloqueado: true, motivo: "usuario", mensaje: `Alcanzaste tu límite mensual personal de uso de IA. Se renueva el ${renuevaStr}. Pedile a un admin que te amplíe el límite.`, usuarioId: usuario.id, organizacionId };
    }
  }
  return { bloqueado: false, motivo: null as string | null, mensaje: null as string | null, usuarioId: usuario?.id ?? null, organizacionId };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
  const supabaseAuth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

  try {
    const { message, historial = [], reunion_id = null } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Cargar contexto de todos los dominios en paralelo ─────────────────────
    const [
      reuniones,
      oportunidades,
      tareas,
      cajaMov,
      cfPrestamos,
      cursosActivos,
    ] = await Promise.all([
      supabase
        .from("reuniones")
        .select("*")
        .order("fecha", { ascending: false })
        .limit(40),
      supabase
        .from("oportunidades")
        .select("id,idea_cruda,tipo,estado,linea_negocio,ejecutor,primer_paso,reunion_id")
        .neq("estado", "Descartado")
        .limit(30),
      supabase
        .from("tareas")
        .select("nombre,status,prioridad,assignees,fecha_vencimiento")
        .in("status", ["todo", "doing"])
        .order("fecha_vencimiento", { ascending: true })
        .limit(20),
      supabase
        .from("caja_movimientos")
        .select("sociedad,fecha,tipo,concepto,monto")
        .order("fecha", { ascending: false })
        .limit(20),
      supabase
        .from("cf_prestamos")
        .select("descripcion,saldo_actual,cuota_mensual,estado")
        .eq("estado", "activo"),
      supabase
        .from("cursos")
        .select("nombre,estado,fecha_inicio,instructor_nombre")
        .in("estado", ["Borrador", "Confirmado", "En curso", "Próximo"]),
    ]);

    // ── Resumen de compromisos pendientes extraídos de reuniones ──────────────
    const compromisosPendientes: any[] = [];
    for (const r of reuniones.data ?? []) {
      for (const t of r.tareas_extraidas ?? []) {
        compromisosPendientes.push({
          origen: r.titulo,
          fecha_reunion: r.fecha,
          tarea: t.tarea,
          responsable: t.responsable,
          fecha_sugerida: t.fecha_sugerida,
        });
      }
    }

    // ── Reunión específica si se pidió contexto puntual ───────────────────────
    let reunionFoco: any = null;
    if (reunion_id) {
      const { data } = await supabase
        .from("reuniones")
        .select("*")
        .eq("id", reunion_id)
        .single();
      reunionFoco = data;
    }

    // ── Vincular oportunidades a sus reuniones ────────────────────────────────
    const reunionesMap = new Map((reuniones.data ?? []).map((r: any) => [r.id, r.titulo]));
    const oportunidadesConReunion = (oportunidades.data ?? []).map((o: any) => ({
      ...o,
      reunion_titulo: o.reunion_id ? (reunionesMap.get(o.reunion_id) ?? "—") : null,
    }));

    const hoy = new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Salta" });

    const sistema = `Sos el agente de reuniones y seguimiento. Hoy es ${hoy}.
Gestionás reuniones de todo tipo: con bancos, contadores, clientes, equipo interno, comunicaciones, proveedores, organismos.
Respondé siempre en español. Sé específico — mencioná nombres, fechas y montos reales cuando los tenés.
Usá formato markdown. Sé directo y accionable.

## TU ROL
- Hacés seguimiento de compromisos y decisiones tomadas en reuniones
- Identificás qué cosas quedaron pendientes y quién es responsable
- Cruzás la información de reuniones con el estado actual del negocio
- Alertás sobre compromisos próximos a vencer o sin avance
- Ayudás a preparar reuniones futuras con contexto real
- Conectás decisiones de reuniones con las oportunidades del pipeline

## REUNIONES REGISTRADAS (con análisis IA)
${JSON.stringify((reuniones.data ?? []).map((r: any) => ({
  id: r.id,
  titulo: r.titulo,
  fecha: r.fecha,
  participantes: r.participantes,
  sociedad: r.sociedad,
  duracion_min: r.duracion_min,
  temas: r.temas_tratados,
  resumen: r.resumen,
  decisiones: r.decisiones,
  proximos_pasos: r.proximos_pasos,
  tareas_extraidas: r.tareas_extraidas,
})), null, 2)}

## COMPROMISOS PENDIENTES (extraídos de todas las reuniones)
${JSON.stringify(compromisosPendientes, null, 2)}

## PIPELINE DE OPORTUNIDADES (con reunión vinculada)
${JSON.stringify(oportunidadesConReunion, null, 2)}

## TAREAS ACTIVAS EN EL SISTEMA
${JSON.stringify(tareas.data ?? [], null, 2)}

## ESTADO FINANCIERO (contexto para reuniones bancarias/contables)
### Últimos movimientos de caja
${JSON.stringify(cajaMov.data ?? [], null, 2)}
### Préstamos activos
${JSON.stringify(cfPrestamos.data ?? [], null, 2)}

## CURSOS ACTIVOS (contexto para reuniones de cursos/instructores)
${JSON.stringify(cursosActivos.data ?? [], null, 2)}

${reunionFoco ? `## REUNIÓN EN FOCO\n${JSON.stringify(reunionFoco, null, 2)}` : ""}

## CÓMO RESPONDER
- Si te preguntan por una reunión específica: buscá por título, fecha o participantes y respondé con detalles
- Si te preguntan por compromisos pendientes: listá los que tienen responsable y fecha, priorizando los más próximos
- Si te preguntan para preparar una reunión: buscá contexto relevante (finanzas, cursos, oportunidades) y generá agenda + preguntas clave
- Si te preguntan qué pasó con algo: cruzá decisiones y tareas extraídas de múltiples reuniones
- Si una oportunidad tiene reunión vinculada: conectá lo que se decidió con el estado actual de la oportunidad`;

    const historialReciente = historial.slice(-10);

    const limite = await chequearLimiteIA(supabase, user.email ?? null);
    if (limite.bloqueado) {
      return new Response(JSON.stringify({ respuesta: limite.mensaje }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 3000,
        system: sistema,
        messages: [...historialReciente, { role: "user", content: message }],
      }),
    });

    const data = await res.json();
    if (data.type === "error") throw new Error(data.error?.message ?? "API error");
    const respuesta = data.content?.[0]?.text ?? "No pude generar una respuesta.";

    if (data.usage) {
      try {
        await supabase.from("ia_uso").insert({
          funcion: "agente-reuniones", modelo: data.model || null,
          input_tokens: data.usage.input_tokens || 0, output_tokens: data.usage.output_tokens || 0,
          organizacion_id: limite.organizacionId, usuario_id: limite.usuarioId,
        });
      } catch (_) {}
    }

    return new Response(JSON.stringify({ respuesta }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
