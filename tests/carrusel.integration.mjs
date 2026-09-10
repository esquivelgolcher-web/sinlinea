// Render real del carrusel con Chromium: cinco JPEG 1080x1350 y error claro cuando una diapositiva no cabe.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { abrirNavegador, renderizarCarrusel } from "../src/lib/render.mjs";
import { cargarConfig } from "../src/lib/config.mjs";

const cfg = { ...cargarConfig("config.json"), pages: { baseUrl: "https://prueba.github.io/sinlinea" }, marca: { nombre: "Luis Esquivel Golcher", usuario: "@luiseskivelgolcher", logoForma: "cuadrado", logoTamano: 90, colores: { principal: "#E9E4DA", acento: "#1F5FBF", oscuro: "#161616", claro: "#FFFFFF" } }, rutas: { logo: "cuentas/luiseskivelgolcher/logo.png" } };
const base = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));
let navegador;
before(async () => { navegador = await abrirNavegador(); });
after(async () => { await navegador?.close(); });

function raizTemporal() {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "carrusel-"));
  fs.mkdirSync(path.join(raiz, "templates"), { recursive: true });
  fs.mkdirSync(path.join(raiz, "assets/fonts"), { recursive: true });
  fs.copyFileSync("templates/carrusel.html", path.join(raiz, "templates/carrusel.html"));
  for (const f of fs.readdirSync("assets/fonts")) fs.copyFileSync(path.join("assets/fonts", f), path.join(raiz, "assets/fonts", f));
  fs.mkdirSync(path.join(raiz, "public/ilus"), { recursive: true });
  fs.copyFileSync("tests/fixtures/ilustracion-ejemplo.jpg", path.join(raiz, "public/ilus", `${base.id}.jpg`));
  return raiz;
}
const post = {
  ...base, formato: "carrusel", categoria: "INVESTIGACIÓN", atribucion: "Según documentos revisados por WIRED",
  ilustracion: { descripcion: "d", usar: true, ruta: `public/ilus/${base.id}.jpg`, hashDescripcion: "h", proveedor: "gemini", modelo: "m", generada: "2026-09-10T00:00:00.000Z", error: null },
  fuentes: [{ rol: "principal", medio: "WIRED", autor: "Dhruv Mehrotra", url: "https://www.wired.com/story/x/", canonica: "https://www.wired.com/story/x/" }, { rol: "referencia", medio: "AJ+", autor: null, url: "https://www.youtube.com/watch?v=1", canonica: null }],
  carrusel: { diapositivas: [
    { titulo: "¿Puede la policía reconstruir tu vida en línea con una sola foto?", texto: "Una herramienta en pruebas promete hacerlo. Esto es lo que se sabe." },
    { titulo: "Qué ocurrió", texto: "Documentos internos revisados por WIRED describen una prueba con policías de varias ciudades de Estados Unidos." },
    { titulo: "Cómo funciona", texto: "Cruza reconocimiento facial (identificar a una persona por su cara) con perfiles públicos, fotos y publicaciones antiguas." },
    { titulo: "A quién afecta", texto: "A cualquier persona con fotos en internet, aunque nunca haya sido investigada. No hace falta una orden judicial para consultar la herramienta." },
    { titulo: "Qué falta por saber", texto: "Si la herramienta se venderá, con qué límites y quién auditará su uso. La empresa no respondió a las preguntas del medio." },
    { titulo: "Cierre", texto: "El material proviene de una investigación de WIRED; este resumen es una explicación en español con enlace a la fuente." },
  ], imagenes: [] },
};

test("(carrusel) renderiza una imagen por diapositiva (JPEG 1080x1350) con portada ilustrada y cierre con fuentes", async () => {
  const raiz = raizTemporal();
  const r = await renderizarCarrusel(post, { config: cfg, navegador, raiz });
  assert.equal(r.version, 1);
  assert.equal(r.imagenes.length, 6);
  for (const img of r.imagenes) {
    const meta = await sharp(path.join(raiz, img.ruta)).metadata();
    assert.equal(meta.width, 1080); assert.equal(meta.height, 1350); assert.equal(meta.format, "jpeg");
    assert.match(img.url, new RegExp(`/img/${base.id}-0${img.numero}\\.jpg$`));
    assert.match(img.hash, /^[0-9a-f]{16}$/);
  }
  assert.match(r.hash, /^[0-9a-f]{16}$/);
  const [portada, cierre] = [r.imagenes[0], r.imagenes[5]];
  assert.ok(fs.statSync(path.join(raiz, portada.ruta)).size > 20000, "la portada lleva la ilustración de fondo");
  assert.ok(fs.statSync(path.join(raiz, cierre.ruta)).size > 5000);
});

test("(carrusel) una diapositiva con texto excesivo falla con un mensaje claro en vez de recortar en silencio", async () => {
  const raiz = raizTemporal();
  const larga = { ...post, carrusel: { diapositivas: [post.carrusel.diapositivas[0], { titulo: "Demasiado", texto: "palabra ".repeat(160).trim() }, post.carrusel.diapositivas[5]] } };
  await assert.rejects(renderizarCarrusel(larga, { config: cfg, navegador, raiz }), /diapositiva 2 no cabe.*acorta el texto/);
});
