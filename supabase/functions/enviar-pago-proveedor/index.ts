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
    const { email, proveedor, numero, neto, fecha, sociedad, retencion, pdf_base64, certificado_base64, comprobante_pago, echeq,
      medios, adjuntos_extra, adjuntos_storage, comprobante_storage_path, saldo_pendiente, directo } = await req.json();
    // Pago directo (sin orden de pago): «numero» es la referencia de la factura, no el de una orden
    const lblOP = directo ? "Pago de" : "Orden de pago";
    if (!email && !comprobante_pago) return new Response(JSON.stringify({ error: "email o comprobante requerido" }), { status: 400, headers: cors });
    const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

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
      const fFmt = (f: unknown) => String(f || "").slice(0, 10).split("-").reverse().join("/");
      const mFmt = (v: unknown) => Number(v || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 });
      // Pago en varias líneas (Echeq + transferencia + Echeq de terceros…): el mail las detalla una por una.
      // Un pago con una sola línea de Echeq propio mantiene el formato de siempre.
      const lineas: any[] = Array.isArray(medios) ? medios : [];
      const multi = lineas.length > 0 && !(lineas.length === 1 && lineas[0].tipo === "echeq");
      // Pago con Echeq propio (cheque de pago diferido): el mail lo dice y detalla el cheque
      const esEcheq = !multi && !!echeq?.numero;
      const extras: any[] = Array.isArray(adjuntos_extra) ? adjuntos_extra : [];
      const hayStorage = Array.isArray(adjuntos_storage) ? adjuntos_storage.length : 0;
      const detalleLinea = (m: any) => {
        if (m.tipo === "echeq" && m.echeq) {
          const e = m.echeq;
          return `Echeq N° ${esc(e.numero)}${e.id_cheque ? ` (Id ${esc(e.id_cheque)})` : ""} — cheque de pago diferido${e.fecha_emision ? ` · emitido el ${esc(fFmt(e.fecha_emision))}` : ""} · <strong>fecha de pago ${esc(fFmt(e.fecha_pago))}</strong>${e.beneficiario ? ` · a la orden de ${esc(e.beneficiario)}` : ""}`;
        }
        if (m.tipo === "endoso" && m.endoso) {
          const e = m.endoso;
          return `Echeq de terceros endosado a tu favor${e.numero ? ` · N° ${esc(e.numero)}` : ""}${e.librador ? ` · librado por ${esc(e.librador)}` : ""}${e.banco ? ` · ${esc(e.banco)}` : ""}${e.fecha_pago ? ` · <strong>fecha de pago ${esc(fFmt(e.fecha_pago))}</strong>` : ""}`;
        }
        if (m.tipo === "cuenta_bancaria") return `Transferencia bancaria${m.nro_operacion ? ` · N° de operación ${esc(m.nro_operacion)}` : ""}`;
        if (m.tipo === "efectivo") return "Pago en efectivo";
        return esc(m.medio || "Pago");
      };
      const nEcheqs = lineas.filter((m) => m.tipo === "echeq" || m.tipo === "endoso").length;
      const tieneTransf = lineas.some((m) => m.tipo === "cuenta_bancaria" || m.tipo === "efectivo");
      const lista = [
        comprobante_pago?.base64 ? (esEcheq ? "Detalle del Echeq (comprobante del banco)" : !multi ? "Comprobante de pago (transferencia)" : !tieneTransf && nEcheqs ? "Detalle del Echeq (comprobante del banco)" : "Comprobante de pago") : "",
        (extras.length + hayStorage) ? (multi && nEcheqs ? "Detalle de cada Echeq (comprobantes del banco)" : "Comprobantes adicionales") : "",
        pdf_base64 ? "Orden de pago con el detalle de la liquidación" : "",
        certificado_base64 ? "Certificado de retención del Impuesto a las Ganancias" : "",
      ].filter(Boolean).map((t) => `<li>${t}</li>`).join("");
      const tablaMedios = multi ? `
            <table style="width:100%;border-collapse:collapse;font-size:13px;margin:16px 0;background:white">
              <thead><tr style="background:#ece8ff;color:#1a0a5e"><th style="text-align:left;padding:8px">Medio de pago</th><th style="text-align:right;padding:8px">Importe</th><th style="text-align:left;padding:8px">Detalle</th></tr></thead>
              <tbody>${lineas.map((m) => `<tr style="border-bottom:1px solid #eee"><td style="padding:8px;vertical-align:top">${esc(m.etiqueta || m.medio || "Pago")}</td><td style="padding:8px;text-align:right;white-space:nowrap;vertical-align:top">$${mFmt(m.monto)}</td><td style="padding:8px;color:#555;vertical-align:top">${detalleLinea(m)}</td></tr>`).join("")}</tbody>
            </table>` : "";
      const avisoSaldo = Number(saldo_pendiente) > 0.009 ? `<p style="color:#8a5a00;background:#fff4d6;padding:10px 14px;border-radius:6px;font-size:13px">Este es un <strong>pago parcial</strong> de tu comprobante: queda un saldo pendiente de <strong>$${mFmt(saldo_pendiente)}</strong>.</p>` : "";
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#4a2eb4;padding:24px;text-align:center">
            <h1 style="color:#fff;margin:0;font-size:22px">Metanoia SMX</h1>
            <p style="color:#d4c6ff;margin:4px 0 0;font-size:13px">${esc(sociedad)}</p>
          </div>
          <div style="padding:28px 24px;background:#fafafa">
            <p style="font-size:15px;color:#333">Estimado/a <strong>${esc(proveedor)}</strong>,</p>
            <p style="color:#555">${multi ? `Te confirmamos el pago de tu comprobante, abonado con <strong>${lineas.length} medios de pago</strong>:` : esEcheq ? "Te enviamos el pago de tu comprobante mediante <strong>Echeq (cheque de pago diferido)</strong>. Adjuntamos:" : "Te confirmamos el pago de tu comprobante. Adjuntamos:"}</p>
            ${tablaMedios}
            ${multi ? `<p style="color:#555">Adjuntamos:</p>` : ""}
            <ul style="color:#555;line-height:1.7">${lista}</ul>
            <div style="background:white;border-left:4px solid #4a2eb4;padding:16px 20px;margin:20px 0;border-radius:4px">
              <strong style="font-size:16px;color:#1a0a5e">${esEcheq ? `Echeq N° ${esc(echeq.numero)} · ` : ""}${lblOP} ${esc(numero)}</strong><br>
              <span style="color:#888;font-size:14px">${esc(fecha)} · ${esEcheq ? "Importe del Echeq" : "Neto pagado"}: $${montoFmt}${Number(retencion) > 0 ? ` · Retención de Ganancias: $${retFmt}` : ""}</span>
              ${esEcheq ? `<br><span style="color:#555;font-size:14px">${echeq.fecha_emision ? `Emitido el ${esc(fFmt(echeq.fecha_emision))} · ` : ""}<strong>Fecha de pago: ${esc(fFmt(echeq.fecha_pago))}</strong>${echeq.beneficiario ? ` · A la orden de ${esc(echeq.beneficiario)}` : ""}${echeq.id_cheque ? `<br>Id del cheque: ${esc(echeq.id_cheque)}` : ""}</span>` : ""}
            </div>
            ${avisoSaldo}
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
      // Comprobante ya guardado (reenvío): se toma del bucket si no se adjuntó uno nuevo
      if (!comprobante_pago?.base64 && comprobante_storage_path) {
        try {
          const { data, error } = await admin().storage.from("comprobantes-pago").download(String(comprobante_storage_path));
          if (!error && data) attachments.push({ filename: seguro(String(comprobante_storage_path).split("/").pop() || `Comprobante_pago_${numero}`), content: new Uint8Array(await data.arrayBuffer()), contentType: (data as Blob).type || "application/octet-stream" });
        } catch (_) { /* si no se puede leer, el mail sale sin ese adjunto */ }
      }
      // Detalle de cada Echeq (y otros comprobantes): subidos en el momento o leídos del almacenamiento
      let n = 0;
      for (const x of extras) {
        if (!x?.base64) continue;
        n++;
        attachments.push({ filename: seguro(x.nombre || `Adjunto_${n}.pdf`), content: limpiar(x.base64), encoding: "base64", contentType: x.tipo || "application/pdf" });
      }
      for (const s of (Array.isArray(adjuntos_storage) ? adjuntos_storage : [])) {
        try {
          if (!s?.bucket || !s?.path) continue;
          const { data, error } = await admin().storage.from(String(s.bucket)).download(String(s.path));
          if (!error && data) attachments.push({ filename: seguro(s.nombre || String(s.path).split("/").pop() || "Echeq.pdf"), content: new Uint8Array(await data.arrayBuffer()), contentType: (data as Blob).type || "application/pdf" });
        } catch (_) { /* idem */ }
      }
      if (pdf_base64) {
        attachments.push({ filename: `OP_${seguro(numero || "comprobante")}.pdf`, content: limpiar(pdf_base64), encoding: "base64", contentType: "application/pdf" });
      }
      if (certificado_base64) {
        attachments.push({ filename: `Certificado_retencion_${seguro(numero || "")}.pdf`, content: limpiar(certificado_base64), encoding: "base64", contentType: "application/pdf" });
      }
      // Copia interna de cada orden de pago (se puede cambiar con el secret OP_COPIA_EMAIL)
      const copia = (Deno.env.get("OP_COPIA_EMAIL") || "tlarran@metanoiasmx.com").trim();
      await transporter.sendMail({
        from: `"Metanoia SMX" <${Deno.env.get("SMTP_USER")}>`,
        to: email,
        cc: copia && copia.toLowerCase() !== String(email).trim().toLowerCase() ? copia : undefined,
        subject: esEcheq ? `🧾 Pago con Echeq N° ${echeq.numero} — ${lblOP} ${numero || ""} — Metanoia SMX`
          : multi ? `🧾 Pago con ${lineas.length} medios — ${lblOP} ${numero || ""} — Metanoia SMX`
          : directo ? `📄 Pago de ${numero || "tu comprobante"} — Metanoia SMX`
          : `📄 Comprobante de pago ${numero || ""} — Metanoia SMX`,
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
