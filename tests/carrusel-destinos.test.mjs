import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { aprobarDestinos, destinosDe, imagenCambiada, aprobarImagenActual, avanzarIntento, reservarDestino, validarDestinos, esCarrusel, imagenesDe, LIMITES_CARRUSEL } from "../src/lib/destinos.mjs";
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
  assert.deepEqual(FORMATOS_PUBLICABLES, ["post", "carrusel"]);
  assert.equal(esPublicable("carrusel"), true);
  assert.equal(esPublicable("reel"), false);
  assert.deepEqual(LIMITES_CARRUSEL, { min: 2, max: 10 });
  assert.equal(esCarrusel(carrusel()), true);
  assert.equal(esCarrusel({ ...carrusel(), carrusel: { diapositivas, imagenes: [] } }), false, "sin imágenes renderizadas no es un carrusel publicable");
  assert.equal(esCarrusel({ ...carrusel(), formato: "post" }), false);
  assert.deepEqual(imagenesDe(carrusel()).map((i) => i.numero), [1, 2, 3], "en orden de diapositiva");
  assert.deepEqual(imagenesDe(conImagen(base)).map((i) => i.url), [conImagen(base).imagen.url], "un post normal expone su única imagen");
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
