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
  let parrafos = String(caption || "").replace(/\n{3,}/g, "\n\n").trim().split(/\n\n/);
  let texto = parrafos.join("\n\n");
  while (componerCaption({ caption: texto, medio, hashtags: tags }).length > LIMITES.caracteres) {
    recortado = true;
    if (parrafos.length > 1) {
      parrafos = parrafos.slice(0, -1);
      texto = parrafos.join("\n\n");
    } else {
      const sobrante = componerCaption({ caption: texto, medio, hashtags: tags }).length - LIMITES.caracteres;
      texto = texto.slice(0, Math.max(0, texto.length - sobrante - 1)).trimEnd() + "…";
    }
  }
  return { caption: texto, hashtags: tags, recortado };
}
