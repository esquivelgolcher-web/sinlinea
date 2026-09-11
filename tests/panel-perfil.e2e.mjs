// Perfil editorial en el panel: la tarjeta de un borrador muestra formato, alertas, afirmaciones, fuentes con alcance,
// diapositivas del carrusel y guion del reel; el carrusel se programa con la huella de cada diapositiva aprobada en su
// orden (y «Aprobar imágenes actuales» cuando cambian); el reel no se puede programar (sin adaptador de publicación).
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
  // Facebook y Threads verificados y encendidos en la cuenta de prueba: el diálogo debe ofrecerlos para un post y, para un
  // carrusel, deshabilitar Facebook con el motivo de validación pendiente.
  const rutaPr = path.join(raiz, "cuentas/prueba/config.json");
  const cfgPr = JSON.parse(fs.readFileSync(rutaPr, "utf8"));
  fs.writeFileSync(rutaPr, JSON.stringify({ ...cfgPr, instagram: { origen: "entorno" }, conexiones: { facebook: { publicar: true, pagina: "123" }, threads: { publicar: true, usuario: "555", perfil: "prueba.diario" } } }, null, 2) + "\n");
  fs.writeFileSync(path.join(raiz, "data/prueba/conexion.json"), JSON.stringify({ estado: "verificada", usuario: "prueba.diario", comprobado: iso, secretos: { tokenSecreto: "IG_ACCESS_TOKEN", usuarioIdSecreto: "IG_USER_ID", origen: "entorno", entorno: "cuenta-prueba" } }, null, 2));
  fs.writeFileSync(path.join(raiz, "data/prueba/conexion-facebook.json"), JSON.stringify({ red: "facebook", estado: "verificada", identidad: { id: "123", nombre: "Página" }, comprobado: iso, detalle: null, secretos: { nombres: ["FB_PAGE_TOKEN"], origen: "entorno", entorno: "cuenta-prueba" } }, null, 2));
  fs.writeFileSync(path.join(raiz, "data/prueba/conexion-threads.json"), JSON.stringify({ red: "threads", estado: "verificada", identidad: { id: "555", nombre: "@prueba.diario" }, comprobado: iso, detalle: null, secretos: { nombres: ["THREADS_ACCESS_TOKEN"], origen: "entorno", entorno: "cuenta-prueba" } }, null, 2));
  const id = (s) => base0.id.slice(0, -4) + s;
  const diapositivas = [{ titulo: "¿Una foto basta para identificarte?", texto: "Una pregunta." }, { titulo: "Qué ocurrió", texto: "Los hechos." }, { titulo: "Qué falta por saber", texto: "Fuentes." }];
  const imagenesDe = (pid) => diapositivas.map((_, i) => ({ numero: i + 1, ruta: `public/img/${pid}-0${i + 1}.jpg`, url: `https://prueba.github.io/sinlinea/img/${pid}-0${i + 1}.jpg`, hash: `${"abc"[i]}`.repeat(16) }));
  const posts = [
    conImagen({ ...base0, id: id("b001"), cuenta: "prueba", titular: "Post del perfil", formato: "post", ...perfilComun }),
    conImagen({ ...base0, id: id("b002"), cuenta: "prueba", titular: "Carrusel del perfil", formato: "carrusel", ...perfilComun, alertas: ["fuente-unica"], carrusel: { diapositivas, imagenes: imagenesDe(id("b002")), hash: "c".repeat(16), version: 1 } }),
    conImagen({ ...base0, id: id("b003"), cuenta: "prueba", titular: "Reel del perfil", formato: "reel", ...perfilComun, alertas: [], reel: { narracion: "Un hecho concreto abre el vídeo. " + "Palabra ".repeat(90).trim(), subtitulos: ["Frase uno", "Frase dos"], escenas: [{ segundos: 0, descripcion: "Apertura con la ilustración", recurso: "ilustración generada" }], recursos: ["voz en off", "ilustración"], duracionObjetivo: "35-60 s" } }),
    // Pieza ya publicada en Instagram (post): desde la interfaz se le añade Threads sin tocar lo publicado.
    conImagen({ ...base0, id: id("b005"), cuenta: "prueba", titular: "Post publicado en Instagram al que se añade Threads", formato: "post", ...perfilComun, alertas: [], estado: "publicado", programado: "2026-09-10T08:00:00-05:00",
      destinos: { instagram: { texto: "IG publicado", aprobado: { fecha: iso, hashPieza: "x", imagenHash: null, imagenSha: "9".repeat(40) }, estado: "publicado", publicacion: { id: "m5", idPublicacion: null, permalink: "https://www.instagram.com/p/m5/", fecha: iso }, error: null, intento: null, omitido: null } },
      publicacion: { idMedia: "m5", permalink: "https://www.instagram.com/p/m5/", fecha: iso } }),
    // Carrusel ya publicado en Instagram: al añadir destino, Threads se ofrece y Facebook no (carrusel).
    conImagen({ ...base0, id: id("b006"), cuenta: "prueba", titular: "Carrusel publicado en Instagram", formato: "carrusel", ...perfilComun, alertas: [], estado: "publicado", programado: "2026-09-10T09:00:00-05:00", carrusel: { diapositivas, imagenes: imagenesDe(id("b006")), hash: "e".repeat(16), version: 1 },
      destinos: { instagram: { texto: "IG carrusel", aprobado: { fecha: iso, hashPieza: "x", imagenHash: null, imagenSha: "8".repeat(40), imagenesSha: ["1".repeat(40), "2".repeat(40), "3".repeat(40)] }, estado: "publicado", publicacion: { id: "m6", idPublicacion: null, permalink: "https://www.instagram.com/p/m6/", fecha: iso }, error: null, intento: null, omitido: null } },
      publicacion: { idMedia: "m6", permalink: "https://www.instagram.com/p/m6/", fecha: iso } }),
    // Carrusel ya programado cuyas diapositivas se volvieron a renderizar: el publicador lo dejó en espera (imagen-cambiada).
    conImagen({ ...base0, id: id("b004"), cuenta: "prueba", titular: "Carrusel programado con diapositivas cambiadas", formato: "carrusel", ...perfilComun, alertas: [], estado: "programado", programado: "2026-09-12T14:00:00-05:00", carrusel: { diapositivas, imagenes: imagenesDe(id("b004")), hash: "d".repeat(16), version: 2 },
      destinos: { instagram: { texto: "IG aprobado", aprobado: { fecha: iso, hashPieza: "x", imagenHash: null, imagenSha: "0".repeat(40), imagenesSha: ["1".repeat(40), "2".repeat(40), "3".repeat(40)] }, estado: "pendiente", publicacion: null, error: null, intento: null, omitido: null, espera: { motivo: "imagen-cambiada", fecha: iso } } } }),
  ];
  for (const p of posts) fs.writeFileSync(path.join(raiz, "posts", `${p.id}.json`), JSON.stringify(p, null, 2));
  // Archivos renderizados: la imagen de cada carrusel y sus tres diapositivas, todas distintas (huellas distintas).
  const ejemplo = fs.readFileSync("tests/fixtures/ilustracion-ejemplo.jpg");
  for (const pid of [id("b002"), id("b004"), id("b006")]) {
    fs.writeFileSync(path.join(raiz, "public/img", `${pid}.jpg`), ejemplo);
    for (let n = 1; n <= 3; n++) fs.writeFileSync(path.join(raiz, "public/img", `${pid}-0${n}.jpg`), Buffer.concat([ejemplo, Buffer.from([n, pid === id("b004") ? 1 : pid === id("b006") ? 2 : 0])]));
  }
  fs.writeFileSync(path.join(raiz, "public/img", `${id("b005")}.jpg`), Buffer.concat([ejemplo, Buffer.from([5, 5])]));
  const servidor = crearServidor({ raiz });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  return { raiz, servidor, base: `http://127.0.0.1:${servidor.address().port}`, ids: { post: id("b001"), carrusel: id("b002"), reel: id("b003"), carruselEspera: id("b004"), publicado: id("b005"), carruselPublicado: id("b006") } };
}
const huellaDe = (raiz, ruta) => shaDeBlob(fs.readFileSync(path.join(raiz, ...ruta.split("/"))));
const leerPost = (raiz, id) => JSON.parse(fs.readFileSync(path.join(raiz, "posts", `${id}.json`), "utf8"));
const tarjeta = (page, id) => page.locator(`.tarjeta[data-id="${id}"]`);

test("(perfil) la tarjeta muestra formato, alertas explicadas, puntuación, afirmaciones con tipo y fuente, fuentes con alcance, carrusel y guion del reel; el carrusel se programa con la huella de cada diapositiva y el reel no", async () => {
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
    // Carrusel: chip de formato, diapositivas con imagen; Aprobar abre el diálogo y programa con la huella de cada diapositiva.
    const tc = tarjeta(page, ids.carrusel);
    assert.match(await tc.locator(".chip.formato").textContent(), /Carrusel/);
    await tc.locator("details.perfil summary").click();
    const textoCarrusel = await tc.textContent();
    assert.match(textoCarrusel, /Carrusel: 3 diapositivas/);
    assert.match(textoCarrusel, /¿Una foto basta para identificarte\?.*Una pregunta\./);
    assert.equal(await tc.locator("img.diapositiva").count(), 3);
    await tc.locator('button:has-text("Aprobar")').click();
    await page.waitForSelector("dialog[open]");
    // Instagram y Threads disponibles; Facebook deshabilitado con el motivo de validación pendiente (solo imágenes individuales).
    assert.equal(await page.isChecked("#destino-instagram"), true);
    assert.equal(await page.isChecked("#destino-threads"), true);
    assert.equal(await page.isChecked("#destino-facebook"), false);
    assert.equal(await page.isDisabled("#destino-facebook"), true);
    assert.match(await page.locator("#hora-destinos").textContent(), /Facebook · no disponible: Facebook: la publicación de carruseles \(varias fotos en una entrada\) está pendiente de validación real; en Facebook solo se publican imágenes individuales\./);
    await page.uncheck("#destino-threads");
    await page.fill("#hora-fecha", "2026-09-12"); await page.fill("#hora-hora", "12:00");
    await page.click("#hora-confirmar");
    await page.waitForFunction((id) => !document.querySelector(`.tarjeta[data-id="${id}"]`), ids.carrusel);
    const aprobado = leerPost(raiz, ids.carrusel);
    assert.equal(aprobado.estado, "programado");
    assert.deepEqual(Object.keys(aprobado.destinos), ["instagram"], "solo Instagram: Threads se desmarcó y Facebook no se ofrece para carruseles");
    const esperadas = [1, 2, 3].map((n) => huellaDe(raiz, `public/img/${ids.carrusel}-0${n}.jpg`));
    assert.equal(new Set(esperadas).size, 3, "las tres diapositivas son archivos distintos");
    assert.deepEqual(aprobado.destinos.instagram.aprobado.imagenesSha, esperadas, "queda aprobada la huella de cada diapositiva, en su orden");
    assert.equal(aprobado.destinos.instagram.aprobado.imagenSha, huellaDe(raiz, `public/img/${ids.carrusel}.jpg`), "y la de la imagen del post");
    // Carrusel programado en espera porque las diapositivas cambiaron: aviso propio y «Aprobar imágenes actuales» fija las huellas nuevas.
    await page.click('#pestanas button:has-text("Programados")');
    const te = tarjeta(page, ids.carruselEspera);
    assert.match(await te.textContent(), /Instagram: en espera \(las diapositivas cambiaron tras aprobar\)/);
    await te.locator("details.versiones summary").click();
    assert.match(await te.textContent(), /Alguna diapositiva cambió \(o cambió su orden\) después de aprobar: no se publicará hasta que apruebes las imágenes actuales/);
    await te.locator('button:has-text("Aprobar imágenes actuales")').click();
    await page.waitForFunction((id) => !/en espera/.test(document.querySelector(`.tarjeta[data-id="${id}"]`)?.textContent || ""), ids.carruselEspera);
    const fijado = leerPost(raiz, ids.carruselEspera);
    assert.deepEqual(fijado.destinos.instagram.aprobado.imagenesSha, [1, 2, 3].map((n) => huellaDe(raiz, `public/img/${ids.carruselEspera}-0${n}.jpg`)));
    assert.equal(fijado.destinos.instagram.aprobado.imagenSha, huellaDe(raiz, `public/img/${ids.carruselEspera}.jpg`));
    assert.equal(fijado.destinos.instagram.espera, null, "aprobar las imágenes actuales levanta la espera");
    await page.click('#pestanas button:has-text("Borradores")');
    // Reel: guion visible (narración, subtítulos, escenas, recursos); no se programa.
    const tr = tarjeta(page, ids.reel);
    await tr.locator("details.perfil summary").click();
    const textoReel = await tr.textContent();
    assert.match(textoReel, /Guion del reel · 35-60 s · narración de 96 palabras/);
    assert.match(textoReel, /Frase uno/);
    assert.match(textoReel, /0s · Apertura con la ilustración · recurso: ilustración generada/);
    assert.match(textoReel, /Recursos: voz en off; ilustración/);
    await tr.locator('button:has-text("Aprobar")').click();
    await page.waitForFunction((id) => /Reel: El reel no tiene todavía adaptador de publicación/.test(document.querySelector(`.tarjeta[data-id="${id}"] .aviso-tarjeta`)?.textContent || ""), ids.reel);
    assert.equal(await page.locator("dialog[open]").count(), 0, "no se abre el diálogo de programación");
    // Un post normal sí ofrece Facebook (la restricción es solo para carruseles).
    const tp2 = tarjeta(page, ids.post);
    await tp2.locator('button:has-text("Aprobar")').click();
    await page.waitForSelector("dialog[open]");
    assert.equal(await page.isDisabled("#destino-facebook"), false);
    assert.equal(await page.isChecked("#destino-facebook"), true);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("dialog[open]"));
    assert.equal(JSON.parse(fs.readFileSync(path.join(raiz, "posts", `${ids.reel}.json`), "utf8")).estado, "borrador");
    assert.deepEqual(errores, []);
  } finally {
    await page.close();
    servidor.close();
  }
});

test("(destinos) añadir un destino a una pieza ya publicada desde la interfaz: solo destinos nuevos, texto e imagen revisados y hora aprobada; lo publicado queda intacto; «Quitar de la cola» retira solo lo pendiente", async () => {
  const { raiz, servidor, base, ids } = await montar("panel-anadir-destino-");
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
    // «Generar ahora» junto a «Nuevo borrador»: en local no hay corridas; el aviso lo explica y no cambia nada.
    await page.click('#boton-generar-ahora');
    await page.waitForFunction(() => /En local no se lanzan corridas/.test(document.getElementById("aviso").textContent));
    await page.click('#pestanas button:has-text("Publicados")');
    await page.waitForSelector(".tarjeta");
    const antes = leerPost(raiz, ids.publicado);
    // 1. Post publicado en Instagram: «Añadir destino» abre el diálogo con Instagram fijo y las redes nuevas disponibles.
    const tp = tarjeta(page, ids.publicado);
    assert.equal(await tp.locator('button:has-text("Aprobar")').count(), 0, "una pieza publicada no se vuelve a aprobar");
    await tp.locator('button:has-text("Añadir destino")').click();
    await page.waitForSelector("dialog[open]");
    const textoDialogo = await page.locator("#hora-destinos").textContent();
    assert.match(textoDialogo, /Instagram: publicado \(no cambia\)/);
    assert.equal(await page.locator("#destino-instagram").count(), 0, "Instagram no se ofrece de nuevo");
    assert.equal(await page.isChecked("#destino-threads"), true);
    assert.equal(await page.isChecked("#destino-facebook"), true);
    assert.match(await page.inputValue("#version-threads"), /Según La Prensa|Fuente: La Prensa/);
    await page.uncheck("#destino-facebook");
    await page.fill("#version-threads", "Versión para Threads revisada por el operador.\n\nFuente: La Prensa");
    await page.fill("#hora-fecha", "2026-09-12"); await page.fill("#hora-hora", "12:00");
    await page.click("#hora-confirmar");
    await page.waitForFunction((id) => !document.querySelector(`.tarjeta[data-id="${id}"]`), ids.publicado);
    const despues = leerPost(raiz, ids.publicado);
    assert.equal(despues.estado, "programado", "vuelve a la cola solo por la entrega nueva");
    assert.equal(despues.programado, "2026-09-12T12:00:00-05:00");
    assert.deepEqual(despues.destinos.instagram, antes.destinos.instagram, "la entrega publicada queda intacta");
    assert.deepEqual(despues.publicacion, antes.publicacion);
    assert.deepEqual(Object.keys(despues.destinos), ["instagram", "threads"]);
    assert.equal(despues.destinos.threads.estado, "pendiente");
    assert.equal(despues.destinos.threads.texto, "Versión para Threads revisada por el operador.\n\nFuente: La Prensa");
    assert.equal(despues.destinos.threads.aprobado.imagenSha, huellaDe(raiz, `public/img/${ids.publicado}.jpg`), "la imagen revisada queda vinculada a su huella");
    // 2. En Programados: chips de ambas redes; «Quitar de la cola» retira solo Threads y la pieza vuelve a Publicados intacta.
    await page.click('#pestanas button:has-text("Programados")');
    const tq = tarjeta(page, ids.publicado);
    assert.match(await tq.textContent(), /Instagram: publicado/);
    assert.match(await tq.textContent(), /Threads: pendiente/);
    await tq.locator('button:has-text("Quitar de la cola")').click();
    await page.waitForFunction((id) => !document.querySelector(`.tarjeta[data-id="${id}"]`), ids.publicado);
    const fuera = leerPost(raiz, ids.publicado);
    assert.equal(fuera.estado, "publicado");
    assert.deepEqual(Object.keys(fuera.destinos), ["instagram"]);
    assert.deepEqual(fuera.destinos.instagram, antes.destinos.instagram);
    // 3. Carrusel publicado: Threads se ofrece; Facebook queda deshabilitado con su motivo (sigue fuera de los carruseles).
    await page.click('#pestanas button:has-text("Publicados")');
    const tc = tarjeta(page, ids.carruselPublicado);
    await tc.locator('button:has-text("Añadir destino")').click();
    await page.waitForSelector("dialog[open]");
    assert.equal(await page.isChecked("#destino-threads"), true);
    assert.equal(await page.isDisabled("#destino-facebook"), true);
    assert.match(await page.locator("#hora-destinos").textContent(), /pendiente de validación real/);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("dialog[open]"));
    assert.equal(leerPost(raiz, ids.carruselPublicado).estado, "publicado", "cancelar no cambia nada");
    assert.deepEqual(errores, []);
  } finally {
    await page.close();
    servidor.close();
  }
});
