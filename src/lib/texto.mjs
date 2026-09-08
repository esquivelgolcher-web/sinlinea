// Límites de los textos que van en la imagen (titular y bajada).
// Módulo isomorfo: sin imports de Node, se usa también en el panel.
export const LIMITES = Object.freeze({
  titularMax: 65,
  titularIdeal: Object.freeze([40, 55]),
  bajadaMax: 110,
});

export function validarTextos({ titular, bajada }) {
  const t = String(titular ?? "").trim();
  const b = String(bajada ?? "").trim();
  const errores = [];
  if (!t) errores.push("El titular está vacío.");
  else if (t.length > LIMITES.titularMax) errores.push(`El titular tiene ${t.length} caracteres; el máximo es ${LIMITES.titularMax}.`);
  if (b.length > LIMITES.bajadaMax) errores.push(`La bajada tiene ${b.length} caracteres; el máximo es ${LIMITES.bajadaMax}.`);
  return { ok: errores.length === 0, errores };
}
