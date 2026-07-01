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

    // 1. Intentar invite (envía email + crea usuario en Auth)
    const inviteRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/invite`, {
      method: "POST",
      headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email, data: { nombre, rol } }),
    });
    const inviteText = await inviteRes.text();
    let inviteData: any = {};
    try { inviteData = JSON.parse(inviteText); } catch (_) { inviteData = { msg: inviteText }; }

    if (!inviteRes.ok) {
      const msg = (inviteData.msg || inviteData.error || inviteText || "").toLowerCase();
      alreadyRegistered = msg.includes("already") || msg.includes("registered");
      if (!alreadyRegistered) throw new Error(inviteData.msg || inviteData.error || "Error al invitar");
    }

    // 2. Generar link copiable (invite para nuevos, magiclink para existentes)
    const linkType = alreadyRegistered ? "magiclink" : "invite";
    const genRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: linkType, email, options: { redirect_to: REDIRECT } }),
    });
    const genText = await genRes.text();
    let genData: any = {};
    try { genData = JSON.parse(genText); } catch (_) { genData = {}; }
    actionLink = genData.properties?.action_link || genData.action_link || "";

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
