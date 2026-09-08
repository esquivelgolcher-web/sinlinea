import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  validarPost, leerPosts, escribirPost, nuevoId, crearPost, siguienteVariante, creadosHoy, archivar, rutaImagen, urlImagen,
  rutaIlustracion,
} from "../src/lib/posts.mjs";

const ahora = new Date("2026-09-07T19:20:31Z");
const candidato = {
  url: "https://www.prensa.com/sociedad/bomberos/", medio: "La Prensa", seccion: "sociedad",
  titulo: "Bomberos piden más fondos", descripcion: "d", fecha: "2026-09-07T13:10:00.000Z", texto: "t", origen: "rss",
};
const redaccion = {
  categoria: "SOCIEDAD", titular: "Bomberos piden $22 millones más", bajada: "La partida de 2027 no cubre la inversión.",
  caption: "Los bomberos advierten...", hashtags: ["Panamá", "#SinLínea", "#Bomberos"], relevancia: 0.9, motivo: "impacto",
};

test("nuevoId sigue el formato AAAA-MM-DD-HHMM-medio-hex", () => {
  const id = nuevoId({ medio: "La Prensa", url: candidato.url, ahora });
  assert.match(id, /^2026-09-07-1420-la-prensa-[0-9a-f]{4}$/);
  assert.equal(id, nuevoId({ medio: "La Prensa", url: candidato.url, ahora }));
});

test("crearPost produce un borrador válido con hashtags normalizados", () => {
  const p = crearPost({ candidato, redaccion, variante: "amarillo", ahora });
  validarPost(p);
  assert.equal(p.estado, "borrador");
  assert.equal(p.imagen, null);
  assert.deepEqual(p.hashtags, ["#Panamá", "#SinLínea", "#Bomberos"]);
  assert.equal(p.fuente.url, candidato.url);
  assert.equal(p.creado, ahora.toISOString());
  assert.equal(rutaImagen(p.id), `public/img/${p.id}.jpg`);
  assert.equal(urlImagen("https://u.github.io/sinlinea/", p.id), `https://u.github.io/sinlinea/img/${p.id}.jpg`);
});

test("validarPost rechaza estado, categoría y variante inválidos", () => {
  const p = crearPost({ candidato, redaccion, variante: "negro", ahora });
  assert.throws(() => validarPost({ ...p, estado: "listo" }), /Post inválido.*estado/);
  assert.throws(() => validarPost({ ...p, categoria: "X" }), /categoria/);
  assert.throws(() => validarPost({ ...p, variante: "azul" }), /variante/);
  assert.throws(() => validarPost({ ...p, id: "malo" }), /id "malo"/);
});

test("validarPost exige la forma de fuente, imagen, publicacion y error", () => {
  const p = crearPost({ candidato, redaccion, variante: "negro", ahora });
  const iso = ahora.toISOString();
  assert.throws(() => validarPost({ ...p, fuente: { ...p.fuente, publicado: "ayer" } }), /fuente\.publicado/);
  assert.throws(() => validarPost({ ...p, imagen: { hash: "h" } }), /imagen/);
  assert.throws(() => validarPost({ ...p, publicacion: "x" }), /publicacion/);
  assert.throws(() => validarPost({ ...p, error: { paso: "otro", mensaje: "m", fecha: iso } }), /error/);
  validarPost({ ...p, imagen: { ruta: "public/img/x.jpg", url: "https://x/img/x.jpg", hash: "h", version: 1, renderizada: iso } });
  validarPost({ ...p, publicacion: { idMedia: "1", permalink: "https://www.instagram.com/p/x/", fecha: iso } });
  validarPost({ ...p, error: { paso: "render", mensaje: "m", fecha: iso } });
});

test("escribirPost y leerPosts ida y vuelta, ordenados por creado desc, ignorando archivo/", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "posts-"));
  const a = crearPost({ candidato, redaccion, variante: "negro", ahora: new Date("2026-09-07T10:00:00Z") });
  const b = crearPost({ candidato: { ...candidato, url: "https://www.prensa.com/otra/" }, redaccion, variante: "rojo", ahora });
  escribirPost(dir, a);
  escribirPost(dir, b);
  fs.mkdirSync(path.join(dir, "archivo", "2026-08"), { recursive: true });
  fs.writeFileSync(path.join(dir, "archivo", "2026-08", "viejo.json"), "{}");
  const posts = leerPosts(dir);
  assert.deepEqual(posts.map((p) => p.id), [b.id, a.id]);
  assert.ok(fs.readFileSync(path.join(dir, `${a.id}.json`), "utf8").endsWith("}\n"));
});

test("leerPosts omite un archivo inválido y avisa, en vez de fallar", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "posts-"));
  escribirPost(dir, crearPost({ candidato, redaccion, variante: "negro", ahora }));
  fs.writeFileSync(path.join(dir, "2026-09-07-1420-la-prensa-ffff.json"), "{ esto no es un post");
  const avisos = [];
  const posts = leerPosts(dir, { log: { warn: (m) => avisos.push(m) } });
  assert.equal(posts.length, 1);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /omitido/);
});

test("siguienteVariante rota a partir del post más reciente", () => {
  assert.equal(siguienteVariante([]), "negro");
  const a = crearPost({ candidato, redaccion, variante: "negro", ahora: new Date("2026-09-07T10:00:00Z") });
  const b = crearPost({ candidato: { ...candidato, url: "https://www.prensa.com/u2/" }, redaccion, variante: "amarillo", ahora });
  assert.equal(siguienteVariante([a, b]), "rojo");
  assert.equal(siguienteVariante([b, a]), "rojo");
  assert.equal(siguienteVariante([{ ...b, variante: "rojo" }]), "negro");
  const mismoInstante = [
    { ...a, variante: "negro", creado: ahora.toISOString() },
    { ...b, variante: "amarillo", creado: ahora.toISOString() },
  ];
  assert.equal(siguienteVariante(mismoInstante), "rojo");
});

test("creadosHoy cuenta por día de Panamá", () => {
  const a = crearPost({ candidato, redaccion, variante: "negro", ahora: new Date("2026-09-08T03:00:00Z") }); // 22:00 del 7
  const b = crearPost({ candidato: { ...candidato, url: "https://www.prensa.com/u2/" }, redaccion, variante: "negro", ahora: new Date("2026-09-08T12:00:00Z") });
  assert.equal(creadosHoy([a, b], "2026-09-07"), 1);
  assert.equal(creadosHoy([a, b], "2026-09-08"), 1);
});

test("archivar mueve publicados y descartados viejos", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "posts-"));
  const viejo = { ...crearPost({ candidato, redaccion, variante: "negro", ahora: new Date("2026-08-20T10:00:00Z") }), estado: "descartado", actualizado: "2026-08-20T10:00:00.000Z" };
  const reciente = { ...crearPost({ candidato: { ...candidato, url: "https://www.prensa.com/u2/" }, redaccion, variante: "negro", ahora }), estado: "descartado", actualizado: ahora.toISOString() };
  const borradorViejo = crearPost({ candidato: { ...candidato, url: "https://www.prensa.com/u3/" }, redaccion, variante: "negro", ahora: new Date("2026-08-20T10:00:00Z") });
  for (const p of [viejo, reciente, borradorViejo]) escribirPost(dir, p);
  const movidos = archivar(dir, { ahora, dias: 7 });
  assert.deepEqual(movidos, [viejo.id]);
  assert.ok(fs.existsSync(path.join(dir, "archivo", "2026-08", `${viejo.id}.json`)));
  assert.equal(leerPosts(dir).length, 2);
});

test("archivar (I3) borra el jpg de public/ilus del post archivado y conserva el de uno no archivado", () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "raiz-"));
  const dir = path.join(raiz, "posts");
  const viejo = { ...crearPost({ candidato, redaccion, variante: "negro", ahora: new Date("2026-08-20T10:00:00Z") }), estado: "publicado", actualizado: "2026-08-20T10:00:00.000Z" };
  const reciente = { ...crearPost({ candidato: { ...candidato, url: "https://www.prensa.com/u4/" }, redaccion, variante: "negro", ahora }), estado: "publicado", actualizado: ahora.toISOString() };
  for (const p of [viejo, reciente]) escribirPost(dir, p);
  fs.mkdirSync(path.join(raiz, "public", "ilus"), { recursive: true });
  fs.writeFileSync(path.join(raiz, "public", "ilus", `${viejo.id}.jpg`), "jpg");
  fs.writeFileSync(path.join(raiz, "public", "ilus", `${reciente.id}.jpg`), "jpg");
  const movidos = archivar(dir, { ahora, dias: 7 });
  assert.deepEqual(movidos, [viejo.id]);
  assert.ok(!fs.existsSync(path.join(raiz, "public", "ilus", `${viejo.id}.jpg`)), "el jpg del post archivado debe borrarse");
  assert.ok(fs.existsSync(path.join(raiz, "public", "ilus", `${reciente.id}.jpg`)), "el jpg de un post no archivado se conserva");
});

test("crearPost crea ilustracion cuando hay escena; validarPost la comprueba", () => {
  const con = crearPost({ candidato, redaccion: { ...redaccion, escena: "Estación de bomberos en Panamá al atardecer" }, variante: "negro", ahora });
  assert.deepEqual(con.ilustracion, { descripcion: "Estación de bomberos en Panamá al atardecer", usar: false, ruta: null, hashDescripcion: null, proveedor: null, modelo: null, generada: null, error: null });
  const sin = crearPost({ candidato, redaccion, variante: "negro", ahora });
  assert.equal(sin.ilustracion, null);
  assert.equal(rutaIlustracion(con.id), `public/ilus/${con.id}.jpg`);
  assert.throws(() => validarPost({ ...con, ilustracion: { descripcion: "x" } }), /ilustracion/);
  assert.throws(() => validarPost({ ...con, ilustracion: { ...con.ilustracion, error: { mensaje: 1 } } }), /ilustracion/);
  validarPost({ ...con, ilustracion: { ...con.ilustracion, usar: true, ruta: "public/ilus/a.jpg", hashDescripcion: "0123456789abcdef", error: null } });
  validarPost({ ...con, ilustracion: undefined });
});

test("validarPost (I1) acepta error.intentos ausente o entero >= 1 y rechaza otros valores", () => {
  const con = crearPost({ candidato, redaccion: { ...redaccion, escena: "Estación de bomberos en Panamá al atardecer" }, variante: "negro", ahora });
  const iso = ahora.toISOString();
  validarPost({ ...con, ilustracion: { ...con.ilustracion, error: { mensaje: "m", fecha: iso } } });
  validarPost({ ...con, ilustracion: { ...con.ilustracion, error: { mensaje: "m", fecha: iso, intentos: 2 } } });
  assert.throws(() => validarPost({ ...con, ilustracion: { ...con.ilustracion, error: { mensaje: "m", fecha: iso, intentos: "2" } } }), /ilustracion/);
  assert.throws(() => validarPost({ ...con, ilustracion: { ...con.ilustracion, error: { mensaje: "m", fecha: iso, intentos: 0 } } }), /ilustracion/);
});

import { CUENTA_LEGADO, nuevoId as nuevoIdM1, crearPost as crearPostM1, leerPosts as leerPostsM1, validarPost as validarPostM1, escribirPost as escribirPostM1 } from "../src/lib/posts.mjs";

test("(M1) validarPost acepta cuenta ausente o con id válido y rechaza ids inválidos", () => {
  const base = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));
  assert.doesNotThrow(() => validarPostM1(base));
  assert.doesNotThrow(() => validarPostM1({ ...base, cuenta: "otro-medio" }));
  assert.throws(() => validarPostM1({ ...base, cuenta: "Sin Linea" }), /cuenta/);
  assert.throws(() => validarPostM1({ ...base, cuenta: "" }), /cuenta/);
});

test("(M1) leerPosts completa cuenta en memoria para los posts antiguos sin reescribir el archivo", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "posts-m1-"));
  const base = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));
  fs.writeFileSync(path.join(dir, `${base.id}.json`), JSON.stringify(base, null, 2) + "\n");
  const antes = fs.readFileSync(path.join(dir, `${base.id}.json`), "utf8");
  const [p1] = leerPostsM1(dir);
  assert.equal(p1.cuenta, CUENTA_LEGADO);
  assert.equal(CUENTA_LEGADO, "sinlinea");
  const [p2] = leerPostsM1(dir, { cuentaPorDefecto: "otra" });
  assert.equal(p2.cuenta, "otra");
  assert.equal(fs.readFileSync(path.join(dir, `${base.id}.json`), "utf8"), antes, "el archivo no cambia");
  assert.equal(antes.includes('"cuenta"'), false);
});

test("(M1) nuevoId incluye la cuenta y crearPost guarda el campo cuenta", () => {
  const ahora = new Date("2026-09-08T15:05:00Z");
  const conCuenta = nuevoIdM1({ medio: "La Prensa", url: "https://p.test/a", ahora, cuenta: "prueba" });
  assert.match(conCuenta, /^2026-09-08-1005-prueba-la-prensa-[0-9a-f]{4}$/);
  const sinCuenta = nuevoIdM1({ medio: "La Prensa", url: "https://p.test/a", ahora });
  assert.match(sinCuenta, /^2026-09-08-1005-la-prensa-[0-9a-f]{4}$/);
  const candidato = { medio: "La Prensa", url: "https://p.test/a", titulo: "T", fecha: "2026-09-08T14:00:00.000Z" };
  const redaccion = { categoria: "SOCIEDAD", titular: "Titular", bajada: "Bajada", caption: "Caption", hashtags: ["#Panamá"], escena: "" };
  const post = crearPostM1({ candidato, redaccion, variante: "negro", ahora, cuenta: "prueba" });
  assert.equal(post.cuenta, "prueba");
  assert.equal(post.id, conCuenta);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "posts-m1b-"));
  escribirPostM1(dir, post);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, `${post.id}.json`), "utf8")).cuenta, "prueba");
});
