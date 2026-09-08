import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ejecutarPublicar, publicarCuentas } from "../src/publicar.mjs";
import { cargarConfiguracion } from "../src/lib/config.mjs";
import { raizConCuentas } from "./ayuda/cuentas.mjs";
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
  fs.mkdirSync(path.join(raiz, "data/sinlinea"), { recursive: true });
  fs.writeFileSync(path.join(raiz, "data/sinlinea/token-info.json"), JSON.stringify(tokenInfo));
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

test("al publicar con éxito se limpia esperasImagen si venía de posponer", async () => {
  const a = { ...conImagen(aprobar({ ...base }, "2026-09-07T17:00:00-05:00", "2026-09-07T20:00:00.000Z")), esperasImagen: 2 };
  const raiz = raizCon([a]);
  const r = await ejecutarPublicar({ config: cfg, raiz, ahora, ig: igFalso(), log });
  assert.deepEqual(r.publicados, [a.id]);
  assert.equal(leerPosts(path.join(raiz, "posts"))[0].esperasImagen, 0);
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
  await assert.rejects(() => ejecutarPublicar({ config: { ...cfg, pages: { baseUrl: "https://CAMBIAR.github.io/sinlinea" } }, raiz, ahora, ig, log }), /CAMBIAR/);
  raiz = raizCon([a], { vence: "2026-09-10" });
  const avisos = [];
  await ejecutarPublicar({ config: cfg, raiz, ahora, ig: igFalso(), log: { info: () => {}, warn: (m) => avisos.push(m) } });
  assert.ok(avisos.some((m) => /token.*vence/i.test(m)));
});

test("(M0) un error de la API que incluya un token se guarda y se registra sin el token", async () => {
  const token = "IGAAR" + "x".repeat(60);
  const p = conImagen(aprobar(base, "2026-09-07T17:00:00-05:00", "2026-09-07T20:00:00.000Z"));
  const raiz = raizCon([p]);
  const avisos = [];
  const ig = igFalso({ fallo: new Error(`Invalid OAuth access token ${token} (url ?access_token=${token})`) });
  await ejecutarPublicar({ config: cfg, raiz, ahora, ig, log: { info: () => {}, warn: (m) => avisos.push(m) } });
  const guardado = leerPosts(path.join(raiz, "posts"))[0];
  assert.equal(guardado.estado, "error");
  assert.equal(guardado.error.mensaje.includes(token), false);
  assert.match(guardado.error.mensaje, /\[secreto\]/);
  assert.ok(avisos.every((m) => !m.includes(token)), "el log tampoco lleva el token");
});

test("(M1) una aprobación publica en la cuenta correcta: cada cliente de Instagram recibe solo los posts de su cuenta", async () => {
  const raiz = raizConCuentas({ cuentas: ["sinlinea", "prueba"], prefijo: "pub-m1-" });
  const configuracion = cargarConfiguracion(raiz);
  for (const c of ["sinlinea", "prueba"]) fs.writeFileSync(path.join(raiz, "data", c, "token-info.json"), JSON.stringify({ vence: "2026-11-01" }));
  const iso = "2026-09-07T20:00:00.000Z";
  const deSinlinea = conImagen(aprobar({ ...base, id: base.id.slice(0, -4) + "0701", cuenta: "sinlinea" }, "2026-09-07T17:00:00-05:00", iso));
  const dePrueba = conImagen(aprobar({ ...base, id: base.id.slice(0, -4) + "0702", cuenta: "prueba" }, "2026-09-07T17:00:00-05:00", iso));
  const antiguo = conImagen(aprobar({ ...base, id: base.id.slice(0, -4) + "0703" }, "2026-09-07T17:00:00-05:00", iso)); // sin cuenta → principal
  for (const p of [deSinlinea, dePrueba, antiguo]) escribirPost(path.join(raiz, "posts"), p);
  const igSinlinea = igFalso();
  const igPrueba = igFalso();
  const r = await publicarCuentas({ configuracion, raiz, ahora, log, igDe: (config) => (config.cuenta === "sinlinea" ? igSinlinea : igPrueba) });
  assert.deepEqual(r.resultados.sinlinea.publicados.sort(), [deSinlinea.id, antiguo.id].sort());
  assert.deepEqual(r.resultados.prueba.publicados, [dePrueba.id]);
  const idsPublicados = (ig) => ig.llamadas.filter((l) => l[0] === "publicar").map((l) => l[1]);
  assert.ok(idsPublicados(igSinlinea).every((u) => u.includes("0701") || u.includes("0703")));
  assert.deepEqual(idsPublicados(igPrueba).length, 1);
  assert.ok(idsPublicados(igPrueba)[0].includes("0702"));
});

test("(M1) un fallo o un secreto ausente en una cuenta no bloquea la publicación de las demás", async () => {
  const raiz = raizConCuentas({ cuentas: ["sinlinea", "prueba"], prefijo: "pub-m1b-" });
  const configuracion = cargarConfiguracion(raiz);
  for (const c of ["sinlinea", "prueba"]) fs.writeFileSync(path.join(raiz, "data", c, "token-info.json"), JSON.stringify({ vence: "2026-11-01" }));
  const iso = "2026-09-07T20:00:00.000Z";
  const a = conImagen(aprobar({ ...base, id: base.id.slice(0, -4) + "0711", cuenta: "sinlinea" }, "2026-09-07T17:00:00-05:00", iso));
  const b = conImagen(aprobar({ ...base, id: base.id.slice(0, -4) + "0712", cuenta: "prueba" }, "2026-09-07T17:00:00-05:00", iso));
  for (const p of [a, b]) escribirPost(path.join(raiz, "posts"), p);
  const igPrueba = igFalso();
  const avisos = [];
  const r = await publicarCuentas({
    configuracion, raiz, ahora, log: { info: () => {}, warn: (m) => avisos.push(m), error: (m) => avisos.push(m) },
    igDe: (config) => { if (config.cuenta === "sinlinea") throw new Error("Faltan los secretos: IG_ACCESS_TOKEN"); return igPrueba; },
  });
  assert.match(r.resultados.sinlinea.error, /IG_ACCESS_TOKEN/);
  assert.deepEqual(r.resultados.prueba.publicados, [b.id]);
  assert.ok(avisos.some((m) => /sinlinea/.test(m) && /IG_ACCESS_TOKEN/.test(m)));
  const posts = Object.fromEntries(leerPosts(path.join(raiz, "posts")).map((p) => [p.id, p]));
  assert.equal(posts[a.id].estado, "programado", "el post de la cuenta fallida queda intacto para la siguiente corrida");
  assert.equal(posts[b.id].estado, "publicado");
});

test("(M1) el aviso de vencimiento lee data/<cuenta>/token-info.json", async () => {
  const raiz = raizCon([], { vence: "2026-09-09" });
  const avisos = [];
  await ejecutarPublicar({ config: cfg, raiz, ahora, ig: igFalso(), log: { info: () => {}, warn: (m) => avisos.push(m) } });
  assert.ok(avisos.some((m) => /vence en/.test(m)), avisos.join(" | "));
});
