import { test } from "node:test";
import assert from "node:assert/strict";
import { LIMITES, validarTextos, renderizarConAjuste } from "../src/lib/texto.mjs";

test("LIMITES declara los topes del titular y la bajada", () => {
  assert.equal(LIMITES.titularMax, 65);
  assert.deepEqual(LIMITES.titularIdeal, [40, 55]);
  assert.equal(LIMITES.bajadaMax, 110);
});

test("validarTextos acepta textos dentro de los límites", () => {
  const r = validarTextos({ titular: "A".repeat(65), bajada: "B".repeat(110) });
  assert.equal(r.ok, true);
  assert.deepEqual(r.errores, []);
});

test("validarTextos rechaza un titular de más de 65 caracteres", () => {
  const r = validarTextos({ titular: "A".repeat(66), bajada: "ok" });
  assert.equal(r.ok, false);
  assert.match(r.errores[0], /titular.*66.*65/i);
});

test("validarTextos rechaza una bajada de más de 110 caracteres y un titular vacío", () => {
  const r = validarTextos({ titular: "   ", bajada: "B".repeat(111) });
  assert.equal(r.ok, false);
  assert.equal(r.errores.length, 2);
  assert.match(r.errores[0], /titular.*vac/i);
  assert.match(r.errores[1], /bajada.*111.*110/i);
});

test("validarTextos cuenta caracteres tras recortar espacios en los extremos", () => {
  assert.equal(validarTextos({ titular: "  " + "A".repeat(65) + "  ", bajada: "b" }).ok, true);
});

const errNoCabe = (campo) => Object.assign(new Error(`no cabe ${campo}`), { code: "TEXTO_NO_CABE", campo });
const imagenFalsa = { ruta: "x.jpg", url: "u", hash: "h", version: 7, renderizada: "2026-09-08T00:00:00.000Z" };

test("renderizarConAjuste renderiza tal cual cuando el texto cabe y no llama a acortar", async () => {
  const llamadas = [];
  const post = { titular: "Corto", bajada: "b" };
  const r = await renderizarConAjuste({ post, render: async () => imagenFalsa, acortar: async (a) => { llamadas.push(a); return "x"; } });
  assert.equal(r.post, post);
  assert.equal(r.imagen, imagenFalsa);
  assert.deepEqual(llamadas, []);
});

test("renderizarConAjuste acorta antes de renderizar un titular de más de 65 caracteres", async () => {
  const llamadas = [];
  const vistos = [];
  const post = { titular: "T".repeat(80), bajada: "contexto" };
  const r = await renderizarConAjuste({
    post,
    render: async (p) => { vistos.push(p.titular); return imagenFalsa; },
    acortar: async (a) => { llamadas.push(a); return "Titular corto"; },
  });
  assert.equal(r.post.titular, "Titular corto");
  assert.deepEqual(vistos, ["Titular corto"]);
  assert.equal(llamadas.length, 1);
  assert.match(llamadas[0].motivo, /80 caracteres/);
  assert.equal(llamadas[0].bajada, "contexto");
});

test("renderizarConAjuste acorta y reintenta una vez cuando el render dice que el titular no cabe en 3 líneas", async () => {
  let intentos = 0;
  const llamadas = [];
  const post = { titular: "Cabe en caracteres pero no en líneas", bajada: "b" };
  const r = await renderizarConAjuste({
    post,
    render: async (p) => { intentos++; if (p.titular === post.titular) throw errNoCabe("titular"); return imagenFalsa; },
    acortar: async (a) => { llamadas.push(a); return "Más corto"; },
  });
  assert.equal(intentos, 2);
  assert.equal(r.post.titular, "Más corto");
  assert.match(llamadas[0].motivo, /no cabe titular/);
});

test("renderizarConAjuste propaga el error si no hay acortar, si el que no cabe es la bajada, o si el segundo intento también falla", async () => {
  const post = { titular: "t", bajada: "b" };
  await assert.rejects(() => renderizarConAjuste({ post, render: async () => { throw errNoCabe("titular"); }, acortar: null }), /no cabe titular/);
  await assert.rejects(() => renderizarConAjuste({ post, render: async () => { throw errNoCabe("bajada"); }, acortar: async () => "x" }), /no cabe bajada/);
  await assert.rejects(() => renderizarConAjuste({ post, render: async () => { throw errNoCabe("titular"); }, acortar: async () => "x" }), /no cabe titular/);
  await assert.rejects(() => renderizarConAjuste({ post, render: async () => { throw new Error("otro"); }, acortar: async () => "x" }), /otro/);
});

test("renderizarConAjuste deja el titular original si acortar falla y entonces propaga el error del render", async () => {
  const post = { titular: "T".repeat(70), bajada: "b" };
  await assert.rejects(
    () => renderizarConAjuste({ post, render: async () => { throw errNoCabe("titular"); }, acortar: async () => { throw new Error("Claude no disponible"); } }),
    /no cabe titular/,
  );
});
