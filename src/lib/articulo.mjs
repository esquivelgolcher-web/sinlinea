// Extrae título, descripción, fecha y párrafos de una página de artículo.
import { cleanText, decodeEntities } from "./util.mjs";

// <meta property="og:title" content="..."> con atributos en cualquier orden.
function meta(html, attr, valor) {
  const v = valor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const a = html.match(new RegExp(`<meta[^>]*\\b${attr}\\s*=\\s*["']${v}["'][^>]*\\bcontent\\s*=\\s*["']([^"']*)["']`, "i"));
  if (a) return decodeEntities(a[1]).trim();
  const b = html.match(new RegExp(`<meta[^>]*\\bcontent\\s*=\\s*["']([^"']*)["'][^>]*\\b${attr}\\s*=\\s*["']${v}["']`, "i"));
  return b ? decodeEntities(b[1]).trim() : "";
}

export function parrafosDesdeHtml(html, { minCaracteres = 40 } = {}) {
  const texto = String(html || "");
  const conClase = [...texto.matchAll(/<p\b[^>]*class\s*=\s*["']p_\d+["'][^>]*>([\s\S]*?)<\/p>/gi)];
  const todos = conClase.length ? conClase : [...texto.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)];
  return todos
    .map((m) => cleanText(m[1]))
    .filter((p) => p.length >= minCaracteres);
}

// Autor: JSON-LD ("author": {"name"} o lista), o <meta name="author">.
function autorDe(h) {
  const ld = h.match(/"author"\s*:\s*(\[\s*)?\{[^}]*?"name"\s*:\s*"([^"]+)"/);
  if (ld) return decodeEntities(ld[2]).trim();
  return meta(h, "name", "author") || meta(h, "property", "article:author").replace(/^https?:\/\/\S+$/, "");
}

function canonicaDe(h) {
  const a = h.match(/<link[^>]*\brel\s*=\s*["']canonical["'][^>]*\bhref\s*=\s*["']([^"']+)["']/i);
  if (a) return decodeEntities(a[1]).trim();
  const b = h.match(/<link[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*\brel\s*=\s*["']canonical["']/i);
  return b ? decodeEntities(b[1]).trim() : meta(h, "property", "og:url");
}

const hostDe = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };

// Enlaces a otros dominios dentro de los párrafos del cuerpo: candidatos a fuente primaria (documentos, informes,
// declaraciones). Se excluyen redes sociales y compartir; sin repetir; como máximo 20.
export function enlacesDelCuerpo(html, { hostPropio = "" } = {}) {
  const h = String(html || "");
  const salida = [];
  for (const p of h.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    for (const a of p[1].matchAll(/<a\b[^>]*\bhref\s*=\s*["'](https?:\/\/[^"'#\s]+)["']/gi)) {
      const url = decodeEntities(a[1]).trim();
      const host = hostDe(url);
      if (!host || (hostPropio && (host === hostPropio || host.endsWith(`.${hostPropio}`)))) continue;
      if (/(^|\.)(twitter|x|facebook|instagram|threads|bsky|tiktok|youtube|linkedin|reddit|t)\.(com|app|net|co|me)$/i.test(host)) continue;
      if (!salida.includes(url)) salida.push(url);
      if (salida.length >= 20) return salida;
    }
  }
  return salida;
}

export function extraerArticulo(html) {
  const h = String(html || "");
  const tituloTag = h.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const titulo = meta(h, "property", "og:title") || (tituloTag ? cleanText(tituloTag[1]) : "");
  const descripcion = meta(h, "property", "og:description") || meta(h, "name", "description");
  let fecha = meta(h, "property", "article:published_time");
  if (!fecha) {
    const ld = h.match(/"datePublished"\s*:\s*"([^"]+)"/);
    fecha = ld ? ld[1] : "";
  }
  let actualizado = meta(h, "property", "article:modified_time");
  if (!actualizado) {
    const ld = h.match(/"dateModified"\s*:\s*"([^"]+)"/);
    actualizado = ld ? ld[1] : "";
  }
  const canonica = canonicaDe(h);
  return { titulo, descripcion, fecha, parrafos: parrafosDesdeHtml(h), autor: autorDe(h), canonica, actualizado, enlaces: enlacesDelCuerpo(h, { hostPropio: hostDe(canonica) }) };
}

export function textoParaClaude(parrafos, max = 1500) {
  const salida = [];
  let largo = 0;
  for (const p of parrafos) {
    const extra = (salida.length ? 2 : 0) + p.length;
    if (largo + extra > max) break;
    salida.push(p);
    largo += extra;
  }
  if (!salida.length && parrafos.length) return parrafos[0].slice(0, max);
  return salida.join("\n\n");
}

export async function descargarArticulo(url, { fetchText, timeoutMs = 15000 }) {
  const html = await fetchText(url, { timeoutMs, retries: 0, accept: "text/html,application/xhtml+xml" });
  return extraerArticulo(html);
}
