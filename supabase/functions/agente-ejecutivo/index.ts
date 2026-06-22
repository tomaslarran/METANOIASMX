import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.9";

// Emails destinatarios separados por coma, ej: "tomas@metanoia.com,mario@metanoia.com"
const DESTINATARIOS = (Deno.env.get("EQUIPO_EMAILS") ?? "").split(",").map(s => s.trim()).filter(Boolean);

const EQUIPO: Record<string, string> = {
  "335d872b-594c-8130-87af-000274e4aae6": "Tomás",
  "335d872b-594c-81f8-908b-00029b173f99": "Mario",
  "335d872b-594c-8152-a424-00024820cc46": "Valentina",
  "335d872b-594c-81e8-9623-00023e80a236": "Amparo",
};

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fecha de hace 7 días para filtrar rendimientos semanales
    const hace7dias = new Date();
    hace7dias.setDate(hace7dias.getDate() - 7);
    const fecha7dias = hace7dias.toISOString().split("T")[0];

    const [conceptos, valores, cobranzas, prestamos, inversiones, invMovimientos, rendDiarios, inflacion, tareas, cursos, inscripciones] = await Promise.all([
      supabase.from("cf_conceptos").select("*").eq("activo", true),
      supabase.from("cf_valores").select("*, cf_conceptos(nombre, tipo, categoria, sociedad)"),
      supabase.from("cf_cobranzas").select("*").order("fecha_vencimiento"),
      supabase.from("cf_prestamos").select("*").eq("activo", true),
      supabase.from("cf_inversiones").select("*"),
      supabase.from("cf_inversiones_movimientos").select("*").order("fecha", { ascending: false }),
      supabase.from("rendimientos_diarios").select("*").gte("fecha", fecha7dias).order("fecha", { ascending: true }),
      supabase.from("inflacion_mensual").select("periodo,tasa,rend_cartera").order("periodo", { ascending: false }).limit(6),
      supabase.from("tareas").select("*").order("fecha_vencimiento", { ascending: true }),
      supabase.from("cursos").select("*").order("fecha_inicio", { ascending: true }),
      supabase.from("inscripciones").select("*"),
    ]);

    const hoy = new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Salta" });

    const tareasEnriquecidas = (tareas.data ?? []).map(t => ({
      ...t,
      responsables: (t.assignees ?? []).map((id: string) => EQUIPO[id] ?? id),
    }));

    const sistema = `Sos el agente ejecutivo de Metanoia SMX. Hoy es ${hoy} (lunes).
Tu tarea es generar el BRIEFING SEMANAL del equipo directivo en formato HTML para email.
La empresa tiene dos sociedades: SUDES (capacitación médica) y POINTERS (logística/servicios).
El equipo es: Tomás (gestión económica), Mario (cursos/relaciones), Valentina (contratos/redes), Amparo (administración).

Generá un resumen ejecutivo con estas secciones usando HTML simple (párrafos, listas <ul><li>):
1. 💰 FINANZAS: cobros urgentes, vencimientos, alertas de cash flow
2. 📈 INVERSIONES: análisis detallado — (a) ranking de cuál rindió más esta semana en pesos y en %, (b) comparación de TNA entre instrumentos, (c) rendimiento total acumulado por inversión (valor_actual - capital + rescates), (d) si hay inflación disponible comparar rendimiento real vs inflación, (e) alertas de vencimientos próximos, (f) recomendación breve sobre si conviene mantener o rotar alguna posición
3. ✅ TAREAS: vencidas o que vencen esta semana, por responsable
4. 🎓 CURSOS: próximos o novedades de inscripciones
5. ⚠️ ALERTAS: urgencias del día

Usá <strong> para destacar montos y nombres. Sé concreto y directo. No más de 5 ítems por sección.`;

    const contexto = `FINANZAS:
CONCEPTOS: ${JSON.stringify(conceptos.data)}
VALORES: ${JSON.stringify(valores.data)}
COBRANZAS: ${JSON.stringify(cobranzas.data)}
PRÉSTAMOS: ${JSON.stringify(prestamos.data)}

INVERSIONES (cada registro tiene: nombre, tipo, entidad, sociedad, capital inicial, valor_actual, tna, fecha_inicio, fecha_vencimiento, plazo_rescate, objetivo, tipo_riesgo):
${JSON.stringify(inversiones.data)}

MOVIMIENTOS DE INVERSIONES (aportes y rescates históricos por inversion_id):
${JSON.stringify(invMovimientos.data)}

RENDIMIENTOS DIARIOS ÚLTIMOS 7 DÍAS (valor por inversión por día, para calcular performance semanal):
${JSON.stringify(rendDiarios.data)}

INFLACIÓN ÚLTIMOS 6 MESES (periodo=YYYY-MM, tasa=inflación mensual %, rend_cartera=rendimiento cartera % ese mes):
${JSON.stringify(inflacion.data)}

TAREAS: ${JSON.stringify(tareasEnriquecidas)}

CURSOS: ${JSON.stringify(cursos.data)}
INSCRIPCIONES: ${JSON.stringify(inscripciones.data)}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: sistema,
        messages: [{ role: "user", content: contexto }],
      }),
    });

    const data = await res.json();
    if (data.type === "error") throw new Error(data.error?.message ?? "API error");
    const rawText = data.content?.[0]?.text ?? "No pude generar el briefing.";
    // Limpiar markdown code fences si Claude los incluyó
    const briefingHtml = rawText.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();

    const html = `<!DOCTYPE html><html><body style="background:#ffffff;color:#1a1a2e;font-family:Arial,sans-serif;padding:24px;max-width:620px;margin:0 auto">
      <div style="border-bottom:3px solid #7C3AED;padding-bottom:12px;margin-bottom:24px">
        <h2 style="margin:0;color:#7C3AED;font-size:22px">📊 METANOIA SMX</h2>
        <p style="margin:4px 0 0;color:#666;font-size:13px">Briefing semanal IA — ${hoy}</p>
      </div>
      <div style="font-size:14px;line-height:1.7;color:#222">
        ${briefingHtml}
      </div>
      <div style="margin-top:28px;padding-top:12px;border-top:1px solid #ddd;color:#999;font-size:11px">
        Panel de Gestión Metanoia SMX · Generado automáticamente por IA cada lunes
      </div>
    </body></html>`;

    const transporter = nodemailer.createTransport({
      host: Deno.env.get("SMTP_HOST"),
      port: 465,
      secure: true,
      auth: {
        user: Deno.env.get("SMTP_USER"),
        pass: Deno.env.get("SMTP_PASS"),
      },
    });

    await Promise.allSettled(
      DESTINATARIOS.map(to =>
        transporter.sendMail({
          from: `"Metanoia SMX" <${Deno.env.get("SMTP_USER")}>`,
          to,
          subject: `📊 Briefing semanal IA — ${hoy}`,
          html,
        })
      )
    );

    return new Response(JSON.stringify({ ok: true, enviados: DESTINATARIOS.length }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
