// Perfil editorial en el panel: la tarjeta de un borrador muestra formato, alertas, afirmaciones, fuentes con alcance,
// diapositivas del carrusel y guion del reel; carrusel y reel no se pueden programar (sin adaptador de publicación).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { crearServidor } from "../src/serve.mjs";
import { raizConCuentas } from "./ayuda/cuentas.mjs";
import { hashImagen } from "../src/lib/estados.mjs";

let navegador;
before(async () => { navegador = await chromium.launch(); });
after(async () => { await navegador?.close(); });

const base0 = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));
const iso = "2026-09-10T12:00:00.000Z";
const conImagen = (p) => ({ ...p, imagen: { ruta: `public/img/${p.id}.jpg`, url: `https://prueba.github.io/sinlinea/img/${p.id}.jpg`, hash: hashImagen(p, 1), version: 1, renderizada: iso } });
const fuentes = [
  { rol: "principal", medio: "WIRED", autor: "Dhruv Mehrotra", url: "https://www.wired.com/story/clearview/?utm_source=rss", canonica: "https://www.wired.com/story/clearview/", idioma: "en", publicado: "2026-09-10T10:00:00.000Z", actualizado: "2026-09-10T12:30:00.000Z", fechaHecho: null, consultado: iso, alcance: "completo", textoRecuperado: { parrafos: 39, caracteres: 1500 }, fuentesPrimarias: ["https://www.aclu.org/x"], licenciaMedios: null },
  { rol: "referencia", medio: "AJ+", autor: "AJ+", url: "https://www.youtube.com/watch?v=abc", canonica: null, idioma: "en", publicado: "2026-09-10T02:00:00.000Z", actualizado: null, fechaHecho: null, consultado: iso, alcance: "fragmento", textoRecuperado: null, fuentesPrimarias: [], licenciaMedios: null },
];
const perfilComun = {
  fuentes, angulo: "Qué permite la herramienta y a quién afecta", atribucion: "Según documentos revisados por WIRED",
  afirmaciones: [{ texto: "Clearview prueba la herramienta con policías", tipo: "hecho", fuente: "https://www.wired.com/story/clearview/", contrastada: true }, { texto: "La empresa habría ocultado el alcance", tipo: "denuncia", fuente: "", contrastada: false }],
  puntuacion: { total: 82, componentes: { afinidad: 27, interes: 20, evidencia: 14, actualidad: 15, visual: 6 } }, alertas: ["acusacion-sin-fuente"], revision: { estado: "pendiente", notas: [] },
};

async function montar(prefijo) {
  const raiz = raizConCuentas({ cuentas: ["sinlinea", "prueba"], global: { pages: { baseUrl: "https://prueba.github.io/sinlinea" } }, prefijo });
  for (const d of ["templates", "panel", "src/lib", "public/img", "assets", "data/prueba"]) fs.mkdirSync(path.join(raiz, d), { recursive: true });
  fs.copyFileSync("templates/post.html", path.join(raiz, "templates/post.html"));
  for (const f of fs.readdirSync("panel")) fs.copyFileSync(path.join("panel", f), path.join(raiz, "panel", f));
  for (const f of fs.readdirSync("src/lib")) fs.copyFileSync(path.join("src/lib", f), path.join(raiz, "src/lib", f));
  fs.mkdirSync(path.join(raiz, ".github/workflows"), { recursive: true });
  for (const w of ["publicar.yml", "probar-instagram.yml"]) fs.copyFileSync(path.join(".github/workflows", w), path.join(raiz, ".github/workflows", w));
  const id = (s) => base0.id.slice(0, -4) + s;
  const posts = [
    conImagen({ ...base0, id: id("b001"), cuenta: "prueba", titular: "Post del perfil", formato: "post", ...perfilComun }),
    conImagen({ ...base0, id: id("b002"), cuenta: "prueba", titular: "Carrusel del perfil", formato: "carrusel", ...perfilComun, alertas: ["fuente-unica"], carrusel: { diapositivas: [{ titulo: "Portada", texto: "Una pregunta." }, { titulo: "Qué ocurrió", texto: "Los hechos." }, { titulo: "Cierre", texto: "Fuentes." }], imagenes: [{ numero: 1, ruta: `public/img/${id("b002")}-01.jpg`, url: `https://prueba.github.io/sinlinea/img/${id("b002")}-01.jpg`, hash: "a".repeat(16) }] } }),
    conImagen({ ...base0, id: id("b003"), cuenta: "prueba", titular: "Reel del perfil", formato: "reel", ...perfilComun, alertas: [], reel: { narracion: "Un hecho concreto abre el vídeo. " + "Palabra ".repeat(90).trim(), subtitulos: ["Frase uno", "Frase dos"], escenas: [{ segundos: 0, descripcion: "Apertura con la ilustración", recurso: "ilustración generada" }], recursos: ["voz en off", "ilustración"], duracionObjetivo: "35-60 s" } }),
  ];
  for (const p of posts) fs.writeFileSync(path.join(raiz, "posts", `${p.id}.json`), JSON.stringify(p, null, 2));
  const servidor = crearServidor({ raiz });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  return { raiz, servidor, base: `http://127.0.0.1:${servidor.address().port}`, ids: { post: id("b001"), carrusel: id("b002"), reel: id("b003") } };
}
const tarjeta = (page, id) => page.locator(`.tarjeta[data-id="${id}"]`);

test("(perfil) la tarjeta muestra formato, alertas explicadas, puntuación, afirmaciones con tipo y fuente, fuentes con alcance, carrusel y guion del reel; carrusel y reel no se programan", async () => {
  const { raiz, servidor, base, ids } = await montar("panel-perfil-");
  const page = await navegador.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  try {
    await page.goto(`${base}/panel/`);
    await page.waitForFunction(() => document.querySelector("#cuentas-grid .cuenta-tarjeta") || (document.querySelector("#lista .tarjeta, #lista .vacio") && !/Cargando/.test(document.getElementById("lista").textContent)));
    if (await page.locator("#maestro").isHidden()) await page.click("#boton-cuentas");
    await page.waitForSelector("#cuentas-grid .cuenta-tarjeta");
    await page.click('.cuenta-tarjeta[data-cuenta="prueba"] button:has-text("Abrir panel")');
    await page.waitForSelector("#vista-posts:not([hidden])");
    await page.click('#pestanas button:has-text("Borradores")');
    await page.waitForSelector(".tarjeta");
    // Post: sin chip de formato; alerta explicada; afirmaciones y fuentes.
    const tp = tarjeta(page, ids.post);
    const textoPost = await tp.textContent();
    assert.doesNotMatch(textoPost, /Carrusel|Reel/);
    assert.match(textoPost, /acusacion-sin-fuente: Hay una denuncia o acusación sin fuente enlazada/);
    await tp.locator("details.perfil summary").click();
    const abierto = await tp.textContent();
    assert.match(abierto, /Puntuación editorial 82\/100/);
    assert.match(abierto, /Ángulo: Qué permite la herramienta/);
    assert.match(abierto, /denuncia.*La empresa habría ocultado el alcance.*\(sin fuente\)/);
    assert.match(abierto, /hecho.*Clearview prueba la herramienta/);
    assert.match(abierto, /principal.*WIRED · Dhruv Mehrotra · en · 2026-09-10 05:00 · 2026-09-10 07:30 · 2026-09-10 · completo/, "fechas en hora de Panamá");
    assert.match(abierto, /referencia.*AJ\+ · AJ\+ · en .* fragmento/);
    assert.match(abierto, /licencia de recursos: pendiente/);
    assert.equal(await tp.locator('a[href="https://www.wired.com/story/clearview/"]').count(), 2, "afirmación y fuente enlazan a la URL canónica");
    // Carrusel: chip de formato, diapositivas con imagen; Aprobar no programa.
    const tc = tarjeta(page, ids.carrusel);
    assert.match(await tc.locator(".chip.formato").textContent(), /Carrusel/);
    await tc.locator("details.perfil summary").click();
    const textoCarrusel = await tc.textContent();
    assert.match(textoCarrusel, /Carrusel: 3 diapositivas/);
    assert.match(textoCarrusel, /Portada.*Una pregunta\./);
    assert.equal(await tc.locator("img.diapositiva").count(), 1);
    await tc.locator('button:has-text("Aprobar")').click();
    await page.waitForFunction((id) => /Carrusel: Carrusel y reel no tienen todavía adaptador de publicación/.test(document.querySelector(`.tarjeta[data-id="${id}"] .aviso-tarjeta`)?.textContent || ""), ids.carrusel);
    assert.equal(await page.locator("dialog[open]").count(), 0, "no se abre el diálogo de programación");
    assert.equal(JSON.parse(fs.readFileSync(path.join(raiz, "posts", `${ids.carrusel}.json`), "utf8")).estado, "borrador");
    // Reel: guion visible (narración, subtítulos, escenas, recursos); tampoco se programa.
    const tr = tarjeta(page, ids.reel);
    await tr.locator("details.perfil summary").click();
    const textoReel = await tr.textContent();
    assert.match(textoReel, /Guion del reel · 35-60 s · narración de 96 palabras/);
    assert.match(textoReel, /Frase uno/);
    assert.match(textoReel, /0s · Apertura con la ilustración · recurso: ilustración generada/);
    assert.match(textoReel, /Recursos: voz en off; ilustración/);
    await tr.locator('button:has-text("Aprobar")').click();
    await page.waitForFunction((id) => /Reel: Carrusel y reel no tienen todavía/.test(document.querySelector(`.tarjeta[data-id="${id}"] .aviso-tarjeta`)?.textContent || ""), ids.reel);
    assert.equal(JSON.parse(fs.readFileSync(path.join(raiz, "posts", `${ids.reel}.json`), "utf8")).estado, "borrador");
    assert.deepEqual(errores, []);
  } finally {
    await page.close();
    servidor.close();
  }
});
