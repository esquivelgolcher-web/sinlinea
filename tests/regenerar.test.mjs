import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ejecutarRegenerar } from "../src/regenerar.mjs";
import { cargarConfig } from "../src/lib/config.mjs";
import { leerPosts, escribirPost, urlImagen } from "../src/lib/posts.mjs";
import { hashImagen, marcarError, aprobar, hashTexto } from "../src/lib/estados.mjs";

const cfg = cargarConfig("config.json");
const base = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));
const ahora = new Date("2026-09-07T21:00:00Z");
const imagenDe = (p, version = 1) => ({ ruta: `public/img/${p.id}.jpg`, url: urlImagen(cfg.pages.baseUrl, p.id), hash: hashImagen(p, version), version, renderizada: ahora.toISOString() });
const log = { info: () => {}, warn: () => {} };

function dirCon(posts) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "regen-"));
  for (const p of posts) escribirPost(path.join(raiz, "posts"), p);
  return raiz;
}

test("re-renderiza solo los desactualizados, los sin imagen y los errores de render", async () => {
  const alDia = { ...base, id: base.id.slice(0, -4) + "0001", imagen: imagenDe({ ...base, id: base.id.slice(0, -4) + "0001" }) };
  const editado = { ...base, id: base.id.slice(0, -4) + "0002", titular: "Cambiado", imagen: imagenDe(base) };
  const sinImagen = { ...base, id: base.id.slice(0, -4) + "0003", imagen: null };
  const errRender = marcarError({ ...base, id: base.id.slice(0, -4) + "0004", imagen: imagenDe(base) }, { paso: "render", mensaje: "x" }, ahora.toISOString());
  const publicado = { ...base, id: base.id.slice(0, -4) + "0005", estado: "publicado", titular: "Otro", imagen: imagenDe(base), publicacion: { idMedia: "1", permalink: "u", fecha: ahora.toISOString() } };
  const raiz = dirCon([alDia, editado, sinImagen, errRender, publicado]);
  const renderizados = [];
  const render = async (p) => { renderizados.push(p.id); return imagenDe(p); };
  const r = await ejecutarRegenerar({ config: cfg, raiz, ahora, render, log, version: 1 });
  assert.deepEqual(r.renderizados.sort(), [editado.id, sinImagen.id, errRender.id].sort());
  assert.deepEqual(r.fallidos, []);
  const posts = Object.fromEntries(leerPosts(path.join(raiz, "posts")).map((p) => [p.id, p]));
  assert.equal(posts[errRender.id].estado, "borrador");
  assert.equal(posts[editado.id].imagen.hash, hashImagen(editado, 1));
});

test("una versión nueva de plantilla re-renderiza todos los activos", async () => {
  const p = { ...base, imagen: imagenDe(base, 1) };
  const raiz = dirCon([p]);
  const r = await ejecutarRegenerar({ config: cfg, raiz, ahora, render: async (x) => imagenDe(x, 2), log, version: 2 });
  assert.deepEqual(r.renderizados, [p.id]);
  assert.equal(leerPosts(path.join(raiz, "posts"))[0].imagen.version, 2);
});

test("si el render falla, el post programado queda en error y conserva su hora", async () => {
  const prog = aprobar({ ...base, imagen: null }, "2026-09-07T17:00:00-05:00", ahora.toISOString());
  const raiz = dirCon([prog]);
  const r = await ejecutarRegenerar({ config: cfg, raiz, ahora, render: async () => { throw new Error("falló"); }, log, version: 1 });
  assert.deepEqual(r.fallidos, [prog.id]);
  const p = leerPosts(path.join(raiz, "posts"))[0];
  assert.equal(p.estado, "error");
  assert.equal(p.programado, "2026-09-07T17:00:00-05:00");
});

test("una imagen con URL de otro baseUrl se vuelve a renderizar", async () => {
  const p = { ...base, imagen: { ...imagenDe(base), url: "https://CAMBIAR.github.io/sinlinea/img/x.jpg" } };
  const raiz = dirCon([p]);
  const cfgReal = { ...cfg, pages: { baseUrl: "https://prueba.github.io/sinlinea" } };
  const r = await ejecutarRegenerar({ config: cfgReal, raiz, ahora, render: async (x) => ({ ...imagenDe(x), url: `https://prueba.github.io/sinlinea/img/${x.id}.jpg` }), log, version: 1 });
  assert.deepEqual(r.renderizados, [p.id]);
});

test("Regenerar ilustración con la misma escena vuelve a renderizar (C1)", async () => {
  const descripcion = "Canal de Panamá desde Miraflores";
  const hashDesc = hashTexto(descripcion);
  const ilustracionBase = { descripcion, usar: true, ruta: `public/ilus/${base.id}.jpg`, hashDescripcion: null, proveedor: "gemini", modelo: "m", generada: ahora.toISOString(), error: null };
  // El hash de la imagen ya está al día para la descripción actual (hashDescripcion == hashDesc);
  // en el post real hashDescripcion se puso en null (p. ej. al pulsar "Regenerar ilustración").
  const imagenAlDia = imagenDe({ ...base, ilustracion: { ...ilustracionBase, hashDescripcion: hashDesc } }, 1);
  const post = { ...base, ilustracion: ilustracionBase, imagen: imagenAlDia };
  const raiz = dirCon([post]);
  const ilustrador = { async generar() { return Buffer.from("00", "hex"); } };
  const guardar = async () => {};
  const r = await ejecutarRegenerar({ config: cfg, raiz, ahora, render: async (x) => imagenDe(x, 1), log, version: 1, ilustrador, guardar });
  assert.deepEqual(r.renderizados, [post.id]);
  const guardado = leerPosts(path.join(raiz, "posts"))[0];
  assert.equal(guardado.ilustracion.hashDescripcion, hashTexto(descripcion));
});

test("regenera la ilustración cuando cambió la escena y no llama con usar=false", async () => {
  const conIlus = { ...base, imagen: imagenDe(base), ilustracion: { descripcion: "Nueva escena", usar: true, ruta: "public/ilus/a.jpg", hashDescripcion: "0000000000000000", proveedor: "gemini", modelo: "m", generada: ahora.toISOString(), error: null } };
  const apagada = { ...base, id: base.id.slice(0, -4) + "0009", imagen: imagenDe({ ...base, id: base.id.slice(0, -4) + "0009" }), ilustracion: { descripcion: "Otra", usar: false, ruta: null, hashDescripcion: null, proveedor: null, modelo: null, generada: null, error: null } };
  const raiz = dirCon([conIlus, apagada]);
  const llamadas = [];
  const ilustrador = { async generar(d) { llamadas.push(d); return Buffer.from("00", "hex"); } };
  const guardadas = [];
  const guardar = async (buf, ruta) => { guardadas.push(ruta); };
  const r = await ejecutarRegenerar({ config: cfg, raiz, ahora, render: async (x) => imagenDe(x), log, version: 1, ilustrador, guardar });
  assert.deepEqual(llamadas, ["Nueva escena"]);
  assert.ok(guardadas[0].endsWith(path.join("public", "ilus", `${conIlus.id}.jpg`)));
  assert.deepEqual(r.renderizados, [conIlus.id]);
  const posts = Object.fromEntries(leerPosts(path.join(raiz, "posts")).map((p) => [p.id, p]));
  assert.equal(posts[conIlus.id].ilustracion.hashDescripcion, hashTexto("Nueva escena"));
});
