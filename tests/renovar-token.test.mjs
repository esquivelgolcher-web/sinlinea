import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ejecutarRenovar, renovarCuentas } from "../src/renovar-token.mjs";
import { cargarConfiguracion } from "../src/lib/config.mjs";
import { raizConCuentas } from "./ayuda/cuentas.mjs";

test("escribe token-info.json con la fecha de vencimiento y el token en temp/", async () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "tok-"));
  fs.mkdirSync(path.join(raiz, "data"));
  const ig = { refrescarToken: async () => ({ token: "NUEVO123", expiraEnSegundos: 60 * 86400 }) };
  const r = await ejecutarRenovar({ raiz, ahora: new Date("2026-09-07T15:00:00Z"), ig, log: { info: () => {} } });
  assert.equal(r.vence, "2026-11-06");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(raiz, "data/token-info.json"), "utf8")), { vence: "2026-11-06", renovado: "2026-09-07" });
  assert.equal(fs.readFileSync(path.join(raiz, "temp/nuevo-token-IG_ACCESS_TOKEN.txt"), "utf8"), "NUEVO123");
});

test("(M1) renovarCuentas renueva cada cuenta con secretos presentes, escribe data/<cuenta>/token-info.json y un archivo por nombre de secreto; sin secretos, avisa y sigue", async () => {
  const raiz = raizConCuentas({ cuentas: ["sinlinea", "prueba"], prefijo: "tok-m1-" });
  const configuracion = cargarConfiguracion(raiz);
  const env = { IG_ACCESS_TOKEN: "VIEJO", IG_USER_ID: "1" }; // la cuenta prueba no tiene secretos
  const igDe = (config, secretos) => ({ refrescarToken: async () => ({ token: `NUEVO-${config.cuenta}-${secretos.token}`, expiraEnSegundos: 60 * 86400 }) });
  const avisos = [];
  const r = await renovarCuentas({ configuracion, raiz, ahora: new Date("2026-09-07T15:00:00Z"), env, igDe, log: { info: () => {}, warn: (m) => avisos.push(m), error: (m) => avisos.push(m) } });
  assert.equal(r.resultados.sinlinea.vence, "2026-11-06");
  assert.match(r.resultados.prueba.error, /IG_ACCESS_TOKEN_PRUEBA/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(raiz, "data/sinlinea/token-info.json"), "utf8")), { vence: "2026-11-06", renovado: "2026-09-07" });
  assert.equal(fs.readFileSync(path.join(raiz, "temp/nuevo-token-IG_ACCESS_TOKEN.txt"), "utf8"), "NUEVO-sinlinea-VIEJO");
  assert.equal(fs.existsSync(path.join(raiz, "temp/nuevo-token-IG_ACCESS_TOKEN_PRUEBA.txt")), false);
  assert.ok(avisos.some((m) => /prueba/.test(m) && /IG_ACCESS_TOKEN_PRUEBA/.test(m)));
  assert.ok(avisos.every((m) => !m.includes("VIEJO") && !m.includes("NUEVO-")), "nunca se registran valores");
});
