// Cierre del Panel Maestro, de extremo a extremo con el servidor local y cuentas SIN credenciales: alta sin herencia,
// guía de conexión, interruptores con activación segura, programados vencidos, borrador manual, archivado y aislamiento.
// En escritorio y en móvil. No contacta con Instagram ni con GitHub.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { crearServidor } from "../src/serve.mjs";
import { raizConCuentas } from "./ayuda/cuentas.mjs";

let navegador;
before(async () => { navegador = await chromium.launch(); });
after(async () => { await navegador?.close(); });

const base0 = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));
const leerJson = (ruta) => JSON.parse(fs.readFileSync(ruta, "utf8"));

async function montar(prefijo) {
  const raiz = raizConCuentas({ cuentas: ["sinlinea", "prueba"], global: { pages: { baseUrl: "https://prueba.github.io/sinlinea" } }, prefijo });
  for (const d of ["templates", "panel", "src/lib", "public/img", "assets", "tests/fixtures"]) fs.mkdirSync(path.join(raiz, d), { recursive: true });
  fs.copyFileSync("templates/post.html", path.join(raiz, "templates/post.html"));
  fs.copyFileSync("tests/fixtures/post-ejemplo.json", path.join(raiz, "tests/fixtures/post-ejemplo.json"));
  for (const f of fs.readdirSync("panel")) fs.copyFileSync(path.join("panel", f), path.join(raiz, "panel", f));
  for (const f of fs.readdirSync("src/lib")) fs.copyFileSync(path.join("src/lib", f), path.join(raiz, "src/lib", f));
  fs.mkdirSync(path.join(raiz, ".github/workflows"), { recursive: true });
  for (const w of ["publicar.yml", "probar-instagram.yml"]) fs.copyFileSync(path.join(".github/workflows", w), path.join(raiz, ".github/workflows", w));
  const rutaSl = path.join(raiz, "cuentas/sinlinea/config.json");
  fs.writeFileSync(rutaSl, JSON.stringify({ ...leerJson(rutaSl), automatico: { generar: true, publicar: false } }, null, 2) + "\n");
  const posts = [
    { ...base0, id: base0.id.slice(0, -4) + "e001", cuenta: "sinlinea", estado: "programado", programado: "2026-09-09T12:00:00-05:00", titular: "Programado de Sin Línea en cola" },
    { ...base0, id: base0.id.slice(0, -4) + "e002", cuenta: "prueba", titular: "Borrador de prueba" },
  ];
  for (const p of posts) fs.writeFileSync(path.join(raiz, "posts", `${p.id}.json`), JSON.stringify(p, null, 2));
  const servidor = crearServidor({ raiz });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  return { raiz, servidor, base: `http://127.0.0.1:${servidor.address().port}` };
}

async function abrirMaestro(page, base, viewport = { width: 1200, height: 900 }) {
  await page.setViewportSize(viewport);
  await page.goto(`${base}/panel/`);
  // Espera a que el panel haya restaurado la vista guardada y cargado datos (tarjetas de cuentas o de posts).
  await page.waitForFunction(() => document.querySelector("#cuentas-grid .cuenta-tarjeta") || (document.querySelector("#lista .tarjeta, #lista .vacio") && !/Cargando/.test(document.getElementById("lista").textContent)));
  if (await page.locator("#maestro").isHidden()) await page.click("#boton-cuentas");
  await page.waitForSelector("#cuentas-grid .cuenta-tarjeta");
}
const tarjeta = (page, id) => page.locator(`.cuenta-tarjeta[data-cuenta="${id}"]`);
const aviso = (page) => page.locator("#aviso");

test("(cierre) recorrido completo en escritorio: alta sin herencia, guía de conexión, interruptores seguros, vencidos, borrador manual, archivado y aislamiento", async () => {
  const { raiz, servidor, base } = await montar("cierre-escritorio-");
  const page = await navegador.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  try {
    await abrirMaestro(page, base);
    const sinLineaAntes = fs.readFileSync(path.join(raiz, "cuentas/sinlinea/config.json"), "utf8");

    // 1. Alta con datos propios y sin fuentes: todo apagado, nada heredado.
    await page.click("#boton-anadir");
    await page.waitForSelector("#formulario-cuenta:not([hidden])");
    await page.fill("#fc-nombre", "Nuevo Medio");
    await page.fill("#fc-usuario", "@nuevomedio");
    assert.equal(await page.inputValue("#fc-id"), "nuevomedio", "el id se sugiere a partir del usuario de Instagram");
    await page.fill("#fc-id", "nuevo-medio"); // el operador puede elegir otro id antes de guardar
    assert.equal(await page.inputValue("#fc-origen"), "entorno", "las cuentas nuevas nacen en modo Environment");
    assert.equal(await page.isChecked("#fc-generar"), false); assert.equal(await page.isChecked("#fc-publicar"), false); assert.equal(await page.isChecked("#fc-metricas"), false);
    await page.fill("#fc-temas", "Economía local\nTransparencia");
    await page.fill("#fc-tono", "Claro y directo");
    await page.fill("#fc-franjas", "07:30, 19:30");
    await page.fill("#fc-color-principal", "#112233");
    await page.click("#fc-guardar");
    await page.waitForSelector('.cuenta-tarjeta[data-cuenta="nuevo-medio"]');
    const cfg = leerJson(path.join(raiz, "cuentas/nuevo-medio/config.json"));
    assert.deepEqual(cfg.automatico, { generar: false, publicar: false });
    assert.deepEqual(cfg.metricas, { recoger: false });
    assert.deepEqual(cfg.fuentes, []);
    assert.deepEqual(cfg.franjas, ["07:30", "19:30"]);
    assert.equal(cfg.marca.colores.principal, "#112233");
    assert.equal(cfg.instagram.origen, "entorno");
    const sl = leerJson(path.join(raiz, "cuentas/sinlinea/config.json"));
    assert.notDeepEqual(cfg.fuentes, sl.fuentes); assert.notDeepEqual(cfg.franjas, sl.franjas); assert.notEqual(cfg.marca.colores.principal, sl.marca.colores?.principal);
    assert.ok(fs.readFileSync(path.join(raiz, "cuentas/nuevo-medio/editorial.md"), "utf8").includes("Economía local"));

    // 2. Guía de conexión: nombres exactos y enlaces a GitHub deducidos de pages.baseUrl; sin valores.
    const t = tarjeta(page, "nuevo-medio");
    assert.match(await t.textContent(), /Conexión sin verificar/);
    assert.match(await t.textContent(), /Guía de conexión: Environment cuenta-nuevo-medio · IG_ACCESS_TOKEN e IG_USER_ID/);
    assert.match(await t.textContent(), /Último borrador generado: ninguno · Última publicación: ninguna · Última recogida de métricas: recogida apagada/);
    await t.locator("details.guia-conexion summary").click();
    assert.equal(await t.locator('a[href="https://github.com/prueba/sinlinea/settings/environments/new"]').count(), 1);
    assert.equal(await t.locator('a[href="https://github.com/prueba/sinlinea/actions/workflows/probar-instagram.yml"]').count(), 1);
    assert.match(await t.locator("details.guia-conexion").textContent(), /Generate token/);
    assert.match(await t.locator("details.guia-conexion").textContent(), /nunca pasan por el panel/);

    // 3. Generación: bloqueada sin fuentes; permitida tras añadir una desde Editar; pausar la apaga.
    await t.locator('button[data-accion="generar"]').click();
    await page.waitForFunction(() => /No se puede encender la generación/.test(document.getElementById("aviso").textContent));
    assert.match(await aviso(page).textContent(), /fuente/);
    assert.deepEqual(leerJson(path.join(raiz, "cuentas/nuevo-medio/config.json")).automatico, { generar: false, publicar: false });
    await t.locator('button:has-text("Editar")').click();
    await page.waitForSelector("#formulario-cuenta:not([hidden])");
    await page.click("#fc-anadir-fuente");
    const fila = page.locator("#fc-fuentes .fuente-fila").last();
    await fila.locator("input").nth(0).fill("La Prensa");
    await fila.locator("input").nth(1).fill("https://www.prensa.com/feed");
    await page.click("#fc-guardar");
    await page.waitForSelector("#maestro:not([hidden])");
    await tarjeta(page, "nuevo-medio").locator('button[data-accion="generar"]').click();
    await page.waitForFunction(() => /Generación de Nuevo Medio: encendida/.test(document.getElementById("aviso").textContent));
    assert.deepEqual(leerJson(path.join(raiz, "cuentas/nuevo-medio/config.json")).automatico, { generar: true, publicar: false });
    assert.match(await tarjeta(page, "nuevo-medio").textContent(), /Generación automática: activa/);
    await tarjeta(page, "nuevo-medio").locator('button[data-accion="generar"]').click();
    await page.waitForFunction(() => /Generación de Nuevo Medio: pausada/.test(document.getElementById("aviso").textContent));
    assert.deepEqual(leerJson(path.join(raiz, "cuentas/nuevo-medio/config.json")).automatico, { generar: false, publicar: false });

    // 4. Publicación: bloqueada sin identidad verificada.
    await tarjeta(page, "nuevo-medio").locator('button[data-accion="publicar"]').click();
    await page.waitForFunction(() => /No se puede encender la publicación/.test(document.getElementById("aviso").textContent));
    assert.match(await aviso(page).textContent(), /verificar la identidad/i);
    assert.deepEqual(leerJson(path.join(raiz, "cuentas/nuevo-medio/config.json")).automatico, { generar: false, publicar: false });

    // 5. Con identidad verificada y un programado vencido: se pide una decisión; "Quitar de la cola" lo devuelve a borrador y activa.
    fs.mkdirSync(path.join(raiz, "data/nuevo-medio"), { recursive: true });
    fs.writeFileSync(path.join(raiz, "data/nuevo-medio/conexion.json"), JSON.stringify({ estado: "verificada", usuario: "nuevomedio", comprobado: new Date().toISOString(), detalle: null, secretos: { tokenSecreto: "IG_ACCESS_TOKEN", usuarioIdSecreto: "IG_USER_ID", origen: "entorno", entorno: "cuenta-nuevo-medio" } }));
    const vencido = { ...base0, id: base0.id.slice(0, -4) + "e003", cuenta: "nuevo-medio", estado: "programado", programado: "2026-09-01T09:00:00-05:00", titular: "Vencido de Nuevo Medio" };
    fs.writeFileSync(path.join(raiz, "posts", `${vencido.id}.json`), JSON.stringify(vencido, null, 2));
    await abrirMaestro(page, base);
    await tarjeta(page, "nuevo-medio").locator('button[data-accion="publicar"]').click();
    await page.waitForSelector("#dialogo-vencidos[open]");
    assert.match(await page.locator("#dv-lista").textContent(), /Vencido de Nuevo Medio/);
    await page.click("#dv-quitar");
    await page.waitForFunction(() => /Publicación de Nuevo Medio: encendida/.test(document.getElementById("aviso").textContent));
    assert.equal(leerJson(path.join(raiz, "posts", `${vencido.id}.json`)).estado, "borrador", "el vencido volvió a borradores");
    assert.deepEqual(leerJson(path.join(raiz, "cuentas/nuevo-medio/config.json")).automatico, { generar: false, publicar: true });
    await tarjeta(page, "nuevo-medio").locator('button[data-accion="publicar"]').click();
    await page.waitForFunction(() => /Publicación de Nuevo Medio: pausada/.test(document.getElementById("aviso").textContent));
    assert.deepEqual(leerJson(path.join(raiz, "cuentas/nuevo-medio/config.json")).automatico, { generar: false, publicar: false });

    // 6. Borrador manual desde el panel de la cuenta.
    await tarjeta(page, "nuevo-medio").locator('button:has-text("Abrir panel")').click();
    await page.waitForSelector("#vista-posts:not([hidden])");
    await page.click("#boton-nuevo-borrador");
    await page.waitForSelector("#dialogo-borrador[open]");
    await page.selectOption("#nb-categoria", "ECONOMÍA");
    await page.fill("#nb-titular", "El Canal cierra un año récord");
    await page.fill("#nb-bajada", "Ingresos por encima de lo previsto");
    await page.fill("#nb-caption", "El Canal de Panamá cerró el año fiscal con ingresos récord.");
    await page.fill("#nb-hashtags", "#Panamá Canal");
    await page.fill("#nb-medio", "La Prensa");
    await page.fill("#nb-url", "https://www.prensa.com/economia/canal");
    await page.click("#nb-crear");
    await page.waitForFunction(() => /Borrador creado/.test(document.getElementById("aviso").textContent));
    assert.equal(await page.evaluate(() => [...document.querySelectorAll("#lista input, #lista textarea")].some((i) => i.value.includes("El Canal cierra un año récord"))), true, "el borrador aparece en la pestaña Borradores con su titular editable");
    const creado = fs.readdirSync(path.join(raiz, "posts")).map((f) => leerJson(path.join(raiz, "posts", f))).find((p) => p.titular === "El Canal cierra un año récord");
    assert.ok(creado); assert.equal(creado.cuenta, "nuevo-medio"); assert.equal(creado.estado, "borrador"); assert.equal(creado.imagen, null);
    assert.deepEqual(creado.hashtags, ["#Panamá", "#Canal"]);

    // 7. Archivar y reactivar: todo apagado; Sin Línea intacta (configuración y cola).
    await page.click("#boton-cuentas");
    await page.waitForSelector("#maestro:not([hidden])");
    page.once("dialog", (d) => d.accept());
    await tarjeta(page, "nuevo-medio").locator('button:has-text("Archivar")').click();
    await page.waitForSelector('#cuentas-archivadas .cuenta-tarjeta[data-cuenta="nuevo-medio"]');
    assert.equal(leerJson(path.join(raiz, "cuentas/nuevo-medio/config.json")).archivada, true);
    await page.locator('#cuentas-archivadas .cuenta-tarjeta[data-cuenta="nuevo-medio"] button:has-text("Reactivar")').click();
    await page.waitForSelector('#cuentas-grid .cuenta-tarjeta[data-cuenta="nuevo-medio"]');
    assert.deepEqual(leerJson(path.join(raiz, "cuentas/nuevo-medio/config.json")).automatico, { generar: false, publicar: false });
    assert.equal(fs.readFileSync(path.join(raiz, "cuentas/sinlinea/config.json"), "utf8"), sinLineaAntes, "Sin Línea no cambió");
    assert.equal(leerJson(path.join(raiz, "posts", `${base0.id.slice(0, -4)}e001.json`)).estado, "programado", "la cola de Sin Línea sigue intacta");
    assert.deepEqual(errores, []);
  } finally {
    await page.close();
    servidor.close();
  }
});

test("(cierre) en móvil las tarjetas, la guía, los interruptores y el borrador manual caben sin desplazamiento horizontal", async () => {
  const { servidor, base } = await montar("cierre-movil-");
  const page = await navegador.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  try {
    await abrirMaestro(page, base, { width: 390, height: 844 });
    const sinScrollH = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    assert.equal(await sinScrollH(), true, "vista de cuentas sin scroll horizontal");
    const t = tarjeta(page, "prueba");
    await t.locator("details.guia-conexion summary").click();
    assert.ok(await t.locator("details.guia-conexion ol li").count() >= 3);
    assert.equal(await sinScrollH(), true, "guía abierta sin scroll horizontal");
    for (const accion of ["generar", "publicar"]) assert.ok(await t.locator(`button[data-accion="${accion}"]`).isVisible());
    await t.locator('button:has-text("Abrir panel")').click();
    await page.waitForSelector("#vista-posts:not([hidden])");
    await page.click("#boton-nuevo-borrador");
    await page.waitForSelector("#dialogo-borrador[open]");
    const caja = await page.locator("#dialogo-borrador").boundingBox();
    assert.ok(caja.width <= 390, `el diálogo cabe en el ancho del móvil (${caja.width})`);
    await page.click("#nb-cancelar");
    await page.click("#boton-metricas");
    await page.waitForSelector("#metricas:not([hidden])");
    assert.equal(await sinScrollH(), true, "vista de métricas sin scroll horizontal (las tablas se desplazan dentro de su contenedor)");
    assert.deepEqual(errores, []);
  } finally {
    await page.close();
    servidor.close();
  }
});
