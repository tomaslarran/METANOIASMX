import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── SKILL: Diseño y gestión de cursos — Metanoia SMX ──────────────────────────
const SKILL_CURSOS = `
## Marco institucional
Metanoia SMX es un centro de simulación médica en Salta, Argentina. Opera bajo SUDES S.A.S.
Línea C (Cursos comerciales): motor real de autonomía financiera. Meta: 4 cursos/mes para 2027.
Línea D (COFRADIA): comunidad de suscripción con contenido de autor.
PRINCIPIO CLAVE: Ningún curso puede comercializarse sin estado PROTOTIPO o APROBADO en PEV.

## Metodología PEV (Kaizen-PDCA)
PEV1 — Prueba: unidad mínima testeable. Avanza con evidencia de interés real.
PEV2 — Escala: piloto en condiciones reales. Avanza con métricas de calidad validadas.
PEV3 — Valida: validación completa. Requiere aprobación plenaria.
Solo PROTOTIPO/APROBADO habilita comercialización.

## Plantilla Intake (12 campos obligatorios para todo curso nuevo)
1. Idea en crudo — Texto literal sin filtrar
2. ¿Qué es concretamente? — Una oración: curso/contenido/alianza/producto/mixto
3. Línea de negocio — A(MSP) · B(Colmedsa) · C(Cursos) · D(COFRADIA) · Transversal
4. ¿A quién sirve? — Audiencia concreta
5. Encaje estratégico — ¿Suma a autoridad académica, autonomía financiera o comunidad? Si no: descartar.
6. Primer paso testeable — Acción mínima y barata para validar
7. ¿Quién ejecuta? / ¿Quién decide?
8. Recursos y costo estimado
9. Criterio de éxito — Una métrica concreta
10. Riesgos — Lo que podría salir mal
11. Estado — Crudo / En estructuración / En ejecución / Pausado / Descartado
12. Intake — Fecha y quién completó

## 7 Niveles de simulación
1-Básica: teoría sin práctica | 2-Procedimental: habilidades aisladas | 3-Casos clínicos: escenarios reales
4-Equipo/comunicación: teamwork y crisis | 5-Emergencias: PCR, hemorragia masiva
6-VR/AR: simulación inmersiva | 7-Híbrida: simulación + e-learning + pacientes reales

## Objetivos de aprendizaje
Aptitud (conocimiento) · Destreza (técnica procedimental) · Habilidad general (comunicación, equipo)
Habilidad específica (aplicada a dominio clínico) · Competencia (conocimiento + habilidad + criterio integrado)

## Nomenclatura de cursos
Formato: [Tipo] de [Dominio clínico] [(Nivel X)]
Ejemplos: "Workshop de Manejo de Crisis en Anestesia (Nivel 5)" / "Curso de Laparoscopía Básica (Nivel 2)"

## Reglas instructores
- Línea C: compensación máx 30% del ingreso del curso
- Línea D: 40% al médico por contenido autoral; puntos por participación comunitaria
- El médico retiene autoría y crédito permanentemente
- Director Médico tiene autoridad clínica/editorial total; industria asesora pero no define contenido

## Criterios de encaje estratégico
Un curso debe responder SÍ a al menos uno:
1. Autoridad académica: ¿Expande reputación regional o entra en nueva especialidad?
2. Autonomía financiera: ¿Genera ingreso directo? ¿Reduce dependencia del MSP?
3. Comunidad: ¿Fortalece COFRADIA o crea redes profesionales?
Si responde NO a los tres → descartar.

## Red de referentes médicos
Virasoro, Juárez Muas, De la Vega, Passarell, Jaime, Van Cawlaert
Validan contenido clínico, integran comité editorial, pueden ser instructores o consultores.

## Flujo de aprobación
Mario origina idea → Amparo completa Plantilla Intake → Director Médico valida contenido clínico
→ PEV1 → PEV2 → PEV3 → Aprobación plenaria → Tomás sistematiza en panel → COMERCIALIZACIÓN

## Contexto financiero
MSP representa 76% de ingresos Año 1. Meta: <40% dependencia de un solo pagador.
4 cursos/mes desde 2027 baja dependencia MSP a ~23% en Año 4.
Nomenclador v1.1 calcula precios: horas × nivel simulación × seniority instructor.
`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { message, historial = [], canal = "panel" } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const [cursos, inscripciones, alumnos, instructores] = await Promise.all([
      supabase.from("cursos").select("*").order("fecha_inicio", { ascending: true }),
      supabase.from("inscripciones").select("alumno_id,curso_id,estado,monto,cuotas"),
      supabase.from("alumnos").select("id,nombre,apellido,email,especialidad"),
      supabase.from("instructores").select("id,nombre,apellido,especialidad").catch(() => ({ data: [] })),
    ]);

    const hoy = new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Salta" });

    const conciso = canal === "whatsapp"
      ? "Respondé MUY CONCISO (máximo 4 párrafos cortos, sin tablas largas). Usá emojis para claridad."
      : "Podés usar listas y formato markdown. Sé detallado cuando diseñes cursos.";

    const sistema = `Sos el agente de cursos de Metanoia SMX. Hoy es ${hoy}.
Metanoia dicta cursos de capacitación médica en simulación en Salta, Argentina.
Respondé siempre en español. ${conciso}

Tenés dos modos de operación:
1. CONSULTA: Responder preguntas sobre cursos existentes, inscripciones, alumnos.
2. DISEÑO: Ayudar a crear y estructurar nuevos cursos usando la metodología institucional.

Cuando alguien presente una idea de curso nuevo, guialo por la Plantilla Intake y la metodología PEV.
Cuando pidan estructurar el programa de un curso, usá los 7 niveles de simulación y las categorías de objetivos.
Cuando pidan generar contenido para presentación, producí estructura modular, progresiva y clínicamente rigurosa.

${SKILL_CURSOS}

CURSOS ACTUALES: ${JSON.stringify(cursos.data)}
INSCRIPCIONES: ${JSON.stringify(inscripciones.data)}
ALUMNOS: ${JSON.stringify(alumnos.data?.slice(0, 50))}
INSTRUCTORES: ${JSON.stringify(instructores.data)}`;

    const historialReciente = historial.slice(-8);

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
        messages: [...historialReciente, { role: "user", content: message }],
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
