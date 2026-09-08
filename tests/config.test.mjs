import { test } from "node:test";
import assert from "node:assert/strict";
import { cargarConfig, validarConfig } from "../src/lib/config.mjs";

test("config.json del repo es válido", () => {
  const cfg = cargarConfig("config.json");
  assert.equal(cfg.zonaHoraria, "America/Panama");
  assert.equal(cfg.fuentes.length, 2);
});

function base() {
  return structuredClone(cargarConfig("config.json"));
}

test("rechaza una franja mal formada", () => {
  const cfg = base();
  cfg.franjas.push("25:00");
  assert.throws(() => validarConfig(cfg), /franjas/);
});

test("rechaza un tipo de fuente desconocido y una portada sin patrón", () => {
  const cfg = base();
  cfg.fuentes[0].tipo = "twitter";
  assert.throws(() => validarConfig(cfg), /fuentes\[0\]\.tipo/);
  const cfg2 = base();
  delete cfg2.fuentes[1].patronArticulo;
  assert.throws(() => validarConfig(cfg2), /patronArticulo/);
});

test("rechaza un esfuerzo inválido y una apiVersion mal formada", () => {
  const cfg = base();
  cfg.claude.esfuerzo = "ultra";
  assert.throws(() => validarConfig(cfg), /esfuerzo/);
  const cfg2 = base();
  cfg2.instagram.apiVersion = "23";
  assert.throws(() => validarConfig(cfg2), /apiVersion/);
});

test("valida el bloque ilustraciones", () => {
  const cfg = base();
  assert.equal(cfg.ilustraciones.proveedor, "gemini");
  cfg.ilustraciones.tamano = "8K";
  assert.throws(() => validarConfig(cfg), /ilustraciones\.tamano/);
  const cfg2 = base();
  cfg2.ilustraciones.activo = "si";
  assert.throws(() => validarConfig(cfg2), /ilustraciones\.activo/);
});

test("(M5) ilustraciones.maxPorCorrida es obligatorio y debe ser un entero positivo", () => {
  const cfg = base();
  assert.equal(cfg.ilustraciones.maxPorCorrida, 4);
  const sinMax = base();
  delete sinMax.ilustraciones.maxPorCorrida;
  assert.throws(() => validarConfig(sinMax), /ilustraciones\.maxPorCorrida/);
  const cero = base();
  cero.ilustraciones.maxPorCorrida = 0;
  assert.throws(() => validarConfig(cero), /ilustraciones\.maxPorCorrida/);
  const noEntero = base();
  noEntero.ilustraciones.maxPorCorrida = "4";
  assert.throws(() => validarConfig(noEntero), /ilustraciones\.maxPorCorrida/);
});

test("(M0) instagram.tokenSecreto y usuarioIdSecreto son opcionales y deben ser nombres de secreto válidos", () => {
  const cfg = base();
  assert.equal(cfg.instagram.tokenSecreto, "IG_ACCESS_TOKEN");
  assert.equal(cfg.instagram.usuarioIdSecreto, "IG_USER_ID");
  delete cfg.instagram.tokenSecreto; delete cfg.instagram.usuarioIdSecreto;
  assert.doesNotThrow(() => validarConfig(cfg));
  cfg.instagram.tokenSecreto = "ig token";
  assert.throws(() => validarConfig(cfg), /tokenSecreto/);
  cfg.instagram.tokenSecreto = "IG_ACCESS_TOKEN_OTRO";
  cfg.instagram.usuarioIdSecreto = "id-otro";
  assert.throws(() => validarConfig(cfg), /usuarioIdSecreto/);
});
