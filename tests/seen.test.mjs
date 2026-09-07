import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cargarVistas, guardarVistas, estaVista, marcarVistas, purgarVistas } from "../src/lib/seen.mjs";

test("cargarVistas devuelve vacío si no existe y guarda/lee ida y vuelta", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seen-"));
  const ruta = path.join(dir, "seen.json");
  assert.deepEqual(cargarVistas(ruta), { urls: {} });
  const v = marcarVistas({ urls: {} }, ["https://a.test/1"], "2026-09-07");
  guardarVistas(ruta, v);
  assert.deepEqual(cargarVistas(ruta), { urls: { "https://a.test/1": "2026-09-07" } });
  assert.ok(fs.readFileSync(ruta, "utf8").endsWith("}\n"));
});

test("marcarVistas no muta y estaVista consulta", () => {
  const v0 = { urls: {} };
  const v1 = marcarVistas(v0, ["https://a.test/1", "https://a.test/2"], "2026-09-07");
  assert.deepEqual(v0, { urls: {} });
  assert.ok(estaVista(v1, "https://a.test/2"));
  assert.ok(!estaVista(v1, "https://a.test/3"));
});

test("purgarVistas elimina las de más de 30 días", () => {
  const v = { urls: { vieja: "2026-08-01", reciente: "2026-09-01" } };
  assert.deepEqual(purgarVistas(v, "2026-09-07"), { urls: { reciente: "2026-09-01" } });
});
