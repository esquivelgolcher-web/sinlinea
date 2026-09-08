// Panel maestro (fase 1): cuentas archivadas en la configuración y en los flujos, y estado de conexión escrito por Probar Instagram.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { cargarConfiguracion, cargarGlobal, cargarCuenta, configDeCuenta, validarCuenta } from "../src/lib/config.mjs";
import { generarCuentas } from "../src/generar.mjs";
import { regenerarCuentas } from "../src/regenerar.mjs";
import { publicarCuentas } from "../src/publicar.mjs";
import { renovarCuentas } from "../src/renovar-token.mjs";
import { ejecutarVerificacion } from "../src/verificar.mjs";
import { ejecutarPruebaInstagram } from "../src/probar-instagram.mjs";
import { escribirPost, leerPosts } from "../src/lib/posts.mjs";
import { aprobar } from "../src/lib/estados.mjs";
import { raizConCuentas } from "./ayuda/cuentas.mjs";

const ahora = new Date("2026-09-08T21:00:00Z");
const log = { info: () => {}, warn: () => {}, error: () => {} };
const base = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));
const token = "IGAAR" + "x".repeat(60);
const env = { ANTHROPIC_API_KEY: "sk-ant-api03-" + "k".repeat(40), GEMINI_API_KEY: "AIza" + "B".repeat(35), IG_ACCESS_TOKEN: token, IG_USER_ID: "1784", GH_PAT: "github_pat_" + "g".repeat(40) };

// Raíz con sinlinea activa y la cuenta de prueba ARCHIVADA (con un post pendiente de dibujar y otro programado).
function raizConArchivada() {
  const raiz = raizConCuentas({ cuentas: ["sinlinea", "prueba"], global: { pages: { baseUrl: "https://prueba.github.io/sinlinea" } }, prefijo: "maestro-" });
  const ruta = path.join(raiz, "cuentas", "prueba", "config.json");
  const c = JSON.parse(fs.readFileSync(ruta, "utf8"));
  fs.writeFileSync(ruta, JSON.stringify({ ...c, archivada: true, archivadaEn: "2026-09-08T20:00:00.000Z", automatico: { generar: false, publicar: false } }, null, 2));
  for (const id of ["sinlinea", "prueba"]) {
    fs.writeFileSync(path.join(raiz, "data", id, "seen.json"), '{ "urls": {} }\n');
    fs.writeFileSync(path.join(raiz, "data", id, "token-info.json"), JSON.stringify({ vence: "2026-11-07" }));
  }
  fs.mkdirSync(path.join(raiz, "templates"), { recursive: true });
  fs.copyFileSync("templates/post.html", path.join(raiz, "templates/post.html"));
  fs.mkdirSync(path.join(raiz, "assets/fonts"), { recursive: true });
  for (const f of ["Anton-Regular.ttf", "Inter-Variable.ttf"]) fs.writeFileSync(path.join(raiz, "assets/fonts", f), "");
  const sinDibujar = { ...base, id: base.id.slice(0, -4) + "a101", cuenta: "prueba", imagen: null, ilustracion: null };
  const programado = aprobar({ ...base, id: base.id.slice(0, -4) + "a102", cuenta: "prueba", ilustracion: null }, "2026-09-08T10:00:00-05:00", "2026-09-08T12:00:00.000Z");
  for (const p of [sinDibujar, programado]) escribirPost(path.join(raiz, "posts"), p);
  return { raiz, sinDibujar, programado };
}

test("(maestro) archivada y editorial son opcionales y validados; archivar exige las automatizaciones apagadas", () => {
  const g = cargarGlobal("config.json");
  const c = cargarCuenta(".", "sinlinea");
  assert.equal(configDeCuenta(g, c, "sinlinea").archivada, false);
  const arch = configDeCuenta(g, { ...c, archivada: true, archivadaEn: "2026-09-08T21:00:00.000Z", automatico: { generar: false, publicar: false } }, "sinlinea");
  assert.equal(arch.archivada, true);
  assert.equal(arch.archivadaEn, "2026-09-08T21:00:00.000Z");
  assert.throws(() => validarCuenta({ ...c, archivada: "sí" }, "sinlinea"), /archivada/);
  assert.throws(() => validarCuenta({ ...c, archivada: true, automatico: { generar: true, publicar: false } }, "sinlinea"), /archivada/);
  assert.throws(() => validarCuenta({ ...c, editorial: { temas: "x" } }, "sinlinea"), /editorial/);
  assert.throws(() => validarCuenta({ ...c, editorial: { temas: ["a"], tono: 5 } }, "sinlinea"), /editorial/);
  assert.doesNotThrow(() => validarCuenta({ ...c, editorial: { temas: ["a"], tono: "b" } }, "sinlinea"));
  assert.deepEqual(configDeCuenta(g, { ...c, editorial: { temas: ["a"], tono: "b" } }, "sinlinea").editorial, { temas: ["a"], tono: "b" });
});

test("(maestro) una cuenta archivada carga (para el panel y los posts) pero GENERAR, REGENERAR, PUBLICAR y RENOVAR la omiten", async () => {
  const { raiz, sinDibujar, programado } = raizConArchivada();
  const configuracion = cargarConfiguracion(raiz);
  assert.deepEqual(configuracion.errores, []);
  assert.equal(configuracion.cuentas.find((c) => c.cuenta === "prueba").archivada, true);

  let claude = 0;
  const client = { messages: { parse: async () => { claude++; return { stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 }, parsed_output: { descartados: [], seleccion: [] } }; } } };
  const g = await generarCuentas({ configuracion, raiz, ahora, fetchText: async () => "", client, render: async () => ({}), log });
  assert.equal(g.resultados.prueba.motivo, "archivada");
  assert.deepEqual(g.resultados.prueba.creados, []);

  const dibujados = [];
  const r = await regenerarCuentas({ configuracion, raiz, ahora, log, version: 1, render: async (p) => { dibujados.push(p.id); return { ruta: `public/img/${p.id}.jpg`, url: "https://u/x.jpg", hash: "0".repeat(16), version: 1, estilo: "x", renderizada: ahora.toISOString() }; } });
  assert.equal(r.resultados.prueba.motivo, "archivada");
  assert.deepEqual(r.resultados.prueba.renderizados, []);
  assert.equal(dibujados.includes(sinDibujar.id), false, "no dibuja posts de la cuenta archivada");

  const p = await publicarCuentas({ configuracion, raiz, ahora, log, igDe: () => { throw new Error("no debería crear un cliente para una cuenta archivada"); } });
  assert.equal(p.resultados.prueba.motivo, "archivada");
  assert.deepEqual(p.resultados.prueba.publicados, []);
  assert.equal(leerPosts(path.join(raiz, "posts")).find((x) => x.id === programado.id).estado, "programado", "la cola se conserva");

  const clientes = [];
  const n = await renovarCuentas({ configuracion, raiz, ahora, env, log, igDe: (config) => { clientes.push(config.cuenta); return { refrescarToken: async () => ({ token: "IGAAR" + "n".repeat(60), expiraEnSegundos: 5184000 }) }; } });
  assert.equal(n.resultados.prueba.motivo, "archivada");
  assert.deepEqual(clientes, ["sinlinea"]);
});

test("(maestro) la verificación informa la cuenta archivada como aviso, sin exigirle secretos ni logo", () => {
  const { raiz } = raizConArchivada();
  const r = ejecutarVerificacion({ raiz, env, ahora });
  const texto = r.lineas.join(" ");
  assert.equal(r.ok, true, texto);
  assert.match(texto, /AVISO.*prueba.*archivada/i);
  assert.doesNotMatch(texto, /ERROR.*prueba/);
});

test("(maestro) Probar Instagram deja el estado de conexión en data/<cuenta>/conexion.json: verificada, error o credenciales pendientes, sin credenciales", async () => {
  const raiz = raizConCuentas({ cuentas: ["sinlinea", "luiseskivelgolcher"], prefijo: "conexion-" });
  const configuracion = cargarConfiguracion(raiz);
  const leer = (id) => JSON.parse(fs.readFileSync(path.join(raiz, "data", id, "conexion.json"), "utf8"));
  const envPersonal = { IG_ACCESSTOKEN_LUISESKIVELGOLCHER: token + "L", IG_USER_ID_LUISESKIVELGOLCHER: "9999" };

  const ok = () => ({ perfil: async () => ({ username: "luiseskivelgolcher", userId: "9999", coincideId: true }), vigencia: async () => ({ vence: null, origen: "desconocida" }) });
  await ejecutarPruebaInstagram({ configuracion, cuenta: "luiseskivelgolcher", env: envPersonal, igDe: ok, raiz, ahora });
  assert.deepEqual(leer("luiseskivelgolcher"), { estado: "verificada", usuario: "luiseskivelgolcher", comprobado: "2026-09-08T21:00:00.000Z", detalle: null });

  const falla = () => ({ perfil: async () => { const e = new Error("Invalid OAuth access token - Cannot parse access token"); e.codigo = 190; e.subcodigo = null; e.tipo = "OAuthException"; throw e; } });
  await ejecutarPruebaInstagram({ configuracion, cuenta: "luiseskivelgolcher", env: envPersonal, igDe: falla, raiz, ahora });
  const err = leer("luiseskivelgolcher");
  assert.equal(err.estado, "error");
  assert.match(err.detalle, /code 190/);
  assert.equal(JSON.stringify(err).includes(token), false);

  const otro = () => ({ perfil: async () => ({ username: "otra.persona", userId: "1", coincideId: true }) });
  await ejecutarPruebaInstagram({ configuracion, cuenta: "luiseskivelgolcher", env: envPersonal, igDe: otro, raiz, ahora });
  assert.equal(leer("luiseskivelgolcher").estado, "error");
  assert.match(leer("luiseskivelgolcher").detalle, /otra\.persona/);

  await ejecutarPruebaInstagram({ configuracion, cuenta: "luiseskivelgolcher", env: {}, igDe: ok, raiz, ahora });
  assert.equal(leer("luiseskivelgolcher").estado, "credenciales-pendientes");
  assert.match(leer("luiseskivelgolcher").detalle, /IG_ACCESSTOKEN_LUISESKIVELGOLCHER/);

  const soloToken = { IG_ACCESSTOKEN_LUISESKIVELGOLCHER: token + "L" };
  await ejecutarPruebaInstagram({ configuracion, cuenta: "luiseskivelgolcher", env: soloToken, igDe: () => ({ perfil: async () => ({ username: "luiseskivelgolcher", userId: "17841400000000001", coincideId: undefined }) }), raiz, ahora });
  assert.equal(leer("luiseskivelgolcher").estado, "credenciales-pendientes");
  assert.match(leer("luiseskivelgolcher").detalle, /17841400000000001/);
  assert.equal(fs.existsSync(path.join(raiz, "data", "sinlinea", "conexion.json")), false, "no toca otras cuentas");
});
