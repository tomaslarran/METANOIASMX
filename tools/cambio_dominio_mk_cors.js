// SCRIPT PREPARADO, NO EJECUTADO (5 Oct 2026). Convierte el CORS de las 32 edge functions para aceptar la direccion vieja y la nueva del panel.
// Ejecutar recien cuando el equipo defina el dominio (ver CLAUDE.md, seccion Cambio de dominio del panel). Modifica supabase/functions/*/index.ts.
// Antes de correrlo: ajustar el dominio nuevo en ORIGENES_PERMITIDOS (HELPER).
const fs = require("fs");
const base = "C:/Users/admin/OneDrive/Metanoia/supabase/functions/";
const NL = String.fromCharCode(10);
const HELPER = [
  '',
  '// Orígenes del panel autorizados a llamar a esta función (la dirección vieja y la nueva conviven durante el cambio de dominio).',
  '// Se puede cambiar sin redeployar con el secret ORIGENES_PERMITIDOS (lista separada por comas).',
  'const ORIGENES_PERMITIDOS = (Deno.env.get("ORIGENES_PERMITIDOS") ?? "https://tomaslarran.github.io,https://panel.metanoiasme.com").split(",").map((s) => s.trim()).filter(Boolean);',
  'const corsPara = (req: Request) => {',
  '  const o = req.headers.get("Origin") || "";',
  '  return { ...corsBase, "Access-Control-Allow-Origin": ORIGENES_PERMITIDOS.includes(o) ? o : ORIGENES_PERMITIDOS[0], "Vary": "Origin" };',
  '};',
].join(NL);

const cambiadas = [], saltadas = [];
for (const d of fs.readdirSync(base)) {
  const f = base + d + "/index.ts";
  if (!fs.existsSync(f)) continue;
  let t = fs.readFileSync(f, "utf8");
  if (!/"Access-Control-Allow-Origin": "https:\/\/tomaslarran\.github\.io"/.test(t)) continue;
  if (t.includes("corsPara")) { saltadas.push(d + " (ya convertida)"); continue; }

  // 1) objeto cors → corsBase sin la línea del origen
  const ini = t.indexOf("const cors = {");
  const fin = t.indexOf(NL + "};", ini);
  if (ini < 0 || fin < 0) { saltadas.push(d + " (no se encontró el objeto cors)"); continue; }
  let bloque = t.slice(ini, fin + 3);
  bloque = bloque.replace("const cors = {", "const corsBase = {").split(NL).filter(l => !l.includes('"Access-Control-Allow-Origin"')).join(NL);

  // 2) callback de serve
  const m = t.match(/serve\(\s*async\s*\(\s*([a-zA-Z_]+)[^)]*\)\s*=>\s*\{/);
  if (!m) { saltadas.push(d + " (sin serve(async (req) => {)"); continue; }
  const reqName = m[1];
  const posServe = t.indexOf(m[0]);
  if (posServe < fin) { saltadas.push(d + " (serve antes de cors)"); continue; }
  // cors no puede usarse fuera del callback: todo lo que sigue al serve debe ser el callback
  const resto = t.slice(posServe);
  if (/\n(async function|function|const|let) /.test(resto)) { saltadas.push(d + " (hay código de primer nivel después del serve)"); continue; }

  const nuevoCallback = m[0] + NL + "  const cors = corsPara(" + reqName + ");";
  t = t.slice(0, ini) + bloque + HELPER + t.slice(fin + 3, posServe) + nuevoCallback + t.slice(posServe + m[0].length);
  fs.writeFileSync(f, t);
  cambiadas.push(d);
}

// Redirecciones de los mails de Auth: configurable por secret, con la dirección actual por defecto
for (const d of ["invitar-usuario", "recuperar-password"]) {
  const f = base + d + "/index.ts";
  let t = fs.readFileSync(f, "utf8");
  const a = 'const REDIRECT = "https://tomaslarran.github.io/METANOIASMX/";';
  if (t.includes(a)) {
    t = t.replace(a, 'const REDIRECT = Deno.env.get("PANEL_URL") ?? "https://tomaslarran.github.io/METANOIASMX/"; // secret PANEL_URL: dirección del panel (cambia con el dominio)');
    fs.writeFileSync(f, t);
  }
}
console.log("Convertidas:", cambiadas.length);
console.log(cambiadas.join(", "));
console.log("Saltadas:", saltadas.length, saltadas.join(" | "));
fs.writeFileSync("lista_funciones_cors.json", JSON.stringify(cambiadas));
