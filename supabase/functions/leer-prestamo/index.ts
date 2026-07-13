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
    const { url } = await req.json();
    if (!url) throw new Error("url requerida");

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("anthropic_api_key");
    if (!apiKey) throw new Error("Sin API key");
    const h = { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" };

    // Descargar el archivo (PDF o imagen)
    const fileRes = await fetch(url);
    if (!fileRes.ok) throw new Error("No se pudo descargar el archivo");
    const contentType = fileRes.headers.get("content-type") || "application/pdf";
    const buffer = await fileRes.arrayBuffer();
    const b64 = toBase64(buffer);

    // Determinar si es PDF o imagen
    const isPdf = contentType.includes("pdf") || url.toLowerCase().endsWith(".pdf");
    const isImage = contentType.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(url);

    // Construir el content según el tipo
    let contentBlock: unknown;
    if (isPdf) {
      contentBlock = {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: b64 }
      };
    } else if (isImage) {
      const mediaType = contentType.startsWith("image/") ? contentType : "image/jpeg";
      contentBlock = {
        type: "image",
        source: { type: "base64", media_type: mediaType, data: b64 }
      };
    } else {
      throw new Error("Formato no soportado. Usá JPG, PNG o PDF.");
    }

    const prompt = `Analizá este cuadro de marcha / plan de pagos de préstamo bancario y extraé la información en JSON estricto.

IMPORTANTE: Todos los números deben ser valores numéricos JSON puros (sin puntos ni comas como separadores de miles, sin símbolo $).
Ejemplos: 1200000 (no 1.200.000), 5833.33 (no 5.833,33).

Devolvé SOLO el JSON, sin markdown, sin explicaciones:
{
  "entidad": "nombre del banco o entidad",
  "nombre_prestamo": "descripción o nombre del préstamo",
  "monto_original": número,
  "tasa_nominal_anual": número (porcentaje, ej: 33.5),
  "tasa_efectiva_anual": número o null,
  "fecha_inicio": "YYYY-MM-DD",
  "cuotas": [
    {
      "nro": número de cuota,
      "fecha": "YYYY-MM-DD",
      "capital": número o null,
      "intereses": número o null,
      "monto_total": número,
      "saldo_restante": número o null,
      "pagada": true/false (si el documento indica que está pagada)
    }
  ]
}

Si no encontrás un campo, usá null. Si no hay detalle de capital/intereses por cuota, dejá esos campos en null.`;

    const body = {
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      messages: [{ role: "user", content: [contentBlock, { type: "text", text: prompt }] }]
    };

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: h, body: JSON.stringify(body) });
    if (!aiRes.ok) {
      const errText = await aiRes.text();
      throw new Error("Claude API error: " + errText.slice(0, 200));
    }
    const aiData = await aiRes.json();
    const text = aiData.content?.[0]?.text || "";

    // Extraer JSON de la respuesta (puede venir con markdown ```json ... ```)
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/```\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : text.trim();

    // Sanitizar números con formato argentino antes de parsear
    const sanitized = jsonStr.replace(/(-?\d{1,3})(\.\d{3})+(?=\s*[,\}\]])/g, (m: string) => m.replace(/\./g, ''));

    let parsed;
    try {
      parsed = JSON.parse(sanitized);
    } catch (e) {
      // Si falla, intentar con el texto original
      try { parsed = JSON.parse(jsonStr); }
      catch { throw new Error("No se pudo parsear la respuesta de Claude: " + (e as Error).message); }
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
