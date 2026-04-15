const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
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
  try {
    const { url } = await req.json();
    if (!url) throw new Error("url requerida");

    const apiKey = Deno.env.get("anthropic_api_key") || Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("Sin API key");
    const h = { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" };

    const modelsRes = await fetch("https://api.anthropic.com/v1/models", { headers: h });
    const modelsData = await modelsRes.json();
    const preferred = ["claude-3-5-sonnet","claude-3-5-haiku","claude-3-sonnet","claude-3-haiku","claude-3-opus"];
    const available = modelsData.data?.map((m: any) => m.id) || [];
    const model = available.find((id: string) => preferred.some(p => id.includes(p))) || available[0];
    if (!model) throw new Error("No hay modelos: " + JSON.stringify(available));

    const fileRes = await fetch(url);
    if (!fileRes.ok) throw new Error("No se pudo obtener archivo: " + fileRes.status);
    const ct = fileRes.headers.get("content-type") || "";
    const base64 = toBase64(await fileRes.arrayBuffer());
    const isPdf = ct.includes("pdf") || url.toLowerCase().endsWith(".pdf");

    const promptText = `Sos un experto en facturación argentina. Analizá esta factura y devolvé ÚNICAMENTE un JSON (sin markdown):
{
  "tipo": "A|B|C|M|X",
  "numero": "XXXX-XXXXXXXX",
  "fecha": "YYYY-MM-DD",
  "fecha_vencimiento": "YYYY-MM-DD o null",
  "proveedor": "razón social del EMISOR (quien vende)",
  "cuit": "XX-XXXXXXXX-X del EMISOR",
  "concepto": "descripción del bien/servicio",
  "monto_neto": número,
  "iva": número,
  "neto_21": número o 0,
  "neto_105": número o 0,
  "neto_exento": número o 0,
  "percepcion_iva": número o 0,
  "percepcion_iibb": número o 0,
  "impuesto_interno": número o 0,
  "otros_impuestos": número o 0,
  "total": número,
  "sociedad": "SUDES o POINTERS"
}
Para "fecha_vencimiento": buscá la fecha de vencimiento/pago de la factura. Si no aparece, devolvé null.
Para el desglose de neto por alícuota:
- neto_21: suma de bases imponibles gravadas al 21%
- neto_105: suma de bases imponibles gravadas al 10.5%
- neto_exento: monto exento o no gravado (excluye percepciones IIBB e impuestos internos)
Si no podés distinguir las alícuotas, dejá los tres en 0 y completá solo monto_neto.
Diferenciá con precisión:
- iva: IVA discriminado (21%, 10.5%, etc.)
- percepcion_iva: percepciones de IVA (Ret/Perc IVA, Percepción AFIP IVA)
- percepcion_iibb: percepciones/retenciones de Ingresos Brutos (IIBB, RIB, cualquier provincia)
- impuesto_interno: impuestos internos (combustibles, tabaco, seguros, etc.)
- otros_impuestos: cualquier otro impuesto no clasificado arriba
Para el campo "sociedad": mirá a quién está dirigida la factura (el RECEPTOR/COMPRADOR):
- Si el receptor es "SUDES SAS" o CUIT 30-71699117-9 → "SUDES"
- Si el receptor es "POINTERS SAS" o CUIT 30-71696585-2 → "POINTERS"
- Si no podés determinarlo → "SUDES" por defecto
Usá null si no encontrás un campo. Números sin puntos de miles (solo dígitos y punto decimal).`;

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
