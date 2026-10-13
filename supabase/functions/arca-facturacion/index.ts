// Facturación electrónica ARCA (ex AFIP) — web services WSAA + WSFEv1.
// Acciones (POST JSON, solo admin o x-cron-secret para "emitir"):
//   estado    { sociedad }                          → prueba de conexión: FEDummy + login WSAA + último comprobante
//   ultimo    { sociedad, cbte_tipo }               → último número autorizado del punto de venta
//   consultar { sociedad, cbte_tipo, cbte_numero }  → datos de un comprobante ya autorizado
//   emitir    { sociedad, cbte_tipo, receptor, items|importes, referencia, ... } → pide el CAE
// Secrets: ARCA_CERT_SUDES / ARCA_KEY_SUDES / ARCA_CERT_POINTERS / ARCA_KEY_POINTERS (PEM completo, con saltos de línea).
// Opcionales: ARCA_WSAA_URL, ARCA_WSFE_URL (para sobreescribir las URLs oficiales).
// La sociedad, su CUIT, el punto de venta y el ambiente (homologacion|produccion) salen de la tabla arca_config.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import forge from "https://esm.sh/node-forge@1.3.1";

const cors = {
  "Access-Control-Allow-Origin": "https://tomaslarran.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const J = { ...cors, "Content-Type": "application/json" };
const resp = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: J });

const URLS = {
  homologacion: { wsaa: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms", wsfe: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx" },
  produccion: { wsaa: "https://wsaa.afip.gov.ar/ws/services/LoginCms", wsfe: "https://servicios1.afip.gov.ar/wsfev1/service.asmx" },
} as const;

// ───────────────────────── utilidades ─────────────────────────
const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const soloDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const yyyymmdd = (iso: string) => iso.replace(/-/g, "");
function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${name}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`));
  return m ? m[1] : null;
}
function tags(xml: string, name: string): string[] {
  return [...xml.matchAll(new RegExp(`<(?:\\w+:)?${name}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`, "g"))].map((m) => m[1]);
}
const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
function arcaTime(d: Date) { // ISO con huso -03:00 (hora de ARCA)
  const z = new Date(d.getTime() - 3 * 3600 * 1000);
  return z.toISOString().replace("Z", "-03:00").replace(/\.\d{3}/, "");
}

// ───────────────────────── WSAA ─────────────────────────
// CMS (PKCS#7 signed data, DER, base64) del TRA firmado con el certificado y la clave de la sociedad.
function firmarTRA(tra: string, certPem: string, keyPem: string): string {
  const cert = forge.pki.certificateFromPem(certPem);
  const key = forge.pki.privateKeyFromPem(keyPem);
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(tra, "utf8");
  p7.addCertificate(cert);
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });
  p7.sign();
  return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
}

function armarTRA(servicio: string, ahora = new Date()): string {
  const gen = new Date(ahora.getTime() - 10 * 60 * 1000);
  const exp = new Date(ahora.getTime() + 10 * 60 * 1000);
  return `<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header><uniqueId>${Math.floor(ahora.getTime() / 1000)}</uniqueId>` +
    `<generationTime>${arcaTime(gen)}</generationTime><expirationTime>${arcaTime(exp)}</expirationTime></header><service>${servicio}</service></loginTicketRequest>`;
}

async function loginWSAA(cfg: Cfg, certPem: string, keyPem: string) {
  const cms = firmarTRA(armarTRA("wsfe"), certPem, keyPem);
  const url = Deno.env.get("ARCA_WSAA_URL") || URLS[cfg.ambiente].wsaa;
  const soap = `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov"><soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>`;
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" }, body: soap });
  const txt = await r.text();
  if (!r.ok) {
    const fs = unesc(tag(txt, "faultstring") ?? txt.slice(0, 300));
    throw new Error("WSAA: " + fs);
  }
  const ta = unesc(tag(txt, "loginCmsReturn") ?? "");
  const token = tag(ta, "token"), sign = tag(ta, "sign"), exp = tag(ta, "expirationTime");
  if (!token || !sign) throw new Error("WSAA: respuesta sin token");
  return { token, sign, expira: new Date(exp ?? Date.now() + 11 * 3600 * 1000).toISOString() };
}

// ───────────────────────── config / credenciales ─────────────────────────
interface Cfg { sociedad: string; cuit: string; razon_social: string; pto_vta: number; ambiente: "homologacion" | "produccion"; activo: boolean; condicion_iva?: string; }

function credenciales(sociedad: string) {
  const s = sociedad.toUpperCase();
  const cert = (Deno.env.get(`ARCA_CERT_${s}`) || "").replace(/\\n/g, "\n");
  const key = (Deno.env.get(`ARCA_KEY_${s}`) || "").replace(/\\n/g, "\n");
  if (!cert || !key) throw new Error(`Faltan los secrets ARCA_CERT_${s} / ARCA_KEY_${s} en Supabase`);
  return { cert, key };
}

async function tokenValido(supabase: any, cfg: Cfg) {
  const { data } = await supabase.from("arca_tokens").select("*").eq("sociedad", cfg.sociedad).eq("ambiente", cfg.ambiente).maybeSingle();
  if (data && new Date(data.expira).getTime() - Date.now() > 5 * 60 * 1000) return { token: data.token as string, sign: data.sign as string };
  const { cert, key } = credenciales(cfg.sociedad);
  const t = await loginWSAA(cfg, cert, key);
  await supabase.from("arca_tokens").upsert({ sociedad: cfg.sociedad, ambiente: cfg.ambiente, token: t.token, sign: t.sign, expira: t.expira, updated_at: new Date().toISOString() }, { onConflict: "sociedad,ambiente" });
  return { token: t.token, sign: t.sign };
}

// ───────────────────────── WSFEv1 ─────────────────────────
async function wsfe(cfg: Cfg, metodo: string, cuerpo: string) {
  const url = Deno.env.get("ARCA_WSFE_URL") || URLS[cfg.ambiente].wsfe;
  const soap = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/"><soap:Header/><soap:Body><ar:${metodo}>${cuerpo}</ar:${metodo}></soap:Body></soap:Envelope>`;
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `http://ar.gov.afip.dif.FEV1/${metodo}` }, body: soap });
  const txt = await r.text();
  if (!r.ok && !txt.includes(`${metodo}Response`)) throw new Error(`WSFE ${metodo}: HTTP ${r.status} ${unesc(tag(txt, "faultstring") ?? txt.slice(0, 200))}`);
  return txt;
}
const authXml = (cfg: Cfg, a: { token: string; sign: string }) => `<ar:Auth><ar:Token>${a.token}</ar:Token><ar:Sign>${a.sign}</ar:Sign><ar:Cuit>${cfg.cuit}</ar:Cuit></ar:Auth>`;
function erroresDe(xml: string) {
  const out: { codigo: string; mensaje: string }[] = [];
  for (const blk of [...tags(xml, "Err"), ...tags(xml, "Obs")]) out.push({ codigo: tag(blk, "Code") ?? "", mensaje: unesc(tag(blk, "Msg") ?? "") });
  return out;
}

async function ultimoAutorizado(cfg: Cfg, a: any, tipo: number) {
  const xml = await wsfe(cfg, "FECompUltimoAutorizado", `${authXml(cfg, a)}<ar:PtoVta>${cfg.pto_vta}</ar:PtoVta><ar:CbteTipo>${tipo}</ar:CbteTipo>`);
  const errs = tags(xml, "Err");
  if (errs.length) throw new Error("ARCA: " + erroresDe(xml).map((e) => `${e.codigo} ${e.mensaje}`).join(" | "));
  return parseInt(tag(xml, "CbteNro") ?? "0", 10);
}

async function consultarComprobante(cfg: Cfg, a: any, tipo: number, nro: number) {
  const xml = await wsfe(cfg, "FECompConsultar", `${authXml(cfg, a)}<ar:FeCompConsReq><ar:CbteTipo>${tipo}</ar:CbteTipo><ar:CbteNro>${nro}</ar:CbteNro><ar:PtoVta>${cfg.pto_vta}</ar:PtoVta></ar:FeCompConsReq>`);
  if (tags(xml, "Err").length) return { existe: false, errores: erroresDe(xml) };
  const cae = tag(xml, "CodAutorizacion");
  if (!cae) return { existe: false, errores: [] };
  return { existe: true, cae, cae_vto: tag(xml, "FchVto"), fecha: tag(xml, "CbteFch"), total: parseFloat(tag(xml, "ImpTotal") ?? "0"), doc_nro: tag(xml, "DocNro"), resultado: tag(xml, "Resultado") };
}

// ───────────────────────── reglas de negocio ─────────────────────────
const ALICUOTAS: Record<string, number> = { "0": 3, "2.5": 9, "5": 8, "10.5": 4, "21": 5, "27": 6 }; // % → Id de ARCA
const CLASE_POR_TIPO: Record<number, "A" | "B" | "C"> = { 1: "A", 2: "A", 3: "A", 6: "B", 7: "B", 8: "B", 11: "C", 12: "C", 13: "C", 201: "A", 202: "A", 203: "A", 206: "B", 207: "B", 208: "B", 211: "C", 212: "C", 213: "C" };
// Condición frente al IVA del receptor (RG 5616): qué clases de comprobante admite cada una.
const COND_IVA: Record<number, { nombre: string; clases: ("A" | "B" | "C")[] }> = {
  1: { nombre: "IVA Responsable Inscripto", clases: ["A", "B"] },
  4: { nombre: "IVA Sujeto Exento", clases: ["B"] },
  5: { nombre: "Consumidor Final", clases: ["B"] },
  6: { nombre: "Responsable Monotributo", clases: ["A", "B"] },
  7: { nombre: "Sujeto No Categorizado", clases: ["B"] },
  8: { nombre: "Proveedor del Exterior", clases: ["B"] },
  9: { nombre: "Cliente del Exterior", clases: ["B"] },
  10: { nombre: "IVA Liberado - Ley 19.640", clases: ["B"] },
  13: { nombre: "Monotributista Social", clases: ["A", "B"] },
  15: { nombre: "IVA No Alcanzado", clases: ["B"] },
  16: { nombre: "Monotributo Trabajador Independiente Promovido", clases: ["A", "B"] },
};

function cuitValido(c: string) {
  if (!/^\d{11}$/.test(c)) return false;
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const s = w.reduce((a, x, i) => a + x * parseInt(c[i], 10), 0);
  let d = 11 - (s % 11); if (d === 11) d = 0; if (d === 10) d = 9;
  return d === parseInt(c[10], 10);
}

interface Entrada {
  sociedad: string; cbte_tipo: number; fecha?: string; concepto?: 1 | 2 | 3;
  receptor: { doc_tipo?: number; doc_nro?: string; nombre?: string; cond_iva_id: number };
  items?: { descripcion: string; neto: number; alicuota: number }[];       // neto sin IVA y alícuota (%)
  importes?: { neto: number; iva?: number; exento?: number; no_gravado?: number; alicuota?: number };
  servicio_desde?: string; servicio_hasta?: string; vto_pago?: string;
  moneda?: string; cotizacion?: number; referencia?: string; origen?: string;
  comprobante_asociado?: { tipo: number; pto_vta?: number; numero: number; fecha?: string };   // obligatorio en notas de crédito/débito
}

// Arma los importes por alícuota a partir de items (cada uno con su alícuota) o de un importe único.
function calcularImportes(e: Entrada, clase: "A" | "B" | "C") {
  const porAlic = new Map<number, number>(); let exento = 0, noGrav = 0;
  if (e.items?.length) {
    for (const it of e.items) {
      const neto = r2(it.neto);
      if (!(neto >= 0)) throw new Error("Importe de ítem inválido");
      if (it.alicuota === -1) exento += neto; else porAlic.set(it.alicuota, r2((porAlic.get(it.alicuota) ?? 0) + neto));
    }
  } else if (e.importes) {
    const al = e.importes.alicuota ?? 21;
    if (e.importes.neto) porAlic.set(al, r2(e.importes.neto));
    exento = r2(e.importes.exento ?? 0); noGrav = r2(e.importes.no_gravado ?? 0);
  } else throw new Error("Faltan items o importes");
  const alic: { Id: number; BaseImp: number; Importe: number; pct: number }[] = [];
  for (const [pct, base] of porAlic) {
    if (!(String(pct) in ALICUOTAS)) throw new Error(`Alícuota de IVA no soportada: ${pct}%`);
    alic.push({ Id: ALICUOTAS[String(pct)], BaseImp: base, Importe: r2(base * pct / 100), pct });
  }
  const neto = r2(alic.reduce((a, x) => a + x.BaseImp, 0));
  const iva = r2(alic.reduce((a, x) => a + x.Importe, 0));
  exento = r2(exento); noGrav = r2(noGrav);
  if (clase === "C" && iva > 0) throw new Error("Una factura C no discrimina IVA");
  return { neto, iva, exento, noGrav, alic, total: r2(neto + iva + exento + noGrav) };
}

function xmlComprobante(cfg: Cfg, e: Entrada, numero: number, fecha: string, im: ReturnType<typeof calcularImportes>) {
  const concepto = e.concepto ?? 2;
  const docTipo = e.receptor.doc_tipo ?? 80;
  const docNro = docTipo === 99 ? "0" : soloDigitos(e.receptor.doc_nro);
  const servicio = concepto !== 1
    ? `<ar:FchServDesde>${yyyymmdd(e.servicio_desde ?? fecha)}</ar:FchServDesde><ar:FchServHasta>${yyyymmdd(e.servicio_hasta ?? fecha)}</ar:FchServHasta><ar:FchVtoPago>${yyyymmdd(e.vto_pago ?? fecha)}</ar:FchVtoPago>` : "";
  const asoc = e.comprobante_asociado
    ? `<ar:CbtesAsoc><ar:CbteAsoc><ar:Tipo>${e.comprobante_asociado.tipo}</ar:Tipo><ar:PtoVta>${e.comprobante_asociado.pto_vta ?? cfg.pto_vta}</ar:PtoVta><ar:Nro>${e.comprobante_asociado.numero}</ar:Nro><ar:Cuit>${cfg.cuit}</ar:Cuit>${e.comprobante_asociado.fecha ? `<ar:CbteFch>${yyyymmdd(e.comprobante_asociado.fecha)}</ar:CbteFch>` : ""}</ar:CbteAsoc></ar:CbtesAsoc>` : "";
  const iva = im.alic.length
    ? `<ar:Iva>${im.alic.map((a) => `<ar:AlicIva><ar:Id>${a.Id}</ar:Id><ar:BaseImp>${a.BaseImp.toFixed(2)}</ar:BaseImp><ar:Importe>${a.Importe.toFixed(2)}</ar:Importe></ar:AlicIva>`).join("")}</ar:Iva>` : "";
  return `<ar:FECAEDetRequest><ar:Concepto>${concepto}</ar:Concepto><ar:DocTipo>${docTipo}</ar:DocTipo><ar:DocNro>${docNro}</ar:DocNro>` +
    `<ar:CbteDesde>${numero}</ar:CbteDesde><ar:CbteHasta>${numero}</ar:CbteHasta><ar:CbteFch>${yyyymmdd(fecha)}</ar:CbteFch>` +
    `<ar:ImpTotal>${im.total.toFixed(2)}</ar:ImpTotal><ar:ImpTotConc>${im.noGrav.toFixed(2)}</ar:ImpTotConc><ar:ImpNeto>${im.neto.toFixed(2)}</ar:ImpNeto>` +
    `<ar:ImpOpEx>${im.exento.toFixed(2)}</ar:ImpOpEx><ar:ImpTrib>0.00</ar:ImpTrib><ar:ImpIVA>${im.iva.toFixed(2)}</ar:ImpIVA>${servicio}` +
    `<ar:MonId>${e.moneda ?? "PES"}</ar:MonId><ar:MonCotiz>${(e.cotizacion ?? 1).toFixed(6)}</ar:MonCotiz>` +
    `<ar:CondicionIVAReceptorId>${e.receptor.cond_iva_id}</ar:CondicionIVAReceptorId>${asoc}${iva}</ar:FECAEDetRequest>`;
}

// Datos del QR que exige ARCA en el PDF de la factura (https://www.afip.gob.ar/fe/qr/especificaciones.asp)
function urlQR(cfg: Cfg, e: Entrada, numero: number, fecha: string, total: number, cae: string) {
  const o = { ver: 1, fecha, cuit: parseInt(cfg.cuit, 10), ptoVta: cfg.pto_vta, tipoCmp: e.cbte_tipo, nroCmp: numero, importe: total,
    moneda: e.moneda ?? "PES", ctz: e.cotizacion ?? 1, tipoDocRec: e.receptor.doc_tipo ?? 80, nroDocRec: parseInt(soloDigitos(e.receptor.doc_nro) || "0", 10), tipoCodAut: "E", codAut: parseInt(cae, 10) };
  return "https://www.afip.gob.ar/fe/qr/?p=" + btoa(JSON.stringify(o));
}

async function emitir(supabase: any, cfg: Cfg, e: Entrada, userId: string | null) {
  // 1) Validaciones antes de tocar ARCA
  const clase = CLASE_POR_TIPO[e.cbte_tipo];
  if (!clase) throw new Error(`Tipo de comprobante no soportado: ${e.cbte_tipo}`);
  const cond = COND_IVA[e.receptor?.cond_iva_id];
  if (!cond) throw new Error("Falta la condición frente al IVA del receptor (obligatoria desde RG 5616)");
  // La clase C depende del emisor (monotributo/exento), no del receptor; A y B sí dependen de la condición del receptor.
  if (clase === "C") { if (/inscripto/i.test(cfg.condicion_iva ?? "")) throw new Error(`${cfg.sociedad} es Responsable Inscripto: no puede emitir comprobantes clase C`); }
  else if (!cond.clases.includes(clase)) throw new Error(`Un receptor «${cond.nombre}» no admite comprobantes clase ${clase}`);
  const docTipo = e.receptor.doc_tipo ?? 80;
  if (docTipo === 80 && !cuitValido(soloDigitos(e.receptor.doc_nro))) throw new Error("CUIT del receptor inválido");
  if (clase === "A" && docTipo !== 80) throw new Error("La factura A exige CUIT del receptor");
  if (docTipo === 99 && clase !== "B" && clase !== "C") throw new Error("Consumidor final solo admite clase B o C");
  const esNC = [2, 3, 7, 8, 12, 13].includes(e.cbte_tipo);
  if (esNC && !e.comprobante_asociado) throw new Error("Una nota de crédito/débito debe indicar el comprobante que modifica");
  const im = calcularImportes(e, clase);
  if (im.total <= 0) throw new Error("El total debe ser mayor a cero");
  const fecha = e.fecha ?? new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

  // 2) Idempotencia por referencia (ej. id del pago en la plataforma): nunca emitir dos veces lo mismo
  if (e.referencia) {
    const { data: previa } = await supabase.from("facturas_emitidas").select("*").eq("sociedad", cfg.sociedad).eq("ambiente", cfg.ambiente).eq("referencia", e.referencia).maybeSingle();
    if (previa?.estado === "autorizada") return { ...previa, repetida: true };
  }

  const auth = await tokenValido(supabase, cfg);
  const ultimo = await ultimoAutorizado(cfg, auth, e.cbte_tipo);
  let numero = ultimo + 1;

  // Una emisión anterior que quedó «pendiente» (se cortó la respuesta): confirmar en ARCA antes de reintentar
  const { data: pend } = await supabase.from("facturas_emitidas").select("*").eq("sociedad", cfg.sociedad).eq("ambiente", cfg.ambiente).eq("pto_vta", cfg.pto_vta).eq("cbte_tipo", e.cbte_tipo).eq("estado", "pendiente").order("cbte_numero", { ascending: false }).limit(1);
  if (pend?.[0] && (!e.referencia || pend[0].referencia === e.referencia)) {
    const c = await consultarComprobante(cfg, auth, e.cbte_tipo, pend[0].cbte_numero);
    if (c.existe) {
      const { data: fila } = await supabase.from("facturas_emitidas").update({ estado: "autorizada", cae: c.cae, cae_vto: c.cae_vto ? `${c.cae_vto!.slice(0, 4)}-${c.cae_vto!.slice(4, 6)}-${c.cae_vto!.slice(6, 8)}` : null, resultado: "A", updated_at: new Date().toISOString() }).eq("id", pend[0].id).select().single();
      if (e.referencia && pend[0].referencia === e.referencia) return { ...fila, recuperada: true };
      numero = pend[0].cbte_numero + 1;
    } else if (pend[0].referencia === e.referencia) numero = pend[0].cbte_numero;
  }

  // 3) Reservar el número (fila pendiente) antes de enviar
  const base = {
    sociedad: cfg.sociedad, ambiente: cfg.ambiente, pto_vta: cfg.pto_vta, cbte_tipo: e.cbte_tipo, cbte_numero: numero, fecha, concepto: e.concepto ?? 2,
    receptor_doc_tipo: docTipo, receptor_doc_nro: soloDigitos(e.receptor.doc_nro), receptor_nombre: e.receptor.nombre ?? null, receptor_cond_iva_id: e.receptor.cond_iva_id,
    neto: im.neto, iva: im.iva, exento: im.exento, no_gravado: im.noGrav, total: im.total, alicuotas: im.alic, items: e.items ?? null, moneda: e.moneda ?? "PES",
    comprobante_asociado: e.comprobante_asociado ?? null, referencia: e.referencia ?? null, origen: e.origen ?? "panel", created_by: userId, estado: "pendiente", updated_at: new Date().toISOString(),
  };
  const { data: fila, error: eIns } = await supabase.from("facturas_emitidas").upsert(base, { onConflict: "sociedad,ambiente,pto_vta,cbte_tipo,cbte_numero" }).select().single();
  if (eIns) throw new Error("No se pudo reservar el número: " + eIns.message);

  // 4) Pedir el CAE
  const xml = await wsfe(cfg, "FECAESolicitar",
    `${authXml(cfg, auth)}<ar:FeCAEReq><ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${cfg.pto_vta}</ar:PtoVta><ar:CbteTipo>${e.cbte_tipo}</ar:CbteTipo></ar:FeCabReq><ar:FeDetReq>${xmlComprobante(cfg, e, numero, fecha, im)}</ar:FeDetReq></ar:FeCAEReq>`);
  const resultado = tag(tag(xml, "FeCabResp") ?? "", "Resultado") ?? tag(xml, "Resultado");
  const det = tag(xml, "FECAEDetResponse") ?? "";
  const cae = tag(det, "CAE"), caeVto = tag(det, "CAEFchVto");
  const obs = erroresDe(xml);
  const aprobada = resultado === "A" && !!cae && cae !== "0" && cae.trim() !== "";
  const upd: Record<string, unknown> = { resultado: resultado ?? null, observaciones: obs, updated_at: new Date().toISOString() };
  if (aprobada) {
    upd.estado = "autorizada"; upd.cae = cae; upd.cae_vto = caeVto ? `${caeVto.slice(0, 4)}-${caeVto.slice(4, 6)}-${caeVto.slice(6, 8)}` : null;
    upd.qr_url = urlQR(cfg, e, numero, fecha, im.total, cae!);
  } else { upd.estado = "rechazada"; }
  const { data: fin } = await supabase.from("facturas_emitidas").update(upd).eq("id", fila.id).select().single();
  if (!aprobada) throw Object.assign(new Error("ARCA rechazó el comprobante: " + (obs.map((x) => `${x.codigo} ${x.mensaje}`).join(" | ") || "sin detalle")), { fila: fin });
  return fin;
}

// ───────────────────────── handler ─────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let body: any;
  try { body = await req.json(); } catch { return resp({ error: "JSON inválido" }, 400); }

  // Autenticación: admin con JWT, o llamada de servidor (sync-elearning) con x-cron-secret solo para emitir
  let userId: string | null = null;
  const cron = req.headers.get("x-cron-secret");
  const cronOk = !!cron && cron === Deno.env.get("CRON_SECRET") && body.action === "emitir";
  if (!cronOk) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return resp({ error: "Unauthorized" }, 401);
    const supabaseAuth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) return resp({ error: "Unauthorized" }, 401);
    const { data: caller } = await supabase.from("usuarios").select("rol").eq("id", user.id).single();
    if (caller?.rol !== "admin") return resp({ error: "Solo administradores" }, 403);
    userId = user.id;
  }

  try {
    const sociedad = String(body.sociedad || "").toUpperCase();
    const { data: cfg } = await supabase.from("arca_config").select("*").eq("sociedad", sociedad).maybeSingle();
    if (!cfg) return resp({ error: `No hay configuración ARCA para ${sociedad || "(sin sociedad)"}` }, 400);
    if (!cfg.activo) return resp({ error: `La facturación electrónica de ${sociedad} está desactivada` }, 400);

    switch (body.action) {
      case "estado": {
        const dummy = await wsfe(cfg, "FEDummy", "");
        const out: any = { ambiente: cfg.ambiente, pto_vta: cfg.pto_vta, cuit: cfg.cuit, servidores: { app: tag(dummy, "AppServer"), db: tag(dummy, "DbServer"), auth: tag(dummy, "AuthServer") } };
        const auth = await tokenValido(supabase, cfg); out.login = "ok";
        out.ultimos = {} as Record<string, number>;
        for (const t of [1, 6, 11]) out.ultimos[t] = await ultimoAutorizado(cfg, auth, t).catch((e) => `error: ${e.message}`);
        return resp(out);
      }
      case "ultimo": {
        const auth = await tokenValido(supabase, cfg);
        return resp({ ultimo: await ultimoAutorizado(cfg, auth, Number(body.cbte_tipo)) });
      }
      case "consultar": {
        const auth = await tokenValido(supabase, cfg);
        return resp(await consultarComprobante(cfg, auth, Number(body.cbte_tipo), Number(body.cbte_numero)));
      }
      case "emitir": {
        if (cfg.ambiente === "produccion" && body.confirmar_produccion !== true && !cronOk) return resp({ error: "Estás en PRODUCCIÓN: falta confirmar_produccion" }, 400);
        const f = await emitir(supabase, cfg, { ...body, sociedad }, userId);
        return resp({ ok: true, factura: f });
      }
      default: return resp({ error: "Acción desconocida" }, 400);
    }
  } catch (err: any) {
    return resp({ error: err.message ?? String(err), factura: err.fila ?? undefined }, 500);
  }
});
