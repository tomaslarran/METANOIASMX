import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { message, historial = [] } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const [conceptos, valores, cobranzas, prestamos, inversiones] = await Promise.all([
      supabase.from("cf_conceptos").select("*").eq("activo", true),
      supabase.from("cf_valores").select("*, cf_conceptos(nombre, tipo, categoria, sociedad)"),
      supabase.from("cf_cobranzas").select("*").order("fecha_vencimiento"),
      supabase.from("cf_prestamos").select("*").eq("activo", true),
      supabase.from("cf_inversiones").select("*"),
    ]);

    const hoy = new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Salta" });

    const sistema = `Sos el agente financiero de Metanoia SMX. Hoy es ${hoy}.
La empresa tiene dos sociedades: SUDES (capacitación médica) y POINTERS (logística/servicios).
Respondé en español, de forma clara y concisa. Usá pesos argentinos ($) con separador de miles.
Si algo no podés calcularlo con los datos disponibles, decílo claramente.

CONCEPTOS DE CASH FLOW:
${JSON.stringify(conceptos.data)}

VALORES POR PERÍODO (monto=proyectado, monto_real=ejecutado):
${JSON.stringify(valores.data)}

COBRANZAS (cheques y cobros):
${JSON.stringify(cobranzas.data)}

PRÉSTAMOS ACTIVOS:
${JSON.stringify(prestamos.data)}

INVERSIONES:
${JSON.stringify(inversiones.data)}`;

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
        messages: [...historial, { role: "user", content: message }],
      }),
    });

    const data = await res.json();
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
