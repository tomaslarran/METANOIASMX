import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

const cors = {
  "Access-Control-Allow-Origin": "https://tomaslarran.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
  const supabaseAuth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const { mes, anio, modo } = await req.json();
    const y = anio || new Date().getFullYear();
    const m = mes || (new Date().getMonth() + 1);
    const mesStr = String(m).padStart(2, "0");
    const periodo = `${y}-${mesStr}`;
    const diasEnMes = new Date(y, m, 0).getDate();
    const fechaInicio = `${y}-${mesStr}-01`;
    const fechaFin = `${y}-${mesStr}-${String(diasEnMes).padStart(2, "0")}`;

    const [
      compResult,
      cajaResult,
      bancoResult,
      cobranzasResult,
      empleadosResult,
      pagosResult,
      declResult,
      conceptosResult,
      valoresResult,
    ] = await Promise.all([
      supabase.from("comprobantes_compra").select("id,proveedor,total,estado,sociedad").neq("estado", "pagado").gte("fecha", fechaInicio).lte("fecha", fechaFin),
      supabase.from("caja_movimientos").select("fecha").gte("fecha", fechaInicio).lte("fecha", fechaFin),
      supabase.from("banco_movimientos").select("id,concepto,importe,sociedad").eq("conciliado", false).gte("fecha", fechaInicio).lte("fecha", fechaFin),
      supabase.from("cf_cobranzas").select("id,nombre,descripcion,monto,estado,sociedad,fecha_vencimiento").neq("estado", "cobrado").lte("fecha_vencimiento", fechaFin),
      supabase.from("cf_empleados").select("id,nombre").eq("activo", true),
      supabase.from("cf_pagos_empleados").select("empleado_id,periodo,monto").eq("periodo", periodo),
      supabase.from("impuestos_declaraciones").select("tipo,presentado,pagado,periodo").eq("periodo", periodo),
      supabase.from("cf_conceptos").select("id,nombre").eq("activo", true),
      supabase.from("cf_valores").select("concepto_id,periodo").eq("periodo", periodo),
    ]);

    const items: any[] = [];

    // ── 1. Comprobantes ───────────────────────────────────────────────────────
    const comp = compResult.data || [];
    const compTotal = comp.reduce((s: number, c: any) => s + (c.total || 0), 0);
    items.push({
      area: "Comprobantes",
      icon: "📄",
      estado: comp.length === 0 ? "ok" : "alerta",
      detalle: comp.length === 0
        ? "Todas las facturas del mes están pagadas"
        : `${comp.length} factura${comp.length > 1 ? "s" : ""} sin pagar — Total: $${compTotal.toLocaleString("es-AR")}`,
      subitems: comp.slice(0, 5).map((c: any) => `${c.proveedor || "?"} · ${c.sociedad || ""} · $${(c.total || 0).toLocaleString("es-AR")}`),
    });

    // ── 2. Caja ───────────────────────────────────────────────────────────────
    const cajaDias = new Set((cajaResult.data || []).map((r: any) => r.fecha)).size;
    const cajaEstado = cajaDias === 0 ? "error" : cajaDias < diasEnMes * 0.3 ? "alerta" : "ok";
    items.push({
      area: "Caja",
      icon: "💰",
      estado: cajaEstado,
      detalle: cajaDias === 0
        ? "Sin movimientos de caja registrados en el mes"
        : `${cajaDias} día${cajaDias !== 1 ? "s" : ""} con movimientos registrados de ${diasEnMes} días del mes`,
      subitems: [],
    });

    // ── 3. Conciliación bancaria ──────────────────────────────────────────────
    const banco = bancoResult.data || [];
    items.push({
      area: "Conciliación bancaria",
      icon: "🏦",
      estado: banco.length === 0 ? "ok" : "alerta",
      detalle: banco.length === 0
        ? "Todos los movimientos bancarios del mes están conciliados"
        : `${banco.length} movimiento${banco.length > 1 ? "s" : ""} sin conciliar`,
      subitems: banco.slice(0, 5).map((b: any) => `${b.concepto || "Movimiento"} · ${b.sociedad || ""} · $${Math.abs(b.importe || 0).toLocaleString("es-AR")}`),
    });

    // ── 4. Cobranzas ─────────────────────────────────────────────────────────
    const cob = cobranzasResult.data || [];
    const cobTotal = cob.reduce((s: number, c: any) => s + (c.monto || 0), 0);
    items.push({
      area: "Cobranzas",
      icon: "📥",
      estado: cob.length === 0 ? "ok" : "alerta",
      detalle: cob.length === 0
        ? "Todas las cobranzas vencidas al cierre están cobradas"
        : `${cob.length} cobranza${cob.length > 1 ? "s" : ""} vencida${cob.length > 1 ? "s" : ""} sin cobrar — Total: $${cobTotal.toLocaleString("es-AR")}`,
      subitems: cob.slice(0, 5).map((c: any) => `${c.nombre || c.descripcion || "?"} · Vence: ${c.fecha_vencimiento} · $${(c.monto || 0).toLocaleString("es-AR")}`),
    });

    // ── 5. Sueldos / Honorarios ───────────────────────────────────────────────
    const emp = empleadosResult.data || [];
    const pagadosIds = new Set((pagosResult.data || []).map((p: any) => p.empleado_id));
    const sinPago = emp.filter((e: any) => !pagadosIds.has(e.id));
    items.push({
      area: "Sueldos / Honorarios",
      icon: "👥",
      estado: sinPago.length === 0 ? "ok" : "alerta",
      detalle: sinPago.length === 0
        ? `Todos los ${emp.length} empleados tienen pago registrado en ${periodo}`
        : `${sinPago.length} empleado${sinPago.length > 1 ? "s" : ""} sin pago registrado en ${periodo}`,
      subitems: sinPago.map((e: any) => e.nombre || "Empleado"),
    });

    // ── 6. Impuestos ─────────────────────────────────────────────────────────
    const decls = declResult.data || [];
    const iva = decls.find((d: any) => d.tipo === "iva");
    const iibb = decls.find((d: any) => d.tipo === "iibb");
    const impSubitems: string[] = [];
    let impEstado = "ok";

    if (!iva) { impSubitems.push("IVA: sin declaración cargada"); impEstado = "alerta"; }
    else if (!iva.presentado) { impSubitems.push("IVA: pendiente de presentación"); impEstado = "alerta"; }
    else if (!iva.pagado) { impSubitems.push("IVA: presentado, pendiente de pago"); impEstado = "alerta"; }
    else impSubitems.push("IVA: presentado y pagado ✅");

    if (!iibb) { impSubitems.push("IIBB: sin declaración cargada"); impEstado = "alerta"; }
    else if (!iibb.presentado) { impSubitems.push("IIBB: pendiente de presentación"); impEstado = "alerta"; }
    else if (!iibb.pagado) { impSubitems.push("IIBB: presentado, pendiente de pago"); impEstado = "alerta"; }
    else impSubitems.push("IIBB: presentado y pagado ✅");

    items.push({
      area: "Impuestos",
      icon: "🧾",
      estado: impEstado,
      detalle: impEstado === "ok" ? `IVA e IIBB de ${periodo} presentados y pagados` : `Hay impuestos pendientes para ${periodo}`,
      subitems: impSubitems,
    });

    // ── 7. Cash Flow (conceptos sin valor) ────────────────────────────────────
    const conceptos = conceptosResult.data || [];
    const conIds = new Set((valoresResult.data || []).map((v: any) => v.concepto_id));
    const sinValor = conceptos.filter((c: any) => !conIds.has(c.id));
    items.push({
      area: "Cash Flow",
      icon: "📊",
      estado: sinValor.length === 0 ? "ok" : "alerta",
      detalle: sinValor.length === 0
        ? `Todos los conceptos tienen valor cargado para ${periodo}`
        : `${sinValor.length} concepto${sinValor.length > 1 ? "s" : ""} sin valor registrado para ${periodo}`,
      subitems: sinValor.slice(0, 5).map((c: any) => c.nombre || "Concepto"),
    });

    const resumen: any = {
      periodo,
      items,
      totalOk: items.filter((i: any) => i.estado === "ok").length,
      totalAlerta: items.filter((i: any) => i.estado === "alerta").length,
      totalError: items.filter((i: any) => i.estado === "error").length,
    };

    if (modo === "analizar") {
      const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });
      const prompt = `Sos el asistente contable de Metanoia SMX, empresa de simulación médica de Salta, Argentina.

El equipo está revisando el cierre mensual de ${periodo}. Este es el estado actual:

${items.map((i: any) => `${i.icon} ${i.area}: ${i.estado.toUpperCase()} — ${i.detalle}${i.subitems?.length ? "\n   " + i.subitems.join("\n   ") : ""}`).join("\n\n")}

Escribí un resumen ejecutivo del cierre en 3-4 párrafos en español, tono profesional y directo:
1. Estado general del cierre (completo / con pendientes / crítico)
2. Qué puntos requieren acción inmediata y por qué
3. Prioridades recomendadas para cerrar el mes correctamente

Sé concreto, mencioná los números y conceptos específicos que aparecen arriba.`;

      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        messages: [{ role: "user", content: prompt }],
      });
      resumen.analisis = (msg.content[0] as any).text;
    }

    return new Response(JSON.stringify(resumen), {
      headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
