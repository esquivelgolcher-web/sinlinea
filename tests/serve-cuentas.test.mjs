// API local del panel maestro (src/serve.mjs): archivos de cuenta con bloqueo por sha, lista de cuentas y verificación.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { crearServidor, shaDeBlob } from "../src/serve.mjs";
import { raizConCuentas } from "./ayuda/cuentas.mjs";

let servidor, base, raiz;
before(async () => {
  raiz = raizConCuentas({ cuentas: ["sinlinea", "prueba"], prefijo: "serve-cuentas-" });
  fs.writeFileSync(path.join(raiz, "data/sinlinea/token-info.json"), '{ "vence": "2026-11-01" }');
  fs.writeFileSync(path.join(raiz, "data/prueba/conexion.json"), JSON.stringify({ estado: "error", usuario: null, comprobado: "2026-09-08T20:00:00.000Z", detalle: "code 190" }));
  fs.mkdirSync(path.join(raiz, ".github/workflows"), { recursive: true });
  fs.copyFileSync(".github/workflows/publicar.yml", path.join(raiz, ".github/workflows/publicar.yml"));
  fs.copyFileSync(".github/workflows/probar-instagram.yml", path.join(raiz, ".github/workflows/probar-instagram.yml"));
  servidor = crearServidor({ raiz });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
after(() => servidor.close());

const json = (ruta, opciones) => fetch(`${base}${ruta}`, { ...opciones, headers: { "content-type": "application/json", ...(opciones?.headers || {}) } });

test("(maestro) shaDeBlob calcula el sha de blob de git (el mismo que devuelve la API de GitHub)", () => {
  assert.equal(shaDeBlob("hola\n"), "5c1b14949828006ed75a3e8858957f86a2f7e2eb");
});

test("(maestro) /api/cuentas lista cada cuenta con su config cruda, editorial, sha, conexión y token-info; nunca valores de secretos", async () => {
  const r = await (await fetch(`${base}/api/cuentas`)).json();
  assert.deepEqual(r.global.cuentas, ["sinlinea", "prueba"]);
  assert.match(r.globalSha, /^[0-9a-f]{40}$/);
  const prueba = r.cuentas.find((c) => c.id === "prueba");
  assert.equal(prueba.config.nombre, "Cuenta de prueba");
  assert.match(prueba.sha, /^[0-9a-f]{40}$/);
  assert.match(prueba.editorial, /./);
  assert.equal(prueba.conexion.estado, "error");
  assert.equal(prueba.logo, false);
  const sinlinea = r.cuentas.find((c) => c.id === "sinlinea");
  assert.deepEqual(sinlinea.tokenInfo, { vence: "2026-11-01" });
  assert.equal(sinlinea.conexion, null);
  assert.equal(sinlinea.logo, true);
  assert.match(prueba.conexionSha, /^[0-9a-f]{40}$/);
  assert.equal(sinlinea.conexionSha, null);
  assert.deepEqual(r.workflows.expuestos, ["IG_ACCESSTOKEN_LUISESKIVELGOLCHER", "IG_ACCESS_TOKEN", "IG_USER_ID", "IG_USER_ID_LUISESKIVELGOLCHER"], "nombres de secretos que llegan a los workflows de Instagram");
  assert.equal(JSON.stringify(r).includes("IGAA"), false);
});

test("(maestro) /api/archivo lee y escribe solo rutas de cuenta permitidas, con sha: crea, actualiza, detecta conflictos y valida", async () => {
  const ruta = "cuentas/prueba/config.json";
  const leido = await (await fetch(`${base}/api/archivo?ruta=${encodeURIComponent(ruta)}`)).json();
  assert.equal(JSON.parse(leido.texto).nombre, "Cuenta de prueba");
  assert.equal(leido.sha, shaDeBlob(fs.readFileSync(path.join(raiz, ruta), "utf8")));
  const editado = { ...JSON.parse(leido.texto), nombre: "Cuenta editada" };
  const ok = await json(`/api/archivo?ruta=${encodeURIComponent(ruta)}`, { method: "PUT", body: JSON.stringify({ texto: JSON.stringify(editado, null, 2) + "\n", sha: leido.sha }) });
  assert.equal(ok.status, 200);
  const nuevoSha = (await ok.json()).sha;
  assert.equal(JSON.parse(fs.readFileSync(path.join(raiz, ruta), "utf8")).nombre, "Cuenta editada");
  // sha viejo → conflicto 409 con la versión actual
  const conflicto = await json(`/api/archivo?ruta=${encodeURIComponent(ruta)}`, { method: "PUT", body: JSON.stringify({ texto: JSON.stringify({ ...editado, nombre: "Otra" }, null, 2), sha: leido.sha }) });
  assert.equal(conflicto.status, 409);
  const cuerpo = await conflicto.json();
  assert.equal(cuerpo.sha, nuevoSha);
  assert.equal(JSON.parse(cuerpo.texto).nombre, "Cuenta editada");
  // config inválida → 400 con el motivo
  const invalida = await json(`/api/archivo?ruta=${encodeURIComponent(ruta)}`, { method: "PUT", body: JSON.stringify({ texto: JSON.stringify({ ...editado, franjas: ["99:99"] }), sha: nuevoSha }) });
  assert.equal(invalida.status, 400);
  assert.match((await invalida.json()).error, /franjas/);
  // crear un archivo nuevo sin sha; crear sobre uno existente sin sha → 409
  const nueva = "cuentas/nueva-cuenta/editorial.md";
  assert.equal((await json(`/api/archivo?ruta=${encodeURIComponent(nueva)}`, { method: "PUT", body: JSON.stringify({ texto: "# Editorial\n" }) })).status, 200);
  assert.equal(fs.readFileSync(path.join(raiz, nueva), "utf8"), "# Editorial\n");
  assert.equal((await json(`/api/archivo?ruta=${encodeURIComponent(nueva)}`, { method: "PUT", body: JSON.stringify({ texto: "# Otro\n" }) })).status, 409);
  // binario (logo) en base64
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const logo = await json(`/api/archivo?ruta=${encodeURIComponent("cuentas/nueva-cuenta/logo.png")}`, { method: "PUT", body: JSON.stringify({ base64: png.toString("base64") }) });
  assert.equal(logo.status, 200);
  assert.deepEqual([...fs.readFileSync(path.join(raiz, "cuentas/nueva-cuenta/logo.png"))], [...png]);
  // rutas fuera de la lista blanca
  for (const mala of ["posts/x.json", "cuentas/prueba/otro.txt", "cuentas/../config.json", "data/prueba/token-info.json", ".github/workflows/publicar.yml"]) {
    const r = await json(`/api/archivo?ruta=${encodeURIComponent(mala)}`, { method: "PUT", body: JSON.stringify({ texto: "x" }) });
    assert.equal(r.status, 403, mala);
  }
  assert.equal((await fetch(`${base}/api/archivo?ruta=${encodeURIComponent("cuentas/prueba/no-existe.md")}`)).status, 403);
  assert.equal((await fetch(`${base}/api/archivo?ruta=${encodeURIComponent("cuentas/nadie/editorial.md")}`)).status, 404);
});

test("(maestro) el config.json global se edita con sha y se valida; una cuenta inexistente en la lista se rechaza", async () => {
  const leido = await (await fetch(`${base}/api/archivo?ruta=config.json`)).json();
  const g = JSON.parse(leido.texto);
  const mal = await json("/api/archivo?ruta=config.json", { method: "PUT", body: JSON.stringify({ texto: JSON.stringify({ ...g, cuentas: ["sinlinea", "prueba", "Mayúsculas"] }), sha: leido.sha }) });
  assert.equal(mal.status, 400);
  const ok = await json("/api/archivo?ruta=config.json", { method: "PUT", body: JSON.stringify({ texto: JSON.stringify({ ...g, cuentas: ["sinlinea", "prueba", "nueva-cuenta"] }, null, 2) + "\n", sha: leido.sha }) });
  assert.equal(ok.status, 200);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(raiz, "config.json"), "utf8")).cuentas, ["sinlinea", "prueba", "nueva-cuenta"]);
});

test("(maestro) /api/verificar-conexion deja la cuenta como pendiente de verificación (en local no se lanza el workflow)", async () => {
  const r = await json("/api/verificar-conexion?cuenta=prueba", { method: "POST" });
  assert.equal(r.status, 200);
  const c = JSON.parse(fs.readFileSync(path.join(raiz, "data/prueba/conexion.json"), "utf8"));
  assert.equal(c.estado, "pendiente");
  assert.match(c.solicitada, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal((await json("/api/verificar-conexion?cuenta=nadie", { method: "POST" })).status, 404);
});
