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
  return { titulo, descripcion, fecha, parrafos: parrafosDesdeHtml(h) };
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
