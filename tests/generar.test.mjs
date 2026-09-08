import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ejecutarGenerar } from "../src/generar.mjs";
import { cargarConfig } from "../src/lib/config.mjs";
import { leerPosts } from "../src/lib/posts.mjs";
import { cargarVistas } from "../src/lib/seen.mjs";

const xml = fs.readFileSync("tests/fixtures/laprensa.xml", "utf8");
const portada = fs.readFileSync("tests/fixtures/laestrella-portada.html", "utf8");
const articulo = fs.readFileSync("tests/fixtures/laestrella-articulo.html", "utf8");
const ahora = new Date("2026-09-07T19:20:31Z");

function raizTemporal() {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "sinlinea-"));
  fs.mkdirSync(path.join(raiz, "posts"), { recursive: true });
  fs.mkdirSync(path.join(raiz, "data"), { recursive: true });
  fs.mkdirSync(path.join(raiz, "prompts"), { recursive: true });
  fs.copyFileSync("config.json", path.join(raiz, "config.json"));
  const cfgTexto = fs.readFileSync(path.join(raiz, "config.json"), "utf8").replace("https://CAMBIAR.github.io/sinlinea", "https://prueba.github.io/sinlinea");
  fs.writeFileSync(path.join(raiz, "config.json"), cfgTexto);
  fs.copyFileSync("prompts/editorial.md", path.join(raiz, "prompts/editorial.md"));
  fs.writeFileSync(path.join(raiz, "data/seen.json"), '{ "urls": {} }\n');
  return raiz;
}

const fetchText = async (url) => {
  if (url.includes("prensa.com/arc")) return xml;
  if (url === "https://www.laestrella.com.pa/") return portada;
  return articulo;
};

function clientFalso(indices) {
  return { messages: { parse: async (p) => ({
    stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 },
    parsed_output: { descartados: [], seleccion: indices.map((i, k) => ({
      indiceCandidato: i, categoria: "SOCIEDAD", titular: `Titular ${k}`, bajada: "Bajada", caption: "Caption", hashtags: ["#Panamá"], relevancia: 1 - k / 10, motivo: "m", escena: "Estación de bomberos de Panamá",
    })) },
  }) } };
}

const ilustradorFalso = () => ({ llamadas: [], async generar(d) { this.llamadas.push(d); return Buffer.from("ffd8ffd9", "hex"); } });

const renderOkFalso = async (post) => ({ ruta: `public/img/${post.id}.jpg`, url: `https://x/img/${post.id}.jpg`, hash: "0".repeat(16), version: 1, renderizada: ahora.toISOString() });
const log = { info: () => {}, warn: () => {} };

test("crea borradores, marca todas las URLs candidatas como vistas y rota variantes", async () => {
  const raiz = raizTemporal();
  const config = cargarConfig(path.join(raiz, "config.json"));
  const r = await ejecutarGenerar({ config, raiz, ahora, fetchText, client: clientFalso([0, 1]), render: renderOkFalso, log });
  assert.equal(r.motivo, "ok");
  assert.equal(r.creados.length, 2);
  const posts = leerPosts(path.join(raiz, "posts"));
  assert.equal(posts.length, 2);
  assert.deepEqual(posts.map((p) => p.variante).sort(), ["amarillo", "negro"]);
  assert.ok(posts.every((p) => p.estado === "borrador" && p.imagen?.hash));
  const vistas = cargarVistas(path.join(raiz, "data/seen.json"));
  assert.ok(Object.keys(vistas.urls).length >= 3, "marca elegidos y no elegidos");
  const otra = await ejecutarGenerar({ config, raiz, ahora, fetchText, client: clientFalso([0]), render: renderOkFalso, log });
  assert.equal(otra.motivo, "sin-candidatos");
});

test("respeta el cupo diario y no llama a Claude si está agotado", async () => {
  const raiz = raizTemporal();
  const config = cargarConfig(path.join(raiz, "config.json"));
  config.generar.maxBorradoresPorDia = 1;
  let llamadas = 0;
  const client = { messages: { parse: async (p) => { llamadas++; return clientFalso([0, 1]).messages.parse(p); } } };
  const r = await ejecutarGenerar({ config, raiz, ahora, fetchText, client, render: renderOkFalso, log });
  assert.equal(r.creados.length, 1);
  const r2 = await ejecutarGenerar({ config, raiz, ahora, fetchText, client, render: renderOkFalso, log });
  assert.equal(r2.motivo, "cupo");
  assert.equal(llamadas, 1);
});

test("si el render falla el post queda en error de render", async () => {
  const raiz = raizTemporal();
  const config = cargarConfig(path.join(raiz, "config.json"));
  const render = async () => { throw new Error("chromium caído"); };
  const r = await ejecutarGenerar({ config, raiz, ahora, fetchText, client: clientFalso([0]), render, log });
  assert.equal(r.creados[0].estado, "error");
  assert.equal(r.creados[0].error.paso, "render");
  assert.match(r.creados[0].error.mensaje, /chromium/);
});

test("dry-run escribe en temp/ y no toca posts ni seen", async () => {
  const raiz = raizTemporal();
  const config = cargarConfig(path.join(raiz, "config.json"));
  const r = await ejecutarGenerar({ config, raiz, ahora, fetchText, client: clientFalso([0]), render: renderOkFalso, log, dryRun: true });
  assert.equal(r.creados.length, 1);
  assert.equal(leerPosts(path.join(raiz, "posts")).length, 0);
  assert.equal(leerPosts(path.join(raiz, "temp/dry-run/posts")).length, 1);
  assert.deepEqual(cargarVistas(path.join(raiz, "data/seen.json")), { urls: {} });
});

test("tres posts en la misma corrida usan las tres variantes", async () => {
  const raiz = raizTemporal();
  const config = cargarConfig(path.join(raiz, "config.json"));
  config.generar.maxPorCorrida = 3;
  const r = await ejecutarGenerar({ config, raiz, ahora, fetchText, client: clientFalso([0, 1, 2]), render: renderOkFalso, log });
  assert.deepEqual(r.creados.map((p) => p.variante), ["negro", "amarillo", "rojo"]);
});

test("se niega a generar mientras pages.baseUrl tenga el valor CAMBIAR", async () => {
  const raiz = raizTemporal();
  const config = cargarConfig(path.join(raiz, "config.json"));
  config.pages.baseUrl = "https://CAMBIAR.github.io/sinlinea";
  await assert.rejects(() => ejecutarGenerar({ config, raiz, ahora, fetchText, client: clientFalso([0]), render: renderOkFalso, log }), /CAMBIAR/);
});

test("con ilustrador, el post nace con ilustración usada y archivo guardado", async () => {
  const raiz = raizTemporal();
  const config = cargarConfig(path.join(raiz, "config.json"));
  const guardadas = [];
  const guardar = async (buf, ruta) => { guardadas.push(ruta); fs.mkdirSync(path.dirname(ruta), { recursive: true }); fs.writeFileSync(ruta, buf); };
  const il = ilustradorFalso();
  const r = await ejecutarGenerar({ config, raiz, ahora, fetchText, client: clientFalso([0]), render: renderOkFalso, log, ilustrador: il, guardar });
  const p = r.creados[0];
  assert.equal(il.llamadas[0], "Estación de bomberos de Panamá");
  assert.equal(p.ilustracion.usar, true);
  assert.equal(p.ilustracion.ruta, `public/ilus/${p.id}.jpg`);
  assert.equal(p.ilustracion.proveedor, "gemini");
  assert.ok(fs.existsSync(path.join(raiz, p.ilustracion.ruta)));
});

test("si la ilustración falla, el post sale con usar=false y error, y sin ilustrador no se llama", async () => {
  const raiz = raizTemporal();
  const config = cargarConfig(path.join(raiz, "config.json"));
  const il = { async generar() { throw new Error("Gemini respondió 429: quota"); } };
  const r = await ejecutarGenerar({ config, raiz, ahora, fetchText, client: clientFalso([0]), render: renderOkFalso, log, ilustrador: il });
  assert.equal(r.creados[0].ilustracion.usar, false);
  assert.match(r.creados[0].ilustracion.error.mensaje, /429/);
  assert.equal(r.creados[0].estado, "borrador");
  const raiz2 = raizTemporal();
  const r2 = await ejecutarGenerar({ config: cargarConfig(path.join(raiz2, "config.json")), raiz: raiz2, ahora, fetchText, client: clientFalso([0]), render: renderOkFalso, log });
  assert.equal(r2.creados[0].ilustracion.usar, false);
  assert.equal(r2.creados[0].ilustracion.error, null);
});

test("si Claude entrega un titular de más de 65 caracteres, GENERAR pide uno corto y renderiza ese", async () => {
  const raiz = raizTemporal();
  const config = cargarConfig(path.join(raiz, "config.json"));
  const client = { messages: { parse: async () => ({
    stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 },
    parsed_output: { descartados: [], seleccion: [{ indiceCandidato: 0, categoria: "SOCIEDAD", titular: "Un titular larguísimo que se pasa de los sesenta y cinco caracteres permitidos por la plantilla", bajada: "Bajada", caption: "Caption", hashtags: ["#Panamá"], relevancia: 1, motivo: "m", escena: "Estación de bomberos de Panamá" }] },
  }) } };
  const acortados = [];
  const acortar = async (a) => { acortados.push(a); return "Titular corto para la imagen"; };
  const r = await ejecutarGenerar({ config, raiz, ahora, fetchText, client, render: renderOkFalso, log, acortar });
  assert.equal(r.creados.length, 1);
  assert.equal(r.creados[0].titular, "Titular corto para la imagen");
  assert.equal(r.creados[0].estado, "borrador");
  assert.equal(acortados.length, 1);
  assert.match(acortados[0].motivo, /caracteres/);
  assert.equal(leerPosts(path.join(raiz, "posts"))[0].titular, "Titular corto para la imagen");
});

test("si el render avisa que el titular no cabe en 3 líneas, GENERAR acorta y vuelve a renderizar", async () => {
  const raiz = raizTemporal();
  const config = cargarConfig(path.join(raiz, "config.json"));
  const render = async (post) => {
    if (post.titular === "Titular 0") throw Object.assign(new Error("El titular no cabe en 3 líneas"), { code: "TEXTO_NO_CABE", campo: "titular" });
    return renderOkFalso(post);
  };
  const r = await ejecutarGenerar({ config, raiz, ahora, fetchText, client: clientFalso([0]), render, log, acortar: async () => "Titular 0 corto" });
  assert.equal(r.creados[0].estado, "borrador");
  assert.equal(r.creados[0].titular, "Titular 0 corto");
  const sinAcortar = await ejecutarGenerar({ config, raiz: raizTemporal(), ahora, fetchText, client: clientFalso([0]), render, log, acortar: null });
  assert.equal(sinAcortar.creados[0].estado, "error");
  assert.match(sinAcortar.creados[0].error.mensaje, /3 líneas/);
});
