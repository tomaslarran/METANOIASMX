// Asistente Claude para administradores — fase 1: solo consultas (27 Nov 2026).
// Claude decide qué consultar con herramientas de lectura; las consultas corren en Postgres
// con asistente_consulta() (rol de solo lectura, ver sql_asistente_admin.sql).
// Esta fase NO modifica datos.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

const cors = {
  "Access-Control-Allow-Origin": "https://tomaslarran.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

const MODELO = "claude-opus-5-5";
const MAX_VUELTAS = 10;          // llamadas a Claude por pregunta
const MAX_FILAS = 500;           // filas devueltas por consulta
const MAX_CARACTERES = 60000;    // tope del resultado que ve Claude por consulta

// Chequea el límite mensual de tokens de IA de la organización y del usuario (igual que los demás agentes).
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
    const { data } = await supabase.from("usuarios").select("id,nombre,rol,estado,organizacion_id,limite_tokens_mensual").ilike("email", email).maybeSingle();
    usuario = data;
  }
  let organizacionId: string | null = usuario?.organizacion_id ?? null;
  let organizacion: any = null;
  if (organizacionId) {
    const { data } = await supabase.from("organizaciones").select("id,limite_tokens_mensual").eq("id", organizacionId).maybeSingle();
    organizacion = data;
  } else {
    const { data } = await supabase.from("organizaciones").select("id,limite_tokens_mensual").limit(1).maybeSingle();
    organizacion = data;
    organizacionId = organizacion?.id ?? null;
  }
  const suma = (rows: any[]) => (rows || []).reduce((s: number, r: any) =>
    s + (r.input_tokens || 0) + (r.output_tokens || 0) + (r.cache_creation_input_tokens || 0) + (r.cache_read_input_tokens || 0), 0);
  if (organizacion?.limite_tokens_mensual) {
    const { data } = await supabase.from("ia_uso").select("input_tokens,output_tokens,cache_creation_input_tokens,cache_read_input_tokens").eq("organizacion_id", organizacionId).gte("created_at", inicioMesISO);
    if (suma(data) >= organizacion.limite_tokens_mensual) {
      return { bloqueado: true, mensaje: `Se alcanzó el límite mensual de uso de IA de la organización. Se renueva el ${renuevaStr}.`, usuario, organizacionId };
    }
  }
  if (usuario?.limite_tokens_mensual) {
    const { data } = await supabase.from("ia_uso").select("input_tokens,output_tokens,cache_creation_input_tokens,cache_read_input_tokens").eq("usuario_id", usuario.id).gte("created_at", inicioMesISO);
    if (suma(data) >= usuario.limite_tokens_mensual) {
      return { bloqueado: true, mensaje: `Alcanzaste tu límite mensual personal de uso de IA. Se renueva el ${renuevaStr}.`, usuario, organizacionId };
    }
  }
  return { bloqueado: false, mensaje: null as string | null, usuario, organizacionId };
}

// Instrucciones fijas (se cachean). Lo que cambia en cada pedido va en un bloque aparte, después.
const SISTEMA = `Sos el asistente de datos del panel interno de Metanoia SMX (capacitación médica en simulación, Salta, Argentina). Te consultan los administradores (Tomás, Mario, Valentina, Amparo). Respondés en español rioplatense, claro y directo, sin jerga técnica.

# Qué podés hacer
Consultar la base de datos (PostgreSQL de Supabase) con tus herramientas y responder con datos reales. En esta etapa SOLO LEÉS: no podés modificar nada. Si te piden un cambio, explicá qué habría que cambiar y desde qué pantalla del panel se hace; aclarale que los cambios desde el asistente llegan en la próxima etapa.

# Cómo trabajar
- Nunca inventes un dato. Todo número que des tiene que salir de una consulta. Si no lo encontrás, decilo.
- Si no conocés una tabla o sus columnas, usá listar_tablas y describir_tabla antes de consultar. No adivines nombres de columnas.
- Hacé consultas acotadas (filtrá, agregá con SUM/COUNT, usá LIMIT). Cada consulta devuelve como máximo ${MAX_FILAS} filas.
- Si una consulta da error, leé el mensaje, corregí y volvé a intentar.
- Si el pedido es ambiguo (qué sociedad, qué período), preguntá antes de consultar, salvo que haya una lectura obvia; en ese caso decí qué supusiste.
- Al final contestá con la respuesta, no con el proceso. Mostrá los números en formato argentino ($1.234.567,89) y las fechas como dd/mm/aaaa. Usá tablas en Markdown cuando ayuden.
- No muestres el SQL salvo que te lo pidan (el panel ya muestra aparte las consultas que hiciste).

# El negocio
- Dos sociedades: SUDES (SUDES S.A.S., cursos de simulación) y POINTERS (POINTERS S.A.S., logística/servicios). Casi todas las tablas tienen la columna sociedad con 'SUDES' o 'POINTERS'.
- El ejercicio contable va del 01/07 al 30/06. El ejercicio actual empezó el 01/07/2026. Las facturas de compra con estado 'cerrado' son del ejercicio anterior (archivadas).
- Moneda: pesos argentinos, salvo columnas o tablas que digan USD.

# Tablas principales (puede haber más: usá listar_tablas)
- Contabilidad: asientos_contables (fecha, sociedad, tipo, origen, origen_id, descripcion, anulado) + asientos_movimientos (asiento_id, cuenta_id, debe, haber) + plan_cuentas (id, codigo, nombre, sociedad: cada sociedad tiene su propio plan). IMPORTANTE: siempre excluí los asientos con anulado = true. El saldo de una cuenta es la suma de debe − haber de sus movimientos en asientos no anulados.
- Compras: comprobantes_compra (facturas de proveedores: proveedor, cuit, tipo, fecha, total, estado, monto_pagado, sociedad), comprobante_pagos (cada pago o parte de pago), ordenes_pago (órdenes de pago con retención de Ganancias), proveedores, anticipos_proveedores.
- Ventas: facturas_emitidas (ambiente 'produccion' = reales, 'homologacion' = pruebas: excluí las de prueba), recibos, recibo_facturas, clientes.
- Tesorería: banco_movimientos (extracto del banco: importe negativo = débito), caja_movimientos (tipo 'ingreso'/'egreso', moneda), medios_pago, echeqs_propios, cf_cobranzas (cheques y cobros), cf_prestamos y sus cuotas, cf_inversiones y cf_inversiones_movimientos.
- Impuestos: impuestos_vep, calendario_impositivo.
- Sueldos: cf_empleados, cf_pagos_empleados.
- Bienes de uso: bienes_uso, bienes_uso_amortizaciones.
- Cursos y alumnos: cursos, inscripciones, alumnos, instructores, curso_instructores, nps_respuestas.
- Otros: tareas, reuniones, oportunidades, mensajes_publico (chats del bot con el público), usuarios (equipo).`;

const HERRAMIENTAS: any[] = [
  {
    name: "listar_tablas",
    description: "Lista las tablas de la base que podés consultar, con la cantidad aproximada de filas.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "describir_tabla",
    description: "Muestra las columnas de una tabla (nombre y tipo de dato). Usala antes de consultar una tabla que no conocés.",
    input_schema: {
      type: "object",
      properties: { tabla: { type: "string", description: "Nombre de la tabla, ej. comprobantes_compra" } },
      required: ["tabla"],
      additionalProperties: false,
    },
  },
  {
    name: "consultar",
    description: `Ejecuta UNA consulta SQL de solo lectura (SELECT o WITH) en PostgreSQL y devuelve las filas en JSON (máximo ${MAX_FILAS}). No se permiten INSERT, UPDATE, DELETE ni varias consultas separadas por punto y coma.`,
    input_schema: {
      type: "object",
      properties: {
        sql: { type: "string", description: "Consulta SELECT o WITH, sin punto y coma al final" },
        motivo: { type: "string", description: "En pocas palabras, qué buscás con esta consulta (se le muestra al usuario)" },
      },
      required: ["sql", "motivo"],
      additionalProperties: false,
    },
  },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);
  // Cliente con la sesión del usuario: las consultas corren con su identidad (y el límite de tiempo de su rol).
  const supabaseUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const { message, historial = [] } = await req.json();
    if (!message || typeof message !== "string") return json({ error: "Falta el mensaje" }, 400);

    const limite = await chequearLimiteIA(supabase, user.email ?? null);
    const usuario = limite.usuario;
    if (!usuario || usuario.rol !== "admin" || ["inactivo","suspendido"].includes(usuario.estado)) {
      return json({ respuesta: "El asistente de datos está disponible solo para administradores." }, 403);
    }
    if (limite.bloqueado) return json({ respuesta: limite.mensaje });

    const consultas: { herramienta: string; motivo: string; sql?: string; filas?: number; recortado?: boolean; error?: string }[] = [];

    const correrSQL = async (sql: string) => {
      const { data, error } = await supabaseUser.rpc("asistente_consulta", { consulta: sql });
      if (error) throw new Error(error.message);
      const filas = Array.isArray(data) ? data : [];
      const recortado = filas.length > MAX_FILAS;
      return { filas: recortado ? filas.slice(0, MAX_FILAS) : filas, recortado };
    };

    const ejecutar = async (nombre: string, input: any): Promise<{ texto: string; error: boolean }> => {
      try {
        if (nombre === "listar_tablas") {
          const { filas } = await correrSQL(
            "select c.relname as tabla, greatest(c.reltuples,0)::bigint as filas_aprox from pg_class c join pg_namespace n on n.oid=c.relnamespace " +
            "where n.nspname='public' and c.relkind in ('r','p','v','m') and has_table_privilege('asistente_lector', c.oid, 'SELECT') order by 1",
          );
          consultas.push({ herramienta: nombre, motivo: "Ver qué tablas hay", filas: filas.length });
          return { texto: JSON.stringify(filas), error: false };
        }
        if (nombre === "describir_tabla") {
          const tabla = String(input?.tabla ?? "").trim();
          if (!/^[a-z_][a-z0-9_]*$/.test(tabla)) return { texto: "Nombre de tabla inválido", error: true };
          const { filas } = await correrSQL(
            `select column_name as columna, data_type as tipo, is_nullable as acepta_vacio from information_schema.columns ` +
            `where table_schema='public' and table_name='${tabla}' order by ordinal_position`,
          );
          consultas.push({ herramienta: nombre, motivo: `Ver columnas de ${tabla}`, filas: filas.length });
          if (!filas.length) return { texto: `La tabla ${tabla} no existe o no se puede consultar.`, error: true };
          return { texto: JSON.stringify(filas), error: false };
        }
        if (nombre === "consultar") {
          const sql = String(input?.sql ?? "");
          const motivo = String(input?.motivo ?? "");
          try {
            const { filas, recortado } = await correrSQL(sql);
            consultas.push({ herramienta: nombre, motivo, sql, filas: filas.length, recortado });
            try { await supabase.from("asistente_consultas_log").insert({ canal: "panel", usuario_id: usuario.id, usuario_email: user.email, herramienta: nombre, sql, filas: filas.length }); } catch (_) { /* sin registro */ }
            let texto = JSON.stringify(filas);
            if (texto.length > MAX_CARACTERES) texto = texto.slice(0, MAX_CARACTERES) + " …[resultado recortado: agregá filtros o agrupá]";
            if (recortado) texto += `\n[Se muestran las primeras ${MAX_FILAS} filas; hay más.]`;
            return { texto, error: false };
          } catch (e) {
            const msg = String((e as Error).message || e);
            consultas.push({ herramienta: nombre, motivo, sql, error: msg });
            try { await supabase.from("asistente_consultas_log").insert({ canal: "panel", usuario_id: usuario.id, usuario_email: user.email, herramienta: nombre, sql, error: msg }); } catch (_) { /* sin registro */ }
            return { texto: `Error de la base: ${msg}`, error: true };
          }
        }
        return { texto: `Herramienta desconocida: ${nombre}`, error: true };
      } catch (e) {
        return { texto: `Error: ${String((e as Error).message || e)}`, error: true };
      }
    };

    const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });
    const hoy = new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Salta", day: "2-digit", month: "2-digit", year: "numeric" });
    const contexto = `Hoy es ${hoy}. Te escribe ${usuario.nombre || user.email} (administrador).`;

    // Historial previo solo como texto (el panel guarda las últimas respuestas).
    const messages: any[] = [];
    for (const m of (Array.isArray(historial) ? historial : []).slice(-12)) {
      if ((m?.role === "user" || m?.role === "assistant") && typeof m.content === "string" && m.content.trim()) {
        messages.push({ role: m.role, content: m.content });
      }
    }
    while (messages.length && messages[0].role !== "user") messages.shift();
    messages.push({ role: "user", content: message });

    const uso = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
    let modeloUsado: string | null = null;
    let respuesta = "";

    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      const r: any = await (client.beta.messages.create as any)({
        model: MODELO,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        system: [
          { type: "text", text: SISTEMA, cache_control: { type: "ephemeral" } },
          { type: "text", text: contexto },
        ],
        tools: HERRAMIENTAS,
        messages,
      });
      modeloUsado = r.model ?? modeloUsado;
      for (const k of Object.keys(uso) as (keyof typeof uso)[]) uso[k] += r.usage?.[k] || 0;

      if (r.stop_reason === "refusal") {
        respuesta = "No puedo responder ese pedido.";
        break;
      }
      messages.push({ role: "assistant", content: r.content });
      if (r.stop_reason === "pause_turn") continue;

      const usos = (r.content || []).filter((b: any) => b.type === "tool_use");
      if (r.stop_reason !== "tool_use" || !usos.length) {
        respuesta = (r.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
        if (r.stop_reason === "max_tokens") respuesta += "\n\n_(La respuesta quedó cortada por largo. Pedime una parte más acotada.)_";
        break;
      }
      const resultados = await Promise.all(usos.map(async (u: any) => {
        const res = await ejecutar(u.name, u.input);
        return { type: "tool_result", tool_use_id: u.id, content: res.texto, ...(res.error ? { is_error: true } : {}) };
      }));
      messages.push({ role: "user", content: resultados });
      if (vuelta === MAX_VUELTAS - 1) {
        respuesta = "Hice muchas consultas y no llegué a una respuesta. Probá con una pregunta más acotada (una sociedad, un período).";
      }
    }
    if (!respuesta) respuesta = "No pude generar una respuesta.";

    try {
      await supabase.from("ia_uso").insert({
        funcion: "asistente-admin", modelo: modeloUsado, ...uso,
        organizacion_id: limite.organizacionId, usuario_id: usuario.id,
      });
    } catch (_) { /* el registro de uso no debe cortar la respuesta */ }

    return json({ respuesta, consultas });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json({ respuesta: "Hay muchos pedidos a la IA en este momento. Probá de nuevo en un minuto." });
    if (err instanceof Anthropic.APIError && (err.status ?? 0) >= 500) return json({ respuesta: "El servicio de IA no responde en este momento. Probá de nuevo en unos segundos." });
    return json({ error: String((err as Error)?.message || err) }, 500);
  }
});
