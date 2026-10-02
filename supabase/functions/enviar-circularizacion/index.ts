import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.9";

const cors = {
  "Access-Control-Allow-Origin": "https://tomaslarran.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const money = (n: unknown) => "$" + Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fecha = (iso: unknown) => { const p = String(iso || "").slice(0, 10).split("-"); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : esc(iso); };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
  const supabaseAuth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

  try {
    const { destinatarios } = await req.json();
    // destinatarios: [{ email, proveedor, cuit, saldo, sociedad, ejercicio, corte, resumen:{facturado,notas_credito,pagado,retenciones}, detalle:[{fecha,tipo,numero,importe}] }]
    if (!Array.isArray(destinatarios) || !destinatarios.length) {
      return new Response(JSON.stringify({ error: "destinatarios requerido" }), { status: 400, headers: cors });
    }

    const transporter = nodemailer.createTransport({
      host: Deno.env.get("SMTP_HOST"),
      port: 465,
      secure: true,
      auth: { user: Deno.env.get("SMTP_USER"), pass: Deno.env.get("SMTP_PASS") },
    });

    const results = { enviados: 0, enviados_a: [] as string[], errores: [] as string[] };
    for (const d of destinatarios) {
      if (!d.email) continue;
      const sociedad = esc(d.sociedad || "Metanoia SMX");
      const r = d.resumen || {};
      const detalle: any[] = Array.isArray(d.detalle) ? d.detalle : [];
      const filas = detalle.map((m) => `
        <tr>
          <td style="padding:6px 8px;border-bottom:1px solid #eee">${fecha(m.fecha)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(m.tipo)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(m.numero)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${money(m.importe)}</td>
        </tr>`).join("");
      const tabla = filas ? `
        <p style="color:#555;margin:18px 0 6px">Comprobantes que componen el saldo:</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff">
          <tr style="background:#f0edfa;color:#1a0a5e"><th style="padding:6px 8px;text-align:left">Fecha</th><th style="padding:6px 8px;text-align:left">Tipo</th><th style="padding:6px 8px;text-align:left">Número</th><th style="padding:6px 8px;text-align:right">Importe</th></tr>
          ${filas}
        </table>` : "";
      const resumenHtml = (r.facturado !== undefined) ? `
        <table style="width:100%;font-size:13px;color:#555;margin-top:14px">
          <tr><td>Facturado en el ejercicio</td><td style="text-align:right">${money(r.facturado)}</td></tr>
          ${Number(r.notas_credito) ? `<tr><td>Notas de crédito</td><td style="text-align:right">− ${money(r.notas_credito)}</td></tr>` : ""}
          <tr><td>Pagado (incluye retenciones)</td><td style="text-align:right">− ${money(r.pagado)}</td></tr>
          ${Number(r.retenciones) ? `<tr><td style="padding-left:14px;font-size:12px">de los cuales, retenciones practicadas</td><td style="text-align:right;font-size:12px">${money(r.retenciones)}</td></tr>` : ""}
        </table>` : "";
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto">
          <div style="background:#4a2eb4;padding:24px;text-align:center">
            <h1 style="color:#fff;margin:0;font-size:22px">${sociedad}</h1>
          </div>
          <div style="padding:28px 24px;background:#fafafa">
            <p style="font-size:15px;color:#333">Estimado/a <strong>${esc(d.proveedor)}</strong>${d.cuit ? ` (CUIT ${esc(d.cuit)})` : ""},</p>
            <p style="color:#555">Como parte de nuestro cierre de ejercicio${d.ejercicio ? ` ${esc(d.ejercicio)}` : ""}, te pedimos que nos confirmes el saldo que tenés registrado a nuestro nombre${d.corte ? ` al ${fecha(d.corte)}` : ""}.</p>
            <div style="background:white;border-left:4px solid #4a2eb4;padding:16px 20px;margin:20px 0;border-radius:4px">
              <strong style="font-size:18px;color:#1a0a5e">Saldo según nuestros registros: ${money(d.saldo)}</strong>
              ${resumenHtml}
            </div>
            ${tabla}
            <p style="color:#555;margin-top:20px">Por favor respondé este correo confirmando si el monto coincide con tus registros, o indicando la diferencia y los comprobantes involucrados si no es así.</p>
            <p style="color:#555;margin-top:24px">Muchas gracias,<br>Equipo Metanoia SMX</p>
          </div>
          <div style="background:#1a0a5e;padding:16px;text-align:center">
            <p style="color:#9a8ccc;font-size:12px;margin:0">Metanoia SMX · Salta, Argentina</p>
          </div>
        </div>
      `;
      try {
        await transporter.sendMail({
          from: `"Metanoia SMX" <${Deno.env.get("SMTP_USER")}>`,
          to: d.email,
          subject: `Confirmación de saldo — ${d.sociedad || "Metanoia SMX"}`,
          html,
        });
        results.enviados++;
        results.enviados_a.push(d.email);
      } catch (e) {
        results.errores.push(`${d.proveedor}: ${(e as Error).message}`);
      }
    }

    return new Response(JSON.stringify(results), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
