// Composición y límites del caption de Instagram. Módulo isomorfo (Node y navegador).
export const LIMITES = { caracteres: 2200, hashtags: 30, menciones: 20 };

export function normalizarHashtags(lista) {
  const salida = [];
  const vistos = new Set();
  for (const h of lista || []) {
    const limpio = "#" + String(h || "").replace(/\s+/g, "").replace(/^#+/, "");
    if (limpio === "#" || vistos.has(limpio)) continue;
    vistos.add(limpio);
    salida.push(limpio);
  }
  return salida;
}

export function componerCaption({ caption, medio, hashtags }) {
  const partes = [String(caption || "").trim(), `Fuente: ${medio}`];
  const tags = normalizarHashtags(hashtags);
  if (tags.length) partes.push(tags.join(" "));
  return partes.join("\n\n");
}

export function contarHashtags(texto) {
  return (String(texto).match(/#[\p{L}\p{N}_]+/gu) || []).length;
}

export function contarMenciones(texto) {
  return (String(texto).match(/@[\p{L}\p{N}_.]+/gu) || []).length;
}

export function validarCaption(texto) {
  const t = String(texto);
  const errores = [];
  if (t.length > LIMITES.caracteres) errores.push(`El caption tiene ${t.length} caracteres; el máximo es ${LIMITES.caracteres}.`);
  const h = contarHashtags(t);
  if (h > LIMITES.hashtags) errores.push(`Hay ${h} hashtags; el máximo es ${LIMITES.hashtags}.`);
  const m = contarMenciones(t);
  if (m > LIMITES.menciones) errores.push(`Hay ${m} menciones; el máximo es ${LIMITES.menciones}.`);
  if (/\n{3,}/.test(t)) errores.push("Hay líneas vacías de más (tres saltos seguidos).");
  return { ok: errores.length === 0, errores };
}

export function recortarCaption({ caption, medio, hashtags }) {
  let tags = normalizarHashtags(hashtags);
  let recortado = false;
  if (tags.length > LIMITES.hashtags) { tags = tags.slice(0, LIMITES.hashtags); recortado = true; }
  let texto = String(caption || "").replace(/\n{3,}/g, "\n\n").trim();
  // Menciones de más: se les quitan las @ (todas las que las preceden) y quedan como texto plano.
  let menciones = 0;
  const conMencionesLimitadas = texto.replace(/@+([\p{L}\p{N}_.]+)/gu, (m, nombre) => (++menciones > LIMITES.menciones ? nombre : m));
  if (conMencionesLimitadas !== texto) { texto = conMencionesLimitadas; recortado = true; }
  if (contarMenciones(texto) > LIMITES.menciones) { texto = texto.replace(/@+/g, ""); recortado = true; } // red de seguridad
  let parrafos = texto.split(/\n\n/);
  const largo = () => componerCaption({ caption: texto, medio, hashtags: tags }).length;
  while (largo() > LIMITES.caracteres) {
    recortado = true;
    if (parrafos.length > 1) {
      parrafos = parrafos.slice(0, -1);
      texto = parrafos.join("\n\n");
    } else if (texto.length > 1) {
      const sobrante = largo() - LIMITES.caracteres;
      texto = texto.slice(0, Math.max(0, texto.length - sobrante - 1)).trimEnd() + "…";
    } else if (tags.length) {
      tags = tags.slice(0, -1);
    } else {
      break; // solo queda "Fuente: <medio>"; no hay nada más que recortar
    }
  }
  return { caption: texto, hashtags: tags, recortado };
}
