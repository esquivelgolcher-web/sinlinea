import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { abrirNavegador, renderizarPost, construirHtml } from "../src/lib/render.mjs";
import { cargarConfig, cargarConfiguracion } from "../src/lib/config.mjs";

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
    assert.equal(img.version, 8);
    assert.match(img.hash, /^[0-9a-f]{16}$/);
  });
}

async function medir(post, { ilustracionUrl = null, config = cfg, logoUrl = "cuentas/sinlinea/logo.png" } = {}) {
  const plantilla = fs.readFileSync("templates/post.html", "utf8");
  const html = construirHtml(post, config, { plantilla, baseHref: pathToFileURL(path.resolve(".") + path.sep).href, logoUrl, ilustracionUrl });
  const rutaHtml = path.join("temp", "test-render", `medir-${Math.random().toString(16).slice(2)}.html`);
  fs.mkdirSync(path.dirname(rutaHtml), { recursive: true });
  fs.writeFileSync(rutaHtml, html);
  const page = await navegador.newPage({ viewport: { width: 1080, height: 1350 } });
  try {
    await page.goto(pathToFileURL(path.resolve(rutaHtml)).href, { waitUntil: "load" });
    await page.waitForSelector('body[data-listo="1"]', { timeout: 15000 });
    return await page.evaluate(() => {
      const r = (id) => document.getElementById(id).getBoundingClientRect();
      const t = document.getElementById("titular");
      const b = document.getElementById("bajada");
      const px = (el) => parseFloat(getComputedStyle(el).fontSize);
      return {
        error: document.body.dataset.error || null,
        titularPx: px(t), titularLineas: Math.round(t.scrollHeight / px(t)), titularTop: r("titular").top,
        bajadaPx: px(b), bajadaLineas: Math.round(b.scrollHeight / (px(b) * 1.3)),
        barraAlto: r("lema").height, logoAncho: (document.querySelector("#post .logo") || document.querySelector("#post .logo-fallback")).getBoundingClientRect().width,
        barraColor: getComputedStyle(document.getElementById("lema")).backgroundColor,
        chipColor: getComputedStyle(document.getElementById("categoria")).backgroundColor,
        pieAbajo: 1350 - r("fuente").bottom,
        fondoColor: getComputedStyle(document.getElementById("post")).backgroundColor,
        fallbackTexto: document.querySelector("#post .logo-fallback")?.textContent || null,
        fallbackColor: document.querySelector("#post .logo-fallback") ? getComputedStyle(document.querySelector("#post .logo-fallback")).backgroundColor : null,
        cuerpoIzq: r("titular").left, cuerpoDer: 1080 - r("titular").right,
      };
    });
  } finally {
    await page.close();
    fs.rmSync(rutaHtml, { force: true });
  }
}

test("un titular de 64 caracteres se ajusta entre 70 y 86 px en máximo 3 líneas sin desbordar", async () => {
  const m = await medir({ ...base, titular: "Contraloría cautela bienes por casi $50 millones tras auditorías" });
  assert.equal(m.error, null);
  assert.ok(m.titularPx >= 70 && m.titularPx <= 86, `tamaño ${m.titularPx}`);
  assert.ok(m.titularLineas <= 3, `líneas ${m.titularLineas}`);
});

test("con ilustración la mitad superior queda libre: el titular empieza por debajo del 45 % de la altura", async () => {
  const m = await medir(base, { ilustracionUrl: "tests/fixtures/ilustracion-ejemplo.jpg" });
  assert.ok(m.titularTop >= 1350 * 0.45, `titular arranca en ${m.titularTop}px`);
});

test("sin ilustración el texto se centra verticalmente entre la cabecera y el pie", async () => {
  const m = await medir(base);
  assert.ok(m.titularTop > 250 && m.titularTop < 1350 * 0.45, `titular arranca en ${m.titularTop}px`);
});

test("medidas de diseño: franja roja de 70 px, logo de 120 px, márgenes laterales de al menos 70 px, bajada entre 30 y 34 px", async () => {
  const m = await medir(base);
  assert.equal(m.barraAlto, 70);
  assert.equal(m.logoAncho, 120);
  assert.ok(m.cuerpoIzq >= 70 && m.cuerpoDer >= 70, `márgenes ${m.cuerpoIzq}/${m.cuerpoDer}`);
  assert.ok(m.bajadaPx >= 30 && m.bajadaPx <= 34, `bajada ${m.bajadaPx}px`);
  assert.ok(m.bajadaLineas <= 2);
});

test("un titular que no cabe en 3 líneas a 70 px hace fallar el render con un error identificable", async () => {
  const post = { ...base, titular: "Un titular exageradamente largo que obliga a la plantilla a reducir el tamaño de la letra varias veces hasta que quepa bien" };
  await assert.rejects(
    () => renderizarPost(post, { config: cfg, navegador, destino: path.join("temp", "test-render", "largo.jpg") }),
    (err) => err.code === "TEXTO_NO_CABE" && /titular/.test(err.message) && /3 líneas/.test(err.message),
  );
});

test("una bajada que no cabe en 2 líneas a 30 px hace fallar el render", async () => {
  const post = { ...base, bajada: "Una bajada exageradamente larga, con muchísimas palabras encadenadas, que no puede caber de ninguna manera en dos líneas de treinta píxeles aunque se reduzca al mínimo permitido" };
  await assert.rejects(
    () => renderizarPost(post, { config: cfg, navegador, destino: path.join("temp", "test-render", "bajada-larga.jpg") }),
    (err) => err.code === "TEXTO_NO_CABE" && /bajada/.test(err.message) && /2 líneas/.test(err.message),
  );
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

test("con ilustración, la variante amarilla no dibuja el anillo del logo; con rótulo configurado el rótulo se ve", async () => {
  const plantilla = fs.readFileSync("templates/post.html", "utf8");
  const conRotulo = { ...cfg, ilustraciones: { ...cfg.ilustraciones, rotulo: "Ilustración generada con IA" } };
  const html = construirHtml({ ...base, variante: "amarillo" }, conRotulo, {
    plantilla, baseHref: pathToFileURL(path.resolve(".") + path.sep).href, logoUrl: "cuentas/sinlinea/logo.png", ilustracionUrl: "tests/fixtures/ilustracion-ejemplo.jpg",
  });
  const rutaHtml = path.join("temp", "test-render", "amarillo-ilus.html");
  fs.mkdirSync(path.dirname(rutaHtml), { recursive: true });
  fs.writeFileSync(rutaHtml, html);
  const page = await navegador.newPage({ viewport: { width: 1080, height: 1350 } });
  await page.goto(pathToFileURL(path.resolve(rutaHtml)).href, { waitUntil: "load" });
  await page.waitForSelector('body[data-listo="1"]', { timeout: 15000 });
  const sombra = await page.$eval("#post .logo", (n) => getComputedStyle(n).boxShadow);
  assert.equal(await page.$eval("#rotulo", (n) => getComputedStyle(n).display), "block");
  assert.match(await page.$eval("#rotulo", (n) => n.textContent), /Ilustración generada con IA/);
  await page.close();
  assert.equal(sombra, "none");
  fs.rmSync(rutaHtml, { force: true });
});

test("(M1) si la ilustración no decodifica, el post queda tipográfico (sin clase ni rótulo)", async () => {
  const plantilla = fs.readFileSync("templates/post.html", "utf8");
  const html = construirHtml({ ...base, variante: "negro" }, cfg, {
    plantilla, baseHref: pathToFileURL(path.resolve(".") + path.sep).href, logoUrl: "cuentas/sinlinea/logo.png", ilustracionUrl: "tests/fixtures/no-existe.jpg",
  });
  const rutaHtml = path.join("temp", "test-render", "negro-ilus-rota.html");
  fs.mkdirSync(path.dirname(rutaHtml), { recursive: true });
  fs.writeFileSync(rutaHtml, html);
  const page = await navegador.newPage({ viewport: { width: 1080, height: 1350 } });
  await page.goto(pathToFileURL(path.resolve(rutaHtml)).href, { waitUntil: "load" });
  await page.waitForSelector('body[data-listo="1"]', { timeout: 15000 });
  const tieneClase = await page.$eval("#post", (n) => n.classList.contains("con-ilustracion"));
  const rotuloVisible = await page.$eval("#rotulo", (n) => getComputedStyle(n).display);
  await page.close();
  fs.rmSync(rutaHtml, { force: true });
  assert.equal(tieneClase, false);
  assert.equal(rotuloVisible, "none");
});

test("(M2) la plantilla usa los colores de la cuenta y, sin logo, un círculo con las iniciales en el color principal", async () => {
  const personal = cargarConfiguracion(".").cuentas.find((c) => c.cuenta === "luiseskivelgolcher");
  const m = await medir({ ...base, variante: "negro" }, { config: personal, logoUrl: null });
  assert.equal(m.error, null);
  assert.equal(m.chipColor, "rgb(31, 95, 191)", "la categoría usa el acento de la cuenta (#1F5FBF)");
  assert.equal(m.barraAlto, 0, "sin lema no se dibuja la franja inferior");
  assert.ok(m.pieAbajo < 40, `el pie baja al borde cuando no hay franja (queda a ${m.pieAbajo}px)`);
  assert.equal(m.fondoColor, "rgb(22, 22, 22)", "el fondo negro usa el oscuro de la cuenta (#161616)");
  assert.equal(m.fallbackTexto, "LEG");
  assert.equal(m.fallbackColor, "rgb(233, 228, 218)", "el círculo usa el principal (#E9E4DA)");
  const sl = await medir({ ...base, variante: "negro" });
  assert.equal(sl.barraColor, "rgb(227, 6, 19)", "Sin Línea conserva su rojo");
});

test("(M2) renderizarPost devuelve imagen.estilo y difiere entre cuentas", async () => {
  const personal = cargarConfiguracion(".").cuentas.find((c) => c.cuenta === "luiseskivelgolcher");
  const a = await renderizarPost(base, { config: cfg, navegador, destino: path.join("temp", "test-render", "estilo-sl.jpg") });
  const b = await renderizarPost({ ...base, cuenta: "luiseskivelgolcher" }, { config: personal, navegador, destino: path.join("temp", "test-render", "estilo-leg.jpg") });
  assert.match(a.estilo, /^[0-9a-f]{16}$/);
  assert.notEqual(a.estilo, b.estilo);
});

test("(rótulo) con rotulo vacío no se dibuja ningún rótulo aunque haya ilustración", async () => {
  const sinRotulo = { ...cfg, ilustraciones: { ...cfg.ilustraciones, rotulo: "" } };
  const plantilla = fs.readFileSync("templates/post.html", "utf8");
  const html = construirHtml(base, sinRotulo, { plantilla, baseHref: pathToFileURL(path.resolve(".") + path.sep).href, logoUrl: "cuentas/sinlinea/logo.png", ilustracionUrl: "tests/fixtures/ilustracion-ejemplo.jpg" });
  const rutaHtml = path.join("temp", "test-render", "sin-rotulo.html");
  fs.mkdirSync(path.dirname(rutaHtml), { recursive: true });
  fs.writeFileSync(rutaHtml, html);
  const page = await navegador.newPage({ viewport: { width: 1080, height: 1350 } });
  try {
    await page.goto(pathToFileURL(path.resolve(rutaHtml)).href, { waitUntil: "load" });
    await page.waitForSelector('body[data-listo="1"]', { timeout: 15000 });
    assert.equal(await page.$eval("#post", (n) => n.classList.contains("con-ilustracion")), true, "la ilustración sí se usa");
    assert.equal(await page.$eval("#rotulo", (n) => getComputedStyle(n).display), "none");
    assert.equal(await page.$eval("#rotulo", (n) => n.textContent), "");
  } finally {
    await page.close();
    fs.rmSync(rutaHtml, { force: true });
  }
});
