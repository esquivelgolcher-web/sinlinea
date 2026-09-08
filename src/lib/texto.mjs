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

// Renderiza un post y, si el texto no cabe (por caracteres o por líneas), pide una versión más corta una vez.
// `render(post) → imagen` puede lanzar un error con code "TEXTO_NO_CABE" y campo "titular" | "bajada".
// `acortar({ titular, bajada, motivo }) → { titular, bajada }` es opcional (null cuando no hay cliente de Claude).
// El error que se propaga lleva en `err.post` el post con el texto ya acortado (si lo hubo), para no perderlo.
export async function renderizarConAjuste({ post, render, acortar = null, log = null }) {
  let actual = post;
  let acortado = false;
  const conPost = (err) => { err.post = actual; return err; };
  const pedir = async (motivo) => {
    const r = await acortar({ titular: actual.titular, bajada: actual.bajada, motivo });
    actual = { ...actual, titular: r.titular, bajada: r.bajada };
    acortado = true;
    log?.info?.(`Texto acortado: "${r.titular}" · "${r.bajada}"`);
  };
  const v = validarTextos(post);
  if (acortar && !v.ok && String(post.titular ?? "").trim()) {
    try { await pedir(v.errores.join(" ")); }
    catch (err) { log?.warn?.(`No se pudo acortar el texto: ${err.message}`); }
  }
  try {
    return { post: actual, imagen: await render(actual) };
  } catch (err) {
    if (err?.code !== "TEXTO_NO_CABE" || !acortar || acortado) throw conPost(err);
    try { await pedir(err.message); }
    catch (e) { log?.warn?.(`No se pudo acortar el texto: ${e.message}`); throw conPost(err); }
    try { return { post: actual, imagen: await render(actual) }; }
    catch (e2) { throw conPost(e2); }
  }
}
