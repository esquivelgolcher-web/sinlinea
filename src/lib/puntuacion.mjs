// Puntuación editorial configurable (perfil.puntuacion). Es una heurística para ordenar y filtrar temas, no una
// predicción de alcance. Módulo isomorfo: sin imports de Node.
export const PESOS_POR_DEFECTO = Object.freeze({ afinidad: 30, interes: 25, evidencia: 20, actualidad: 15, visual: 10 });
export const EJES = Object.keys(PESOS_POR_DEFECTO);
export const EJES_SUBJETIVOS = ["afinidad", "interes", "evidencia", "visual"]; // los pone el redactor (0-10); la actualidad se calcula

export function validarPesos(pesos) {
  const e = [];
  if (!pesos || typeof pesos !== "object") return ["perfil.puntuacion.pesos debe ser un objeto"];
  for (const k of EJES) {
    if (pesos[k] === undefined) e.push(`perfil.puntuacion.pesos: falta ${k}`);
    else if (!Number.isInteger(pesos[k]) || pesos[k] < 0) e.push(`perfil.puntuacion.pesos.${k} debe ser un entero no negativo`);
  }
  if (!e.length) {
    const suma = EJES.reduce((s, k) => s + pesos[k], 0);
    if (suma !== 100) e.push(`perfil.puntuacion.pesos: los pesos suman ${suma}; deben sumar 100`);
  }
  return e;
}

const acotar = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.min(10, Math.max(0, n)) : 0; };

// Actualidad 0-10 por antigüedad de la publicación de la fuente: un hecho antiguo no se presenta como reciente.
export function actualidadDe(publicadoIso, ahora = new Date()) {
  const t = Date.parse(publicadoIso);
  if (Number.isNaN(t)) return 0;
  const horas = (ahora.getTime() - t) / 3600000;
  if (horas <= 24) return 10;
  if (horas <= 48) return 8;
  if (horas <= 72) return 6;
  if (horas <= 24 * 7) return 3;
  return 0;
}

export function puntuar(valores = {}, { publicado, ahora = new Date(), pesos = PESOS_POR_DEFECTO } = {}) {
  const ejes = { ...valores, actualidad: actualidadDe(publicado, ahora) };
  const componentes = {};
  let total = 0;
  for (const k of EJES) {
    const puntos = Math.round((acotar(ejes[k]) / 10) * (pesos[k] ?? 0));
    componentes[k] = puntos;
    total += puntos;
  }
  return { total, componentes, actualidad: ejes.actualidad };
}
