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

    // Verificar si ya existe en usuarios
    const { data: existing } = await supabase.from("usuarios").select("id,estado").eq("email", email).maybeSingle();

    // Intentar generar link de invitación
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
    const alreadyRegistered = !genRes.ok && (
      (genData.msg || genData.error || "").toLowerCase().includes("already") ||
      (genData.msg || genData.error || "").toLowerCase().includes("registered")
    );

    let actionLink = "";

    if (alreadyRegistered) {
      // Usuario ya tiene cuenta — generar magic link para que entre directamente
      const mlRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
        method: "POST",
        headers: {
          "apikey": SERVICE_KEY,
          "Authorization": `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "magiclink",
          email,
          options: { redirect_to: "https://tomaslarran.github.io/METANOIASMX/" },
        }),
      });
      const mlData = await mlRes.json();
      actionLink = mlData.properties?.action_link || mlData.action_link || "";
    } else {
      if (!genRes.ok) throw new Error(genData.msg || genData.error || "Error generando el link");
      actionLink = genData.properties?.action_link || genData.action_link || "";
      if (!actionLink) throw new Error("No se pudo obtener el link de invitación");
    }

    // Insertar o actualizar registro en usuarios
    if (!existing) {
      await supabase.from("usuarios").insert({
        nombre,
        email,
        rol,
        estado: alreadyRegistered ? "activo" : "pendiente",
        invitado_at: new Date().toISOString(),
      });
    } else if (existing.estado === "pendiente") {
      await supabase.from("usuarios").update({ rol, estado: alreadyRegistered ? "activo" : "pendiente" }).eq("email", email);
    }

    return new Response(JSON.stringify({
      ok: true,
      link: actionLink,
      email,
      nombre,
      ya_registrado: alreadyRegistered,
    }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
