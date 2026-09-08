import { test } from "node:test";
import assert from "node:assert/strict";
import { necesitaEscena,
  hashImagen, imagenDesactualizada, aprobar, descartar, quitarDeCola, reintentar,
  marcarPublicado, marcarError, renderOk, editarTexto, CATEGORIAS, VARIANTES,
  hashTexto, necesitaIlustracion,
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

test("hashTexto es estable y hashImagen cambia con la ilustración usada", () => {
  assert.equal(hashTexto("hola"), hashTexto("hola"));
  assert.match(hashTexto("hola"), /^[0-9a-f]{16}$/);
  const p = base();
  const sin = hashImagen(p, 1);
  const conIlus = { ...p, ilustracion: { descripcion: "Canal", usar: true, ruta: "public/ilus/x.jpg", hashDescripcion: hashTexto("Canal"), error: null } };
  assert.notEqual(hashImagen(conIlus, 1), sin);
  assert.equal(hashImagen({ ...conIlus, ilustracion: { ...conIlus.ilustracion, usar: false } }, 1), sin);
  assert.equal(hashImagen({ ...conIlus, ilustracion: { ...conIlus.ilustracion, ruta: null } }, 1), sin);
  assert.notEqual(hashImagen({ ...conIlus, ilustracion: { ...conIlus.ilustracion, hashDescripcion: hashTexto("Asamblea") } }, 1), hashImagen(conIlus, 1));
});

test("necesitaIlustracion: solo con usar=true y escena cambiada o sin imagen (salvo error reciente)", () => {
  const ahora = new Date("2026-09-08T12:00:00Z");
  const ok = { descripcion: "Canal", usar: true, ruta: "public/ilus/x.jpg", hashDescripcion: hashTexto("Canal"), error: null };
  assert.equal(necesitaIlustracion({ ilustracion: ok }, ahora), false);
  assert.equal(necesitaIlustracion({ ilustracion: { ...ok, descripcion: "Asamblea" } }, ahora), true);
  assert.equal(necesitaIlustracion({ ilustracion: { ...ok, ruta: null, hashDescripcion: null } }, ahora), true);
  assert.equal(necesitaIlustracion({ ilustracion: { ...ok, ruta: null, hashDescripcion: null, error: { mensaje: "x", fecha: "2026-09-08T11:30:00Z" } } }, ahora), false);
  assert.equal(necesitaIlustracion({ ilustracion: { ...ok, ruta: null, hashDescripcion: null, error: { mensaje: "x", fecha: "2026-09-08T09:00:00Z" } } }, ahora), true);
  assert.equal(necesitaIlustracion({ ilustracion: { ...ok, usar: false, descripcion: "Otra" } }, ahora), false);
  assert.equal(necesitaIlustracion({ ilustracion: { ...ok, descripcion: "   ", ruta: null, hashDescripcion: null } }, ahora), false);
  assert.equal(necesitaIlustracion({ ilustracion: null }, ahora), false);
  assert.equal(necesitaIlustracion({}, ahora), false);
});

test("necesitaIlustracion (I1): el enfriamiento de 1 h se aplica también cuando cambió la descripción", () => {
  const ahora = new Date("2026-09-08T12:00:00Z");
  const ilCambiada = (fecha) => ({
    descripcion: "Nueva escena", usar: true, ruta: "public/ilus/x.jpg",
    hashDescripcion: hashTexto("Escena vieja"), error: { mensaje: "x", fecha, intentos: 1 },
  });
  assert.equal(necesitaIlustracion({ ilustracion: ilCambiada("2026-09-08T11:50:00Z") }, ahora), false, "error hace 10 min");
  assert.equal(necesitaIlustracion({ ilustracion: ilCambiada("2026-09-08T10:00:00Z") }, ahora), true, "error hace 2 h");
});

test("editarTexto acepta ilustracion válida y rechaza inválida", () => {
  const p = base();
  const e = editarTexto(p, { ilustracion: { descripcion: "Canal", usar: true, ruta: null, hashDescripcion: null, error: null } }, AHORA);
  assert.equal(e.ilustracion.usar, true);
  assert.throws(() => editarTexto(p, { ilustracion: { descripcion: 5, usar: true } }, AHORA), /ilustracion/);
});

test("necesitaEscena: solo con usar=true y escena vacía, salvo error de hace menos de 1 h", () => {
  const ahora = new Date("2026-09-08T12:00:00Z");
  const con = (il) => ({ ilustracion: il });
  assert.equal(necesitaEscena(con(null), ahora), false);
  assert.equal(necesitaEscena(con({ usar: false, descripcion: "" }), ahora), false);
  assert.equal(necesitaEscena(con({ usar: true, descripcion: "Canal" }), ahora), false);
  assert.equal(necesitaEscena(con({ usar: true, descripcion: "  " }), ahora), true);
  assert.equal(necesitaEscena(con({ usar: true, descripcion: "", error: { mensaje: "x", fecha: "2026-09-08T11:30:00Z" } }), ahora), false);
  assert.equal(necesitaEscena(con({ usar: true, descripcion: "", error: { mensaje: "x", fecha: "2026-09-08T10:00:00Z" } }), ahora), true);
});

test("(categorías) INVESTIGACIÓN es una categoría permitida (posts de investigación y transparencia)", () => {
  assert.ok(CATEGORIAS.includes("INVESTIGACIÓN"));
  assert.doesNotThrow(() => editarTexto(base(), { categoria: "INVESTIGACIÓN" }, AHORA));
});
