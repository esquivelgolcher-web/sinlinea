// Frases célebres (formato "frase"): una pieza tipográfica con una cita textual de un papa, su autor y su fuente.
// Dos orígenes, ninguno inventado: el banco propio de la cuenta (`config.frases.banco`, revisado por el operador) y una
// frase literal extraída de un texto real (homilía, discurso, ángelus) publicado por una fuente de la cuenta. Ninguna
// frase se publica sin fuente, y ninguna se repite: lo usado en cualquier pieza de la cuenta (aunque esté descartada)
// queda fuera. Módulo isomorfo (sin node:fs): el panel lo usa para editar y validar.
import { nuevoId } from "./posts.mjs";
import { normalizarHashtags } from "./caption.mjs";
import { claveDia } from "./fechas.mjs";

export const MAX_FRASE = 320;
export const ORIGENES_FRASE = Object.freeze(["banco", "texto"]);
export const URL_SANTA_SEDE = "https://www.vatican.va/";
export const CATEGORIA_FRASE_POR_DEFECTO = "CULTURA";

// Comparación tolerante: minúsculas, comillas y guiones tipográficos unificados, espacios colapsados, puntuación de los
// extremos fuera. Así "“Peace be with you all!”" y "peace be with you all" son la misma frase.
export function normalizarTexto(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[“”«»„‟]/g, '"').replace(/[‘’‚‛]/g, "'").replace(/[–—]/g, "-").replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .replace(/^[\s"'.,;:!?¡¿()\-]+|[\s"'.,;:!?¡¿()\-]+$/g, "")
    .trim();
}

export function frasesUsadas(posts) {
  const usadas = new Set();
  for (const p of posts || []) if (p?.frase?.texto) usadas.add(normalizarTexto(p.frase.texto));
  return usadas;
}

// Primera frase del banco (en su orden) que la cuenta no haya usado todavía; null si el banco está agotado.
export function elegirDelBanco(banco, posts) {
  const usadas = frasesUsadas(posts);
  return (banco || []).find((f) => f?.texto && !usadas.has(normalizarTexto(f.texto))) || null;
}

// ¿La frase aparece tal cual (con tolerancia tipográfica) dentro del texto? Es la garantía de que no se inventó.
export function esLiteral(frase, texto) {
  const f = normalizarTexto(frase);
  if (!f) return false;
  return normalizarTexto(texto).includes(f);
}

export function frasesCreadasHoy(posts, ahora, zona) {
  const hoy = claveDia(ahora, zona);
  return (posts || []).filter((p) => p?.formato === "frase" && claveDia(new Date(p.creado), zona) === hoy).length;
}

function fechaLarga(iso, idioma = "es", zona) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const lang = String(idioma || "es").toLowerCase();
  if (lang.startsWith("en")) {
    const mes = new Intl.DateTimeFormat("en", { month: "long", timeZone: zona }).format(d);
    const dia = new Intl.DateTimeFormat("en", { day: "numeric", timeZone: zona }).format(d);
    const anio = new Intl.DateTimeFormat("en", { year: "numeric", timeZone: zona }).format(d);
    return `${dia} ${mes} ${anio}`;
  }
  return new Intl.DateTimeFormat(lang, { day: "numeric", month: "long", year: "numeric", timeZone: zona }).format(d);
}

// Texto de publicación: la frase entre comillas, la atribución y, si viene de un texto real, el medio y la fecha.
export function captionDeFrase(frase, { articulo = null, hashtags = [], idioma = "es", zona = undefined } = {}) {
  const atribucion = [frase.autor, [frase.fuente, frase.anio ? `(${frase.anio})` : ""].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const partes = [`“${String(frase.texto).trim()}”`, `— ${atribucion}`];
  if (articulo?.medio) partes.push(`${String(idioma).toLowerCase().startsWith("en") ? "Via" : "Vía"} ${articulo.medio}${articulo.fecha ? `, ${fechaLarga(articulo.fecha, idioma, zona)}` : ""}`);
  const etiquetas = normalizarHashtags(hashtags || []);
  if (etiquetas.length) partes.push(etiquetas.join(" "));
  return partes.join("\n\n");
}

function recortar(s, max) {
  const t = String(s ?? "").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

function medioDeUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, "").replace(/\.([a-z]+)$/, ".$1"); } catch { return "Fuente"; }
}

// Pieza en formato frase. `origen` "banco" (frase del banco de la cuenta) o "texto" (extraída de `articulo`).
export function crearPostFrase({ frase, origen = "banco", articulo = null, config, ahora, zona, cuenta = null, variante = "negro" }) {
  if (!frase || typeof frase.texto !== "string" || !frase.texto.trim()) throw new Error("frase.texto es obligatorio");
  if (frase.texto.trim().length > MAX_FRASE) throw new Error(`frase.texto supera los ${MAX_FRASE} caracteres`);
  if (!ORIGENES_FRASE.includes(origen)) throw new Error(`origen de frase desconocido: ${origen}`);
  const iso = ahora.toISOString();
  const cfgFrases = config.frases || {};
  const anio = Number.isInteger(frase.anio) ? frase.anio : null;
  const urlPropia = typeof frase.url === "string" && /^https?:\/\//.test(frase.url) ? frase.url : null;
  const fuente = articulo
    ? { medio: articulo.medio, url: articulo.url, titulo: articulo.titulo || String(frase.fuente || ""), publicado: articulo.fecha || iso }
    : { medio: urlPropia ? tituloDeMedio(urlPropia) : "Vatican.va", url: urlPropia || cfgFrases.urlPorDefecto || URL_SANTA_SEDE, titulo: String(frase.fuente || ""), publicado: anio ? `${anio}-01-01T00:00:00.000Z` : iso };
  const datos = { texto: frase.texto.trim(), autor: String(frase.autor || "").trim(), fuente: String(frase.fuente || "").trim(), anio, url: articulo?.url || urlPropia, origen };
  return {
    id: nuevoId({ medio: fuente.medio, url: `${fuente.url}#${normalizarTexto(datos.texto)}`, ahora, zona, cuenta }),
    ...(cuenta ? { cuenta } : {}),
    estado: "borrador",
    formato: "frase",
    frase: datos,
    fuente,
    categoria: cfgFrases.categoria || CATEGORIA_FRASE_POR_DEFECTO,
    titular: recortar(datos.autor || "Frase", 65),
    bajada: recortar([datos.fuente, anio].filter(Boolean).join(" · ") || datos.autor, 110),
    caption: captionDeFrase(datos, { articulo, hashtags: cfgFrases.hashtags || [], idioma: config.idioma, zona }),
    hashtags: normalizarHashtags(cfgFrases.hashtags || []),
    variante,
    imagen: null,
    ilustracion: null,
    programado: null,
    publicacion: null,
    error: null,
    creado: iso,
    actualizado: iso,
  };
}

function tituloDeMedio(url) {
  const host = medioDeUrl(url);
  return host === "vatican.va" ? "Vatican.va" : host;
}
