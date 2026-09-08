import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { crearBorradorManual } from "../src/borrador.mjs";
import { cargarConfiguracion } from "../src/lib/config.mjs";
import { leerPosts } from "../src/lib/posts.mjs";
import { raizConCuentas } from "./ayuda/cuentas.mjs";

const ahora = new Date("2026-09-08T18:00:00Z");
const entrada = {
  categoria: "CULTURA",
  titular: "Mate del pastor: por qué funciona y cómo evitarlo",
  bajada: "Cuatro jugadas bastan para dar mate a un principiante; una sola defensa correcta lo desarma.",
  caption: "El mate del pastor es la trampa más conocida del ajedrez.\n\nSe explica en el post.",
  hashtags: ["#Ajedrez", "#Aprende"],
  fuente: { medio: "Lichess", url: "https://lichess.org/analysis", titulo: "Análisis de la posición", publicado: "2026-09-08T00:00:00.000Z" },
  escena: "Tablero de ajedrez de madera con las piezas del mate del pastor, luz lateral suave, sin personas",
};

test("crea un borrador manual para la cuenta indicada sin credenciales de Instagram: estado borrador, sin programar, con cuenta y fuente", async () => {
  const raiz = raizConCuentas({ cuentas: ["sinlinea", "luiseskivelgolcher"], prefijo: "borrador-" });
  const configuracion = cargarConfiguracion(raiz);
  const renders = [];
  const render = async (post) => { renders.push(post.id); return { ruta: `public/img/${post.id}.jpg`, url: `https://u/img/${post.id}.jpg`, hash: "0".repeat(16), version: 7, estilo: "x", renderizada: ahora.toISOString() }; };
  const post = await crearBorradorManual({ configuracion, cuenta: "luiseskivelgolcher", entrada, ahora, raiz, render, log: { info: () => {}, warn: () => {} } });
  assert.equal(post.cuenta, "luiseskivelgolcher");
  assert.equal(post.estado, "borrador");
  assert.equal(post.programado, null);
  assert.match(post.id, /-luiseskivelgolcher-lichess-/);
  assert.equal(post.fuente.url, "https://lichess.org/analysis");
  assert.deepEqual(post.hashtags, ["#Ajedrez", "#Aprende"]);
  assert.equal(post.ilustracion.descripcion, entrada.escena);
  assert.equal(post.ilustracion.usar, configuracion.cuentas[1].ilustraciones.activo, "usa ilustración solo si la cuenta las tiene activas");
  assert.deepEqual(renders, [post.id]);
  assert.equal(post.imagen.ruta, `public/img/${post.id}.jpg`);
  const guardados = leerPosts(path.join(raiz, "posts"));
  assert.equal(guardados.length, 1);
  assert.equal(guardados[0].id, post.id);
});

test("sin render el borrador se guarda con imagen null (REGENERAR la dibuja después) y respeta los límites de texto", async () => {
  const raiz = raizConCuentas({ cuentas: ["sinlinea", "luiseskivelgolcher"], prefijo: "borrador2-" });
  const configuracion = cargarConfiguracion(raiz);
  const post = await crearBorradorManual({ configuracion, cuenta: "luiseskivelgolcher", entrada, ahora, raiz, render: null, log: { info: () => {}, warn: () => {} } });
  assert.equal(post.imagen, null);
  await assert.rejects(() => crearBorradorManual({ configuracion, cuenta: "luiseskivelgolcher", entrada: { ...entrada, titular: "T".repeat(70) }, ahora, raiz, render: null }), /titular.*70.*65/);
  await assert.rejects(() => crearBorradorManual({ configuracion, cuenta: "nadie", entrada, ahora, raiz, render: null }), /nadie/);
  await assert.rejects(() => crearBorradorManual({ configuracion, cuenta: "luiseskivelgolcher", entrada: { ...entrada, categoria: "CHISMES" }, ahora, raiz, render: null }), /categoria/i);
});

test("si el render falla, el borrador queda guardado en estado error de render para que REGENERAR lo reintente", async () => {
  const raiz = raizConCuentas({ cuentas: ["sinlinea", "luiseskivelgolcher"], prefijo: "borrador3-" });
  const configuracion = cargarConfiguracion(raiz);
  const post = await crearBorradorManual({ configuracion, cuenta: "luiseskivelgolcher", entrada, ahora, raiz, render: async () => { throw new Error("Chromium no disponible"); }, log: { info: () => {}, warn: () => {} } });
  assert.equal(post.estado, "error");
  assert.equal(post.error.paso, "render");
  assert.equal(fs.existsSync(path.join(raiz, "posts", `${post.id}.json`)), true);
});
