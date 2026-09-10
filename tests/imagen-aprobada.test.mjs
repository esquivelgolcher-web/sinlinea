// La imagen aprobada queda vinculada a un archivo estable: la huella (sha de blob git) del JPEG que se sirve en la URL
// pública. Guardar el hash de receta y avisar no basta si después se publica una imagen regenerada desde la misma URL.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { huellaDeBytes, descargarHuella } from "../src/lib/huella.mjs";
import { aprobarDestinos, aprobarImagenActual, imagenCambiada, marcarEspera, destinosDe } from "../src/lib/destinos.mjs";
import { validarPost, escribirPost, leerPosts } from "../src/lib/posts.mjs";
import { hashImagen } from "../src/lib/estados.mjs";
import { ejecutarPublicar } from "../src/publicar.mjs";
import { cargarConfig } from "../src/lib/config.mjs";
import { shaDeBlob } from "../src/serve.mjs";

const base = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));
const iso = "2026-09-10T12:00:00.000Z";
const ahora = new Date("2026-09-10T20:10:00Z");
const log = { info: () => {}, warn: () => {}, error: () => {} };
const conImagen = (p) => ({ ...p, imagen: { ruta: `public/img/${p.id}.jpg`, url: `https://u.github.io/sinlinea/img/${p.id}.jpg`, hash: hashImagen(p, 1), version: 1, renderizada: iso } });
const cfg = { ...cargarConfig("config.json"), pages: { baseUrl: "https://u.github.io/sinlinea" }, automatico: { generar: true, publicar: true }, conexiones: { facebook: { publicar: true, pagina: "123" } } };
const bytesA = Buffer.from("imagen-aprobada-jpeg");
const bytesB = Buffer.from("imagen-regenerada-jpeg");

test("(imagen) la huella es el sha de blob de git de los bytes (igual que la API de contenidos de GitHub y el servidor local)", async () => {
  assert.equal(huellaDeBytes(bytesA), shaDeBlob(bytesA));
  assert.notEqual(huellaDeBytes(bytesA), huellaDeBytes(bytesB));
  const fetchImpl = async (url) => ({ ok: true, status: 200, arrayBuffer: async () => bytesA.buffer.slice(bytesA.byteOffset, bytesA.byteOffset + bytesA.byteLength) });
  assert.deepEqual(await descargarHuella("https://u/x.jpg", { fetchImpl }), { ok: true, sha: huellaDeBytes(bytesA) });
  assert.equal((await descargarHuella("https://u/x.jpg", { fetchImpl: async () => ({ ok: false, status: 404 }) })).ok, false);
  assert.equal((await descargarHuella("https://u/x.jpg", { fetchImpl: async () => { throw new Error("caída"); } })).ok, false);
});

test("(imagen) aprobar guarda la huella del archivo; sin archivo queda null y el destino exige aprobar la imagen cuando exista; aprobar la imagen actual fija la huella nueva", () => {
  const p = conImagen(base);
  const sha = huellaDeBytes(bytesA);
  const aprobado = aprobarDestinos(p, "2026-09-10T14:00:00-05:00", { versiones: { facebook: "FB" }, imagenSha: sha }, iso);
  assert.equal(aprobado.destinos.facebook.aprobado.imagenSha, sha);
  assert.doesNotThrow(() => validarPost(aprobado));
  assert.equal(imagenCambiada(aprobado, "facebook"), false);
  assert.equal(imagenCambiada(aprobado, "facebook", { imagenSha: sha }), false, "misma huella servida: nada cambió");
  assert.equal(imagenCambiada(aprobado, "facebook", { imagenSha: huellaDeBytes(bytesB) }), true, "otra huella servida: la imagen cambió aunque la receta sea la misma");
  const sinArchivo = aprobarDestinos({ ...base, imagen: null }, "2026-09-10T14:00:00-05:00", { versiones: { facebook: "FB" }, imagenSha: null }, iso);
  assert.equal(sinArchivo.destinos.facebook.aprobado.imagenSha, null);
  assert.equal(imagenCambiada(conImagen(sinArchivo), "facebook"), true, "con imagen ya renderizada y sin huella aprobada hace falta aprobar la imagen");
  const fijada = aprobarImagenActual(conImagen(sinArchivo), iso, { imagenSha: sha });
  assert.equal(fijada.destinos.facebook.aprobado.imagenSha, sha);
  assert.equal(imagenCambiada(fijada, "facebook", { imagenSha: sha }), false);
  const enEspera = marcarEspera(aprobado, "facebook", { motivo: "imagen-cambiada" }, iso);
  assert.deepEqual(enEspera.destinos.facebook.espera, { motivo: "imagen-cambiada", fecha: iso });
  assert.equal(enEspera.estado, "programado");
  assert.doesNotThrow(() => validarPost(enEspera));
  assert.equal(marcarEspera(enEspera, "facebook", null, iso).destinos.facebook.espera, null);
  assert.equal(destinosDe(aprobarImagenActual(enEspera, iso, { imagenSha: huellaDeBytes(bytesB) })).facebook.espera, null, "aprobar la imagen actual levanta la espera");
});

function raizCon(posts) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "img-"));
  fs.mkdirSync(path.join(raiz, "data/sinlinea"), { recursive: true });
  fs.writeFileSync(path.join(raiz, "data/sinlinea/token-info.json"), JSON.stringify({ vence: "2026-11-01" }));
  for (const p of posts) escribirPost(path.join(raiz, "posts"), p);
  return raiz;
}
const fbFalso = () => { const llamadas = []; return { llamadas, perfil: async () => ({ id: "123", nombre: "P", coincideId: true }), imagenPublica: async () => true, crearContenedor: async () => { llamadas.push("crear"); return "ph1"; }, publicarContenedor: async () => { llamadas.push("publicar"); return { id: "ph1", idPublicacion: "123_1", permalink: "https://www.facebook.com/123/posts/1" }; }, existeContenedor: async () => true, publicacionConContenedor: async () => null }; };
const persistencia = { sincronizar: async () => ({ ok: true }), guardar: async () => ({ ok: true }), descartarLocal: async () => {} };

test("(imagen) el publicador descarga la imagen de la URL pública y solo envía si su huella es la aprobada; si cambió o no se aprobó, el destino espera y lo deja escrito", async () => {
  const shaA = huellaDeBytes(bytesA);
  const p = aprobarDestinos(conImagen({ ...base, id: base.id.slice(0, -4) + "0e01" }), "2026-09-10T14:00:00-05:00", { versiones: { facebook: "FB\n\nFuente: La Prensa" }, imagenSha: shaA }, iso);
  const raiz = raizCon([p]);
  // Servida otra imagen (regenerada desde la misma URL): no se envía; el destino queda en espera con motivo.
  const fb = fbFalso();
  const r = await ejecutarPublicar({ config: cfg, raiz, ahora, ig: null, clientes: { facebook: fb }, persistencia, huellaImagenDe: async () => ({ ok: true, sha: huellaDeBytes(bytesB) }), log });
  assert.equal(fb.llamadas.length, 0);
  assert.equal(r.destinos[p.id].facebook, "imagen-cambiada");
  const guardado = leerPosts(path.join(raiz, "posts")).find((x) => x.id === p.id);
  assert.equal(guardado.destinos.facebook.estado, "pendiente");
  assert.equal(guardado.destinos.facebook.espera.motivo, "imagen-cambiada");
  // Servida la aprobada: se publica y la espera desaparece.
  const fb2 = fbFalso();
  const r2 = await ejecutarPublicar({ config: cfg, raiz, ahora, ig: null, clientes: { facebook: fb2 }, persistencia, huellaImagenDe: async () => ({ ok: true, sha: shaA }), log });
  assert.deepEqual(fb2.llamadas, ["crear", "publicar"]);
  assert.deepEqual(r2.publicados, [p.id]);
  assert.equal(leerPosts(path.join(raiz, "posts")).find((x) => x.id === p.id).destinos.facebook.espera, null);
  // Aprobada sin archivo (imagenSha null) y ya con imagen: espera hasta aprobar la imagen actual.
  const sinHuella = aprobarDestinos(conImagen({ ...base, id: base.id.slice(0, -4) + "0e02" }), "2026-09-10T14:00:00-05:00", { versiones: { facebook: "FB" }, imagenSha: null }, iso);
  const raiz2 = raizCon([sinHuella]);
  const fb3 = fbFalso();
  const r3 = await ejecutarPublicar({ config: cfg, raiz: raiz2, ahora, ig: null, clientes: { facebook: fb3 }, persistencia, huellaImagenDe: async () => ({ ok: true, sha: shaA }), log });
  assert.equal(fb3.llamadas.length, 0);
  assert.equal(r3.destinos[sinHuella.id].facebook, "imagen-sin-aprobar");
  // No se pudo descargar la imagen: no se envía (no se sabe qué se publicaría).
  const fb4 = fbFalso();
  const r4 = await ejecutarPublicar({ config: cfg, raiz, ahora, ig: null, clientes: { facebook: fb4 }, persistencia, huellaImagenDe: async () => ({ ok: false, motivo: "HTTP 503" }), log });
  assert.equal(fb4.llamadas.length, 0);
  assert.equal(leerPosts(path.join(raiz, "posts")).find((x) => x.id === p.id).estado, "publicado", "ya estaba publicado: no se toca");
  void r4;
});

test("(imagen) compatibilidad: un programado antiguo sin destinos no tiene huella aprobada y se publica en Instagram como siempre", async () => {
  const { aprobar } = await import("../src/lib/estados.mjs");
  const antiguo = conImagen(aprobar({ ...base, id: base.id.slice(0, -4) + "0e03" }, "2026-09-10T14:00:00-05:00", iso));
  const raiz = raizCon([antiguo]);
  const llamadas = [];
  const ig = { perfil: async () => ({ username: "sinlinea.pa", userId: "1784" }), cuota: async () => ({ usados: 0, limite: 100 }), imagenPublica: async () => true, publicarImagen: async () => { llamadas.push("publicar"); return { idMedia: "m1", permalink: "https://www.instagram.com/p/m1/" }; } };
  let descargas = 0;
  const r = await ejecutarPublicar({ config: cfg, raiz, ahora, ig, persistencia, huellaImagenDe: async () => { descargas++; return { ok: true, sha: "x" }; }, log });
  assert.deepEqual(r.publicados, [antiguo.id]);
  assert.deepEqual(llamadas, ["publicar"]);
  assert.equal(descargas, 0, "sin huella aprobada no hay nada que comparar");
});
