import { test } from "node:test";
import assert from "node:assert/strict";
import { LIMITES, validarTextos } from "../src/lib/texto.mjs";

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
