// Plantillas en el panel, de extremo a extremo con el servidor local: la tarjeta de un borrador de Sin Línea muestra la
// plantilla (Foto, Dato, Titular), deja cambiarla y editar la cifra y su frase; pasar a Dato o Titular apaga la
// ilustración y esconde la escena; un dato incompleto no se puede guardar; una cuenta sin plantillas no ve el selector.
// No contacta con Instagram ni con GitHub.
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
const iso = "2026-09-24T12:00:00.000Z";
const conImagen = (p, version = 1) => ({ ...p, imagen: { ruta: `public/img/${p.id}.jpg`, url: `https://prueba.github.io/sinlinea/img/${p.id}.jpg`, hash: hashImagen(p, version), version, renderizada: iso } });
const leerPost = (raiz, id) => JSON.parse(fs.readFileSync(path.join(raiz, "posts", `${id}.json`), "utf8"));
const id = (s) => base0.id.slice(0, -4) + s;
const escena = { descripcion: "Fachada de la Asamblea Nacional al atardecer", usar: true, ruta: "public/ilus/x.jpg", hashDescripcion: "h", proveedor: null, modelo: null, generada: iso, error: null };

async function montar(prefijo) {
  const raiz = raizConCuentas({ cuentas: ["sinlinea", "prueba"], global: { pages: { baseUrl: "https://prueba.github.io/sinlinea" } }, prefijo });
  for (const d of ["templates", "panel", "src/lib", "public/img"]) fs.mkdirSync(path.join(raiz, d), { recursive: true });
  for (const t of ["templates/post.html", "templates/tarjeta.html"]) fs.copyFileSync(t, path.join(raiz, t));
  for (const f of fs.readdirSync("panel")) fs.copyFileSync(path.join("panel", f), path.join(raiz, "panel", f));
  for (const f of fs.readdirSync("src/lib")) fs.copyFileSync(path.join("src/lib", f), path.join(raiz, "src/lib", f));
  const rutaSl = path.join(raiz, "cuentas/sinlinea/config.json");
  const cfgSl = JSON.parse(fs.readFileSync(rutaSl, "utf8"));
  fs.writeFileSync(rutaSl, JSON.stringify({ ...cfgSl, marca: { ...cfgSl.marca, plantillas: ["foto", "dato", "titular"] } }, null, 2) + "\n");
  const posts = [
    conImagen({ ...base0, id: id("c001"), cuenta: "sinlinea", titular: "Asamblea debate reforma de circuitos", plantilla: "foto", ilustracion: escena }),
    conImagen({ ...base0, id: id("c002"), cuenta: "sinlinea", titular: "47% de hogares comió menos de 3 veces al día", plantilla: "dato", dato: { cifra: "47%", frase: "de los hogares comió menos de 3 veces al día" }, ilustracion: { ...escena, usar: false, ruta: null } }),
    conImagen({ ...base0, id: id("c003"), cuenta: "prueba", titular: "Borrador de una cuenta sin plantillas", ilustracion: escena }),
  ];
  for (const p of posts) fs.writeFileSync(path.join(raiz, "posts", `${p.id}.json`), JSON.stringify(p, null, 2));
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
  // La rejilla se repinta al llegar datos: si el clic cae en una tarjeta reemplazada, se reintenta.
  for (let intento = 0; intento < 3; intento++) {
    const boton = page.locator(`.cuenta-tarjeta[data-cuenta="${cuenta}"]`).getByRole("button", { name: "Abrir panel" });
    if (await boton.isVisible().catch(() => false)) await boton.click().catch(() => {});
    try { await page.waitForSelector("#lista .tarjeta", { timeout: 5000 }); return; } catch { /* se reintenta */ }
  }
  await page.waitForSelector("#lista .tarjeta");
}
// Mide un elemento conectado: si la lista se repinta justo entonces, el nodo viejo ya no cuenta y se vuelve a medir.
async function visible(loc) {
  for (let i = 0; i < 20; i++) {
    const r = await loc.evaluate((n) => (n.isConnected ? getComputedStyle(n).display !== "none" : null)).catch(() => null);
    if (r !== null) return r;
    await new Promise((listo) => setTimeout(listo, 100));
  }
  throw new Error("el elemento no llegó a estar en la página");
}
const describir = (loc) => loc.evaluate((n) => `${n.className} style="${n.getAttribute("style")}" en ${n.closest(".tarjeta")?.dataset.id}`);

test("(plantillas) la tarjeta enseña la plantilla, deja cambiarla y editar el dato; un dato incompleto no se guarda", async () => {
  const { raiz, servidor, base } = await montar("panel-plantillas-");
  const page = await navegador.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  try {
    await abrirCuenta(page, base, "sinlinea");
    const foto = page.locator(`.tarjeta[data-id="${id("c001")}"]`);
    const dato = page.locator(`.tarjeta[data-id="${id("c002")}"]`);
    await dato.waitFor();

    // El dato: chip, selector y campos con la cifra; la escena no se ofrece.
    assert.match(await dato.locator(".meta").innerText(), /Dato/);
    assert.equal(await dato.locator("select.plantilla").inputValue(), "dato");
    assert.equal(await dato.locator("input.dato-cifra").inputValue(), "47%");
    assert.equal(await visible(dato.locator(".bloque-dato")), true);
    assert.equal(await visible(dato.locator("label.solo-foto").first()), false, `la escena de la ilustración solo cuenta para la foto (${await describir(dato.locator("label.solo-foto").first())})`);

    // Un dato sin frase no se guarda: aviso y el JSON no cambia.
    await dato.locator("input.dato-frase").fill("");
    await page.waitForFunction((pid) => document.querySelector(`.tarjeta[data-id="${pid}"] .bloque-dato .nota`).classList.contains("excede"), id("c002"));
    await dato.getByRole("button", { name: /Guardar/i }).first().click();
    await page.waitForFunction(() => /frase/.test(document.getElementById("aviso").textContent || ""));
    assert.equal(leerPost(raiz, id("c002")).dato.frase, "de los hogares comió menos de 3 veces al día");
    await dato.locator("input.dato-frase").fill("de los hogares panameños comió menos de 3 veces al día");
    await dato.getByRole("button", { name: /Guardar/i }).first().click();
    await page.waitForFunction((pid) => /Regenerando imagen/.test(document.querySelector(`.tarjeta[data-id="${pid}"]`)?.textContent || ""), id("c002"));
    assert.equal(leerPost(raiz, id("c002")).dato.frase, "de los hogares panameños comió menos de 3 veces al día");

    // La foto pasa a Titular: sin campos de dato, la escena se esconde y la ilustración se apaga.
    await foto.locator("select.plantilla").selectOption("titular");
    assert.equal(await visible(foto.locator(".bloque-dato")), false);
    assert.equal(await visible(foto.locator("label.solo-foto").first()), false);
    await foto.getByRole("button", { name: /Guardar/i }).first().click();
    await page.waitForFunction((pid) => /Regenerando imagen/.test(document.querySelector(`.tarjeta[data-id="${pid}"]`)?.textContent || ""), id("c001"));
    const guardada = leerPost(raiz, id("c001"));
    assert.equal(guardada.plantilla, "titular");
    assert.equal(guardada.ilustracion.usar, false, "la tarjeta no usa ilustración");
    assert.equal(guardada.ilustracion.descripcion, escena.descripcion, "la escena se conserva por si se vuelve a la foto");
    assert.deepEqual(errores, []);
  } finally {
    await page.close();
    servidor.close();
  }
});

test("(plantillas) una cuenta sin plantillas declaradas no ve el selector", async () => {
  const { servidor, base } = await montar("panel-plantillas-sin-");
  const page = await navegador.newPage();
  try {
    await abrirCuenta(page, base, "prueba");
    const t = page.locator(`.tarjeta[data-id="${id("c003")}"]`);
    await t.waitFor();
    assert.equal(await t.locator("select.plantilla").count(), 0);
    assert.equal(await visible(t.locator("label.solo-foto").first()), true, "la escena sigue ahí, como siempre");
  } finally {
    await page.close();
    servidor.close();
  }
});
