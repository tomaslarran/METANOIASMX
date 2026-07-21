import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")!;

serve(async (req) => {
  try {
    const body = await req.text();

    // ── Verificación de firma Twilio (X-Twilio-Signature) ──────────────────────
    const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    if (twilioToken) {
      const twilioSig = req.headers.get("X-Twilio-Signature") || "";
      const params2 = new URLSearchParams(body);
      const sortedParams = [...params2.entries()].sort(([a], [b]) => a.localeCompare(b));
      let stringToSign = "https://jppxmdvddvbsvymogvcp.supabase.co/functions/v1/whatsapp-agente";
      for (const [k, v] of sortedParams) stringToSign += k + v;
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw", encoder.encode(twilioToken),
        { name: "HMAC", hash: "SHA-1" }, false, ["sign"]
      );
      const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(stringToSign));
      const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
      if (twilioSig !== expected) {
        console.error("Invalid Twilio signature");
        return new Response("Forbidden", { status: 403 });
      }
    }

    const params = new URLSearchParams(body);
    const from = params.get("From") ?? "";
    const message = params.get("Body")?.trim() ?? "";
    const mediaUrl = params.get("MediaUrl0") ?? "";
    const mediaType = params.get("MediaContentType0") ?? "";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verificar whitelist: solo números autorizados en tabla usuarios
    const fromNum = from.replace("whatsapp:", "");
    const { data: usuarioWpp } = await supabase
      .from("usuarios")
      .select("id,nombre")
      .eq("wpp_autorizado", true)
      .or(`telefono.eq.${fromNum},telefono.eq.${from}`)
      .maybeSingle();

    if (!usuarioWpp) {
      return twiml("⛔ Tu número no está autorizado para cargar facturas por WhatsApp. Contactá al administrador del panel.");
    }

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

    // Paso 4: usuario responde el proveedor → preguntar medio de pago
    if (sesion?.paso === "proveedor") {
      if (!message) return twiml("Por favor escribí el nombre del proveedor.");

      const datos = sesion.datos as Record<string, unknown>;
      const sociedad = datos.sociedad as string;

      // Buscar medios de pago activos para esta sociedad
      const { data: medios } = await supabase
        .from("medios_pago")
        .select("nombre, banco")
        .eq("activo", true)
        .or(`sociedad.eq.${sociedad},sociedad.eq.Ambas`)
        .order("nombre");

      const lista = (medios ?? []) as Array<{ nombre: string; banco: string | null }>;

      await supabase.from("wpp_sesiones").update({
        paso: "medio_pago",
        datos: { ...datos, proveedor: message.trim(), medios_pago_lista: lista },
        updated_at: new Date().toISOString(),
      }).eq("telefono", from).eq("tipo", "factura");

      const opcs = lista.map((m, i) =>
        `${i + 1}. ${m.nombre}${m.banco ? ` — ${m.banco}` : ""}`
      ).join("\n");

      return twiml(`Proveedor: *${message.trim()}* ✓\n\n¿Cómo se pagó esta factura?\n\n${opcs}\n\n0. Sin pagar / Pendiente`);
    }

    // Paso 5: usuario responde el medio de pago → guardar todo
    if (sesion?.paso === "medio_pago") {
      const datos = sesion.datos as Record<string, unknown>;
      const lista = (datos.medios_pago_lista ?? []) as Array<{ nombre: string; banco: string | null }>;

      const txt = message.toLowerCase().trim();
      let medioPago: string | null = null;

      if (txt === "0" || txt.includes("sin pagar") || txt.includes("pendiente")) {
        medioPago = null;
      } else {
        // Match por número
        const num = parseInt(txt);
        if (!isNaN(num) && num >= 1 && num <= lista.length) {
          const m = lista[num - 1];
          medioPago = m.nombre + (m.banco ? ` — ${m.banco}` : "");
        } else {
          // Match por nombre parcial
          const match = lista.find(m =>
            m.nombre.toLowerCase().includes(txt) || txt.includes(m.nombre.toLowerCase())
          );
          if (match) medioPago = match.nombre + (match.banco ? ` — ${match.banco}` : "");
        }

        if (medioPago === null && txt !== "0" && !txt.includes("sin")) {
          const opcs = lista.map((m, i) => `${i + 1}. ${m.nombre}`).join("\n");
          return twiml(`No entendí esa opción. Respondé con el número:\n\n${opcs}\n\n0. Sin pagar / Pendiente`);
        }
      }

      const hoy = new Date().toISOString().split("T")[0];

      const { error: insertErr } = await supabase.from("comprobantes_compra").insert({
        archivo_url: datos.archivo_url as string,
        sociedad: datos.sociedad as string,
        cargado_por: datos.encargado as string,
        proveedor: datos.proveedor as string,
        estado: "pendiente",
        fecha: hoy,
        total: null,
        fecha_imputacion: hoy,
        ...(medioPago ? { notas: `💳 ${medioPago}` } : {}),
      });

      if (insertErr) {
        console.error("Error al guardar comprobante:", insertErr);
        return twiml(`❌ Hubo un error al guardar la factura (${insertErr.message}). Por favor intentá de nuevo o cargala desde el panel.`);
      }

      await supabase.from("wpp_sesiones").delete().eq("telefono", from).eq("tipo", "factura");

      const resumen = [
        `• Proveedor: ${datos.proveedor}`,
        `• Sociedad: ${datos.sociedad}`,
        `• Encargado: ${datos.encargado}`,
        medioPago ? `• Pagado con: ${medioPago}` : "• Sin pagar (pendiente)",
      ].join("\n");

      return twiml(`✅ Factura guardada.\n\n📋 *Resumen:*\n${resumen}\n\nPodés verla en el panel → Comprobantes de Compra.`);
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
