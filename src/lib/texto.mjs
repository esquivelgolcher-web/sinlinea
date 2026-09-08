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

// Renderiza un post y, si el titular no cabe (por caracteres o por líneas), pide uno más corto una vez.
// `render(post) → imagen` puede lanzar un error con code "TEXTO_NO_CABE" y campo "titular" | "bajada".
// `acortar({ titular, bajada, motivo }) → titular` es opcional (null cuando no hay cliente de Claude).
export async function renderizarConAjuste({ post, render, acortar = null, log = null }) {
  let actual = post;
  let acortado = false;
  const pedir = async (motivo) => {
    const nuevo = await acortar({ titular: actual.titular, bajada: actual.bajada, motivo });
    actual = { ...actual, titular: nuevo };
    acortado = true;
    log?.info?.(`Titular acortado: "${nuevo}"`);
  };
  const largo = String(post.titular ?? "").trim().length;
  if (acortar && largo > LIMITES.titularMax) {
    try { await pedir(`El titular tiene ${largo} caracteres; el máximo es ${LIMITES.titularMax}.`); }
    catch (err) { log?.warn?.(`No se pudo acortar el titular: ${err.message}`); }
  }
  try {
    return { post: actual, imagen: await render(actual) };
  } catch (err) {
    if (err?.code !== "TEXTO_NO_CABE" || err.campo !== "titular" || !acortar || acortado) throw err;
    try { await pedir(err.message); }
    catch (e) { log?.warn?.(`No se pudo acortar el titular: ${e.message}`); throw err; }
    return { post: actual, imagen: await render(actual) };
  }
}
