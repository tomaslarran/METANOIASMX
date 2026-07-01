import nodemailer from "npm:nodemailer@6.9.9";

const cors = {
  "Access-Control-Allow-Origin": "https://tomaslarran.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REDIRECT = "https://tomaslarran.github.io/METANOIASMX/";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const supabaseAuth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: caller } = await supabase.from("usuarios").select("rol").eq("id", user.id).single();
  if (caller?.rol !== "admin") {
    return new Response(JSON.stringify({ error: "Solo admins pueden invitar usuarios" }), { status: 403, headers: cors });
  }

  try {
    const { email, nombre, rol } = await req.json();
    if (!email || !nombre || !rol) {
      return new Response(JSON.stringify({ error: "email, nombre y rol son requeridos" }), { status: 400, headers: cors });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const { data: existing } = await supabase.from("usuarios").select("id,estado").eq("email", email).maybeSingle();

    let actionLink = "";
    let alreadyRegistered = false;

    // 1. generate_link type=invite → crea usuario en Auth y devuelve el link copiable
    const genInvRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "invite", email, options: { redirect_to: REDIRECT } }),
    });
    const genInvText = await genInvRes.text();
    let genInvData: any = {};
    try { genInvData = JSON.parse(genInvText); } catch (_) { genInvData = { msg: genInvText }; }

    if (genInvRes.ok) {
      actionLink = genInvData.properties?.action_link || genInvData.action_link || "";
    } else {
      const msg = (genInvData.msg || genInvData.error_code || genInvData.error || genInvText || "").toLowerCase();
      alreadyRegistered = msg.includes("already") || msg.includes("registered") || msg.includes("exists") || msg.includes("duplicate");

      if (!alreadyRegistered) {
        throw new Error(`Error al generar invitación: ${genInvData.msg || genInvData.error || genInvText}`);
      }

      // Usuario ya existe en Auth → generar magic link para que ingrese
      const mgRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
        method: "POST",
        headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "magiclink", email, options: { redirect_to: REDIRECT } }),
      });
      const mgText = await mgRes.text();
      let mgData: any = {};
      try { mgData = JSON.parse(mgText); } catch (_) { mgData = {}; }
      actionLink = mgData.properties?.action_link || mgData.action_link || "";
    }

    // 2. Insertar o actualizar registro en usuarios
    // Extraer el Auth user ID del response de generate_link para que eliminar-usuario pueda borrarlo de Auth correctamente
    const authUserId = genInvData.user?.id || null;
    if (!existing) {
      const row: any = { nombre, email, rol, estado: alreadyRegistered ? "activo" : "pendiente", invitado_at: new Date().toISOString() };
      if (authUserId) row.id = authUserId;
      await supabase.from("usuarios").insert(row);
    } else if (existing.estado === "pendiente") {
      const upd: any = { rol, estado: alreadyRegistered ? "activo" : "pendiente" };
      if (authUserId) upd.id = authUserId;
      await supabase.from("usuarios").update(upd).eq("email", email);
    }

    // 3. Enviar email desde cuenta de administración vía SMTP
    let emailSent = false;
    if (actionLink) {
      try {
        const transporter = nodemailer.createTransport({
          host: Deno.env.get("SMTP_HOST"),
          port: 465,
          secure: true,
          auth: {
            user: Deno.env.get("SMTP_USER"),
            pass: Deno.env.get("SMTP_PASS"),
          },
        });

        const accion = alreadyRegistered ? "acceder" : "crear tu contraseña y acceder";
        const btnText = alreadyRegistered ? "Ingresar al panel" : "Crear contraseña e ingresar";
        const html = `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#222">
            <div style="background:#7c3aed;padding:24px 32px;border-radius:12px 12px 0 0">
              <div style="color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px">Metanoia SMX</div>
              <div style="color:#e9d5ff;font-size:13px;margin-top:2px">Panel de gestión interno</div>
            </div>
            <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
              <p style="margin:0 0 12px;font-size:16px">Hola <strong>${nombre}</strong>,</p>
              <p style="margin:0 0 20px;color:#555;font-size:14px;line-height:1.6">
                Fuiste invitado/a al panel interno de <strong>Metanoia SMX</strong> con rol <strong>${rol}</strong>.<br>
                Hacé clic en el botón para ${accion}.
              </p>
              <div style="text-align:center;margin:28px 0">
                <a href="${actionLink}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:700">${btnText}</a>
              </div>
              <p style="margin:20px 0 0;color:#999;font-size:12px;text-align:center">
                Si no esperabas este mensaje, podés ignorarlo.<br>
                El link expira en 24 horas.
              </p>
            </div>
          </div>`;

        await transporter.sendMail({
          from: `"Metanoia SMX" <${Deno.env.get("SMTP_USER")}>`,
          to: email,
          subject: `Invitación al panel — Metanoia SMX`,
          html,
        });
        emailSent = true;
      } catch (_) { /* si falla el email, el link igual está disponible para copiar */ }
    }

    return new Response(JSON.stringify({ ok: true, link: actionLink, email, nombre, ya_registrado: alreadyRegistered, email_sent: emailSent }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
