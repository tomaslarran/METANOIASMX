import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://tomaslarran.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FB_PAGE_ID = "478694861999786";
const WA_PHONE_NUMBER_ID = Deno.env.get("WA_PHONE_NUMBER_ID") || "1064395966761110";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
  const supabaseAuth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const { from_id, plataforma, mensaje, enviado_por } = await req.json();
    if (!from_id || !plataforma || !mensaje?.trim()) {
      return new Response(JSON.stringify({ error: "Faltan parámetros" }), { status: 400, headers: cors });
    }

    // Enviar por la API correspondiente
    if (plataforma === "whatsapp") {
      const waToken = Deno.env.get("META_WA_TOKEN")!;
      const res = await fetch(`https://graph.facebook.com/v21.0/${WA_PHONE_NUMBER_ID}/messages`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${waToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: from_id,
          type: "text",
          text: { body: mensaje.trim() },
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`WhatsApp API error: ${err.slice(0, 200)}`);
      }

    } else if (plataforma === "instagram" || plataforma === "facebook") {
      const pageToken = Deno.env.get("META_FB_PAGE_TOKEN")!;
      const res = await fetch(`https://graph.facebook.com/v21.0/${FB_PAGE_ID}/messages`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${pageToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: from_id },
          message: { text: mensaje.trim() },
          messaging_type: "RESPONSE",
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Messenger API error: ${err.slice(0, 200)}`);
      }

    } else {
      throw new Error(`Plataforma no soportada: ${plataforma}`);
    }

    // Guardar en DB como respuesta manual
    await supabase.from("mensajes_publico").insert({
      plataforma,
      from_id,
      from_name: from_id,
      mensaje: "",
      respuesta: mensaje.trim(),
      estado: "respondido",
      es_respuesta_manual: true,
      enviado_por: enviado_por || null,
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
