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

    // 2. Intentar /admin/invite para que Supabase envíe el email automáticamente (best-effort)
    if (!alreadyRegistered) {
      try {
        await fetch(`${SUPABASE_URL}/auth/v1/admin/invite`, {
          method: "POST",
          headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ email, data: { nombre, rol } }),
        });
      } catch (_) { /* ignorar si falla — el link ya está generado */ }
    }

    // 3. Insertar o actualizar registro en usuarios
    if (!existing) {
      await supabase.from("usuarios").insert({
        nombre, email, rol,
        estado: alreadyRegistered ? "activo" : "pendiente",
        invitado_at: new Date().toISOString(),
      });
    } else if (existing.estado === "pendiente") {
      await supabase.from("usuarios").update({ rol, estado: alreadyRegistered ? "activo" : "pendiente" }).eq("email", email);
    }

    return new Response(JSON.stringify({ ok: true, link: actionLink, email, nombre, ya_registrado: alreadyRegistered }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
