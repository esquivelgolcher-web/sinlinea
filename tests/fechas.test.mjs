import { test } from "node:test";
import assert from "node:assert/strict";
import {
  partesZona, claveDia, claveMinuto, fechaCorta, isoDesdeClave, sumarDias, horaMinutoDeIso,
} from "../src/lib/fechas.mjs";

const instante = new Date("2026-09-07T19:20:31Z"); // 14:20 en Panamá

test("partesZona devuelve la hora de Panamá", () => {
  assert.deepEqual(partesZona(instante), { year: 2026, month: 9, day: 7, hour: 14, minute: 20 });
});

test("claveDia y claveMinuto cruzan la medianoche correctamente", () => {
  assert.equal(claveDia(instante), "2026-09-07");
  assert.equal(claveMinuto(instante), "2026-09-07-1420");
  assert.equal(claveDia(new Date("2026-09-08T03:30:00Z")), "2026-09-07"); // 22:30 del 7
  assert.equal(claveMinuto(new Date("2026-09-08T05:00:00Z")), "2026-09-08-0000");
});

test("fechaCorta usa abreviaturas en español sin punto", () => {
  assert.equal(fechaCorta(instante), "7 sep 2026");
  assert.equal(fechaCorta(new Date("2026-01-15T12:00:00Z")), "15 ene 2026");
});

test("isoDesdeClave produce un ISO con offset de Panamá", () => {
  const iso = isoDesdeClave("2026-09-07", "17:00");
  assert.equal(iso, "2026-09-07T17:00:00-05:00");
  assert.equal(new Date(iso).toISOString(), "2026-09-07T22:00:00.000Z");
});

test("sumarDias cruza meses y años", () => {
  assert.equal(sumarDias("2026-12-31", 1), "2027-01-01");
  assert.equal(sumarDias("2026-03-01", -1), "2026-02-28");
});

test("horaMinutoDeIso convierte a hora local", () => {
  assert.equal(horaMinutoDeIso("2026-09-07T22:00:00.000Z"), "17:00");
  assert.equal(horaMinutoDeIso("2026-09-07T07:00:00-05:00"), "07:00");
});
