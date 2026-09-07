import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ejecutarPublicar } from "../src/publicar.mjs";
import { cargarConfig } from "../src/lib/config.mjs";
import { leerPosts, escribirPost } from "../src/lib/posts.mjs";
import { hashImagen, aprobar } from "../src/lib/estados.mjs";

const cfg = { ...cargarConfig("config.json"), pages: { baseUrl: "https://u.github.io/sinlinea" } };
const base = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));
const ahora = new Date("2026-09-07T22:10:00Z"); // 17:10 Panamá
const log = { info: () => {}, warn: () => {} };
const conImagen = (p) => ({ ...p, imagen: { ruta: `public/img/${p.id}.jpg`, url: `https://u.github.io/sinlinea/img/${p.id}.jpg`, hash: hashImagen(p, 1), version: 1, renderizada: "2026-09-07T20:00:00.000Z" } });

function raizCon(posts, tokenInfo = { vence: "2026-11-01" }) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "pub-"));
  fs.mkdirSync(path.join(raiz, "data"), { recursive: true });
  fs.writeFileSync(path.join(raiz, "data/token-info.json"), JSON.stringify(tokenInfo));
  for (const p of posts) escribirPost(path.join(raiz, "posts"), p);
  return raiz;
}

function igFalso({ cuota = { usados: 0, limite: 100 }, publica = true, fallo = null } = {}) {
  const llamadas = [];
  return {
    llamadas,
    cuota: async () => cuota,
    imagenPublica: async (u) => { llamadas.push(["head", u]); return publica; },
    publicarImagen: async ({ imageUrl, caption }) => {
      llamadas.push(["publicar", imageUrl, caption]);
      if (fallo) throw fallo;
      return { idMedia: "m1", permalink: "https://www.instagram.com/p/x/" };
    },
  };
}

test("publica los programados con hora cumplida, en orden, y guarda permalink", async () => {
  const a = conImagen(aprobar({ ...base, id: base.id.slice(0, -4) + "000a" }, "2026-09-07T17:00:00-05:00", "2026-09-07T20:00:00.000Z"));
  const b = conImagen(aprobar({ ...base, id: base.id.slice(0, -4) + "000b" }, "2026-09-07T14:30:00-05:00", "2026-09-07T20:00:00.000Z"));
  const futuro = conImagen(aprobar({ ...base, id: base.id.slice(0, -4) + "000c" }, "2026-09-07T19:30:00-05:00", "2026-09-07T20:00:00.000Z"));
  const raiz = raizCon([a, b, futuro]);
  const ig = igFalso();
  const r = await ejecutarPublicar({ config: cfg, raiz, ahora, ig, log });
  assert.deepEqual(r.publicados, [b.id, a.id]);
  assert.deepEqual(r.errores, []);
  const posts = Object.fromEntries(leerPosts(path.join(raiz, "posts")).map((p) => [p.id, p]));
  assert.equal(posts[a.id].estado, "publicado");
  assert.equal(posts[a.id].publicacion.permalink, "https://www.instagram.com/p/x/");
  assert.equal(posts[futuro.id].estado, "programado");
  const caption = ig.llamadas.find((l) => l[0] === "publicar")[2];
  assert.match(caption, /Fuente: La Prensa/);
  assert.match(caption, /#SinLínea/);
});

test("imagen no pública: pospone hasta 3 veces y luego error de render", async () => {
  const a = conImagen(aprobar({ ...base }, "2026-09-07T17:00:00-05:00", "2026-09-07T20:00:00.000Z"));
  const raiz = raizCon([a]);
  for (let i = 1; i <= 2; i++) {
    const r = await ejecutarPublicar({ config: cfg, raiz, ahora, ig: igFalso({ publica: false }), log });
    assert.deepEqual(r.pospuestos, [a.id]);
    assert.equal(leerPosts(path.join(raiz, "posts"))[0].esperasImagen, i);
  }
  const r3 = await ejecutarPublicar({ config: cfg, raiz, ahora, ig: igFalso({ publica: false }), log });
  assert.deepEqual(r3.errores, [a.id]);
  assert.equal(leerPosts(path.join(raiz, "posts"))[0].error.paso, "render");
});

test("error de la API deja el post en error de instagram con el mensaje", async () => {
  const a = conImagen(aprobar({ ...base }, "2026-09-07T17:00:00-05:00", "2026-09-07T20:00:00.000Z"));
  const raiz = raizCon([a]);
  const r = await ejecutarPublicar({ config: cfg, raiz, ahora, ig: igFalso({ fallo: new Error("Media posted before business account conversion") }), log });
  assert.deepEqual(r.errores, [a.id]);
  const p = leerPosts(path.join(raiz, "posts"))[0];
  assert.equal(p.estado, "error");
  assert.equal(p.error.paso, "instagram");
  assert.match(p.error.mensaje, /business account/);
});

test("sin cuota no publica; dry-run no publica; baseUrl sin configurar lanza; token por vencer avisa", async () => {
  const a = conImagen(aprobar({ ...base }, "2026-09-07T17:00:00-05:00", "2026-09-07T20:00:00.000Z"));
  let raiz = raizCon([a]);
  const r = await ejecutarPublicar({ config: cfg, raiz, ahora, ig: igFalso({ cuota: { usados: 100, limite: 100 } }), log });
  assert.deepEqual(r.pospuestos, [a.id]);
  raiz = raizCon([a]);
  const ig = igFalso();
  const r2 = await ejecutarPublicar({ config: cfg, raiz, ahora, ig, log, dryRun: true });
  assert.deepEqual(r2.publicados, []);
  assert.ok(!ig.llamadas.some((l) => l[0] === "publicar"));
  await assert.rejects(() => ejecutarPublicar({ config: cargarConfig("config.json"), raiz, ahora, ig, log }), /CAMBIAR/);
  raiz = raizCon([a], { vence: "2026-09-10" });
  const avisos = [];
  await ejecutarPublicar({ config: cfg, raiz, ahora, ig: igFalso(), log: { info: () => {}, warn: (m) => avisos.push(m) } });
  assert.ok(avisos.some((m) => /token.*vence/i.test(m)));
});
