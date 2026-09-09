// Métricas fase 1: la matriz de cuentas del workflow diario solo incluye cuentas con metricas.recoger = true,
// con independencia de automatico.generar/publicar; la sonda manual puede apuntar a cualquier cuenta activa.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cuentasActivas } from "../src/cuentas-activas.mjs";

const cuenta = (id, extra = {}) => ({ cuenta: id, archivada: false, automatico: { generar: false, publicar: false }, instagram: {}, ...extra });

test("(métricas) --solo-metricas filtra por metricas.recoger, no por las automatizaciones", () => {
  const configuracion = { cuentas: [
    cuenta("a", { metricas: { recoger: true } }),
    cuenta("b"),
    cuenta("c", { metricas: { recoger: true }, instagram: { origen: "entorno" } }),
    cuenta("d", { metricas: { recoger: true }, archivada: true }),
  ] };
  const r = cuentasActivas(configuracion, { soloMetricas: true });
  assert.deepEqual(r.repositorio.map((c) => c.cuenta), ["a"]);
  assert.deepEqual(r.entorno.map((c) => c.cuenta), ["c"]);
  const todas = cuentasActivas(configuracion);
  assert.deepEqual([...todas.repositorio, ...todas.entorno].map((c) => c.cuenta).sort(), ["a", "b", "c"]);
  const una = cuentasActivas(configuracion, { soloCuenta: "b", soloMetricas: false });
  assert.deepEqual(una.repositorio.map((c) => c.cuenta), ["b"], "la sonda manual puede consultar una cuenta sin recogida");
});
