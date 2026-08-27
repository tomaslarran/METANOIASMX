import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://tomaslarran.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function formatWAPhone(tel: string): string | null {
  if (!tel) return null;
  let d = tel.replace(/\D/g, "");
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) return "549" + d;
  if (d.length === 11 && d.startsWith("9")) return "54" + d;
  if (d.length === 12 && d.startsWith("54")) return "549" + d.slice(2);
  if (d.length === 13 && d.startsWith("549")) return d;
  return d.length >= 10 ? d : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // JWT auth
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

  const { curso_id } = await req.json();
  if (!curso_id) return new Response(JSON.stringify({ error: "curso_id requerido" }), { status: 400, headers: cors });

  const { data: curso } = await supabase.from("cursos").select("nombre").eq("id", curso_id).single();
  const { data: insc } = await supabase
    .from("inscripciones")
    .select("alumno_id, alumnos(id, nombre, apellido, telefono)")
    .eq("curso_id", curso_id)
    .neq("estado", "Baja");

  const WA_TOKEN = Deno.env.get("META_WA_TOKEN")!;
  const PHONE_ID = Deno.env.get("WA_PHONE_NUMBER_ID")!;
  const WA_API = `https://graph.facebook.com/v21.0/${PHONE_ID}/messages`;

  const results = { sent: 0, failed: 0, sin_telefono: 0, errors: [] as string[] };

  for (const i of (insc || [])) {
    const alumno = (i as any).alumnos;
    if (!alumno?.telefono) { results.sin_telefono++; continue; }

    const waPhone = formatWAPhone(alumno.telefono);
    if (!waPhone) { results.sin_telefono++; continue; }

    const nombre = [alumno.nombre, alumno.apellido].filter(Boolean).join(" ") || "Alumno";

    try {
      const res = await fetch(WA_API, {
        method: "POST",
        headers: { "Authorization": `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: waPhone,
          type: "template",
          template: {
            name: "nps_post_curso",
            language: { code: "es_AR" },
            components: [{
              type: "body",
              parameters: [
                { type: "text", text: nombre },
                { type: "text", text: curso?.nombre || "el curso" },
              ],
            }],
          },
        }),
      });

      const data = await res.json();

      if (res.ok && data.messages?.[0]?.id) {
        await supabase.from("nps_envios").insert({
          curso_id,
          alumno_id: alumno.id,
          telefono: waPhone,
          alumno_nombre: nombre,
          wa_message_id: data.messages[0].id,
          estado: "enviado",
        });
        results.sent++;
      } else {
        results.failed++;
        results.errors.push(`${nombre}: ${data.error?.message || `HTTP ${res.status}`}`);
      }
    } catch (e) {
      results.failed++;
      results.errors.push(`${nombre}: ${(e as Error).message}`);
    }
  }

  return new Response(JSON.stringify(results), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
