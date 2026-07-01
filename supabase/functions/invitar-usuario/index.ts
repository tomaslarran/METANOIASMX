const cors = {
  "Access-Control-Allow-Origin": "https://tomaslarran.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

  // Solo admins pueden invitar
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

    // Generar link de invitación (no envía email, nos devuelve el link para copiar)
    const genRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: {
        "apikey": SERVICE_KEY,
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "invite",
        email,
        options: { redirect_to: "https://tomaslarran.github.io/METANOIASMX/" },
      }),
    });

    const genData = await genRes.json();
    if (!genRes.ok) throw new Error(genData.msg || genData.error || "Error generando el link");

    const actionLink: string = genData.properties?.action_link || genData.action_link;
    if (!actionLink) throw new Error("No se pudo obtener el link de invitación");

    // Enviar email de invitación via Supabase Auth invite (separado del link generado)
    await fetch(`${SUPABASE_URL}/auth/v1/admin/invite`, {
      method: "POST",
      headers: {
        "apikey": SERVICE_KEY,
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });
    // Ignoramos error de invite (puede fallar si el usuario ya existe desde generate_link)

    // Verificar si ya existe en usuarios
    const { data: existing } = await supabase.from("usuarios").select("id").eq("email", email).single();
    if (!existing) {
      // Insertar registro pendiente en usuarios
      // El id se actualizará cuando el usuario confirme y haga login por primera vez
      await supabase.from("usuarios").insert({
        nombre,
        email,
        rol,
        activo: false,
        estado: "pendiente",
        invitado_at: new Date().toISOString(),
      });
    }

    return new Response(JSON.stringify({ ok: true, link: actionLink, email, nombre }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
