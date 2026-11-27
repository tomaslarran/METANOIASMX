// Conector «Metanoia» para Claude (escritorio, web y celular) — servidor MCP remoto. 27 Nov 2026.
// Cada administrador lo agrega en Claude: Personalizar → Conectores → Agregar conector personalizado,
// con la dirección https://jppxmdvddvbsvymogvcp.supabase.co/functions/v1/metanoia-mcp
// El inicio de sesión es el del panel (Supabase Auth como servidor OAuth 2.1; página de permiso: oauth-consent.html).
// Consultas: asistente_consulta() (sql_asistente_admin.sql). Cambios: proponer → confirmar → deshacer, con lista cerrada de campos y registro en asistente_cambios (sql_asistente_cambios.sql).
// En Supabase esta función va con "Verify JWT" DESACTIVADO: ella misma valida el token del usuario.
import { createClient } from "npm:@supabase/supabase-js@2";
import { createMcpHandler, McpServer } from "npm:@modelcontextprotocol/server@^2.0.0";
import { z } from "npm:zod@^4.3.6";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RECURSO = `${SUPABASE_URL}/functions/v1/metanoia-mcp`;   // dirección pública del conector
const METADATA = `${RECURSO}/oauth-protected-resource`;
const MAX_FILAS = 500;
const MAX_CARACTERES = 120000; // Claude acepta ~150.000 caracteres por resultado de herramienta

const CONTEXTO = `# Metanoia SMX — cómo leer la base
Panel interno de Metanoia SMX (capacitación médica en simulación, Salta, Argentina). Se consulta con consultar; los cambios puntuales van con proponer_cambio + confirmar_cambio (ver abajo).

- Dos sociedades: SUDES (SUDES S.A.S., cursos de simulación) y POINTERS (POINTERS S.A.S., logística/servicios). Casi todas las tablas tienen la columna sociedad = 'SUDES' o 'POINTERS'.
- Ejercicio contable: del 01/07 al 30/06. El actual empezó el 01/07/2026. Las facturas de compra con estado 'cerrado' son del ejercicio anterior.
- Moneda: pesos argentinos, salvo columnas o tablas en USD.
- Presentá montos como $1.234.567,89 y fechas dd/mm/aaaa.

## Tablas principales (usá listar_tablas para ver todas y describir_tabla antes de consultar una que no conocés)
- Contabilidad: asientos_contables (fecha, sociedad, tipo, origen, origen_id, descripcion, anulado) + asientos_movimientos (asiento_id, cuenta_id, debe, haber) + plan_cuentas (id, codigo, nombre, sociedad; cada sociedad tiene su propio plan). EXCLUÍ SIEMPRE los asientos con anulado = true. Saldo de una cuenta = suma de debe − haber en asientos no anulados.
- Ventas: facturas_emitidas (ambiente 'produccion' = reales; 'homologacion' = pruebas, excluilas; las notas de crédito restan), recibos, recibo_facturas, clientes.
- Compras: comprobantes_compra (facturas de proveedores: proveedor, cuit, tipo, fecha, total, estado, monto_pagado, sociedad), comprobante_pagos, ordenes_pago (con retenciones de Ganancias), proveedores, anticipos_proveedores.
- Tesorería: banco_movimientos (extracto del banco; importe negativo = débito), caja_movimientos (tipo 'ingreso'/'egreso', moneda), medios_pago, echeqs_propios, cf_cobranzas (cheques y cobros), cf_prestamos, cf_inversiones, cf_inversiones_movimientos.
- Impuestos: impuestos_vep, calendario_impositivo. Sueldos: cf_empleados, cf_pagos_empleados. Bienes de uso: bienes_uso, bienes_uso_amortizaciones.
- Cursos: cursos, inscripciones, alumnos, instructores, curso_instructores, nps_respuestas.
- Otros: tareas, reuniones, oportunidades, mensajes_publico (chats del bot con el público), usuarios (equipo).

## Reglas
- No inventes datos: todo número sale de una consulta. Si algo no está, decilo.
- Para reportes (Excel, PDF, gráficos), traé los datos con consultar y armá el archivo vos.

## Cambios de datos (con confirmación)
Se pueden corregir datos puntuales con proponer_cambio → el usuario confirma → confirmar_cambio. Nunca se borra nada y todo se puede deshacer (deshacer_cambio).
1. Buscá el registro con consultar (necesitás su id) y verificá que sea el correcto.
2. Llamá a proponer_cambio con el motivo en palabras del usuario. Si un cambio necesita tocar varias filas a la vez (ej. la fecha de un pago y la del asiento de ese pago), mandalas juntas en el mismo pedido.
3. Mostrale al usuario el antes → después y los avisos que devuelve, y PREGUNTALE si lo aplicás. Solo con un "sí" explícito llamá a confirmar_cambio. Nunca confirmes por tu cuenta.
4. Después contale qué cambió y que se puede deshacer pidiéndolo.

Qué se puede cambiar (lista cerrada, la herramienta rechaza el resto):
- Datos generales: tareas, cursos (no su estado ni aprobaciones), alumnos, instructores, inscripciones (estado y notas), proveedores (no el CUIT), clientes, oportunidades, inventario (no el stock), rutinas, notas y vencimientos de facturas de compra, cobranzas y VEP. Se pueden dar de alta tareas, alumnos, instructores y oportunidades.
- Correcciones contables puntuales: anular o reactivar un asiento (asientos_contables.anulado) y corregir su fecha o descripción; fecha, N° de operación u observaciones de un pago (comprobante_pagos) u orden de pago; marcar un movimiento del banco como conciliado o cambiar su categoría; fecha, concepto, categoría u observaciones de un movimiento de caja. Al corregir la fecha de un pago, corregí también la fecha de su asiento (asientos_contables con origen_id = id del pago u orden).

Lo que NO se hace por acá (explicá el botón del panel):
- Pagar una factura: Comprobantes o Cash Flow → Pendientes de pago → 💳 Pagar (directo) o 📄 Generar OP y después 💸 Pagar OP (si lleva retención de Ganancias).
- Cargar una factura de compra: Comprobantes → subir el PDF (lee el QR de ARCA) o Importar de ARCA.
- Emitir una factura o nota de crédito: Contabilidad → Facturas emitidas → + Emitir factura. Recibo de cobro: Facturas emitidas → Recibos de cobro.
- Cambiar el medio de un pago o el importe: hay que revertir y volver a pagar desde el panel (cuotas de préstamo: ✎ en el cronograma).
- Asientos nuevos, ajustes o regenerar asientos: Impuestos → Libro Diario (🔄 Generar históricos, 🔁 Regenerar devengados).
- VEP: Impuestos → VEPs. Extractos: Cash Flow → Conciliación. Cierre de mes: Cash Flow → 🔒 Cierre de mes. Amortización: Contabilidad → Bienes de uso.
- Usuarios, roles y permisos: módulo Usuarios.`;

// ── Lista cerrada de lo que se puede modificar por el conector ──
// Nivel 1: datos generales. Nivel 2: correcciones contables puntuales. Lo demás se hace desde el panel.
const EDITABLE: Record<string, string[]> = {
  tareas: ["nombre", "descripcion", "status", "prioridad", "assignee_id", "assignees", "fecha_inicio", "fecha_vencimiento", "hora_inicio", "notas", "categoria", "tipo"],
  cursos: ["nombre", "modalidad", "fecha_inicio", "fecha_fin", "duracion_horas", "cupos_max", "arancel", "descuento_colegio", "instructor_nombre", "respaldo_institucional", "descripcion", "descripcion_clases", "publico_objetivo", "texto_participacion", "lugar_diploma", "linea_negocio"],
  alumnos: ["nombre", "apellido", "dni", "cuit", "matricula", "especialidad", "email", "telefono", "institucion", "notas"],
  instructores: ["nombre", "apellido", "especialidad", "matricula", "email", "telefono", "institucion", "activo", "notas", "genero"],
  inscripciones: ["estado", "notas"],
  proveedores: ["nombre", "tipo", "especialidad", "email", "telefono", "notas", "activo", "condicion_iva", "domicilio", "provincia", "cp", "revisado", "situacion_iibb", "iibb_cert_no_retencion_hasta", "cbu", "alias_cbu", "banco_cuenta", "titular_cuenta"],
  clientes: ["razon_social", "nombre_fantasia", "condicion_iva_id", "tipo_persona", "email", "email_cc", "telefono", "domicilio", "localidad", "provincia", "cp", "retiene_ganancias", "retiene_iva", "retiene_iibb", "retiene_suss", "notas", "activo"],
  clientes_sociedad: ["condicion_pago", "notas", "activo"],
  oportunidades: ["idea_cruda", "definicion", "linea_negocio", "audiencia", "encaje_estrategico", "primer_paso", "ejecutor", "decisor", "recursos", "criterio_exito", "riesgos", "estado", "tipo"],
  inventario: ["nombre", "fabricante", "categoria", "deposito", "fecha_vencimiento", "observaciones"],
  rutinas: ["activa", "notas", "prioridad", "assignee_id", "assignees", "dias_antes_aviso"],
  comprobantes_compra: ["notas", "fecha_vencimiento", "en_calendario"],
  cf_cobranzas: ["notas", "fecha_vencimiento"],
  impuestos_vep: ["observaciones", "numero_vep", "fecha_vencimiento"],
  // Nivel 2 — correcciones contables puntuales
  asientos_contables: ["anulado", "fecha", "descripcion"],
  comprobante_pagos: ["fecha", "nro_operacion", "observaciones"],
  ordenes_pago: ["fecha_pago", "nro_operacion", "observaciones", "nro_comprobante_retencion", "cbu_destino"],
  banco_movimientos: ["conciliado", "categoria"],
  caja_movimientos: ["fecha", "concepto", "categoria", "observaciones"],
};
const ALTA: Record<string, string[]> = { // tablas donde se puede crear una fila y campos obligatorios
  tareas: ["nombre"],
  alumnos: ["nombre", "apellido"],
  instructores: ["nombre"],
  oportunidades: ["idea_cruda"],
};
const CONTABLES = new Set(["asientos_contables", "comprobante_pagos", "ordenes_pago", "banco_movimientos", "caja_movimientos"]);
const CAMPO_FECHA: Record<string, string> = { asientos_contables: "fecha", comprobante_pagos: "fecha", ordenes_pago: "fecha_pago", banco_movimientos: "fecha", caja_movimientos: "fecha" };
const ETIQUETAS = ["nombre", "apellido", "razon_social", "descripcion", "concepto", "numero", "proveedor", "idea_cruda", "tipo", "sociedad", "fecha", "fecha_pago", "importe", "monto", "total"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VENCE_MIN = 30; // una propuesta sin confirmar vence a los 30 minutos

type Op = { tabla: string; id?: string; accion: "modificar" | "alta"; antes: Record<string, unknown>; despues: Record<string, unknown>; etiqueta?: string };
const norm = (v: unknown) => (v === undefined || v === null || v === "") ? null : (typeof v === "object" ? JSON.stringify(v) : String(v));
const igual = (a: unknown, b: unknown) => norm(a) === norm(b);
const fmt = (v: unknown) => v === null || v === undefined || v === "" ? "(vacío)" : (typeof v === "object" ? JSON.stringify(v) : String(v));

const json = (obj: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...extra } });

function noAutorizado(error = "invalid_token") {
  return json({ error }, 401, {
    "WWW-Authenticate": `Bearer error="${error}", resource_metadata="${METADATA}"`,
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // 1) Metadatos del recurso protegido (descubrimiento OAuth de Claude)
  if (req.method === "GET" && /oauth-protected-resource\/?$/.test(url.pathname)) {
    return json({
      resource: RECURSO,
      authorization_servers: [`${SUPABASE_URL}/auth/v1`],
      bearer_methods_supported: ["header"],
      resource_name: "Metanoia SMX",
    });
  }

  // 2) Token del usuario (emitido por el inicio de sesión del panel)
  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return noAutorizado("invalid_request");

  const supabaseUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user } } = await supabaseUser.auth.getUser(token);
  if (!user?.email) return noAutorizado();

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: usuario } = await admin.from("usuarios").select("id,nombre,rol,estado").ilike("email", user.email).maybeSingle();
  if (!usuario || usuario.rol !== "admin" || ["inactivo","suspendido"].includes(usuario.estado)) {
    return json({ error: "insufficient_scope", error_description: "El conector Metanoia es solo para administradores del panel." }, 403);
  }

  // Registro de cada consulta (no corta la respuesta si falla)
  const registrar = async (herramienta: string, sql: string | null, filas: number | null, error: string | null) => {
    try {
      await admin.from("asistente_consultas_log").insert({
        canal: "conector", usuario_id: usuario.id, usuario_email: user.email, herramienta, sql, filas, error,
      });
    } catch (_) { /* sin registro, sigue */ }
  };

  const correrSQL = async (sql: string) => {
    const { data, error } = await supabaseUser.rpc("asistente_consulta", { consulta: sql });
    if (error) throw new Error(error.message);
    const filas = Array.isArray(data) ? data : [];
    const recortado = filas.length > MAX_FILAS;
    return { filas: recortado ? filas.slice(0, MAX_FILAS) : filas, recortado };
  };
  const texto = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
  const error = (t: string) => ({ content: [{ type: "text" as const, text: t }], isError: true });

  // 3) Servidor MCP (uno nuevo por pedido: las funciones no guardan estado)
  const handler = createMcpHandler(() => {
    const server = new McpServer({ name: "metanoia", version: "1.1.0" });

    server.registerTool(
      "contexto_metanoia",
      {
        description: "Explica cómo está organizada la base de Metanoia SMX (sociedades, ejercicio contable, tablas principales y reglas). Usala al empezar una conversación sobre los datos del panel.",
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true },
      },
      async () => texto(CONTEXTO),
    );

    server.registerTool(
      "listar_tablas",
      {
        description: "Lista las tablas de la base de Metanoia SMX que se pueden consultar, con la cantidad aproximada de filas.",
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true },
      },
      async () => {
        try {
          const { filas } = await correrSQL(
            "select c.relname as tabla, greatest(c.reltuples,0)::bigint as filas_aprox from pg_class c join pg_namespace n on n.oid=c.relnamespace " +
            "where n.nspname='public' and c.relkind in ('r','p','v','m') and has_table_privilege('asistente_lector', c.oid, 'SELECT') order by 1",
          );
          await registrar("listar_tablas", null, filas.length, null);
          return texto(JSON.stringify(filas));
        } catch (e) {
          await registrar("listar_tablas", null, null, String((e as Error).message));
          return error(`Error de la base: ${(e as Error).message}`);
        }
      },
    );

    server.registerTool(
      "describir_tabla",
      {
        description: "Muestra las columnas (nombre y tipo) de una tabla de la base de Metanoia SMX. Usala antes de consultar una tabla que no conocés.",
        inputSchema: z.object({ tabla: z.string().regex(/^[a-z_][a-z0-9_]*$/).describe("Nombre de la tabla, ej. comprobantes_compra") }),
        annotations: { readOnlyHint: true },
      },
      async ({ tabla }) => {
        try {
          const { filas } = await correrSQL(
            `select column_name as columna, data_type as tipo, is_nullable as acepta_vacio from information_schema.columns ` +
            `where table_schema='public' and table_name='${tabla}' order by ordinal_position`,
          );
          await registrar("describir_tabla", tabla, filas.length, null);
          if (!filas.length) return error(`La tabla ${tabla} no existe o no se puede consultar.`);
          return texto(JSON.stringify(filas));
        } catch (e) {
          return error(`Error de la base: ${(e as Error).message}`);
        }
      },
    );

    server.registerTool(
      "consultar",
      {
        description: `Ejecuta UNA consulta SQL de solo lectura (SELECT o WITH) en la base PostgreSQL de Metanoia SMX y devuelve las filas en JSON (máximo ${MAX_FILAS}). No acepta INSERT, UPDATE, DELETE ni varias consultas separadas por punto y coma. Filtrá y agrupá en SQL para traer solo lo necesario.`,
        inputSchema: z.object({ sql: z.string().min(1).describe("Consulta SELECT o WITH, sin punto y coma al final") }),
        annotations: { readOnlyHint: true },
      },
      async ({ sql }) => {
        try {
          const { filas, recortado } = await correrSQL(sql);
          await registrar("consultar", sql, filas.length, null);
          let t = JSON.stringify(filas);
          if (t.length > MAX_CARACTERES) t = t.slice(0, MAX_CARACTERES) + " …[resultado recortado: agregá filtros o agrupá]";
          if (recortado) t += `\n[Se muestran las primeras ${MAX_FILAS} filas; hay más.]`;
          return texto(t);
        } catch (e) {
          const msg = String((e as Error).message || e);
          await registrar("consultar", sql, null, msg);
          return error(`Error de la base: ${msg}`);
        }
      },
    );

    // ── Cambios de datos ──────────────────────────────────────────────
    const etiquetaDe = (tabla: string, fila: Record<string, unknown>) =>
      `${tabla}: ` + ETIQUETAS.filter((k) => fila[k] !== undefined && fila[k] !== null && fila[k] !== "").slice(0, 4)
        .map((k) => `${k}=${String(fila[k]).slice(0, 60)}`).join(" · ");

    const mesCerrado = async (sociedad: unknown, fecha: unknown) => {
      if (!sociedad || !fecha) return false;
      const { data } = await admin.from("cierres_mensuales").select("estado").eq("sociedad", String(sociedad))
        .eq("periodo", String(fecha).slice(0, 7)).maybeSingle();
      return data?.estado === "cerrado";
    };

    const resumenOps = (ops: Op[]) => ops.map((o, i) => {
      const campos = Object.keys(o.despues);
      const det = o.accion === "alta"
        ? campos.map((k) => `   ${k}: ${fmt(o.despues[k])}`).join("\n")
        : campos.map((k) => `   ${k}: ${fmt(o.antes[k])}  →  ${fmt(o.despues[k])}`).join("\n");
      return `${i + 1}. ${o.accion === "alta" ? "ALTA en " + o.tabla : (o.etiqueta || o.tabla) + ` (id ${o.id})`}\n${det}`;
    }).join("\n");

    server.registerTool(
      "proponer_cambio",
      {
        description: "Prepara un cambio de datos SIN aplicarlo: valida que esté permitido, lee los valores actuales y devuelve el antes → después y un cambio_id. Después tenés que mostrárselo al usuario y pedirle confirmación; solo con su OK llamás a confirmar_cambio. Admite varias operaciones juntas (se aplican todas o ninguna). Ver la lista de lo permitido en contexto_metanoia.",
        inputSchema: z.object({
          motivo: z.string().min(3).describe("Qué pidió el usuario y por qué, en sus palabras"),
          operaciones: z.array(z.object({
            tabla: z.string().describe("Tabla, ej. tareas"),
            accion: z.enum(["modificar", "alta"]).default("modificar"),
            id: z.string().optional().describe("id (uuid) de la fila a modificar; no va en altas"),
            campos: z.record(z.string(), z.unknown()).describe("Campos con su valor nuevo, ej. {\"fecha\":\"2026-10-15\"}"),
          })).min(1).max(20),
        }),
        annotations: { readOnlyHint: false, destructiveHint: false },
      },
      async ({ motivo, operaciones }) => {
        try {
          const ops: Op[] = [];
          const avisos: string[] = [];
          for (const [i, o] of operaciones.entries()) {
            const n = `Operación ${i + 1}`;
            const permitidos = EDITABLE[o.tabla];
            if (!permitidos) return error(`${n}: la tabla "${o.tabla}" no se puede modificar por el conector. Explicale al usuario cómo hacerlo desde el panel.`);
            const claves = Object.keys(o.campos || {});
            if (!claves.length) return error(`${n}: no indicaste ningún campo.`);
            const prohibidos = claves.filter((k) => !permitidos.includes(k));
            if (prohibidos.length) return error(`${n}: no se pueden cambiar ${prohibidos.join(", ")} en ${o.tabla}. Campos permitidos: ${permitidos.join(", ")}.`);

            if (o.accion === "alta") {
              if (!ALTA[o.tabla]) return error(`${n}: no se pueden dar de alta filas en ${o.tabla} por el conector.`);
              const faltan = ALTA[o.tabla].filter((k) => o.campos[k] === undefined || o.campos[k] === null || o.campos[k] === "");
              if (faltan.length) return error(`${n}: para dar de alta en ${o.tabla} falta ${faltan.join(", ")}.`);
              ops.push({ tabla: o.tabla, accion: "alta", antes: {}, despues: o.campos });
              continue;
            }

            if (!o.id || !UUID.test(o.id)) return error(`${n}: falta el id (uuid) de la fila a modificar. Buscalo con consultar.`);
            const { data: fila, error: eF } = await admin.from(o.tabla).select("*").eq("id", o.id).maybeSingle();
            if (eF) return error(`${n}: ${eF.message}`);
            if (!fila) return error(`${n}: no existe una fila de ${o.tabla} con id ${o.id}.`);
            const antes: Record<string, unknown> = {};
            const despues: Record<string, unknown> = {};
            for (const k of claves) {
              if (!igual(fila[k], o.campos[k])) { antes[k] = fila[k] ?? null; despues[k] = o.campos[k]; }
            }
            if (!Object.keys(despues).length) { avisos.push(`${n}: ${etiquetaDe(o.tabla, fila)} ya tiene esos valores; se omite.`); continue; }
            ops.push({ tabla: o.tabla, id: o.id, accion: "modificar", antes, despues, etiqueta: etiquetaDe(o.tabla, fila) });

            if (CONTABLES.has(o.tabla)) {
              const cf = CAMPO_FECHA[o.tabla];
              const fechas = new Set([fila[cf], despues[cf]].filter(Boolean));
              for (const f of fechas) {
                if (await mesCerrado(fila.sociedad, f)) avisos.push(`${n}: el mes ${String(f).slice(0, 7)} de ${fila.sociedad} está CERRADO en 🔒 Cierre de mes; el cambio lo modifica después del cierre.`);
              }
              if (o.tabla === "asientos_contables" && "anulado" in despues) {
                avisos.push(`${n}: ${despues.anulado ? "anular" : "reactivar"} el asiento cambia los saldos contables de ${fila.sociedad}.`);
              }
              if ((o.tabla === "comprobante_pagos" || o.tabla === "ordenes_pago") && cf in despues) {
                const { count } = await admin.from("asientos_contables").select("id", { count: "exact", head: true })
                  .eq("origen_id", o.id).eq("anulado", false);
                const enPedido = operaciones.some((x) => x.tabla === "asientos_contables" && "fecha" in (x.campos || {}));
                if (count && !enPedido) avisos.push(`${n}: hay ${count} asiento(s) de este pago con la fecha vieja; conviene corregir también su fecha en el mismo pedido.`);
              }
            }
          }
          if (!ops.length) return texto(`No hay nada que cambiar.\n${avisos.join("\n")}`);

          const { data: cambio, error: eC } = await admin.from("asistente_cambios")
            .insert({ canal: "conector", usuario_id: usuario.id, usuario_email: user.email, motivo, operaciones: ops })
            .select("id").single();
          if (eC) return error(`No se pudo registrar la propuesta: ${eC.message}`);
          await registrar("proponer_cambio", cambio.id, ops.length, null);
          return texto(
            `PROPUESTA (todavía NO aplicada) — cambio_id: ${cambio.id}\nMotivo: ${motivo}\n\n${resumenOps(ops)}` +
            (avisos.length ? `\n\nAvisos:\n- ${avisos.join("\n- ")}` : "") +
            `\n\nMostrale esto al usuario y preguntale si lo aplicás. Con su OK, llamá a confirmar_cambio con este cambio_id (vence en ${VENCE_MIN} minutos).`,
          );
        } catch (e) {
          return error(`Error: ${(e as Error).message}`);
        }
      },
    );

    server.registerTool(
      "confirmar_cambio",
      {
        description: "Aplica un cambio propuesto con proponer_cambio. SOLO llamala después de que el usuario dijo explícitamente que sí en esta conversación. Verifica que nadie haya tocado esos datos mientras tanto.",
        inputSchema: z.object({ cambio_id: z.string().regex(UUID) }),
        annotations: { readOnlyHint: false, destructiveHint: true },
      },
      async ({ cambio_id }) => {
        const { data: c } = await admin.from("asistente_cambios").select("*").eq("id", cambio_id).maybeSingle();
        if (!c) return error("No existe ese cambio.");
        if (c.usuario_id !== usuario.id) return error("Ese cambio lo propuso otro usuario.");
        if (c.estado !== "propuesto") return error(`Ese cambio ya está ${c.estado}.`);
        if (Date.now() - new Date(c.created_at).getTime() > VENCE_MIN * 60000) {
          await admin.from("asistente_cambios").update({ estado: "cancelado", error: "vencido" }).eq("id", cambio_id);
          return error(`La propuesta venció (más de ${VENCE_MIN} minutos). Volvé a proponerla.`);
        }
        const ops = c.operaciones as Op[];

        // 1) Nadie cambió esos datos desde la propuesta
        for (const o of ops) {
          if (o.accion !== "modificar") continue;
          const { data: fila } = await admin.from(o.tabla).select(Object.keys(o.antes).join(",")).eq("id", o.id!).maybeSingle();
          const dif = !fila ? ["la fila ya no existe"] : Object.keys(o.antes).filter((k) => !igual((fila as unknown as Record<string, unknown>)[k], o.antes[k]));
          if (dif.length) {
            await admin.from("asistente_cambios").update({ estado: "fallido", error: `cambió antes de confirmar: ${o.tabla} ${o.id} ${dif.join(",")}` }).eq("id", cambio_id);
            return error(`No se aplicó nada: ${o.etiqueta || o.tabla} cambió desde la propuesta (${dif.join(", ")}). Volvé a consultar y proponer.`);
          }
        }

        // 2) Aplicar; si algo falla, se vuelve atrás lo ya aplicado
        const hechas: Op[] = [];
        try {
          for (const o of ops) {
            if (o.accion === "alta") {
              const { data, error: e } = await admin.from(o.tabla).insert(o.despues).select("*").single();
              if (e) throw new Error(`${o.tabla}: ${e.message}`);
              o.id = data.id;
              o.despues = Object.fromEntries(Object.keys(o.despues).map((k) => [k, data[k]]));
            } else {
              const { data, error: e } = await admin.from(o.tabla).update(o.despues).eq("id", o.id!).select(Object.keys(o.despues).join(",")).single();
              if (e) throw new Error(`${o.etiqueta || o.tabla}: ${e.message}`);
              o.despues = data as unknown as Record<string, unknown>; // valor real guardado (ej. horas con segundos)
            }
            hechas.push(o);
          }
        } catch (e) {
          for (const o of hechas.reverse()) {
            if (o.accion === "alta") await admin.from(o.tabla).delete().eq("id", o.id!);
            else await admin.from(o.tabla).update(o.antes).eq("id", o.id!);
          }
          const msg = (e as Error).message;
          await admin.from("asistente_cambios").update({ estado: "fallido", error: msg }).eq("id", cambio_id);
          await registrar("confirmar_cambio", cambio_id, null, msg);
          return error(`No se aplicó nada (se volvió atrás): ${msg}`);
        }
        await admin.from("asistente_cambios").update({ estado: "aplicado", aplicado_en: new Date().toISOString(), operaciones: ops }).eq("id", cambio_id);
        await registrar("confirmar_cambio", cambio_id, ops.length, null);
        return texto(`✅ Cambio aplicado (cambio_id ${cambio_id}).\n\n${resumenOps(ops)}\n\nSe puede deshacer con deshacer_cambio.`);
      },
    );

    server.registerTool(
      "deshacer_cambio",
      {
        description: "Deshace un cambio ya aplicado por el conector: vuelve los valores anteriores (y saca las filas que se dieron de alta). Solo si nadie volvió a modificar esos datos después. Pedile confirmación al usuario antes.",
        inputSchema: z.object({ cambio_id: z.string().regex(UUID) }),
        annotations: { readOnlyHint: false, destructiveHint: true },
      },
      async ({ cambio_id }) => {
        const { data: c } = await admin.from("asistente_cambios").select("*").eq("id", cambio_id).maybeSingle();
        if (!c) return error("No existe ese cambio.");
        if (c.estado !== "aplicado") return error(`Solo se deshace un cambio aplicado; este está ${c.estado}.`);
        const ops = c.operaciones as Op[];
        for (const o of ops) {
          const { data: fila } = await admin.from(o.tabla).select(Object.keys(o.despues).join(",")).eq("id", o.id!).maybeSingle();
          const dif = !fila ? ["la fila ya no existe"] : Object.keys(o.despues).filter((k) => !igual((fila as unknown as Record<string, unknown>)[k], o.despues[k]));
          if (dif.length) return error(`No se deshizo nada: ${o.etiqueta || o.tabla} se volvió a modificar después (${dif.join(", ")}). Hay que corregirlo a mano.`);
        }
        for (const o of [...ops].reverse()) {
          const { error: e } = o.accion === "alta"
            ? await admin.from(o.tabla).delete().eq("id", o.id!)
            : await admin.from(o.tabla).update(o.antes).eq("id", o.id!);
          if (e) {
            await registrar("deshacer_cambio", cambio_id, null, e.message);
            return error(`Falló al deshacer ${o.etiqueta || o.tabla}: ${e.message}. Revisalo a mano (puede haber quedado a medias).`);
          }
        }
        await admin.from("asistente_cambios").update({ estado: "deshecho", deshecho_en: new Date().toISOString(), deshecho_por: user.email }).eq("id", cambio_id);
        await registrar("deshacer_cambio", cambio_id, ops.length, null);
        const det = ops.map((o, i) => o.accion === "alta"
          ? `${i + 1}. Se quitó la fila dada de alta en ${o.tabla} (id ${o.id}).`
          : resumenOps([{ ...o, antes: o.despues, despues: o.antes }]).replace(/^1\./, `${i + 1}.`)).join("\n");
        return texto(`↩ Cambio deshecho (cambio_id ${cambio_id}). Volvieron los valores anteriores:\n\n${det}`);
      },
    );

    server.registerTool(
      "listar_cambios",
      {
        description: "Lista los últimos cambios de datos hechos o propuestos por el conector (de todos los administradores), con su estado y cambio_id.",
        inputSchema: z.object({ cantidad: z.number().int().min(1).max(50).default(15) }),
        annotations: { readOnlyHint: true },
      },
      async ({ cantidad }) => {
        const { data, error: e } = await admin.from("asistente_cambios")
          .select("id,usuario_email,motivo,estado,operaciones,created_at,aplicado_en,deshecho_en,deshecho_por,error")
          .order("created_at", { ascending: false }).limit(cantidad);
        if (e) return error(e.message);
        return texto(JSON.stringify((data || []).map((c) => ({ ...c, operaciones: (c.operaciones as Op[]).map((o) => ({ tabla: o.tabla, id: o.id, accion: o.accion, antes: o.antes, despues: o.despues })) }))));
      },
    );

    return server;
  });

  return handler.fetch(req);
});
