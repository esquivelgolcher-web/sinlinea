// Render real con Chromium de la glosa de La Garza (templates/garza.html): JPEG 1080x1350 con el personaje, el globo con
// los cuatro versos en una línea cada uno, la noticia que comenta y la placa; render determinista; error claro si un
// verso no cabe; y sin dibujo del personaje la tarjeta sigue saliendo (solo el globo).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { pathToFileURL } from "node:url";
import { abrirNavegador, renderizarGlosa, renderizarPieza, construirHtmlGlosa, RUTA_PLANTILLA_GARZA } from "../src/lib/render.mjs";
import { cargarConfiguracion } from "../src/lib/config.mjs";
import { crearPostGlosa } from "../src/lib/glosas.mjs";
import { hashImagen } from "../src/lib/estados.mjs";

const base = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));
const cuenta = cargarConfiguracion(".").cuentas.find((c) => c.cuenta === "sinlinea");
const cfg = { ...cuenta, pages: { baseUrl: "https://prueba.github.io/sinlinea" }, glosas: { ...cuenta.glosas, activo: true, hashtags: ["#Glosa"], personaje: { nombre: "La Garza María", cargo: "Comentarista del Palacio" } } };
let navegador;
before(async () => { navegador = await abrirNavegador(); });
after(async () => { await navegador?.close(); });

function raizTemporal({ conPersonaje = true } = {}) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "garza-"));
  fs.mkdirSync(path.join(raiz, "templates"), { recursive: true });
  fs.mkdirSync(path.join(raiz, "assets/fonts"), { recursive: true });
  fs.mkdirSync(path.join(raiz, "cuentas/sinlinea"), { recursive: true });
  fs.copyFileSync(RUTA_PLANTILLA_GARZA, path.join(raiz, RUTA_PLANTILLA_GARZA));
  for (const f of fs.readdirSync("assets/fonts")) fs.copyFileSync(path.join("assets/fonts", f), path.join(raiz, "assets/fonts", f));
  fs.copyFileSync("cuentas/sinlinea/logo.png", path.join(raiz, "cuentas/sinlinea/logo.png"));
  if (conPersonaje) fs.copyFileSync("cuentas/sinlinea/garza.png", path.join(raiz, "cuentas/sinlinea/garza.png"));
  return raiz;
}
const ahora = new Date("2026-09-25T16:00:00.000Z");
const noticia = { ...base, id: base.id.slice(0, -4) + "a001", cuenta: "sinlinea", titular: "Ministerios gastan $1.5 millones en alquiler de camionetas", categoria: "POLÍTICA", fuente: { medio: "La Prensa", url: "https://www.prensa.com/politica/camionetas/", titulo: "Camionetas", publicado: "2026-09-21T10:00:00.000Z" } };
const versos = ["Trece ministerios andan", "en camioneta alquilada;", "el pueblo a pie, sin más nada,", "pagando lo que ellos mandan."];
const pieza = () => crearPostGlosa({ versos, sobre: noticia, config: cfg, ahora, zona: "America/Panama", cuenta: "sinlinea" });

test("(garza) la glosa se dibuja con su plantilla: JPEG 1080x1350, versión y huella propias, y renderizarPieza la enruta", async () => {
  const raiz = raizTemporal();
  const post = pieza();
  const imagen = await renderizarGlosa(post, { config: cfg, navegador, raiz });
  const archivo = path.join(raiz, imagen.ruta);
  const meta = await sharp(archivo).metadata();
  assert.equal(meta.width, 1080); assert.equal(meta.height, 1350); assert.equal(meta.format, "jpeg");
  assert.equal(imagen.ruta, `public/img/${post.id}.jpg`);
  assert.equal(imagen.hash, hashImagen(post, imagen.version));
  assert.equal(typeof imagen.estilo, "string");
  fs.copyFileSync(archivo, path.join("temp", "preview-garza.jpg"));
  const otra = await renderizarPieza(post, { config: cfg, navegador, raiz, destino: "public/img/otra.jpg" });
  assert.equal(otra.version, imagen.version);
});

test("(garza) la misma pieza da siempre la misma imagen; sin el dibujo del personaje la tarjeta sale igual de válida", async () => {
  const raiz = raizTemporal();
  const post = pieza();
  const a = await renderizarGlosa(post, { config: cfg, navegador, raiz, destino: "public/img/a.jpg" });
  const b = await renderizarGlosa(post, { config: cfg, navegador, raiz, destino: "public/img/b.jpg" });
  assert.deepEqual(fs.readFileSync(path.join(raiz, a.ruta)), fs.readFileSync(path.join(raiz, b.ruta)));
  const sinDibujo = raizTemporal({ conPersonaje: false });
  const c = await renderizarGlosa(post, { config: cfg, navegador, raiz: sinDibujo });
  assert.ok(fs.existsSync(path.join(sinDibujo, c.ruta)));
  assert.notEqual(c.estilo, a.estilo, "el sello cambia con el personaje: al añadir el dibujo se redibuja");
});

test("(garza) en la imagen: cuatro versos en una línea cada uno, el globo no pisa el logo, y el personaje y la placa quedan sobre el pie", async () => {
  const raiz = raizTemporal();
  const html = construirHtmlGlosa(pieza(), cfg, { plantilla: fs.readFileSync(RUTA_PLANTILLA_GARZA, "utf8"), baseHref: pathToFileURL(raiz + path.sep).href, logoUrl: "cuentas/sinlinea/logo.png", personajeUrl: "cuentas/sinlinea/garza.png" });
  const ruta = path.join(raiz, "medir.html");
  fs.writeFileSync(ruta, html);
  const page = await navegador.newPage({ viewport: { width: 1080, height: 1350 } });
  try {
    await page.goto(pathToFileURL(ruta).href);
    await page.waitForSelector('body[data-listo="1"]');
    const m = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      const versos = [...document.querySelectorAll(".verso")].map((v) => ({ lineas: Math.round(v.getBoundingClientRect().height / (parseFloat(getComputedStyle(v).fontSize) * 1.3)), texto: v.textContent }));
      return { versos, globoTop: r(".globo").top, logoBottom: r(".logo").bottom, personajeBottom: r(".personaje").bottom, placaBottom: r(".placa").bottom, pieTop: r(".pie").top, sobreTop: r(".sobre").top, globoBottom: r(".globo").bottom, error: document.body.dataset.error || "" };
    });
    assert.equal(m.error, "");
    assert.equal(m.versos.length, 4);
    for (const v of m.versos) assert.equal(v.lineas, 1, `"${v.texto}" ocupa ${v.lineas} líneas`);
    assert.ok(m.globoTop >= m.logoBottom + 20, "el globo empieza debajo del logo");
    assert.ok(m.sobreTop > m.globoBottom, "la noticia cuelga debajo del globo");
    assert.ok(m.personajeBottom <= m.pieTop + 1 && m.placaBottom <= m.pieTop, "personaje y placa quedan sobre el pie");
  } finally {
    await page.close();
  }
});

test("(garza) un verso que no cabe ni a 48 px falla con TEXTO_NO_CABE (campo glosa)", async () => {
  const raiz = raizTemporal();
  const post = { ...pieza(), glosa: { versos: ["Palabrasinespaciosmuylarguísimaquenocabe", ...versos.slice(1)], esquema: "ABBA", sobre: { id: noticia.id, titular: noticia.titular } } };
  await assert.rejects(renderizarGlosa(post, { config: cfg, navegador, raiz }), (e) => e.code === "TEXTO_NO_CABE" && e.campo === "glosa" && /verso/.test(e.message));
});
