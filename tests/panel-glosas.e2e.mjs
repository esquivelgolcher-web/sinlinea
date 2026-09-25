// La glosa en el panel, de extremo a extremo con el servidor local: la tarjeta muestra el chip Glosa, los cuatro
// versos editables con sus sílabas y su rima, no deja guardar una cuarteta coja, guarda la corregida y deja la imagen
// por redibujar; el formulario de la cuenta enciende las glosas y nombra al personaje. Sin Instagram ni GitHub.
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
const iso = "2026-09-25T12:00:00.000Z";
const id = (s) => base0.id.slice(0, -4) + s;
const leerPost = (raiz, pid) => JSON.parse(fs.readFileSync(path.join(raiz, "posts", `${pid}.json`), "utf8"));
const versos = ["Trece ministerios andan", "en camioneta alquilada;", "el pueblo a pie, sin más nada,", "pagando lo que ellos mandan."];
const glosa = { ...base0, id: id("d001"), cuenta: "prueba", estado: "borrador", formato: "glosa", categoria: "POLÍTICA", titular: versos[0], bajada: "Sobre: Ministerios gastan $1.5 millones", caption: versos.join("\n"), hashtags: ["#Glosa"], ilustracion: null, programado: null,
  glosa: { versos, esquema: "ABBA", sobre: { id: id("a001"), titular: "Ministerios gastan $1.5 millones en alquiler de camionetas" } } };
const conImagen = (p) => ({ ...p, imagen: { ruta: `public/img/${p.id}.jpg`, url: `https://prueba.github.io/sinlinea/img/${p.id}.jpg`, hash: hashImagen(p, 1), version: 1, renderizada: iso } });

async function montar(prefijo) {
  const raiz = raizConCuentas({ cuentas: ["sinlinea", "prueba"], global: { pages: { baseUrl: "https://prueba.github.io/sinlinea" } }, prefijo });
  for (const d of ["templates", "panel", "src/lib", "public/img"]) fs.mkdirSync(path.join(raiz, d), { recursive: true });
  for (const t of ["templates/post.html", "templates/garza.html"]) fs.copyFileSync(t, path.join(raiz, t));
  for (const f of fs.readdirSync("panel")) fs.copyFileSync(path.join("panel", f), path.join(raiz, "panel", f));
  for (const f of fs.readdirSync("src/lib")) fs.copyFileSync(path.join("src/lib", f), path.join(raiz, "src/lib", f));
  const ruta = path.join(raiz, "cuentas/prueba/config.json");
  fs.writeFileSync(ruta, JSON.stringify({ ...JSON.parse(fs.readFileSync(ruta, "utf8")), glosas: { activo: true, porDia: 1, personaje: { nombre: "La Garza María", cargo: "Comentarista del Palacio" } } }, null, 2) + "\n");
  fs.writeFileSync(path.join(raiz, "posts", `${glosa.id}.json`), JSON.stringify(conImagen(glosa), null, 2));
  const noticia = { ...base0, id: id("a001"), cuenta: "prueba", estado: "borrador", titular: "Ministerios gastan $1.5 millones en alquiler de camionetas", programado: null };
  fs.writeFileSync(path.join(raiz, "posts", `${noticia.id}.json`), JSON.stringify(conImagen(noticia), null, 2));
  const servidor = crearServidor({ raiz });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  return { raiz, servidor, base: `http://127.0.0.1:${servidor.address().port}` };
}

async function abrirCuenta(page, base, cuenta) {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto(`${base}/panel/`);
  await page.waitForFunction(() => document.querySelector("#cuentas-grid .cuenta-tarjeta") || (document.querySelector("#lista .tarjeta, #lista .vacio") && !/Cargando/.test(document.getElementById("lista").textContent)));
  if (await page.locator("#maestro").isHidden()) await page.click("#boton-cuentas");
  await page.waitForSelector("#cuentas-grid .cuenta-tarjeta");
  for (let intento = 0; intento < 3; intento++) {
    const boton = page.locator(`.cuenta-tarjeta[data-cuenta="${cuenta}"]`).getByRole("button", { name: "Abrir panel" });
    if (await boton.isVisible().catch(() => false)) await boton.click().catch(() => {});
    try { await page.waitForSelector("#lista .tarjeta", { timeout: 5000 }); return; } catch { /* se reintenta */ }
  }
  await page.waitForSelector("#lista .tarjeta");
}

test("(glosas) la tarjeta muestra la cuarteta con sílabas y rima, rechaza un verso cojo y guarda la corrección", async () => {
  const { raiz, servidor, base } = await montar("panel-glosas-");
  const page = await navegador.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  try {
    await abrirCuenta(page, base, "prueba");
    const t = page.locator(`.tarjeta[data-id="${glosa.id}"]`);
    await t.waitFor();
    assert.match(await t.locator(".chip.formato").innerText(), /Glosa/);
    assert.equal(await t.locator("input.verso").count(), 4);
    assert.equal(await t.locator("input.verso-1").inputValue(), versos[0]);
    assert.match(await t.locator(".bloque-glosa .nota").first().innerText(), /Cuarteta ABBA/);
    assert.equal(await t.locator("label.solo-foto").count(), 0, "una glosa no lleva escena de ilustración");
    assert.equal(await t.getByRole("button", { name: /Pedir glosa/ }).count(), 0, "una glosa no pide otra glosa");

    // La noticia sí ofrece pedir la glosa a La Garza María; en local, el panel explica dónde corre.
    const n = page.locator(`.tarjeta[data-id="${id("a001")}"]`);
    const pedir = n.getByRole("button", { name: "Pedir glosa a La Garza María" });
    assert.equal(await pedir.count(), 1);
    await pedir.click();
    await page.waitForFunction((pid) => /glosa = /.test(document.querySelector(`.tarjeta[data-id="${pid}"] .aviso-tarjeta`)?.textContent || ""), id("a001"));

    // Un verso de nueve sílabas: aviso en rojo y Guardar bloqueado.
    await t.locator("input.verso-1").fill("Trece ministerios andan hoy");
    await page.waitForFunction((pid) => document.querySelector(`.tarjeta[data-id="${pid}"] .bloque-glosa .nota`).classList.contains("excede"), glosa.id);
    assert.match(await t.locator(".bloque-glosa .nota").first().innerText(), /verso 1 tiene 10 sílabas/);
    await t.getByRole("button", { name: /Guardar/i }).first().click();
    await page.waitForFunction(() => /sílabas/.test(document.getElementById("aviso").textContent || ""));
    assert.deepEqual(leerPost(raiz, glosa.id).glosa.versos, versos, "no se guardó la cuarteta coja");

    // Corregida y con otra rima válida: se guarda y la imagen queda por redibujar.
    await t.locator("input.verso-1").fill("Trece ministerios mandan");
    await t.locator("input.verso-4").fill("los que a pie nunca comandan."); // sigue rimando con "mandan"
    await page.waitForFunction((pid) => !document.querySelector(`.tarjeta[data-id="${pid}"] .bloque-glosa .nota`).classList.contains("excede"), glosa.id);
    await t.getByRole("button", { name: /Guardar/i }).first().click();
    await page.waitForFunction((pid) => /Regenerando imagen/.test(document.querySelector(`.tarjeta[data-id="${pid}"]`)?.textContent || ""), glosa.id);
    const guardada = leerPost(raiz, glosa.id);
    assert.equal(guardada.glosa.versos[0], "Trece ministerios mandan");
    assert.equal(guardada.glosa.versos[3], "los que a pie nunca comandan.");
    assert.equal(guardada.glosa.esquema, "ABBA");
    assert.equal(guardada.glosa.sobre.id, id("a001"), "la noticia de origen se conserva");
    assert.deepEqual(errores, []);
  } finally {
    await page.close();
    servidor.close();
  }
});

test("(glosas) el formulario de la cuenta enciende las glosas y nombra al personaje", async () => {
  const { raiz, servidor, base } = await montar("panel-glosas-form-");
  const page = await navegador.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  try {
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto(`${base}/panel/`);
    await page.waitForFunction(() => document.querySelector("#cuentas-grid .cuenta-tarjeta") || (document.querySelector("#lista .tarjeta, #lista .vacio") && !/Cargando/.test(document.getElementById("lista").textContent)));
    if (await page.locator("#maestro").isHidden()) await page.click("#boton-cuentas");
    await page.waitForSelector("#cuentas-grid .cuenta-tarjeta");
    await page.locator('.cuenta-tarjeta[data-cuenta="sinlinea"]').getByRole("button", { name: /Editar/i }).click();
    await page.waitForSelector("#formulario-cuenta:not([hidden])");
    const yaEncendidas = await page.locator("#fc-glosas-activo").isChecked();
    await page.check("#fc-glosas-activo");
    await page.fill("#fc-glosas-pordia", "2");
    await page.fill("#fc-glosas-nombre", "La Garza María");
    await page.fill("#fc-glosas-cargo", "Comentarista del Palacio");
    await page.fill("#fc-glosas-hashtags", "#Panamá #Glosa");
    await page.getByRole("button", { name: /Guardar/i }).first().click();
    await page.waitForFunction(() => document.getElementById("formulario-cuenta").hidden, undefined, { timeout: 20000 });
    const config = JSON.parse(fs.readFileSync(path.join(raiz, "cuentas/sinlinea/config.json"), "utf8"));
    assert.equal(config.glosas.activo, true);
    assert.equal(config.glosas.porDia, 2);
    assert.deepEqual(config.glosas.personaje, { nombre: "La Garza María", cargo: "Comentarista del Palacio" });
    assert.deepEqual(config.glosas.hashtags, ["#Panamá", "#Glosa"]);
    assert.equal(typeof yaEncendidas, "boolean");
    assert.deepEqual(errores, []);
  } finally {
    await page.close();
    servidor.close();
  }
});
