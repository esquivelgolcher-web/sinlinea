import { test } from "node:test";
import assert from "node:assert/strict";
import { todasFallaron, anotarFallos, resumirResultados } from "../src/lib/corrida.mjs";

test("todasFallaron solo es cierto cuando hay resultados y todos tienen error", () => {
  assert.equal(todasFallaron({}), false);
  assert.equal(todasFallaron({ a: { error: "x" } }), true);
  assert.equal(todasFallaron({ a: { error: "x" }, b: { creados: [] } }), false);
});

test("anotarFallos emite una anotación ::error:: por cuenta fallida y nada si no hay fallos", () => {
  const lineas = [];
  anotarFallos({ a: { error: "Faltan los secretos: IG_ACCESS_TOKEN_A" }, b: { publicados: [] } }, "PUBLICAR", (l) => lineas.push(l));
  assert.deepEqual(lineas, ["::error::PUBLICAR · cuenta a: Faltan los secretos: IG_ACCESS_TOKEN_A"]);
  const nada = [];
  anotarFallos({ b: { publicados: [] } }, "PUBLICAR", (l) => nada.push(l));
  assert.deepEqual(nada, []);
});

test("resumirResultados describe cada cuenta con la función dada", () => {
  const r = resumirResultados({ a: { error: "x" }, b: { creados: [1, 2], motivo: "ok" } }, (x) => `${x.creados.length} borradores (${x.motivo})`);
  assert.equal(r, "a: ERROR (x) · b: 2 borradores (ok)");
});
