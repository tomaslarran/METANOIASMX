import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.9";

const cors = {
  "Access-Control-Allow-Origin": "https://tomaslarran.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Solo admins pueden aprobar
  const { data: usuario } = await supabase
    .from("usuarios")
    .select("rol,nombre,email")
    .eq("email", user.email)
    .single();

  if (!usuario || usuario.rol !== "admin") {
    return new Response(JSON.stringify({ error: "Solo administradores pueden aprobar cursos" }), { status: 403, headers: cors });
  }

  const { curso_id } = await req.json();
  if (!curso_id) return new Response(JSON.stringify({ error: "Falta curso_id" }), { status: 400, headers: cors });

  const { data: curso } = await supabase
    .from("cursos")
    .select("nombre,estado,creado_por")
    .eq("id", curso_id)
    .single();

  if (!curso) return new Response(JSON.stringify({ error: "Curso no encontrado" }), { status: 404, headers: cors });

  const now = new Date().toISOString();
  await supabase.from("cursos").update({
    publicacion_aprobada: true,
    aprobado_para_publicar_por: usuario.nombre,
    aprobado_para_publicar_en: now,
  }).eq("id", curso_id);

  // Email de notificación (no-bloqueante)
  try {
    const { data: admins } = await supabase
      .from("usuarios")
      .select("email")
      .eq("rol", "admin")
      .eq("activo", true);

    // Intenta encontrar al creador por nombre para notificarlo también
    let creadorEmail: string | null = null;
    if (curso.creado_por) {
      const { data: creador } = await supabase
        .from("usuarios")
        .select("email")
        .eq("nombre", curso.creado_por)
        .single();
      if (creador) creadorEmail = creador.email;
    }

    const allEmails = [...new Set([
      ...(admins || []).map((a: any) => a.email as string),
      ...(creadorEmail ? [creadorEmail] : []),
    ])].filter(Boolean);

    if (allEmails.length > 0) {
      const transporter = nodemailer.createTransport({
        host: Deno.env.get("SMTP_HOST"),
        port: 465,
        secure: true,
        auth: { user: Deno.env.get("SMTP_USER"), pass: Deno.env.get("SMTP_PASS") },
      });

      const fechaStr = new Date().toLocaleDateString("es-AR", {
        day: "2-digit", month: "long", year: "numeric",
      });

      await transporter.sendMail({
        from: `"Metanoia SMX" <${Deno.env.get("SMTP_USER")}>`,
        to: allEmails.join(","),
        subject: `✅ Curso aprobado — ${curso.nombre}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fafafa;border-left:4px solid #10B981">
            <h2 style="color:#065F46;margin:0 0 16px">✅ Curso aprobado para publicar</h2>
            <p style="margin:0 0 12px;color:#1F2937">
              <strong>${usuario.nombre}</strong> aprobó el siguiente curso el ${fechaStr}:
            </p>
            <div style="background:#fff;border:1px solid #D1FAE5;border-radius:8px;padding:16px;margin:0 0 16px">
              <p style="margin:0;font-size:18px;font-weight:700;color:#111">${curso.nombre}</p>
              ${curso.creado_por ? `<p style="margin:8px 0 0;color:#6B7280;font-size:13px">Creado por: ${curso.creado_por}</p>` : ""}
            </div>
            <p style="color:#374151">El curso ya puede ser publicado y asignado a instructores.</p>
            <p style="color:#9CA3AF;font-size:12px;margin-top:24px;border-top:1px solid #E5E7EB;padding-top:12px">
              Metanoia SMX — Panel de Gestión Interno
            </p>
          </div>
        `,
      });
    }
  } catch (e) {
    console.error("Email error:", (e as Error).message);
  }

  return new Response(JSON.stringify({ ok: true }), { headers: cors });
});
