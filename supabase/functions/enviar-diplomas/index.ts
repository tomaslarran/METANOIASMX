import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { email, nombre, curso, instructores, fecha, diploma_base64 } = await req.json();

    const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_KEY) throw new Error("RESEND_API_KEY no configurada");

    // Remover el prefijo data:image/png;base64, si viene del canvas
    const base64Content = diploma_base64.replace(/^data:image\/png;base64,/, "");

    const body = {
      from: "Metanoia SMX <diplomas@metanoiasmx.com>",
      to: [email],
      subject: `Tu diploma — ${curso} | Metanoia SMX`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #4a2eb4; padding: 24px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Metanoia SMX</h1>
            <p style="color: #d4c6ff; margin: 4px 0 0; font-size: 13px;">Capacitación Médica · Simulación Clínica</p>
          </div>
          <div style="padding: 32px 24px; background: #fafafa;">
            <p style="font-size: 16px; color: #333;">Estimado/a <strong>${nombre}</strong>,</p>
            <p style="color: #555;">Es un placer hacerte llegar tu diploma de participación en el curso:</p>
            <div style="background: white; border-left: 4px solid #4a2eb4; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
              <strong style="font-size: 18px; color: #1a0a5e;">${curso}</strong><br>
              <span style="color: #888; font-size: 14px;">${fecha} · ${instructores || "Metanoia SMX"}</span>
            </div>
            <p style="color: #555;">Adjunto encontrás tu diploma en formato imagen, listo para guardar e imprimir.</p>
            <p style="color: #555;">¡Felicitaciones por completar la formación!</p>
          </div>
          <div style="background: #1a0a5e; padding: 16px; text-align: center;">
            <p style="color: #9a8ccc; font-size: 12px; margin: 0;">Metanoia SMX · Salta, Argentina · www.metanoiasme.com</p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: `Diploma_${nombre.replace(/[^a-zA-Z0-9]/g, "_")}.png`,
          content: base64Content,
        },
      ],
    };

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.message || "Error al enviar email");

    return new Response(JSON.stringify({ ok: true, id: data.id }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
