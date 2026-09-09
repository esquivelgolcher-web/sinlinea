import { test } from "node:test";
import assert from "node:assert/strict";
import { crearClienteFacebook, ErrorIncierto } from "../src/lib/facebook.mjs";

// Servidor Graph simulado: registra las llamadas y responde según la ruta.
function graphFalso(respuestas = {}) {
  const llamadas = [];
  const impl = async (url, opciones = {}) => {
    const u = new URL(url);
    const cuerpo = opciones.body ? Object.fromEntries(new URLSearchParams(opciones.body)) : {};
    const clave = `${opciones.method || "GET"} ${u.pathname}`;
    llamadas.push({ clave, query: Object.fromEntries(u.searchParams), cuerpo });
    const r = respuestas[clave];
    if (typeof r === "function") return r({ query: Object.fromEntries(u.searchParams), cuerpo });
    if (r === undefined) return { ok: false, status: 404, json: async () => ({ error: { message: `sin respuesta simulada para ${clave}`, code: 803 } }) };
    return { ok: true, status: 200, json: async () => r };
  };
  return { impl, llamadas };
}
const cliente = (g, extra = {}) => crearClienteFacebook({ token: "EAAtoken", paginaId: "123", apiVersion: "v23.0", fetchImpl: g.impl, dormir: async () => {}, ...extra });

test("(facebook) perfil: GET /me con el token de página devuelve id y nombre y dice si el id coincide con la página configurada", async () => {
  const g = graphFalso({ "GET /v23.0/me": { id: "123", name: "Mi página" } });
  const p = await cliente(g).perfil();
  assert.deepEqual(p, { id: "123", nombre: "Mi página", coincideId: true });
  assert.equal(g.llamadas[0].query.fields, "id,name");
  assert.equal(g.llamadas[0].query.access_token, "EAAtoken", "el token viaja como parámetro, nunca en la ruta");
  const otra = graphFalso({ "GET /v23.0/me": { id: "999", name: "Otra" } });
  assert.equal((await cliente(otra).perfil()).coincideId, false);
});

test("(facebook) publicar en dos fases: foto sin publicar (id de contenedor) y luego la publicación en el muro con la foto adjunta; devuelve ids y enlace", async () => {
  const g = graphFalso({
    "POST /v23.0/123/photos": { id: "ph1" },
    "POST /v23.0/123/feed": { id: "123_456" },
    "GET /v23.0/123_456": { permalink_url: "https://www.facebook.com/123/posts/456", id: "123_456" },
  });
  const c = cliente(g);
  const contenedor = await c.crearContenedor({ imageUrl: "https://u.github.io/sinlinea/img/x.jpg" });
  assert.equal(contenedor, "ph1");
  const subida = g.llamadas.find((l) => l.clave === "POST /v23.0/123/photos");
  assert.equal(subida.cuerpo.url, "https://u.github.io/sinlinea/img/x.jpg");
  assert.equal(subida.cuerpo.published, "false", "la foto no se publica sola: es el contenedor");
  const r = await c.publicarContenedor({ contenedorId: "ph1", texto: "Hola\n\nFuente: X" });
  assert.deepEqual(r, { id: "ph1", idPublicacion: "123_456", permalink: "https://www.facebook.com/123/posts/456" });
  const feed = g.llamadas.find((l) => l.clave === "POST /v23.0/123/feed");
  assert.equal(feed.cuerpo.message, "Hola\n\nFuente: X");
  assert.deepEqual(JSON.parse(feed.cuerpo.attached_media), [{ media_fbid: "ph1" }]);
});

test("(facebook) un fallo de red al publicar en el muro (petición enviada, sin respuesta) es ErrorIncierto y no se reintenta a ciegas", async () => {
  let intentos = 0;
  const g = graphFalso({ "POST /v23.0/123/feed": () => { intentos++; throw new TypeError("fetch failed"); } });
  await assert.rejects(cliente(g).publicarContenedor({ contenedorId: "ph1", texto: "x" }), (err) => err instanceof ErrorIncierto && /sin respuesta/.test(err.message));
  assert.equal(intentos, 1);
});

test("(facebook) un error claro de la API al publicar (4xx con código) se propaga con código y no es incierto; subir la foto sí reintenta ante 5xx", async () => {
  const g = graphFalso({ "POST /v23.0/123/feed": () => ({ ok: false, status: 400, json: async () => ({ error: { message: "(#200) Permissions error", code: 200, type: "OAuthException" } }) }) });
  await assert.rejects(cliente(g).publicarContenedor({ contenedorId: "ph1", texto: "x" }), (err) => !(err instanceof ErrorIncierto) && err.codigo === 200 && /Permissions/.test(err.message));
  let veces = 0;
  const g2 = graphFalso({ "POST /v23.0/123/photos": () => (++veces < 2 ? { ok: false, status: 503, json: async () => ({}) } : { ok: true, status: 200, json: async () => ({ id: "ph2" }) }) });
  assert.equal(await cliente(g2).crearContenedor({ imageUrl: "https://u/x.jpg" }), "ph2");
  assert.equal(veces, 2);
});

test("(facebook) reconciliar con evidencia: existeContenedor y publicacionConContenedor identifican la publicación por el id de la foto adjunta, nunca por el texto", async () => {
  const g = graphFalso({
    "GET /v23.0/ph1": { id: "ph1" },
    "GET /v23.0/123/posts": {
      data: [
        { id: "123_1", message: "Hola\n\nFuente: X", created_time: "2026-09-10T12:00:00+0000", permalink_url: "https://www.facebook.com/123/posts/1", attachments: { data: [{ target: { id: "ph9" } }] } },
        { id: "123_2", message: "Otro", created_time: "2026-09-10T12:01:00+0000", permalink_url: "https://www.facebook.com/123/posts/2", attachments: { data: [{ target: { id: "ph1" } }] } },
      ],
    },
  });
  const c = cliente(g);
  assert.equal(await c.existeContenedor("ph1"), true);
  const pub = await c.publicacionConContenedor("ph1", { desde: "2026-09-10T11:00:00.000Z" });
  assert.deepEqual(pub, { id: "ph1", idPublicacion: "123_2", permalink: "https://www.facebook.com/123/posts/2" });
  assert.equal(await c.publicacionConContenedor("ph7", { desde: "2026-09-10T11:00:00.000Z" }), null, "un texto idéntico (123_1) no vale como evidencia");
  const consulta = g.llamadas.find((l) => l.clave === "GET /v23.0/123/posts");
  assert.match(consulta.query.fields, /attachments/);
  assert.ok(consulta.query.since, "solo publicaciones posteriores al intento");
  const sinFoto = graphFalso({ "GET /v23.0/ph1": () => ({ ok: false, status: 404, json: async () => ({ error: { message: "Unsupported get request", code: 100, error_subcode: 33 } }) }) });
  assert.equal(await cliente(sinFoto).existeContenedor("ph1"), false);
});

test("(facebook) los códigos de límite se señalan como tal y el cliente cuenta las llamadas", async () => {
  const g = graphFalso({ "GET /v23.0/me": () => ({ ok: false, status: 400, json: async () => ({ error: { message: "limit", code: 32 } }) }) });
  const c = cliente(g);
  await assert.rejects(c.perfil(), (err) => err.limite === true);
  assert.equal(c.llamadasHechas(), 1);
});
