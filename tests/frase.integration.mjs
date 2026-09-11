// Render real de una frase célebre con Chromium: JPEG 1080x1350 con la plantilla templates/frase.html y error claro
// cuando la frase no cabe.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { abrirNavegador, renderizarFrase, RUTA_PLANTILLA_FRASE } from "../src/lib/render.mjs";
import { cargarConfig } from "../src/lib/config.mjs";
import { crearPostFrase } from "../src/lib/frases.mjs";
import { hashImagen } from "../src/lib/estados.mjs";

const cfg = { ...cargarConfig("config.json"), pages: { baseUrl: "https://prueba.github.io/sinlinea" }, zonaHoraria: "America/New_York", idioma: "en",
  marca: { nombre: "Leo Pope", usuario: "@leopopexiv", logoForma: "circulo", logoTamano: 96, colores: { principal: "#500014", acento: "#C8A45D", oscuro: "#202020", claro: "#F5F0E6" } },
  frases: { activo: true, porDia: 1, categoria: "CULTURA", hashtags: ["#Vatican"], banco: [] } };
let navegador;
before(async () => { navegador = await abrirNavegador(); });
after(async () => { await navegador?.close(); });

function raizTemporal() {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "frase-"));
  fs.mkdirSync(path.join(raiz, "templates"), { recursive: true });
  fs.mkdirSync(path.join(raiz, "assets/fonts"), { recursive: true });
  fs.copyFileSync(RUTA_PLANTILLA_FRASE, path.join(raiz, RUTA_PLANTILLA_FRASE));
  for (const f of fs.readdirSync("assets/fonts")) fs.copyFileSync(path.join("assets/fonts", f), path.join(raiz, "assets/fonts", f));
  return raiz;
}
const ahora = new Date("2026-09-11T16:00:00.000Z");
const frase = { texto: "Peace be with you all! Dearest brothers and sisters, this is the first greeting of the Risen Christ, the Good Shepherd who gave his life for God's flock.", autor: "Pope Leo XIV", fuente: "First blessing from the loggia of St. Peter's Basilica", anio: 2025, url: "https://www.vatican.va/content/leo-xiv/en.html" };

test("(frase) renderiza un JPEG 1080x1350 con la plantilla de frases, sin ilustración, y devuelve ruta, url, huella y versión de la plantilla", async () => {
  const raiz = raizTemporal();
  const post = crearPostFrase({ frase, origen: "banco", config: cfg, ahora, zona: "America/New_York", cuenta: "leopopexiv", variante: "negro" });
  const imagen = await renderizarFrase(post, { config: cfg, navegador, raiz });
  const archivo = path.join(raiz, imagen.ruta);
  assert.ok(fs.existsSync(archivo));
  const meta = await sharp(archivo).metadata();
  assert.equal(meta.width, 1080); assert.equal(meta.height, 1350); assert.equal(meta.format, "jpeg");
  assert.equal(imagen.ruta, `public/img/${post.id}.jpg`);
  assert.equal(imagen.url, `https://prueba.github.io/sinlinea/img/${post.id}.jpg`);
  assert.equal(imagen.version, 1);
  assert.equal(imagen.hash, hashImagen(post, 1));
  assert.equal(typeof imagen.estilo, "string");
  fs.copyFileSync(archivo, path.join("temp", "preview-frase.jpg"));
});

test("(frase) una frase demasiado larga para diez líneas falla con un error claro (TEXTO_NO_CABE, campo frase)", async () => {
  const raiz = raizTemporal();
  // Hasta 320 caracteres siempre cabe (a 36 px entran unos 45 por línea); el error protege frente a piezas editadas a mano.
  const base = crearPostFrase({ frase, origen: "banco", config: cfg, ahora, zona: "America/New_York", cuenta: "leopopexiv", variante: "negro" });
  const post = { ...base, frase: { ...base.frase, texto: ("Peace be with you all, and may the hope that does not disappoint accompany every family, every community and every nation on earth. ").repeat(6).trim() } };
  await assert.rejects(renderizarFrase(post, { config: cfg, navegador, raiz }), (e) => e.code === "TEXTO_NO_CABE" && e.campo === "frase" && /frase/.test(e.message));
});
