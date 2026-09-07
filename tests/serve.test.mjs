import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { crearServidor } from "../src/serve.mjs";

let servidor, base, raiz;
before(async () => {
  raiz = fs.mkdtempSync(path.join(os.tmpdir(), "serve-"));
  for (const d of ["posts", "data", "templates", "panel", "src/lib", "public/img", "assets/fonts", "tests/fixtures"]) fs.mkdirSync(path.join(raiz, d), { recursive: true });
  fs.copyFileSync("config.json", path.join(raiz, "config.json"));
  fs.copyFileSync("templates/post.html", path.join(raiz, "templates/post.html"));
  fs.copyFileSync("tests/fixtures/post-ejemplo.json", path.join(raiz, "tests/fixtures/post-ejemplo.json"));
  fs.copyFileSync("tests/fixtures/post-ejemplo.json", path.join(raiz, "posts/2026-09-07-1420-la-prensa-a1b2.json"));
  fs.writeFileSync(path.join(raiz, "data/token-info.json"), '{ "vence": "2026-11-01" }');
  fs.writeFileSync(path.join(raiz, "panel/index.html"), "<p>panel</p>");
  fs.copyFileSync("src/lib/estados.mjs", path.join(raiz, "src/lib/estados.mjs"));
  servidor = crearServidor({ raiz });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
after(() => servidor.close());

test("sirve la vista de la plantilla con la variante pedida", async () => {
  const html = await (await fetch(`${base}/vista/rojo`)).text();
  assert.match(html, /<base href="\/">/);
  assert.match(html, /"variante":"rojo"/);
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
  const js = await fetch(`${base}/panel/lib/estados.mjs`);
  assert.equal(js.status, 200);
  assert.match(js.headers.get("content-type"), /javascript/);
  assert.equal((await fetch(`${base}/assets/../config.json`)).status, 404);
});
