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

  // Verificar que el que llama es admin
  const { data: caller } = await supabase.from("usuarios").select("rol").eq("id", user.id).single();
  if (caller?.rol !== "admin") {
    return new Response(JSON.stringify({ error: "Solo admins pueden eliminar usuarios" }), { status: 403, headers: cors });
  }

  try {
    const { usuario_id } = await req.json();
    if (!usuario_id) return new Response(JSON.stringify({ error: "usuario_id requerido" }), { status: 400, headers: cors });

    // No puede eliminarse a sí mismo
    if (usuario_id === user.id) {
      return new Response(JSON.stringify({ error: "No podés eliminarte a vos mismo" }), { status: 400, headers: cors });
    }

    // Eliminar de Auth (requiere service role) — ignorar si no existe en Auth
    const { error: authError } = await supabase.auth.admin.deleteUser(usuario_id);
    if (authError && !authError.message.toLowerCase().includes("not found")) {
      throw new Error("Error al eliminar de Auth: " + authError.message);
    }

    // Eliminar de tabla usuarios (por id o por email si el id no matchea)
    await supabase.from("usuarios").delete().eq("id", usuario_id);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
