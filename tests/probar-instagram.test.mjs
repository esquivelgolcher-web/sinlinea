import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarPruebaInstagram } from "../src/probar-instagram.mjs";
import { cargarConfiguracion } from "../src/lib/config.mjs";

const configuracion = cargarConfiguracion(".");
const token = "IGAAR" + "x".repeat(60);
const env = { IG_ACCESS_TOKEN: token, IG_USER_ID: "1784", IG_ACCESS_TOKEN_LUISESKIVELGOLCHER: token + "L", IG_USER_ID_LUISESKIVELGOLCHER: "9999" };

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
  assert.match(sin.lineas.join("\n"), /IG_ACCESS_TOKEN_LUISESKIVELGOLCHER/);
  const desconocida = await ejecutarPruebaInstagram({ configuracion, cuenta: "nadie", env, igDe });
  assert.equal(desconocida.ok, false);
  assert.match(desconocida.lineas.join("\n"), /nadie/);
  const todas = await ejecutarPruebaInstagram({ configuracion, env: { IG_ACCESS_TOKEN: token, IG_USER_ID: "1784" }, igDe });
  assert.equal(todas.ok, true, "sinlinea coincide y luiseskivelgolcher se omite por falta de secretos sin fallar");
  assert.match(todas.lineas.join("\n"), /luiseskivelgolcher.*(sin secretos|faltan)/i);
});
