import { test } from "node:test";
import assert from "node:assert/strict";
import { crearClienteInstagram } from "../src/lib/instagram.mjs";
import { ErrorIncierto } from "../src/lib/incierto.mjs";

function graphFalso(respuestas = {}) {
  const llamadas = [];
  const impl = async (url, opciones = {}) => {
    const u = new URL(url);
    const clave = `${opciones.method || "GET"} ${u.pathname}`;
    llamadas.push({ clave, query: Object.fromEntries(u.searchParams) });
    const r = respuestas[clave];
    if (typeof r === "function") return r();
    if (r === undefined) return { ok: false, status: 404, json: async () => ({ error: { message: `sin respuesta simulada para ${clave}`, code: 803 } }) };
    return { ok: true, status: 200, json: async () => r };
  };
  return { impl, llamadas };
}
const cliente = (g) => crearClienteInstagram({ token: "IGAAtoken", usuarioId: "1784", apiVersion: "v23.0", fetchImpl: g.impl, dormir: async () => {} });

test("(instagram) publicar un contenedor: un corte de red tras enviar media_publish es ErrorIncierto y no se reintenta; crear el contenedor sí reintenta", async () => {
  let intentos = 0;
  const g = graphFalso({ "POST /v23.0/1784/media_publish": () => { intentos++; throw new TypeError("fetch failed"); } });
  await assert.rejects(cliente(g).publicar("c1"), (err) => err instanceof ErrorIncierto && err.incierto === true);
  assert.equal(intentos, 1);
  let veces = 0;
  const g2 = graphFalso({ "POST /v23.0/1784/media": () => { veces++; if (veces < 2) throw new TypeError("fetch failed"); return { ok: true, status: 200, json: async () => ({ id: "c2" }) }; } });
  assert.equal(await cliente(g2).crearContenedor({ imageUrl: "https://u/x.jpg", caption: "x" }), "c2");
  assert.equal(veces, 2);
});

test("(instagram) estadoContenedor lee status_code y status del contenedor (evidencia para reconciliar)", async () => {
  const g = graphFalso({ "GET /v23.0/c1": { status_code: "PUBLISHED", status: "Media Published", id: "c1" } });
  assert.deepEqual(await cliente(g).estadoContenedor("c1"), { estado: "PUBLISHED", detalle: "Media Published" });
  assert.equal(g.llamadas[0].query.fields, "status_code,status");
  const caducado = graphFalso({ "GET /v23.0/c1": () => ({ ok: false, status: 400, json: async () => ({ error: { message: "Unsupported get request", code: 100, error_subcode: 33 } }) }) });
  assert.deepEqual(await cliente(caducado).estadoContenedor("c1"), { estado: "DESCONOCIDO", detalle: "Unsupported get request" });
});

test("(instagram) medioPorContenedor localiza el medio publicado desde un contenedor cuando la API lo expone; si no, devuelve null (nunca adivina por texto)", async () => {
  const g = graphFalso({ "GET /v23.0/c1": { id: "c1", status_code: "PUBLISHED" }, "GET /v23.0/17999": { id: "17999", permalink: "https://www.instagram.com/p/z/" } });
  const c = cliente(g);
  assert.equal(await c.medioPorContenedor("c1"), null, "sin id de medio en la respuesta no se afirma nada");
});
