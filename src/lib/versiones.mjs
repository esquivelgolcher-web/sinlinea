// Versiones del texto por red (multicanal: F1 Facebook, F2 Threads). Módulo isomorfo (Node y navegador).
// Solo PROPONE: nunca recorta. Si una propuesta excede el límite de su red, se marca `excede` y el operador la edita
// antes de aprobar ese destino (diseño §3.3: no se pierden atribuciones ni palabras como "presunto" por un corte).
import { componerCaption, validarCaption } from "./caption.mjs";
import { REDES, NOMBRES_RED } from "./destinos.mjs";
import { partesZona } from "./fechas.mjs";

// Threads (documentación oficial, 2026-09): 500 caracteres por publicación; "los emojis cuentan como su número de bytes
// UTF-8". El resto de caracteres (letras, acentos, signos) cuentan uno.
export const LIMITES_RED = Object.freeze({
  instagram: { caracteres: 2200 },
  facebook: { caracteres: 63206 },
  threads: { caracteres: 500, emojisPorBytes: true },
});

const RE_EMOJI = /\p{Extended_Pictographic}|\p{Emoji_Modifier}|\u200d|\ufe0f/u;
const bytesUtf8 = (ch) => { const c = ch.codePointAt(0); return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; };

// Longitud de un texto según las reglas de su red.
export function longitudRed(texto, red) {
  const t = String(texto ?? "");
  if (!LIMITES_RED[red]?.emojisPorBytes) return t.length;
  let n = 0;
  for (const ch of t) n += RE_EMOJI.test(ch) ? bytesUtf8(ch) : 1;
  return n;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function fechaLarga(iso) {
  try {
    const p = partesZona(iso);
    return `${p.day} de ${MESES[p.month - 1]} de ${p.year}`;
  } catch {
    return "";
  }
}

function exigirRed(red) {
  if (!REDES.includes(red)) throw new Error(`Red desconocida: ${red} (${REDES.join(", ")})`);
}

// Mide un texto (propuesto o editado) con las reglas de su red.
export function medirVersion(texto, red) {
  exigirRed(red);
  const t = String(texto ?? "");
  const limite = LIMITES_RED[red].caracteres;
  const longitud = longitudRed(t, red);
  const errores = [];
  if (!t.trim()) errores.push(`La versión para ${NOMBRES_RED[red]} está vacía.`);
  if (red === "instagram") errores.push(...validarCaption(t).errores);
  else if (longitud > limite) errores.push(`La versión para ${NOMBRES_RED[red]} tiene ${longitud} caracteres; el máximo es ${limite}.`);
  return { limite, longitud, excede: errores.length > 0, errores };
}

// Threads: si el caption con la fuente cabe, es la propuesta. Si no, una versión corta con el titular, la bajada y la
// atribución «Según <medio> (<fecha>)». Si tampoco cabe, se devuelve el caption íntegro marcado como excede: el operador
// lo edita; nunca se recorta.
function propuestaThreads(post, medio) {
  const caption = `${String(post.caption || "").trim()}\n\nFuente: ${medio}`;
  if (!medirVersion(caption, "threads").excede) return caption;
  const fecha = fechaLarga(post.fuente?.publicado);
  const atribucion = `Según ${medio}${fecha ? ` (${fecha})` : ""}`;
  const corta = [String(post.titular || "").trim(), String(post.bajada || "").trim(), atribucion].filter(Boolean).join("\n\n");
  return medirVersion(corta, "threads").excede ? caption : corta;
}

export function proponerVersion(post, red) {
  exigirRed(red);
  const medio = post.fuente?.medio || "";
  let texto;
  if (red === "instagram") texto = componerCaption({ caption: post.caption, medio, hashtags: post.hashtags });
  else if (red === "threads") texto = propuestaThreads(post, medio);
  else texto = `${String(post.caption || "").trim()}\n\nFuente: ${medio}`;
  return { texto, ...medirVersion(texto, red) };
}

export function versionesPropuestas(post, redes) {
  const salida = {};
  for (const red of redes) salida[red] = proponerVersion(post, red);
  return salida;
}
