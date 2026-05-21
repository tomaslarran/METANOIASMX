import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { prompt, publicaciones, videosIA, imagenes, pdfEjercicio } = await req.json();
    const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

    let systemPrompt = `Sos el agente de comunicaciones de Metanoia SMX, empresa de capacitación médica en simulación de Salta, Argentina.
La empresa tiene dos sociedades: SUDES (cursos de simulación médica) y POINTERS (logística).
El equipo de comunicaciones: Valentina (redes, contratos), Mario (relaciones, cursos).
Plataformas: Instagram, Facebook, LinkedIn (Meta Business Suite).
Respondé siempre en español, de forma concisa, accionable y directa. Sin bullets excesivos.`;

    let userMsg = "";
    let userContent: any = null; // para mensajes con imágenes (visión)

    let parsedPrompt: any = null;
    try { parsedPrompt = JSON.parse(prompt); } catch {}

    if (parsedPrompt?.tipo === "validar") {
      userMsg = `Validá este caption para ${parsedPrompt.plataforma} de Metanoia SMX.
Verificá: tono profesional pero cercano, sin mencionar avales del Colegio Médico salvo que el curso esté explícitamente avalado, que no haya errores de comunicación institucional, y que esté optimizado para la plataforma.
Indicá qué está bien, qué cambiarías y por qué. Si hay problemas críticos, marcalos claramente.

CAPTION:
${parsedPrompt.caption}`;

    } else if (parsedPrompt?.tipo === "prompt_video") {
      const textoBase = `Generá un prompt optimizado para **Runway Gen-4.5** (modelo de video IA de alta calidad) que muestre visualmente el siguiente ejercicio de simulación médica laparoscópica.

Runway Gen-4.5 genera clips cinematográficos de alta calidad a partir de un prompt de texto más una imagen de referencia del simulador real. El prompt debe:
- Estar en inglés
- Describir UNA escena continua y cinematográfica (no múltiples shots separados)
- Empezar describiendo el sujeto principal y el entorno: qué se ve, cómo está iluminado, qué hay en el fondo
- Describir el movimiento de cámara: slow zoom in, gentle pan, static close-up, etc.
- Describir la acción clave del ejercicio con precisión: qué hacen las manos, qué instrumentos se usan, qué objeto se manipula
- Incluir: lighting (professional studio, clean surgical background), mood (educational, precise, clinical)
- Terminar con el estilo: "cinematic, slow motion, 4K, educational medical simulation, professional quality"
- NO usar formato Shot 1 / Shot 2 — es una sola toma fluida
- Ser muy específico sobre colores, materiales y movimientos del instrumento
${pdfEjercicio ? "- Leé el PDF adjunto y usá su contenido como referencia principal para describir con precisión los pasos, instrumentos y objetivos del ejercicio" : ""}
${imagenes?.length ? "- Analizá las imágenes adjuntas del simulador: describí con exactitud los colores reales, materiales, forma del equipo — el modelo usará estas fotos como referencia visual" : ""}

Ejercicio: ${parsedPrompt.ejercicio || ""}
Objetivo: ${parsedPrompt.objetivo || ""}

Devolvé SOLO el prompt en inglés, listo para pegar en Runway Gen-4.5. Entre 100 y 180 palabras.`;

      // Construir content blocks: PDF + imágenes + texto
      const contentBlocks: any[] = [];

      // PDF del ejercicio (document block)
      if (pdfEjercicio?.data) {
        contentBlocks.push({
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: pdfEjercicio.data,
          },
        });
      }

      // Imágenes de referencia
      if (imagenes?.length) {
        imagenes.slice(0, 3).forEach((img: any) => {
          contentBlocks.push({
            type: "image",
            source: {
              type: "base64",
              media_type: img.mediaType || "image/jpeg",
              data: img.data,
            },
          });
        });
      }

      // Texto del prompt
      contentBlocks.push({ type: "text", text: textoBase });

      if (contentBlocks.length > 1) {
        userContent = contentBlocks;
      } else {
        userMsg = textoBase;
      }

    } else if (prompt === "planificar_recap") {
      userMsg = `El equipo de Metanoia necesita lanzar una campaña de comunicación urgente mostrando todo lo ya realizado (más de 150 médicos capacitados, sociedades médicas que usan la plataforma, cursos realizados, etc.) frente a un conflicto con el Colegio Médico.
Se decidió NO esperar y comunicar activamente.

Eventos próximos: Olimpiada de simulación 22/05, Curso tórax (Johnson) 27-28/05, Jornada lavado de manos Hospital San Bernardo 26/05, Curso ginecología 27-30/05. Lanzamiento plataforma en junio.

Historial de publicaciones registradas: ${publicaciones.length} posts.

Planificá un calendario de contenido para las próximas 3 semanas (semana a semana), con qué publicar cada día, en qué plataforma, y el enfoque de cada post. Sé específico y accionable.`;

    } else {
      const resumen = publicaciones.length ? publicaciones.slice(0, 30).map((p: any) =>
        `[${p.plataforma}/${p.tipo}] ${p.fecha_publicacion || ""} "${p.tema || ""}" — likes:${p.likes || 0} alcance:${p.alcance || 0} guardados:${p.guardados || 0} comentarios:${p.comentarios || 0}`
      ).join("\n") : "Sin publicaciones registradas aún.";

      userMsg = `Analizá el rendimiento de las últimas publicaciones de Metanoia SMX y devolvé:
1. Qué tipo de contenido y plataforma están funcionando mejor
2. Qué está fallando o tiene bajo rendimiento
3. El mejor horario/día si se puede inferir
4. 3 recomendaciones concretas y específicas para mejorar resultados
5. Qué publicar esta semana

HISTORIAL:
${resumen}`;
    }

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent || userMsg }],
      }),
    });

    if (!claudeRes.ok) throw new Error(`Claude API error ${claudeRes.status}`);
    const claudeData = await claudeRes.json();
    if (claudeData.type === "error") throw new Error(claudeData.error?.message || "Error de Claude");
    const respuesta = claudeData.content?.[0]?.text ?? "Sin respuesta";

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
