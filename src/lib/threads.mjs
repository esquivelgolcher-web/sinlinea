// Cliente mínimo de la Threads API para publicar una imagen con texto (multicanal, F2).
// Misma forma que Instagram, en otro host y con otros nombres de campo (documentación oficial, 2026-09):
//   1. POST /{threads-user-id}/threads  (media_type=IMAGE, image_url, text) → id del contenedor.
//   2. GET  /{container-id}?fields=status,error_message hasta FINISHED (recomiendan esperar ~30 s; validez 24 h).
//   3. POST /{threads-user-id}/threads_publish (creation_id) → id del medio publicado; luego GET /{media-id}?fields=permalink.
// Evidencia para reconciliar: el contenedor publicado responde PUBLISHED y el mismo id sirve para pedir el permalink.
// Tokens: refresh con th_refresh_token (token de ≥24 h, vigente 60 días); intercambio corto→largo con th_exchange_token.
// Documentación: https://developers.facebook.com/docs/threads/posts, /threads/reference/media, /threads/get-started/long-lived-tokens.
import { ErrorIncierto } from "./incierto.mjs";
export { ErrorIncierto };
const HOST = "https://graph.threads.net";
export const CODIGOS_DE_LIMITE_THREADS = Object.freeze([4, 17, 32, 613]);
export const ESPERA_CONTENEDOR_THREADS_MS = 30000;

function errorDeApi(json, status) {
  const e = new Error(json?.error?.message || `HTTP ${status}`);
  e.codigo = json?.error?.code ?? status;
  e.subcodigo = json?.error?.error_subcode ?? null;
  e.tipo = json?.error?.type ?? null;
  e.status = status;
  e.limite = CODIGOS_DE_LIMITE_THREADS.includes(Number(e.codigo));
  return e;
}

export function crearClienteThreads({ token, usuarioId, apiVersion = "v1.0", fetchImpl = fetch, dormir = (ms) => new Promise((r) => setTimeout(r, ms)), reintentos = 3 }) {
  const base = `${HOST}/${apiVersion}`;
  let llamadas = 0;

  // `sinReintento`: la llamada que publica; un fallo de red tras enviarla es incierto y no se repite a ciegas.
  async function llamar(metodo, url, params = {}, { sinReintento = false, conToken = true } = {}) {
    const datos = new URLSearchParams(conToken ? { ...params, access_token: token } : params);
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
        if (sinReintento) throw new ErrorIncierto(`sin respuesta de Threads tras enviar la petición (${err.message})`, err);
        ultimo = err;
        if (intento < maximo) await dormir(1000 * 2 ** intento);
        continue;
      }
      const json = await res.json().catch(() => ({}));
      if (res.ok && !json.error) return json;
      const error = errorDeApi(json, res.status);
      if (res.status < 500 || sinReintento) throw error;
      ultimo = error;
      if (intento < maximo) await dormir(1000 * 2 ** intento);
    }
    throw ultimo;
  }

  // Identidad del token: /me es el perfil de Threads (id propio, distinto del de Instagram) y su nombre de usuario.
  async function perfil() {
    const r = await llamar("GET", `${base}/me`, { fields: "id,username" });
    const id = r.id !== undefined && r.id !== null ? String(r.id) : "";
    return { id, username: String(r.username || ""), coincideId: usuarioId ? id !== "" && id === String(usuarioId) : undefined };
  }

  // Fase 1: el contenedor. Repetirlo no publica nada, así que admite reintentos ante 5xx.
  async function crearContenedor({ imageUrl, texto }) {
    const r = await llamar("POST", `${base}/${usuarioId}/threads`, { media_type: "IMAGE", image_url: imageUrl, text: texto });
    if (!r.id) throw new Error("La API no devolvió el id del contenedor");
    return String(r.id);
  }

  async function esperarContenedor(contenedorId, { intentos = 10, esperaMs = ESPERA_CONTENEDOR_THREADS_MS } = {}) {
    for (let i = 0; i < intentos; i++) {
      const r = await llamar("GET", `${base}/${contenedorId}`, { fields: "status,error_message" });
      if (r.status === "FINISHED" || r.status === "PUBLISHED") return;
      if (r.status === "ERROR" || r.status === "EXPIRED") throw new Error(`El contenedor terminó en ${r.status}: ${r.error_message || "sin detalle"}`);
      await dormir(esperaMs);
    }
    throw new Error(`El contenedor ${contenedorId} no terminó de procesarse a tiempo`);
  }

  // Fase 2: publicar. Sin reintentos: un corte aquí es incierto.
  async function publicarContenedor(contenedorId) {
    const r = await llamar("POST", `${base}/${usuarioId}/threads_publish`, { creation_id: contenedorId }, { sinReintento: true });
    if (!r.id) throw new Error("La API no devolvió el id del medio publicado");
    return { idMedia: String(r.id), permalink: await permalink(String(r.id)) };
  }

  async function permalink(idMedia) {
    try {
      const r = await llamar("GET", `${base}/${idMedia}`, { fields: "permalink" });
      return String(r.permalink || "");
    } catch {
      return "";
    }
  }

  // Evidencia para reconciliar (diseño §4): estado del contenedor y, si está publicado, su permalink como medio.
  async function estadoContenedor(contenedorId) {
    try {
      const r = await llamar("GET", `${base}/${contenedorId}`, { fields: "status,error_message" });
      return { estado: String(r.status || "DESCONOCIDO"), detalle: String(r.error_message || "") };
    } catch (err) {
      if (err.status && err.status < 500 && !err.limite) return { estado: "DESCONOCIDO", detalle: err.message };
      throw err;
    }
  }

  async function medioPorContenedor(contenedorId) {
    const enlace = await permalink(contenedorId);
    if (!enlace) return null;
    return { idMedia: String(contenedorId), permalink: enlace };
  }

  async function cuota() {
    const r = await llamar("GET", `${base}/${usuarioId}/threads_publishing_limit`, { fields: "quota_usage,config" });
    const d = r.data?.[0] || {};
    return { usados: Number(d.quota_usage ?? 0), limite: Number(d.config?.quota_total ?? 250) };
  }

  async function refrescarToken() {
    const r = await llamar("GET", `${HOST}/refresh_access_token`, { grant_type: "th_refresh_token" });
    if (!r.access_token) throw new Error("La API no devolvió un token renovado");
    return { token: r.access_token, expiraEnSegundos: r.expires_in };
  }

  // Token corto (1 h, del generador de tokens del panel de Meta) → token largo (60 días). Solo desde el servidor.
  async function intercambiarToken({ clientSecret }) {
    const r = await llamar("GET", `${HOST}/access_token`, { grant_type: "th_exchange_token", client_secret: clientSecret });
    if (!r.access_token) throw new Error("La API no devolvió un token de larga duración");
    return { token: r.access_token, expiraEnSegundos: r.expires_in };
  }

  async function imagenPublica(url) {
    try {
      const res = await fetchImpl(url, { method: "HEAD" });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  return { perfil, crearContenedor, esperarContenedor, publicarContenedor, permalink, estadoContenedor, medioPorContenedor, cuota, refrescarToken, intercambiarToken, imagenPublica, llamadasHechas: () => llamadas };
}
