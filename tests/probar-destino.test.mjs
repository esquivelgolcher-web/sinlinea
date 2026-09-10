import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ejecutarPruebaDestino } from "../src/probar-destino.mjs";
import { cargarConfiguracion } from "../src/lib/config.mjs";
import { raizConCuentas } from "./ayuda/cuentas.mjs";

const ahora = new Date("2026-09-10T20:00:00Z");
function raizFb({ origen = "entorno", pagina = "123", publicar = false } = {}) {
  const raiz = raizConCuentas({ cuentas: ["sinlinea", "prueba"], prefijo: "pd-" });
  const ruta = path.join(raiz, "cuentas/prueba/config.json");
  const cfg = JSON.parse(fs.readFileSync(ruta, "utf8"));
  fs.writeFileSync(ruta, JSON.stringify({ ...cfg, instagram: { origen }, conexiones: { facebook: { publicar, ...(pagina ? { pagina } : {}) } } }, null, 2));
  return raiz;
}
const leerConexion = (raiz) => JSON.parse(fs.readFileSync(path.join(raiz, "data/prueba/conexion-facebook.json"), "utf8"));
const clienteFalso = ({ id = "123", nombre = "Mi página", fallo = null } = {}) => () => ({ perfil: async () => { if (fallo) throw fallo; return { id, nombre, coincideId: id === "123" }; } });

test("(probar destino) verifica que el token de página pertenece a la página configurada y guarda conexion-facebook.json (sin valores)", async () => {
  const raiz = raizFb();
  const r = await ejecutarPruebaDestino({ configuracion: cargarConfiguracion(raiz), cuenta: "prueba", red: "facebook", env: { FB_PAGE_TOKEN: "EAA" + "x".repeat(30) }, clienteDe: clienteFalso(), raiz, ahora, porCuenta: true });
  assert.equal(r.ok, true, r.lineas.join("\n"));
  assert.ok(r.lineas.some((l) => /OK .*Mi página.*123/.test(l)));
  assert.ok(r.lineas.some((l) => /AVISO .*sigue apagada/.test(l)), "recuerda que la conexión sigue apagada");
  const c = leerConexion(raiz);
  assert.equal(c.estado, "verificada");
  assert.deepEqual(c.identidad, { id: "123", nombre: "Mi página" });
  assert.equal(c.comprobado, ahora.toISOString());
  assert.deepEqual(c.secretos, { nombres: ["FB_PAGE_TOKEN"], origen: "entorno", entorno: "cuenta-prueba" });
  assert.equal(JSON.stringify(c).includes("EAA"), false, "nunca se guardan valores");
});

test("(probar destino) página distinta, secreto ausente, identificador ausente y error de la API dejan el estado que corresponde", async () => {
  const otra = raizFb();
  const r1 = await ejecutarPruebaDestino({ configuracion: cargarConfiguracion(otra), cuenta: "prueba", red: "facebook", env: { FB_PAGE_TOKEN: "EAAx" }, clienteDe: clienteFalso({ id: "999", nombre: "Otra" }), raiz: otra, ahora, porCuenta: true });
  assert.equal(r1.ok, false);
  assert.equal(leerConexion(otra).estado, "error");
  assert.match(leerConexion(otra).detalle, /pertenece a la página "Otra" \(999\); se esperaba la página 123/);
  const sinSecreto = raizFb();
  const r2 = await ejecutarPruebaDestino({ configuracion: cargarConfiguracion(sinSecreto), cuenta: "prueba", red: "facebook", env: {}, clienteDe: clienteFalso(), raiz: sinSecreto, ahora, porCuenta: true });
  assert.equal(r2.ok, false);
  assert.equal(leerConexion(sinSecreto).estado, "credenciales-pendientes");
  assert.match(leerConexion(sinSecreto).detalle, /FB_PAGE_TOKEN.*cuenta-prueba/);
  const sinPagina = raizFb({ pagina: null });
  const r3 = await ejecutarPruebaDestino({ configuracion: cargarConfiguracion(sinPagina), cuenta: "prueba", red: "facebook", env: { FB_PAGE_TOKEN: "EAAx" }, clienteDe: clienteFalso(), raiz: sinPagina, ahora, porCuenta: true });
  assert.equal(r3.ok, false);
  assert.match(leerConexion(sinPagina).detalle, /conexiones\.facebook\.pagina/);
  assert.match(leerConexion(sinPagina).detalle, /"Mi página" con id 123/, "sin id configurado, la API dice qué página es para que el operador la guarde");
  assert.equal(leerConexion(sinPagina).estado, "credenciales-pendientes");
  assert.deepEqual(leerConexion(sinPagina).identidad, { id: "123", nombre: "Mi página" });
  const api = raizFb();
  const err = Object.assign(new Error("Invalid OAuth access token EAAsecreto"), { codigo: 190, tipo: "OAuthException" });
  const r4 = await ejecutarPruebaDestino({ configuracion: cargarConfiguracion(api), cuenta: "prueba", red: "facebook", env: { FB_PAGE_TOKEN: "EAAx" }, clienteDe: clienteFalso({ fallo: err }), raiz: api, ahora, porCuenta: true });
  assert.equal(r4.ok, false);
  assert.equal(leerConexion(api).estado, "error");
  assert.match(leerConexion(api).detalle, /code 190/);
});

test("(probar destino) una cuenta en modo repositorio no puede conectar Facebook; fuera del job por cuenta solo avisa; una red desconocida es error", async () => {
  const repo = raizFb({ origen: "repositorio" });
  const r = await ejecutarPruebaDestino({ configuracion: cargarConfiguracion(repo), cuenta: "prueba", red: "facebook", env: { FB_PAGE_TOKEN: "EAAx" }, clienteDe: clienteFalso(), raiz: repo, ahora, porCuenta: true });
  assert.equal(r.ok, false);
  assert.match(r.lineas.join("\n"), /solo existen en modo Environment/);
  const fuera = raizFb();
  const r2 = await ejecutarPruebaDestino({ configuracion: cargarConfiguracion(fuera), cuenta: "prueba", red: "facebook", env: {}, clienteDe: clienteFalso(), raiz: fuera, ahora, porCuenta: false });
  assert.equal(r2.ok, true);
  assert.ok(r2.lineas.some((l) => /AVISO .*job por cuenta/.test(l)));
  assert.equal(fs.existsSync(path.join(fuera, "data/prueba/conexion-facebook.json")), false);
  const r3 = await ejecutarPruebaDestino({ configuracion: cargarConfiguracion(fuera), cuenta: "prueba", red: "tiktok", env: {}, clienteDe: clienteFalso(), raiz: fuera, ahora, porCuenta: true });
  assert.equal(r3.ok, false);
});

// --- F2 · Threads ---------------------------------------------------------------------------------------------------
function raizTh({ usuario = "555", perfil = "prueba.diario", publicar = false } = {}) {
  const raiz = raizConCuentas({ cuentas: ["sinlinea", "prueba"], prefijo: "pd-th-" });
  const ruta = path.join(raiz, "cuentas/prueba/config.json");
  const cfg = JSON.parse(fs.readFileSync(ruta, "utf8"));
  fs.writeFileSync(ruta, JSON.stringify({ ...cfg, instagram: { origen: "entorno" }, conexiones: { threads: { publicar, ...(usuario ? { usuario } : {}), ...(perfil ? { perfil } : {}) } } }, null, 2));
  return raiz;
}
const leerTh = (raiz) => JSON.parse(fs.readFileSync(path.join(raiz, "data/prueba/conexion-threads.json"), "utf8"));
const thFalso = ({ id = "555", username = "prueba.diario", fallo = null } = {}) => () => ({ perfil: async () => { if (fallo) throw fallo; return { id, username, coincideId: id === "555" }; } });
const envTh = { THREADS_ACCESS_TOKEN: "TH" + "x".repeat(40) };

test("(F2) probar destino threads: la credencial pertenece al perfil configurado (id) y al usuario esperado; guarda conexion-threads.json sin valores", async () => {
  const raiz = raizTh();
  const r = await ejecutarPruebaDestino({ configuracion: cargarConfiguracion(raiz), cuenta: "prueba", red: "threads", env: envTh, clienteDe: thFalso(), raiz, ahora, porCuenta: true });
  assert.equal(r.ok, true, r.lineas.join("\n"));
  assert.ok(r.lineas.some((l) => /OK .*@prueba\.diario.*555/.test(l)), r.lineas.join("\n"));
  assert.ok(r.lineas.some((l) => /AVISO .*sigue apagada/.test(l)));
  const c = leerTh(raiz);
  assert.equal(c.red, "threads");
  assert.equal(c.estado, "verificada");
  assert.deepEqual(c.identidad, { id: "555", nombre: "@prueba.diario" });
  assert.deepEqual(c.secretos, { nombres: ["THREADS_ACCESS_TOKEN"], origen: "entorno", entorno: "cuenta-prueba" });
  assert.equal(JSON.stringify(c).includes("THx"), false, "nunca se guardan valores");
  assert.equal(fs.existsSync(path.join(raiz, "data/prueba/conexion-facebook.json")), false, "no toca la conexión de Facebook");
});

test("(F2) probar destino threads: usuario esperado distinto, id distinto, sin id configurado (muestra el del token) y sin perfil esperado (basta el id)", async () => {
  const otroUsuario = raizTh();
  const r1 = await ejecutarPruebaDestino({ configuracion: cargarConfiguracion(otroUsuario), cuenta: "prueba", red: "threads", env: envTh, clienteDe: thFalso({ username: "otra.persona" }), raiz: otroUsuario, ahora, porCuenta: true });
  assert.equal(r1.ok, false);
  assert.equal(leerTh(otroUsuario).estado, "error");
  assert.match(leerTh(otroUsuario).detalle, /@otra\.persona.*se esperaba @prueba\.diario/);
  const otroId = raizTh();
  const r2 = await ejecutarPruebaDestino({ configuracion: cargarConfiguracion(otroId), cuenta: "prueba", red: "threads", env: envTh, clienteDe: thFalso({ id: "999", username: "prueba.diario" }), raiz: otroId, ahora, porCuenta: true });
  assert.equal(r2.ok, false);
  assert.match(leerTh(otroId).detalle, /perfil @prueba\.diario \(999\); se esperaba el perfil 555/);
  const sinId = raizTh({ usuario: null });
  const r3 = await ejecutarPruebaDestino({ configuracion: cargarConfiguracion(sinId), cuenta: "prueba", red: "threads", env: envTh, clienteDe: thFalso(), raiz: sinId, ahora, porCuenta: true });
  assert.equal(r3.ok, false);
  assert.equal(leerTh(sinId).estado, "credenciales-pendientes");
  assert.match(leerTh(sinId).detalle, /conexiones\.threads\.usuario/);
  assert.match(leerTh(sinId).detalle, /@prueba\.diario con id 555/, "sin id configurado, la API dice qué perfil es para que el operador lo guarde");
  assert.deepEqual(leerTh(sinId).identidad, { id: "555", nombre: "@prueba.diario" });
  const sinPerfil = raizTh({ perfil: null });
  const r4 = await ejecutarPruebaDestino({ configuracion: cargarConfiguracion(sinPerfil), cuenta: "prueba", red: "threads", env: envTh, clienteDe: thFalso({ username: "cualquiera" }), raiz: sinPerfil, ahora, porCuenta: true });
  assert.equal(r4.ok, true, r4.lineas.join("\n"));
  assert.equal(leerTh(sinPerfil).estado, "verificada");
  const sinSecreto = raizTh();
  const r5 = await ejecutarPruebaDestino({ configuracion: cargarConfiguracion(sinSecreto), cuenta: "prueba", red: "threads", env: { FB_PAGE_TOKEN: "EAAx" }, clienteDe: thFalso(), raiz: sinSecreto, ahora, porCuenta: true });
  assert.equal(r5.ok, false);
  assert.equal(leerTh(sinSecreto).estado, "credenciales-pendientes");
  assert.match(leerTh(sinSecreto).detalle, /THREADS_ACCESS_TOKEN.*cuenta-prueba/, "el token de Facebook no sirve para Threads");
});
