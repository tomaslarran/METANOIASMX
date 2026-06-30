const cors = {
  "Access-Control-Allow-Origin": "https://tomaslarran.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const supabaseAuth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return new Response(JSON.stringify({ error: "Sin API key" }), { status: 500, headers: cors });

  try {
    const { captura_id } = await req.json();
    if (!captura_id) return new Response(JSON.stringify({ error: "captura_id requerido" }), { status: 400, headers: cors });

    const { data: cap } = await supabase.from("cofradia_capturas").select("*, cofradia_fuentes(nombre)").eq("id", captura_id).single();
    if (!cap) return new Response(JSON.stringify({ error: "Captura no encontrada" }), { status: 404, headers: cors });

    const h = { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" };

    // Paso 1: Clasificación
    const classifyPrompt = `Eres un asistente editorial de METANOIA SMX, un centro de simulación médica cuya misión es informar a la comunidad médica con contenido curado de alta calidad. Tu tarea es clasificar una captura de contenido médico en una y solo una de estas 8 categorías:

1. Evidencia científica
2. Simulación médica
3. Tecnología médica
4. Tips y tutoriales
5. Eventos
6. Medicina general
7. Técnicas quirúrgicas
8. Producción propia

Definiciones:
- "Evidencia científica" = papers, RCTs, metaanálisis, guías clínicas.
- "Simulación médica" = todo lo relacionado a educación basada en simulación.
- "Tecnología médica" = dispositivos, software, IA médica, lanzamientos.
- "Tips y tutoriales" = procedimientos clínicos breves de instituciones avaladas.
- "Eventos" = anuncios, agendas, programas de eventos.
- "Medicina general" = artículos en español de revistas con peer review.
- "Técnicas quirúrgicas" = presentaciones quirúrgicas en congresos.
- "Producción propia" = solo si la fuente es METANOIA o un referente aliado.

Devuelve SOLO un JSON sin markdown:
{"category":"<nombre exacto>","confidence":<0-1>,"reasoning":"<una frase breve>"}

TÍTULO: ${cap.titulo_original}
FUENTE: ${cap.cofradia_fuentes?.nombre || ""}
ABSTRACT: ${cap.abstract || "(sin abstract)"}`;

    const r1 = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: h,
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 256, messages: [{ role: "user", content: classifyPrompt }] }),
    });
    const d1 = await r1.json();
    if (!r1.ok) throw new Error("Clasificación: " + JSON.stringify(d1));
    const classResult = JSON.parse(d1.content[0].text.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "").trim());

    // Paso 2: Scoring
    const scorePrompt = `Eres el editor de METANOIA SMX. Evaluá la relevancia de esta captura médica para una comunidad médica principalmente latinoamericana. Asigná un puntaje de 0 a 3 en cada dimensión:

1. CALIDAD DE EVIDENCIA: 3=RCT/metaanálisis/guía, 2=estudio observacional, 1=opinión/caso clínico, 0=sin respaldo
2. RELEVANCIA REGIONAL: 3=aplicable a Latinoamérica/Argentina, 2=adaptable, 1=interés general, 0=otro contexto
3. VIGENCIA: 3=últimos 6 meses, 2=6-12 meses, 1=12-24 meses, 0=más de 24 meses
4. ALINEACIÓN METANOIA: 3=simulación/formación médica directa, 2=área adyacente, 1=conexión débil, 0=fuera de scope

Reglas: total>=7 con todas>=1: accept | total 5-6: review | total<5 o alguna=0: discard

Devuelve SOLO un JSON sin markdown:
{"evidence_score":<0-3>,"regional_score":<0-3>,"recency_score":<0-3>,"alignment_score":<0-3>,"total":<suma>,"recommendation":"<accept|review|discard>","reasoning":"<2-3 frases>"}

TÍTULO: ${cap.titulo_original}
FUENTE: ${cap.cofradia_fuentes?.nombre || ""}
FECHA: ${cap.publicado_at || "desconocida"}
ABSTRACT: ${cap.abstract || "(sin abstract)"}`;

    const r2 = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: h,
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 256, messages: [{ role: "user", content: scorePrompt }] }),
    });
    const d2 = await r2.json();
    if (!r2.ok) throw new Error("Scoring: " + JSON.stringify(d2));
    const scoreResult = JSON.parse(d2.content[0].text.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "").trim());

    // Actualizar captura
    const updates = {
      categoria: classResult.category,
      score: scoreResult.total,
      score_breakdown: {
        evidence: scoreResult.evidence_score,
        regional: scoreResult.regional_score,
        recency: scoreResult.recency_score,
        alignment: scoreResult.alignment_score,
      },
      confianza_ia: classResult.confidence,
      razonamiento_ia: `${classResult.reasoning} | ${scoreResult.reasoning}`,
      nivel_evidencia: scoreResult.evidence_score >= 3 ? "Alto" : scoreResult.evidence_score >= 2 ? "Medio" : "Bajo",
      estado: "triage",
    };

    await supabase.from("cofradia_capturas").update(updates).eq("id", captura_id);

    return new Response(JSON.stringify({ ok: true, categoria: classResult.category, score: scoreResult.total, recommendation: scoreResult.recommendation }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
