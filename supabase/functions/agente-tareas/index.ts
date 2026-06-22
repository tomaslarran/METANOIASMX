import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://tomaslarran.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EQUIPO: Record<string, string> = {
  "335d872b-594c-8130-87af-000274e4aae6": "Tomás",
  "335d872b-594c-81f8-908b-00029b173f99": "Mario",
  "335d872b-594c-8152-a424-00024820cc46": "Valentina",
  "335d872b-594c-81e8-9623-00023e80a236": "Amparo",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
  const supabaseAuth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

  try {
    const { message, historial = [], canal = "panel" } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: tareas } = await supabase
      .from("tareas")
      .select("*")
      .order("fecha_vencimiento", { ascending: true });

    const hoy = new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Salta" });

    // Enriquecer tareas con nombres del equipo
    const tareasEnriquecidas = (tareas ?? []).map(t => ({
      ...t,
      responsables: (t.assignees ?? []).map((id: string) => EQUIPO[id] ?? id),
    }));

    const conciso = canal === "whatsapp"
      ? "Respondé MUY CONCISO (máximo 4 párrafos cortos, sin tablas largas). Usá emojis para claridad."
      : "Podés usar listas y formato markdown.";

    const sistema = `Sos el agente de tareas de Metanoia SMX. Hoy es ${hoy}.
El equipo es: Tomás (gestión económica), Mario (cursos/relaciones), Valentina (contratos/redes), Amparo (administración).
Respondé en español, de forma clara. ${conciso}

TAREAS (todas): ${JSON.stringify(tareasEnriquecidas)}`;

    const historialReciente = historial.slice(-6);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: sistema,
        messages: [...historialReciente, { role: "user", content: message }],
      }),
    });

    const data = await res.json();
    if (data.type === "error") throw new Error(data.error?.message ?? "API error");
    const respuesta = data.content?.[0]?.text ?? "No pude generar una respuesta.";

    return new Response(JSON.stringify({ respuesta }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
