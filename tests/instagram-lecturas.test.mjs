// Métricas fase 1: lecturas de solo consulta del cliente de Instagram (perfil, lista de medios, insights de cuenta y de
// medio). Traducen los errores de la API a motivos (nunca a ceros) y cuentan las llamadas para el presupuesto.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearClienteInstagram, ErrorLimiteInstagram, motivoDeErrorInsights } from "../src/lib/instagram.mjs";

function fetchFalso(respuestas) {
  const llamadas = [];
  const impl = async (url, opciones = {}) => {
    llamadas.push({ url: String(url), metodo: opciones.method || "GET" });
    const r = typeof respuestas === "function" ? respuestas(String(url)) : respuestas.shift();
    if (!r) throw new Error(`respuesta no prevista para ${url}`);
    return new Response(JSON.stringify(r.json ?? {}), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  };
  return { impl, llamadas };
}
const opciones = { token: "TOKEN", usuarioId: "1789", apiVersion: "v23.0", dormir: async () => {} };
const errorApi = (code, message, extra = {}) => ({ status: 400, json: { error: { message, code, type: "OAuthException", ...extra } } });

test("(métricas) perfilResumen lee seguidores, seguidos y publicaciones de /me; un campo ausente es null, no 0", async () => {
  const f = fetchFalso([{ json: { followers_count: 128, media_count: 14 } }]);
  const ig = crearClienteInstagram({ ...opciones, fetchImpl: f.impl });
  assert.deepEqual(await ig.perfilResumen(), { seguidores: 128, seguidos: null, publicaciones: 14 });
  assert.match(f.llamadas[0].url, /\/v23\.0\/me\?/);
  assert.match(f.llamadas[0].url, /fields=followers_count%2Cfollows_count%2Cmedia_count/);
  assert.equal(ig.llamadasHechas(), 1);
});

test("(métricas) listarMedios pide una página con los campos básicos y devuelve el cursor siguiente; like_count oculto → null", async () => {
  const f = fetchFalso([{ json: {
    data: [
      { id: "18001", media_type: "IMAGE", timestamp: "2026-09-08T08:07:03+0000", permalink: "https://www.instagram.com/p/AAA/", caption: "Hola", like_count: 12, comments_count: 1 },
      { id: "18002", media_type: "VIDEO", timestamp: "2026-09-07T12:00:00+0000", permalink: "https://www.instagram.com/reel/BBB/", comments_count: 0, is_shared_to_feed: true },
    ],
    paging: { cursors: { after: "CURSOR2" }, next: "https://graph.instagram.com/v23.0/1789/media?after=CURSOR2" },
  } }]);
  const ig = crearClienteInstagram({ ...opciones, fetchImpl: f.impl });
  const r = await ig.listarMedios({ limite: 50 });
  assert.match(f.llamadas[0].url, /\/v23\.0\/1789\/media\?/);
  assert.match(f.llamadas[0].url, /limit=50/);
  assert.match(f.llamadas[0].url, /fields=id%2Cmedia_type%2Ctimestamp%2Cpermalink%2Ccaption%2Clike_count%2Ccomments_count%2Cis_shared_to_feed/);
  assert.equal(r.siguiente, "CURSOR2");
  assert.deepEqual(r.medios[0], { id: "18001", tipo: "IMAGE", fecha: "2026-09-08T08:07:03.000Z", permalink: "https://www.instagram.com/p/AAA/", caption: "Hola", meGusta: 12, comentarios: 1, compartidoEnFeed: null });
  assert.deepEqual(r.medios[1], { id: "18002", tipo: "VIDEO", fecha: "2026-09-07T12:00:00.000Z", permalink: "https://www.instagram.com/reel/BBB/", caption: "", meGusta: null, comentarios: 0, compartidoEnFeed: true });
  const g = fetchFalso([{ json: { data: [] } }]);
  const ig2 = crearClienteInstagram({ ...opciones, fetchImpl: g.impl });
  const r2 = await ig2.listarMedios({ limite: 25, despues: "CURSOR2" });
  assert.match(g.llamadas[0].url, /after=CURSOR2/);
  assert.deepEqual(r2, { medios: [], siguiente: null });
});

test("(métricas) insightsCuenta pide period=day y metric_type=total_value con since/until; conjunto vacío → null con motivo conjunto-vacio", async () => {
  const f = fetchFalso([{ json: { data: [
    { name: "reach", period: "day", total_value: { value: 950 } },
    { name: "views", period: "day", total_value: { value: 1800 } },
    { name: "replies", period: "day", values: [] },
  ] } }]);
  const ig = crearClienteInstagram({ ...opciones, fetchImpl: f.impl });
  const r = await ig.insightsCuenta({ metricas: ["reach", "views", "replies", "saves"], desde: "2026-09-09", hasta: "2026-09-10" });
  const u = f.llamadas[0].url;
  assert.match(u, /\/v23\.0\/1789\/insights\?/);
  assert.match(u, /metric=reach%2Cviews%2Creplies%2Csaves/);
  assert.match(u, /period=day/);
  assert.match(u, /metric_type=total_value/);
  assert.match(u, new RegExp(`since=${Math.floor(Date.parse("2026-09-09T00:00:00Z") / 1000)}`));
  assert.match(u, new RegExp(`until=${Math.floor(Date.parse("2026-09-10T00:00:00Z") / 1000)}`));
  assert.deepEqual(r.valores, { reach: 950, views: 1800, replies: null, saves: null });
  assert.deepEqual(r.faltantes, { replies: "conjunto-vacio", saves: "conjunto-vacio" });
  assert.equal(r.error, null);
});

test("(métricas) sin permiso de estadísticas (código 10) o métrica no soportada (código 100) no se lanza: todas las métricas pedidas quedan con su motivo", async () => {
  const sinPermiso = fetchFalso([errorApi(10, "(#10) Application does not have permission for this action")]);
  const ig = crearClienteInstagram({ ...opciones, fetchImpl: sinPermiso.impl });
  const r = await ig.insightsCuenta({ metricas: ["reach", "views"], desde: "2026-09-09", hasta: "2026-09-10" });
  assert.deepEqual(r.valores, { reach: null, views: null });
  assert.deepEqual(r.faltantes, { reach: "sin-permiso-insights", views: "sin-permiso-insights" });
  assert.equal(r.error.codigo, 10);
  const noSoportada = fetchFalso([errorApi(100, "(#100) metric[0] must be one of the following values: reach, views")]);
  const ig2 = crearClienteInstagram({ ...opciones, fetchImpl: noSoportada.impl });
  const r2 = await ig2.insightsMedio("18001", { metricas: ["profile_visits"] });
  assert.deepEqual(r2.valores, { profile_visits: null });
  assert.deepEqual(r2.faltantes, { profile_visits: "metrica-no-soportada" });
  assert.equal(sinPermiso.llamadas.length, 1, "no se reintenta un 4xx");
});

test("(métricas) insightsMedio lee totales acumulados (values[0].value o total_value) y no manda period", async () => {
  const f = fetchFalso([{ json: { data: [
    { name: "reach", period: "lifetime", values: [{ value: 400 }] },
    { name: "likes", period: "lifetime", total_value: { value: 12 } },
    { name: "saved", period: "lifetime", values: [{ value: 0 }] },
  ] } }]);
  const ig = crearClienteInstagram({ ...opciones, fetchImpl: f.impl });
  const r = await ig.insightsMedio("18001", { metricas: ["reach", "likes", "saved"] });
  assert.match(f.llamadas[0].url, /\/v23\.0\/18001\/insights\?/);
  assert.match(f.llamadas[0].url, /metric=reach%2Clikes%2Csaved/);
  assert.doesNotMatch(f.llamadas[0].url, /period=/);
  assert.deepEqual(r.valores, { reach: 400, likes: 12, saved: 0 }, "un 0 real de la API sí se conserva");
  assert.deepEqual(r.faltantes, {});
});

test("(métricas) un error de límite de la API (4, 17, 32, 613, 80002) se lanza como ErrorLimiteInstagram para detener la corrida; un 190 se lanza tal cual", async () => {
  const f = fetchFalso([errorApi(80002, "(#80002) There have been too many calls to this Instagram account.", { error_subcode: 2446079 })]);
  const ig = crearClienteInstagram({ ...opciones, fetchImpl: f.impl });
  await assert.rejects(() => ig.insightsCuenta({ metricas: ["reach"], desde: "2026-09-09", hasta: "2026-09-10" }), (e) => e instanceof ErrorLimiteInstagram && e.codigo === 80002);
  for (const c of [4, 17, 32, 613]) assert.equal(motivoDeErrorInsights({ codigo: c }), "limite-llamadas", String(c));
  assert.equal(motivoDeErrorInsights({ codigo: 10 }), "sin-permiso-insights");
  assert.equal(motivoDeErrorInsights({ codigo: 100 }), "metrica-no-soportada");
  assert.equal(motivoDeErrorInsights({ codigo: 2 }), "error-api:2");
  const g = fetchFalso([errorApi(190, "Invalid OAuth access token.", { error_subcode: 463 })]);
  const ig2 = crearClienteInstagram({ ...opciones, fetchImpl: g.impl });
  await assert.rejects(() => ig2.perfilResumen(), (e) => e.codigo === 190 && !(e instanceof ErrorLimiteInstagram));
});

test("(métricas · hallazgo real) si la API rechaza la llamada nombrando métricas no soportadas (código 100 'does not support the metrics: a, b'), se reintenta UNA vez sin ellas y solo esas quedan como no soportadas", async () => {
  const f = fetchFalso([
    errorApi(100, "Instagram Insights Media API endpoint does not support the metrics: reposts, profile_activity. Please refer to https://developers.facebook.com/docs/instagram/reference/media#insights for more details."),
    { json: { data: [{ name: "reach", period: "lifetime", values: [{ value: 400 }] }, { name: "likes", period: "lifetime", values: [{ value: 110 }] }] } },
  ]);
  const ig = crearClienteInstagram({ ...opciones, fetchImpl: f.impl });
  const r = await ig.insightsMedio("18001", { metricas: ["reach", "likes", "reposts", "profile_activity"] });
  assert.equal(f.llamadas.length, 2, "una llamada más, no una por métrica");
  assert.match(f.llamadas[1].url, /metric=reach%2Clikes(&|$)/, "el reintento excluye exactamente las métricas nombradas");
  assert.deepEqual(r.valores, { reach: 400, likes: 110, reposts: null, profile_activity: null });
  assert.deepEqual(r.faltantes, { reposts: "metrica-no-soportada", profile_activity: "metrica-no-soportada" });
  assert.equal(r.error, null);
  assert.equal(ig.llamadasHechas(), 2);
  // Si la API vuelve a rechazar el reintento, no se insiste: todo lo pedido queda como no soportado.
  const g = fetchFalso([
    errorApi(100, "Instagram Insights Media API endpoint does not support the metrics: reposts."),
    errorApi(100, "(#100) Invalid parameter"),
  ]);
  const ig2 = crearClienteInstagram({ ...opciones, fetchImpl: g.impl });
  const r2 = await ig2.insightsMedio("18001", { metricas: ["reach", "reposts"] });
  assert.equal(g.llamadas.length, 2);
  assert.deepEqual(r2.faltantes, { reach: "metrica-no-soportada", reposts: "metrica-no-soportada" });
  assert.equal(r2.error.codigo, 100);
  // Si todas las métricas pedidas son las rechazadas, no hay reintento.
  const h = fetchFalso([errorApi(100, "Instagram Insights Media API endpoint does not support the metrics: reposts.")]);
  const ig3 = crearClienteInstagram({ ...opciones, fetchImpl: h.impl });
  const r3 = await ig3.insightsMedio("18001", { metricas: ["reposts"] });
  assert.equal(h.llamadas.length, 1);
  assert.deepEqual(r3.faltantes, { reposts: "metrica-no-soportada" });
});

test("(métricas · hallazgo real 2) la API también rechaza con 'does not support the a, b metric for this media product type': se reconoce esa forma y se admite un segundo reintento (máximo dos)", async () => {
  const f = fetchFalso([
    errorApi(100, "Instagram Insights Media API endpoint does not support the metrics: reposts. Please refer to https://developers.facebook.com/docs/instagram/reference/media#insights for more details."),
    errorApi(100, "The Media Insights API does not support the profile_visits, profile_activity, follows metric for this media product type."),
    { json: { data: [{ name: "reach", period: "lifetime", values: [{ value: 400 }] }, { name: "views", period: "lifetime", values: [{ value: 900 }] }] } },
  ]);
  const ig = crearClienteInstagram({ ...opciones, fetchImpl: f.impl });
  const r = await ig.insightsMedio("18001", { metricas: ["reach", "views", "reposts", "profile_visits", "profile_activity", "follows"] });
  assert.equal(f.llamadas.length, 3);
  assert.match(f.llamadas[2].url, /metric=reach%2Cviews(&|$)/);
  assert.deepEqual(r.valores, { reach: 400, views: 900, reposts: null, profile_visits: null, profile_activity: null, follows: null });
  assert.deepEqual(r.faltantes, { reposts: "metrica-no-soportada", profile_visits: "metrica-no-soportada", profile_activity: "metrica-no-soportada", follows: "metrica-no-soportada" });
  assert.deepEqual(r.noSoportadas, ["reposts", "profile_visits", "profile_activity", "follows"], "las rechazadas se devuelven para no volver a pedirlas");
  // Un tercer rechazo ya no se reintenta.
  const g = fetchFalso([
    errorApi(100, "does not support the metrics: a."),
    errorApi(100, "does not support the b metric for this media product type."),
    errorApi(100, "does not support the c metric for this media product type."),
  ]);
  const ig2 = crearClienteInstagram({ ...opciones, fetchImpl: g.impl });
  const r2 = await ig2.insightsMedio("18001", { metricas: ["a", "b", "c", "d"] });
  assert.equal(g.llamadas.length, 3);
  assert.deepEqual(r2.faltantes, { a: "metrica-no-soportada", b: "metrica-no-soportada", c: "metrica-no-soportada", d: "metrica-no-soportada" });
});

test("(métricas · presupuesto) los reintentos por métricas rechazadas cuentan dentro del presupuesto (maxLlamadas) y nunca se aplican a errores de autenticación ni de límite", async () => {
  const rechazo = errorApi(100, "Instagram Insights Media API endpoint does not support the metrics: reposts.");
  const ok = { json: { data: [{ name: "reach", period: "lifetime", values: [{ value: 400 }] }] } };
  // Presupuesto 1: no cabe ningún reintento → todo lo pedido queda no soportado y solo hay una llamada.
  const a = fetchFalso([rechazo, ok]);
  const ig1 = crearClienteInstagram({ ...opciones, fetchImpl: a.impl });
  const r1 = await ig1.insightsMedio("18001", { metricas: ["reach", "reposts"], maxLlamadas: 1 });
  assert.equal(a.llamadas.length, 1);
  assert.deepEqual(r1.faltantes, { reach: "metrica-no-soportada", reposts: "metrica-no-soportada" });
  assert.deepEqual(r1.noSoportadas, ["reposts"], "lo citado por la API se recuerda aunque no haya reintento");
  // Presupuesto 2: cabe exactamente un reintento.
  const b = fetchFalso([rechazo, ok]);
  const ig2 = crearClienteInstagram({ ...opciones, fetchImpl: b.impl });
  const r2 = await ig2.insightsMedio("18001", { metricas: ["reach", "reposts"], maxLlamadas: 2 });
  assert.equal(b.llamadas.length, 2);
  assert.deepEqual(r2.valores, { reach: 400, reposts: null });
  assert.equal(ig2.llamadasHechas(), 2);
  // Un 190 (autenticación) en el reintento se lanza tal cual, sin más intentos; un límite también.
  const c = fetchFalso([rechazo, errorApi(190, "Invalid OAuth access token.", { error_subcode: 463 }), ok]);
  const ig3 = crearClienteInstagram({ ...opciones, fetchImpl: c.impl });
  await assert.rejects(() => ig3.insightsMedio("18001", { metricas: ["reach", "reposts"] }), (e) => e.codigo === 190);
  assert.equal(c.llamadas.length, 2);
  const d = fetchFalso([rechazo, errorApi(80002, "(#80002) There have been too many calls to this Instagram account."), ok]);
  const ig4 = crearClienteInstagram({ ...opciones, fetchImpl: d.impl });
  await assert.rejects(() => ig4.insightsCuenta({ metricas: ["reach", "reposts"], desde: "2026-09-09", hasta: "2026-09-10" }), (e) => e instanceof ErrorLimiteInstagram);
  assert.equal(d.llamadas.length, 2);
});
