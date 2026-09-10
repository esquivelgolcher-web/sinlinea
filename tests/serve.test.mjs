import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { crearServidor } from "../src/serve.mjs";
import { raizConCuentas } from "./ayuda/cuentas.mjs";

let servidor, base, raiz;
before(async () => {
  raiz = raizConCuentas({ cuentas: ["sinlinea", "prueba"], prefijo: "serve-" });
  for (const d of ["posts", "data", "templates", "panel", "src/lib", "public/img", "assets/fonts", "tests/fixtures"]) fs.mkdirSync(path.join(raiz, d), { recursive: true });
  fs.copyFileSync("templates/post.html", path.join(raiz, "templates/post.html"));
  fs.copyFileSync("tests/fixtures/post-ejemplo.json", path.join(raiz, "tests/fixtures/post-ejemplo.json"));
  fs.copyFileSync("tests/fixtures/ilustracion-ejemplo.jpg", path.join(raiz, "tests/fixtures/ilustracion-ejemplo.jpg"));
  fs.copyFileSync("tests/fixtures/post-ejemplo.json", path.join(raiz, "posts/2026-09-07-1420-la-prensa-a1b2.json"));
  fs.writeFileSync(path.join(raiz, "data/sinlinea/token-info.json"), '{ "vence": "2026-11-01" }');
  fs.writeFileSync(path.join(raiz, "panel/index.html"), "<p>panel</p>");
  fs.writeFileSync(path.join(raiz, "assets/fonts/Anton-Regular.ttf"), "ttf");
  fs.copyFileSync("src/lib/estados.mjs", path.join(raiz, "src/lib/estados.mjs"));
  servidor = crearServidor({ raiz });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
after(() => servidor.close());

test("sirve la fuente de titulares al panel en /panel/fonts/ (la misma que usan las piezas) y nada fuera de esa carpeta", async () => {
  const res = await fetch(`${base}/panel/fonts/Anton-Regular.ttf`);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "ttf");
  assert.equal((await fetch(`${base}/panel/fonts/../../config.json`)).status, 404);
});

test("sirve la vista de la plantilla con la variante pedida", async () => {
  const html = await (await fetch(`${base}/vista/rojo`)).text();
  assert.match(html, /<base href="\/">/);
  assert.match(html, /"variante":"rojo"/);
});

test("sirve la vista con ilustración y el archivo de la fixture", async () => {
  assert.match(await (await fetch(`${base}/vista/negro?ilustracion=1`)).text(), /"ilustracionUrl":"tests\/fixtures\/ilustracion-ejemplo.jpg"/);
  assert.equal((await fetch(`${base}/tests/fixtures/ilustracion-ejemplo.jpg`)).status, 200);
});

test("api de posts: lista, actualiza y rechaza inválidos; token-info", async () => {
  const lista = await (await fetch(`${base}/api/posts`)).json();
  assert.equal(lista.length, 1);
  const post = { ...lista[0], estado: "descartado" };
  const ok = await fetch(`${base}/api/posts/${post.id}`, { method: "PUT", body: JSON.stringify(post), headers: { "content-type": "application/json" } });
  assert.equal(ok.status, 200);
  assert.equal(JSON.parse(fs.readFileSync(path.join(raiz, `posts/${post.id}.json`), "utf8")).estado, "descartado");
  const malo = await fetch(`${base}/api/posts/${post.id}`, { method: "PUT", body: JSON.stringify({ ...post, estado: "x" }), headers: { "content-type": "application/json" } });
  assert.equal(malo.status, 400);
  assert.deepEqual(await (await fetch(`${base}/api/token-info`)).json(), { vence: "2026-11-01" });
});

test("sirve el panel, sus módulos desde src/lib y bloquea rutas fuera de la raíz", async () => {
  assert.match(await (await fetch(`${base}/panel/`)).text(), /panel/);
  assert.equal((await (await fetch(`${base}/panel/config.json`)).json()).zonaHoraria, "America/Panama");
  const js = await fetch(`${base}/panel/lib/estados.mjs`);
  assert.equal(js.status, 200);
  assert.match(js.headers.get("content-type"), /javascript/);
  assert.equal((await fetch(`${base}/assets/../config.json`)).status, 404);
  assert.equal((await fetch(`${base}/assets/..%5c..%5cconfig.json`)).status, 404);
  assert.equal((await fetch(`${base}/%zz`)).status, 400);
});

test("(M1) /panel/config.json lista las cuentas y /cuentas/<id>/logo.png sirve el logo de la cuenta", async () => {
  const cfg = await (await fetch(`${base}/panel/config.json`)).json();
  assert.deepEqual(cfg.cuentas.map((c) => c.id), ["sinlinea", "prueba"]);
  assert.equal(cfg.cuentas[0].franjas.length, 6);
  assert.equal(cfg.franjas.length, 6);
  const logo = await fetch(`${base}/cuentas/sinlinea/logo.png`);
  assert.equal(logo.status, 200);
  assert.equal(logo.headers.get("content-type"), "image/png");
  assert.equal((await fetch(`${base}/cuentas/sinlinea/config.json`)).status, 404, "la configuración de la cuenta no se sirve");
  assert.equal((await fetch(`${base}/cuentas/../config.json`)).status, 404);
});

test("(M1) /api/token-info devuelve el de la cuenta pedida y el de la principal por defecto", async () => {
  fs.writeFileSync(path.join(raiz, "data/prueba/token-info.json"), '{ "vence": "2026-12-01" }');
  assert.equal((await (await fetch(`${base}/api/token-info`)).json()).vence, "2026-11-01");
  assert.equal((await (await fetch(`${base}/api/token-info?cuenta=prueba`)).json()).vence, "2026-12-01");
});
