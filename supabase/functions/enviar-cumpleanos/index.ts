import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.9";

const cors = {
  "Access-Control-Allow-Origin": "https://tomaslarran.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Autenticación: JWT de usuario (disparo manual de prueba) O CRON_SECRET (disparo diario programado)
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

    // Fecha de hoy en horario de Salta, no UTC (el cron corre en UTC y a la madrugada
    // el día UTC ya puede ser distinto del día real en Salta).
    const hoyStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Salta" }); // YYYY-MM-DD
    const [, mesHoy, diaHoy] = hoyStr.split("-").map((n) => parseInt(n));

    const { data: usuarios } = await supabase
      .from("usuarios")
      .select("id, nombre, email, estado, fecha_nacimiento")
      .not("fecha_nacimiento", "is", null);

    const todos = (usuarios || []).filter((u: any) => u.estado !== "inactivo");
    const cumpleanieros = todos.filter((u: any) => {
      const [, m, d] = (u.fecha_nacimiento as string).split("-").map((n) => parseInt(n));
      return m === mesHoy && d === diaHoy;
    });

    if (!cumpleanieros.length) {
      return new Response(JSON.stringify({ cumpleanieros: 0 }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    const transporter = nodemailer.createTransport({
      host: Deno.env.get("SMTP_HOST"),
      port: 465,
      secure: true,
      auth: { user: Deno.env.get("SMTP_USER"), pass: Deno.env.get("SMTP_PASS") },
    });

    for (const u of cumpleanieros) {
      // Mail al cumpleañero
      if (u.email) {
        try {
          await transporter.sendMail({
            from: `"Equipo Metanoia SMX" <${Deno.env.get("SMTP_USER")}>`,
            to: u.email,
            subject: `🎂 ¡Feliz cumpleaños, ${u.nombre}!`,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
                <div style="background:linear-gradient(135deg,#4a2eb4,#7c3aed);padding:32px 24px;text-align:center">
                  <div style="font-size:40px;margin-bottom:8px">🎉🎂🎉</div>
                  <h1 style="color:#fff;margin:0;font-size:22px">¡Feliz cumpleaños, ${u.nombre}!</h1>
                </div>
                <div style="padding:28px 24px;background:#fafafa">
                  <p style="font-size:15px;color:#333;line-height:1.6">Hoy es un día especial y desde todo el equipo de <strong>Metanoia SMX</strong> queremos desearte un cumpleaños increíble.</p>
                  <p style="font-size:15px;color:#333;line-height:1.6">Gracias por ser parte de este proyecto y por todo lo que aportás día a día — cada curso, cada simulación, cada detalle que hace que esto funcione, también tiene un poco de vos.</p>
                  <p style="font-size:15px;color:#333;line-height:1.6">Que este nuevo año te traiga mucha salud, alegría y todo lo que te propongas. ¡Disfrutá tu día! 🥳</p>
                  <p style="color:#555;margin-top:28px">Con cariño,<br><strong>Equipo Metanoia SMX</strong></p>
                </div>
                <div style="background:#1a0a5e;padding:16px;text-align:center">
                  <p style="color:#9a8ccc;font-size:12px;margin:0">Metanoia SMX · Salta, Argentina</p>
                </div>
              </div>
            `,
          });
        } catch (e) {
          console.error(`Error enviando mail de cumpleaños a ${u.email}:`, (e as Error).message);
        }
      }

      // Notificación en la campanita para el resto del equipo
      const resto = todos.filter((o: any) => o.id !== u.id);
      if (resto.length) {
        try {
          await supabase.from("notificaciones").insert(
            resto.map((o: any) => ({
              usuario_id: o.id,
              tipo: "cumpleanos",
              mensaje: `🎂 Hoy es el cumpleaños de ${u.nombre} — ¡Mandale un saludo! 🎉`,
              leida: false,
            }))
          );
        } catch (e) {
          console.error("Error insertando notificaciones de cumpleaños:", (e as Error).message);
        }
      }
    }

    return new Response(JSON.stringify({ cumpleanieros: cumpleanieros.map((u: any) => u.nombre) }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
