// Escritura atómica de varios archivos en el almacén de GitHub (API de git: blobs → árbol → commit → ref), con fetch simulado.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearAlmacenGitHub, ErrorConflictoArchivo } from "../panel/almacen.mjs";

function fetchGitHub(respuestas) {
  const llamadas = [];
  const impl = async (url, opciones = {}) => {
    llamadas.push({ url: String(url), metodo: opciones.method || "GET", cuerpo: opciones.body ? JSON.parse(opciones.body) : null });
    const r = respuestas.shift() || { status: 200, json: {} };
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.json, text: async () => JSON.stringify(r.json) };
  };
  return { impl, llamadas };
}
const resumen = (llamadas) => llamadas.map((l) => `${l.metodo} ${l.url.replace(/^https:[/][/]api[.]github[.]com[/]repos[/]o[/]r[/]/, "")}`);

test("(maestro) escribirArchivos guarda varios archivos en UN commit y devuelve el sha de cada blob", async () => {
  const f = fetchGitHub([
    { status: 200, json: { object: { sha: "h0" } } },
    { status: 200, json: { tree: { sha: "t0" } } },
    { status: 404, json: {} },
    { status: 404, json: {} },
    { status: 200, json: { content: Buffer.from('{"cuentas":["sinlinea"]}').toString("base64"), sha: "g0" } },
    { status: 201, json: { sha: "b1" } },
    { status: 201, json: { sha: "b2" } },
    { status: 201, json: { sha: "b3" } },
    { status: 201, json: { sha: "t1" } },
    { status: 201, json: { sha: "c1" } },
    { status: 200, json: { object: { sha: "c1" } } },
  ]);
  const a = crearAlmacenGitHub({ token: "t", owner: "o", repo: "r", fetchImpl: f.impl });
  const r = await a.escribirArchivos([
    { ruta: "cuentas/x/config.json", texto: '{"nombre":"X"}', sha: null },
    { ruta: "cuentas/x/editorial.md", texto: "# X", sha: null },
    { ruta: "config.json", texto: '{"cuentas":["sinlinea","x"]}', sha: "g0" },
  ], { mensaje: "panel: alta de cuenta x" });
  assert.deepEqual(r.shas, { "cuentas/x/config.json": "b1", "cuentas/x/editorial.md": "b2", "config.json": "b3" });
  assert.equal(r.commit, "c1");
  assert.deepEqual(resumen(f.llamadas), [
    "GET git/ref/heads/main", "GET git/commits/h0",
    "GET contents/cuentas/x/config.json?ref=h0", "GET contents/cuentas/x/editorial.md?ref=h0", "GET contents/config.json?ref=h0",
    "POST git/blobs", "POST git/blobs", "POST git/blobs", "POST git/trees", "POST git/commits", "PATCH git/refs/heads/main",
  ]);
  assert.equal(f.llamadas[5].cuerpo.encoding, "utf-8");
  assert.equal(f.llamadas[5].cuerpo.content, '{"nombre":"X"}');
  assert.deepEqual(f.llamadas[8].cuerpo, { base_tree: "t0", tree: [
    { path: "cuentas/x/config.json", mode: "100644", type: "blob", sha: "b1" },
    { path: "cuentas/x/editorial.md", mode: "100644", type: "blob", sha: "b2" },
    { path: "config.json", mode: "100644", type: "blob", sha: "b3" },
  ] });
  assert.deepEqual(f.llamadas[9].cuerpo, { message: "panel: alta de cuenta x", tree: "t1", parents: ["h0"] });
  assert.deepEqual(f.llamadas[10].cuerpo, { sha: "c1", force: false });
});

test("(maestro) un binario va en base64 y un archivo sin sha declarado (undefined) no se comprueba", async () => {
  const f = fetchGitHub([
    { status: 200, json: { object: { sha: "h0" } } },
    { status: 200, json: { tree: { sha: "t0" } } },
    { status: 201, json: { sha: "b1" } },
    { status: 201, json: { sha: "t1" } },
    { status: 201, json: { sha: "c1" } },
    { status: 200, json: { object: { sha: "c1" } } },
  ]);
  const a = crearAlmacenGitHub({ token: "t", owner: "o", repo: "r", fetchImpl: f.impl });
  const r = await a.escribirArchivos([{ ruta: "cuentas/x/logo.png", base64: "iVBORw0KGgo=" }], { mensaje: "logo" });
  assert.equal(r.shas["cuentas/x/logo.png"], "b1");
  assert.equal(f.llamadas[2].cuerpo.encoding, "base64");
  assert.equal(f.llamadas.filter((l) => l.url.includes("/contents/")).length, 0, "sin comprobación de versión");
});

test("(maestro) escribirArchivos no escribe nada si un archivo cambió o ya existía cuando debía ser nuevo", async () => {
  const contenido = Buffer.from('{"nombre":"actual"}').toString("base64");
  const conflicto = fetchGitHub([
    { status: 200, json: { object: { sha: "h0" } } },
    { status: 200, json: { tree: { sha: "t0" } } },
    { status: 200, json: { content: contenido, sha: "nuevo" } },
  ]);
  const a = crearAlmacenGitHub({ token: "t", owner: "o", repo: "r", fetchImpl: conflicto.impl });
  await assert.rejects(() => a.escribirArchivos([{ ruta: "cuentas/x/config.json", texto: "{}", sha: "viejo" }], { mensaje: "m" }), (e) => e instanceof ErrorConflictoArchivo && e.ruta === "cuentas/x/config.json" && e.actual.sha === "nuevo");
  assert.equal(conflicto.llamadas.filter((l) => l.metodo !== "GET").length, 0, "sin escrituras");
  const yaExiste = fetchGitHub([
    { status: 200, json: { object: { sha: "h0" } } },
    { status: 200, json: { tree: { sha: "t0" } } },
    { status: 200, json: { content: contenido, sha: "x1" } },
  ]);
  const b = crearAlmacenGitHub({ token: "t", owner: "o", repo: "r", fetchImpl: yaExiste.impl });
  await assert.rejects(() => b.escribirArchivos([{ ruta: "cuentas/x/config.json", texto: "{}", sha: null }], { mensaje: "m" }), (e) => e instanceof ErrorConflictoArchivo && e.actual.sha === "x1");
});

test("(maestro) si la rama avanzó entre la lectura y el commit (422 al mover la ref), se rehace todo sobre la punta nueva", async () => {
  const avanza = fetchGitHub([
    { status: 200, json: { object: { sha: "h0" } } }, { status: 200, json: { tree: { sha: "t0" } } }, { status: 404, json: {} },
    { status: 201, json: { sha: "b1" } }, { status: 201, json: { sha: "t1" } }, { status: 201, json: { sha: "c1" } },
    { status: 422, json: { message: "Update is not a fast forward" } },
    { status: 200, json: { object: { sha: "h1" } } }, { status: 200, json: { tree: { sha: "t9" } } }, { status: 404, json: {} },
    { status: 201, json: { sha: "b1" } }, { status: 201, json: { sha: "t2" } }, { status: 201, json: { sha: "c2" } },
    { status: 200, json: { object: { sha: "c2" } } },
  ]);
  const c = crearAlmacenGitHub({ token: "t", owner: "o", repo: "r", fetchImpl: avanza.impl });
  const r = await c.escribirArchivos([{ ruta: "cuentas/x/editorial.md", texto: "# X", sha: null }], { mensaje: "m" });
  assert.equal(r.commit, "c2");
  assert.equal(avanza.llamadas.filter((l) => l.metodo === "PATCH").length, 2);
  assert.deepEqual(avanza.llamadas[avanza.llamadas.length - 2].cuerpo.parents, ["h1"]);
});
