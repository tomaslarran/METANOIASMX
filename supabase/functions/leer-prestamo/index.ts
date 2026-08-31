const corsHeaders = {
  "Access-Control-Allow-Origin": "https://tomaslarran.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.slice(i, i + 8192));
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const supabaseAuth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

  try {
    const body = await req.json();
    const urlList: string[] = body.urls?.length ? body.urls : (body.url ? [body.url] : []);
    if (!urlList.length) throw new Error("url requerida");

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("anthropic_api_key");
    if (!apiKey) throw new Error("Sin API key");
    const h = { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" };

    const contentBlocks: unknown[] = [];
    for (const url of urlList) {
      const fileRes = await fetch(url);
      if (!fileRes.ok) throw new Error("No se pudo descargar: " + url.split("/").pop());
      const contentType = fileRes.headers.get("content-type") || "application/octet-stream";
      const buffer = await fileRes.arrayBuffer();
      const b64 = toBase64(buffer);
      const isPdf = contentType.includes("pdf") || url.toLowerCase().endsWith(".pdf");
      const isImage = contentType.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
      if (isPdf) {
        contentBlocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } });
      } else if (isImage) {
        const mediaType = contentType.startsWith("image/") ? contentType.split(";")[0] : "image/jpeg";
        contentBlocks.push({ type: "image", source: { type: "base64", media_type: mediaType, data: b64 } });
      } else {
        throw new Error("Formato no soportado en " + url.split("/").pop() + ". Usá JPG, PNG o PDF.");
      }
    }

    const tool = {
      name: "extraer_prestamo",
      description: "Extrae la información estructurada de un cuadro de marcha o plan de pagos de préstamo bancario",
      input_schema: {
        type: "object",
        properties: {
          entidad: { type: "string", description: "Nombre del banco o entidad financiera" },
          nombre_prestamo: { type: "string", description: "Descripción o nombre del préstamo" },
          monto_original: { type: "number", description: "Monto original del préstamo, número puro sin separadores" },
          tasa_nominal_anual: { type: ["number", "null"], description: "TNA en porcentaje, ej: 33.5" },
          tasa_efectiva_anual: { type: ["number", "null"], description: "TEA en porcentaje, ej: 38.5" },
          fecha_inicio: { type: ["string", "null"], description: "Fecha de inicio en formato YYYY-MM-DD" },
          cuotas: {
            type: "array",
            description: "Lista de cuotas del plan de pagos",
            items: {
              type: "object",
              properties: {
                nro: { type: "number", description: "Número de cuota" },
                fecha: { type: ["string", "null"], description: "Fecha de vencimiento YYYY-MM-DD" },
                capital: { type: ["number", "null"], description: "Amortización de capital, número puro" },
                intereses: { type: ["number", "null"], description: "Intereses, número puro" },
                monto_total: { type: "number", description: "Monto total de la cuota, número puro" },
                saldo_restante: { type: ["number", "null"], description: "Saldo pendiente después de pagar, número puro" },
                pagada: { type: "boolean", description: "true si el documento indica que está pagada" }
              },
              required: ["nro", "monto_total", "pagada"]
            }
          }
        },
        required: ["entidad", "cuotas"]
      }
    };

    const prompt = `Analizá este cuadro de marcha / plan de pagos de préstamo bancario y extraé toda la información usando la herramienta extraer_prestamo.

Todos los montos deben ser números puros (sin puntos ni comas como separadores de miles, sin símbolo $).
Si no encontrás un campo, usá null.
Si no hay detalle de capital/intereses por cuota, dejá esos campos en null.`;

    const claudeBody = {
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      tools: [tool],
      tool_choice: { type: "tool", name: "extraer_prestamo" },
      messages: [{ role: "user", content: [...contentBlocks, { type: "text", text: prompt }] }]
    };

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: h, body: JSON.stringify(claudeBody) });
    if (!aiRes.ok) {
      const errText = await aiRes.text();
      throw new Error("Claude API error: " + errText.slice(0, 200));
    }
    const aiData = await aiRes.json();

    // Con tool_use, Claude devuelve el input como objeto JSON válido — sin parsing necesario
    const toolUse = (aiData.content || []).find((c: { type: string }) => c.type === "tool_use");
    if (!toolUse?.input) throw new Error("Claude no devolvió datos estructurados");

    return new Response(JSON.stringify(toolUse.input), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
