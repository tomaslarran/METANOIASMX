import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://tomaslarran.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Documentos normativos institucionales (Mario Larran, Jun 2026) ────────────
const DOCS_NORMATIVOS = `
## Código de Ética del Simulacionista de Metanoia (SSH 2018 + INACSL 2021)
6 valores fundamentales:
1. Integridad — honestidad, veracidad, declarar supuestos y limitaciones, reconocer propiedad intelectual
2. Transparencia — claridad en diseño y comunicación, declarar conflictos de interés
3. Respeto mutuo — honrar la dignidad de estudiantes y colegas, maximizar seguridad psicológica
4. Profesionalismo — competencia, desarrollo continuo
5. Responsabilidad — rendir cuentas, notificar conductas inseguras
6. Orientación a resultados — mejora continua, medir impacto hasta resultados del paciente

Compromisos institucionales obligatorios:
- Autoridad clínico-editorial: la Dirección Médica define el contenido. Industria y patrocinadores acompañan pero NO definen.
- Todo contenido pasa por curaduría obligatoria y proceso PEV antes de usarse o comercializarse.
- Declaración de Conflictos de Interés requerida para instructores, curadores y referentes (formulario Metanoia v1.0).
- Propiedad intelectual: el autor retiene su crédito; Metanoia recibe licencia de uso por contrato.
- Seguridad psicológica: el error en simulación es oportunidad de aprendizaje, NUNCA motivo de humillación o sanción.
- Confidencialidad: grabaciones y registros de desempeño son datos sensibles (Leyes 25.326 y 26.529). Requieren consentimiento informado específico (formulario Consentimiento de Grabación Metanoia v1.0).
- IA es apoyo, nunca sustituto del juicio profesional. Siempre con supervisión humana responsable.
- No se prometen resultados no sustentables en evidencia. Rigor académico certificable es un compromiso central.

## Marco de Buenas Prácticas en Simulación (INACSL 2021, SASIM 2023, adaptado a Metanoia)

PREBRIEFING OBLIGATORIO antes de cada actividad:
- Facilitador competente conduce prebriefing planificado y estandarizado
- Explicitar propósito, objetivos, logística, roles, confidencialidad
- Establecer contrato de ficción y "supuesto básico": todos son inteligentes, capaces y desean mejorar (Rudolph et al., 2014)
- La fidelidad psicológica supera al realismo físico en importancia

DISEÑO DE SIMULACIÓN (INACSL, Diseño de Simulación y Resultados y Objetivos, 2021):
- Partir de evaluación de necesidades educativas
- Objetivos medibles y alineados con nivel del participante (alineación constructiva)
- Seleccionar modalidad según objetivos — no "máxima fidelidad" por defecto
- Escenario estructurado: disparadores, estados clínicos y criterios de avance
- Incluir plan de prebriefing y debriefing DESDE EL DISEÑO
- Prueba piloto y revisión por pares antes de implementar
- Formativa (mejora) vs. Sumativa/certificante (juicio final): separar roles de quien forma y quien certifica

DEBRIEFING (componente con mayor impacto en el aprendizaje, Fanning & Gaba, 2007):
- Método: "debriefing con buen juicio" — transparencia del facilitador + indagación genuina del participante (Rudolph et al., 2006)
- Estructura PEARLS (Eppich & Cheng, 2015): reacción → análisis/descripción → exploración → resumen/aplicación
- Gestionar carga cognitiva: minimizar extrínseca (distracciones), favorecer germinal (construcción de esquemas)
- Evaluar impacto con Kirkpatrick: reacción → aprendizaje → conducta → resultados
- Pirámide de Miller: sabe → sabe cómo → muestra cómo → hace

MÓDULO QUIRÚRGICO (progresión basada en competencia, mastery learning):
- Avance por logro de benchmarks objetivos de expertos, NO por tiempo de práctica
- Práctica deliberada con feedback hasta estándar elevado (McGaghie et al., 2011)
- Instrumentos validados: OSATS (destreza técnica), GOALS (laparoscopía), FLS (cirugía laparoscópica)
- CRM (Manejo de Recursos en Crisis): liderazgo, comunicación de circuito cerrado, conciencia situacional

PACIENTES SIMULADOS Y ESTANDARIZADOS (ASPE SOBP):
- Protección física y psicológica; consentimiento, encuadre y posibilidad de pausa siempre
- Des-rol (de-roling) tras escenarios emocionalmente exigentes
- Feedback efectivo al participante cuando forma parte del diseño

INSTRUMENTOS LEGALES REQUERIDOS (Metanoia, Jun 2026):
- Consentimiento Informado de Grabación v1.0 — usar en TODAS las actividades grabadas
- Declaración de Conflictos de Interés v1.0 — requerida para instructores, curadores, referentes

AL DISEÑAR O VALIDAR UN CURSO, VERIFICAR SIEMPRE:
✓ Contenido aprobado por Dirección Médica (curaduría editorial)
✓ Estado en PEV (no comercializar antes de PROTOTIPO/APROBADO)
✓ Prebriefing planificado desde el inicio
✓ Debriefing estructurado incluido
✓ Instructores con Declaración de Conflictos de Interés
✓ Actividades grabadas con Consentimiento de Grabación
✓ Lenguaje correcto: "entrenamiento" y "práctica", NUNCA "formación" o "capacitación"
`;

// ── SKILL: Diseño y gestión de cursos — Metanoia SMX ──────────────────────────
const SKILL_CURSOS = `
## Marco institucional
Metanoia SMX es un centro de simulación médica en Salta, Argentina. Opera bajo SUDES S.A.S.
Línea C (Cursos comerciales): motor real de autonomía financiera. Meta: 4 cursos/mes para 2027.
Línea D (COFRADIA): comunidad de suscripción con contenido de autor.
PRINCIPIO CLAVE: Ningún curso puede comercializarse sin estado PROTOTIPO o APROBADO en PEV.

## Identidad pedagógica — DISTINCIÓN CRÍTICA
En Metanoia NO se "forma" ni se "capacita" en el sentido tradicional.
Se ENTRENA y se PRACTICA: el foco está en la repetición deliberada de habilidades en entornos simulados, no en la transmisión de conocimiento teórico.
NUNCA usar los términos "formación", "formar profesionales" o "capacitación" en comunicaciones, títulos de cursos o materiales.
SIEMPRE usar: "entrenamiento", "práctica", "entrenamos habilidades", "practicamos con simulación".
Ejemplo correcto: "Workshop de entrenamiento en vía aérea difícil"
Ejemplo incorrecto: "Curso de formación en vía aérea difícil"

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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
  const supabaseAuth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

  try {
    const { message, historial = [], canal = "panel", archivos = [] } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // En modo generacion, no cargar datos de DB para evitar rate limit
    let cursos = { data: [] }, inscripciones = { data: [] }, alumnos = { data: [] };
    const instructores = { data: [] };
    if (canal !== "generacion") {
      const [c, i, a, inst] = await Promise.all([
        supabase.from("cursos").select("*").order("fecha_inicio", { ascending: true }),
        supabase.from("inscripciones").select("alumno_id,curso_id,estado,monto,cuotas"),
        supabase.from("alumnos").select("id,nombre,apellido,email,especialidad"),
        supabase.from("instructores").select("id,nombre,apellido,especialidad"),
      ]);
      cursos = c; inscripciones = i; alumnos = a;
      instructores.data = inst.data ?? [];
    }

    const hoy = new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Salta" });

    const conciso = canal === "whatsapp"
      ? "Respondé MUY CONCISO (máximo 4 párrafos cortos, sin tablas largas). Usá emojis para claridad."
      : "Podés usar listas y formato markdown. Sé detallado cuando diseñes cursos.";

    // Resumen compacto de cursos para el agente (evitar tokens innecesarios)
    const cursosResumen = (cursos.data || []).map((c: any) => ({
      nombre: c.nombre,
      fecha_inicio: c.fecha_inicio,
      fecha_fin: c.fecha_fin,
      estado: c.estado,
      instructor: c.instructor_nombre,
    }));

    const sistema = `Sos el agente de cursos de Metanoia SMX. Hoy es ${hoy}.
Metanoia dicta cursos de capacitación médica en simulación en Salta, Argentina.
Respondé siempre en español. ${conciso}

Tenés dos modos de operación:
1. CONSULTA: Responder preguntas sobre cursos existentes, inscripciones, alumnos.
2. DISEÑO: Ayudar a crear y estructurar nuevos cursos usando la metodología institucional.

Cuando alguien presente una idea de curso nuevo, guialo por la Plantilla Intake y la metodología PEV.
Cuando pidan estructurar el programa de un curso, usá los 7 niveles de simulación y las categorías de objetivos.
Cuando pidan generar contenido para presentación, producí estructura modular, progresiva y clínicamente rigurosa.

## Reglas de calendario y disponibilidad
SIEMPRE que se proponga o confirme una fecha para un curso nuevo:
1. Verificá que no sea sábado ni domingo. Si lo es, sugerí el lunes o viernes más cercano.
2. Verificá si coincide con algún curso ya programado (ver CURSOS ACTUALES). Si hay superposición de fechas, avisá explícitamente: qué curso ocupa esas fechas y si puede haber conflicto de instructor o recursos.
3. Verificá que no caiga en un feriado nacional argentino 2026:
   - 1 ene, 16-17 feb (Carnaval), 24 mar, 2 abr, 3 abr (Viernes Santo), 1 may, 25 may,
   - 20 jun, 9 jul, 17 ago, 12 oct, 20 nov, 8 dic, 25 dic.
4. Si la fecha es válida, confirmala. Si no, proponé alternativas concretas (día hábil libre).
Sé proactivo: si el instructor dice "el 15" calculá qué día de la semana es y verificá todo antes de aceptar.

${SKILL_CURSOS}

${DOCS_NORMATIVOS}

CURSOS ACTUALES (fechas y estado): ${JSON.stringify(cursosResumen)}
INSTRUCTORES: ${JSON.stringify(instructores.data)}`;

    const historialReciente = historial.slice(-8);

    // Construir content con archivos adjuntos si los hay
    let userContent: any = message;
    if (archivos && archivos.length > 0) {
      const contentBlocks: any[] = [];
      archivos.forEach((a: any) => {
        if (a.tipo === "application/pdf" || a.nombre?.endsWith(".pdf")) {
          contentBlocks.push({
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: a.base64 },
            title: a.nombre,
          });
        } else if (a.tipo?.startsWith("image/")) {
          contentBlocks.push({
            type: "image",
            source: { type: "base64", media_type: a.tipo, data: a.base64 },
          });
        } else if (a.tipo === "text/plain" || a.nombre?.endsWith(".txt") || a.nombre?.endsWith(".docx")) {
          // Texto extraído (ej: docx convertido por mammoth en el browser)
          try {
            const bytes = Uint8Array.from(atob(a.base64), (c: string) => c.charCodeAt(0));
            const text = new TextDecoder("utf-8").decode(bytes);
            contentBlocks.push({ type: "text", text: `[Archivo adjunto: ${a.nombre}]\n\n${text}` });
          } catch (_) {}
        }
      });
      contentBlocks.push({ type: "text", text: message });
      userContent = contentBlocks;
    }

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
