// Sube un archivo a Storage con service_role. Respaldo para cuando el upload directo del navegador
// es rechazado por la RLS de storage.objects (bug de plataforma ya documentado en CLAUDE.md).
// Body: { bucket, path, fileBase64, contentType, upsert? } → { path, publicUrl }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://tomaslarran.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const J = { ...cors, "Content-Type": "application/json" };
const BUCKETS = ["impuestos-vep", "Facturas", "oportunidades", "extractos-bancarios"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: J });
  const supabaseAuth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: J });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const { bucket, path, fileBase64, contentType, upsert } = await req.json();
    if (!BUCKETS.includes(bucket)) throw new Error("Bucket no permitido");
    if (!path || typeof path !== "string" || path.includes("..") || path.startsWith("/")) throw new Error("Ruta inválida");
    if (!fileBase64) throw new Error("fileBase64 requerido");
    const bytes = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0));
    if (bytes.length > 12 * 1024 * 1024) throw new Error("Archivo demasiado grande (máx. 12 MB)");

    const { error } = await supabase.storage.from(bucket).upload(path, bytes, { contentType: contentType || "application/octet-stream", upsert: !!upsert });
    if (error) throw error;
    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
    return new Response(JSON.stringify({ path, publicUrl: pub.publicUrl }), { headers: J });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: J });
  }
});
