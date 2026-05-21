import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { message, historial = [] } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const hace7dias = new Date();
    hace7dias.setDate(hace7dias.getDate() - 7);
    const fecha7dias = hace7dias.toISOString().split("T")[0];

    // Período actual y anterior para comprobantes
    const ahora = new Date();
    const periodoActual = ahora.toISOString().slice(0, 7); // "YYYY-MM"
    const hace3meses = new Date(ahora);
    hace3meses.setMonth(hace3meses.getMonth() - 3);
    const periodo3m = hace3meses.toISOString().slice(0, 7);

    const [conceptos, valores, cobranzas, prestamos, inversiones, invMovimientos, rendDiarios, inflacion, empleados, pagosEmpleados, comprobantes] = await Promise.all([
      supabase.from("cf_conceptos").select("nombre,tipo,categoria,sociedad").eq("activo", true),
      supabase.from("cf_valores").select("concepto_id,periodo,monto,monto_real,cf_conceptos(nombre,tipo,sociedad)"),
      supabase.from("cf_cobranzas").select("descripcion,monto,fecha_vencimiento,estado,empresa").order("fecha_vencimiento"),
      supabase.from("cf_prestamos").select("nombre,sociedad,capital,cuota_mensual,tasa,saldo_pendiente").eq("activo", true),
      supabase.from("cf_inversiones").select("id,nombre,tipo,entidad,sociedad,capital,valor_actual,tna,fecha_inicio,fecha_vencimiento,plazo_rescate,objetivo,tipo_riesgo,estado"),
      supabase.from("cf_inversiones_movimientos").select("inversion_id,tipo,monto,fecha").order("fecha", { ascending: false }).limit(50),
      supabase.from("rendimientos_diarios").select("inversion_id,fecha,valor").gte("fecha", fecha7dias).order("fecha", { ascending: true }),
      supabase.from("inflacion_mensual").select("periodo,tasa,rend_cartera").order("periodo", { ascending: false }).limit(6),
      supabase.from("cf_empleados").select("nombre,categoria,empresa,monto_mensual,activo").eq("activo", true),
      supabase.from("cf_pagos_empleados").select("empleado_id,periodo,monto,pagado,cf_empleados(nombre,empresa)").order("periodo", { ascending: false }).limit(60),
      supabase.from("comprobantes_compra").select("proveedor,total,monto_neto,fecha,fecha_imputacion,sociedad,estado,concepto").gte("fecha", periodo3m).order("fecha", { ascending: false }).limit(100),
    ]);

    const hoy = new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Salta" });

    const sistema = `Sos el agente financiero de Metanoia SMX. Hoy es ${hoy}.
La empresa tiene dos sociedades: SUDES (capacitación médica) y POINTERS (logística/servicios).
Respondé en español, de forma clara y concisa. Usá pesos argentinos ($) con separador de miles.
Si algo no podés calcularlo con los datos disponibles, decílo claramente.

CONCEPTOS DE CASH FLOW:
${JSON.stringify(conceptos.data)}

VALORES POR PERÍODO (monto=proyectado, monto_real=ejecutado):
${JSON.stringify(valores.data)}

COBRANZAS (cheques y cobros):
${JSON.stringify(cobranzas.data)}

PRÉSTAMOS ACTIVOS:
${JSON.stringify(prestamos.data)}

INVERSIONES:
${JSON.stringify(inversiones.data)}

MOVIMIENTOS DE INVERSIONES (aportes y rescates por inversion_id):
${JSON.stringify(invMovimientos.data)}

RENDIMIENTOS DIARIOS ÚLTIMOS 30 DÍAS:
${JSON.stringify(rendDiarios.data)}

INFLACIÓN ÚLTIMOS 6 MESES (periodo=YYYY-MM, tasa=inflación mensual %, rend_cartera=rendimiento cartera % ese mes):
${JSON.stringify(inflacion.data)}

EMPLEADOS Y HONORARIOS ACTIVOS (monto_mensual = honorario/sueldo mensual):
${JSON.stringify(empleados.data)}

PAGOS A EMPLEADOS ÚLTIMOS 5 MESES (pagado=true/false indica si fue abonado):
${JSON.stringify(pagosEmpleados.data)}

COMPROBANTES DE COMPRA ÚLTIMOS 3 MESES (facturas de proveedores):
${JSON.stringify(comprobantes.data)}`;

    // Limitar historial para no exceder contexto (sistema prompt es grande)
    const historialReciente = historial.slice(-6);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: sistema,
        messages: [...historialReciente, { role: "user", content: message }],
      }),
    });

    const data = await res.json();

    if (data.type === "error") {
      const tipo = data.error?.type ?? "error";
      if (tipo === "overloaded_error") {
        return new Response(JSON.stringify({ respuesta: "El servicio está saturado en este momento. Intentá de nuevo en unos segundos." }), {
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      throw new Error(data.error?.message ?? "Error de API");
    }

    const respuesta = data.content?.[0]?.text ?? "No pude generar una respuesta.";

    return new Response(JSON.stringify({ respuesta }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
