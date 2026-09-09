// Límites de generación por cuenta para operar una cuenta con aprobación previa:
// - generar.maxBorradoresPendientes: con ese número de borradores sin revisar no se llama a Claude;
// - generación única forzada (--cuenta <id> --forzar): un borrador de prueba aunque automatico.generar esté apagado,
//   sin tocar la configuración ni las demás cuentas.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { ejecutarGenerar, generarCuentas } from "../src/generar.mjs";
import { cargarConfiguracion, cargarConfig, validarCuenta, cargarCuenta } from "../src/lib/config.mjs";
import { leerPosts, escribirPost } from "../src/lib/posts.mjs";
import { raizConCuentas } from "./ayuda/cuentas.mjs";

const xml = fs.readFileSync("tests/fixtures/laprensa.xml", "utf8");
const articulo = fs.readFileSync("tests/fixtures/laestrella-articulo.html", "utf8");
const ahora = new Date("2026-09-07T19:20:31Z");
const fetchText = async (url) => (url.includes("prensa.com/arc") ? xml : articulo);
const log = { info: () => {}, warn: () => {}, error: () => {} };
const renderOkFalso = async (post) => ({ ruta: `public/img/${post.id}.jpg`, url: `https://x/img/${post.id}.jpg`, hash: "0".repeat(16), version: 1, renderizada: ahora.toISOString() });
function clientContador() {
  const c = { llamadas: 0, messages: { parse: async () => { c.llamadas++; return { stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 }, parsed_output: { descartados: [], seleccion: [
    { indiceCandidato: 0, categoria: "SOCIEDAD", titular: "Titular de prueba", bajada: "Bajada", caption: "Caption", hashtags: ["#Panamá"], relevancia: 1, motivo: "m", escena: "" },
  ] } }; } } };
  return c;
}
function raizTemporal(cuentas = ["sinlinea"]) {
  const raiz = raizConCuentas({ cuentas, global: { pages: { baseUrl: "https://prueba.github.io/sinlinea" } }, prefijo: "generar-limites-" });
  for (const c of cuentas) fs.writeFileSync(path.join(raiz, "data", c, "seen.json"), '{ "urls": {} }\n');
  return raiz;
}
const base = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));

test("(límites) generar.maxBorradoresPendientes es opcional y debe ser un entero positivo", () => {
  const c = cargarCuenta(".", "sinlinea");
  assert.doesNotThrow(() => validarCuenta({ ...c, generar: { ...c.generar, maxBorradoresPendientes: 3 } }, "sinlinea"));
  assert.doesNotThrow(() => validarCuenta({ ...c, generar: { ...c.generar } }, "sinlinea"), "sin la clave sigue valiendo");
  assert.throws(() => validarCuenta({ ...c, generar: { ...c.generar, maxBorradoresPendientes: 0 } }, "sinlinea"), /maxBorradoresPendientes/);
  assert.throws(() => validarCuenta({ ...c, generar: { ...c.generar, maxBorradoresPendientes: "3" } }, "sinlinea"), /maxBorradoresPendientes/);
});

test("(límites) con maxBorradoresPendientes alcanzado no se llama a Claude (motivo pendientes); los descartados y programados no cuentan", async () => {
  const raiz = raizTemporal();
  const config = cargarConfig(path.join(raiz, "config.json"));
  config.generar.maxBorradoresPendientes = 2;
  const dir = path.join(raiz, "posts");
  // URLs propias para no filtrar los candidatos del feed de prueba (GENERAR descarta las URLs que ya tienen post).
  const post = (n, estado) => ({ ...base, id: `${base.id.slice(0, -4)}${String(n).padStart(4, "0")}`, cuenta: "sinlinea", estado, fuente: { ...base.fuente, url: `https://www.prensa.com/antigua/nota-${n}/` }, creado: "2026-09-01T10:00:00Z", actualizado: "2026-09-01T10:00:00Z", imagen: null, programado: estado === "programado" ? "2026-09-08T12:00:00-05:00" : null });
  escribirPost(dir, post(1, "borrador"));
  escribirPost(dir, post(2, "descartado"));
  escribirPost(dir, post(3, "programado"));
  const client = clientContador();
  const r = await ejecutarGenerar({ config, raiz, ahora, fetchText, client, render: renderOkFalso, log });
  assert.equal(r.motivo, "ok", "con un solo borrador pendiente todavía cabe otro");
  assert.equal(client.llamadas, 1);
  const r2 = await ejecutarGenerar({ config, raiz, ahora: new Date(ahora.getTime() + 3600000), fetchText, client, render: renderOkFalso, log });
  assert.equal(r2.motivo, "pendientes");
  assert.equal(client.llamadas, 1, "no se llama a Claude con dos borradores sin revisar");
  assert.equal(leerPosts(dir).filter((p) => p.estado === "borrador").length, 2);
});

test("(límites) generarCuentas con soloCuenta y forzar genera una vez para esa cuenta aunque automatico.generar esté apagado; sin forzar se omite y las demás cuentas no se tocan", async () => {
  const raiz = raizTemporal(["sinlinea", "prueba"]);
  const rutaPrueba = path.join(raiz, "cuentas/prueba/config.json");
  const cfgPrueba = JSON.parse(fs.readFileSync(rutaPrueba, "utf8"));
  fs.writeFileSync(rutaPrueba, JSON.stringify({ ...cfgPrueba, automatico: { generar: false, publicar: false } }, null, 2) + "\n");
  const configuracion = cargarConfiguracion(raiz);
  const client = clientContador();
  const sinForzar = await generarCuentas({ configuracion, raiz, ahora, fetchText, client, render: renderOkFalso, log, soloCuenta: "prueba" });
  assert.equal(sinForzar.resultados.prueba.motivo, "generar-desactivado");
  assert.equal(sinForzar.resultados.sinlinea, undefined, "solo se procesa la cuenta pedida");
  assert.equal(client.llamadas, 0);
  const forzado = await generarCuentas({ configuracion, raiz, ahora, fetchText, client, render: renderOkFalso, log, soloCuenta: "prueba", forzar: true });
  assert.equal(forzado.resultados.prueba.motivo, "ok");
  assert.equal(forzado.resultados.prueba.creados.length, 1);
  assert.equal(forzado.resultados.prueba.creados[0].cuenta, "prueba");
  assert.equal(client.llamadas, 1);
  assert.equal(JSON.parse(fs.readFileSync(rutaPrueba, "utf8")).automatico.generar, false, "la configuración no cambia");
  assert.equal(leerPosts(path.join(raiz, "posts")).filter((p) => p.cuenta === "sinlinea").length, 0);
  await assert.rejects(() => generarCuentas({ configuracion, raiz, ahora, fetchText, client, render: renderOkFalso, log, forzar: true }), /--cuenta/, "forzar exige una cuenta concreta");
});

test("(límites) generar.yml acepta cuenta y forzar como entradas manuales, pasadas por env (no interpoladas en run)", () => {
  const texto = fs.readFileSync(".github/workflows/generar.yml", "utf8");
  const w = parse(texto);
  assert.ok(w.on.workflow_dispatch.inputs.cuenta, "entrada cuenta");
  assert.equal(w.on.workflow_dispatch.inputs.forzar.default, "false");
  const paso = w.jobs.generar.steps.find((s) => /generar\.mjs/.test(s.run || ""));
  assert.equal(paso.env.CUENTA, "${{ inputs.cuenta }}");
  assert.equal(paso.env.FORZAR, "${{ inputs.forzar }}");
  assert.match(paso.run, /--cuenta "\$CUENTA"/);
  assert.match(paso.run, /--forzar/);
  assert.equal(/run:.*\$\{\{\s*inputs\./.test(texto), false);
});
