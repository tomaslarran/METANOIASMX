import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.9";

const cors = {
  "Access-Control-Allow-Origin": "https://tomaslarran.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const limpiar = (s: string) => (s.startsWith("data:") ? s.slice(s.indexOf(",") + 1) : s);
const seguro = (s: string) => String(s || "archivo").normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
  const supabaseAuth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

  try {
    const { email, proveedor, numero, neto, fecha, sociedad, retencion, pdf_base64, certificado_base64, comprobante_pago } = await req.json();
    if (!email && !comprobante_pago) return new Response(JSON.stringify({ error: "email o comprobante requerido" }), { status: 400, headers: cors });

    const resp: Record<string, unknown> = { ok: true, enviado: false, comprobante_path: null };

    // 1) Guardar el comprobante de pago (service role: no depende de las políticas de Storage del navegador)
    if (comprobante_pago?.base64) {
      try {
        const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const bytes = Uint8Array.from(atob(limpiar(comprobante_pago.base64)), (c) => c.charCodeAt(0));
        const path = `${seguro(sociedad || "SUDES")}/${seguro(numero || "OP")}/${seguro(comprobante_pago.nombre)}`;
        const { error } = await admin.storage.from("comprobantes-pago").upload(path, bytes, { contentType: comprobante_pago.tipo || "application/octet-stream", upsert: true });
        if (!error) resp.comprobante_path = path; else resp.storage_error = error.message;
      } catch (e) { resp.storage_error = (e as Error).message; }
    }

    // 2) Mail al proveedor con los adjuntos
    if (email) {
      const transporter = nodemailer.createTransport({
        host: Deno.env.get("SMTP_HOST"),
        port: 465,
        secure: true,
        auth: { user: Deno.env.get("SMTP_USER"), pass: Deno.env.get("SMTP_PASS") },
      });
      const montoFmt = Number(neto || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 });
      const retFmt = Number(retencion || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 });
      const lista = [
        comprobante_pago?.base64 ? "Comprobante de pago (transferencia)" : "",
        pdf_base64 ? "Orden de pago con el detalle de la liquidación" : "",
        certificado_base64 ? "Certificado de retención del Impuesto a las Ganancias" : "",
      ].filter(Boolean).map((t) => `<li>${t}</li>`).join("");
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#4a2eb4;padding:24px;text-align:center">
            <h1 style="color:#fff;margin:0;font-size:22px">Metanoia SMX</h1>
            <p style="color:#d4c6ff;margin:4px 0 0;font-size:13px">${esc(sociedad)}</p>
          </div>
          <div style="padding:28px 24px;background:#fafafa">
            <p style="font-size:15px;color:#333">Estimado/a <strong>${esc(proveedor)}</strong>,</p>
            <p style="color:#555">Te confirmamos el pago de tu comprobante. Adjuntamos:</p>
            <ul style="color:#555;line-height:1.7">${lista}</ul>
            <div style="background:white;border-left:4px solid #4a2eb4;padding:16px 20px;margin:20px 0;border-radius:4px">
              <strong style="font-size:16px;color:#1a0a5e">Orden de pago ${esc(numero)}</strong><br>
              <span style="color:#888;font-size:14px">${esc(fecha)} · Neto pagado: $${montoFmt}${Number(retencion) > 0 ? ` · Retención de Ganancias: $${retFmt}` : ""}</span>
            </div>
            <p style="color:#555">Ante cualquier consulta, respondé este mismo correo.</p>
            <p style="color:#555;margin-top:24px">Equipo Metanoia SMX</p>
          </div>
          <div style="background:#1a0a5e;padding:16px;text-align:center">
            <p style="color:#9a8ccc;font-size:12px;margin:0">Metanoia SMX · Salta, Argentina</p>
          </div>
        </div>
      `;
      const attachments: any[] = [];
      if (comprobante_pago?.base64) {
        attachments.push({ filename: seguro(comprobante_pago.nombre || `Comprobante_pago_${numero}`), content: limpiar(comprobante_pago.base64), encoding: "base64", contentType: comprobante_pago.tipo || "application/octet-stream" });
      }
      if (pdf_base64) {
        attachments.push({ filename: `OP_${seguro(numero || "comprobante")}.pdf`, content: limpiar(pdf_base64), encoding: "base64", contentType: "application/pdf" });
      }
      if (certificado_base64) {
        attachments.push({ filename: `Certificado_retencion_${seguro(numero || "")}.pdf`, content: limpiar(certificado_base64), encoding: "base64", contentType: "application/pdf" });
      }
      await transporter.sendMail({
        from: `"Metanoia SMX" <${Deno.env.get("SMTP_USER")}>`,
        to: email,
        subject: `📄 Comprobante de pago ${numero || ""} — Metanoia SMX`,
        html,
        attachments,
      });
      resp.enviado = true;
    }

    return new Response(JSON.stringify(resp), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
