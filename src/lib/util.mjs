// Utilidades de texto: entidades HTML, limpieza, escape, slug, hash corto.
import { createHash } from "node:crypto";

const ENTIDADES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  ntilde: "ñ", Ntilde: "Ñ", uuml: "ü", Uuml: "Ü",
  iquest: "¿", iexcl: "¡", ordf: "ª", ordm: "º", deg: "°",
  laquo: "«", raquo: "»", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’",
  ndash: "–", mdash: "—", hellip: "…", middot: "·", bull: "•",
  euro: "€", copy: "©", reg: "®", trade: "™",
};

function puntoDeCodigo(cp) {
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return "";
  try { return String.fromCodePoint(cp); } catch { return ""; }
}

export function decodeEntities(str = "") {
  return String(str)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => puntoDeCodigo(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => puntoDeCodigo(parseInt(d, 10)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (m, n) =>
      Object.prototype.hasOwnProperty.call(ENTIDADES, n) ? ENTIDADES[n] : m);
}

export function stripCdata(str = "") {
  return String(str).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

export function stripTags(str = "") {
  return String(str).replace(/<[^>]*>/g, " ");
}

// De un fragmento con CDATA, HTML y entidades (posiblemente doblemente
// escapadas) a texto plano de una sola línea.
export function cleanText(str = "") {
  let s = stripCdata(String(str));
  s = decodeEntities(s);
  s = stripTags(s);
  s = decodeEntities(s);
  return s.replace(/\s+/g, " ").trim();
}

export function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function sha1short(str, len = 12) {
  return createHash("sha1").update(String(str)).digest("hex").slice(0, len);
}

export function slugify(str, max = 40) {
  const s = String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
  return s || "x";
}
