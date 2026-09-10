import { test } from "node:test";
import assert from "node:assert/strict";
import { crearClienteInstagram } from "../src/lib/instagram.mjs";
import { crearClienteThreads } from "../src/lib/threads.mjs";
import { crearClienteFacebook } from "../src/lib/facebook.mjs";
import { ErrorIncierto } from "../src/lib/incierto.mjs";

// Graph API simulada: registra las llamadas y responde según "MÉTODO /ruta".
function graphFalso(respuestas = {}) {
  const llamadas = [];
  const impl = async (url, opciones = {}) => {
    const u = new URL(url);
    const cuerpo = opciones.body ? Object.fromEntries(new URLSearchParams(opciones.body)) : {};
    const clave = `${opciones.method || "GET"} ${u.pathname}`;
    llamadas.push({ clave, query: Object.fromEntries(u.searchParams), cuerpo });
    const r = respuestas[clave];
    if (typeof r === "function") return r({ query: Object.fromEntries(u.searchParams), cuerpo, n: llamadas.filter((l) => l.clave === clave).length });
    if (r === undefined) return { ok: false, status: 404, json: async () => ({ error: { message: `sin respuesta simulada para ${clave}`, code: 803 } }) };
    return { ok: true, status: 200, json: async () => r };
  };
  return { impl, llamadas };
}
const urls = ["https://u/img/x-01.jpg", "https://u/img/x-02.jpg", "https://u/img/x-03.jpg"];

test("(carrusel · Instagram) hijos con is_carousel_item, contenedor CAROUSEL con children en orden y caption; se publica con el id del carrusel", async () => {
  let hijos = 0;
  const g = graphFalso({
    "POST /v23.0/1784/media": ({ cuerpo }) => ({ ok: true, status: 200, json: async () => ({ id: cuerpo.media_type === "CAROUSEL" ? "padre" : `h${++hijos}` }) }),
    "POST /v23.0/1784/media_publish": { id: "m1" },
    "GET /v23.0/m1": { permalink: "https://www.instagram.com/p/m1/" },
  });
  const ig = crearClienteInstagram({ token: "t", usuarioId: "1784", apiVersion: "v23.0", fetchImpl: g.impl, dormir: async () => {} });
  const ids = [];
  for (const u of urls) ids.push(await ig.crearContenedorHijo({ imageUrl: u }));
  assert.deepEqual(ids, ["h1", "h2", "h3"]);
  const creaciones = g.llamadas.filter((l) => l.clave === "POST /v23.0/1784/media");
  assert.deepEqual(creaciones.slice(0, 3).map((l) => l.cuerpo), urls.map((u) => ({ image_url: u, is_carousel_item: "true", access_token: "t" })));
  const padre = await ig.crearCarrusel({ hijos: ids, caption: "Texto" });
  assert.equal(padre, "padre");
  assert.deepEqual(g.llamadas.filter((l) => l.clave === "POST /v23.0/1784/media")[3].cuerpo, { media_type: "CAROUSEL", children: "h1,h2,h3", caption: "Texto", access_token: "t" }, "el orden de los hijos es el de las diapositivas");
  assert.equal(await ig.publicar("padre"), "m1");
});

test("(carrusel · Threads) hijos IMAGE con is_carousel_item, contenedor CAROUSEL con children y text; un corte al publicar sigue siendo incierto", async () => {
  let hijos = 0;
  const g = graphFalso({
    "POST /v1.0/555/threads": ({ cuerpo }) => ({ ok: true, status: 200, json: async () => ({ id: cuerpo.media_type === "CAROUSEL" ? "padre" : `t${++hijos}` }) }),
    "POST /v1.0/555/threads_publish": () => { throw new TypeError("fetch failed"); },
  });
  const th = crearClienteThreads({ token: "t", usuarioId: "555", fetchImpl: g.impl, dormir: async () => {} });
  const ids = [];
  for (const u of urls) ids.push(await th.crearContenedorHijo({ imageUrl: u }));
  assert.deepEqual(ids, ["t1", "t2", "t3"]);
  const creaciones = g.llamadas.filter((l) => l.clave === "POST /v1.0/555/threads");
  assert.deepEqual(creaciones[0].cuerpo, { media_type: "IMAGE", image_url: urls[0], is_carousel_item: "true", access_token: "t" });
  assert.equal(await th.crearCarrusel({ hijos: ids, texto: "Texto" }), "padre");
  assert.deepEqual(g.llamadas.filter((l) => l.clave === "POST /v1.0/555/threads")[3].cuerpo, { media_type: "CAROUSEL", children: "t1,t2,t3", text: "Texto", access_token: "t" });
  await assert.rejects(th.publicarContenedor("padre"), (e) => e instanceof ErrorIncierto);
});

// El cliente de Facebook sabe adjuntar varias fotos, pero el publicador y el panel NO lo usan para carruseles hasta
// validarlo con la API real (REDES_CARRUSEL excluye facebook). La prueba documenta la forma de las llamadas.
test("(carrusel · Facebook, no habilitado) varias fotos sin publicar y una publicación con todas adjuntas en orden; la evidencia acepta cualquiera de las fotos en attachments o subattachments", async () => {
  let fotos = 0;
  const g = graphFalso({
    "POST /v23.0/123/photos": () => ({ ok: true, status: 200, json: async () => ({ id: `ph${++fotos}` }) }),
    "POST /v23.0/123/feed": { id: "123_456" },
    "GET /v23.0/123_456": { permalink_url: "https://www.facebook.com/123/posts/456" },
    "GET /v23.0/123/posts": { data: [
      { id: "123_999", created_time: "2026-09-10T00:00:00+0000", permalink_url: "https://www.facebook.com/123/posts/999", attachments: { data: [{ target: { id: "otra" } }] } },
      { id: "123_456", created_time: "2026-09-10T01:00:00+0000", permalink_url: "https://www.facebook.com/123/posts/456", attachments: { data: [{ type: "album", target: { id: "album1" }, subattachments: { data: [{ target: { id: "ph1" } }, { target: { id: "ph2" } }, { target: { id: "ph3" } }] } }] } },
    ] },
  });
  const fb = crearClienteFacebook({ token: "t", paginaId: "123", apiVersion: "v23.0", fetchImpl: g.impl, dormir: async () => {} });
  const ids = [];
  for (const u of urls) ids.push(await fb.crearContenedor({ imageUrl: u }));
  assert.deepEqual(ids, ["ph1", "ph2", "ph3"]);
  const r = await fb.publicarContenedor({ hijos: ids, texto: "Texto" });
  assert.deepEqual(r, { id: "ph1", idPublicacion: "123_456", permalink: "https://www.facebook.com/123/posts/456" });
  const feed = g.llamadas.find((l) => l.clave === "POST /v23.0/123/feed");
  assert.deepEqual(JSON.parse(feed.cuerpo.attached_media), [{ media_fbid: "ph1" }, { media_fbid: "ph2" }, { media_fbid: "ph3" }]);
  const evidencia = await fb.publicacionConContenedor(["ph1", "ph2", "ph3"], { desde: "2026-09-09T00:00:00.000Z" });
  assert.deepEqual(evidencia, { id: "ph1", idPublicacion: "123_456", permalink: "https://www.facebook.com/123/posts/456" });
  assert.match(g.llamadas.find((l) => l.clave === "GET /v23.0/123/posts").query.fields, /subattachments\{target\}/);
  assert.equal(await fb.publicacionConContenedor(["ph7"], { desde: "2026-09-09T00:00:00.000Z" }), null);
  // Con una sola foto (post normal) sigue funcionando igual que en F1.
  const r1 = await fb.publicarContenedor({ contenedorId: "ph1", texto: "Uno" });
  assert.equal(r1.id, "ph1");
  assert.deepEqual(JSON.parse(g.llamadas.filter((l) => l.clave === "POST /v23.0/123/feed")[1].cuerpo.attached_media), [{ media_fbid: "ph1" }]);
});
