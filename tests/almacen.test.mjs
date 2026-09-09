import { test } from "node:test";
import assert from "node:assert/strict";
import { base64Utf8, desdeBase64Utf8, deducirRepo } from "../panel/almacen.mjs";

test("base64 ida y vuelta con tildes y ñ", () => {
  const t = '{"titular":"Panamá ñ ¿qué?"}';
  assert.equal(desdeBase64Utf8(base64Utf8(t)), t);
});

test("deducirRepo lee owner y repo de la URL de Pages", () => {
  assert.deepEqual(deducirRepo({ hostname: "luis.github.io", pathname: "/sinlinea/panel/" }), { owner: "luis", repo: "sinlinea" });
  assert.equal(deducirRepo({ hostname: "localhost", pathname: "/panel/" }), null);
  assert.equal(deducirRepo({ hostname: "www.sinlinea.news", pathname: "/panel/" }), null);
});

// --- Panel maestro: archivos de cuenta y verificación en el almacén de GitHub (fetch simulado) ---
import { crearAlmacenGitHub, ErrorConflictoArchivo } from "../panel/almacen.mjs";

function fetchGitHub(respuestas) {
  const llamadas = [];
  const impl = async (url, opciones = {}) => {
    llamadas.push({ url: String(url), metodo: opciones.method || "GET", cuerpo: opciones.body ? JSON.parse(opciones.body) : null, cabeceras: opciones.headers || {} });
    const r = respuestas.shift() || { status: 200, json: {} };
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.json, text: async () => JSON.stringify(r.json) };
  };
  return { impl, llamadas };
}

test("(maestro) leerArchivo y escribirArchivo usan la API de contenidos con sha; un 409 devuelve la versión actual como ErrorConflictoArchivo", async () => {
  const contenido = Buffer.from('{"nombre":"X"}', "utf8").toString("base64");
  const f = fetchGitHub([
    { status: 200, json: { content: contenido, sha: "abc" } },
    { status: 200, json: { content: { sha: "def" } } },
    { status: 409, json: {} },
    { status: 200, json: { content: contenido, sha: "zzz" } },
  ]);
  const a = crearAlmacenGitHub({ token: "github_pat_" + "x".repeat(30), owner: "o", repo: "r", fetchImpl: f.impl });
  assert.deepEqual(await a.leerArchivo("cuentas/x/config.json"), { texto: '{"nombre":"X"}', sha: "abc" });
  assert.equal(await a.escribirArchivo("cuentas/x/config.json", '{"nombre":"Y"}', { sha: "abc", mensaje: "panel: cuenta x" }), "def");
  const put = f.llamadas[1];
  assert.equal(put.metodo, "PUT");
  assert.match(put.url, /contents\/cuentas\/x\/config.json$/);
  assert.equal(put.cuerpo.sha, "abc");
  assert.equal(put.cuerpo.branch, "main");
  assert.equal(put.cuerpo.message, "panel: cuenta x");
  assert.equal(Buffer.from(put.cuerpo.content, "base64").toString("utf8"), '{"nombre":"Y"}');
  await assert.rejects(() => a.escribirArchivo("cuentas/x/config.json", "{}", { sha: "viejo" }), (e) => e instanceof ErrorConflictoArchivo && e.actual.sha === "zzz");
  assert.ok(f.llamadas.every((l) => !JSON.stringify(l.cuerpo || {}).includes("github_pat_")), "el token solo va en la cabecera");
});

test("(maestro) escribirBinario sube el logo en base64 y solicitarVerificacion lanza el workflow Probar Instagram con la cuenta; sin permiso Actions explica qué falta", async () => {
  const f = fetchGitHub([
    { status: 201, json: { content: { sha: "logo1" } } },
    { status: 200, json: { content: Buffer.from("{}").toString("base64"), sha: "c1" } },
    { status: 200, json: { content: { sha: "c2" } } },
    { status: 204, json: {} },
    { status: 200, json: { content: Buffer.from("{}").toString("base64"), sha: "c3" } },
    { status: 200, json: { content: { sha: "c4" } } },
    { status: 403, json: { message: "Resource not accessible by personal access token" } },
  ]);
  const a = crearAlmacenGitHub({ token: "t", owner: "o", repo: "r", fetchImpl: f.impl });
  assert.equal(await a.escribirBinario("cuentas/x/logo.png", "iVBORw0KGgo=", { mensaje: "panel: logo x" }), "logo1");
  assert.equal(f.llamadas[0].cuerpo.content, "iVBORw0KGgo=");
  const r = await a.solicitarVerificacion("x");
  assert.equal(r.ok, true);
  const conexion = f.llamadas[2];
  assert.match(conexion.url, /contents\/data\/x\/conexion.json$/);
  assert.equal(JSON.parse(Buffer.from(conexion.cuerpo.content, "base64").toString("utf8")).estado, "pendiente");
  const dispatch = f.llamadas[3];
  assert.equal(dispatch.metodo, "POST");
  assert.match(dispatch.url, /actions\/workflows\/probar-instagram.yml\/dispatches$/);
  assert.deepEqual(dispatch.cuerpo, { ref: "main", inputs: { cuenta: "x" } });
  await assert.rejects(() => a.solicitarVerificacion("x"), /Actions/);
});

test("(maestro) leerSecretosActualizados consulta solo metadatos de los secretos (fecha de actualización) y distingue inexistente de sin permiso", async () => {
  const f = fetchGitHub([
    { status: 200, json: { name: "IG_ACCESS_TOKEN", updated_at: "2026-09-08T16:43:18Z" } },
    { status: 404, json: {} },
  ]);
  const a = crearAlmacenGitHub({ token: "t", owner: "o", repo: "r", fetchImpl: f.impl });
  assert.deepEqual(await a.leerSecretosActualizados(["IG_ACCESS_TOKEN", "IG_USER_ID"]), { disponible: true, actualizados: { IG_ACCESS_TOKEN: "2026-09-08T16:43:18Z", IG_USER_ID: null } });
  assert.match(f.llamadas[0].url, /actions\/secrets\/IG_ACCESS_TOKEN$/);
  assert.equal(f.llamadas.every((l) => l.metodo === "GET"), true);
  const sinPermiso = fetchGitHub([{ status: 403, json: {} }]);
  const b = crearAlmacenGitHub({ token: "t", owner: "o", repo: "r", fetchImpl: sinPermiso.impl });
  assert.deepEqual(await b.leerSecretosActualizados(["IG_ACCESS_TOKEN", "IG_USER_ID"]), { disponible: false, actualizados: null });
  const sinToken = fetchGitHub([]);
  const c = crearAlmacenGitHub({ token: "", owner: "o", repo: "r", fetchImpl: sinToken.impl });
  assert.deepEqual(await c.leerSecretosActualizados(["IG_ACCESS_TOKEN"]), { disponible: false, actualizados: null });
  assert.equal(sinToken.llamadas.length, 0, "sin token ni siquiera se consulta");
});
