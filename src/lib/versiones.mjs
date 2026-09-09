// Versiones del texto por red (multicanal, F1). Módulo isomorfo (Node y navegador).
// Solo PROPONE: nunca recorta. Si una propuesta excede el límite de su red, se marca `excede` y el operador la edita
// antes de aprobar ese destino (diseño §3.3: no se pierden atribuciones ni palabras como "presunto" por un corte).
import { componerCaption, validarCaption } from "./caption.mjs";
import { REDES, NOMBRES_RED } from "./destinos.mjs";

export const LIMITES_RED = Object.freeze({
  instagram: { caracteres: 2200 },
  facebook: { caracteres: 63206 },
});

function exigirRed(red) {
  if (!REDES.includes(red)) throw new Error(`Red desconocida: ${red} (${REDES.join(", ")})`);
}

// Mide un texto (propuesto o editado) con las reglas de su red.
export function medirVersion(texto, red) {
  exigirRed(red);
  const t = String(texto ?? "");
  const limite = LIMITES_RED[red].caracteres;
  const errores = [];
  if (!t.trim()) errores.push(`La versión para ${NOMBRES_RED[red]} está vacía.`);
  if (red === "instagram") errores.push(...validarCaption(t).errores);
  else if (t.length > limite) errores.push(`La versión para ${NOMBRES_RED[red]} tiene ${t.length} caracteres; el máximo es ${limite}.`);
  return { limite, longitud: t.length, excede: errores.length > 0, errores };
}

export function proponerVersion(post, red) {
  exigirRed(red);
  const medio = post.fuente?.medio || "";
  let texto;
  if (red === "instagram") texto = componerCaption({ caption: post.caption, medio, hashtags: post.hashtags });
  else texto = `${String(post.caption || "").trim()}\n\nFuente: ${medio}`;
  return { texto, ...medirVersion(texto, red) };
}

export function versionesPropuestas(post, redes) {
  const salida = {};
  for (const red of redes) salida[red] = proponerVersion(post, red);
  return salida;
}
