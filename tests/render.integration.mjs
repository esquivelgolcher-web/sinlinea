import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { abrirNavegador, renderizarPost, construirHtml } from "../src/lib/render.mjs";
import { cargarConfig } from "../src/lib/config.mjs";

const cfg = cargarConfig("config.json");
const base = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));
let navegador;
before(async () => { navegador = await abrirNavegador(); });
after(async () => { await navegador?.close(); });

for (const variante of ["negro", "amarillo", "rojo"]) {
  test(`renderiza la variante ${variante} como JPEG 1080x1350 menor a 1 MB`, async () => {
    const post = { ...base, variante };
    const destino = path.join("temp", "test-render", `${variante}.jpg`);
    const img = await renderizarPost(post, { config: cfg, navegador, destino });
    const meta = await sharp(img.ruta).metadata();
    assert.equal(meta.format, "jpeg");
    assert.equal(meta.width, 1080);
    assert.equal(meta.height, 1350);
    assert.ok(fs.statSync(img.ruta).size < 1024 * 1024);
    assert.equal(img.version, 6);
    assert.match(img.hash, /^[0-9a-f]{16}$/);
  });
}

test("un titular muy largo se reduce pero no desborda (no lanza)", async () => {
  const post = { ...base, titular: "Un titular exageradamente largo que obliga a la plantilla a reducir el tamaño de la letra varias veces hasta que quepa bien" };
  const img = await renderizarPost(post, { config: cfg, navegador, destino: path.join("temp", "test-render", "largo.jpg") });
  assert.ok(fs.existsSync(img.ruta));
});

test("renderiza con ilustración de fondo cuando usar=true y el archivo existe", async () => {
  const post = { ...base, ilustracion: { descripcion: "Canal", usar: true, ruta: "tests/fixtures/ilustracion-ejemplo.jpg", hashDescripcion: "0000000000000000", proveedor: "gemini", modelo: "x", generada: base.creado, error: null } };
  const img = await renderizarPost(post, { config: cfg, navegador, destino: path.join("temp", "test-render", "ilustracion.jpg") });
  const meta = await sharp(img.ruta).metadata();
  assert.equal(meta.width, 1080);
  const stats = await sharp(img.ruta).stats();
  assert.ok(stats.channels[2].mean > 25, "el fondo debe tener el azul de la fixture, no negro puro");
  assert.notEqual(img.hash, (await renderizarPost({ ...post, ilustracion: { ...post.ilustracion, usar: false } }, { config: cfg, navegador, destino: path.join("temp", "test-render", "sin-ilustracion.jpg") })).hash);
});

test("con ilustración, la variante amarilla no dibuja el anillo del logo", async () => {
  const plantilla = fs.readFileSync("templates/post.html", "utf8");
  const html = construirHtml({ ...base, variante: "amarillo" }, cfg, {
    plantilla, baseHref: pathToFileURL(path.resolve(".") + path.sep).href, logoUrl: "assets/logo.png", ilustracionUrl: "tests/fixtures/ilustracion-ejemplo.jpg",
  });
  const rutaHtml = path.join("temp", "test-render", "amarillo-ilus.html");
  fs.mkdirSync(path.dirname(rutaHtml), { recursive: true });
  fs.writeFileSync(rutaHtml, html);
  const page = await navegador.newPage({ viewport: { width: 1080, height: 1350 } });
  await page.goto(pathToFileURL(path.resolve(rutaHtml)).href, { waitUntil: "load" });
  await page.waitForSelector('body[data-listo="1"]', { timeout: 15000 });
  const sombra = await page.$eval("#post .logo", (n) => getComputedStyle(n).boxShadow);
  await page.close();
  assert.equal(sombra, "none");
});
