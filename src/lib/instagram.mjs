// Cliente mínimo de la Instagram API with Instagram Login (graph.instagram.com).
import { ErrorIncierto } from "./incierto.mjs";
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

  // `sinReintento`: la llamada que publica (media_publish). Un corte de red tras enviarla es ErrorIncierto: la publicación
  // pudo crearse y no se repite a ciegas (diseño §4.2); un error claro de la API se propaga tal cual.
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
        if (sinReintento) throw new ErrorIncierto(`sin respuesta de Instagram tras enviar la petición (${err.message})`, err);
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
    const r = await llamar("POST", `${base}/${usuarioId}/media_publish`, { creation_id: creationId }, { sinReintento: true });
    if (!r.id) throw new Error("La API no devolvió el id del post publicado");
    return r.id;
  }

  // Estado del contenedor (documentado: EXPIRED, ERROR, FINISHED, IN_PROGRESS, PUBLISHED). Si la API ya no lo conoce
  // (caducado hace tiempo, id inválido) se devuelve DESCONOCIDO con el mensaje: no es evidencia de nada.
  async function estadoContenedor(creationId) {
    try {
      const r = await llamar("GET", `${base}/${creationId}`, { fields: "status_code,status" });
      return { estado: String(r.status_code || "DESCONOCIDO"), detalle: String(r.status || "") };
    } catch (err) {
      if (err.status && err.status < 500 && !(err instanceof ErrorLimiteInstagram)) return { estado: "DESCONOCIDO", detalle: err.message };
      throw err;
    }
  }

  // Medio publicado a partir de un contenedor. La API de Instagram Login no expone el id del medio en el contenedor: si no
  // viene, se devuelve null y el destino sigue incierto (nunca se adivina por texto).
  async function medioPorContenedor(creationId) {
    const r = await llamar("GET", `${base}/${creationId}`, { fields: "id,status_code" });
    const idMedia = r.media_id || r.ig_id || null;
    if (!idMedia) return null;
    return { idMedia: String(idMedia), permalink: await permalink(String(idMedia)) };
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
  // Hallazgos reales (2026-09-09): la API rechaza TODA la llamada si una métrica no aplica, con dos formas de mensaje:
  //   "... does not support the metrics: reposts."  y  "... does not support the a, b, c metric for this media product type."
  // Se extraen los nombres citados para reintentar sin ellos (como máximo dos reintentos) y se devuelven en
  // `noSoportadas` para que la recogida no vuelva a pedirlos a ese tipo de publicación.
  function metricasRechazadas(err, metricas) {
    if (Number(err?.codigo) !== 100) return [];
    const texto = String(err?.message || "");
    const m = /does not support the (?:metrics?:\s*)?([A-Za-z0-9_,\s]+?)(?:\s+metrics?\b|\.|$)/i.exec(texto);
    if (!m) return [];
    const citadas = m[1].split(",").map((x) => x.trim()).filter(Boolean);
    return metricas.filter((x) => citadas.includes(x));
  }
  // `maxLlamadas`: presupuesto de esta lectura (llamada inicial incluida). Los reintentos por métricas rechazadas son como
  // máximo dos y solo si caben en el presupuesto; los errores de autenticación (190) y de límite se lanzan sin reintentar.
  async function pedirInsights(metricas, url, params, { maxLlamadas = 3 } = {}) {
    const maxReintentos = Math.max(0, Math.min(2, Math.floor(maxLlamadas) - 1));
    const noSoportadas = [];
    let pendientes = [...metricas];
    for (let intento = 0; intento <= maxReintentos; intento++) {
      try {
        const r = extraerInsights(pendientes, await llamar("GET", url, { ...params, metric: pendientes.join(",") }));
        for (const m of noSoportadas) { r.valores[m] = null; r.faltantes[m] = "metrica-no-soportada"; }
        return { ...r, noSoportadas };
      } catch (err) {
        const rechazadas = metricasRechazadas(err, pendientes);
        const resto = pendientes.filter((m) => !rechazadas.includes(m));
        if (!rechazadas.length || !resto.length || intento === maxReintentos) {
          const r = insightsFallidos(pendientes, err); // lanza si es autenticación o límite
          for (const m of noSoportadas) { r.valores[m] = null; r.faltantes[m] = "metrica-no-soportada"; }
          return { ...r, noSoportadas: [...noSoportadas, ...rechazadas] };
        }
        noSoportadas.push(...rechazadas);
        pendientes = resto;
      }
    }
    return insightsFallidos(metricas, new Error("sin respuesta"));
  }
  const unix = (dia) => String(Math.floor(Date.parse(`${dia}T00:00:00Z`) / 1000));

  // Métricas de cuenta por período (period=day, metric_type=total_value) entre dos fechas (AAAA-MM-DD, UTC).
  async function insightsCuenta({ metricas, desde, hasta, maxLlamadas }) {
    return pedirInsights(metricas, `${base}/${usuarioId}/insights`, { period: "day", metric_type: "total_value", since: unix(desde), until: unix(hasta) }, { maxLlamadas });
  }

  // Totales acumulados de un medio desde su publicación (la API no acepta period aquí).
  async function insightsMedio(idMedia, { metricas, maxLlamadas }) {
    return pedirInsights(metricas, `${base}/${idMedia}/insights`, {}, { maxLlamadas });
  }

  const llamadasHechas = () => llamadas;

  return { crearContenedor, esperarContenedor, publicar, estadoContenedor, medioPorContenedor, permalink, cuota, refrescarToken, imagenPublica, publicarImagen, perfil, vigencia, perfilResumen, listarMedios, insightsCuenta, insightsMedio, llamadasHechas };
}
