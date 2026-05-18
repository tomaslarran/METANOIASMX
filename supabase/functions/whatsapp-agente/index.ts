import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")!;

serve(async (req) => {
  try {
    const body = await req.text();
    const params = new URLSearchParams(body);
    const from = params.get("From") ?? "";
    const message = params.get("Body")?.trim() ?? "";
    const mediaUrl = params.get("MediaUrl0") ?? "";
    const mediaType = params.get("MediaContentType0") ?? "";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verificar si hay una sesión de carga de factura activa para este número
    const { data: sesion } = await supabase
      .from("wpp_sesiones")
      .select("*")
      .eq("telefono", from)
      .eq("tipo", "factura")
      .single();

    // --- FLUJO DE CARGA DE FACTURA ---

    // Paso 1: usuario mandó una imagen
    if (mediaUrl && mediaType.startsWith("image/")) {
      // Descargar imagen de Twilio
      const imgRes = await fetch(mediaUrl, {
        headers: {
          Authorization: "Basic " + btoa(TWILIO_SID + ":" + TWILIO_TOKEN),
        },
      });
      const imgBuffer = await imgRes.arrayBuffer();
      const ext = mediaType.split("/")[1] ?? "jpg";
      const fileName = `${Date.now()}_${from.replace(/\D/g, "")}.${ext}`;

      // Subir a Supabase Storage
      const { error: uploadErr } = await supabase.storage
        .from("Facturas")
        .upload(fileName, imgBuffer, { contentType: mediaType });

      if (uploadErr) throw new Error("Error al subir imagen: " + uploadErr.message);

      const archivoUrl = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/Facturas/${fileName}`;

      // Guardar sesión pendiente
      await supabase.from("wpp_sesiones").upsert({
        telefono: from,
        tipo: "factura",
        paso: "sociedad",
        datos: { archivo_url: archivoUrl },
        updated_at: new Date().toISOString(),
      }, { onConflict: "telefono,tipo" });

      return twiml("✅ Imagen recibida. ¿A qué sociedad corresponde esta factura?\n\n1️⃣ SUDES\n2️⃣ POINTERS");
    }

    // Paso 2: usuario responde la sociedad
    if (sesion?.paso === "sociedad") {
      const txt = message.toLowerCase();
      let sociedad = "";
      if (txt.includes("1") || txt.includes("sudes")) sociedad = "SUDES";
      else if (txt.includes("2") || txt.includes("pointers")) sociedad = "POINTERS";
      else return twiml("Por favor respondé *1* para SUDES o *2* para POINTERS.");

      await supabase.from("wpp_sesiones").update({
        paso: "encargado",
        datos: { ...sesion.datos, sociedad },
        updated_at: new Date().toISOString(),
      }).eq("telefono", from).eq("tipo", "factura");

      return twiml(`Sociedad: *${sociedad}* ✓\n\n¿Quién es el encargado de esta factura?\n\n1️⃣ Tomás\n2️⃣ Mario\n3️⃣ Valentina\n4️⃣ Amparo`);
    }

    // Paso 3: usuario responde el encargado
    if (sesion?.paso === "encargado") {
      const txt = message.toLowerCase();
      const opciones: Record<string, string> = { "1": "Tomás", "2": "Mario", "3": "Valentina", "4": "Amparo" };
      let encargado = "";
      for (const [k, v] of Object.entries(opciones)) {
        if (txt.includes(k) || txt.includes(v.toLowerCase())) { encargado = v; break; }
      }
      if (!encargado) return twiml("Por favor respondé 1 (Tomás), 2 (Mario), 3 (Valentina) o 4 (Amparo).");

      await supabase.from("wpp_sesiones").update({
        paso: "proveedor",
        datos: { ...sesion.datos, encargado },
        updated_at: new Date().toISOString(),
      }).eq("telefono", from).eq("tipo", "factura");

      return twiml(`Encargado: *${encargado}* ✓\n\n¿Cuál es el nombre del proveedor? (escribilo libremente)`);
    }

    // Paso 4: usuario responde el proveedor
    if (sesion?.paso === "proveedor") {
      if (!message) return twiml("Por favor escribí el nombre del proveedor.");

      const datos = sesion.datos as Record<string, string>;
      const hoy = new Date().toISOString().split("T")[0];

      // Guardar en comprobantes_compra (tabla existente del panel)
      await supabase.from("comprobantes_compra").insert({
        archivo_url: datos.archivo_url,
        sociedad: datos.sociedad,
        cargado_por: datos.encargado,
        proveedor: message.trim(),
        estado: "pendiente",
        fecha_imputacion: hoy,
      });

      // Limpiar sesión
      await supabase.from("wpp_sesiones").delete().eq("telefono", from).eq("tipo", "factura");

      return twiml(`✅ Factura guardada correctamente.\n\n📋 *Resumen:*\n• Proveedor: ${message.trim()}\n• Sociedad: ${datos.sociedad}\n• Encargado: ${datos.encargado}\n• Estado: Pendiente de revisión\n\nPodés verla en el panel de Metanoia → Comprobantes de Compra.`);
    }

    // --- FLUJO GENERAL DEL AGENTE FINANCIERO ---
    if (!message) return twiml("Hola! Podés enviarme una foto de factura o hacerme una pregunta sobre las finanzas de Metanoia.");

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
Respondé en español, de forma clara y MUY CONCISA (máximo 4 párrafos cortos). Usá emojis para claridad.
Si algo no podés calcularlo, decílo claramente.

CONCEPTOS: ${JSON.stringify(conceptos.data)}
VALORES: ${JSON.stringify(valores.data)}
COBRANZAS: ${JSON.stringify(cobranzas.data)}
PRÉSTAMOS: ${JSON.stringify(prestamos.data)}
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
