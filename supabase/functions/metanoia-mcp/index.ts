// Conector «Metanoia» para Claude (escritorio, web y celular) — servidor MCP remoto. 27 Nov 2026.
// Cada administrador lo agrega en Claude: Personalizar → Conectores → Agregar conector personalizado,
// con la dirección https://jppxmdvddvbsvymogvcp.supabase.co/functions/v1/metanoia-mcp
// El inicio de sesión es el del panel (Supabase Auth como servidor OAuth 2.1; página de permiso: oauth-consent.html).
// Solo lectura: las consultas pasan por asistente_consulta() (ver sql_asistente_admin.sql).
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
Panel interno de Metanoia SMX (capacitación médica en simulación, Salta, Argentina). Todo es de solo lectura.

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
- Este conector no modifica nada. Si te piden un cambio, explicá qué cambiar y desde qué pantalla del panel.
- Para reportes (Excel, PDF, gráficos), traé los datos con consultar y armá el archivo vos.`;

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
    const server = new McpServer({ name: "metanoia", version: "1.0.0" });

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

    return server;
  });

  return handler.fetch(req);
});
