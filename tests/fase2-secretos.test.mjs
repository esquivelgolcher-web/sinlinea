// Fase 2: origen de credenciales por cuenta (repositorio | entorno), nombres fijos por job y ejecución por cuenta.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { cargarConfiguracion, cargarGlobal, cargarCuenta, configDeCuenta, validarCuenta } from "../src/lib/config.mjs";
import { origenDeSecretos, nombreEntorno, nombresDeSecretos, leerSecretos, describirCredenciales, ORIGENES } from "../src/lib/secretos.mjs";
import { cuentasActivas, listaParaMatriz } from "../src/cuentas-activas.mjs";
import { publicarCuentas } from "../src/publicar.mjs";
import { renovarCuentas } from "../src/renovar-token.mjs";
import { ejecutarPruebaInstagram } from "../src/probar-instagram.mjs";
import { ejecutarVerificacion } from "../src/verificar.mjs";
import { escribirPost, leerPosts } from "../src/lib/posts.mjs";
import { hashImagen, aprobar } from "../src/lib/estados.mjs";
import { raizConCuentas } from "./ayuda/cuentas.mjs";

const token = "IGAAR" + "x".repeat(60);
const ahora = new Date("2026-09-09T12:00:00Z");
const log = { info: () => {}, warn: () => {}, error: () => {} };
const base = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));
const conImagen = (p) => ({ ...p, imagen: { ruta: `public/img/${p.id}.jpg`, url: `https://prueba.github.io/sinlinea/img/${p.id}.jpg`, hash: hashImagen(p, 1), version: 1, renderizada: "2026-09-08T20:00:00.000Z" } });

// Raíz con sinlinea (modo actual, nombres históricos), prueba (modo Environment) y ambas con un post programado y vencido.
function raizMixta() {
  const raiz = raizConCuentas({ cuentas: ["sinlinea", "prueba"], global: { pages: { baseUrl: "https://prueba.github.io/sinlinea" } }, prefijo: "fase2-" });
  const ruta = path.join(raiz, "cuentas/prueba/config.json");
  const c = JSON.parse(fs.readFileSync(ruta, "utf8"));
  fs.writeFileSync(ruta, JSON.stringify({ ...c, instagram: { origen: "entorno" } }, null, 2));
  for (const id of ["sinlinea", "prueba"]) fs.writeFileSync(path.join(raiz, "data", id, "token-info.json"), JSON.stringify({ vence: "2026-11-07" }));
  const pSl = conImagen(aprobar({ ...base, id: base.id.slice(0, -4) + "f201", cuenta: "sinlinea", ilustracion: null }, "2026-09-09T06:00:00-05:00", "2026-09-09T10:00:00.000Z"));
  const pPr = conImagen(aprobar({ ...base, id: base.id.slice(0, -4) + "f202", cuenta: "prueba", ilustracion: null }, "2026-09-09T06:00:00-05:00", "2026-09-09T10:00:00.000Z"));
  for (const p of [pSl, pPr]) escribirPost(path.join(raiz, "posts"), p);
  return { raiz, pSl, pPr };
}

function igFalso(perfil, userId = "1784") {
  const llamadas = [];
  return {
    llamadas,
    perfil: async () => ({ username: perfil, userId, coincideId: true }),
    cuota: async () => ({ usados: 0, limite: 100 }),
    imagenPublica: async () => true,
    publicarImagen: async ({ imageUrl }) => { llamadas.push(imageUrl); return { idMedia: "m1", permalink: "https://www.instagram.com/p/x/" }; },
    vigencia: async () => ({ vence: null, origen: "desconocida" }),
    refrescarToken: async () => ({ token: "IGAAR" + "n".repeat(60), expiraEnSegundos: 5184000 }),
  };
}

test("(fase 2) instagram.origen es opcional (repositorio por defecto), admite entorno y rechaza otros valores; el entorno se llama cuenta-<id>", () => {
  assert.deepEqual(ORIGENES, ["repositorio", "entorno"]);
  const g = cargarGlobal("config.json");
  const c = cargarCuenta(".", "sinlinea");
  assert.equal(configDeCuenta(g, c, "sinlinea").instagram.origen, "repositorio");
  assert.equal(origenDeSecretos(configDeCuenta(g, c, "sinlinea")), "repositorio");
  const e = configDeCuenta(g, { ...c, instagram: { origen: "entorno" } }, "sinlinea");
  assert.equal(e.instagram.origen, "entorno");
  assert.equal(origenDeSecretos(e), "entorno");
  assert.equal(nombreEntorno("sinlinea"), "cuenta-sinlinea");
  assert.equal(nombreEntorno("nuevo-medio"), "cuenta-nuevo-medio");
  assert.throws(() => validarCuenta({ ...c, instagram: { origen: "nube" } }, "sinlinea"), /origen/);
});

test("(fase 2) nombresDeSecretos: modo entorno usa siempre IG_ACCESS_TOKEN e IG_USER_ID; modo repositorio usa los declarados salvo en ejecución por cuenta, donde el job ya los mapeó a los nombres fijos", () => {
  const repo = { cuenta: "luiseskivelgolcher", instagram: { origen: "repositorio", tokenSecreto: "IG_ACCESSTOKEN_LUISESKIVELGOLCHER", usuarioIdSecreto: "IG_USER_ID_LUISESKIVELGOLCHER" } };
  assert.deepEqual(nombresDeSecretos(repo), { token: "IG_ACCESSTOKEN_LUISESKIVELGOLCHER", usuarioId: "IG_USER_ID_LUISESKIVELGOLCHER" });
  assert.deepEqual(nombresDeSecretos(repo, { porCuenta: true }), { token: "IG_ACCESS_TOKEN", usuarioId: "IG_USER_ID" });
  const entorno = { cuenta: "luiseskivelgolcher", instagram: { origen: "entorno" } };
  assert.deepEqual(nombresDeSecretos(entorno), { token: "IG_ACCESS_TOKEN", usuarioId: "IG_USER_ID" });
  assert.deepEqual(nombresDeSecretos(entorno, { porCuenta: true }), { token: "IG_ACCESS_TOKEN", usuarioId: "IG_USER_ID" });
  assert.match(describirCredenciales(repo), /modo actual.*IG_ACCESSTOKEN_LUISESKIVELGOLCHER.*IG_USER_ID_LUISESKIVELGOLCHER/);
  assert.match(describirCredenciales(entorno), /Environment cuenta-luiseskivelgolcher/);
  // Sin fallback entre orígenes: en modo entorno, si faltan los secretos, el error lo dice y nombra el entorno.
  assert.throws(() => leerSecretos(entorno, { IG_ACCESSTOKEN_LUISESKIVELGOLCHER: token, IG_USER_ID_LUISESKIVELGOLCHER: "9" }, { porCuenta: true }), (err) => /cuenta-luiseskivelgolcher/.test(err.message) && /IG_ACCESS_TOKEN/.test(err.message) && !err.message.includes(token));
  assert.deepEqual(leerSecretos(entorno, { IG_ACCESS_TOKEN: token, IG_USER_ID: "9" }, { porCuenta: true }), { token, usuarioId: "9" });
  assert.deepEqual(leerSecretos(repo, { IG_ACCESS_TOKEN: token, IG_USER_ID: "9" }, { porCuenta: true }), { token, usuarioId: "9" });
  assert.throws(() => leerSecretos(repo, { IG_ACCESS_TOKEN: token, IG_USER_ID: "9" }), /IG_ACCESSTOKEN_LUISESKIVELGOLCHER/, "sin ejecución por cuenta, el modo actual sigue leyendo los nombres declarados");
});

test("(fase 2) cuentas-activas separa las cuentas por origen, excluye archivadas, filtra por --cuenta y sirve para la matriz de los workflows", () => {
  const { raiz } = raizMixta();
  const configuracion = cargarConfiguracion(raiz);
  const activas = cuentasActivas(configuracion);
  assert.deepEqual(activas.entorno, [{ cuenta: "prueba", entorno: "cuenta-prueba", nombres: ["IG_ACCESS_TOKEN", "IG_USER_ID"] }]);
  assert.deepEqual(activas.repositorio, [{ cuenta: "sinlinea", tokenSecreto: "IG_ACCESS_TOKEN", usuarioIdSecreto: "IG_USER_ID" }]);
  assert.deepEqual(cuentasActivas(configuracion, { soloCuenta: "prueba" }).repositorio, []);
  assert.deepEqual(cuentasActivas(configuracion, { soloCuenta: "prueba" }).entorno, [{ cuenta: "prueba", entorno: "cuenta-prueba", nombres: ["IG_ACCESS_TOKEN", "IG_USER_ID"] }]);
  assert.deepEqual(cuentasActivas(configuracion, { soloCuenta: "nadie" }), { entorno: [], repositorio: [] });
  // Archivada: fuera de ambas listas
  const ruta = path.join(raiz, "cuentas/prueba/config.json");
  const c = JSON.parse(fs.readFileSync(ruta, "utf8"));
  fs.writeFileSync(ruta, JSON.stringify({ ...c, archivada: true, automatico: { generar: false, publicar: false } }, null, 2));
  assert.deepEqual(cuentasActivas(cargarConfiguracion(raiz)).entorno, []);
  assert.equal(listaParaMatriz([]), "[]");
  assert.equal(listaParaMatriz([{ cuenta: "a", entorno: "cuenta-a" }]), '[{"cuenta":"a","entorno":"cuenta-a"}]');
  // Como comando (lo usan los workflows): imprime `nombre=json` por línea para $GITHUB_OUTPUT
  const salida = execFileSync(process.execPath, [path.resolve("src/cuentas-activas.mjs"), "--raiz", raiz], { encoding: "utf8" });
  assert.match(salida, /^entorno=\[\]$/m);
  assert.match(salida, /^repositorio=\[\{"cuenta":"sinlinea","tokenSecreto":"IG_ACCESS_TOKEN","usuarioIdSecreto":"IG_USER_ID"\}\]$/m);
});

test("(fase 2) PUBLICAR por cuenta (--cuenta) procesa solo esa cuenta con los nombres fijos y anota el modo; en modo entorno sin secretos falla claro y no publica", async () => {
  const { raiz, pSl, pPr } = raizMixta();
  const configuracion = cargarConfiguracion(raiz);
  const registro = [];
  const logR = { info: (m) => registro.push(m), warn: (m) => registro.push(m), error: (m) => registro.push(m) };
  // Job de la cuenta de prueba (modo Environment): los secretos del entorno llegan como IG_ACCESS_TOKEN / IG_USER_ID.
  const igPrueba = igFalso("prueba.diario");
  const r = await publicarCuentas({ configuracion, raiz, ahora, log: logR, soloCuenta: "prueba", porCuenta: true, env: { IG_ACCESS_TOKEN: token, IG_USER_ID: "1784" }, igDe: () => igPrueba });
  assert.deepEqual(Object.keys(r.resultados), ["prueba"], "solo la cuenta del job");
  assert.deepEqual(r.resultados.prueba.publicados, [pPr.id]);
  assert.equal(r.resultados.prueba.credenciales, "Environment cuenta-prueba (IG_ACCESS_TOKEN, IG_USER_ID)");
  assert.ok(registro.some((m) => /prueba.*Environment cuenta-prueba/.test(m)), "el registro dice qué modo usa la cuenta");
  assert.equal(leerPosts(path.join(raiz, "posts")).find((p) => p.id === pSl.id).estado, "programado", "la otra cuenta no se toca");
  // Modo Environment sin secretos: error claro con el nombre del entorno; ningún cliente, ninguna publicación, cola intacta.
  const r2 = await publicarCuentas({ configuracion, raiz, ahora, log, soloCuenta: "sinlinea", porCuenta: true, env: {}, igDe: () => { throw new Error("no debe crear cliente"); } });
  assert.match(r2.resultados.sinlinea.error, /IG_ACCESS_TOKEN/);
  const ruta = path.join(raiz, "cuentas/sinlinea/config.json");
  fs.writeFileSync(ruta, JSON.stringify({ ...JSON.parse(fs.readFileSync(ruta, "utf8")), instagram: { origen: "entorno" } }, null, 2));
  const r3 = await publicarCuentas({ configuracion: cargarConfiguracion(raiz), raiz, ahora, log, soloCuenta: "sinlinea", porCuenta: true, env: { IG_ACCESSTOKEN_LUISESKIVELGOLCHER: token }, igDe: () => { throw new Error("no debe crear cliente"); } });
  assert.match(r3.resultados.sinlinea.error, /cuenta-sinlinea/);
  assert.match(r3.resultados.sinlinea.error, /IG_ACCESS_TOKEN/);
  assert.equal(r3.resultados.sinlinea.error.includes(token), false);
  assert.equal(leerPosts(path.join(raiz, "posts")).find((p) => p.id === pSl.id).estado, "programado", "la cola se conserva");
});

test("(fase 2) sin --cuenta (ejecución conjunta) las cuentas en modo entorno se omiten con motivo claro y las de modo actual siguen igual", async () => {
  const { raiz, pSl } = raizMixta();
  const configuracion = cargarConfiguracion(raiz);
  const igSl = igFalso("sinlinea.pa");
  const r = await publicarCuentas({ configuracion, raiz, ahora, log, env: { IG_ACCESS_TOKEN: token, IG_USER_ID: "1784" }, igDe: () => igSl });
  assert.deepEqual(r.resultados.sinlinea.publicados, [pSl.id]);
  assert.equal(r.resultados.prueba.motivo, "entorno-requiere-job-por-cuenta");
  assert.deepEqual(r.resultados.prueba.publicados, []);
  const n = await renovarCuentas({ configuracion, raiz, ahora, env: { IG_ACCESS_TOKEN: token, IG_USER_ID: "1784" }, log, igDe: () => igSl });
  assert.equal(n.resultados.prueba.motivo, "entorno-requiere-job-por-cuenta");
  assert.equal(n.resultados.sinlinea.vence, "2026-11-08");
});

test("(fase 2) RENOVAR y Probar Instagram por cuenta usan los nombres fijos y dejan el archivo del token con el nombre fijo; la verificación de usuario e id se mantiene", async () => {
  const { raiz } = raizMixta();
  const configuracion = cargarConfiguracion(raiz);
  const n = await renovarCuentas({ configuracion, raiz, ahora, env: { IG_ACCESS_TOKEN: token, IG_USER_ID: "1784" }, log, soloCuenta: "prueba", porCuenta: true, igDe: () => igFalso("prueba.diario") });
  assert.deepEqual(Object.keys(n.resultados), ["prueba"]);
  assert.equal(fs.existsSync(path.join(raiz, "temp", "nuevo-token-IG_ACCESS_TOKEN.txt")), true, "el workflow lo guarda en el entorno cuenta-prueba");
  const p = await ejecutarPruebaInstagram({ configuracion, cuenta: "prueba", porCuenta: true, env: { IG_ACCESS_TOKEN: token, IG_USER_ID: "1784" }, igDe: () => igFalso("prueba.diario"), raiz, ahora });
  assert.equal(p.ok, true, p.lineas.join(" "));
  assert.match(p.lineas.join(" "), /Environment cuenta-prueba/);
  const conexion = JSON.parse(fs.readFileSync(path.join(raiz, "data/prueba/conexion.json"), "utf8"));
  assert.equal(conexion.estado, "verificada");
  assert.deepEqual(conexion.secretos, { tokenSecreto: "IG_ACCESS_TOKEN", usuarioIdSecreto: "IG_USER_ID", origen: "entorno", entorno: "cuenta-prueba" });
  const mal = await ejecutarPruebaInstagram({ configuracion, cuenta: "prueba", porCuenta: true, env: { IG_ACCESS_TOKEN: token, IG_USER_ID: "1784" }, igDe: () => ({ perfil: async () => ({ username: "prueba.diario", userId: "999", coincideId: false }) }), raiz, ahora });
  assert.equal(mal.ok, false);
  assert.match(mal.lineas.join(" "), /id numérico no coincide/);
  const faltan = await ejecutarPruebaInstagram({ configuracion, cuenta: "prueba", porCuenta: true, env: {}, igDe: () => igFalso("prueba.diario"), raiz, ahora });
  assert.equal(faltan.ok, false);
  assert.match(faltan.lineas.join(" "), /cuenta-prueba/);
  assert.match(faltan.lineas.join(" "), /IG_ACCESS_TOKEN/);
});

test("(fase 2) verificar por cuenta informa el modo y comprueba solo los secretos de esa cuenta con los nombres fijos", () => {
  const { raiz } = raizMixta();
  fs.mkdirSync(path.join(raiz, "templates"), { recursive: true });
  fs.copyFileSync("templates/post.html", path.join(raiz, "templates/post.html"));
  fs.mkdirSync(path.join(raiz, "assets/fonts"), { recursive: true });
  for (const f of ["Anton-Regular.ttf", "Inter-Variable.ttf"]) fs.writeFileSync(path.join(raiz, "assets/fonts", f), "");
  const compartidos = { ANTHROPIC_API_KEY: "sk-ant-api03-" + "k".repeat(40), GEMINI_API_KEY: "AIza" + "B".repeat(35) };
  const r = ejecutarVerificacion({ raiz, env: { ...compartidos, IG_ACCESS_TOKEN: token, IG_USER_ID: "1784" }, ahora, soloCuenta: "prueba", porCuenta: true });
  const texto = r.lineas.join(" ");
  assert.equal(r.ok, true, texto);
  assert.match(texto, /prueba.*Environment cuenta-prueba/);
  assert.doesNotMatch(texto, /Cuenta sinlinea/, "solo la cuenta del job");
  const sin = ejecutarVerificacion({ raiz, env: compartidos, ahora, soloCuenta: "prueba", porCuenta: true });
  assert.match(sin.lineas.join(" "), /IG_ACCESS_TOKEN.*falta|IG_ACCESS_TOKEN: FALTA|falta.*IG_ACCESS_TOKEN/i);
  const conjunto = ejecutarVerificacion({ raiz, env: { ...compartidos, IG_ACCESS_TOKEN: token, IG_USER_ID: "1784" }, ahora });
  assert.match(conjunto.lineas.join(" "), /prueba.*Environment cuenta-prueba.*job por cuenta/i, "en ejecución conjunta no puede comprobar secretos de entorno y lo dice");
});
