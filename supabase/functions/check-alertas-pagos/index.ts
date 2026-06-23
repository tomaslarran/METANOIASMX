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

  const cronSecret = Deno.env.get("CRON_SECRET");
  const isCronCall = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCronCall) {
    const supabaseAuth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const hoy = new Date();
    const en5Dias = new Date(hoy.getTime() + 5 * 86400000).toISOString().split("T")[0];
    const hace7Dias = new Date(hoy.getTime() - 7 * 86400000).toISOString();
    const hoyStr = hoy.toISOString().split("T")[0];

    const alertas: { tipo: string; mensaje: string; modulo: string }[] = [];

    // ── 1. Comprobantes pendientes hace más de 7 días ─────────────────────────
    const { data: compPendientes } = await supabase
      .from("comprobantes_compra")
      .select("id, proveedor, total, sociedad")
      .eq("estado", "pendiente")
      .lt("created_at", hace7Dias);

    if (compPendientes?.length) {
      const total = compPendientes.reduce((s, c) => s + (c.total || 0), 0);
      alertas.push({
        tipo: "alerta_pago",
        mensaje: `📄 ${compPendientes.length} factura${compPendientes.length > 1 ? "s" : ""} de proveedores pendiente${compPendientes.length > 1 ? "s" : ""} hace más de 7 días — Total: $${Number(total).toLocaleString("es-AR")}`,
        modulo: "comprobantes",
      });
    }

    // ── 2. Cobranzas vencidas (no cobradas) ──────────────────────────────────
    const { data: cobVencidas } = await supabase
      .from("cf_cobranzas")
      .select("id, descripcion, monto, fecha_vencimiento, empresa")
      .lt("fecha_vencimiento", hoyStr)
      .not("estado", "eq", "cobrado");

    if (cobVencidas?.length) {
      for (const c of cobVencidas) {
        const dias = Math.round((hoy.getTime() - new Date(c.fecha_vencimiento).getTime()) / 86400000);
        alertas.push({
          tipo: "alerta_pago",
          mensaje: `🔴 Cobranza vencida hace ${dias} día${dias > 1 ? "s" : ""}: ${c.descripcion || c.empresa || "sin descripción"} — $${Number(c.monto || 0).toLocaleString("es-AR")}`,
          modulo: "cashflow",
        });
      }
    }

    // ── 3. Cobranzas próximas a vencer (próximos 5 días) ─────────────────────
    const { data: cobProximas } = await supabase
      .from("cf_cobranzas")
      .select("id, descripcion, monto, fecha_vencimiento, empresa")
      .gte("fecha_vencimiento", hoyStr)
      .lte("fecha_vencimiento", en5Dias)
      .not("estado", "eq", "cobrado");

    if (cobProximas?.length) {
      for (const c of cobProximas) {
        const dias = Math.round((new Date(c.fecha_vencimiento).getTime() - hoy.getTime()) / 86400000);
        alertas.push({
          tipo: "alerta_pago",
          mensaje: `🟡 Cobranza vence en ${dias} día${dias !== 1 ? "s" : ""}: ${c.descripcion || c.empresa || "sin descripción"} — $${Number(c.monto || 0).toLocaleString("es-AR")}`,
          modulo: "cashflow",
        });
      }
    }

    // ── 4. Cuotas de préstamos próximas a vencer ─────────────────────────────
    const { data: cuotasProximas } = await supabase
      .from("cf_prestamos_cuotas")
      .select("id, fecha, prestamo_id, cf_prestamos(nombre, sociedad)")
      .eq("pagada", false)
      .gte("fecha", hoyStr)
      .lte("fecha", en5Dias);

    if (cuotasProximas?.length) {
      for (const c of cuotasProximas as any[]) {
        const dias = Math.round((new Date(c.fecha).getTime() - hoy.getTime()) / 86400000);
        const nombre = c.cf_prestamos?.nombre || "Préstamo";
        alertas.push({
          tipo: "alerta_pago",
          mensaje: `💳 Cuota de préstamo vence en ${dias} día${dias !== 1 ? "s" : ""}: ${nombre} (${c.cf_prestamos?.sociedad || ""})`,
          modulo: "cashflow",
        });
      }
    }

    if (alertas.length === 0) {
      return new Response(JSON.stringify({ ok: true, alertas: 0, mensaje: "Sin alertas pendientes 🎉" }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Obtener usuarios admin para notificarlos
    const { data: admins } = await supabase
      .from("usuarios")
      .select("id")
      .eq("rol", "admin")
      .eq("activo", true);

    if (admins?.length) {
      const notifs = admins.flatMap(u =>
        alertas.map(a => ({
          usuario_id: u.id,
          tipo: a.tipo,
          mensaje: a.mensaje,
          leida: false,
        }))
      );
      await supabase.from("notificaciones").insert(notifs);
    }

    return new Response(JSON.stringify({ ok: true, alertas: alertas.length, detalle: alertas }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
