import { test } from "node:test";
import assert from "node:assert/strict";
import { crearClienteThreads } from "../src/lib/threads.mjs";
import { ErrorIncierto } from "../src/lib/incierto.mjs";

// graph.threads.net simulado: registra las llamadas y responde según "MÉTODO /ruta".
function graphFalso(respuestas = {}) {
  const llamadas = [];
  const impl = async (url, opciones = {}) => {
    const u = new URL(url);
    const cuerpo = opciones.body ? Object.fromEntries(new URLSearchParams(opciones.body)) : {};
    const clave = `${opciones.method || "GET"} ${u.pathname}`;
    llamadas.push({ clave, host: u.host, query: Object.fromEntries(u.searchParams), cuerpo });
    const r = respuestas[clave];
    if (typeof r === "function") return r({ query: Object.fromEntries(u.searchParams), cuerpo });
    if (r === undefined) return { ok: false, status: 404, json: async () => ({ error: { message: `sin respuesta simulada para ${clave}`, code: 803 } }) };
    return { ok: true, status: 200, json: async () => r };
  };
  return { impl, llamadas };
}
const cliente = (g, extra = {}) => crearClienteThreads({ token: "THtoken", usuarioId: "17841400", apiVersion: "v1.0", fetchImpl: g.impl, dormir: async () => {}, ...extra });

test("(threads) perfil: GET /me con id y username en graph.threads.net; dice si el id coincide con el configurado", async () => {
  const g = graphFalso({ "GET /v1.0/me": { id: "17841400", username: "luiseskivelgolcher" } });
  const p = await cliente(g).perfil();
  assert.deepEqual(p, { id: "17841400", username: "luiseskivelgolcher", coincideId: true });
  assert.equal(g.llamadas[0].host, "graph.threads.net");
  assert.equal(g.llamadas[0].query.fields, "id,username");
  assert.equal(g.llamadas[0].query.access_token, "THtoken");
  assert.equal((await cliente(graphFalso({ "GET /v1.0/me": { id: "999", username: "otro" } })).perfil()).coincideId, false);
});

test("(threads) contenedor de imagen (media_type IMAGE, image_url, text), espera hasta FINISHED y publicación con creation_id; permalink del medio", async () => {
  let consultas = 0;
  const g = graphFalso({
    "POST /v1.0/17841400/threads": { id: "c1" },
    "GET /v1.0/c1": () => { consultas++; return { ok: true, status: 200, json: async () => ({ id: "c1", status: consultas < 2 ? "IN_PROGRESS" : "FINISHED" }) }; },
    "POST /v1.0/17841400/threads_publish": { id: "m1" },
    "GET /v1.0/m1": { id: "m1", permalink: "https://www.threads.net/@luiseskivelgolcher/post/abc" },
  });
  const c = cliente(g);
  const id = await c.crearContenedor({ imageUrl: "https://u.github.io/sinlinea/img/x.jpg", texto: "Hola\n\nFuente: X" });
  assert.equal(id, "c1");
  const creacion = g.llamadas.find((l) => l.clave === "POST /v1.0/17841400/threads");
  assert.deepEqual(creacion.cuerpo, { media_type: "IMAGE", image_url: "https://u.github.io/sinlinea/img/x.jpg", text: "Hola\n\nFuente: X", access_token: "THtoken" });
  await c.esperarContenedor("c1");
  assert.equal(consultas, 2);
  assert.equal(g.llamadas.find((l) => l.clave === "GET /v1.0/c1").query.fields, "status,error_message");
  const r = await c.publicarContenedor("c1");
  assert.deepEqual(r, { idMedia: "m1", permalink: "https://www.threads.net/@luiseskivelgolcher/post/abc" });
  assert.equal(g.llamadas.find((l) => l.clave === "POST /v1.0/17841400/threads_publish").cuerpo.creation_id, "c1");
});

test("(threads) un corte de red al publicar es ErrorIncierto sin reintento; un contenedor en ERROR lanza con el mensaje; 5xx al crear reintenta", async () => {
  let intentos = 0;
  const g = graphFalso({ "POST /v1.0/17841400/threads_publish": () => { intentos++; throw new TypeError("fetch failed"); } });
  await assert.rejects(cliente(g).publicarContenedor("c1"), (err) => err instanceof ErrorIncierto);
  assert.equal(intentos, 1);
  const g2 = graphFalso({ "GET /v1.0/c1": { id: "c1", status: "ERROR", error_message: "INVALID_ASPEC_RATIO" } });
  await assert.rejects(cliente(g2).esperarContenedor("c1"), /ERROR.*INVALID_ASPEC_RATIO/);
  let veces = 0;
  const g3 = graphFalso({ "POST /v1.0/17841400/threads": () => (++veces < 2 ? { ok: false, status: 503, json: async () => ({}) } : { ok: true, status: 200, json: async () => ({ id: "c2" }) }) });
  assert.equal(await cliente(g3).crearContenedor({ imageUrl: "https://u/x.jpg", texto: "x" }), "c2");
  assert.equal(veces, 2);
});

test("(threads) evidencia para reconciliar: estadoContenedor y medioPorContenedor (el contenedor publicado se lee como medio con permalink)", async () => {
  const g = graphFalso({ "GET /v1.0/c1": ({ query }) => ({ ok: true, status: 200, json: async () => (query.fields === "status,error_message" ? { id: "c1", status: "PUBLISHED" } : { id: "c1", permalink: "https://www.threads.net/@luis/post/abc" }) }) });
  const c = cliente(g);
  assert.deepEqual(await c.estadoContenedor("c1"), { estado: "PUBLISHED", detalle: "" });
  assert.deepEqual(await c.medioPorContenedor("c1"), { idMedia: "c1", permalink: "https://www.threads.net/@luis/post/abc" });
  const sin = graphFalso({ "GET /v1.0/c1": ({ query }) => ({ ok: true, status: 200, json: async () => (query.fields === "status,error_message" ? { id: "c1", status: "PUBLISHED" } : { id: "c1" }) }) });
  assert.equal(await cliente(sin).medioPorContenedor("c1"), null, "sin permalink no se afirma nada");
  const caducado = graphFalso({ "GET /v1.0/c1": () => ({ ok: false, status: 400, json: async () => ({ error: { message: "Unsupported get request", code: 100 } }) }) });
  assert.deepEqual(await cliente(caducado).estadoContenedor("c1"), { estado: "DESCONOCIDO", detalle: "Unsupported get request" });
});

test("(threads) cuota de publicación (threads_publishing_limit), renovación (th_refresh_token) e intercambio (th_exchange_token con client_secret)", async () => {
  const g = graphFalso({
    "GET /v1.0/17841400/threads_publishing_limit": { data: [{ quota_usage: 3, config: { quota_total: 250, quota_duration: 86400 } }] },
    "GET /refresh_access_token": ({ query }) => ({ ok: true, status: 200, json: async () => (query.grant_type === "th_refresh_token" && query.access_token === "THtoken" ? { access_token: "THnuevo", token_type: "bearer", expires_in: 5184000 } : { error: { message: "grant inválido" } }) }),
    "GET /access_token": ({ query }) => ({ ok: true, status: 200, json: async () => (query.grant_type === "th_exchange_token" && query.client_secret === "sec" ? { access_token: "THlargo", token_type: "bearer", expires_in: 5184000 } : { error: { message: "grant inválido" } }) }),
  });
  const c = cliente(g);
  assert.deepEqual(await c.cuota(), { usados: 3, limite: 250 });
  assert.deepEqual(await c.refrescarToken(), { token: "THnuevo", expiraEnSegundos: 5184000 });
  assert.deepEqual(await c.intercambiarToken({ clientSecret: "sec" }), { token: "THlargo", expiraEnSegundos: 5184000 });
  const limite = graphFalso({ "GET /v1.0/me": () => ({ ok: false, status: 400, json: async () => ({ error: { message: "limit", code: 4 } }) }) });
  await assert.rejects(cliente(limite).perfil(), (err) => err.limite === true);
});
