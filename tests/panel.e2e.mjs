import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { crearServidor } from "../src/serve.mjs";
import { raizConCuentas } from "./ayuda/cuentas.mjs";

let servidor, base, raiz, navegador;
before(async () => {
  raiz = raizConCuentas({ cuentas: ["sinlinea"], prefijo: "e2e-" });
  for (const d of ["posts", "data", "templates", "panel", "src/lib", "public/img", "assets", "tests/fixtures"]) fs.mkdirSync(path.join(raiz, d), { recursive: true });
  fs.copyFileSync("templates/post.html", path.join(raiz, "templates/post.html"));
  fs.copyFileSync("tests/fixtures/post-ejemplo.json", path.join(raiz, "tests/fixtures/post-ejemplo.json"));
  fs.copyFileSync("tests/fixtures/post-ejemplo.json", path.join(raiz, "posts/2026-09-07-1420-la-prensa-a1b2.json"));
  fs.writeFileSync(path.join(raiz, "data/sinlinea/token-info.json"), '{ "vence": "2026-11-01" }');
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
  await page.uncheck(".tarjeta input[type=checkbox]");
  await page.click("text=Guardar cambios");
  await page.waitForFunction(() => !document.body.textContent.includes("Generando ilustración…"));
  const limpio = JSON.parse(fs.readFileSync(path.join(raiz, "posts/2026-09-07-1420-la-prensa-a1b2.json"), "utf8"));
  assert.equal(limpio.ilustracion.usar, false);
  assert.equal(limpio.ilustracion.descripcion, "Edificio de la Asamblea Nacional al atardecer", "desmarcar la casilla conserva la escena");
  await page.close();
});

test("el panel se niega a guardar un titular de más de 65 caracteres y muestra el contador de titular y bajada", async () => {
  const page = await navegador.newPage({ viewport: { width: 400, height: 800 } });
  await page.goto(`${base}/panel/`);
  await page.waitForSelector(".tarjeta");
  const antes = fs.readFileSync(path.join(raiz, "posts/2026-09-07-1420-la-prensa-a1b2.json"), "utf8");
  assert.match(await page.textContent(".tarjeta .contador"), /Titular \d+\/65/);
  assert.match(await page.textContent(".tarjeta .contador"), /Bajada \d+\/110/);
  await page.fill(".tarjeta textarea >> nth=0", "T".repeat(70));
  await page.click("text=Guardar cambios");
  await page.waitForSelector("#aviso:not([hidden])");
  assert.match(await page.textContent("#aviso"), /70 caracteres.*65/);
  assert.equal(fs.readFileSync(path.join(raiz, "posts/2026-09-07-1420-la-prensa-a1b2.json"), "utf8"), antes);
  await page.close();
});

test("Regenerar ilustración con la escena vacía guarda usar=true sin escena y muestra el chip de Claude", async () => {
  const page = await navegador.newPage({ viewport: { width: 400, height: 800 } });
  await page.goto(`${base}/panel/`);
  await page.waitForSelector(".tarjeta");
  await page.fill(".tarjeta textarea >> nth=3", "");
  await page.click("text=Regenerar ilustración");
  await page.waitForSelector("text=Claude redacta la escena");
  assert.match(await page.textContent(".tarjeta"), /Generando ilustración… \(Claude redacta la escena\)/);
  assert.equal(await page.isChecked(".tarjeta input[type=checkbox]"), true, "la casilla Usar queda marcada");
  const guardado = JSON.parse(fs.readFileSync(path.join(raiz, "posts/2026-09-07-1420-la-prensa-a1b2.json"), "utf8"));
  assert.equal(guardado.ilustracion.usar, true);
  assert.equal(guardado.ilustracion.descripcion, "");
  assert.equal(guardado.ilustracion.hashDescripcion, null);
  await page.close();
});

test("con imagen previa y escena borrada, el chip también dice que Claude redacta la escena", async () => {
  const f = path.join(raiz, "posts/2026-09-07-1420-la-prensa-a1b2.json");
  const p = JSON.parse(fs.readFileSync(f, "utf8"));
  p.ilustracion = { descripcion: "", usar: true, ruta: "public/ilus/x.jpg", hashDescripcion: null, proveedor: "gemini", modelo: "m", generada: p.creado, error: null };
  fs.writeFileSync(f, JSON.stringify(p, null, 2) + "\n");
  const page = await navegador.newPage({ viewport: { width: 400, height: 800 } });
  await page.goto(`${base}/panel/`);
  await page.waitForSelector(".tarjeta");
  assert.match(await page.textContent(".tarjeta"), /Regenerando ilustración… \(Claude redacta la escena\)/);
  await page.close();
});

test("(M1) con una sola cuenta el selector no se muestra", async () => {
  const page = await navegador.newPage({ viewport: { width: 400, height: 800 } });
  await page.goto(`${base}/panel/`);
  await page.waitForSelector(".tarjeta");
  assert.equal(await page.isHidden("#cuentas"), true);
  await page.close();
});

test("(M1) con dos cuentas el selector filtra las tarjetas, cuenta por cuenta, recuerda la elección y usa las franjas de la cuenta", async () => {
  const raiz2 = raizConCuentas({ cuentas: ["sinlinea", "prueba"], prefijo: "e2e2-" });
  for (const d of ["templates", "panel", "src/lib", "public/img", "assets", "tests/fixtures"]) fs.mkdirSync(path.join(raiz2, d), { recursive: true });
  fs.copyFileSync("templates/post.html", path.join(raiz2, "templates/post.html"));
  fs.copyFileSync("tests/fixtures/post-ejemplo.json", path.join(raiz2, "tests/fixtures/post-ejemplo.json"));
  for (const f of fs.readdirSync("panel")) fs.copyFileSync(path.join("panel", f), path.join(raiz2, "panel", f));
  for (const f of fs.readdirSync("src/lib")) fs.copyFileSync(path.join("src/lib", f), path.join(raiz2, "src/lib", f));
  const base0 = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));
  const antiguo = { ...base0, id: base0.id.slice(0, -4) + "a001", titular: "Post antiguo sin cuenta" };
  const dePrueba = { ...base0, id: base0.id.slice(0, -4) + "a002", cuenta: "prueba", titular: "Post de la cuenta de prueba" };
  for (const p of [antiguo, dePrueba]) fs.writeFileSync(path.join(raiz2, "posts", `${p.id}.json`), JSON.stringify(p, null, 2));
  fs.writeFileSync(path.join(raiz2, "data/sinlinea/token-info.json"), '{ "vence": "2026-11-01" }');
  const servidor2 = crearServidor({ raiz: raiz2 });
  await new Promise((r) => servidor2.listen(0, "127.0.0.1", r));
  const base2 = `http://127.0.0.1:${servidor2.address().port}`;
  const page = await navegador.newPage({ viewport: { width: 400, height: 800 } });
  try {
    await page.goto(`${base2}/panel/`);
    await page.waitForSelector(".tarjeta");
    assert.equal(await page.isVisible("#cuentas"), true);
    assert.match(await page.textContent("#cuentas"), /Sin Línea/);
    assert.match(await page.textContent("#cuentas"), /Cuenta de prueba/);
    assert.match(await page.textContent("#pestanas"), /Borradores \(1\)/);
    assert.equal(await page.inputValue(".tarjeta textarea >> nth=0"), "Post antiguo sin cuenta", "sin cuenta → cuenta principal");
    await page.click("#cuentas >> text=Cuenta de prueba");
    await page.waitForFunction(() => document.querySelector(".tarjeta textarea")?.value === "Post de la cuenta de prueba");
    assert.equal(await page.locator(".tarjeta").count(), 1);
    await page.click("text=Aprobar");
    await page.waitForSelector("dialog[open]");
    assert.match(await page.inputValue("#hora-hora"), /^(08:00|13:00|18:00)$/, "franjas de la cuenta de prueba");
    await page.click("dialog[open] >> text=Cancelar");
    await page.reload();
    await page.waitForFunction(() => document.querySelector(".tarjeta textarea")?.value === "Post de la cuenta de prueba");
    assert.match(await page.$eval("#cuentas button.activa", (n) => n.textContent), /Cuenta de prueba/, "recuerda la cuenta elegida");
  } finally {
    await page.close();
    servidor2.close();
  }
});

test("(M2) la cuenta personal aparece en el selector y muestra la nota de automatización apagada", async () => {
  const raiz3 = raizConCuentas({ cuentas: ["sinlinea", "luiseskivelgolcher"], prefijo: "e2e3-" });
  for (const d of ["templates", "panel", "src/lib", "public/img", "assets", "tests/fixtures"]) fs.mkdirSync(path.join(raiz3, d), { recursive: true });
  fs.copyFileSync("templates/post.html", path.join(raiz3, "templates/post.html"));
  fs.copyFileSync("tests/fixtures/post-ejemplo.json", path.join(raiz3, "tests/fixtures/post-ejemplo.json"));
  for (const f of fs.readdirSync("panel")) fs.copyFileSync(path.join("panel", f), path.join(raiz3, "panel", f));
  for (const f of fs.readdirSync("src/lib")) fs.copyFileSync(path.join("src/lib", f), path.join(raiz3, "src/lib", f));
  const base0 = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));
  fs.writeFileSync(path.join(raiz3, "posts", `${base0.id}.json`), JSON.stringify(base0, null, 2));
  fs.writeFileSync(path.join(raiz3, "data/sinlinea/token-info.json"), '{ "vence": "2026-11-01" }');
  const servidor3 = crearServidor({ raiz: raiz3 });
  await new Promise((r) => servidor3.listen(0, "127.0.0.1", r));
  const base3 = `http://127.0.0.1:${servidor3.address().port}`;
  const page = await navegador.newPage({ viewport: { width: 400, height: 800 } });
  try {
    await page.goto(`${base3}/panel/`);
    await page.waitForSelector(".tarjeta");
    assert.equal(await page.isHidden("#nota-cuenta"), true, "Sin Línea no muestra la nota");
    await page.click("#cuentas >> text=Luis Eskivel Golcher");
    await page.waitForSelector("#nota-cuenta:not([hidden])");
    assert.match(await page.textContent("#nota-cuenta"), /desactivad/i);
    assert.match(await page.textContent("#pestanas"), /Borradores \(0\)/);
  } finally {
    await page.close();
    servidor3.close();
  }
});
