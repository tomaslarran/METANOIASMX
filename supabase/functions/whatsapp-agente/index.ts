import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const body = await req.text();
    const params = new URLSearchParams(body);
    const from = params.get("From") ?? "";
    const message = params.get("Body")?.trim() ?? "";

    if (!message) return twiml("Hola! Enviame una pregunta sobre las finanzas de Metanoia.");

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

    const sistema = `Sos el agente financiero de Metanoia SMX respondiendo por WhatsApp. Hoy es ${hoy}.
La empresa tiene dos sociedades: SUDES (capacitación médica) y POINTERS (logística/servicios).
Respondé en español, de forma clara y MUY CONCISA (máximo 3-4 párrafos cortos, sin tablas largas).
Usá pesos argentinos ($) con separador de miles. Podés usar emojis para claridad.
Si algo no podés calcularlo, decílo claramente.

CONCEPTOS DE CASH FLOW: ${JSON.stringify(conceptos.data)}
VALORES POR PERÍODO: ${JSON.stringify(valores.data)}
COBRANZAS: ${JSON.stringify(cobranzas.data)}
PRÉSTAMOS ACTIVOS: ${JSON.stringify(prestamos.data)}
INVERSIONES: ${JSON.stringify(inversiones.data)}`;

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
        messages: [{ role: "user", content: message }],
      }),
    });

    const data = await res.json();

    if (data.type === "error") throw new Error(data.error?.message ?? "API error");

    const respuesta = data.content?.[0]?.text ?? "No pude generar una respuesta.";
    return twiml(respuesta);

  } catch (err) {
    return twiml("Hubo un error procesando tu consulta. Intentá de nuevo en unos segundos.");
  }
});

function twiml(msg: string): Response {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escXml(msg)}</Message></Response>`;
  return new Response(xml, { headers: { "Content-Type": "text/xml" } });
}

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
