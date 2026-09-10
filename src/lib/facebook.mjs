// Cliente mínimo de la Graph API para publicar fotos en una página de Facebook (multicanal, F1).
// Publica en dos fases para poder reconciliar con evidencia (diseño §3.4 y §4.2):
//   1. POST /{page-id}/photos con published=false → id de la foto (el "contenedor"; no aparece en el muro).
//   2. POST /{page-id}/feed con attached_media=[{media_fbid}] y message → id de la publicación; permalink_url después.
// Una publicación se identifica de forma inequívoca por la foto adjunta (attachments.target.id), nunca por el texto.
// Documentación: https://developers.facebook.com/docs/graph-api/reference/page/photos/ y /page/feed.
import { ErrorIncierto } from "./incierto.mjs";
export { ErrorIncierto };
const HOST = "https://graph.facebook.com";
export const CODIGOS_DE_LIMITE_FACEBOOK = Object.freeze([4, 17, 32, 613, 80001]);

function errorDeApi(json, status) {
  const e = new Error(json?.error?.message || `HTTP ${status}`);
  e.codigo = json?.error?.code ?? status;
  e.subcodigo = json?.error?.error_subcode ?? null;
  e.tipo = json?.error?.type ?? null;
  e.status = status;
  e.limite = CODIGOS_DE_LIMITE_FACEBOOK.includes(Number(e.codigo));
  return e;
}

export function crearClienteFacebook({ token, paginaId, apiVersion, fetchImpl = fetch, dormir = (ms) => new Promise((r) => setTimeout(r, ms)), reintentos = 3 }) {
  const base = `${HOST}/${apiVersion}`;
  let llamadas = 0;

  // `sinReintento`: llamadas que crean algo visible; un fallo de red tras enviarlas es incierto y no se repite a ciegas.
  async function llamar(metodo, url, params = {}, { sinReintento = false } = {}) {
    const datos = new URLSearchParams({ ...params, access_token: token });
    const maximo = sinReintento ? 0 : reintentos;
    let ultimo;
    for (let intento = 0; intento <= maximo; intento++) {
      llamadas++;
      let res;
      try {
        res = metodo === "GET"
          ? await fetchImpl(`${url}?${datos}`)
          : await fetchImpl(url, { method: metodo, headers: { "content-type": "application/x-www-form-urlencoded" }, body: datos.toString() });
      } catch (err) {
        if (sinReintento) throw new ErrorIncierto(`sin respuesta de Facebook tras enviar la petición (${err.message})`, err);
        ultimo = err;
        if (intento < maximo) await dormir(1000 * 2 ** intento);
        continue;
      }
      const json = await res.json().catch(() => ({}));
      if (res.ok) return json;
      const error = errorDeApi(json, res.status);
      if (res.status < 500 || sinReintento) throw error;
      ultimo = error;
      if (intento < maximo) await dormir(1000 * 2 ** intento);
    }
    throw ultimo;
  }

  // Identidad del token: con un token de página, /me es la página.
  async function perfil() {
    const r = await llamar("GET", `${base}/me`, { fields: "id,name" });
    const id = r.id !== undefined && r.id !== null ? String(r.id) : "";
    return { id, nombre: String(r.name || ""), coincideId: paginaId ? id !== "" && id === String(paginaId) : undefined };
  }

  // Fase 1: la foto sin publicar. Repetirla no duplica nada visible, así que admite reintentos ante 5xx.
  async function crearContenedor({ imageUrl }) {
    const r = await llamar("POST", `${base}/${paginaId}/photos`, { url: imageUrl, published: "false" });
    if (!r.id) throw new Error("La API no devolvió el id de la foto");
    return String(r.id);
  }

  // Fase 2: la publicación con la foto adjunta (o varias, en orden, para un carrusel). Sin reintentos: un corte aquí es incierto.
  async function publicarContenedor({ contenedorId = null, hijos = null, texto }) {
    const ids = Array.isArray(hijos) && hijos.length ? hijos : [contenedorId];
    const r = await llamar("POST", `${base}/${paginaId}/feed`, { message: texto, attached_media: JSON.stringify(ids.map((id) => ({ media_fbid: id }))) }, { sinReintento: true });
    if (!r.id) throw new Error("La API no devolvió el id de la publicación");
    return { id: String(ids[0]), idPublicacion: String(r.id), permalink: await permalink(String(r.id)) };
  }

  async function permalink(idPublicacion) {
    try {
      const r = await llamar("GET", `${base}/${idPublicacion}`, { fields: "permalink_url" });
      return String(r.permalink_url || "");
    } catch {
      return "";
    }
  }

  // Evidencia para reconciliar: ¿existe la foto (contenedor)? ¿Hay una publicación posterior a `desde` con esa foto adjunta?
  async function existeContenedor(contenedorId) {
    try {
      const r = await llamar("GET", `${base}/${contenedorId}`, { fields: "id" });
      return String(r.id || "") === String(contenedorId);
    } catch (err) {
      if (err.status && err.status < 500 && !err.limite) return false;
      throw err;
    }
  }

  // `contenedorId` puede ser un id o una lista (carrusel): basta con que cualquiera de las fotos aparezca en attachments o,
  // en una publicación con varias fotos, en subattachments.
  async function publicacionConContenedor(contenedorId, { desde, limite = 25 } = {}) {
    const ids = new Set((Array.isArray(contenedorId) ? contenedorId : [contenedorId]).map(String));
    const params = { fields: "id,created_time,permalink_url,attachments{target,subattachments{target}}", limit: String(limite) };
    if (desde) params.since = String(Math.floor(Date.parse(desde) / 1000));
    const r = await llamar("GET", `${base}/${paginaId}/posts`, params);
    for (const p of r.data || []) {
      const adjuntos = p.attachments?.data || [];
      const objetivos = adjuntos.flatMap((a) => [String(a?.target?.id || ""), ...((a?.subattachments?.data || []).map((s) => String(s?.target?.id || "")))]);
      const encontrado = objetivos.find((id) => id && ids.has(id));
      if (encontrado) {
        return { id: Array.isArray(contenedorId) ? String(contenedorId[0]) : String(contenedorId), idPublicacion: String(p.id), permalink: String(p.permalink_url || "") };
      }
    }
    return null;
  }

  async function imagenPublica(url) {
    try {
      const res = await fetchImpl(url, { method: "HEAD" });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  return { perfil, crearContenedor, publicarContenedor, existeContenedor, publicacionConContenedor, imagenPublica, llamadasHechas: () => llamadas };
}
