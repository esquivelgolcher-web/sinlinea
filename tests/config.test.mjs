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
