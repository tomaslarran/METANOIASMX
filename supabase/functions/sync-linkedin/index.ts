import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ORG_ID = "105737703"; // Metanoia SMX LinkedIn
const LI_BASE = "https://api.linkedin.com/rest";
const LI_V2 = "https://api.linkedin.com/v2";

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

    // 1. Obtener posts de la organización via Shares API (v2)
    const orgUrn = encodeURIComponent(`urn:li:organization:${ORG_ID}`);
    const postsRes = await fetch(
      `${LI_V2}/shares?q=owners&owners=${orgUrn}&sharesPerOwner=50`,
      { headers: liHeaders }
    );
    const postsData = await postsRes.json();

    if (!postsRes.ok) {
      throw new Error(`LinkedIn API: ${postsData.message || JSON.stringify(postsData)}`);
    }

    const posts = postsData.elements || [];
    const registros: any[] = [];
    let liError: string | null = null;

    for (const post of posts) {
      const postId = post.id;
      const createdAt = post.created?.time;
      const fecha = createdAt ? new Date(createdAt).toISOString().split("T")[0] : null;

      // Extraer texto del post (Shares API format)
      const shareContent = post.text?.text || "";
      const caption = shareContent;

      // Métricas del share
      const stats = post.totalShareStatistics || {};
      const likes = stats.likeCount || 0;
      const comentarios = stats.commentCount || 0;
      const compartidos = stats.shareCount || 0;
      const impresiones = stats.impressionCount || 0;

      // Determinar tipo de contenido
      let tipo = "foto";
      const content = post.content;
      if (content?.contentEntities?.some((e: any) => e.entityLocation?.includes("video"))) tipo = "video";
      else if (content?.contentEntities?.length > 1) tipo = "carrusel";
      else if (content?.contentEntities?.some((e: any) => e.entityLocation?.includes("article"))) tipo = "articulo";

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
