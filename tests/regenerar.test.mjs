import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ejecutarRegenerar } from "../src/regenerar.mjs";
import { cargarConfig } from "../src/lib/config.mjs";
import { leerPosts, escribirPost } from "../src/lib/posts.mjs";
import { hashImagen, marcarError, aprobar } from "../src/lib/estados.mjs";

const cfg = cargarConfig("config.json");
const base = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));
const ahora = new Date("2026-09-07T21:00:00Z");
const imagenDe = (p, version = 1) => ({ ruta: `public/img/${p.id}.jpg`, url: `https://x/img/${p.id}.jpg`, hash: hashImagen(p, version), version, renderizada: ahora.toISOString() });
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
