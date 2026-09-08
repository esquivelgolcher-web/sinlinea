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
  categoria: "EDUCACIÓN",
  titular: "Cómo leer una licitación pública en cinco pasos",
  bajada: "Qué mirar en un pliego: objeto, requisitos, plazos, criterios de evaluación y quién adjudica.",
  caption: "Una licitación pública es un documento denso, pero tiene siempre la misma estructura.

Se explica en el post.",
  hashtags: ["#Transparencia", "#Aprende"],
  fuente: { medio: "PanamaCompra", url: "https://www.panamacompra.gob.pa/", titulo: "Portal de contrataciones públicas", publicado: "2026-09-08T00:00:00.000Z" },
  escena: "Pliego de licitación impreso sobre una mesa, con un marcador y una regla, luz de ventana, sin personas",
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
  assert.match(post.id, /-luiseskivelgolcher-panamacompra-/);
  assert.equal(post.fuente.url, "https://www.panamacompra.gob.pa/");
  assert.deepEqual(post.hashtags, ["#Transparencia", "#Aprende"]);
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
