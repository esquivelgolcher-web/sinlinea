// Cliente mínimo de la Instagram API with Instagram Login (graph.instagram.com).
const HOST = "https://graph.instagram.com";

function errorDeApi(json, status) {
  const e = new Error(json?.error?.message || `HTTP ${status}`);
  e.codigo = json?.error?.code ?? status;
  e.status = status;
  return e;
}

export function crearClienteInstagram({
  token, usuarioId, apiVersion, fetchImpl = fetch,
  dormir = (ms) => new Promise((r) => setTimeout(r, ms)), reintentos = 3,
}) {
  const base = `${HOST}/${apiVersion}`;

  async function llamar(metodo, url, params = {}) {
    const datos = new URLSearchParams({ ...params, access_token: token });
    let ultimo;
    for (let intento = 0; intento <= reintentos; intento++) {
      try {
        const res = metodo === "GET"
          ? await fetchImpl(`${url}?${datos}`)
          : await fetchImpl(url, { method: metodo, headers: { "content-type": "application/x-www-form-urlencoded" }, body: datos.toString() });
        const json = await res.json().catch(() => ({}));
        if (res.ok) return json;
        if (res.status >= 500) { ultimo = errorDeApi(json, res.status); }
        else throw errorDeApi(json, res.status);
      } catch (err) {
        if (err.status && err.status < 500) throw err;
        ultimo = err;
      }
      if (intento < reintentos) await dormir(1000 * 2 ** intento);
    }
    throw ultimo;
  }

  async function crearContenedor({ imageUrl, caption }) {
    const r = await llamar("POST", `${base}/${usuarioId}/media`, { image_url: imageUrl, caption });
    if (!r.id) throw new Error("La API no devolvió el id del contenedor");
    return r.id;
  }

  async function esperarContenedor(creationId, { intentos = 24, esperaMs = 5000 } = {}) {
    for (let i = 0; i < intentos; i++) {
      const r = await llamar("GET", `${base}/${creationId}`, { fields: "status_code,status" });
      if (r.status_code === "FINISHED") return;
      if (r.status_code === "ERROR" || r.status_code === "EXPIRED") {
        throw new Error(`El contenedor terminó en ${r.status_code}: ${r.status || "sin detalle"}`);
      }
      await dormir(esperaMs);
    }
    throw new Error(`El contenedor ${creationId} no terminó de procesarse a tiempo`);
  }

  async function publicar(creationId) {
    const r = await llamar("POST", `${base}/${usuarioId}/media_publish`, { creation_id: creationId });
    if (!r.id) throw new Error("La API no devolvió el id del post publicado");
    return r.id;
  }

  async function permalink(mediaId) {
    const r = await llamar("GET", `${base}/${mediaId}`, { fields: "permalink" });
    return r.permalink || "";
  }

  async function cuota() {
    const r = await llamar("GET", `${base}/${usuarioId}/content_publishing_limit`, { fields: "quota_usage,config" });
    const d = r.data?.[0] || {};
    return { usados: d.quota_usage ?? 0, limite: d.config?.quota_total ?? 100 };
  }

  async function refrescarToken() {
    const res = await fetchImpl(`${HOST}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.access_token) throw errorDeApi(json, res.status);
    return { token: json.access_token, expiraEnSegundos: json.expires_in };
  }

  async function imagenPublica(url) {
    try {
      const res = await fetchImpl(url, { method: "HEAD" });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async function publicarImagen({ imageUrl, caption }) {
    const creationId = await crearContenedor({ imageUrl, caption });
    await esperarContenedor(creationId);
    const idMedia = await publicar(creationId);
    return { idMedia, permalink: await permalink(idMedia) };
  }

  return { crearContenedor, esperarContenedor, publicar, permalink, cuota, refrescarToken, imagenPublica, publicarImagen };
}
