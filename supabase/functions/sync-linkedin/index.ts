import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ORG_ID = "105737703"; // Metanoia SMX LinkedIn
const LI_BASE = "https://api.linkedin.com/rest";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const TOKEN = Deno.env.get("LINKEDIN_ACCESS_TOKEN")!;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const liHeaders = {
      "Authorization": `Bearer ${TOKEN}`,
      "LinkedIn-Version": "202304",
      "X-Restli-Protocol-Version": "2.0.0",
      "Content-Type": "application/json",
    };

    // 1. Obtener posts de la organización
    const postsRes = await fetch(
      `${LI_BASE}/posts?author=urn:li:organization:${ORG_ID}&count=50&sortBy=LAST_MODIFIED`,
      { headers: liHeaders }
    );
    const postsData = await postsRes.json();

    if (!postsRes.ok || postsData.status === 401) {
      throw new Error(`LinkedIn API: ${postsData.message || JSON.stringify(postsData)}`);
    }

    const posts = postsData.elements || [];
    const registros: any[] = [];
    let liError: string | null = null;

    for (const post of posts) {
      const postId = post.id;
      const createdAt = post.publishedAt || post.createdAt;
      const fecha = createdAt ? new Date(createdAt).toISOString().split("T")[0] : null;

      // Extraer texto del post
      let caption = post.commentary || "";
      if (!caption && post.specificContent) {
        const sc = post.specificContent["com.linkedin.ugc.ShareContent"];
        caption = sc?.shareCommentary?.text || "";
      }

      // Obtener métricas sociales
      let likes = 0, comentarios = 0, compartidos = 0, impresiones = 0;
      try {
        const socialRes = await fetch(
          `${LI_BASE}/socialActions/${encodeURIComponent(postId)}`,
          { headers: liHeaders }
        );
        if (socialRes.ok) {
          const sd = await socialRes.json();
          likes = sd.likesSummary?.totalLikes || 0;
          comentarios = sd.commentsSummary?.totalFirstLevelComments || 0;
        }
      } catch (_) {}

      // Obtener impresiones vía share statistics
      try {
        const statsRes = await fetch(
          `${LI_BASE}/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=urn:li:organization:${ORG_ID}&shares=List(${encodeURIComponent(postId)})`,
          { headers: liHeaders }
        );
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          const stat = statsData.elements?.[0]?.totalShareStatistics;
          if (stat) {
            impresiones = stat.impressionCount || 0;
            compartidos = stat.shareCount || 0;
            likes = stat.likeCount || likes;
            comentarios = stat.commentCount || comentarios;
          }
        }
      } catch (_) {}

      // Determinar tipo de contenido
      let tipo = "foto";
      if (post.content?.media?.id?.includes("video") || post.content?.multiImage) {
        tipo = post.content?.multiImage ? "carrusel" : "video";
      } else if (post.resharedPost) {
        tipo = "compartido";
      }

      registros.push({
        ig_media_id: `li_${postId}`,
        plataforma: "linkedin",
        tipo,
        fecha_publicacion: fecha,
        tema: caption?.slice(0, 150) || null,
        caption: caption || null,
        url: `https://www.linkedin.com/feed/update/${encodeURIComponent(postId)}`,
        likes,
        comentarios,
        compartidos,
        alcance: 0,
        impresiones,
        guardados: 0,
      });
    }

    // Upsert en publicaciones
    if (registros.length > 0) {
      const { error } = await supabase
        .from("publicaciones")
        .upsert(registros, { onConflict: "ig_media_id", ignoreDuplicates: false });
      if (error) throw new Error(`Supabase: ${error.message}`);
    }

    return new Response(JSON.stringify({
      ok: true,
      sincronizados: registros.length,
      linkedin: registros.length,
      ...(liError ? { li_error: liError } : {}),
    }), { headers: { ...cors, "Content-Type": "application/json" } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
