import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import nodemailer from "npm:nodemailer@6.9.9";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { email, nombre, curso, instructores, fecha, diploma_base64 } = await req.json();

    // Remover el prefijo data:image/png;base64,
    const base64Content = diploma_base64.replace(/^data:image\/png;base64,/, "");

    const transporter = nodemailer.createTransport({
      host: Deno.env.get("SMTP_HOST"),
      port: 465,
      secure: true,
      auth: {
        user: Deno.env.get("SMTP_USER"),
        pass: Deno.env.get("SMTP_PASS"),
      },
    });

    const html = `
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
            <span style="color: #888; font-size: 14px;">${fecha}${instructores ? " · " + instructores : ""}</span>
          </div>
          <p style="color: #555;">Adjunto encontrás tu diploma en formato imagen, listo para guardar e imprimir.</p>
          <p style="color: #555;">¡Felicitaciones por completar la formación!</p>
          <p style="color: #555;margin-top:24px">Equipo Metanoia SMX</p>
        </div>
        <div style="background: #1a0a5e; padding: 16px; text-align: center;">
          <p style="color: #9a8ccc; font-size: 12px; margin: 0;">Metanoia SMX · Salta, Argentina · www.metanoiasme.com</p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"Metanoia SMX" <${Deno.env.get("SMTP_USER")}>`,
      to: email,
      subject: `📜 Tu diploma — ${curso} | Metanoia SMX`,
      html,
      attachments: [
        {
          filename: `Diploma_${nombre.replace(/[^a-zA-Z0-9]/g, "_")}.png`,
          content: Buffer.from(base64Content, "base64"),
          contentType: "image/png",
        },
      ],
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
