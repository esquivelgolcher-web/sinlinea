// Cliente mínimo de la Instagram API with Instagram Login (graph.instagram.com).
const HOST = "https://graph.instagram.com";

// Códigos con los que la API señala un límite de llamadas (documentación de límites de Meta; 80002 = caso de uso de
// Instagram). Ante ellos hay que dejar de llamar: la corrida de métricas se detiene y continúa otro día.
export const CODIGOS_DE_LIMITE = Object.freeze([4, 17, 32, 613, 80002]);
export class ErrorLimiteInstagram extends Error {
  constructor(err) {
    super(err.message);
    this.name = "ErrorLimiteInstagram";
    this.codigo = err.codigo; this.subcodigo = err.subcodigo ?? null; this.tipo = err.tipo ?? null; this.status = err.status;
  }
}
// Motivo (para guardar y mostrar; nunca un 0) con el que una lectura de insights no devolvió una métrica.
export function motivoDeErrorInsights(err) {
  const c = Number(err?.codigo);
  if (CODIGOS_DE_LIMITE.includes(c)) return "limite-llamadas";
  if (c === 10) return "sin-permiso-insights";
  if (c === 100) return "metrica-no-soportada";
  return `error-api:${Number.isFinite(c) ? c : "?"}`;
}

function errorDeApi(json, status) {
  const e = new Error(json?.error?.message || `HTTP ${status}`);
  e.codigo = json?.error?.code ?? status;
  e.subcodigo = json?.error?.error_subcode ?? null; // p. ej. 463 = token caducado, 460 = contraseña cambiada
  e.tipo = json?.error?.type ?? null; // p. ej. OAuthException
  e.status = status;
  return CODIGOS_DE_LIMITE.includes(Number(e.codigo)) ? new ErrorLimiteInstagram(e) : e;
}

export function crearClienteInstagram({
  token, usuarioId, apiVersion, fetchImpl = fetch,
  dormir = (ms) => new Promise((r) => setTimeout(r, ms)), reintentos = 3,
}) {
  const base = `${HOST}/${apiVersion}`;
  let llamadas = 0; // cada petición HTTP cuenta (también los reintentos): es el presupuesto de las métricas

  async function llamar(metodo, url, params = {}) {
    const datos = new URLSearchParams({ ...params, access_token: token });
    let ultimo;
    for (let intento = 0; intento <= reintentos; intento++) {
      llamadas++;
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

  // Identidad del token: usuario y si el id numérico coincide con el configurado.
  async function perfil() {
    const r = await llamar("GET", `${base}/me`, { fields: "user_id,username" });
    // Solo vale `user_id` (id de la cuenta profesional); `id` es un id de app y no sirve. Sin user_id se falla cerrado.
    const userId = r.user_id !== undefined && r.user_id !== null ? String(r.user_id) : "";
    return { username: String(r.username || ""), userId, coincideId: usuarioId ? (userId !== "" && userId === String(usuarioId)) : undefined };
  }

  // Caducidad real del token. graph.instagram.com no documenta debug_token para Instagram Login:
  // se intenta y, si no responde con expires_at, la caducidad queda "desconocida" (nunca se asume +60 días).
  async function vigencia() {
    try {
      const r = await llamar("GET", `${HOST}/debug_token`, { input_token: token });
      const expiresAt = Number(r?.data?.expires_at);
      if (!Number.isFinite(expiresAt)) return { vence: null, origen: "desconocida" };
      if (expiresAt === 0) return { vence: null, origen: "sin-caducidad" };
      return { vence: new Date(expiresAt * 1000).toISOString().slice(0, 10), origen: "debug_token" };
    } catch {
      return { vence: null, origen: "desconocida" };
    }
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

  // --- Métricas (fase 1): lecturas de solo consulta. Nunca escriben en Instagram. ---
  const numeroONulo = (v) => (typeof v === "number" && Number.isFinite(v) ? v : (v === undefined || v === null || v === "" ? null : (Number.isFinite(Number(v)) ? Number(v) : null)));
  const fechaIso = (t) => { const ms = Date.parse(String(t || "")); return Number.isFinite(ms) ? new Date(ms).toISOString() : null; };

  // Totales del perfil en el momento de la consulta (permiso básico). Un campo ausente es null, no 0.
  async function perfilResumen() {
    const r = await llamar("GET", `${base}/me`, { fields: "followers_count,follows_count,media_count" });
    return { seguidores: numeroONulo(r.followers_count), seguidos: numeroONulo(r.follows_count), publicaciones: numeroONulo(r.media_count) };
  }

  // Una página de medios de la cuenta (todos: publicados por la API o desde la app). `despues` = cursor de la página anterior.
  async function listarMedios({ limite = 50, despues = null } = {}) {
    const params = { fields: "id,media_type,timestamp,permalink,caption,like_count,comments_count,is_shared_to_feed", limit: String(limite) };
    if (despues) params.after = despues;
    const r = await llamar("GET", `${base}/${usuarioId}/media`, params);
    const medios = (r.data || []).map((m) => ({
      id: String(m.id), tipo: m.media_type || null, fecha: fechaIso(m.timestamp), permalink: m.permalink || "", caption: typeof m.caption === "string" ? m.caption : "",
      meGusta: numeroONulo(m.like_count), comentarios: numeroONulo(m.comments_count), compartidoEnFeed: typeof m.is_shared_to_feed === "boolean" ? m.is_shared_to_feed : null,
    }));
    return { medios, siguiente: r.paging?.cursors?.after && r.paging?.next ? String(r.paging.cursors.after) : null };
  }

  // Valores de una respuesta de insights: total_value.value (metric_type=total_value) o values[0].value (acumulados de
  // un medio). Una métrica sin valor queda null con motivo "conjunto-vacio": la API devuelve vacío, no 0, cuando no hay dato.
  function extraerInsights(metricas, r) {
    const valores = {}; const faltantes = {};
    const porNombre = new Map((r.data || []).map((d) => [d.name, d]));
    for (const m of metricas) {
      const d = porNombre.get(m);
      const v = d ? numeroONulo(d.total_value?.value ?? d.values?.[0]?.value) : null;
      valores[m] = v;
      if (v === null) faltantes[m] = "conjunto-vacio";
    }
    return { valores, faltantes, error: null };
  }
  function insightsFallidos(metricas, err) {
    if (err instanceof ErrorLimiteInstagram || Number(err?.codigo) === 190 || !err?.codigo) throw err;
    const motivo = motivoDeErrorInsights(err);
    const valores = {}; const faltantes = {};
    for (const m of metricas) { valores[m] = null; faltantes[m] = motivo; }
    return { valores, faltantes, error: { codigo: err.codigo, subcodigo: err.subcodigo ?? null, mensaje: err.message } };
  }
  // Hallazgo real (2026-09-09): la API rechaza TODA la llamada si una métrica no aplica ("... does not support the
  // metrics: reposts."). Se extraen los nombres que cita para reintentar una sola vez sin ellos.
  function metricasRechazadas(err, metricas) {
    const m = /does not support the metrics?:\s*([A-Za-z0-9_,\s]+)/i.exec(String(err?.message || ""));
    if (Number(err?.codigo) !== 100 || !m) return [];
    const citadas = m[1].split(",").map((x) => x.trim().replace(/\.$/, "")).filter(Boolean);
    return metricas.filter((x) => citadas.includes(x));
  }
  async function pedirInsights(metricas, url, params) {
    try {
      return extraerInsights(metricas, await llamar("GET", url, { ...params, metric: metricas.join(",") }));
    } catch (err) {
      const rechazadas = metricasRechazadas(err, metricas);
      const resto = metricas.filter((m) => !rechazadas.includes(m));
      if (!rechazadas.length || !resto.length) return insightsFallidos(metricas, err);
      let r;
      try { r = extraerInsights(resto, await llamar("GET", url, { ...params, metric: resto.join(",") })); }
      catch (err2) { r = insightsFallidos(resto, err2); }
      for (const m of rechazadas) { r.valores[m] = null; r.faltantes[m] = "metrica-no-soportada"; }
      return r;
    }
  }
  const unix = (dia) => String(Math.floor(Date.parse(`${dia}T00:00:00Z`) / 1000));

  // Métricas de cuenta por período (period=day, metric_type=total_value) entre dos fechas (AAAA-MM-DD, UTC).
  async function insightsCuenta({ metricas, desde, hasta }) {
    return pedirInsights(metricas, `${base}/${usuarioId}/insights`, { period: "day", metric_type: "total_value", since: unix(desde), until: unix(hasta) });
  }

  // Totales acumulados de un medio desde su publicación (la API no acepta period aquí).
  async function insightsMedio(idMedia, { metricas }) {
    return pedirInsights(metricas, `${base}/${idMedia}/insights`, {});
  }

  const llamadasHechas = () => llamadas;

  return { crearContenedor, esperarContenedor, publicar, permalink, cuota, refrescarToken, imagenPublica, publicarImagen, perfil, vigencia, perfilResumen, listarMedios, insightsCuenta, insightsMedio, llamadasHechas };
}
