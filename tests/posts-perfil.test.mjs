import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { validarPost, crearPost, rutaDiapositiva, urlDiapositiva } from "../src/lib/posts.mjs";

const base = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));
const ahora = new Date("2026-09-10T15:00:00Z");
const candidato = { url: "https://www.wired.com/story/clearview/", canonica: "https://www.wired.com/story/clearview/", medio: "WIRED", autor: "Dhruv Mehrotra", idioma: "en", titulo: "Clearview AI Is Testing a Tool", fecha: "2026-09-10T10:00:00.000Z", actualizado: "2026-09-10T12:30:00.000Z", consultado: "2026-09-10T15:00:00.000Z", texto: "t", alcance: "completo", fuentesPrimarias: ["https://www.aclu.org/x"], textoRecuperado: { parrafos: 7, caracteres: 1500 }, prioridad: 1 };
const referencia = { url: "https://www.youtube.com/watch?v=abc", canonica: "https://www.youtube.com/watch?v=abc", medio: "AJ+", autor: "AJ+", idioma: "en", titulo: "How Pegasus works", fecha: "2026-09-10T02:00:00.000Z", consultado: "2026-09-10T15:00:00.000Z", texto: "e", alcance: "fragmento", fuentesPrimarias: [], prioridad: 2 };
const redaccion = {
  categoria: "INVESTIGACIÓN", titular: "Clearview prueba una herramienta para policías", bajada: "Documentos internos", caption: "Caption.", hashtags: ["#Privacidad"], escena: "Escena",
  formato: "carrusel", angulo: "Qué permite y a quién afecta", atribucion: "Según documentos revisados por WIRED", fechaHecho: "2026-09-09",
  afirmaciones: [{ texto: "Clearview prueba la herramienta", tipo: "hecho", fuente: "https://www.wired.com/story/clearview/", contrastada: true }],
  puntuacion: { total: 82, componentes: { afinidad: 27, interes: 20, evidencia: 14, actualidad: 15, visual: 6 } }, alertas: ["fuente-unica"],
  carrusel: [{ titulo: "Portada", texto: "t" }, { titulo: "Qué pasó", texto: "t" }], reel: null,
};

test("(posts perfil) crearPost conserva formato, fuentes con trazabilidad (principal y referencias), afirmaciones, ángulo, atribución, puntuación, alertas, carrusel/reel y revisión pendiente", () => {
  const p = crearPost({ candidato, redaccion, variante: "negro", ahora, cuenta: "prueba", referencias: [referencia] });
  assert.equal(p.formato, "carrusel");
  assert.equal(p.fuente.url, candidato.url, "la fuente principal sigue en el campo de siempre");
  assert.equal(p.fuentes.length, 2);
  assert.deepEqual(p.fuentes[0], { rol: "principal", medio: "WIRED", autor: "Dhruv Mehrotra", url: candidato.url, canonica: candidato.canonica, idioma: "en", publicado: candidato.fecha, actualizado: candidato.actualizado, fechaHecho: "2026-09-09", consultado: candidato.consultado, alcance: "completo", textoRecuperado: { parrafos: 7, caracteres: 1500 }, fuentesPrimarias: ["https://www.aclu.org/x"], licenciaMedios: null });
  assert.equal(p.fuentes[1].rol, "referencia");
  assert.equal(p.fuentes[1].alcance, "fragmento");
  assert.equal(p.fuentes[1].licenciaMedios, null, "desconocido = null, nunca inventado");
  assert.deepEqual(p.afirmaciones, redaccion.afirmaciones);
  assert.equal(p.angulo, redaccion.angulo);
  assert.equal(p.atribucion, redaccion.atribucion);
  assert.deepEqual(p.puntuacion, redaccion.puntuacion);
  assert.deepEqual(p.alertas, ["fuente-unica"]);
  assert.deepEqual(p.carrusel, { diapositivas: redaccion.carrusel, imagenes: [] });
  assert.equal(p.reel, null);
  assert.deepEqual(p.revision, { estado: "pendiente", notas: [] });
  assert.equal(p.ilustracion.procedencia, "generada");
  assert.ok(validarPost(p));
});

test("(posts perfil) los posts antiguos sin estos campos siguen siendo válidos; los campos nuevos se validan cuando están", () => {
  assert.ok(validarPost(base));
  assert.throws(() => validarPost({ ...base, formato: "video" }), /formato/);
  assert.throws(() => validarPost({ ...base, afirmaciones: [{ texto: "x", tipo: "rumor", fuente: "" }] }), /afirmaciones/);
  assert.throws(() => validarPost({ ...base, fuentes: [{ medio: "X" }] }), /fuentes/);
  assert.throws(() => validarPost({ ...base, alertas: ["rara"] }), /alertas/);
  assert.throws(() => validarPost({ ...base, revision: { estado: "ok" } }), /revision/);
  assert.throws(() => validarPost({ ...base, carrusel: { diapositivas: [] } }), /carrusel/);
  assert.throws(() => validarPost({ ...base, reel: { narracion: "" } }), /reel/);
  assert.ok(validarPost({ ...base, formato: "reel", reel: { narracion: "n", subtitulos: ["s"], escenas: [{ segundos: 0, descripcion: "d", recurso: "r" }], recursos: ["r"], duracionObjetivo: "35-60 s" } }));
  assert.ok(validarPost({ ...base, formato: "carrusel", carrusel: { diapositivas: [{ titulo: "a", texto: "b" }], imagenes: [{ numero: 1, ruta: "public/img/x-01.jpg", url: "https://x/img/x-01.jpg", hash: "abc" }], hash: "h" } }));
});

test("(posts perfil) rutas de las diapositivas del carrusel", () => {
  assert.equal(rutaDiapositiva("2026-09-10-0857-luiseskivelgolcher-wired-029a", 1), "public/img/2026-09-10-0857-luiseskivelgolcher-wired-029a-01.jpg");
  assert.equal(urlDiapositiva("https://u.github.io/sinlinea", "2026-09-10-0857-luiseskivelgolcher-wired-029a", 7), "https://u.github.io/sinlinea/img/2026-09-10-0857-luiseskivelgolcher-wired-029a-07.jpg");
});
