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

    const apiKey = Deno.env.get("anthropic_api_key") || Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("Sin API key");
    const h = { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" };

    const model = "claude-sonnet-4-6";

    const fileRes = await fetch(url);
    if (!fileRes.ok) throw new Error("No se pudo obtener archivo: " + fileRes.status);
    const ct = fileRes.headers.get("content-type") || "";
    const base64 = toBase64(await fileRes.arrayBuffer());
    const isPdf = ct.includes("pdf") || url.toLowerCase().endsWith(".pdf");

    const promptText = "Sos un experto en facturacion argentina. Analiza esta factura y devuelve UNICAMENTE un JSON (sin markdown, sin texto extra):\n" +
      "{\n" +
      "  \"tipo\": \"A|B|C|M|X\",\n" +
      "  \"numero\": \"XXXX-XXXXXXXX\",\n" +
      "  \"fecha\": \"YYYY-MM-DD\",\n" +
      "  \"fecha_vencimiento\": \"YYYY-MM-DD o null\",\n" +
      "  \"proveedor\": \"razon social del EMISOR (quien vende/emite)\",\n" +
      "  \"cuit\": \"XX-XXXXXXXX-X del EMISOR\",\n" +
      "  \"concepto\": \"descripcion breve del bien/servicio\",\n" +
      "  \"monto_neto\": numero,\n" +
      "  \"iva\": numero,\n" +
      "  \"neto_21\": numero o 0,\n" +
      "  \"neto_105\": numero o 0,\n" +
      "  \"neto_27\": numero o 0,\n" +
      "  \"neto_exento\": numero o 0,\n" +
      "  \"percepcion_iva\": numero o 0,\n" +
      "  \"percepcion_iva_15\": numero o 0,\n" +
      "  \"percepcion_iibb\": numero o 0,\n" +
      "  \"impuesto_interno\": numero o 0,\n" +
      "  \"retencion_ganancias\": numero o 0,\n" +
      "  \"otros_impuestos\": numero o 0,\n" +
      "  \"total\": numero,\n" +
      "  \"sociedad\": \"SUDES o POINTERS\",\n" +
      "  \"cuit_receptor\": \"CUIT de quien RECIBE la factura\"\n" +
      "}\n\n" +
      "REGLAS:\n" +
      "1. proveedor y cuit: siempre del EMISOR (quien vende, datos de arriba).\n" +
      "2. cuit_receptor: CUIT de quien compra/recibe (datos del cliente).\n" +
      "3. sociedad: mira el RECEPTOR. Si es SUDES o CUIT 30-71699117-9 -> SUDES. Si es POINTERS o CUIT 30-71696585-2 -> POINTERS. Si no se puede determinar -> SUDES por defecto.\n" +
      "4. Desglose neto: neto_21 (21%), neto_105 (10.5%), neto_27 (27% gas/luz/telefonia entre empresas), neto_exento. Si no podes distinguir pon 0 en todos y usa solo monto_neto.\n" +
      "5. iva: IVA discriminado total. percepcion_iva: percepcion IVA 3%. percepcion_iva_15: percepcion IVA 1.5%. percepcion_iibb: retenciones/percepciones IIBB. impuesto_interno: imp. internos. otros_impuestos: otros cargos no clasificados.\n" +
      "6. retencion_ganancias: monto de retencion de Impuesto a las Ganancias que figura en la factura o comprobante de retencion adjunto (campo 'Ret. Ganancias', 'Retencion Gcias', codigo SICORE, etc). Si no hay, 0.\n" +
      "7. null si no encontras el campo. Numeros sin puntos de miles (1234.56 no 1.234,56).";

    const content = isPdf
      ? [{ type:"document", source:{type:"base64", media_type:"application/pdf", data:base64} }, { type:"text", text:promptText }]
      : [{ type:"image", source:{type:"base64", media_type: ct.includes("png")?"image/png":"image/jpeg", data:base64} }, { type:"text", text:promptText }];

    const reqHeaders: Record<string,string> = {...h};
    if (isPdf) reqHeaders["anthropic-beta"] = "pdfs-2024-09-25";

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST", headers: reqHeaders,
      body: JSON.stringify({ model, max_tokens:1024, messages:[{role:"user", content}] })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(data));

    const text = data.content?.[0]?.text?.trim() ?? "";
    const clean = text.replace(/^```[a-z]*\n?/,"").replace(/\n?```$/,"").trim();
    return new Response(clean, { headers:{...corsHeaders,"Content-Type":"application/json"} });
  } catch(e) {
    return new Response(JSON.stringify({error:(e as Error).message}), { status:500, headers:corsHeaders });
  }
});
