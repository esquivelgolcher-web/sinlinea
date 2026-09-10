// Multicanal de extremo a extremo con el servidor local y cuentas SIN credenciales: conexión de Facebook (F1) y de
// Threads (F2) con activación segura y guía, pausa general, aprobación con destinos y versiones (contador de Threads),
// chips por destino, omitir, decisión sobre un incierto y reintento. Escritorio y móvil. No contacta con ninguna API.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { crearServidor, shaDeBlob } from "../src/serve.mjs";
import { raizConCuentas } from "./ayuda/cuentas.mjs";
import { hashImagen } from "../src/lib/estados.mjs";

let navegador;
before(async () => { navegador = await chromium.launch(); });
after(async () => { await navegador?.close(); });

const base0 = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));
const leerJson = (ruta) => JSON.parse(fs.readFileSync(ruta, "utf8"));
const iso = "2026-09-10T12:00:00.000Z";
const conImagen = (p) => ({ ...p, imagen: { ruta: `public/img/${p.id}.jpg`, url: `https://prueba.github.io/sinlinea/img/${p.id}.jpg`, hash: hashImagen(p, 1), version: 1, renderizada: iso } });
const destino = (texto, extra = {}) => ({ texto, aprobado: { fecha: iso, hashPieza: "x", imagenHash: null }, estado: "pendiente", publicacion: null, error: null, intento: null, omitido: null, ...extra });

async function montar(prefijo) {
  const raiz = raizConCuentas({ cuentas: ["sinlinea", "prueba"], global: { pages: { baseUrl: "https://prueba.github.io/sinlinea" } }, prefijo });
  for (const d of ["templates", "panel", "src/lib", "public/img", "assets", "tests/fixtures", "data/prueba"]) fs.mkdirSync(path.join(raiz, d), { recursive: true });
  fs.copyFileSync("templates/post.html", path.join(raiz, "templates/post.html"));
  fs.copyFileSync("tests/fixtures/post-ejemplo.json", path.join(raiz, "tests/fixtures/post-ejemplo.json"));
  for (const f of fs.readdirSync("panel")) fs.copyFileSync(path.join("panel", f), path.join(raiz, "panel", f));
  for (const f of fs.readdirSync("src/lib")) fs.copyFileSync(path.join("src/lib", f), path.join(raiz, "src/lib", f));
  fs.mkdirSync(path.join(raiz, ".github/workflows"), { recursive: true });
  for (const w of ["publicar.yml", "probar-instagram.yml"]) fs.copyFileSync(path.join(".github/workflows", w), path.join(raiz, ".github/workflows", w));
  const rutaPr = path.join(raiz, "cuentas/prueba/config.json");
  // F1 Facebook declarado sin verificar; F2 Threads declarado (id y usuario esperado) sin verificar. Todo apagado.
  fs.writeFileSync(rutaPr, JSON.stringify({ ...leerJson(rutaPr), instagram: { origen: "entorno" }, automatico: { generar: false, publicar: false }, conexiones: { facebook: { publicar: false, pagina: "123" }, threads: { publicar: false, usuario: "555", perfil: "prueba.diario" } } }, null, 2) + "\n");
  fs.writeFileSync(path.join(raiz, "data/prueba/conexion.json"), JSON.stringify({ estado: "verificada", usuario: "prueba.diario", comprobado: iso, secretos: { tokenSecreto: "IG_ACCESS_TOKEN", usuarioIdSecreto: "IG_USER_ID", origen: "entorno", entorno: "cuenta-prueba" } }, null, 2));
  const id = (s) => base0.id.slice(0, -4) + s;
  const posts = [
    conImagen({ ...base0, id: id("a001"), cuenta: "prueba", titular: "Borrador para aprobar en dos redes" }),
    conImagen({ ...base0, id: id("a002"), cuenta: "prueba", estado: "programado", programado: "2026-09-11T12:00:00-05:00", titular: "Pieza con Facebook incierto", destinos: { instagram: destino("IG", { estado: "publicado", publicacion: { id: "m1", idPublicacion: null, permalink: "https://www.instagram.com/p/m1/", fecha: iso } }), facebook: destino("FB", { estado: "incierto", intento: { n: 1, fase: "enviando", inicio: iso, actualizado: iso, contenedorId: "ph1", incierto: { motivo: "sin respuesta de Facebook tras enviar la petición", fecha: iso } } }) }, publicacion: { idMedia: "m1", permalink: "https://www.instagram.com/p/m1/", fecha: iso } }),
    conImagen({ ...base0, id: id("a003"), cuenta: "prueba", estado: "error", programado: "2026-09-11T13:00:00-05:00", titular: "Pieza con Facebook en error", error: { paso: "destino", mensaje: "Facebook: (#200) Permissions error", fecha: iso }, destinos: { instagram: destino("IG", { estado: "publicado", publicacion: { id: "m2", idPublicacion: null, permalink: "https://www.instagram.com/p/m2/", fecha: iso } }), facebook: destino("FB", { estado: "error", error: { mensaje: "(#200) Permissions error", fecha: iso, intentos: 1 } }) }, publicacion: { idMedia: "m2", permalink: "https://www.instagram.com/p/m2/", fecha: iso } }),
  ];
  for (const p of posts) fs.writeFileSync(path.join(raiz, "posts", `${p.id}.json`), JSON.stringify(p, null, 2));
  // La imagen renderizada del borrador existe: al aprobar se guarda su huella (sha de blob) y así queda vinculada al archivo.
  fs.copyFileSync("tests/fixtures/ilustracion-ejemplo.jpg", path.join(raiz, "public/img", `${id("a001")}.jpg`));
  const servidor = crearServidor({ raiz });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  return { raiz, servidor, base: `http://127.0.0.1:${servidor.address().port}`, ids: { borrador: id("a001"), incierto: id("a002"), error: id("a003") } };
}

async function abrirMaestro(page, base, viewport = { width: 1200, height: 900 }) {
  await page.setViewportSize(viewport);
  await page.goto(`${base}/panel/`);
  await page.waitForFunction(() => document.querySelector("#cuentas-grid .cuenta-tarjeta") || (document.querySelector("#lista .tarjeta, #lista .vacio") && !/Cargando/.test(document.getElementById("lista").textContent)));
  if (await page.locator("#maestro").isHidden()) await page.click("#boton-cuentas");
  await page.waitForSelector("#cuentas-grid .cuenta-tarjeta");
}
const tarjetaCuenta = (page, id) => page.locator(`.cuenta-tarjeta[data-cuenta="${id}"]`);
const tarjetaPost = (page, id) => page.locator(`.tarjeta[data-id="${id}"]`);
async function abrirPosts(page, pestana) {
  await page.click('.cuenta-tarjeta[data-cuenta="prueba"] button:has-text("Abrir panel")');
  await page.waitForSelector("#vista-posts:not([hidden])");
  await page.click(`#pestanas button:has-text("${pestana}")`);
}

test("(multicanal) escritorio: conexión de Facebook con guía y activación segura, pausa general, aprobación con destinos y versiones, chips, omitir, incierto y reintento", async () => {
  const { raiz, servidor, base, ids } = await montar("multicanal-escritorio-");
  const page = await navegador.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  const cfg = () => leerJson(path.join(raiz, "cuentas/prueba/config.json"));
  const post = (id) => leerJson(path.join(raiz, "posts", `${id}.json`));
  try {
    await abrirMaestro(page, base);
    // 1. Conexión de Facebook sin verificar: guía con nombres exactos y sin valores; encender se niega.
    const t = tarjetaCuenta(page, "prueba");
    assert.match(await t.textContent(), /Facebook: conexión sin verificar/);
    assert.match(await t.textContent(), /Facebook: apagada/);
    assert.match(await t.textContent(), /Guía de conexión con Facebook · Environment cuenta-prueba · FB_PAGE_TOKEN/);
    assert.match(await t.textContent(), /pages_manage_posts/);
    await t.locator('button:has-text("Encender Facebook")').click();
    await page.waitForFunction(() => /No se puede encender Facebook/.test(document.getElementById("aviso").textContent));
    assert.equal(cfg().conexiones.facebook.publicar, false);
    // 2. El workflow Probar destino deja la conexión verificada (simulado): ya se puede encender.
    fs.writeFileSync(path.join(raiz, "data/prueba/conexion-facebook.json"), JSON.stringify({ red: "facebook", estado: "verificada", identidad: { id: "123", nombre: "Mi página" }, comprobado: iso, detalle: null, secretos: { nombres: ["FB_PAGE_TOKEN"], origen: "entorno", entorno: "cuenta-prueba" } }, null, 2));
    await page.reload();
    await page.waitForSelector('.cuenta-tarjeta[data-cuenta="prueba"]');
    assert.match(await tarjetaCuenta(page, "prueba").textContent(), /Facebook: página «Mi página» \(123\) verificada el 2026-09-10 12:00 UTC/);
    await tarjetaCuenta(page, "prueba").locator('button:has-text("Encender Facebook")').click();
    await page.waitForFunction(() => /Facebook de Cuenta de prueba: encendida/.test(document.getElementById("aviso").textContent));
    assert.equal(cfg().conexiones.facebook.publicar, true);
    assert.deepEqual(cfg().automatico, { generar: false, publicar: false }, "el interruptor de Instagram no cambia");
    assert.match(await tarjetaCuenta(page, "prueba").textContent(), /Facebook: activa/);
    // 3. Pausa general explícita, aparte de los interruptores.
    await tarjetaCuenta(page, "prueba").locator('button:has-text("Pausar todo")').click();
    await page.waitForFunction(() => /Pausa general activada/.test(document.getElementById("aviso").textContent));
    assert.equal(cfg().automatico.pausa, true);
    assert.equal(cfg().conexiones.facebook.publicar, true, "la pausa no toca los interruptores");
    assert.match(await tarjetaCuenta(page, "prueba").textContent(), /Pausa general: activa/);
    await tarjetaCuenta(page, "prueba").locator('button:has-text("Reanudar todo")').click();
    await page.waitForFunction(() => /Pausa general desactivada/.test(document.getElementById("aviso").textContent));
    assert.equal(cfg().automatico.pausa, undefined);
    // 4. Aprobar con destinos y versiones: Instagram y Facebook marcados; la versión de Facebook se revisa antes de aprobar.
    await abrirPosts(page, "Borradores");
    await tarjetaPost(page, ids.borrador).locator('button:has-text("Aprobar")').click();
    await page.waitForSelector("dialog[open]");
    assert.equal(await page.isChecked("#destino-instagram"), true);
    assert.equal(await page.isChecked("#destino-facebook"), true);
    assert.match(await page.inputValue("#version-facebook"), /Fuente: La Prensa/);
    assert.doesNotMatch(await page.inputValue("#version-facebook"), /#/, "la propuesta de Facebook no lleva hashtags");
    await page.fill("#version-facebook", "Versión FB revisada por el operador.\n\nFuente: La Prensa");
    await page.fill("#hora-fecha", "2026-09-12"); await page.fill("#hora-hora", "12:00");
    await page.click("#hora-confirmar");
    await page.waitForFunction((id) => !document.querySelector(`.tarjeta[data-id="${id}"]`), ids.borrador);
    const aprobado = post(ids.borrador);
    assert.equal(aprobado.estado, "programado");
    assert.deepEqual(Object.keys(aprobado.destinos), ["instagram", "facebook"]);
    assert.equal(aprobado.destinos.facebook.texto, "Versión FB revisada por el operador.\n\nFuente: La Prensa");
    assert.equal(aprobado.destinos.facebook.aprobado.imagenHash, aprobado.imagen.hash, "la imagen aprobada queda registrada");
    assert.equal(aprobado.destinos.facebook.aprobado.imagenSha, shaDeBlob(fs.readFileSync(path.join(raiz, "public/img", `${ids.borrador}.jpg`))), "la imagen aprobada queda vinculada a la huella del archivo");
    assert.match(aprobado.destinos.instagram.texto, /Fuente: La Prensa/);
    // 5. Chips por destino, versiones por red y omitir explícito.
    await page.click('#pestanas button:has-text("Programados")');
    const tp = tarjetaPost(page, ids.borrador);
    assert.match(await tp.textContent(), /Instagram: en espera \(conexión apagada\)/, "apagar no es omitir: la entrega de Instagram espera");
    assert.match(await tp.textContent(), /Facebook: pendiente/);
    await tp.locator('button:has-text("Omitir en Facebook")').click();
    await page.waitForFunction((id) => /Facebook: omitido/.test(document.querySelector(`.tarjeta[data-id="${id}"]`).textContent), ids.borrador);
    assert.equal(post(ids.borrador).destinos.facebook.estado, "omitido");
    assert.equal(post(ids.borrador).estado, "programado");
    // 6. Incierto: se conserva hasta la decisión manual; marcar como publicado con el enlace.
    const ti = tarjetaPost(page, ids.incierto);
    assert.match(await ti.textContent(), /Facebook: incierto/);
    assert.match(await ti.textContent(), /sin respuesta de Facebook/);
    await ti.locator('button:has-text("Decidir Facebook")').click();
    await page.waitForSelector("#dialogo-incierto[open]");
    await page.fill("#di-enlace", "https://www.facebook.com/123/posts/456");
    await page.click("#di-publicado");
    await page.waitForFunction((id) => /Facebook: publicado/.test(document.querySelector(`.tarjeta[data-id="${id}"]`)?.textContent || "") || !document.querySelector(`.tarjeta[data-id="${id}"]`), ids.incierto);
    const decidido = post(ids.incierto);
    assert.equal(decidido.destinos.facebook.estado, "publicado");
    assert.equal(decidido.destinos.facebook.publicacion.permalink, "https://www.facebook.com/123/posts/456");
    assert.equal(decidido.estado, "publicado", "con Instagram y Facebook publicados la pieza está completa");
    // 7. Error de destino: reintentar solo vuelve a pendiente el fallido.
    await page.click('#pestanas button:has-text("Errores")');
    const te = tarjetaPost(page, ids.error);
    assert.match(await te.textContent(), /Facebook: error/);
    await te.locator('button:has-text("Reintentar")').click();
    await page.waitForFunction((id) => !document.querySelector(`.tarjeta[data-id="${id}"]`), ids.error);
    const reintentado = post(ids.error);
    assert.equal(reintentado.estado, "programado");
    assert.equal(reintentado.destinos.facebook.estado, "pendiente");
    assert.equal(reintentado.destinos.instagram.estado, "publicado");
    assert.deepEqual(errores, []);
  } finally {
    await page.close();
    servidor.close();
  }
});

test("(multicanal) móvil: la tarjeta de cuenta muestra las conexiones y el diálogo de aprobación con destinos cabe y funciona", async () => {
  const { raiz, servidor, base, ids } = await montar("multicanal-movil-");
  fs.writeFileSync(path.join(raiz, "data/prueba/conexion-facebook.json"), JSON.stringify({ red: "facebook", estado: "verificada", identidad: { id: "123", nombre: "Mi página" }, comprobado: iso, detalle: null, secretos: { nombres: ["FB_PAGE_TOKEN"], origen: "entorno", entorno: "cuenta-prueba" } }, null, 2));
  const page = await navegador.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  try {
    await abrirMaestro(page, base, { width: 390, height: 844 });
    assert.match(await tarjetaCuenta(page, "prueba").textContent(), /Facebook: página «Mi página»/);
    const anchoDoc = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(anchoDoc <= 390, `sin desbordamiento horizontal (${anchoDoc})`);
    await abrirPosts(page, "Borradores");
    await tarjetaPost(page, ids.borrador).locator('button:has-text("Aprobar")').click();
    await page.waitForSelector("dialog[open]");
    const caja = await page.locator("dialog[open]").boundingBox();
    assert.ok(caja.width <= 390, "el diálogo cabe en la pantalla");
    await page.click("#hora-confirmar");
    await page.waitForFunction((id) => !document.querySelector(`.tarjeta[data-id="${id}"]`), ids.borrador);
    assert.equal(leerJson(path.join(raiz, "posts", `${ids.borrador}.json`)).estado, "programado");
    assert.deepEqual(errores, []);
  } finally {
    await page.close();
    servidor.close();
  }
});

test("(F2) Threads en el panel: conexión con guía (User Token Generator) y activación segura independiente, formulario con id y usuario del perfil, aprobación con contador de Threads que bloquea si excede y chips", async () => {
  const { raiz, servidor, base, ids } = await montar("multicanal-threads-");
  const page = await navegador.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  const cfg = () => leerJson(path.join(raiz, "cuentas/prueba/config.json"));
  const post = (id) => leerJson(path.join(raiz, "posts", `${id}.json`));
  try {
    await abrirMaestro(page, base);
    // 1. Sin verificar: guía con nombres exactos (sin valores) y encender se niega.
    const t = tarjetaCuenta(page, "prueba");
    const texto = await t.textContent();
    assert.match(texto, /Threads: conexión sin verificar/);
    assert.match(texto, /Threads: apagada/);
    assert.match(texto, /Guía de conexión con Threads · Environment cuenta-prueba · THREADS_ACCESS_TOKEN/);
    assert.match(texto, /Access the Threads API/);
    assert.match(texto, /User Token Generator/);
    assert.match(texto, /threads_content_publish/);
    assert.equal(await t.locator('details.guia-red[data-red="threads"] a:has-text("Ajustes de Threads")').count(), 1);
    await t.locator('button:has-text("Encender Threads")').click();
    await page.waitForFunction(() => /No se puede encender Threads/.test(document.getElementById("aviso").textContent));
    assert.equal(cfg().conexiones.threads.publicar, false);
    // 2. Verificación simulada del workflow Probar destino (red threads): ya se puede encender; Facebook e Instagram no cambian.
    fs.writeFileSync(path.join(raiz, "data/prueba/conexion-threads.json"), JSON.stringify({ red: "threads", estado: "verificada", identidad: { id: "555", nombre: "@prueba.diario" }, comprobado: iso, detalle: null, secretos: { nombres: ["THREADS_ACCESS_TOKEN"], origen: "entorno", entorno: "cuenta-prueba" } }, null, 2));
    await page.reload();
    await page.waitForSelector('.cuenta-tarjeta[data-cuenta="prueba"]');
    assert.match(await tarjetaCuenta(page, "prueba").textContent(), /Threads: perfil «@prueba\.diario» \(555\) verificado el 2026-09-10 12:00 UTC/);
    assert.match(await tarjetaCuenta(page, "prueba").textContent(), /Facebook: conexión sin verificar/, "la verificación de Threads no vale para Facebook");
    await tarjetaCuenta(page, "prueba").locator('button:has-text("Encender Threads")').click();
    await page.waitForFunction(() => /Threads de Cuenta de prueba: encendida/.test(document.getElementById("aviso").textContent));
    assert.equal(cfg().conexiones.threads.publicar, true);
    assert.equal(cfg().conexiones.facebook.publicar, false, "el interruptor de Facebook no cambia");
    assert.deepEqual(cfg().automatico, { generar: false, publicar: false }, "el de Instagram tampoco");
    assert.match(await tarjetaCuenta(page, "prueba").textContent(), /Threads: activa/);
    // 3. Formulario: el perfil de Threads se lee y se muestra; ningún token.
    await tarjetaCuenta(page, "prueba").locator('button:has-text("Editar")').click();
    await page.waitForSelector("#form-cuenta:not([hidden]) #fc-threads, #fc-threads");
    assert.equal(await page.inputValue("#fc-th-usuario"), "555");
    assert.equal(await page.inputValue("#fc-th-perfil"), "prueba.diario");
    assert.equal(await page.isChecked("#fc-th-publicar"), true);
    assert.equal(await page.isChecked("#fc-fb-publicar"), false);
    await page.click("#fc-cancelar");
    await page.waitForSelector("#cuentas-grid .cuenta-tarjeta");
    // 4. Aprobar: Threads marcado (encendido y verificado), Facebook no disponible; el contador cuenta los emojis por bytes y bloquea si excede.
    await abrirPosts(page, "Borradores");
    await tarjetaPost(page, ids.borrador).locator('button:has-text("Aprobar")').click();
    await page.waitForSelector("dialog[open]");
    assert.equal(await page.isChecked("#destino-threads"), true);
    assert.equal(await page.isChecked("#destino-facebook"), false);
    assert.equal(await page.isDisabled("#destino-facebook"), true);
    assert.match(await page.inputValue("#version-threads"), /Fuente: La Prensa/);
    const contador = page.locator(".destino-fila:has(#version-threads) .contador");
    await page.fill("#version-threads", "a".repeat(497) + "😀");
    assert.match(await contador.textContent(), /^501\/500/);
    assert.match(await contador.getAttribute("class"), /excede/);
    await page.fill("#hora-fecha", "2026-09-12"); await page.fill("#hora-hora", "12:00");
    await page.click("#hora-confirmar");
    await page.waitForFunction(() => /Revisa la versión de Threads/.test(document.getElementById("hora-nota").textContent));
    assert.equal(await page.locator("dialog[open]").count(), 1, "no se aprueba con una versión que excede; no se recorta");
    assert.equal(post(ids.borrador).estado, "borrador");
    await page.fill("#version-threads", "Texto Threads 😀\n\nFuente: La Prensa");
    assert.match(await contador.textContent(), /^37\/500/, "el emoji cuenta 4 bytes");
    await page.click("#hora-confirmar");
    await page.waitForFunction((id) => !document.querySelector(`.tarjeta[data-id="${id}"]`), ids.borrador);
    const aprobado = post(ids.borrador);
    assert.equal(aprobado.estado, "programado");
    assert.deepEqual(Object.keys(aprobado.destinos), ["instagram", "threads"], "Facebook (no disponible) no se añade");
    assert.equal(aprobado.destinos.threads.texto, "Texto Threads 😀\n\nFuente: La Prensa");
    assert.equal(aprobado.destinos.threads.estado, "pendiente");
    assert.equal(aprobado.destinos.threads.aprobado.imagenSha, shaDeBlob(fs.readFileSync(path.join(raiz, "public/img", `${ids.borrador}.jpg`))), "la imagen aprobada queda vinculada a la huella del archivo también para Threads");
    // 5. Chips por destino y omitir en Threads.
    await page.click('#pestanas button:has-text("Programados")');
    const tp = tarjetaPost(page, ids.borrador);
    assert.match(await tp.textContent(), /Threads: pendiente/);
    assert.match(await tp.textContent(), /Instagram: en espera \(conexión apagada\)/);
    await tp.locator('button:has-text("Omitir en Threads")').click();
    await page.waitForFunction((id) => /Threads: omitido/.test(document.querySelector(`.tarjeta[data-id="${id}"]`).textContent), ids.borrador);
    assert.equal(post(ids.borrador).destinos.threads.estado, "omitido");
    assert.equal(post(ids.borrador).destinos.instagram.estado, "pendiente");
    assert.deepEqual(errores, []);
  } finally {
    await page.close();
    servidor.close();
  }
});
