// Fase 2 en el panel: origen de credenciales por cuenta, estado de conexión en modo Environment y metadatos de secretos de entorno.
import { test } from "node:test";
import assert from "node:assert/strict";
import { nombresSecretosDe, describirOrigen, estadoConexion, configDesdeFormulario, formularioDesdeConfig } from "../src/lib/cuenta.mjs";
import { crearAlmacenGitHub } from "../panel/almacen.mjs";
import { validarCuenta } from "../src/lib/config.mjs";

const ahora = new Date("2026-09-10T12:00:00Z");
const entorno = { marca: { usuario: "@luiseskivelgolcher" }, instagram: { origen: "entorno" } };
const repo = { marca: { usuario: "@luiseskivelgolcher" }, instagram: { tokenSecreto: "IG_ACCESSTOKEN_LUISESKIVELGOLCHER", usuarioIdSecreto: "IG_USER_ID_LUISESKIVELGOLCHER" } };

test("(fase 2) nombresSecretosDe y describirOrigen: en modo Environment los nombres son fijos y el entorno es cuenta-<id>; en modo actual, los declarados", () => {
  assert.deepEqual(nombresSecretosDe(entorno, "luiseskivelgolcher"), { tokenSecreto: "IG_ACCESS_TOKEN", usuarioIdSecreto: "IG_USER_ID", origen: "entorno", entorno: "cuenta-luiseskivelgolcher" });
  assert.deepEqual(nombresSecretosDe(repo, "luiseskivelgolcher"), { tokenSecreto: "IG_ACCESSTOKEN_LUISESKIVELGOLCHER", usuarioIdSecreto: "IG_USER_ID_LUISESKIVELGOLCHER", origen: "repositorio" });
  assert.match(describirOrigen(entorno, "luiseskivelgolcher"), /Environment cuenta-luiseskivelgolcher.*IG_ACCESS_TOKEN.*IG_USER_ID/);
  assert.match(describirOrigen(repo, "luiseskivelgolcher"), /modo actual.*IG_ACCESSTOKEN_LUISESKIVELGOLCHER.*IG_USER_ID_LUISESKIVELGOLCHER/);
});

test("(fase 2) estadoConexion en modo Environment: sin entorno o sin sus secretos es pendiente de configuración con instrucciones; con secretos siguen las reglas normales", () => {
  const sinEntorno = estadoConexion({ conexion: null, config: entorno, id: "luiseskivelgolcher", secretosActualizados: { IG_ACCESS_TOKEN: null, IG_USER_ID: null }, ahora });
  assert.equal(sinEntorno.clave, "pendiente-configuracion");
  assert.match(sinEntorno.texto, /cuenta-luiseskivelgolcher/);
  assert.match(sinEntorno.detalle, /IG_ACCESS_TOKEN e IG_USER_ID/);
  const faltaUno = estadoConexion({ conexion: { estado: "verificada", usuario: "luiseskivelgolcher", comprobado: "2026-09-08T20:20:00.000Z" }, config: entorno, id: "luiseskivelgolcher", secretosActualizados: { IG_ACCESS_TOKEN: "2026-09-09T10:00:00Z", IG_USER_ID: null }, ahora });
  assert.equal(faltaUno.clave, "pendiente-configuracion", "tiene prioridad sobre una verificación previa");
  assert.match(faltaUno.texto, /IG_USER_ID/);
  const completo = estadoConexion({ conexion: null, config: entorno, id: "luiseskivelgolcher", secretosActualizados: { IG_ACCESS_TOKEN: "2026-09-09T10:00:00Z", IG_USER_ID: "2026-09-09T10:00:00Z" }, ahora });
  assert.equal(completo.clave, "sin-verificar");
  const desconocido = estadoConexion({ conexion: null, config: entorno, id: "luiseskivelgolcher", secretosActualizados: null, ahora });
  assert.equal(desconocido.clave, "sin-verificar", "sin permiso para leer el entorno no se afirma nada");
  assert.match(desconocido.detalle, /Environments/, "explica qué permiso hace falta para comprobar el entorno");
  const verificada = estadoConexion({ conexion: { estado: "verificada", usuario: "luiseskivelgolcher", comprobado: "2026-09-08T20:20:00.000Z", secretos: { tokenSecreto: "IG_ACCESS_TOKEN", usuarioIdSecreto: "IG_USER_ID", origen: "entorno", entorno: "cuenta-luiseskivelgolcher" } }, config: entorno, id: "luiseskivelgolcher", secretosActualizados: { IG_ACCESS_TOKEN: "2026-09-08T10:00:00Z", IG_USER_ID: "2026-09-08T10:00:00Z" }, ahora });
  assert.equal(verificada.clave, "verificada");
});

test("(fase 2) cambiar el origen de las credenciales invalida la verificación anterior", () => {
  const verificadaEnRepo = { estado: "verificada", usuario: "luiseskivelgolcher", comprobado: "2026-09-08T20:20:00.000Z", secretos: { tokenSecreto: "IG_ACCESSTOKEN_LUISESKIVELGOLCHER", usuarioIdSecreto: "IG_USER_ID_LUISESKIVELGOLCHER", origen: "repositorio" } };
  const ahoraEntorno = estadoConexion({ conexion: verificadaEnRepo, config: entorno, id: "luiseskivelgolcher", secretosActualizados: { IG_ACCESS_TOKEN: "2026-09-08T10:00:00Z", IG_USER_ID: "2026-09-08T10:00:00Z" }, ahora });
  assert.equal(ahoraEntorno.clave, "pendiente");
  assert.match(ahoraEntorno.texto, /origen de las credenciales cambió/i);
  const sigueRepo = estadoConexion({ conexion: verificadaEnRepo, config: repo, id: "luiseskivelgolcher", secretosActualizados: null, ahora });
  assert.equal(sigueRepo.clave, "verificada");
  const antigua = estadoConexion({ conexion: { ...verificadaEnRepo, secretos: { tokenSecreto: "IG_ACCESSTOKEN_LUISESKIVELGOLCHER", usuarioIdSecreto: "IG_USER_ID_LUISESKIVELGOLCHER" } }, config: repo, id: "luiseskivelgolcher", secretosActualizados: null, ahora });
  assert.equal(antigua.clave, "verificada", "una verificación anterior a la fase 2 (sin origen) cuenta como modo actual");
});

test("(fase 2) el formulario lleva el origen: al crear en modo Environment el config declara origen entorno y sigue validando; ida y vuelta", () => {
  const datos = { id: "nuevo-medio", nombre: "Nuevo Medio", usuario: "@nuevomedio", idioma: "es-PA", zonaHoraria: "America/Panama", franjas: ["09:00"], colores: { principal: "#112233", acento: "#445566", oscuro: "#000000", claro: "#FFFFFF" }, origen: "entorno", ilustracionesActivo: false };
  const c = configDesdeFormulario(datos);
  assert.equal(c.instagram.origen, "entorno");
  assert.doesNotThrow(() => validarCuenta(c, "nuevo-medio"));
  assert.equal(formularioDesdeConfig("nuevo-medio", c).origen, "entorno");
  assert.equal(configDesdeFormulario({ ...datos, origen: "repositorio" }).instagram.origen, "repositorio");
  assert.equal(configDesdeFormulario({ ...datos, origen: undefined }, { instagram: { origen: "entorno" } }).instagram.origen, "entorno", "al editar sin tocar el origen se conserva");
  assert.equal(formularioDesdeConfig("x", { instagram: {} }).origen, "repositorio");
});

function fetchGitHub(respuestas) {
  const llamadas = [];
  const impl = async (url, opciones = {}) => {
    llamadas.push({ url: String(url), metodo: opciones.method || "GET" });
    const r = respuestas.shift() || { status: 200, json: {} };
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.json };
  };
  return { impl, llamadas };
}

test("(fase 2) leerSecretosDeEntorno consulta solo metadatos de los secretos del Environment (permiso Environments: lectura) y distingue inexistente de sin permiso", async () => {
  const f = fetchGitHub([
    { status: 200, json: { name: "IG_ACCESS_TOKEN", updated_at: "2026-09-09T10:00:00Z" } },
    { status: 404, json: {} },
  ]);
  const a = crearAlmacenGitHub({ token: "t", owner: "o", repo: "r", fetchImpl: f.impl });
  assert.deepEqual(await a.leerSecretosDeEntorno("cuenta-x", ["IG_ACCESS_TOKEN", "IG_USER_ID"]), { disponible: true, actualizados: { IG_ACCESS_TOKEN: "2026-09-09T10:00:00Z", IG_USER_ID: null } });
  assert.match(f.llamadas[0].url, /environments\/cuenta-x\/secrets\/IG_ACCESS_TOKEN$/);
  const sinPermiso = fetchGitHub([{ status: 403, json: {} }]);
  const b = crearAlmacenGitHub({ token: "t", owner: "o", repo: "r", fetchImpl: sinPermiso.impl });
  assert.deepEqual(await b.leerSecretosDeEntorno("cuenta-x", ["IG_ACCESS_TOKEN"]), { disponible: false, actualizados: null });
  const sinEntorno = fetchGitHub([{ status: 404, json: {} }, { status: 404, json: {} }]);
  const c = crearAlmacenGitHub({ token: "t", owner: "o", repo: "r", fetchImpl: sinEntorno.impl });
  assert.deepEqual(await c.leerSecretosDeEntorno("cuenta-x", ["IG_ACCESS_TOKEN", "IG_USER_ID"]), { disponible: true, actualizados: { IG_ACCESS_TOKEN: null, IG_USER_ID: null } }, "sin entorno, GitHub responde 404 a cada secreto");
});
