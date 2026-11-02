import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.9";

// Envía a Auren (estudio contable) la información del cierre de mes de una sociedad: Libro IVA Compras y Ventas (Excel y TXT
// para ARCA), retenciones de Ganancias (Excel y TXT de SICORE) y el resumen de control, con la descripción de cada archivo.
// Copia fija a Tomás y Valentina (se cambia con el secret AUREN_COPIA_EMAILS, separados por coma).
// Solo admins. Secrets: SMTP_HOST / SMTP_USER / SMTP_PASS (los mismos de enviar-factura y enviar-pago-proveedor).
const cors = {
  "Access-Control-Allow-Origin": "https://tomaslarran.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const limpiar = (s: string) => (s.startsWith("data:") ? s.slice(s.indexOf(",") + 1) : s);
const seguro = (s: string) => String(s || "archivo").normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-zA-Z0-9 ._-]+/g, "_").slice(0, 100);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIPOS: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain; charset=ISO-8859-1",
};
const MAX_BYTES = 15 * 1024 * 1024;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);
  const supabaseAuth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: u } = await supabase.from("usuarios").select("nombre,rol,activo").ilike("email", user.email || "").maybeSingle();
  if (!u || u.rol !== "admin" || u.activo === false) return json({ error: "Solo un administrador puede enviar la información a Auren" }, 403);

  try {
    const { para, sociedad, razon_social, periodo, periodo_retenciones, nota, documentos, resumen } = await req.json();
    const destinos = (Array.isArray(para) ? para : String(para || "").split(/[,;\s]+/)).map((e: string) => String(e).trim()).filter(Boolean);
    if (!destinos.length || destinos.length > 5 || destinos.some((e: string) => !EMAIL.test(e))) return json({ error: "Revisá el email de Auren (hasta 5 direcciones, separadas por coma)" }, 400);
    if (!["SUDES", "POINTERS"].includes(sociedad)) return json({ error: "Sociedad inválida" }, 400);
    if (!Array.isArray(documentos) || !documentos.length || documentos.length > 15) return json({ error: "No hay documentos para enviar" }, 400);

    let bytes = 0;
    const attachments = documentos.map((d: { archivo: string; base64: string; formato: string }) => {
      const content = Uint8Array.from(atob(limpiar(String(d.base64 || ""))), (c) => c.charCodeAt(0));
      bytes += content.length;
      return { filename: seguro(d.archivo), content, contentType: TIPOS[d.formato] || "application/octet-stream" };
    });
    if (bytes > MAX_BYTES) return json({ error: "Los adjuntos superan 15 MB" }, 400);

    const copias = (Deno.env.get("AUREN_COPIA_EMAILS") || "tlarran@metanoiasmx.com,vlarran@metanoiasmx.com")
      .split(",").map((e) => e.trim()).filter((e) => EMAIL.test(e) && !destinos.some((d: string) => d.toLowerCase() === e.toLowerCase()));

    const emisor = razon_social || sociedad;
    const filas = documentos.map((d: { archivo: string; descripcion: string }) =>
      `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;vertical-align:top;white-space:nowrap"><strong>${esc(d.archivo)}</strong></td><td style="padding:6px 10px;border-bottom:1px solid #eee;color:#444">${esc(d.descripcion)}</td></tr>`).join("");
    const res = Array.isArray(resumen) ? resumen.filter((r: unknown) => Array.isArray(r) && r.length === 2).slice(0, 12) : [];
    const html = `<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#222">
      <h2 style="color:#2E2868;margin:0 0 4px">${esc(emisor)}</h2>
      <p style="margin:0 0 16px;color:#666;font-size:13px">Información para el cierre de ${esc(periodo)}</p>
      <p>Hola,</p>
      <p>Les enviamos la información de <strong>${esc(sociedad)}</strong> del período <strong>${esc(periodo)}</strong>${periodo_retenciones && periodo_retenciones !== periodo ? ` (retenciones: ${esc(periodo_retenciones)})` : ""}.</p>
      ${nota ? `<p style="background:#f6f5ff;border-left:3px solid #6D5BD0;padding:8px 12px;white-space:pre-wrap">${esc(String(nota).slice(0, 2000))}</p>` : ""}
      ${res.length ? `<table style="border-collapse:collapse;font-size:13px;margin:12px 0">${res.map((r: unknown[]) => `<tr><td style="padding:3px 14px 3px 0;color:#666">${esc(r[0])}</td><td style="text-align:right"><strong>${esc(r[1])}</strong></td></tr>`).join("")}</table>` : ""}
      <p style="margin:18px 0 6px"><strong>Archivos adjuntos</strong></p>
      <table style="border-collapse:collapse;font-size:13px;width:100%">${filas}</table>
      <p style="font-size:12px;color:#888;margin-top:16px">Los TXT tienen el formato de importación de ARCA (Libro IVA Digital) y de SICORE; los Excel dicen lo mismo que los TXT, para revisarlos. Ante cualquier consulta, respondan este mail.</p>
      <p style="font-size:12px;color:#888">Enviado desde el panel de gestión por ${esc(u.nombre || user.email)}.</p>
    </div>`;

    const transporter = nodemailer.createTransport({
      host: Deno.env.get("SMTP_HOST"),
      port: 465,
      secure: true,
      auth: { user: Deno.env.get("SMTP_USER"), pass: Deno.env.get("SMTP_PASS") },
    });
    await transporter.sendMail({
      from: `"${String(emisor).replace(/"/g, "")}" <${Deno.env.get("SMTP_USER")}>`,
      to: destinos.join(", "),
      cc: copias.length ? copias.join(", ") : undefined,
      replyTo: copias[0] || undefined,
      subject: `📦 ${sociedad} — Información para el cierre de ${periodo}`,
      html,
      attachments,
    });
    return json({ ok: true, enviado: true, para: destinos, copia: copias, adjuntos: attachments.length });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
