// Padrón de ARCA (constancia de inscripción, personaServiceA5): devuelve razón social, domicilio fiscal,
// condición frente al IVA y actividad de un CUIT. Solo lectura, sin costo de IA.
// POST { cuit } o { cuits: [..] (hasta 30) }  → solo admin (JWT) o x-cron-secret.
// Usa el certificado de producción de POINTERS (ARCA_CERT_POINTERS_PROD / ARCA_KEY_POINTERS_PROD) con el servicio
// ws_sr_constancia_inscripcion autorizado. Se puede apuntar a otro par con ARCA_CERT_PADRON / ARCA_KEY_PADRON.
// El ticket de WSAA se guarda en arca_tokens (sociedad "PADRON"): ARCA rechaza un segundo login con un ticket vigente.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import forge from "https://esm.sh/node-forge@1.3.1";

const cors = {
  "Access-Control-Allow-Origin": "https://tomaslarran.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const J = { ...cors, "Content-Type": "application/json" };
const resp = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: J });

const SERVICIO = "ws_sr_constancia_inscripcion";
const WSAA = Deno.env.get("ARCA_WSAA_URL") || "https://wsaa.afip.gov.ar/ws/services/LoginCms";
const PADRON = Deno.env.get("ARCA_PADRON_URL") || "https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5";

function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${name}>`));
  return m ? m[1] : null;
}
function tags(xml: string, name: string): string[] {
  return [...xml.matchAll(new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${name}>`, "g"))].map((m) => m[1]);
}
const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const arcaTime = (d: Date) => new Date(d.getTime() - 3 * 3600 * 1000).toISOString().replace("Z", "-03:00").replace(/\.\d{3}/, "");
const dig = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const txt = (x: string | null, n: string) => { const v = tag(x || "", n); return v == null ? "" : unesc(v).trim(); };

// Nombres de provincia como los usa el desplegable del panel
const PROV: Record<string, string> = {
  "CIUDAD AUTONOMA BUENOS AIRES": "CABA", "CAPITAL FEDERAL": "CABA", "CABA": "CABA", "BUENOS AIRES": "Buenos Aires", "CATAMARCA": "Catamarca",
  "CHACO": "Chaco", "CHUBUT": "Chubut", "CORDOBA": "Córdoba", "CORRIENTES": "Corrientes", "ENTRE RIOS": "Entre Ríos", "FORMOSA": "Formosa",
  "JUJUY": "Jujuy", "LA PAMPA": "La Pampa", "LA RIOJA": "La Rioja", "MENDOZA": "Mendoza", "MISIONES": "Misiones", "NEUQUEN": "Neuquén",
  "RIO NEGRO": "Río Negro", "SALTA": "Salta", "SAN JUAN": "San Juan", "SAN LUIS": "San Luis", "SANTA CRUZ": "Santa Cruz", "SANTA FE": "Santa Fe",
  "SANTIAGO DEL ESTERO": "Santiago del Estero", "TIERRA DEL FUEGO": "Tierra del Fuego", "TUCUMAN": "Tucumán",
};
const provPanel = (p: string) => PROV[p.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim()] || p;

function firmarTRA(tra: string, certPem: string, keyPem: string): string {
  const cert = forge.pki.certificateFromPem(certPem);
  const key = forge.pki.privateKeyFromPem(keyPem);
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(tra, "utf8");
  p7.addCertificate(cert);
  p7.addSigner({
    key, certificate: cert, digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });
  p7.sign();
  return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
}

async function ticket(supabase: any) {
  const { data } = await supabase.from("arca_tokens").select("*").eq("sociedad", "PADRON").eq("ambiente", "produccion").maybeSingle();
  if (data && new Date(data.expira).getTime() - Date.now() > 5 * 60 * 1000) return { token: data.token as string, sign: data.sign as string };
  const cert = (Deno.env.get("ARCA_CERT_PADRON") || Deno.env.get("ARCA_CERT_POINTERS_PROD") || "").replace(/\\n/g, "\n");
  const key = (Deno.env.get("ARCA_KEY_PADRON") || Deno.env.get("ARCA_KEY_POINTERS_PROD") || "").replace(/\\n/g, "\n");
  if (!cert || !key) throw new Error("Faltan los secrets ARCA_CERT_POINTERS_PROD / ARCA_KEY_POINTERS_PROD");
  const ahora = new Date();
  const tra = `<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header><uniqueId>${Math.floor(ahora.getTime() / 1000)}</uniqueId><generationTime>${arcaTime(new Date(ahora.getTime() - 600000))}</generationTime><expirationTime>${arcaTime(new Date(ahora.getTime() + 600000))}</expirationTime></header><service>${SERVICIO}</service></loginTicketRequest>`;
  const soap = `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov"><soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${firmarTRA(tra, cert, key)}</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>`;
  const r = await fetch(WSAA, { method: "POST", headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" }, body: soap });
  const t = await r.text();
  if (!r.ok) throw new Error("WSAA: " + unesc(tag(t, "faultstring") ?? t.slice(0, 300)));
  const ta = unesc(tag(t, "loginCmsReturn") ?? "");
  const token = tag(ta, "token"), sign = tag(ta, "sign"), exp = tag(ta, "expirationTime");
  if (!token || !sign) throw new Error("WSAA: respuesta sin token");
  await supabase.from("arca_tokens").upsert({ sociedad: "PADRON", ambiente: "produccion", token, sign, expira: new Date(exp ?? Date.now() + 11 * 3600 * 1000).toISOString(), updated_at: new Date().toISOString() }, { onConflict: "sociedad,ambiente" });
  return { token, sign };
}

function parsear(xml: string) {
  const pr = tag(xml, "personaReturn");
  if (!pr) return { ok: false, error: unesc(tag(xml, "faultstring") || "") || "Sin respuesta de ARCA" };
  const dg = tag(pr, "datosGenerales");
  if (!dg) return { ok: false, error: tags(pr, "error").map(unesc).join(" | ") || "ARCA no devolvió datos de ese CUIT" };
  const dom = tag(dg, "domicilioFiscal") || "";
  const razon = txt(dg, "razonSocial") || [txt(dg, "apellido"), txt(dg, "nombre")].filter(Boolean).join(" ");
  const rg = tag(pr, "datosRegimenGeneral") || "", mt = tag(pr, "datosMonotributo") || "";
  const imps = [...tags(rg, "impuesto"), ...tags(mt, "impuesto")].map((b) => ({ id: txt(b, "idImpuesto"), desc: txt(b, "descripcionImpuesto"), estado: txt(b, "estadoImpuesto") }));
  const act = tags(rg, "actividad").map((b) => ({ orden: parseInt(txt(b, "orden"), 10) || 99, id: txt(b, "idActividad"), desc: txt(b, "descripcionActividad") })).sort((a, b) => a.orden - b.orden);
  const actMono = txt(tag(mt, "actividadMonotributista") || "", "descripcionActividad");
  const activos = imps.filter((i) => i.estado === "AC");
  const tiene = (id: string) => activos.some((i) => i.id === id);
  let condicion_iva: string | null = null;
  if (tiene("30")) condicion_iva = "responsable_inscripto"; else if (tiene("20")) condicion_iva = "monotributo"; else if (tiene("32")) condicion_iva = "exento";
  return {
    ok: true, cuit: txt(dg, "idPersona"), razon_social: razon, tipo_persona: txt(dg, "tipoPersona"), estado_clave: txt(dg, "estadoClave"),
    domicilio: [txt(dom, "direccion"), txt(dom, "localidad")].filter(Boolean).join(", "), cp: txt(dom, "codPostal"), provincia: provPanel(txt(dom, "descripcionProvincia")),
    condicion_iva, monotributo_categoria: txt(tag(mt, "categoriaMonotributo") || "", "descripcionCategoria"),
    actividad_principal: act[0] ? `${act[0].id} ${act[0].desc}` : actMono, impuestos: activos.map((i) => i.desc),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const cron = req.headers.get("x-cron-secret");
    if (!(cron && cron === Deno.env.get("CRON_SECRET"))) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return resp({ error: "Unauthorized" }, 401);
      const supabaseAuth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await supabaseAuth.auth.getUser();
      if (!user) return resp({ error: "Unauthorized" }, 401);
      const { data: caller } = await supabase.from("usuarios").select("rol").eq("id", user.id).single();
      if (caller?.rol !== "admin") return resp({ error: "Solo administradores" }, 403);
    }
    const body = await req.json().catch(() => ({}));
    const lista: string[] = (Array.isArray(body.cuits) ? body.cuits : [body.cuit]).map(dig).filter((c: string) => c.length === 11).slice(0, 30);
    if (!lista.length) return resp({ error: "Falta un CUIT de 11 dígitos" }, 400);
    const { data: cfg } = await supabase.from("arca_config").select("cuit").eq("sociedad", "POINTERS").maybeSingle();
    const representada = dig(cfg?.cuit) || "30716965852";
    const auth = await ticket(supabase);
    const resultados: Record<string, unknown> = {};
    for (const cuit of lista) {
      const soap = `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:a5="http://a5.soap.ws.server.puc.sr/"><soapenv:Header/><soapenv:Body><a5:getPersona_v2><token>${auth.token}</token><sign>${auth.sign}</sign><cuitRepresentada>${representada}</cuitRepresentada><idPersona>${cuit}</idPersona></a5:getPersona_v2></soapenv:Body></soapenv:Envelope>`;
      try {
        const r = await fetch(PADRON, { method: "POST", headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" }, body: soap });
        resultados[cuit] = parsear(await r.text());
      } catch (e) { resultados[cuit] = { ok: false, error: "Error de conexión con ARCA: " + (e as Error).message }; }
    }
    return resp(lista.length === 1 ? resultados[lista[0]] : { resultados });
  } catch (e) {
    return resp({ ok: false, error: (e as Error).message }, 500);
  }
});
