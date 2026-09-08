import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { cargarConfig, validarConfig, cargarGlobal, cargarCuenta, configDeCuenta, cargarConfiguracion, validarCuenta, resumenParaPanel } from "../src/lib/config.mjs";
import { raizConCuentas } from "./ayuda/cuentas.mjs";

test("config.json del repo es válido", () => {
  const cfg = cargarConfig("config.json");
  assert.equal(cfg.zonaHoraria, "America/Panama");
  assert.equal(cfg.fuentes.length, 2);
});

function base() {
  return structuredClone(cargarConfig("config.json"));
}

test("rechaza una franja mal formada", () => {
  const cfg = base();
  cfg.franjas.push("25:00");
  assert.throws(() => validarConfig(cfg), /franjas/);
});

test("rechaza un tipo de fuente desconocido y una portada sin patrón", () => {
  const cfg = base();
  cfg.fuentes[0].tipo = "twitter";
  assert.throws(() => validarConfig(cfg), /fuentes\[0\]\.tipo/);
  const cfg2 = base();
  delete cfg2.fuentes[1].patronArticulo;
  assert.throws(() => validarConfig(cfg2), /patronArticulo/);
});

test("rechaza un esfuerzo inválido y una apiVersion mal formada", () => {
  const cfg = base();
  cfg.claude.esfuerzo = "ultra";
  assert.throws(() => validarConfig(cfg), /esfuerzo/);
  const cfg2 = base();
  cfg2.instagram.apiVersion = "23";
  assert.throws(() => validarConfig(cfg2), /apiVersion/);
});

test("valida el bloque ilustraciones", () => {
  const cfg = base();
  assert.equal(cfg.ilustraciones.proveedor, "gemini");
  cfg.ilustraciones.tamano = "8K";
  assert.throws(() => validarConfig(cfg), /ilustraciones\.tamano/);
  const cfg2 = base();
  cfg2.ilustraciones.activo = "si";
  assert.throws(() => validarConfig(cfg2), /ilustraciones\.activo/);
});

test("(M5) ilustraciones.maxPorCorrida es obligatorio y debe ser un entero positivo", () => {
  const cfg = base();
  assert.equal(cfg.ilustraciones.maxPorCorrida, 4);
  const sinMax = base();
  delete sinMax.ilustraciones.maxPorCorrida;
  assert.throws(() => validarConfig(sinMax), /ilustraciones\.maxPorCorrida/);
  const cero = base();
  cero.ilustraciones.maxPorCorrida = 0;
  assert.throws(() => validarConfig(cero), /ilustraciones\.maxPorCorrida/);
  const noEntero = base();
  noEntero.ilustraciones.maxPorCorrida = "4";
  assert.throws(() => validarConfig(noEntero), /ilustraciones\.maxPorCorrida/);
});

test("(M0) instagram.tokenSecreto y usuarioIdSecreto son opcionales y deben ser nombres de secreto válidos", () => {
  const cfg = base();
  assert.equal(cfg.instagram.tokenSecreto, "IG_ACCESS_TOKEN");
  assert.equal(cfg.instagram.usuarioIdSecreto, "IG_USER_ID");
  delete cfg.instagram.tokenSecreto; delete cfg.instagram.usuarioIdSecreto;
  assert.doesNotThrow(() => validarConfig(cfg));
  cfg.instagram.tokenSecreto = "ig token";
  assert.throws(() => validarConfig(cfg), /tokenSecreto/);
  cfg.instagram.tokenSecreto = "IG_ACCESS_TOKEN_OTRO";
  cfg.instagram.usuarioIdSecreto = "id-otro";
  assert.throws(() => validarConfig(cfg), /usuarioIdSecreto/);
});

test("(M1) config.json global es válido, declara cuentas y ya no lleva marca ni fuentes", () => {
  const g = cargarGlobal("config.json");
  assert.deepEqual(g.cuentas, ["sinlinea", "luiseskivelgolcher"]);
  assert.equal(g.cuentas[0], "sinlinea", "la principal sigue siendo sinlinea");
  assert.equal(g.marca, undefined);
  assert.equal(g.fuentes, undefined);
  assert.equal(g.instagram.apiVersion, "v23.0");
  assert.equal(typeof g.ilustraciones.maxPorCorrida, "number");
});

test("(M1) cargarCuenta lee cuentas/<id>/config.json con idioma es-PA por defecto y sus nombres de secretos", () => {
  const c = cargarCuenta(".", "sinlinea");
  assert.equal(c.nombre, "Sin Línea");
  assert.equal(c.idioma, "es-PA");
  assert.equal(c.marca.usuario, "@sinlinea.pa");
  assert.equal(c.instagram.tokenSecreto, "IG_ACCESS_TOKEN");
  assert.equal(c.instagram.usuarioIdSecreto, "IG_USER_ID");
  assert.throws(() => cargarCuenta(".", "no-existe"), /cuentas\/no-existe\/config\.json/);
});

test("(M1) configDeCuenta produce la configuración efectiva con la forma de siempre más cuenta, nombre, idioma y rutas", () => {
  const g = cargarGlobal("config.json");
  const e = configDeCuenta(g, cargarCuenta(".", "sinlinea"), "sinlinea");
  assert.equal(e.cuenta, "sinlinea");
  assert.equal(e.nombre, "Sin Línea");
  assert.equal(e.idioma, "es-PA");
  assert.equal(e.zonaHoraria, "America/Panama");
  assert.equal(e.pages.baseUrl, g.pages.baseUrl);
  assert.equal(e.claude.modelo, g.claude.modelo);
  assert.equal(e.instagram.apiVersion, "v23.0");
  assert.equal(e.instagram.tokenSecreto, "IG_ACCESS_TOKEN");
  assert.equal(e.ilustraciones.proveedor, "gemini");
  assert.equal(e.ilustraciones.maxPorCorrida, g.ilustraciones.maxPorCorrida);
  assert.match(e.ilustraciones.estilo, /prensa/i);
  assert.equal(e.ilustraciones.rotulo, "", "(rótulo) vacío = sin rótulo en la imagen");
  assert.equal(e.fuentes.length, 2);
  assert.equal(e.franjas.length, 6);
  assert.equal(e.generar.maxPorCorrida, 2);
  assert.deepEqual(e.rutas, { carpeta: "cuentas/sinlinea", editorial: "cuentas/sinlinea/editorial.md", logo: "cuentas/sinlinea/logo.png", datos: "data/sinlinea" });
  assert.equal(e.cuentas, undefined, "la efectiva no lleva la lista de cuentas");
  assert.doesNotThrow(() => validarConfig(e));
});

test("(M1) cargarConfig sigue devolviendo la configuración efectiva de la primera cuenta (compatibilidad)", () => {
  const cfg = cargarConfig("config.json");
  assert.equal(cfg.cuenta, "sinlinea");
  assert.equal(cfg.marca.usuario, "@sinlinea.pa");
  assert.equal(cfg.fuentes.length, 2);
});

test("(M1) cargarConfiguracion carga todas las cuentas y reporta las inválidas sin bloquear a las demás", () => {
  const raiz = raizConCuentas({ cuentas: ["sinlinea", "prueba"] });
  const c = cargarConfiguracion(raiz);
  assert.deepEqual(c.cuentas.map((x) => x.cuenta), ["sinlinea", "prueba"]);
  assert.equal(c.cuentas[1].marca.usuario, "@prueba.diario");
  assert.equal(c.cuentas[1].instagram.tokenSecreto, "IG_ACCESS_TOKEN_PRUEBA");
  assert.equal(c.cuentas[1].rutas.datos, "data/prueba");
  assert.deepEqual(c.errores, []);
  const g = JSON.parse(fs.readFileSync(path.join(raiz, "config.json"), "utf8"));
  g.cuentas = ["sinlinea", "rota", "prueba"];
  fs.writeFileSync(path.join(raiz, "config.json"), JSON.stringify(g));
  fs.mkdirSync(path.join(raiz, "cuentas/rota"), { recursive: true });
  fs.writeFileSync(path.join(raiz, "cuentas/rota/config.json"), JSON.stringify({ nombre: "Rota" }));
  const c2 = cargarConfiguracion(raiz);
  assert.deepEqual(c2.cuentas.map((x) => x.cuenta), ["sinlinea", "prueba"]);
  assert.equal(c2.errores.length, 1);
  assert.equal(c2.errores[0].cuenta, "rota");
  assert.match(c2.errores[0].mensaje, /marca/);
});

test("(M1) validarCuenta rechaza ids e idiomas inválidos y exige un id en cuentas/ del global", () => {
  const c = cargarCuenta(".", "sinlinea");
  assert.throws(() => validarCuenta({ ...c, idioma: "español" }, "sinlinea"), /idioma/);
  assert.throws(() => validarCuenta(c, "Sin Linea"), /id de cuenta/);
  assert.throws(() => validarCuenta(c, "otra_cuenta"), /id de cuenta/);
  assert.doesNotThrow(() => validarCuenta({ ...c, idioma: "en" }, "otro-medio"));
  const g = cargarGlobal("config.json");
  assert.throws(() => configDeCuenta({ ...g, cuentas: [] }, c, "sinlinea"), /cuentas/);
});

test("(M1 fix) una cuenta no puede pisar claves globales: validarCuenta las rechaza y configDeCuenta solo toma las suyas", () => {
  const g = cargarGlobal("config.json");
  const c = cargarCuenta(".", "sinlinea");
  for (const k of ["pages", "claude", "archivarDespuesDeDias", "cuentas"]) {
    assert.throws(() => validarCuenta({ ...c, [k]: {} }, "sinlinea"), new RegExp(k), `rechaza ${k}`);
  }
  const e = configDeCuenta(g, { ...c, ilustraciones: { ...c.ilustraciones, activo: false } }, "sinlinea");
  assert.equal(e.ilustraciones.activo, false, "activo sí puede fijarse por cuenta");
  assert.equal(e.pages.baseUrl, g.pages.baseUrl);
  assert.equal(e.archivarDespuesDeDias, g.archivarDespuesDeDias);
});

test("(M1 fix) resumenParaPanel expone cuentaPrincipal = primera cuenta declarada aunque no sea la primera válida", () => {
  const raiz = raizConCuentas({ cuentas: ["sinlinea", "prueba"] });
  const g = JSON.parse(fs.readFileSync(path.join(raiz, "config.json"), "utf8"));
  fs.writeFileSync(path.join(raiz, "cuentas/sinlinea/config.json"), "{ \"nombre\": \"rota\" }");
  const c = cargarConfiguracion(raiz);
  assert.deepEqual(c.cuentas.map((x) => x.cuenta), ["prueba"]);
  const r = resumenParaPanel(c.cuentas);
  assert.equal(r.cuentaPrincipal, "sinlinea");
  assert.equal(g.cuentas[0], "sinlinea");
});

test("(M2) la cuenta luiseskivelgolcher carga con automatización apagada, colores propios, sin fuentes y con sus secretos", () => {
  const c = cargarConfiguracion(".");
  assert.deepEqual(c.global.cuentas, ["sinlinea", "luiseskivelgolcher"]);
  assert.deepEqual(c.errores, []);
  const e = c.cuentas.find((x) => x.cuenta === "luiseskivelgolcher");
  assert.deepEqual(e.automatico, { generar: false, publicar: false });
  assert.equal(e.marca.usuario, "@luiseskivelgolcher");
  assert.deepEqual(e.fuentes, []);
  assert.equal(e.ilustraciones.activo, true, "ilustraciones activas con estilo provisional para las vistas previas");
  assert.equal(e.instagram.tokenSecreto, "IG_ACCESSTOKEN_LUISESKIVELGOLCHER");
  assert.equal(e.instagram.usuarioIdSecreto, "IG_USER_ID_LUISESKIVELGOLCHER");
  assert.notDeepEqual(e.marca.colores, c.cuentas[0].marca.colores, "no hereda los colores de Sin Línea");
  assert.match(e.marca.colores.acento, /^#[0-9A-Fa-f]{6}$/);
});

test("(M2) automatico es opcional (true por defecto) y colores es opcional con la paleta de Sin Línea por defecto", () => {
  const g = cargarGlobal("config.json");
  const c = cargarCuenta(".", "sinlinea");
  const { automatico: _omitido, ...sinAutomatico } = c;
  const cfg = configDeCuenta(g, sinAutomatico, "sinlinea");
  assert.deepEqual(cfg.automatico, { generar: true, publicar: true });
  assert.deepEqual(cfg.marca.colores, { principal: "#FFD400", acento: "#E30613", oscuro: "#111111", claro: "#FFFFFF" });
  assert.throws(() => validarCuenta({ ...c, automatico: { generar: "no" } }, "sinlinea"), /automatico\.generar/);
  assert.throws(() => validarCuenta({ ...c, marca: { ...c.marca, colores: { principal: "amarillo" } } }, "sinlinea"), /colores/);
  assert.throws(() => validarCuenta({ ...c, marca: { ...c.marca, colores: { principal: "#FFD400" } } }, "sinlinea"), /colores/);
});

test("(M2) fuentes puede estar vacía solo si la generación automática está apagada", () => {
  const c = cargarCuenta(".", "sinlinea");
  assert.throws(() => validarCuenta({ ...c, fuentes: [] }, "sinlinea"), /fuentes/);
  assert.doesNotThrow(() => validarCuenta({ ...c, fuentes: [], automatico: { generar: false, publicar: true } }, "sinlinea"));
});

test("(M2) resumenParaPanel incluye automatico y colores de cada cuenta", () => {
  const c = cargarConfiguracion(".");
  const r = resumenParaPanel(c.cuentas);
  assert.deepEqual(r.cuentas[1].automatico, { generar: false, publicar: false });
  assert.equal(r.cuentas[1].marca.colores.acento, "#1F5FBF");
});

test("(rótulo) ilustraciones.rotulo puede ser una cadena vacía (sin rótulo) pero debe ser texto; estilo sigue siendo obligatorio", () => {
  const c = cargarCuenta(".", "sinlinea");
  assert.doesNotThrow(() => validarCuenta({ ...c, ilustraciones: { ...c.ilustraciones, rotulo: "" } }, "sinlinea"));
  assert.throws(() => validarCuenta({ ...c, ilustraciones: { ...c.ilustraciones, rotulo: 5 } }, "sinlinea"), /rotulo/);
  assert.throws(() => validarCuenta({ ...c, ilustraciones: { ...c.ilustraciones, estilo: "" } }, "sinlinea"), /estilo/);
});

test("(logo) marca.logoForma es opcional (circulo por defecto), admite cuadrado y rechaza otros valores", () => {
  const g = cargarGlobal("config.json");
  const c = cargarCuenta(".", "sinlinea");
  assert.equal(configDeCuenta(g, c, "sinlinea").marca.logoForma, "circulo");
  assert.equal(configDeCuenta(g, { ...c, marca: { ...c.marca, logoForma: "cuadrado" } }, "sinlinea").marca.logoForma, "cuadrado");
  assert.throws(() => validarCuenta({ ...c, marca: { ...c.marca, logoForma: "triangulo" } }, "sinlinea"), /logoForma/);
  assert.throws(() => validarCuenta({ ...c, marca: { ...c.marca, logoForma: 1 } }, "sinlinea"), /logoForma/);
  const personal = cargarConfiguracion(".").cuentas.find((x) => x.cuenta === "luiseskivelgolcher");
  assert.equal(personal.marca.logoForma, "cuadrado", "el logo LEG de la cuenta personal es cuadrado");
});
