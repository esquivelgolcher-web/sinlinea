// Descarga con timeout y reintentos, y parser RSS/Atom sin dependencias.
// Portado de Que Hay Panamá; añade `contenido` (content:encoded crudo).
import { cleanText, decodeEntities, stripCdata } from "./util.mjs";

const UA = "Mozilla/5.0 (compatible; SinLineaBot/1.0; +https://www.instagram.com/sinlinea)";

export async function fetchText(url, { timeoutMs = 20000, retries = 1, accept, fetchImpl = fetch } = {}) {
  let ultimo;
  for (let intento = 0; intento <= retries; intento++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        signal: ctrl.signal,
        redirect: "follow",
        headers: {
          "User-Agent": UA,
          Accept: accept || "application/rss+xml, application/xml, text/xml, text/html, */*",
          "Accept-Language": "es-PA,es;q=0.9",
        },
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
      return await res.text();
    } catch (err) {
      clearTimeout(timer);
      ultimo = err;
      if (intento < retries) await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw ultimo;
}

function primeraEtiqueta(bloque, nombre) {
  const re = new RegExp(`<(?:[\\w-]+:)?${nombre}(\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${nombre}>`, "i");
  const m = bloque.match(re);
  return m ? m[2] : "";
}

function etiquetasSimples(bloque, nombre) {
  return bloque.match(new RegExp(`<(?:[\\w-]+:)?${nombre}\\b[^>]*?>`, "gi")) || [];
}

function atributo(tag, attr) {
  const m = tag.match(new RegExp(`\\b${attr}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return m ? (m[2] ?? m[3] ?? "") : "";
}

function extraerImagen(bloque) {
  const medios = [...etiquetasSimples(bloque, "media:content"), ...etiquetasSimples(bloque, "media:thumbnail")];
  let mejor = "", mejorAncho = -1;
  for (const tag of medios) {
    const url = decodeEntities(atributo(tag, "url"));
    if (!url) continue;
    const tipo = atributo(tag, "medium") || atributo(tag, "type");
    if (tipo && !/image/i.test(tipo)) continue;
    const w = Number(atributo(tag, "width")) || 0;
    if (w > mejorAncho) { mejor = url; mejorAncho = w; }
  }
  if (mejor) return mejor;
  const enc = etiquetasSimples(bloque, "enclosure").find((t) => /image/i.test(atributo(t, "type")));
  return enc ? decodeEntities(atributo(enc, "url")) : "";
}

export function parseFeed(xml) {
  const texto = String(xml || "");
  const esAtom = /<feed[\s>]/i.test(texto) && !/<rss[\s>]/i.test(texto);
  const bloques = texto.match(esAtom ? /<entry\b[\s\S]*?<\/entry>/gi : /<item\b[\s\S]*?<\/item>/gi) || [];
  const items = [];
  for (const b of bloques) {
    const title = cleanText(primeraEtiqueta(b, "title"));
    if (!title) continue;
    let link = "";
    if (esAtom) {
      const links = etiquetasSimples(b, "link");
      const alt = links.find((t) => /rel\s*=\s*["']?alternate/i.test(t)) || links[0];
      link = alt ? decodeEntities(atributo(alt, "href")) : "";
    } else {
      link = cleanText(primeraEtiqueta(b, "link"));
    }
    const guid = cleanText(primeraEtiqueta(b, "guid") || primeraEtiqueta(b, "id"));
    if (!link && /^https?:\/\//i.test(guid)) link = guid;
    if (!link) continue;
    const pubDate = cleanText(
      primeraEtiqueta(b, "pubDate") || primeraEtiqueta(b, "published") || primeraEtiqueta(b, "updated") || ""
    );
    const description = cleanText(primeraEtiqueta(b, "description") || primeraEtiqueta(b, "summary"));
    const contenido = stripCdata(primeraEtiqueta(b, "encoded")).trim();
    items.push({ title, link, guid: guid || link, pubDate, description, contenido, image: extraerImagen(b) });
  }
  return items;
}
