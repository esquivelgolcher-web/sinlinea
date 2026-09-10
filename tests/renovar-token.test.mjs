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

test("(F2) renovarCuentas renueva también el token de Threads de una cuenta en modo Environment con perfil declarado: archivo temp propio y token-info-threads.json; sin secreto avisa y no impide renovar Instagram; sin perfil no toca Threads", async () => {
  const raiz = raizConCuentas({ cuentas: ["sinlinea", "prueba"], prefijo: "tok-th-" });
  const ruta = path.join(raiz, "cuentas/prueba/config.json");
  const cfg = JSON.parse(fs.readFileSync(ruta, "utf8"));
  fs.writeFileSync(ruta, JSON.stringify({ ...cfg, instagram: { origen: "entorno" }, conexiones: { threads: { publicar: false, usuario: "555" } } }, null, 2));
  const igDe = (config, secretos) => ({ refrescarToken: async () => ({ token: `NUEVO-${secretos.token}`, expiraEnSegundos: 60 * 86400 }) });
  const creados = [];
  const threadsDe = (config, secretos) => { creados.push(secretos); return { refrescarToken: async () => ({ token: `TH-${secretos.token}`, expiraEnSegundos: 60 * 86400 }) }; };
  const avisos = [];
  const log = { info: () => {}, warn: (m) => avisos.push(m), error: (m) => avisos.push(m) };
  const ahora = new Date("2026-09-07T15:00:00Z");
  const env = { IG_ACCESS_TOKEN: "VIEJO", IG_USER_ID: "1", THREADS_ACCESS_TOKEN: "THVIEJO", FB_PAGE_TOKEN: "EAA" };
  const r = await renovarCuentas({ configuracion: cargarConfiguracion(raiz), raiz, ahora, env, igDe, threadsDe, log, soloCuenta: "prueba", porCuenta: true });
  assert.equal(r.resultados.prueba.vence, "2026-11-06");
  assert.equal(r.resultados.prueba.threads.vence, "2026-11-06");
  assert.deepEqual(creados, [{ token: "THVIEJO" }], "el cliente de Threads solo recibe THREADS_ACCESS_TOKEN");
  assert.equal(fs.readFileSync(path.join(raiz, "temp/nuevo-token-THREADS_ACCESS_TOKEN.txt"), "utf8"), "TH-THVIEJO");
  assert.equal(fs.readFileSync(path.join(raiz, "temp/nuevo-token-IG_ACCESS_TOKEN.txt"), "utf8"), "NUEVO-VIEJO");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(raiz, "data/prueba/token-info-threads.json"), "utf8")), { vence: "2026-11-06", renovado: "2026-09-07" });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(raiz, "data/prueba/token-info.json"), "utf8")), { vence: "2026-11-06", renovado: "2026-09-07" }, "el de Instagram no cambia de sitio");
  assert.ok(avisos.every((m) => !m.includes("THVIEJO") && !m.includes("TH-")), "nunca se registran valores");
  // Sin THREADS_ACCESS_TOKEN: aviso, Instagram se renueva igual.
  fs.rmSync(path.join(raiz, "temp"), { recursive: true, force: true });
  const r2 = await renovarCuentas({ configuracion: cargarConfiguracion(raiz), raiz, ahora, env: { IG_ACCESS_TOKEN: "VIEJO", IG_USER_ID: "1" }, igDe, threadsDe, log, soloCuenta: "prueba", porCuenta: true });
  assert.equal(r2.resultados.prueba.vence, "2026-11-06");
  assert.match(r2.resultados.prueba.threads.error, /THREADS_ACCESS_TOKEN/);
  assert.equal(fs.existsSync(path.join(raiz, "temp/nuevo-token-THREADS_ACCESS_TOKEN.txt")), false);
  assert.ok(avisos.some((m) => /prueba/.test(m) && /Threads/.test(m) && /THREADS_ACCESS_TOKEN/.test(m)));
  // Sin perfil de Threads declarado: no se crea cliente ni se pide nada.
  fs.writeFileSync(ruta, JSON.stringify({ ...cfg, instagram: { origen: "entorno" } }, null, 2));
  creados.length = 0;
  const r3 = await renovarCuentas({ configuracion: cargarConfiguracion(raiz), raiz, ahora, env, igDe, threadsDe, log, soloCuenta: "prueba", porCuenta: true });
  assert.equal(r3.resultados.prueba.threads, undefined);
  assert.deepEqual(creados, []);
});
