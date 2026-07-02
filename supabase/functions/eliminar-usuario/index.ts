import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://tomaslarran.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: caller } = await supabase.from("usuarios").select("rol").eq("id", user.id).single();
  if (caller?.rol !== "admin") {
    return new Response(JSON.stringify({ error: "Solo admins pueden eliminar usuarios" }), { status: 403, headers: cors });
  }

  try {
    const { usuario_id } = await req.json();
    if (!usuario_id) return new Response(JSON.stringify({ error: "usuario_id requerido" }), { status: 400, headers: cors });

    if (usuario_id === user.id) {
      return new Response(JSON.stringify({ error: "No podés eliminarte a vos mismo" }), { status: 400, headers: cors });
    }

    // Obtener email antes de borrar (necesario para fallback por email en Auth)
    const { data: usuarioRow } = await supabase.from("usuarios").select("email").eq("id", usuario_id).single();

    // 1. Eliminar de Supabase Auth por ID
    const { error: authError } = await supabase.auth.admin.deleteUser(usuario_id);
    if (authError) {
      const msg = authError.message.toLowerCase();
      // Si el ID no coincide (usuario pendiente sin contraseña), buscar por email
      if (msg.includes("not found") || msg.includes("user not found")) {
        if (usuarioRow?.email) {
          const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 });
          const authUser = (list?.users ?? []).find((u: any) => u.email === usuarioRow.email);
          if (authUser) {
            const { error: e2 } = await supabase.auth.admin.deleteUser(authUser.id);
            if (e2) console.error("Error eliminando de Auth por email:", e2.message);
          }
        }
      } else {
        throw new Error("Error al eliminar de Auth: " + authError.message);
      }
    }

    // 2. Borrar registros dependientes que pueden bloquear el delete por FK
    await supabase.from("notificaciones").delete().eq("usuario_id", usuario_id);
    await supabase.from("notificaciones_config").delete().eq("usuario_id", usuario_id);

    // 3. Eliminar de tabla usuarios — verificar que realmente se borró
    const { error: delError } = await supabase.from("usuarios").delete().eq("id", usuario_id);
    if (delError) throw new Error("Error al eliminar usuario: " + delError.message);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
