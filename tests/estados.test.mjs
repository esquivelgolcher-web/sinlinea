import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hashImagen, imagenDesactualizada, aprobar, descartar, quitarDeCola, reintentar,
  marcarPublicado, marcarError, renderOk, editarTexto, CATEGORIAS, VARIANTES,
} from "../src/lib/estados.mjs";

const AHORA = "2026-09-07T20:00:00.000Z";
const base = () => ({
  id: "2026-09-07-1420-la-prensa-a1b2", estado: "borrador",
  fuente: { medio: "La Prensa", url: "https://p.test/a", titulo: "T", publicado: "2026-09-07T13:10:00.000Z" },
  categoria: "SOCIEDAD", titular: "Titular", bajada: "Bajada", caption: "Cap", hashtags: ["#Panamá"],
  variante: "negro", imagen: null, programado: null, publicacion: null, error: null,
  creado: "2026-09-07T19:20:31.000Z", actualizado: "2026-09-07T19:20:31.000Z",
});

test("hashImagen es estable, de 16 hex y cambia con cualquier campo o la versión", () => {
  const p = base();
  const h = hashImagen(p, 1);
  assert.match(h, /^[0-9a-f]{16}$/);
  assert.equal(h, hashImagen(base(), 1));
  assert.notEqual(h, hashImagen({ ...p, titular: "Otro" }, 1));
  assert.notEqual(h, hashImagen({ ...p, variante: "rojo" }, 1));
  assert.notEqual(h, hashImagen(p, 2));
  assert.notEqual(hashImagen({ ...p, titular: "Fire", bajada: "works" }, 1), hashImagen({ ...p, titular: "Firework", bajada: "s" }, 1));
});

test("imagenDesactualizada detecta ausencia y desfase", () => {
  const p = base();
  assert.equal(imagenDesactualizada(p), true);
  const con = { ...p, imagen: { ruta: "x", url: "y", hash: hashImagen(p, 1), version: 1, renderizada: AHORA } };
  assert.equal(imagenDesactualizada(con), false);
  assert.equal(imagenDesactualizada({ ...con, titular: "cambió" }), true);
  assert.equal(imagenDesactualizada(con, 2), true);
});

test("flujo feliz: aprobar → publicado, con actualizado nuevo", () => {
  const p = aprobar(base(), "2026-09-07T17:00:00-05:00", AHORA);
  assert.equal(p.estado, "programado");
  assert.equal(p.programado, "2026-09-07T17:00:00-05:00");
  assert.equal(p.actualizado, AHORA);
  const pub = marcarPublicado(p, { idMedia: "123", permalink: "https://www.instagram.com/p/x/" }, AHORA);
  assert.equal(pub.estado, "publicado");
  assert.deepEqual(pub.publicacion, { idMedia: "123", permalink: "https://www.instagram.com/p/x/", fecha: AHORA });
  assert.throws(() => marcarPublicado(base(), { idMedia: "1", permalink: "u" }, AHORA), /Transición inválida/);
});

test("descartar, quitarDeCola y reintentar", () => {
  assert.equal(descartar(base(), AHORA).estado, "descartado");
  const prog = aprobar(base(), "2026-09-07T17:00:00-05:00", AHORA);
  assert.throws(() => descartar(prog, AHORA), /Transición inválida/);
  const fuera = quitarDeCola(prog, AHORA);
  assert.equal(fuera.estado, "borrador");
  assert.equal(fuera.programado, null);
  const conError = marcarError(prog, { paso: "instagram", mensaje: "429" }, AHORA);
  assert.equal(conError.estado, "error");
  assert.equal(conError.error.paso, "instagram");
  assert.equal(reintentar(conError, AHORA).estado, "programado");
  const errRender = marcarError(base(), { paso: "render", mensaje: "x" }, AHORA);
  assert.throws(() => reintentar(errRender, AHORA), /Transición inválida/);
  assert.equal(descartar(errRender, AHORA).estado, "descartado");
});

test("renderOk fija la imagen y saca del error de render", () => {
  const errRender = marcarError(base(), { paso: "render", mensaje: "x" }, AHORA);
  const img = { ruta: "public/img/a.jpg", url: "https://x/img/a.jpg", hash: "h", version: 1, renderizada: AHORA };
  const ok = renderOk(errRender, img, AHORA);
  assert.equal(ok.estado, "borrador");
  assert.equal(ok.error, null);
  assert.deepEqual(ok.imagen, img);
  const progErr = marcarError(aprobar(base(), "2026-09-07T17:00:00-05:00", AHORA), { paso: "render", mensaje: "x" }, AHORA);
  assert.equal(renderOk(progErr, img, AHORA).estado, "programado");
});

test("editarTexto valida campos, categoría y variante", () => {
  const e = editarTexto(base(), { titular: "Nuevo", categoria: CATEGORIAS[0], variante: VARIANTES[2] }, AHORA);
  assert.equal(e.titular, "Nuevo");
  assert.equal(e.variante, "rojo");
  assert.throws(() => editarTexto(base(), { estado: "publicado" }, AHORA), /no editable/);
  assert.throws(() => editarTexto(base(), { categoria: "CHISMES" }, AHORA), /categor/i);
  const pub = marcarPublicado(aprobar(base(), "2026-09-07T17:00:00-05:00", AHORA), { idMedia: "1", permalink: "u" }, AHORA);
  assert.throws(() => editarTexto(pub, { titular: "x" }, AHORA), /Transición inválida/);
});
