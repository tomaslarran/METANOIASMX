import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.9";

// Envía por mail una factura (o nota de crédito) emitida con ARCA, con el PDF adjunto y copia interna.
// Secrets: SMTP_HOST / SMTP_USER / SMTP_PASS (los mismos de enviar-pago-proveedor y enviar-diplomas) y, opcional, OP_COPIA_EMAIL (copia interna).
const cors = {
  "Access-Control-Allow-Origin": "https://tomaslarran.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const limpiar = (s: string) => (s.startsWith("data:") ? s.slice(s.indexOf(",") + 1) : s);
const seguro = (s: string) => String(s || "factura").normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
const fFmt = (f: unknown) => String(f || "").slice(0, 10).split("-").reverse().join("/");
const mFmt = (v: unknown) => Number(v || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 });
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
  const supabaseAuth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

  try {
    const { email, sociedad, razon_social, tipo, numero, receptor, total, fecha, cae, cae_vto, es_nc, pdf_base64, prueba } = await req.json();
    const para = String(email || "").trim();
    if (!EMAIL.test(para)) return new Response(JSON.stringify({ error: "El email del cliente no es válido" }), { status: 400, headers: cors });
    if (!pdf_base64) return new Response(JSON.stringify({ error: "Falta el PDF de la factura" }), { status: 400, headers: cors });

    const transporter = nodemailer.createTransport({
      host: Deno.env.get("SMTP_HOST"),
      port: 465,
      secure: true,
      auth: { user: Deno.env.get("SMTP_USER"), pass: Deno.env.get("SMTP_PASS") },
    });
    const emisor = razon_social || sociedad || "Metanoia SMX";
    const etiqueta = `${tipo || "Comprobante"} ${numero || ""}`.trim();
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#222">
      <h2 style="color:#2E2868;margin:0 0 4px">${esc(emisor)}</h2>
      <p style="margin:0 0 16px;color:#666;font-size:13px">${es_nc ? "Te enviamos la nota de crédito" : "Te enviamos la factura"} correspondiente.</p>
      ${prueba ? `<p style="background:#fff3cd;border:1px solid #ffe08a;padding:8px 12px;border-radius:6px;font-size:12px">⚠️ Comprobante de PRUEBA: no tiene validez fiscal.</p>` : ""}
      <p>Hola${receptor ? ` ${esc(receptor)}` : ""},</p>
      <p>Adjuntamos tu <strong>${esc(etiqueta)}</strong>.</p>
      <table style="border-collapse:collapse;font-size:14px;margin:12px 0">
        <tr><td style="padding:4px 14px 4px 0;color:#666">Comprobante</td><td><strong>${esc(etiqueta)}</strong></td></tr>
        <tr><td style="padding:4px 14px 4px 0;color:#666">Fecha</td><td>${esc(fFmt(fecha))}</td></tr>
        <tr><td style="padding:4px 14px 4px 0;color:#666">Importe total</td><td><strong>$ ${esc(mFmt(total))}</strong></td></tr>
        ${cae ? `<tr><td style="padding:4px 14px 4px 0;color:#666">CAE</td><td>${esc(cae)}${cae_vto ? ` · vence ${esc(fFmt(cae_vto))}` : ""}</td></tr>` : ""}
      </table>
      <p style="font-size:12px;color:#888">Ante cualquier consulta, respondé este mail.</p>
    </div>`;

    // Copia interna (se puede cambiar con el secret OP_COPIA_EMAIL); no se duplica si el cliente es la misma dirección
    const copia = (Deno.env.get("OP_COPIA_EMAIL") || "tlarran@metanoiasmx.com").trim();
    await transporter.sendMail({
      from: `"${String(emisor).replace(/"/g, "")}" <${Deno.env.get("SMTP_USER")}>`,
      to: para,
      cc: copia && copia.toLowerCase() !== para.toLowerCase() ? copia : undefined,
      subject: `🧾 ${etiqueta} — ${emisor}`,
      html,
      attachments: [{ filename: `${seguro(etiqueta)}.pdf`, content: Uint8Array.from(atob(limpiar(pdf_base64)), (c) => c.charCodeAt(0)), contentType: "application/pdf" }],
    });
    return new Response(JSON.stringify({ ok: true, enviado: true, copia: copia || null }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
