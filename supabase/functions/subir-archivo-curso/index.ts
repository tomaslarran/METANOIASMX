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
    const { cursoId, tipo, nombre, generadoIA, fileBase64, contentType, subidoPor } = await req.json();
    if (!cursoId) throw new Error("cursoId requerido");
    if (!nombre) throw new Error("nombre requerido");
    if (!fileBase64) throw new Error("fileBase64 requerido");

    const safe = String(nombre).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    const path = `${cursoId}/${tipo || "otro"}/${Date.now()}_${safe}`;
    const bytes = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0));

    // service_role no depende de las policies RLS de storage.objects (mismo workaround que subir-firma-instructor)
    const { error: upErr } = await supabase.storage
      .from("curso-archivos")
      .upload(path, bytes, { contentType: contentType || "application/octet-stream", upsert: false });
    if (upErr) throw upErr;

    const { data: row, error: insErr } = await supabase
      .from("curso_archivos")
      .insert({
        curso_id: cursoId,
        tipo: tipo || "otro",
        nombre,
        storage_path: path,
        size_bytes: bytes.length,
        subido_por: subidoPor || null,
        generado_ia: !!generadoIA,
      })
      .select()
      .single();
    if (insErr) throw insErr;

    return new Response(JSON.stringify({ storage_path: path, id: row?.id }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
