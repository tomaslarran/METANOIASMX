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

    // ==================== INSTAGRAM ====================
    try {
      const igRes = await fetch(
        `${IG_BASE}/${IG_USER_ID}/media?fields=id,caption,media_type,timestamp,like_count,comments_count,permalink&limit=50&access_token=${IG_TOKEN}`
      );
      const igData = await igRes.json();

      if (!igData.error) {
        for (const post of (igData.data || [])) {
          let alcance = 0, guardados = 0, impresiones = 0;
          try {
            const insRes = await fetch(`${IG_BASE}/${post.id}/insights?metric=reach,saved,impressions&access_token=${IG_TOKEN}`);
            const insData = await insRes.json();
            if (insData.data) {
              insData.data.forEach((m: any) => {
                const val = m.total_value?.value ?? m.values?.[0]?.value ?? 0;
                if (m.name === "reach") alcance = val;
                if (m.name === "saved") guardados = val;
                if (m.name === "impressions") impresiones = val;
              });
            }
          } catch (_) {}

          const tipoIG: Record<string, string> = {
            IMAGE: "foto", VIDEO: "video", CAROUSEL_ALBUM: "carrusel", REELS: "reel",
          };

          registros.push({
            ig_media_id: post.id,
            plataforma: "instagram",
            tipo: tipoIG[post.media_type] || "foto",
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
    } catch (_) {}

    // ==================== FACEBOOK ====================
    let fbError: string | null = null;
    try {
      const fbRes = await fetch(
        `${FB_BASE}/${FB_PAGE_ID}/posts?fields=id,message,created_time,permalink_url,attachments{media_type}&limit=50&access_token=${FB_TOKEN}`
      );
      const fbData = await fbRes.json();

      if (fbData.error) {
        fbError = `${fbData.error.code}: ${fbData.error.message}`;
      } else if (!fbData.error) {
        for (const post of (fbData.data || [])) {
          let alcance = 0, likes = 0, impresiones = 0;
          try {
            const insRes = await fetch(
              `${FB_BASE}/${post.id}/insights?metric=post_impressions_unique,post_reactions_like_total,post_engaged_users&access_token=${FB_TOKEN}`
            );
            const insData = await insRes.json();
            if (insData.data) {
              insData.data.forEach((m: any) => {
                const val = m.values?.[0]?.value ?? 0;
                const num = typeof val === "object" ? Object.values(val as Record<string,number>).reduce((a, b) => a + b, 0) : val;
                if (m.name === "post_impressions_unique") alcance = num;
                if (m.name === "post_reactions_like_total") likes = num;
                if (m.name === "post_engaged_users") impresiones = num;
              });
            }
          } catch (_) {}

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
            comentarios: 0,
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
