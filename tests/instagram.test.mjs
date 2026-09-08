import { test } from "node:test";
import assert from "node:assert/strict";
import { crearClienteInstagram } from "../src/lib/instagram.mjs";

function fetchFalso(respuestas) {
  const llamadas = [];
  const impl = async (url, opciones = {}) => {
    llamadas.push({ url: String(url), metodo: opciones.method || "GET", body: opciones.body ? String(opciones.body) : "" });
    const r = respuestas.shift();
    if (!r) throw new Error(`respuesta no prevista para ${url}`);
    if (r.error) throw r.error;
    return new Response(JSON.stringify(r.json ?? {}), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  };
  return { impl, llamadas };
}

const opciones = { token: "TOKEN", usuarioId: "1789", apiVersion: "v23.0", dormir: async () => {} };

test("publicarImagen encadena contenedor, espera, publicación y permalink", async () => {
  const { impl, llamadas } = fetchFalso([
    { json: { id: "c1" } },
    { json: { status_code: "IN_PROGRESS" } },
    { json: { status_code: "FINISHED" } },
    { json: { id: "m1" } },
    { json: { permalink: "https://www.instagram.com/p/abc/" } },
  ]);
  const ig = crearClienteInstagram({ ...opciones, fetchImpl: impl });
  const r = await ig.publicarImagen({ imageUrl: "https://x/img/a.jpg", caption: "Hola" });
  assert.deepEqual(r, { idMedia: "m1", permalink: "https://www.instagram.com/p/abc/" });
  assert.equal(llamadas[0].url, "https://graph.instagram.com/v23.0/1789/media");
  assert.equal(llamadas[0].metodo, "POST");
  assert.match(llamadas[0].body, /image_url=https%3A%2F%2Fx%2Fimg%2Fa\.jpg/);
  assert.match(llamadas[0].body, /caption=Hola/);
  assert.match(llamadas[1].url, /\/v23\.0\/c1\?fields=status_code/);
  assert.equal(llamadas[3].url, "https://graph.instagram.com/v23.0/1789/media_publish");
  assert.match(llamadas[3].body, /creation_id=c1/);
  assert.ok(llamadas.every((l) => !l.url.includes("TOKEN") || l.url.includes("access_token=TOKEN")));
});

test("esperarContenedor lanza en ERROR y al agotar intentos", async () => {
  const a = fetchFalso([{ json: { status_code: "ERROR", status: "Media ID is not available" } }]);
  const ig = crearClienteInstagram({ ...opciones, fetchImpl: a.impl });
  await assert.rejects(() => ig.esperarContenedor("c1"), /ERROR/);
  const b = fetchFalso([{ json: { status_code: "IN_PROGRESS" } }, { json: { status_code: "IN_PROGRESS" } }]);
  const ig2 = crearClienteInstagram({ ...opciones, fetchImpl: b.impl });
  await assert.rejects(() => ig2.esperarContenedor("c1", { intentos: 2 }), /no terminó/);
});

test("un 4xx lanza el mensaje de la API sin reintentar; un 5xx se reintenta", async () => {
  const a = fetchFalso([{ status: 400, json: { error: { message: "Invalid parameter", code: 100 } } }]);
  const ig = crearClienteInstagram({ ...opciones, fetchImpl: a.impl });
  await assert.rejects(() => ig.crearContenedor({ imageUrl: "u", caption: "c" }), (e) => e.message === "Invalid parameter" && e.codigo === 100);
  assert.equal(a.llamadas.length, 1);
  const b = fetchFalso([{ status: 503, json: {} }, { error: new Error("red") }, { json: { id: "c9" } }]);
  const ig2 = crearClienteInstagram({ ...opciones, fetchImpl: b.impl });
  assert.equal(await ig2.crearContenedor({ imageUrl: "u", caption: "c" }), "c9");
  assert.equal(b.llamadas.length, 3);
});

test("cuota, refrescarToken e imagenPublica", async () => {
  const { impl, llamadas } = fetchFalso([
    { json: { data: [{ quota_usage: 3, config: { quota_total: 100 } }] } },
    { json: { access_token: "NUEVO", token_type: "bearer", expires_in: 5184000 } },
    { status: 200, json: {} },
    { status: 404, json: {} },
  ]);
  const ig = crearClienteInstagram({ ...opciones, fetchImpl: impl });
  assert.deepEqual(await ig.cuota(), { usados: 3, limite: 100 });
  assert.match(llamadas[0].url, /content_publishing_limit\?fields=quota_usage%2Cconfig/);
  assert.deepEqual(await ig.refrescarToken(), { token: "NUEVO", expiraEnSegundos: 5184000 });
  assert.match(llamadas[1].url, /^https:\/\/graph\.instagram\.com\/refresh_access_token\?grant_type=ig_refresh_token&access_token=TOKEN$/);
  assert.equal(await ig.imagenPublica("https://x/img/a.jpg"), true);
  assert.equal(llamadas[2].metodo, "HEAD");
  assert.equal(await ig.imagenPublica("https://x/img/b.jpg"), false);
});

test("(M2) perfil() consulta /me con user_id y username y devuelve ambos", async () => {
  const llamadas = [];
  const fetchImpl = async (url) => { llamadas.push(url); return { ok: true, status: 200, json: async () => ({ user_id: "1784", username: "sinlinea.pa" }) }; };
  const ig = crearClienteInstagram({ token: "T", usuarioId: "1784", apiVersion: "v23.0", fetchImpl, dormir: async () => {} });
  const p = await ig.perfil();
  assert.deepEqual(p, { username: "sinlinea.pa", userId: "1784", coincideId: true });
  assert.match(llamadas[0], /\/v23\.0\/me\?/);
  assert.match(llamadas[0], /fields=user_id%2Cusername/);
});
