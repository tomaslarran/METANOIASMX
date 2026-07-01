import nodemailer from "npm:nodemailer@6.9.9";

const cors = {
  "Access-Control-Allow-Origin": "https://tomaslarran.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REDIRECT = "https://tomaslarran.github.io/METANOIASMX/";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { email } = await req.json();
    if (!email || !email.includes("@")) {
      return new Response(JSON.stringify({ error: "Email inválido" }), { status: 400, headers: cors });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Generar link de recuperación
    const genRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "recovery", email, options: { redirect_to: REDIRECT } }),
    });
    const genText = await genRes.text();
    let genData: any = {};
    try { genData = JSON.parse(genText); } catch (_) { genData = {}; }

    // Si el email no existe en Auth simplemente devolvemos ok (no revelar si el usuario existe)
    if (!genRes.ok) {
      return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    const actionLink = genData.properties?.action_link || genData.action_link || "";
    if (!actionLink) {
      return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Enviar email via SMTP institucional
    const transporter = nodemailer.createTransport({
      host: Deno.env.get("SMTP_HOST"),
      port: 465,
      secure: true,
      auth: {
        user: Deno.env.get("SMTP_USER"),
        pass: Deno.env.get("SMTP_PASS"),
      },
    });

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#222">
        <div style="background:#7c3aed;padding:24px 32px;border-radius:12px 12px 0 0">
          <div style="color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px">Metanoia SMX</div>
          <div style="color:#e9d5ff;font-size:13px;margin-top:2px">Panel de gestión interno</div>
        </div>
        <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
          <p style="margin:0 0 12px;font-size:16px">Recuperación de contraseña</p>
          <p style="margin:0 0 20px;color:#555;font-size:14px;line-height:1.6">
            Recibimos una solicitud para restablecer la contraseña de tu cuenta.<br>
            Hacé clic en el botón para crear una nueva contraseña.
          </p>
          <div style="text-align:center;margin:28px 0">
            <a href="${actionLink}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:700">Restablecer contraseña</a>
          </div>
          <p style="margin:20px 0 0;color:#999;font-size:12px;text-align:center">
            Si no solicitaste este cambio, podés ignorar este mensaje.<br>
            El link expira en 24 horas.
          </p>
        </div>
      </div>`;

    await transporter.sendMail({
      from: `"Metanoia SMX" <${Deno.env.get("SMTP_USER")}>`,
      to: email,
      subject: `Restablecer contraseña — Metanoia SMX`,
      html,
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    // Nunca revelar detalles del error al cliente
    console.error("recuperar-password error:", e.message);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
