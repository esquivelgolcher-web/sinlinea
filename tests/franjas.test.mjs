import { test } from "node:test";
import assert from "node:assert/strict";
import { siguienteFranjaLibre, franjasOcupadas, choca } from "../src/lib/franjas.mjs";

const franjas = ["07:00", "09:30", "12:00", "14:30", "17:00", "19:30"];
const zonaHoraria = "America/Panama";

test("propone la primera franja al menos 15 min después de ahora", () => {
  const ahora = new Date("2026-09-07T19:20:00Z"); // 14:20 → 14:30 está a 10 min, no vale
  assert.equal(siguienteFranjaLibre({ franjas, ahora, zonaHoraria }), "2026-09-07T17:00:00-05:00");
  const temprano = new Date("2026-09-07T19:10:00Z"); // 14:10 → 14:30 sí vale (20 min)
  assert.equal(siguienteFranjaLibre({ franjas, ahora: temprano, zonaHoraria }), "2026-09-07T14:30:00-05:00");
});

test("salta franjas ocupadas y cruza al día siguiente", () => {
  const ahora = new Date("2026-09-07T19:20:00Z");
  const ocupadas = ["2026-09-07T17:00:00-05:00", "2026-09-07T22:00:00.000Z"]; // 17:00 dos formas
  assert.equal(siguienteFranjaLibre({ franjas, ocupadas, ahora, zonaHoraria }), "2026-09-07T19:30:00-05:00");
  const noche = new Date("2026-09-08T04:00:00Z"); // 23:00 del 7
  assert.equal(siguienteFranjaLibre({ franjas, ahora: noche, zonaHoraria }), "2026-09-08T07:00:00-05:00");
});

test("lanza si todo está ocupado durante maxDias", () => {
  const ahora = new Date("2026-09-07T00:00:00Z");
  const ocupadas = [];
  for (let d = 0; d < 3; d++) for (const h of franjas) ocupadas.push(`2026-09-0${6 + d}T${h}:00-05:00`);
  assert.throws(() => siguienteFranjaLibre({ franjas, ocupadas, ahora, zonaHoraria, maxDias: 2 }), /No hay franjas libres/);
});

test("franjasOcupadas y choca", () => {
  const posts = [
    { estado: "programado", programado: "2026-09-07T17:00:00-05:00" },
    { estado: "borrador", programado: null },
    { estado: "publicado", programado: "2026-09-06T17:00:00-05:00" },
  ];
  assert.deepEqual(franjasOcupadas(posts), ["2026-09-07T17:00:00-05:00"]);
  assert.equal(choca("2026-09-07T22:00:00Z", franjasOcupadas(posts)), true);
  assert.equal(choca("2026-09-07T19:30:00-05:00", franjasOcupadas(posts)), false);
});
