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

  try {
    const { content_base64, content_type } = await req.json();
    if (!content_base64) throw new Error("content_base64 requerido");

    // Matchear al instructor por email del usuario logueado — mismo criterio que el resto del panel
    const { data: instructor, error: instErr } = await supabase
      .from("instructores")
      .select("id")
      .ilike("email", user.email ?? "")
      .maybeSingle();
    if (instErr) throw instErr;
    if (!instructor) throw new Error("No se encontró tu ficha de instructor — pedile a un admin que la cree o le cargue tu email");

    const bytes = Uint8Array.from(atob(content_base64), (c) => c.charCodeAt(0));
    const path = `${instructor.id}.png`;

    // service_role no depende de las policies RLS de storage.objects
    const { error: upErr } = await supabase.storage
      .from("firmas-instructores")
      .upload(path, bytes, { contentType: content_type || "image/png", upsert: true });
    if (upErr) throw upErr;

    const { data: pub } = supabase.storage.from("firmas-instructores").getPublicUrl(path);
    const firma_url = `${pub.publicUrl}?t=${Date.now()}`;

    const { error: updErr } = await supabase.from("instructores").update({ firma_url }).eq("id", instructor.id);
    if (updErr) throw updErr;

    return new Response(JSON.stringify({ firma_url }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
