import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://tomaslarran.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const FUENTES = [
  { nombre: "Viumi", query: "promociones descuentos Viumi Argentina cuotas sin interés" },
  { nombre: "Payway", query: "promociones descuentos Payway Argentina cuotas sin interés" },
  { nombre: "Banco Macro", query: "promociones Banco Macro Argentina descuentos cuotas sin interés tarjeta" },
  { nombre: "Mercado Pago", query: "promociones Mercado Pago Argentina descuentos cuotas sin interés" },
  { nombre: "ICBC", query: "promociones ICBC Argentina descuentos cuotas sin interés tarjeta" },
];

async function buscarTavily(query: string, apiKey: string) {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "advanced",
      max_results: 5,
      include_answer: true,
    }),
  });
  if (!res.ok) return null;
  return await res.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Autenticación: JWT de usuario (disparo manual desde el panel) O CRON_SECRET (disparo programado)
  const authHeader = req.headers.get("Authorization");
  const cronSecret = req.headers.get("x-cron-secret");
  const CRON_SECRET = Deno.env.get("CRON_SECRET");
  let autorizado = false;

  if (cronSecret && CRON_SECRET && cronSecret === CRON_SECRET) {
    autorizado = true;
  } else if (authHeader) {
    const supabaseAuth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (user) autorizado = true;
  }
  if (!autorizado) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const TAVILY_API_KEY = Deno.env.get("TAVILY_API_KEY");
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!TAVILY_API_KEY || !ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "Faltan TAVILY_API_KEY o ANTHROPIC_API_KEY en Secrets" }), { status: 500, headers: cors });
    }

    // 1. Buscar en la web para cada fuente
    const resultadosBusqueda: { fuente: string; resultado: any }[] = [];
    for (const f of FUENTES) {
      const r = await buscarTavily(f.query, TAVILY_API_KEY);
      if (r) resultadosBusqueda.push({ fuente: f.nombre, resultado: r });
    }

    if (!resultadosBusqueda.length) {
      return new Response(JSON.stringify({ error: "La búsqueda web no devolvió resultados (Tavily)" }), { status: 500, headers: cors });
    }

    // 2. Pedirle a Claude que estructure las promociones encontradas
    const hoy = new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Salta" });
    const contexto = resultadosBusqueda.map(r => `### Fuente: ${r.fuente}\n${r.resultado.answer || ""}\n${(r.resultado.results || []).map((x: any) => `- ${x.title}: ${x.content?.slice(0, 500)} (${x.url})`).join("\n")}`).join("\n\n");

    const sistema = `Sos un analista que extrae promociones de pago (descuentos, cuotas sin interés) de medios de cobro para un centro de simulación médica en Salta, Argentina (Metanoia SMX / SUDES / POINTERS). Hoy es ${hoy}.
Te paso resultados de búsqueda web sobre 5 fuentes: Viumi, Payway, Banco Macro, Mercado Pago, ICBC.
Extraé SOLO promociones concretas y vigentes (o próximas a vigencia) que la empresa podría usar u ofrecer a sus clientes al cobrar cursos.
Ignorá resultados genéricos, viejos, o que no sean promociones reales de pago/descuento/cuotas.
Si no encontrás nada concreto para una fuente, no inventes — omitila.
Respondé SOLO con un JSON array (sin texto adicional, sin markdown), cada elemento:
{"fuente":"Viumi|Payway|Banco Macro|Mercado Pago|ICBC","titulo":"...","descripcion":"resumen breve en español, máx 200 caracteres","descuento_pct":null o número,"cuotas_sin_interes":null o número entero,"vigencia_desde":"YYYY-MM-DD o null","vigencia_hasta":"YYYY-MM-DD o null","url_fuente":"..."}
Si no hay NINGUNA promoción concreta en todo el contexto, respondé: []`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: sistema,
        messages: [{ role: "user", content: contexto }],
      }),
    });
    const data = await res.json();
    if (data.type === "error") throw new Error(data.error?.message ?? "API error");
    const texto = data.content?.[0]?.text ?? "[]";
    const jsonMatch = texto.match(/\[[\s\S]*\]/);
    const promos = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    // 3. Limpiar pendientes anteriores (no revisados) y cargar los nuevos hallazgos
    await supabase.from("promociones_pago").delete().eq("estado", "pendiente");

    if (promos.length > 0) {
      const rows = promos.map((p: any) => ({
        fuente: p.fuente,
        titulo: p.titulo,
        descripcion: p.descripcion || null,
        descuento_pct: p.descuento_pct ?? null,
        cuotas_sin_interes: p.cuotas_sin_interes ?? null,
        vigencia_desde: p.vigencia_desde || null,
        vigencia_hasta: p.vigencia_hasta || null,
        url_fuente: p.url_fuente || null,
        estado: "pendiente",
        raw: p,
      }));
      await supabase.from("promociones_pago").insert(rows);
    }

    return new Response(JSON.stringify({ encontradas: promos.length }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
