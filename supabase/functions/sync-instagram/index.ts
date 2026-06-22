import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const IG_USER_ID = "17841470857318268"; // @metanoiasmx
const FB_PAGE_ID = "478694861999786";   // Metanoiasme.ok
const IG_BASE = "https://graph.instagram.com/v21.0";
const FB_BASE = "https://graph.facebook.com/v21.0";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const IG_TOKEN = Deno.env.get("META_ACCESS_TOKEN")!;
    const FB_TOKEN = Deno.env.get("META_FB_PAGE_TOKEN")!;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const registros: any[] = [];
    const igInsightErrors: string[] = [];
    const fbInsightErrors: string[] = [];

    // ==================== INSTAGRAM ====================
    try {
      // Incluir media_product_type para detectar Reels (usan métricas distintas)
      const igRes = await fetch(
        `${IG_BASE}/${IG_USER_ID}/media?fields=id,caption,media_type,media_product_type,timestamp,like_count,comments_count,permalink&limit=50&access_token=${IG_TOKEN}`
      );
      const igData = await igRes.json();

      if (igData.error) {
        igInsightErrors.push(`Media list error: ${igData.error.message}`);
      } else {
        // Fetch comments for first post to exercise instagram_business_manage_comments permission
        if (igData.data?.[0]) {
          await fetch(`${IG_BASE}/${igData.data[0].id}/comments?access_token=${IG_TOKEN}`);
        }

        // Create media container to exercise instagram_business_content_publish permission
        // Container expires after 24h without publishing — no actual post is created
        const url = new URL(req.url);
        if (url.searchParams.get("publish_test") === "1") {
          await fetch(`https://graph.facebook.com/v21.0/${IG_USER_ID}/media`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              image_url: "https://tomaslarran.github.io/METANOIASMX/logo_metanoia.png",
              caption: "Test de integración API",
              access_token: IG_TOKEN,
            }),
          });
        }

        for (const post of (igData.data || [])) {
          let alcance = 0, guardados = 0, impresiones = 0;
          try {
            // reach y saved son universales para todos los tipos de media
            const insRes = await fetch(
              `${IG_BASE}/${post.id}/insights?metric=reach,saved&period=lifetime&access_token=${IG_TOKEN}`
            );
            const insData = await insRes.json();
            if (insData.error) {
              const msg = `${insData.error.code}: ${insData.error.message}`;
              if (!igInsightErrors.includes(msg)) igInsightErrors.push(msg);
            } else if (insData.data) {
              insData.data.forEach((m: any) => {
                const val = m.total_value?.value ?? m.values?.[0]?.value ?? 0;
                if (m.name === "reach") alcance = val;
                if (m.name === "saved") guardados = val;
              });
            }
          } catch (e: any) {
            igInsightErrors.push(`Fetch error: ${e.message}`);
          }

          const tipoIG: Record<string, string> = {
            IMAGE: "foto", VIDEO: "video", CAROUSEL_ALBUM: "carrusel", REELS: "reel",
          };
          // Reels tienen media_type=VIDEO pero media_product_type=REELS
          const tipoFinal = post.media_product_type === "REELS"
            ? "reel"
            : (tipoIG[post.media_type] || "foto");

          registros.push({
            ig_media_id: post.id,
            plataforma: "instagram",
            tipo: tipoFinal,
            fecha_publicacion: post.timestamp?.split("T")[0] || null,
            tema: post.caption?.slice(0, 150) || null,
            caption: post.caption || null,
            url: post.permalink || null,
            likes: post.like_count || 0,
            comentarios: post.comments_count || 0,
            alcance, guardados, impresiones,
          });
        }
      }
    } catch (e: any) {
      igInsightErrors.push(`Instagram general error: ${e.message}`);
    }

    // ==================== FACEBOOK ====================
    let fbError: string | null = null;
    try {
      // Incluir reactions.summary(true) directamente en el request de posts
      // Es más confiable que pedirlo por insights y no requiere permisos extra
      const fbRes = await fetch(
        `${FB_BASE}/${FB_PAGE_ID}/posts?fields=id,message,created_time,permalink_url,attachments{media_type},reactions.summary(true),comments.summary(true)&limit=50&access_token=${FB_TOKEN}`
      );
      const fbData = await fbRes.json();

      if (fbData.error) {
        fbError = `${fbData.error.code}: ${fbData.error.message}`;
      } else {
        for (const post of (fbData.data || [])) {
          // Likes directamente del campo reactions (más confiable)
          const likes = post.reactions?.summary?.total_count ?? 0;
          const comentarios = post.comments?.summary?.total_count ?? 0;

          // Insights de alcance omitidos — requieren pages_read_engagement con revisión formal de Meta
          const alcance = 0, impresiones = 0;

          const mediaType = post.attachments?.data?.[0]?.media_type;
          const tipoFB: Record<string, string> = {
            photo: "foto", video: "video", album: "carrusel", link: "enlace",
          };

          registros.push({
            ig_media_id: `fb_${post.id}`,
            plataforma: "facebook",
            tipo: tipoFB[mediaType] || "foto",
            fecha_publicacion: post.created_time?.split("T")[0] || null,
            tema: post.message?.slice(0, 150) || null,
            caption: post.message || null,
            url: post.permalink_url || null,
            likes,
            comentarios,
            alcance,
            impresiones,
          });
        }
      }
    } catch (e: any) { fbError = e.message; }

    // ==================== UPSERT ====================
    if (registros.length > 0) {
      const { error } = await supabase
        .from("publicaciones")
        .upsert(registros, { onConflict: "ig_media_id", ignoreDuplicates: false });
      if (error) throw new Error(`Supabase: ${error.message}`);
    }

    const igCount = registros.filter(r => r.plataforma === "instagram").length;
    const fbCount = registros.filter(r => r.plataforma === "facebook").length;

    return new Response(JSON.stringify({
      ok: true,
      sincronizados: registros.length,
      instagram: igCount,
      facebook: fbCount,
      ...(fbError ? { fb_error: fbError } : {}),
      ...(igInsightErrors.length ? { ig_insight_errors: igInsightErrors } : {}),
      ...(fbInsightErrors.length ? { fb_insight_errors: fbInsightErrors } : {}),
    }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
