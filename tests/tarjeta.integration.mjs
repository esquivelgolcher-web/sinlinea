// Render real con Chromium de las plantillas dato y titular (templates/tarjeta.html): JPEG 1080x1350, huella y versión
// propias, render determinista, error claro cuando el texto no cabe, y la foto de siempre intacta.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { pathToFileURL } from "node:url";
import { abrirNavegador, renderizarPost, construirHtmlTarjeta, RUTA_PLANTILLA, RUTA_PLANTILLA_TARJETA, versionPlantilla } from "../src/lib/render.mjs";
import { cargarConfig } from "../src/lib/config.mjs";
import { hashImagen } from "../src/lib/estados.mjs";

const cfg = { ...cargarConfig("config.json"), pages: { baseUrl: "https://prueba.github.io/sinlinea" } };
const base = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));
let navegador;
before(async () => { navegador = await abrirNavegador(); });
after(async () => { await navegador?.close(); });

function raizTemporal() {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "tarjeta-"));
  fs.mkdirSync(path.join(raiz, "templates"), { recursive: true });
  fs.mkdirSync(path.join(raiz, "assets/fonts"), { recursive: true });
  for (const t of [RUTA_PLANTILLA, RUTA_PLANTILLA_TARJETA]) fs.copyFileSync(t, path.join(raiz, t));
  for (const f of fs.readdirSync("assets/fonts")) fs.copyFileSync(path.join("assets/fonts", f), path.join(raiz, "assets/fonts", f));
  return raiz;
}

const dato = { ...base, plantilla: "dato", categoria: "SOCIEDAD", titular: "47% de hogares comió menos de 3 veces al día", bajada: "Encuesta de la CCIAP.", dato: { cifra: "47%", frase: "de los hogares comió menos de 3 veces al día por falta de dinero" } };
const titular = { ...base, plantilla: "titular", categoria: "POLÍTICA", titular: "Mulino veta artículos del reglamento de la Asamblea", bajada: "Objetó nueve artículos por inconstitucionales, incluido uno sobre ausencias de diputados." };

test("(tarjeta) dato y titular se dibujan con su plantilla propia: JPEG 1080x1350, versión y huella de la tarjeta", async () => {
  const raiz = raizTemporal();
  const version = versionPlantilla(fs.readFileSync(RUTA_PLANTILLA_TARJETA, "utf8"));
  for (const [nombre, post] of [["dato", dato], ["titular", titular]]) {
    const imagen = await renderizarPost(post, { config: cfg, navegador, raiz, destino: `public/img/${nombre}.jpg` });
    const meta = await sharp(path.join(raiz, imagen.ruta)).metadata();
    assert.equal(meta.width, 1080, nombre);
    assert.equal(meta.height, 1350, nombre);
    assert.equal(meta.format, "jpeg", nombre);
    assert.equal(imagen.version, version, `${nombre}: la versión es la de la tarjeta, no la del post`);
    assert.equal(imagen.hash, hashImagen(post, version));
    fs.copyFileSync(path.join(raiz, imagen.ruta), path.join("temp", `preview-tarjeta-${nombre}.jpg`));
  }
});

test("(tarjeta) la misma pieza da siempre la misma imagen, y dato y titular no se parecen entre sí ni a la foto", async () => {
  const raiz = raizTemporal();
  const a = await renderizarPost(titular, { config: cfg, navegador, raiz, destino: "public/img/a.jpg" });
  const b = await renderizarPost(titular, { config: cfg, navegador, raiz, destino: "public/img/b.jpg" });
  assert.deepEqual(fs.readFileSync(path.join(raiz, a.ruta)), fs.readFileSync(path.join(raiz, b.ruta)), "render determinista: aprobar una imagen no se invalida sola");
  const d = await renderizarPost(dato, { config: cfg, navegador, raiz, destino: "public/img/d.jpg" });
  const f = await renderizarPost({ ...titular, plantilla: "foto" }, { config: cfg, navegador, raiz, destino: "public/img/f.jpg" });
  const bytes = [a, d, f].map((x) => fs.readFileSync(path.join(raiz, x.ruta)).toString("base64"));
  assert.equal(new Set(bytes).size, 3);
  assert.equal(f.version, versionPlantilla(fs.readFileSync(RUTA_PLANTILLA, "utf8")), "la foto sigue usando templates/post.html");
});

test("(tarjeta) si el texto no cabe, error TEXTO_NO_CABE con el campo y un mensaje de la tarjeta", async () => {
  const raiz = raizTemporal();
  const largo = { ...titular, titular: "Palabras ".repeat(40).trim() };
  await assert.rejects(renderizarPost(largo, { config: cfg, navegador, raiz }), (e) => e.code === "TEXTO_NO_CABE" && e.campo === "titular" && /tarjeta/.test(e.message));
  const cifraLarga = { ...dato, dato: { cifra: "$1,234,567,890", frase: "palabras ".repeat(30).trim() } };
  await assert.rejects(renderizarPost(cifraLarga, { config: cfg, navegador, raiz }), (e) => e.code === "TEXTO_NO_CABE" && e.campo === "dato");
});

// Mide la tarjeta ya ajustada: el bloque de texto queda entre la cabecera y el pie, sin pisar ninguno.
async function medir(post) {
  const raiz = raizTemporal();
  const html = construirHtmlTarjeta(post, cfg, { plantilla: fs.readFileSync(RUTA_PLANTILLA_TARJETA, "utf8"), baseHref: pathToFileURL(raiz + path.sep).href, logoUrl: null });
  const ruta = path.join(raiz, "medir.html");
  fs.writeFileSync(ruta, html);
  const page = await navegador.newPage({ viewport: { width: 1080, height: 1350 } });
  try {
    await page.goto(pathToFileURL(ruta).href);
    await page.waitForSelector('body[data-listo="1"]');
    return await page.evaluate(() => {
      const bloque = document.querySelector(document.getElementById("tarjeta").dataset.plantilla === "dato" ? ".dato-bloque" : ".titular-bloque").getBoundingClientRect();
      return { cabecera: document.querySelector(".cabecera").getBoundingClientRect().bottom, arriba: bloque.top, abajo: bloque.bottom, pie: document.querySelector(".pie").getBoundingClientRect().top, error: document.body.dataset.error || "" };
    });
  } finally {
    await page.close();
  }
}

test("(tarjeta) el texto nunca pisa la cabecera ni el pie, aunque el titular ocupe cinco líneas", async () => {
  for (const post of [titular, dato, { ...titular, titular: "Antai admite que no puede investigar nepotismo en la Asamblea" }]) {
    const m = await medir(post);
    assert.equal(m.error, "", post.titular);
    assert.ok(m.arriba >= m.cabecera + 20, `${post.titular}: el bloque empieza en ${m.arriba} y la cabecera acaba en ${m.cabecera}`);
    assert.ok(m.abajo <= m.pie, `${post.titular}: el bloque acaba en ${m.abajo} y el pie empieza en ${m.pie}`);
  }
});
