// /api/archivos del servidor local: varios archivos de una vez o ninguno (validación y sha antes de tocar el disco).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { crearServidor, shaDeBlob, recuperarEscrituraPendiente, RUTA_DIARIO } from "../src/serve.mjs";
import { raizConCuentas } from "./ayuda/cuentas.mjs";

const listarTmp = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).filter((f) => String(f).endsWith(".tmp")) : []);

test("(maestro) una escritura interrumpida se completa con el diario: al arrancar o en la siguiente petición se aplican los archivos que faltaban", async () => {
  const raiz2 = raizConCuentas({ cuentas: ["sinlinea", "prueba"], prefijo: "serve-diario-" });
  const cfg = JSON.parse(fs.readFileSync(path.join(raiz2, "cuentas/prueba/config.json"), "utf8"));
  const nueva = { ...cfg, nombre: "Recuperada", automatico: { generar: false, publicar: false }, marca: { nombre: "R", usuario: "@recuperada", lema: "" } };
  const global = JSON.parse(fs.readFileSync(path.join(raiz2, "config.json"), "utf8"));
  const b64 = (t) => Buffer.from(t).toString("base64");
  const diario = { creado: "2026-09-09T10:00:00.000Z", mensaje: "alta de cuenta recuperada", archivos: [
    { ruta: "cuentas/recuperada/config.json", base64: b64(JSON.stringify(nueva, null, 2)) },
    { ruta: "cuentas/recuperada/editorial.md", base64: b64("# Recuperada\n") },
    { ruta: "config.json", base64: b64(JSON.stringify({ ...global, cuentas: [...global.cuentas, "recuperada"] }, null, 2)) },
  ] };
  // Simulación: el diario quedó escrito, solo el primer archivo llegó al disco y el proceso murió.
  fs.mkdirSync(path.join(raiz2, "temp"), { recursive: true });
  fs.writeFileSync(path.join(raiz2, RUTA_DIARIO), JSON.stringify(diario));
  fs.mkdirSync(path.join(raiz2, "cuentas/recuperada"), { recursive: true });
  fs.writeFileSync(path.join(raiz2, "cuentas/recuperada/config.json"), JSON.stringify(nueva, null, 2));
  const r = recuperarEscrituraPendiente(raiz2, { warn: () => {} });
  assert.deepEqual([...r.aplicados].sort(), ["config.json", "cuentas/recuperada/config.json", "cuentas/recuperada/editorial.md"]);
  assert.equal(fs.readFileSync(path.join(raiz2, "cuentas/recuperada/editorial.md"), "utf8"), "# Recuperada\n");
  assert.ok(JSON.parse(fs.readFileSync(path.join(raiz2, "config.json"), "utf8")).cuentas.includes("recuperada"));
  assert.equal(fs.existsSync(path.join(raiz2, RUTA_DIARIO)), false, "el diario se borra al terminar");
  assert.equal(recuperarEscrituraPendiente(raiz2, { warn: () => {} }), null, "sin diario no hay nada que recuperar");
  // Al arrancar el servidor con un diario pendiente, se recupera antes de atender la primera petición.
  fs.writeFileSync(path.join(raiz2, RUTA_DIARIO), JSON.stringify({ ...diario, archivos: [{ ruta: "cuentas/recuperada/editorial.md", base64: b64("# Otra vez\n") }] }));
  const s2 = crearServidor({ raiz: raiz2, log: { warn: () => {} } });
  await new Promise((resolve) => s2.listen(0, "127.0.0.1", resolve));
  try {
    const lista = await (await fetch(`http://127.0.0.1:${s2.address().port}/api/cuentas`)).json();
    assert.equal(lista.cuentas.find((c) => c.id === "recuperada").editorial, "# Otra vez\n");
    assert.equal(fs.existsSync(path.join(raiz2, RUTA_DIARIO)), false);
  } finally {
    s2.close();
  }
  // Un diario ilegible no bloquea el arranque: se aparta como .corrupto y se informa.
  fs.writeFileSync(path.join(raiz2, RUTA_DIARIO), "{ esto no es json");
  const avisos = [];
  const c = recuperarEscrituraPendiente(raiz2, { warn: (m) => avisos.push(m) });
  assert.deepEqual(c.aplicados, []);
  assert.match(c.error, /diario/i);
  assert.equal(fs.existsSync(path.join(raiz2, RUTA_DIARIO)), false);
  assert.equal(fs.existsSync(path.join(raiz2, RUTA_DIARIO + ".corrupto")), true);
  assert.ok(avisos.some((m) => /corrupto/i.test(m)));
});

let servidor, base, raiz;
before(async () => {
  raiz = raizConCuentas({ cuentas: ["sinlinea", "prueba"], prefijo: "serve-atomico-" });
  servidor = crearServidor({ raiz });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
after(() => servidor.close());

const json = (ruta, cuerpo) => fetch(`${base}${ruta}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) });

test("(maestro) /api/archivos escribe varios archivos de una vez o ninguno", async () => {
  const g = await (await fetch(`${base}/api/archivo?ruta=config.json`)).json();
  const global = JSON.parse(g.texto);
  const cfgNueva = { ...JSON.parse(fs.readFileSync(path.join(raiz, "cuentas/prueba/config.json"), "utf8")), nombre: "Otra cuenta", automatico: { generar: false, publicar: false }, marca: { nombre: "Otra", usuario: "@otra", lema: "" } };
  // Un archivo inválido en el lote: 400 y nada escrito (ni la editorial válida)
  const malo = await json("/api/archivos", { mensaje: "alta", archivos: [
    { ruta: "cuentas/otra-cuenta/editorial.md", texto: "# Otra\n", sha: null },
    { ruta: "cuentas/otra-cuenta/config.json", texto: JSON.stringify({ ...cfgNueva, franjas: ["99:99"] }), sha: null },
  ] });
  assert.equal(malo.status, 400);
  assert.match((await malo.json()).error, /franjas/);
  assert.equal(fs.existsSync(path.join(raiz, "cuentas/otra-cuenta/editorial.md")), false, "nada se escribió");
  // Un sha desfasado en el lote: 409 con la versión actual y nada escrito
  const conflicto = await json("/api/archivos", { mensaje: "alta", archivos: [
    { ruta: "cuentas/otra-cuenta/editorial.md", texto: "# Otra\n", sha: null },
    { ruta: "config.json", texto: JSON.stringify({ ...global, cuentas: [...global.cuentas, "otra-cuenta"] }), sha: "0".repeat(40) },
  ] });
  assert.equal(conflicto.status, 409);
  const c = await conflicto.json();
  assert.equal(c.ruta, "config.json");
  assert.equal(c.sha, g.sha);
  assert.equal(fs.existsSync(path.join(raiz, "cuentas/otra-cuenta/editorial.md")), false, "nada se escribió");
  // Lote correcto: config + editorial + logo + lista global, todo junto
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64");
  const ok = await json("/api/archivos", { mensaje: "alta", archivos: [
    { ruta: "cuentas/otra-cuenta/config.json", texto: JSON.stringify(cfgNueva, null, 2) + "\n", sha: null },
    { ruta: "cuentas/otra-cuenta/editorial.md", texto: "# Otra\n", sha: null },
    { ruta: "cuentas/otra-cuenta/logo.png", base64: png },
    { ruta: "config.json", texto: JSON.stringify({ ...global, cuentas: [...global.cuentas, "otra-cuenta"] }, null, 2) + "\n", sha: g.sha },
  ] });
  assert.equal(ok.status, 200);
  const r = await ok.json();
  assert.equal(r.shas["cuentas/otra-cuenta/editorial.md"], shaDeBlob("# Otra\n"));
  assert.equal(JSON.parse(fs.readFileSync(path.join(raiz, "cuentas/otra-cuenta/config.json"), "utf8")).nombre, "Otra cuenta");
  assert.equal(fs.existsSync(path.join(raiz, "cuentas/otra-cuenta/logo.png")), true);
  assert.ok(JSON.parse(fs.readFileSync(path.join(raiz, "config.json"), "utf8")).cuentas.includes("otra-cuenta"));
  // Ruta fuera de la lista blanca en el lote: 403 y nada escrito
  const prohibido = await json("/api/archivos", { archivos: [{ ruta: "posts/x.json", texto: "{}", sha: null }] });
  assert.equal(prohibido.status, 403);
  // Tras un lote correcto no queda diario ni archivos temporales: se escribe en .tmp y se renombra.
  assert.equal(fs.existsSync(path.join(raiz, RUTA_DIARIO)), false);
  assert.deepEqual(listarTmp(path.join(raiz, "cuentas")), []);
  assert.deepEqual(listarTmp(raiz).filter((f) => !String(f).startsWith("node_modules")), []);
});
