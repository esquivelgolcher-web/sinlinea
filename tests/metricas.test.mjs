// Métricas fase 1: la recogida guarda instantáneas por cuenta con fecha de consulta en data/<cuenta>/metricas/,
// respeta el presupuesto de llamadas y la paginación limitada, deja pendientes para otra corrida, no toca posts/ ni
// publica, y ante permisos insuficientes o límites de la API guarda lo obtenido con motivos (nunca ceros).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { recogerMetricas, metricasCuentas } from "../src/metricas.mjs";
import { ErrorLimiteInstagram } from "../src/lib/instagram.mjs";
import { cargarConfiguracion } from "../src/lib/config.mjs";
import { raizConCuentas } from "./ayuda/cuentas.mjs";

const AHORA = new Date("2026-09-10T05:31:02Z");
const leer = (raiz, cuenta, nombre) => JSON.parse(fs.readFileSync(path.join(raiz, "data", cuenta, "metricas", nombre), "utf8"));
const listar = (raiz, cuenta) => (fs.existsSync(path.join(raiz, "data", cuenta, "metricas")) ? fs.readdirSync(path.join(raiz, "data", cuenta, "metricas")).sort() : []);

function medio(id, fecha, extra = {}) {
  return { id, tipo: "IMAGE", fecha, permalink: `https://www.instagram.com/p/${id}/`, caption: `Publicación ${id}`, meGusta: 10, comentarios: 1, compartidoEnFeed: null, ...extra };
}
// Cliente falso de solo lectura y configurable. `insights`: función (metricas) → valores; `fallarMedioEn`: n-ésima llamada a insightsMedio que lanza.
function clienteFalso({ perfil = { seguidores: 81089, seguidos: 378, publicaciones: 27 }, paginas = [{ medios: [], siguiente: null }], insights = null, medioInsights = null, fallarMedioEn = 0, sinPermiso = false } = {}) {
  const llamadas = [];
  let n = 0; let mediosConsultados = 0;
  const prohibido = (nombre) => async () => { throw new Error(`escritura prohibida: ${nombre}`); };
  const sinPermisoDe = (metricas) => ({ valores: Object.fromEntries(metricas.map((m) => [m, null])), faltantes: Object.fromEntries(metricas.map((m) => [m, "sin-permiso-insights"])), error: { codigo: 10, subcodigo: null, mensaje: "(#10) Application does not have permission for this action" } });
  return {
    llamadas,
    crearContenedor: prohibido("crearContenedor"), publicar: prohibido("publicar"), publicarImagen: prohibido("publicarImagen"), refrescarToken: prohibido("refrescarToken"),
    async perfilResumen() { n++; llamadas.push("perfil"); return perfil; },
    async listarMedios({ limite, despues }) {
      n++; llamadas.push(`medios:${despues || "inicio"}`);
      const i = despues ? Number(despues.replace("C", "")) : 0;
      const p = paginas[i] || { medios: [], siguiente: null };
      return { medios: p.medios.slice(0, limite), siguiente: p.siguiente };
    },
    async insightsCuenta({ metricas, desde }) {
      n++; llamadas.push(`cuenta:${desde}`);
      if (sinPermiso) return sinPermisoDe(metricas);
      const valores = Object.fromEntries(metricas.map((m) => [m, insights ? insights(m, desde) : (m === "reach" ? 334 : 0)]));
      const faltantes = Object.fromEntries(Object.entries(valores).filter(([, v]) => v === null).map(([k]) => [k, "conjunto-vacio"]));
      return { valores, faltantes, error: null };
    },
    async insightsMedio(id, { metricas }) {
      n++; mediosConsultados++; llamadas.push(`medio:${id}`);
      if (fallarMedioEn && mediosConsultados === fallarMedioEn) { const e = new Error("(#80002) There have been too many calls to this Instagram account."); e.codigo = 80002; throw new ErrorLimiteInstagram(e); }
      if (sinPermiso) return sinPermisoDe(metricas);
      const valores = Object.fromEntries(metricas.map((m) => [m, medioInsights ? medioInsights(id, m) : (m === "reach" ? 400 : (m === "reposts" ? null : 5))]));
      const faltantes = Object.fromEntries(Object.entries(valores).filter(([, v]) => v === null).map(([k]) => [k, "metrica-no-soportada"]));
      return { valores, faltantes, error: null };
    },
    llamadasHechas: () => n,
  };
}

function raizMetricas({ metricas = { recoger: true }, posts = [] } = {}) {
  const raiz = raizConCuentas({ cuentas: ["sinlinea", "luiseskivelgolcher"], prefijo: "metricas-" });
  const rutaCfg = path.join(raiz, "cuentas/luiseskivelgolcher/config.json");
  const cfg = JSON.parse(fs.readFileSync(rutaCfg, "utf8"));
  cfg.automatico = { generar: false, publicar: false };
  cfg.metricas = metricas;
  cfg.instagram = { ...(cfg.instagram || {}), origen: "entorno" }; // estas pruebas ejercitan el modo Environment
  fs.writeFileSync(rutaCfg, JSON.stringify(cfg, null, 2) + "\n");
  fs.writeFileSync(path.join(raiz, "data/luiseskivelgolcher/seen.json"), "{}\n");
  for (const p of posts) fs.writeFileSync(path.join(raiz, "posts", `${p.id}.json`), JSON.stringify(p, null, 2) + "\n");
  return raiz;
}
const configDe = (raiz) => cargarConfiguracion(raiz).cuentas.find((c) => c.cuenta === "luiseskivelgolcher");
const postSistema = { ...JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8")), id: "2026-09-07-1336-prueba-4fe9", cuenta: "luiseskivelgolcher", estado: "publicado", categoria: "INVESTIGACIÓN", programado: "2026-09-07T14:30:00-05:00", publicacion: { idMedia: "18003", permalink: "https://www.instagram.com/p/18003/", fecha: "2026-09-08T08:07:03.535Z" } };

test("(recogida) con las automatizaciones apagadas y metricas.recoger = true se guardan perfil, métricas por día y publicaciones (origen sistema o instagram) solo en data/<cuenta>/metricas; posts/ y seen.json no cambian", async () => {
  const raiz = raizMetricas({ posts: [postSistema] });
  const config = configDe(raiz);
  const antesPosts = fs.readFileSync(path.join(raiz, "posts", "2026-09-07-1336-prueba-4fe9.json"), "utf8");
  const ig = clienteFalso({ paginas: [{ medios: [medio("18004", "2026-09-09T10:00:00.000Z", { tipo: "VIDEO" }), medio("18003", "2026-09-08T08:07:03.000Z"), medio("18001", "2026-05-01T00:00:00.000Z")], siguiente: null }] });
  const r = await recogerMetricas({ config, ig, raiz, ahora: AHORA, log: { info() {}, warn() {}, error() {} } });
  assert.equal(r.guardado, true);
  assert.equal(r.permiso, "basico+insights");
  assert.equal(r.completo, true, JSON.stringify(r));
  assert.deepEqual(listar(raiz, "luiseskivelgolcher"), ["cuenta-2026-09.json", "estado.json", "publicaciones-2026-09.json"], "el medio de mayo queda fuera de la ventana de 90 días y no crea archivo");
  const cuenta = leer(raiz, "luiseskivelgolcher", "cuenta-2026-09.json");
  assert.deepEqual(Object.keys(cuenta.consultas), ["2026-09-10T05:31:02.000Z"]);
  assert.deepEqual(cuenta.consultas["2026-09-10T05:31:02.000Z"].perfil, { seguidores: 81089, seguidos: 378, publicaciones: 27 });
  assert.deepEqual(Object.keys(cuenta.porDia), ["2026-09-07", "2026-09-08", "2026-09-09"], "los tres últimos días, para absorber el retraso de 48 h");
  assert.equal(cuenta.porDia["2026-09-09"].valores.reach, 334);
  assert.equal(cuenta.porDia["2026-09-09"].consultadoEn, "2026-09-10T05:31:02.000Z");
  const pubs = leer(raiz, "luiseskivelgolcher", "publicaciones-2026-09.json").publicaciones;
  assert.deepEqual(Object.keys(pubs).sort(), ["18003", "18004"]);
  assert.equal(pubs["18003"].origen, "sistema"); assert.equal(pubs["18003"].post, "2026-09-07-1336-prueba-4fe9"); assert.equal(pubs["18003"].categoria, "INVESTIGACIÓN"); assert.equal(pubs["18003"].franja, "14:30");
  assert.equal(pubs["18004"].origen, "instagram"); assert.equal(pubs["18004"].categoria, null);
  const inst = pubs["18004"].consultas["2026-09-10T05:31:02.000Z"];
  assert.equal(inst.acumulados.meGusta, 10); assert.equal(inst.acumulados.comentarios, 1); assert.equal(inst.acumulados.reach, 400);
  assert.equal(inst.acumulados.reposts, undefined, "reposts no se pide a las publicaciones (la API lo rechaza)");
  const estado = leer(raiz, "luiseskivelgolcher", "estado.json");
  assert.deepEqual(estado.pendientes, []);
  assert.deepEqual(Object.keys(estado.ultimaConsulta).sort(), ["18003", "18004"]);
  // Cobertura: cuántas publicaciones devolvió la API, cuántas entran en la ventana y cuántas declara el perfil.
  assert.deepEqual(estado.cobertura, { declaradas: 27, listadas: 3, enVentana: 2, consultadas: 2, listadoCompleto: true });
  assert.deepEqual(r.cobertura, estado.cobertura);
  assert.equal(fs.readFileSync(path.join(raiz, "posts", "2026-09-07-1336-prueba-4fe9.json"), "utf8"), antesPosts, "posts/ intacto");
  assert.equal(fs.readFileSync(path.join(raiz, "data/luiseskivelgolcher/seen.json"), "utf8"), "{}\n");
  assert.ok(ig.llamadas.every((l) => !/publicar|crear|refrescar/.test(l)));
  assert.equal(listar(raiz, "sinlinea").length, 0, "la otra cuenta no se toca");
});

test("(recogida) sin permiso de estadísticas se guardan perfil y me gusta/comentarios; cada estadística queda null con motivo sin-permiso-insights y permiso = basico", async () => {
  const raiz = raizMetricas();
  const ig = clienteFalso({ sinPermiso: true, paginas: [{ medios: [medio("18004", "2026-09-09T10:00:00.000Z")], siguiente: null }] });
  const r = await recogerMetricas({ config: configDe(raiz), ig, raiz, ahora: AHORA, log: { info() {}, warn() {}, error() {} } });
  assert.equal(r.guardado, true); assert.equal(r.permiso, "basico");
  const cuenta = leer(raiz, "luiseskivelgolcher", "cuenta-2026-09.json");
  assert.equal(cuenta.consultas["2026-09-10T05:31:02.000Z"].permiso, "basico");
  assert.equal(cuenta.porDia["2026-09-09"].valores.reach, null);
  assert.equal(cuenta.porDia["2026-09-09"].faltantes.reach, "sin-permiso-insights");
  const p = leer(raiz, "luiseskivelgolcher", "publicaciones-2026-09.json").publicaciones["18004"].consultas["2026-09-10T05:31:02.000Z"];
  assert.equal(p.acumulados.meGusta, 10);
  assert.equal(p.acumulados.reach, null); assert.equal(p.faltantes.reach, "sin-permiso-insights");
  assert.equal(JSON.stringify(p).includes(":0,"), false, "ningún cero inventado");
});

test("(recogida) presupuesto de llamadas y paginación limitada: se consultan las publicaciones que caben, el resto queda pendiente y la siguiente corrida continúa por ahí", async () => {
  const raiz = raizMetricas({ metricas: { recoger: true, maxLlamadas: 9, maxPaginas: 1 } });
  const medios = Array.from({ length: 6 }, (_, i) => medio(`1900${i}`, `2026-09-0${9 - i}T10:00:00.000Z`));
  const paginas = [{ medios, siguiente: "C1" }, { medios: [medio("19099", "2026-09-01T00:00:00.000Z")], siguiente: null }];
  const ig = clienteFalso({ paginas });
  const r = await recogerMetricas({ config: configDe(raiz), ig, raiz, ahora: AHORA, log: { info() {}, warn() {}, error() {} } });
  // 1 perfil + 3 días + 1 página = 5 llamadas fijas; quedan 4 para publicaciones.
  assert.equal(ig.llamadas.filter((l) => l.startsWith("medios:")).length, 1, "una sola página");
  assert.equal(r.listadoCompleto, false);
  assert.equal(r.publicacionesConsultadas, 4);
  assert.equal(r.completo, false); assert.equal(r.motivoIncompleto, "presupuesto-agotado");
  const estado = leer(raiz, "luiseskivelgolcher", "estado.json");
  assert.deepEqual(estado.pendientes, ["19004", "19005"], "las más recientes primero; las dos más antiguas quedan pendientes");
  assert.equal(leer(raiz, "luiseskivelgolcher", "cuenta-2026-09.json").consultas["2026-09-10T05:31:02.000Z"].motivoIncompleto, "presupuesto-agotado");
  const ig2 = clienteFalso({ paginas });
  const manana = new Date("2026-09-11T05:31:02Z");
  const r2 = await recogerMetricas({ config: configDe(raiz), ig: ig2, raiz, ahora: manana, log: { info() {}, warn() {}, error() {} } });
  const consultadas = ig2.llamadas.filter((l) => l.startsWith("medio:")).map((l) => l.slice(6));
  assert.deepEqual(consultadas.slice(0, 2), ["19004", "19005"], "primero las pendientes de la corrida anterior");
  assert.equal(r2.publicacionesConsultadas, 4);
  assert.deepEqual(leer(raiz, "luiseskivelgolcher", "estado.json").pendientes, ["19002", "19003"], "después, las de consulta más antigua");
});

test("(recogida) un límite de la API a mitad de las publicaciones detiene la corrida sin lanzar: se guarda lo obtenido, lo no consultado queda pendiente con motivo limite-llamadas", async () => {
  const raiz = raizMetricas();
  const medios = [medio("19000", "2026-09-09T10:00:00.000Z"), medio("19001", "2026-09-08T10:00:00.000Z"), medio("19002", "2026-09-07T10:00:00.000Z")];
  const ig = clienteFalso({ paginas: [{ medios, siguiente: null }], fallarMedioEn: 2 });
  const registros = [];
  const r = await recogerMetricas({ config: configDe(raiz), ig, raiz, ahora: AHORA, log: { info: (m) => registros.push(m), warn: (m) => registros.push(m), error: (m) => registros.push(m) } });
  assert.equal(r.guardado, true);
  assert.equal(r.completo, false); assert.equal(r.motivoIncompleto, "limite-llamadas");
  assert.equal(r.publicacionesConsultadas, 1);
  const pubs = leer(raiz, "luiseskivelgolcher", "publicaciones-2026-09.json").publicaciones;
  assert.deepEqual(Object.keys(pubs), ["19000"]);
  assert.deepEqual(leer(raiz, "luiseskivelgolcher", "estado.json").pendientes, ["19001", "19002"]);
  assert.ok(registros.some((m) => /límite/i.test(m)));
  assert.equal(leer(raiz, "luiseskivelgolcher", "cuenta-2026-09.json").consultas["2026-09-10T05:31:02.000Z"].completo, false);
});

test("(recogida) repetir la corrida el mismo día no duplica: una instantánea por día de cuenta y de publicación, con los valores de la segunda", async () => {
  const raiz = raizMetricas();
  const paginas = [{ medios: [medio("19000", "2026-09-09T10:00:00.000Z")], siguiente: null }];
  await recogerMetricas({ config: configDe(raiz), ig: clienteFalso({ paginas }), raiz, ahora: AHORA, log: { info() {}, warn() {}, error() {} } });
  const tarde = new Date("2026-09-10T18:00:00Z");
  await recogerMetricas({ config: configDe(raiz), ig: clienteFalso({ paginas: [{ medios: [medio("19000", "2026-09-09T10:00:00.000Z", { meGusta: 11 })], siguiente: null }], perfil: { seguidores: 81090, seguidos: 378, publicaciones: 27 } }), raiz, ahora: tarde, log: { info() {}, warn() {}, error() {} } });
  const cuenta = leer(raiz, "luiseskivelgolcher", "cuenta-2026-09.json");
  assert.deepEqual(Object.keys(cuenta.consultas), ["2026-09-10T18:00:00.000Z"]);
  assert.equal(cuenta.consultas["2026-09-10T18:00:00.000Z"].perfil.seguidores, 81090);
  const p = leer(raiz, "luiseskivelgolcher", "publicaciones-2026-09.json").publicaciones["19000"];
  assert.deepEqual(Object.keys(p.consultas), ["2026-09-10T18:00:00.000Z"]);
  assert.equal(p.consultas["2026-09-10T18:00:00.000Z"].acumulados.meGusta, 11);
});

test("(recogida) metricasCuentas: con metricas.recoger = false no se consulta nada ni se crea la carpeta; en modo Environment sin --por-cuenta se omite", async () => {
  const raiz = raizMetricas({ metricas: { recoger: false } });
  const configuracion = cargarConfiguracion(raiz);
  const r = await metricasCuentas({ configuracion, raiz, soloCuenta: "luiseskivelgolcher", porCuenta: true, env: { IG_ACCESS_TOKEN: "t", IG_USER_ID: "17841401947366983" }, igDe: () => { throw new Error("no debería crear cliente"); }, ahora: AHORA, log: { info() {}, warn() {}, error() {} } });
  assert.equal(r.resultados.luiseskivelgolcher.motivo, "metricas-desactivadas");
  assert.deepEqual(listar(raiz, "luiseskivelgolcher"), []);
  const raiz2 = raizMetricas({ metricas: { recoger: true } });
  const r2 = await metricasCuentas({ configuracion: cargarConfiguracion(raiz2), raiz: raiz2, soloCuenta: "luiseskivelgolcher", porCuenta: false, env: {}, igDe: () => { throw new Error("no debería crear cliente"); }, ahora: AHORA, log: { info() {}, warn() {}, error() {} } });
  assert.equal(r2.resultados.luiseskivelgolcher.motivo, "entorno-requiere-job-por-cuenta");
  const r3 = await metricasCuentas({ configuracion: cargarConfiguracion(raiz2), raiz: raiz2, soloCuenta: "luiseskivelgolcher", porCuenta: true, env: { IG_ACCESS_TOKEN: "t", IG_USER_ID: "17841401947366983" }, igDe: () => clienteFalso(), ahora: AHORA, log: { info() {}, warn() {}, error() {} } });
  assert.equal(r3.resultados.luiseskivelgolcher.guardado, true);
  assert.deepEqual(listar(raiz2, "luiseskivelgolcher"), ["cuenta-2026-09.json", "estado.json"]);
});
