import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { aprobarDestinos, destinosDe, imagenCambiada, aprobarImagenActual, avanzarIntento, reservarDestino, validarDestinos, esCarrusel, imagenesDe, LIMITES_CARRUSEL, CARRUSEL_POR_RED, REDES_CARRUSEL, validarCarruselPara, marcarDestinoPublicado, marcarDestinoIncierto, quitarDeColaDestinos } from "../src/lib/destinos.mjs";
import { esPublicable, FORMATOS_PUBLICABLES } from "../src/lib/formatos.mjs";
import { validarPost } from "../src/lib/posts.mjs";
import { hashImagen } from "../src/lib/estados.mjs";

const base = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));
const iso = "2026-09-10T19:00:00.000Z";
const conImagen = (p) => ({ ...p, imagen: { ruta: `public/img/${p.id}.jpg`, url: `https://u.github.io/sinlinea/img/${p.id}.jpg`, hash: hashImagen(p, 1), version: 1, renderizada: iso } });
const diapositivas = [{ titulo: "¿Una foto basta?", texto: "a" }, { titulo: "Qué ocurrió", texto: "b" }, { titulo: "Qué falta por saber", texto: "c" }];
const imagenes = (id) => diapositivas.map((_, i) => ({ numero: i + 1, ruta: `public/img/${id}-0${i + 1}.jpg`, url: `https://u.github.io/sinlinea/img/${id}-0${i + 1}.jpg`, hash: `h${i + 1}` }));
const carrusel = () => conImagen({ ...base, id: base.id.slice(0, -4) + "0c01", formato: "carrusel", carrusel: { diapositivas, imagenes: imagenes(base.id.slice(0, -4) + "0c01"), hash: "x" } });
const shas = ["a".repeat(40), "b".repeat(40), "c".repeat(40)];

test("(carrusel) el carrusel pasa a ser publicable; el reel no; esCarrusel exige al menos dos diapositivas renderizadas y como máximo diez", () => {
  assert.deepEqual(FORMATOS_PUBLICABLES, ["post", "carrusel", "frase"]);
  assert.equal(esPublicable("carrusel"), true);
  assert.equal(esPublicable("reel"), false);
  assert.deepEqual(LIMITES_CARRUSEL, { min: 2, max: 10 });
  assert.equal(esCarrusel(carrusel()), true);
  assert.equal(esCarrusel({ ...carrusel(), carrusel: { diapositivas, imagenes: [] } }), false, "sin imágenes renderizadas no es un carrusel publicable");
  assert.equal(esCarrusel({ ...carrusel(), formato: "post" }), false);
  assert.deepEqual(imagenesDe(carrusel()).map((i) => i.numero), [1, 2, 3], "en orden de diapositiva");
  assert.deepEqual(imagenesDe(conImagen(base)).map((i) => i.url), [conImagen(base).imagen.url], "un post normal expone su única imagen");
});

test("(carrusel) límites por red con su documentación oficial: Instagram hasta 10 y solo JPEG, Threads entre 2 y 20; Facebook no admite carruseles (validación real pendiente) y se explica", () => {
  assert.deepEqual(REDES_CARRUSEL, ["instagram", "threads"]);
  assert.equal(CARRUSEL_POR_RED.instagram.max, 10);
  assert.equal(CARRUSEL_POR_RED.instagram.min, 2);
  assert.deepEqual(CARRUSEL_POR_RED.instagram.formatos, ["jpg"]);
  assert.match(CARRUSEL_POR_RED.instagram.doc, /^https:\/\/developers\.facebook\.com\/docs\/instagram-platform\//);
  assert.equal(CARRUSEL_POR_RED.threads.max, 20);
  assert.equal(CARRUSEL_POR_RED.threads.min, 2);
  assert.match(CARRUSEL_POR_RED.threads.doc, /^https:\/\/developers\.facebook\.com\/docs\/threads\//);
  assert.equal(CARRUSEL_POR_RED.facebook, null);
  const p = carrusel();
  assert.deepEqual(validarCarruselPara(p, "instagram"), { ok: true, motivo: null });
  assert.deepEqual(validarCarruselPara(p, "threads"), { ok: true, motivo: null });
  const fb = validarCarruselPara(p, "facebook");
  assert.equal(fb.ok, false);
  assert.match(fb.motivo, /Facebook.*pendiente de validación real.*imágenes individuales/);
  // Sin diapositivas renderizadas (o con menos de las previstas) no se aprueba: espera al render.
  const sinRender = { ...p, carrusel: { ...p.carrusel, imagenes: [] } };
  assert.equal(validarCarruselPara(sinRender, "instagram").ok, false);
  assert.match(validarCarruselPara(sinRender, "instagram").motivo, /3 diapositivas.*0 renderizadas/);
  // Más de diez diapositivas: Instagram no; el sistema tampoco (límite común LIMITES_CARRUSEL), aunque Threads admita 20.
  const once = Array.from({ length: 11 }, (_, i) => ({ titulo: `t${i}`, texto: "x" }));
  const largo = { ...p, carrusel: { diapositivas: once, imagenes: once.map((_, i) => ({ numero: i + 1, ruta: `public/img/x-${String(i + 1).padStart(2, "0")}.jpg`, url: `https://u/x-${i + 1}.jpg`, hash: "h" })), hash: "x" } };
  assert.match(validarCarruselPara(largo, "instagram").motivo, /11 diapositivas.*Instagram admite entre 2 y 10/);
  assert.match(validarCarruselPara(largo, "threads").motivo, /máximo del sistema/);
  // Un archivo que no sea JPEG no vale para Instagram.
  const png = { ...p, carrusel: { ...p.carrusel, imagenes: p.carrusel.imagenes.map((i, k) => (k === 1 ? { ...i, ruta: i.ruta.replace(/\.jpg$/, ".png"), url: i.url.replace(/\.jpg$/, ".png") } : i)) } };
  assert.match(validarCarruselPara(png, "instagram").motivo, /JPEG/);
  // Un post normal no tiene nada que validar.
  assert.deepEqual(validarCarruselPara(conImagen({ ...base }), "facebook"), { ok: true, motivo: null });
});

test("(carrusel) aprobar valida los límites de cada destino: Facebook se rechaza con el motivo de validación pendiente; sin diapositivas renderizadas no se aprueba; Instagram y Threads sí", () => {
  const p = carrusel();
  assert.throws(() => aprobarDestinos(p, "2026-09-11T12:00:00-05:00", { versiones: { instagram: "IG", facebook: "FB" }, imagenSha: shas[0], imagenesSha: shas }, iso), /Facebook.*pendiente de validación real/);
  const sinRender = { ...p, carrusel: { ...p.carrusel, imagenes: [] } };
  assert.throws(() => aprobarDestinos(sinRender, "2026-09-11T12:00:00-05:00", { versiones: { instagram: "IG" }, imagenSha: shas[0] }, iso), /renderizadas/);
  const ok = aprobarDestinos(p, "2026-09-11T12:00:00-05:00", { versiones: { instagram: "IG", threads: "TH" }, imagenSha: shas[0], imagenesSha: shas }, iso);
  assert.deepEqual(Object.keys(destinosDe(ok)), ["instagram", "threads"]);
});

test("(carrusel) una pieza ya publicada en Instagram admite añadir Threads como destino nuevo: Instagram queda intacto, Threads pendiente con las huellas, la pieza vuelve a programado y conserva su publicación; sin destinos nuevos se rechaza", () => {
  const p = aprobarDestinos(carrusel(), "2026-09-10T13:00:00-05:00", { versiones: { instagram: "IG" }, imagenSha: shas[0], imagenesSha: shas }, iso);
  const publicada = marcarDestinoPublicado(p, "instagram", { id: "18215615350355192", permalink: "https://www.instagram.com/p/DdHcfgLIFzl/" }, iso);
  assert.equal(publicada.estado, "publicado");
  const conThreads = aprobarDestinos(publicada, "2026-09-11T09:00:00-05:00", { versiones: { threads: "TH\n\nSegún WIRED" }, imagenSha: shas[0], imagenesSha: shas }, "2026-09-10T20:00:00.000Z");
  const d = destinosDe(conThreads);
  assert.deepEqual(d.instagram, destinosDe(publicada).instagram, "Instagram no cambia: mismo estado, id y enlace");
  assert.equal(d.threads.estado, "pendiente");
  assert.equal(d.threads.texto, "TH\n\nSegún WIRED");
  assert.deepEqual(d.threads.aprobado.imagenesSha, shas);
  assert.equal(conThreads.estado, "programado", "vuelve a la cola solo por la entrega nueva");
  assert.equal(conThreads.programado, "2026-09-11T09:00:00-05:00");
  assert.deepEqual(conThreads.publicacion, { idMedia: "18215615350355192", permalink: "https://www.instagram.com/p/DdHcfgLIFzl/", fecha: iso }, "la publicación de Instagram se conserva");
  // Volver a incluir Instagram no lo reaprueba ni lo cambia; sin ningún destino nuevo, no hay nada que aprobar.
  const otraVez = aprobarDestinos(publicada, "2026-09-11T09:00:00-05:00", { versiones: { instagram: "otro", threads: "TH" }, imagenSha: shas[0], imagenesSha: shas }, iso);
  assert.equal(destinosDe(otraVez).instagram.texto, "IG");
  assert.throws(() => aprobarDestinos(publicada, "2026-09-11T09:00:00-05:00", { versiones: { instagram: "otro" }, imagenSha: shas[0], imagenesSha: shas }, iso), /ningún destino nuevo/);
  // Un carrusel publicado tampoco admite Facebook (sigue fuera).
  assert.throws(() => aprobarDestinos(publicada, "2026-09-11T09:00:00-05:00", { versiones: { facebook: "FB" }, imagenSha: shas[0], imagenesSha: shas }, iso), /pendiente de validación real/);
});

test("(destinos) quitar de la cola una pieza con destinos: retira solo las entregas pendientes, conserva las publicadas (la pieza vuelve a publicado) y se niega si hay una incierta; sin publicadas vuelve a borrador sin destinos", () => {
  const p = aprobarDestinos(carrusel(), "2026-09-10T13:00:00-05:00", { versiones: { instagram: "IG" }, imagenSha: shas[0], imagenesSha: shas }, iso);
  const publicada = marcarDestinoPublicado(p, "instagram", { id: "m1", permalink: "https://www.instagram.com/p/m1/" }, iso);
  const conThreads = aprobarDestinos(publicada, "2026-09-11T09:00:00-05:00", { versiones: { threads: "TH" }, imagenSha: shas[0], imagenesSha: shas }, iso);
  assert.equal(conThreads.estado, "programado");
  const fuera = quitarDeColaDestinos(conThreads, "2026-09-10T21:00:00.000Z");
  assert.equal(fuera.estado, "publicado", "sin entregas pendientes, la pieza vuelve a publicado");
  assert.deepEqual(Object.keys(destinosDe(fuera)), ["instagram"]);
  assert.deepEqual(destinosDe(fuera).instagram, destinosDe(publicada).instagram, "lo publicado no cambia");
  assert.equal(fuera.publicacion.idMedia, "m1");
  // Una entrega incierta pudo salir: hay que decidirla antes de quitar nada.
  const incierta = marcarDestinoIncierto(reservarDestino(conThreads, "threads", { n: 1 }, iso), "threads", { motivo: "corte" }, iso);
  assert.throws(() => quitarDeColaDestinos(incierta, iso), /incierta/);
  // Sin nada publicado ni omitido: vuelve a borrador y sin destinos (como «Quitar de la cola» de siempre).
  const soloPendiente = aprobarDestinos(carrusel(), "2026-09-11T09:00:00-05:00", { versiones: { instagram: "IG", threads: "TH" }, imagenSha: shas[0], imagenesSha: shas }, iso);
  const borrador = quitarDeColaDestinos(soloPendiente, iso);
  assert.equal(borrador.estado, "borrador");
  assert.equal(borrador.programado, null);
  assert.equal(borrador.destinos, undefined);
  assert.throws(() => quitarDeColaDestinos(publicada, iso), /no está en la cola/);
});

test("(carrusel) aprobar guarda la huella de cada diapositiva en orden; el destino recuerda las huellas y el validador las exige como lista", () => {
  const p = aprobarDestinos(carrusel(), "2026-09-11T12:00:00-05:00", { versiones: { instagram: "IG", threads: "TH" }, imagenSha: shas[0], imagenesSha: shas }, iso);
  const d = destinosDe(p);
  assert.deepEqual(d.instagram.aprobado.imagenesSha, shas);
  assert.equal(d.instagram.aprobado.imagenSha, shas[0], "la primera diapositiva es la huella principal");
  assert.deepEqual(d.threads.aprobado.imagenesSha, shas);
  assert.ok(validarPost(p));
  assert.throws(() => validarDestinos({ instagram: { ...d.instagram, aprobado: { ...d.instagram.aprobado, imagenesSha: "no-lista" } } }), /imagenesSha/);
  const sinCarrusel = aprobarDestinos(conImagen(base), "2026-09-11T12:00:00-05:00", { versiones: { instagram: "IG" }, imagenSha: shas[0] }, iso);
  assert.equal(destinosDe(sinCarrusel).instagram.aprobado.imagenesSha, undefined, "un post normal no lleva lista");
});

test("(carrusel) la imagen cambia si cambia cualquier diapositiva o su orden; aprobar las imágenes actuales fija la lista nueva", () => {
  const p = aprobarDestinos(carrusel(), "2026-09-11T12:00:00-05:00", { versiones: { instagram: "IG" }, imagenSha: shas[0], imagenesSha: shas }, iso);
  assert.equal(imagenCambiada(p, "instagram", { imagenSha: shas[0], imagenesSha: shas }), false);
  assert.equal(imagenCambiada(p, "instagram", { imagenSha: shas[0], imagenesSha: [shas[0], shas[1], "d".repeat(40)] }), true, "cambió la tercera");
  assert.equal(imagenCambiada(p, "instagram", { imagenSha: shas[0], imagenesSha: [shas[0], shas[2], shas[1]] }), true, "cambió el orden");
  assert.equal(imagenCambiada(p, "instagram", { imagenSha: shas[0], imagenesSha: shas.slice(0, 2) }), true, "cambió el número de diapositivas");
  const nuevas = [shas[0], shas[1], "d".repeat(40)];
  const q = aprobarImagenActual(p, iso, { imagenSha: nuevas[0], imagenesSha: nuevas });
  assert.deepEqual(destinosDe(q).instagram.aprobado.imagenesSha, nuevas);
  assert.equal(imagenCambiada(q, "instagram", { imagenSha: nuevas[0], imagenesSha: nuevas }), false);
  // Sin huellas a mano (el panel al pintar): un carrusel aprobado sin lista de huellas, o con una lista que no cuadra con
  // sus diapositivas, está sin aprobar; con la lista completa se aplica la comparación normal de la receta.
  const sinLista = aprobarDestinos(carrusel(), "2026-09-11T12:00:00-05:00", { versiones: { instagram: "IG" }, imagenSha: shas[0] }, iso);
  assert.equal(imagenCambiada(sinLista, "instagram"), true, "carrusel aprobado sin huellas de diapositivas: sin aprobar");
  const corta = aprobarDestinos(carrusel(), "2026-09-11T12:00:00-05:00", { versiones: { instagram: "IG" }, imagenSha: shas[0], imagenesSha: shas.slice(0, 2) }, iso);
  assert.equal(imagenCambiada(corta, "instagram"), true, "menos huellas que diapositivas: sin aprobar");
  assert.equal(imagenCambiada(p, "instagram"), false, "lista completa y receta igual: nada que avisar");
});

test("(carrusel) el intento guarda los contenedores hijos además del contenedor padre, y el validador los acepta", () => {
  let p = aprobarDestinos(carrusel(), "2026-09-11T12:00:00-05:00", { versiones: { instagram: "IG" }, imagenSha: shas[0], imagenesSha: shas }, iso);
  p = reservarDestino(p, "instagram", { n: 1 }, iso);
  p = avanzarIntento(p, "instagram", { fase: "contenedor", hijos: ["h1", "h2", "h3"] }, iso);
  assert.deepEqual(destinosDe(p).instagram.intento.hijos, ["h1", "h2", "h3"]);
  assert.equal(destinosDe(p).instagram.intento.contenedorId, null);
  p = avanzarIntento(p, "instagram", { fase: "contenedor", contenedorId: "padre" }, iso);
  assert.deepEqual(destinosDe(p).instagram.intento, { ...destinosDe(p).instagram.intento, contenedorId: "padre", hijos: ["h1", "h2", "h3"] }, "los hijos se conservan al fijar el padre");
  p = avanzarIntento(p, "instagram", { fase: "enviando" }, iso);
  assert.equal(destinosDe(p).instagram.intento.fase, "enviando");
  assert.ok(validarPost(p));
  assert.throws(() => validarDestinos({ instagram: { ...destinosDe(p).instagram, intento: { ...destinosDe(p).instagram.intento, hijos: "h1" } } }), /hijos/);
});
