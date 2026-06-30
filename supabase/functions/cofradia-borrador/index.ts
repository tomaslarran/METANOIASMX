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

    const { data: cap } = await supabase
      .from("cofradia_capturas")
      .select("*, cofradia_fuentes(nombre, institucion)")
      .eq("id", captura_id)
      .single();
    if (!cap) return new Response(JSON.stringify({ error: "Captura no encontrada" }), { status: 404, headers: cors });

    const prompt = `Eres redactor editorial de METANOIA SMX, un centro de simulación médica cuya bajada es "Experiencia Médica Segura". Construimos comunidad médica de manera orgánica, priorizando calidad sobre volumen.

Tu tarea: generar el borrador de una pieza para nuestro blog, a partir de una fuente médica externa. La pieza respeta el contenido original (no traduce, no republica) y aporta valor con una introducción contextual en español y una mirada propia sobre la implicancia para simulación o formación médica.

REGLAS NO NEGOCIABLES:
- La cita destacada debe ser un fragmento literal del original, máx. 40 palabras.
- Nunca traducir párrafos largos del original.
- Toda afirmación clínica debe poder rastrearse al original.
- Tono profesional, claro, sin sensacionalismo.
- Voz: primera persona del plural cuando se habla como METANOIA.
- Audiencia: médicos profesionales, principalmente latinoamericanos.

GENERA estos campos en JSON (sin markdown, sin bloques de código):
{
  "titulo_metanoia": "<titular en español, máx 12 palabras>",
  "bajada": "<una frase con el por qué importa al lector>",
  "intro_metanoia": "<150-250 palabras en español, contextualizando el aporte>",
  "cita_destacada": "<cita literal del original, máx 40 palabras — si el original está en inglés, citar en inglés>",
  "cita_atribucion": "<autor o autores, año, revista>",
  "implicancia_simulacion": "<un párrafo conectando con simulación o formación médica>",
  "ficha_fuente": {
    "autores": "<formato Apellido AN, et al.>",
    "institucion": "<institución principal si disponible>",
    "publicacion": "<revista, año — vol(n°):pp>",
    "doi_o_url": "<DOI o URL>",
    "tipo_estudio": "<RCT, cohorte, metaanálisis, guía, revisión, etc.>",
    "idioma_original": "<idioma>"
  },
  "tags": ["<3-5 etiquetas en español, en minúsculas>"]
}

DATOS DEL ORIGINAL:
TÍTULO: ${cap.titulo_original}
AUTORES: ${cap.autores || "(no disponibles)"}
FUENTE: ${cap.cofradia_fuentes?.nombre || ""} ${cap.cofradia_fuentes?.institucion ? `(${cap.cofradia_fuentes.institucion})` : ""}
FECHA: ${cap.publicado_at ? new Date(cap.publicado_at).toLocaleDateString("es-AR") : "no disponible"}
ABSTRACT: ${cap.abstract || "(sin abstract — generá la introducción basándote en el título y la fuente)"}
URL: ${cap.url_original}
CATEGORÍA: ${cap.categoria || "Evidencia científica"}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const aiData = await res.json();
    if (!res.ok) throw new Error("Claude API: " + JSON.stringify(aiData));

    const raw = aiData.content[0].text.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "").trim();
    const draft = JSON.parse(raw);

    // Validar cita <= 40 palabras
    if (draft.cita_destacada) {
      const words = draft.cita_destacada.trim().split(/\s+/).length;
      if (words > 40) {
        draft.cita_destacada = draft.cita_destacada.trim().split(/\s+/).slice(0, 40).join(" ") + "…";
      }
    }

    // Guardar borrador
    const { data: saved } = await supabase.from("cofradia_borradores").insert({
      captura_id,
      titulo_metanoia: draft.titulo_metanoia,
      bajada: draft.bajada,
      intro_metanoia: draft.intro_metanoia,
      cita_destacada: draft.cita_destacada,
      cita_atribucion: draft.cita_atribucion,
      implicancia_simulacion: draft.implicancia_simulacion,
      ficha_fuente: draft.ficha_fuente,
      tags: draft.tags,
      editor_id: user.id,
      generado_at: new Date().toISOString(),
      estado: "borrador",
    }).select().single();

    // Marcar captura como en borrador (ya tiene borrador generado)
    await supabase.from("cofradia_capturas").update({ estado: "aceptada" }).eq("id", captura_id);

    return new Response(JSON.stringify({ ok: true, borrador_id: saved?.id }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
