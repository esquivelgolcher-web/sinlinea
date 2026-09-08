import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { crearServidor } from "../src/serve.mjs";

let servidor, base, raiz, navegador;
before(async () => {
  raiz = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-"));
  for (const d of ["posts", "data", "templates", "panel", "src/lib", "public/img", "assets", "tests/fixtures"]) fs.mkdirSync(path.join(raiz, d), { recursive: true });
  fs.copyFileSync("config.json", path.join(raiz, "config.json"));
  fs.copyFileSync("templates/post.html", path.join(raiz, "templates/post.html"));
  fs.copyFileSync("tests/fixtures/post-ejemplo.json", path.join(raiz, "tests/fixtures/post-ejemplo.json"));
  fs.copyFileSync("tests/fixtures/post-ejemplo.json", path.join(raiz, "posts/2026-09-07-1420-la-prensa-a1b2.json"));
  fs.writeFileSync(path.join(raiz, "data/token-info.json"), '{ "vence": "2026-11-01" }');
  for (const f of fs.readdirSync("panel")) fs.copyFileSync(path.join("panel", f), path.join(raiz, "panel", f));
  for (const f of fs.readdirSync("src/lib")) fs.copyFileSync(path.join("src/lib", f), path.join(raiz, "src/lib", f));
  servidor = crearServidor({ raiz });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${servidor.address().port}`;
  navegador = await chromium.launch();
});
after(async () => { await navegador?.close(); servidor?.close(); });

test("el panel muestra el borrador, permite editar el titular y aprobar con la hora propuesta", async () => {
  const page = await navegador.newPage({ viewport: { width: 400, height: 800 } });
  await page.goto(`${base}/panel/`);
  await page.waitForSelector(".tarjeta");
  assert.match(await page.textContent("#pestanas"), /Borradores \(1\)/);
  await page.fill(".tarjeta textarea >> nth=0", "Titular editado desde el panel");
  await page.click("text=Aprobar");
  await page.waitForSelector("dialog[open]");
  await page.click("#hora-confirmar");
  await page.waitForSelector("text=Programados (1)");
  const guardado = JSON.parse(fs.readFileSync(path.join(raiz, "posts/2026-09-07-1420-la-prensa-a1b2.json"), "utf8"));
  assert.equal(guardado.estado, "programado");
  assert.equal(guardado.titular, "Titular editado desde el panel");
  assert.match(guardado.programado, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00-05:00$/);
  await page.click("text=Programados (1)");
  await page.waitForSelector(".badge.programado");
  await page.click("text=Quitar de la cola");
  await page.waitForSelector("text=Borradores (1)");
  await page.click("text=Borradores (1)");
  await page.waitForSelector(".badge.borrador");
  assert.equal(JSON.parse(fs.readFileSync(path.join(raiz, "posts/2026-09-07-1420-la-prensa-a1b2.json"), "utf8")).estado, "borrador");
  await page.close();
});

test("un texto editado sin guardar sobrevive al cambio de pestaña y Guardar sin cambios no escribe", async () => {
  const page = await navegador.newPage({ viewport: { width: 400, height: 800 } });
  await page.goto(`${base}/panel/`);
  await page.waitForSelector(".tarjeta");
  await page.fill(".tarjeta textarea >> nth=0", "Edición sin guardar");
  await page.click("text=Programados (0)");
  await page.click("text=Borradores (1)");
  await page.waitForSelector(".tarjeta");
  assert.equal(await page.inputValue(".tarjeta textarea >> nth=0"), "Edición sin guardar");
  await page.reload();
  await page.waitForSelector(".tarjeta");
  await page.click("text=Guardar cambios");
  await page.waitForSelector("text=No hay cambios que guardar.");
  assert.equal(await page.isEnabled("text=Guardar cambios"), true);
  assert.equal(await page.isEnabled("text=Aprobar"), true);
  await page.close();
});

test("la escena y la casilla de ilustración se guardan en el post", async () => {
  const page = await navegador.newPage({ viewport: { width: 400, height: 800 } });
  await page.goto(`${base}/panel/`);
  await page.waitForSelector(".tarjeta");
  await page.fill(".tarjeta textarea >> nth=3", "Edificio de la Asamblea Nacional al atardecer");
  await page.check(".tarjeta input[type=checkbox]");
  await page.click("text=Guardar cambios");
  await page.waitForSelector("text=Generando ilustración…");
  const guardado = JSON.parse(fs.readFileSync(path.join(raiz, "posts/2026-09-07-1420-la-prensa-a1b2.json"), "utf8"));
  assert.equal(guardado.ilustracion.descripcion, "Edificio de la Asamblea Nacional al atardecer");
  assert.equal(guardado.ilustracion.usar, true);
  await page.fill(".tarjeta textarea >> nth=3", "");
  await page.click("text=Guardar cambios");
  await page.waitForFunction(() => !document.body.textContent.includes("Generando ilustración…"));
  const limpio = JSON.parse(fs.readFileSync(path.join(raiz, "posts/2026-09-07-1420-la-prensa-a1b2.json"), "utf8"));
  assert.equal(limpio.ilustracion.usar, false);
  await page.close();
});
