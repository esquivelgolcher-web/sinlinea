import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarPruebaInstagram } from "../src/probar-instagram.mjs";
import { cargarConfiguracion } from "../src/lib/config.mjs";
import fs from "node:fs";
import path from "node:path";
import { raizConCuentas } from "./ayuda/cuentas.mjs";

// Raíz de pruebas: las cuentas reales pueden migrar de origen (Environment); el ayudante las deja en modo repositorio.
const configuracion = cargarConfiguracion(raizConCuentas({ cuentas: ["sinlinea", "luiseskivelgolcher"], prefijo: "probar-ig-" }));
const token = "IGAAR" + "x".repeat(60);
const env = { IG_ACCESS_TOKEN: token, IG_USER_ID: "1784", IG_ACCESSTOKEN_LUISESKIVELGOLCHER: token + "L", IG_USER_ID_LUISESKIVELGOLCHER: "9999" };

test("la prueba confirma la identidad cuando el usuario y el id numérico coinciden, sin revelar secretos", async () => {
  const igDe = (config, secretos) => ({ perfil: async () => ({ username: "luiseskivelgolcher", userId: secretos.usuarioId, coincideId: true }) });
  const r = await ejecutarPruebaInstagram({ configuracion, cuenta: "luiseskivelgolcher", env, igDe });
  assert.equal(r.ok, true);
  assert.match(r.lineas.join("\n"), /@luiseskivelgolcher/);
  assert.match(r.lineas.join("\n"), /id numérico coincide/i);
  for (const v of Object.values(env)) assert.equal(r.lineas.join("\n").includes(v), false);
});

test("la prueba falla si la credencial pertenece a otro usuario o el id numérico no coincide", async () => {
  const otro = (config) => ({ perfil: async () => ({ username: "otra.persona", userId: "1", coincideId: true }) });
  const r = await ejecutarPruebaInstagram({ configuracion, cuenta: "luiseskivelgolcher", env, igDe: otro });
  assert.equal(r.ok, false);
  assert.match(r.lineas.join("\n"), /@otra\.persona/);
  assert.match(r.lineas.join("\n"), /se esperaba @luiseskivelgolcher/);
  const idMal = (config) => ({ perfil: async () => ({ username: "luiseskivelgolcher", userId: "1", coincideId: false }) });
  const r2 = await ejecutarPruebaInstagram({ configuracion, cuenta: "luiseskivelgolcher", env, igDe: idMal });
  assert.equal(r2.ok, false);
  assert.match(r2.lineas.join("\n"), /id numérico no coincide/i);
});

test("sin secretos la prueba lo dice por nombre; una cuenta desconocida es un error; sin cuenta se prueban todas las que tengan secretos", async () => {
  const igDe = (config) => ({ perfil: async () => ({ username: config.marca.usuario.slice(1), userId: "x", coincideId: true }) });
  const sin = await ejecutarPruebaInstagram({ configuracion, cuenta: "luiseskivelgolcher", env: {}, igDe });
  assert.equal(sin.ok, false);
  assert.match(sin.lineas.join("\n"), /IG_ACCESSTOKEN_LUISESKIVELGOLCHER/);
  const desconocida = await ejecutarPruebaInstagram({ configuracion, cuenta: "nadie", env, igDe });
  assert.equal(desconocida.ok, false);
  assert.match(desconocida.lineas.join("\n"), /nadie/);
  const todas = await ejecutarPruebaInstagram({ configuracion, env: { IG_ACCESS_TOKEN: token, IG_USER_ID: "1784" }, igDe });
  assert.equal(todas.ok, true, "sinlinea coincide y luiseskivelgolcher se omite por falta de secretos sin fallar");
  assert.match(todas.lineas.join("\n"), /luiseskivelgolcher.*(sin secretos|faltan)/i);
});

test("(vigencia) la prueba escribe data/<cuenta>/token-info.json con la fecha real si la API la da, y como desconocida si no; nunca asume hoy + 60", async () => {
  const raiz = raizConCuentas({ cuentas: ["sinlinea", "luiseskivelgolcher"], prefijo: "probar-ig-" });
  const conf = cargarConfiguracion(raiz);
  const ahora = new Date("2026-09-08T15:00:00Z");
  const igConFecha = () => ({ perfil: async () => ({ username: "luiseskivelgolcher", userId: "9999", coincideId: true }), vigencia: async () => ({ vence: "2026-11-02", origen: "debug_token" }) });
  const r = await ejecutarPruebaInstagram({ configuracion: conf, cuenta: "luiseskivelgolcher", env, igDe: igConFecha, raiz, ahora });
  assert.equal(r.ok, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(raiz, "data/luiseskivelgolcher/token-info.json"), "utf8")), { vence: "2026-11-02", comprobado: "2026-09-08", origen: "debug_token" });
  assert.match(r.lineas.join("\n"), /vence el 2026-11-02/);
  const igSinFecha = () => ({ perfil: async () => ({ username: "luiseskivelgolcher", userId: "9999", coincideId: true }), vigencia: async () => ({ vence: null, origen: "desconocida" }) });
  const r2 = await ejecutarPruebaInstagram({ configuracion: conf, cuenta: "luiseskivelgolcher", env, igDe: igSinFecha, raiz, ahora });
  assert.equal(r2.ok, true, "la caducidad desconocida no invalida la identidad");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(raiz, "data/luiseskivelgolcher/token-info.json"), "utf8")), { vence: null, comprobado: "2026-09-08", origen: "desconocida" });
  assert.match(r2.lineas.join("\n"), /caducidad desconocida/i);
  assert.doesNotMatch(r2.lineas.join("\n"), /2026-11-07/, "no inventa hoy + 60 días");
  assert.equal(fs.existsSync(path.join(raiz, "data/sinlinea/token-info.json")), false, "no toca otras cuentas");
});

test("(vigencia) si hay token pero falta el secreto del id numérico, la prueba informa el user_id devuelto por la API para guardarlo como secreto", async () => {
  const soloToken = { IG_ACCESSTOKEN_LUISESKIVELGOLCHER: token + "L" };
  const igDe = () => ({ perfil: async () => ({ username: "luiseskivelgolcher", userId: "17841400000000001", coincideId: undefined }), vigencia: async () => ({ vence: null, origen: "desconocida" }) });
  const r = await ejecutarPruebaInstagram({ configuracion, cuenta: "luiseskivelgolcher", env: soloToken, igDe });
  assert.equal(r.ok, false, "sin el id numérico guardado no se da por verificada");
  assert.match(r.lineas.join("\n"), /user_id.*17841400000000001/);
  assert.match(r.lineas.join("\n"), /IG_USER_ID_LUISESKIVELGOLCHER/);
  assert.equal(r.lineas.join("\n").includes(token), false);
});

test("(diagnóstico) si la API falla, la prueba reporta message, code y error_subcode sin revelar el token", async () => {
  const igDe = () => ({ perfil: async () => { const e = new Error("Error validating access token: Session has expired"); e.codigo = 190; e.subcodigo = 463; e.tipo = "OAuthException"; throw e; } });
  const r = await ejecutarPruebaInstagram({ configuracion, cuenta: "sinlinea", env, igDe });
  assert.equal(r.ok, false);
  const texto = r.lineas.join(" ");
  assert.match(texto, /message "Error validating access token: Session has expired"/);
  assert.match(texto, /code 190/);
  assert.match(texto, /error_subcode 463/);
  assert.match(texto, /type OAuthException/);
  assert.equal(texto.includes(token), false);
  const sinDetalle = () => ({ perfil: async () => { throw new Error("red caída"); } });
  const r2 = await ejecutarPruebaInstagram({ configuracion, cuenta: "sinlinea", env, igDe: sinDetalle });
  assert.match(r2.lineas.join(" "), /message "red caída" · code - · error_subcode -/);
});
