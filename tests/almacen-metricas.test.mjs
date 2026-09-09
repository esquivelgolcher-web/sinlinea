// Métricas fase 1: el almacén de GitHub lee data/<cuenta>/metricas/ con pocas peticiones (solo los archivos reconocidos
// de los dos últimos meses y estado.json), reutiliza lo leído y trata la carpeta ausente como "sin recogida".
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearAlmacenGitHub } from "../panel/almacen.mjs";

const b64 = (o) => Buffer.from(JSON.stringify(o), "utf8").toString("base64");
function fetchPorRuta(rutas) {
  const llamadas = [];
  const impl = async (url, opciones = {}) => {
    const u = String(url);
    llamadas.push({ url: u, metodo: opciones.method || "GET" });
    const regla = rutas.find((r) => r.re.test(u));
    const r = regla ? regla.res : { status: 404, json: { message: "Not Found" } };
    return { ok: r.status >= 200 && r.status < 300, status: r.status, headers: { get: () => null }, json: async () => r.json, text: async () => JSON.stringify(r.json) };
  };
  return { impl, llamadas };
}
// Hallazgo real (2026-09-09): las publicaciones se archivan por su mes de publicación (julio, agosto) mientras la cuenta
// se archiva por mes de consulta (septiembre); "los dos últimos meses" contando todos los archivos dejaba fuera julio.
const listado = ["cuenta-2026-06.json", "cuenta-2026-07.json", "cuenta-2026-08.json", "cuenta-2026-09.json", "publicaciones-2026-04.json", "publicaciones-2026-07.json", "publicaciones-2026-08.json", "estado.json", "notas.txt"].map((name) => ({ name, type: "file" }));

test("(métricas) leerMetricas lista la carpeta una vez, lee la cuenta de los dos últimos meses y las publicaciones de los cuatro últimos (ventana de 90 días) más estado.json, y reutiliza el resultado", async () => {
  const f = fetchPorRuta([
    { re: /contents\/data\/x\/metricas\?/, res: { status: 200, json: listado } },
    { re: /contents\/data\/x\/metricas\/cuenta-2026-09\.json/, res: { status: 200, json: { content: b64({ version: 1, cuenta: "x", consultas: { "2026-09-10T05:31:02.000Z": { perfil: { seguidores: 42 } } }, porDia: {} }), sha: "a" } } },
    { re: /contents\/data\/x\/metricas\/cuenta-2026-08\.json/, res: { status: 200, json: { content: b64({ version: 1, cuenta: "x", consultas: {}, porDia: {} }), sha: "b" } } },
    { re: /contents\/data\/x\/metricas\/publicaciones-2026-08\.json/, res: { status: 200, json: { content: b64({ version: 1, cuenta: "x", publicaciones: {} }), sha: "c" } } },
    { re: /contents\/data\/x\/metricas\/publicaciones-2026-07\.json/, res: { status: 200, json: { content: b64({ version: 1, cuenta: "x", publicaciones: { 1: { fecha: "2026-07-23T21:29:22.000Z", consultas: {} } } }), sha: "d" } } },
    { re: /contents\/data\/x\/metricas\/estado\.json/, res: { status: 200, json: { content: b64({ version: 1, cuenta: "x", ultimaCorrida: "2026-09-10T05:31:02.000Z", pendientes: [] }), sha: "e" } } },
  ]);
  const a = crearAlmacenGitHub({ token: "t", owner: "o", repo: "r", fetchImpl: f.impl, ahora: () => Date.parse("2026-09-10T12:00:00Z") });
  const m = await a.leerMetricas("x");
  assert.deepEqual(Object.keys(m.archivos).sort(), ["cuenta-2026-08.json", "cuenta-2026-09.json", "publicaciones-2026-07.json", "publicaciones-2026-08.json"]);
  assert.equal(m.archivos["cuenta-2026-09.json"].consultas["2026-09-10T05:31:02.000Z"].perfil.seguidores, 42);
  assert.ok(m.archivos["publicaciones-2026-07.json"].publicaciones["1"], "las publicaciones de julio (dentro de la ventana) sí se leen");
  assert.equal(m.estado.ultimaCorrida, "2026-09-10T05:31:02.000Z");
  assert.equal(f.llamadas.length, 6, "una lista + cuatro archivos + estado; cuenta de junio/julio, publicaciones de abril y notas.txt no se leen");
  await a.leerMetricas("x");
  assert.equal(f.llamadas.length, 6, "la segunda lectura reutiliza la primera");
  await a.leerMetricas("x", { frescos: true });
  assert.equal(f.llamadas.length, 12);
});

test("(métricas) sin carpeta (404) devuelve vacío sin lanzar; es 'sin recogida', no cero", async () => {
  const f = fetchPorRuta([]);
  const a = crearAlmacenGitHub({ token: "t", owner: "o", repo: "r", fetchImpl: f.impl });
  assert.deepEqual(await a.leerMetricas("x"), { archivos: {}, estado: null });
  assert.equal(f.llamadas.length, 1);
});
