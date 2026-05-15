import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { message, historial = [], canal = "panel" } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const [cursos, inscripciones, alumnos] = await Promise.all([
      supabase.from("cursos").select("*").order("fecha_inicio", { ascending: true }),
      supabase.from("inscripciones").select("*"),
      supabase.from("alumnos").select("id, nombre, apellido, email, especialidad"),
    ]);

    const hoy = new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Salta" });

    const conciso = canal === "whatsapp"
      ? "Respondé MUY CONCISO (máximo 4 párrafos cortos, sin tablas largas). Usá emojis para claridad."
      : "Podés usar listas y formato markdown.";

    const sistema = `Sos el agente de cursos de Metanoia SMX. Hoy es ${hoy}.
Metanoia dicta cursos de capacitación médica en Salta, con respaldo del Colegio de Médicos y el Ministerio de Salud.
Respondé en español, de forma clara. ${conciso}

CURSOS: ${JSON.stringify(cursos.data)}
INSCRIPCIONES: ${JSON.stringify(inscripciones.data)}
ALUMNOS: ${JSON.stringify(alumnos.data)}`;

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
