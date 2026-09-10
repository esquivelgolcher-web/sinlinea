import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { diapositivasDe, datosDeDiapositiva, construirHtmlCarrusel, hashCarrusel, RUTA_PLANTILLA_CARRUSEL, versionPlantilla } from "../src/lib/render.mjs";
import { cargarConfig } from "../src/lib/config.mjs";

const cfg = { ...cargarConfig("config.json"), marca: { nombre: "Luis Esquivel Golcher", usuario: "@luiseskivelgolcher", logoForma: "cuadrado", logoTamano: 90, colores: { principal: "#E9E4DA", acento: "#1F5FBF", oscuro: "#161616", claro: "#FFFFFF" } } };
const base = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));
const post = {
  ...base, formato: "carrusel", atribucion: "Según documentos revisados por WIRED",
  fuentes: [{ rol: "principal", medio: "WIRED", autor: "Dhruv Mehrotra", url: "https://www.wired.com/story/x/?utm_source=rss", canonica: "https://www.wired.com/story/x/" }, { rol: "referencia", medio: "AJ+", autor: null, url: "https://www.youtube.com/watch?v=1", canonica: null }],
  carrusel: { diapositivas: [
    { titulo: "¿Puede la policía reconstruir tu vida en línea con una foto?", texto: "Una herramienta en pruebas promete hacerlo." },
    { titulo: "Qué ocurrió", texto: "Documentos internos describen la prueba." },
    { titulo: "Cómo funciona", texto: "Cruza reconocimiento facial con perfiles públicos." },
    { titulo: "A quién afecta", texto: "A cualquiera con fotos en internet." },
    { titulo: "Cierre", texto: "Falta saber si se comercializará." },
  ], imagenes: [] },
};

test("(carrusel) las diapositivas se tipan: portada, contenido numerado y cierre con las fuentes (medio, autor y URL canónica)", () => {
  const d = diapositivasDe(post);
  assert.deepEqual(d.map((x) => x.tipo), ["portada", "contenido", "contenido", "contenido", "cierre"]);
  assert.deepEqual(d.map((x) => `${x.numero}/${x.total}`), ["1/5", "2/5", "3/5", "4/5", "5/5"]);
  assert.equal(d[1].etiqueta, "1 de 3");
  assert.deepEqual(d[4].fuentes, ["WIRED (Dhruv Mehrotra) · https://www.wired.com/story/x/", "AJ+ · https://www.youtube.com/watch?v=1"]);
  assert.deepEqual(d[0].fuentes, []);
  assert.deepEqual(diapositivasDe({ ...post, carrusel: { diapositivas: [post.carrusel.diapositivas[0]] } }).map((x) => x.tipo), ["portada"]);
});

test("(carrusel) los datos de cada diapositiva llevan la identidad de la cuenta, la categoría y la atribución; la ilustración solo va en la portada", () => {
  const portada = datosDeDiapositiva(post, cfg, 0, { logoUrl: "cuentas/x/logo.png", ilustracionUrl: "public/ilus/x.jpg" });
  assert.equal(portada.tipo, "portada");
  assert.equal(portada.ilustracionUrl, "public/ilus/x.jpg");
  assert.equal(portada.usuario, "@luiseskivelgolcher");
  assert.equal(portada.categoria, base.categoria);
  assert.equal(portada.atribucion, "Según documentos revisados por WIRED");
  assert.deepEqual(portada.colores, cfg.marca.colores);
  assert.equal(portada.logoForma, "cuadrado");
  const cierre = datosDeDiapositiva(post, cfg, 4, { logoUrl: null, ilustracionUrl: "public/ilus/x.jpg" });
  assert.equal(cierre.ilustracionUrl, null);
  assert.equal(cierre.fuentes.length, 2);
  assert.equal(cierre.iniciales, "LEG");
  assert.throws(() => datosDeDiapositiva(post, cfg, 9, { logoUrl: null }), /diapositiva 10/);
});

test("(carrusel) el HTML incrusta los datos en la plantilla versionada y la huella cambia con el texto, la atribución o las fuentes", () => {
  const plantilla = fs.readFileSync(RUTA_PLANTILLA_CARRUSEL, "utf8");
  assert.equal(versionPlantilla(plantilla), 1);
  const html = construirHtmlCarrusel(post, cfg, 2, { plantilla, baseHref: "file:///base/", logoUrl: null });
  assert.match(html, /<base href="file:\/\/\/base\/">/);
  assert.match(html, /"titulo":"Cómo funciona"/);
  assert.match(html, /"numero":3/);
  const h = hashCarrusel(post, 1);
  assert.match(h, /^[0-9a-f]{16}$/);
  assert.equal(hashCarrusel(post, 1), h);
  assert.notEqual(hashCarrusel({ ...post, carrusel: { diapositivas: [...post.carrusel.diapositivas.slice(0, 4), { titulo: "Cierre", texto: "otro" }] } }, 1), h);
  assert.notEqual(hashCarrusel({ ...post, atribucion: "Otra" }, 1), h);
  assert.notEqual(hashCarrusel(post, 2), h);
});

test("(carrusel) la nota de la diapositiva de cierre sale solo si la cuenta configura un rótulo de ilustración", () => {
  const conRotulo = { ...cfg, ilustraciones: { ...cfg.ilustraciones, rotulo: "Ilustración generada con IA" } };
  assert.equal(datosDeDiapositiva(post, conRotulo, 4, { logoUrl: null }).nota, "Ilustración generada con IA en la portada");
  const sinRotulo = { ...cfg, ilustraciones: { ...cfg.ilustraciones, rotulo: "" } };
  assert.equal(datosDeDiapositiva(post, sinRotulo, 4, { logoUrl: null }).nota, "");
});
