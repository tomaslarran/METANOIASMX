import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { message, historial = [], oportunidad = {}, archivos = [] } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Recopilar contexto de todos los dominios en paralelo ──────────────────
    const [
      cajaMov, cfInversiones, cfPrestamos, cfConceptos,
      cursosActivos, otrasOportunidades,
    ] = await Promise.all([
      supabase.from("caja_movimientos")
        .select("sociedad,fecha,tipo,concepto,monto")
        .order("fecha", { ascending: false })
        .limit(30),
      supabase.from("cf_inversiones")
        .select("nombre,tipo,monto_inicial,rendimiento_acumulado,estado")
        .eq("estado", "activa"),
      supabase.from("cf_prestamos")
        .select("descripcion,monto_original,saldo_actual,cuota_mensual,estado")
        .eq("estado", "activo"),
      supabase.from("cf_valores")
        .select("concepto_id,periodo,proyectado,real")
        .order("periodo", { ascending: false })
        .limit(24),
      supabase.from("cursos")
        .select("nombre,estado,fecha_inicio,fecha_fin,arancel,instructor_nombre,pev_etapa")
        .in("estado", ["Borrador", "Confirmado", "En curso", "Próximo"]),
      supabase.from("oportunidades")
        .select("idea_cruda,tipo,estado,linea_negocio,ejecutor,recursos")
        .neq("id", oportunidad.id || "00000000-0000-0000-0000-000000000000")
        .neq("estado", "Descartado")
        .limit(20),
    ]);

    // ── Calcular resumen financiero ───────────────────────────────────────────
    const cajaResumen = calcularResumenCaja(cajaMov.data ?? []);
    const invResumen = (cfInversiones.data ?? []).map((i: any) => ({
      nombre: i.nombre, tipo: i.tipo,
      monto: i.monto_inicial, rendimiento: i.rendimiento_acumulado,
    }));
    const prestResumen = (cfPrestamos.data ?? []).map((p: any) => ({
      desc: p.descripcion, saldo: p.saldo_actual, cuota: p.cuota_mensual,
    }));

    const hoy = new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Salta" });

    const sistema = `Sos un agente analista de oportunidades, proyectos e inversiones. Hoy es ${hoy}.
Trabajás con un equipo que evalúa oportunidades de negocio — pueden ser proyectos internos, inversiones, nuevos productos, alianzas o cualquier tipo de iniciativa.
Respondé siempre en español. Sé directo, honesto y útil. Usá formato markdown cuando ayude.

## TU ROL
Analizás oportunidades con visión completa: financiera, operativa y estratégica.
Tenés acceso al estado real del negocio (finanzas, proyectos activos, portfolio).
No sos optimista por default — señalás red flags con la misma energía que destacás fortalezas.
Cuando hay archivos adjuntos, los leés y los integrás al análisis.

## ESTADO FINANCIERO ACTUAL
### Caja (últimos movimientos)
${JSON.stringify(cajaResumen, null, 2)}

### Inversiones activas
${JSON.stringify(invResumen, null, 2)}

### Préstamos activos
${JSON.stringify(prestResumen, null, 2)}

## PROYECTOS EN CURSO (cursos/simulación activos)
${JSON.stringify(cursosActivos.data ?? [], null, 2)}

## OTRAS OPORTUNIDADES EN PIPELINE
${JSON.stringify(otrasOportunidades.data ?? [], null, 2)}

## OPORTUNIDAD EN ANÁLISIS
${oportunidad.idea_cruda ? `
- Idea: ${oportunidad.idea_cruda}
- Tipo: ${oportunidad.tipo || "no especificado"}
- Definición concreta: ${oportunidad.definicion || "—"}
- Audiencia / mercado: ${oportunidad.audiencia || "—"}
- Encaje estratégico: ${oportunidad.encaje_estrategico || "—"}
- Primer paso testeable: ${oportunidad.primer_paso || "—"}
- Ejecutor: ${oportunidad.ejecutor || "—"} | Decisor: ${oportunidad.decisor || "—"}
- Recursos y costo estimado: ${oportunidad.recursos || "—"}
- Criterio de éxito: ${oportunidad.criterio_exito || "—"}
- Riesgos declarados: ${oportunidad.riesgos || "—"}
- Estado actual: ${oportunidad.estado || "Crudo"}
` : "No se compartió una oportunidad específica — respondé preguntas generales sobre el pipeline."}

## CÓMO ANALIZAR
Cuando te pidan un análisis completo, respondé con:
1. **Puntuación general** (1-10) con justificación breve
2. **Recomendación** clara: Avanzar / Revisar antes de avanzar / Pausar / Descartar
3. **Fortalezas** (2-4 bullets concretos)
4. **Red flags** (sé brutal — si hay algo que no cuadra, decilo)
5. **Encaje con el estado financiero actual** — ¿hay liquidez para esto? ¿compite con algo activo?
6. **Siguiente paso sugerido** — acción concreta para los próximos 7-14 días
7. **Preguntas sin responder** que bloquean la decisión

Si el usuario pregunta algo específico, respondé puntualmente. No des el análisis completo si no lo piden.`;

    const historialReciente = historial.slice(-10);

    // ── Construir content con archivos adjuntos ───────────────────────────────
    let userContent: any = message;
    if (archivos && archivos.length > 0) {
      const blocks: any[] = [];
      for (const a of archivos) {
        if (a.tipo === "application/pdf" || a.nombre?.toLowerCase().endsWith(".pdf")) {
          blocks.push({
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: a.base64 },
            title: a.nombre,
          });
        } else if (a.tipo?.startsWith("image/")) {
          blocks.push({
            type: "image",
            source: { type: "base64", media_type: a.tipo, data: a.base64 },
          });
        } else if (a.contenido_texto) {
          // Texto extraído en el browser (docx via mammoth, xlsx via xlsx.js, txt directo)
          blocks.push({
            type: "text",
            text: `=== ARCHIVO: ${a.nombre} ===\n${a.contenido_texto}\n`,
          });
        }
      }
      blocks.push({ type: "text", text: message });
      userContent = blocks;
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "pdfs-2024-09-25",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 3000,
        system: sistema,
        messages: [...historialReciente, { role: "user", content: userContent }],
      }),
    });

    const data = await res.json();
    if (data.type === "error") throw new Error(data.error?.message ?? "API error");
    const respuesta = data.content?.[0]?.text ?? "No pude generar una respuesta.";

    return new Response(JSON.stringify({ respuesta }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});

// ── Helper: resume de caja por sociedad ──────────────────────────────────────
function calcularResumenCaja(movimientos: any[]) {
  const saldos: Record<string, number> = {};
  const ultimos: Record<string, any[]> = {};
  for (const m of movimientos) {
    const s = m.sociedad || "GENERAL";
    if (!saldos[s]) { saldos[s] = 0; ultimos[s] = []; }
    saldos[s] += m.tipo === "ingreso" ? (m.monto || 0) : -(m.monto || 0);
    if (ultimos[s].length < 5) ultimos[s].push({ fecha: m.fecha, concepto: m.concepto, monto: m.monto, tipo: m.tipo });
  }
  return { saldos_aproximados: saldos, ultimos_movimientos: ultimos };
}
