// Métricas fase 1: la sonda (--sin-guardar) consulta en solo lectura qué devuelve la API para una cuenta y lo informa
// por nombres, sin escribir nada y sin valores de secretos. Sirve para decidir qué se recoge antes de encender la recogida.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { sondearMetricas, lineasDeSonda, metricasCuentas } from "../src/metricas.mjs";
import { GRUPOS, textoMotivo } from "../src/lib/metricas.mjs";
import { cargarConfiguracion } from "../src/lib/config.mjs";
import { raizConCuentas } from "./ayuda/cuentas.mjs";

// Cliente falso de solo lectura: cualquier método de escritura hace fallar la prueba.
function clienteFalso({ perfil, medios, cuenta, medio } = {}) {
  const llamadas = [];
  let n = 0;
  const prohibido = (nombre) => async () => { throw new Error(`la sonda invocó ${nombre}: escritura prohibida`); };
  const faltantesDe = (metricas, motivo) => Object.fromEntries(metricas.map((m) => [m, motivo]));
  const nulos = (metricas) => Object.fromEntries(metricas.map((m) => [m, null]));
  return {
    llamadas,
    crearContenedor: prohibido("crearContenedor"), publicar: prohibido("publicar"), publicarImagen: prohibido("publicarImagen"), refrescarToken: prohibido("refrescarToken"),
    async perfilResumen() { n++; llamadas.push("perfilResumen"); return perfil ?? { seguidores: 42, seguidos: 10, publicaciones: 3 }; },
    async listarMedios({ limite, despues }) { n++; llamadas.push(`listarMedios:${limite}:${despues || ""}`); return medios ?? { medios: [], siguiente: null }; },
    async insightsCuenta({ metricas }) {
      n++; llamadas.push(`insightsCuenta:${metricas.join(",")}`);
      if (typeof cuenta === "function") return cuenta(metricas);
      return { valores: nulos(metricas), faltantes: faltantesDe(metricas, "sin-permiso-insights"), error: { codigo: 10, subcodigo: null, mensaje: "(#10) Application does not have permission for this action" } };
    },
    async insightsMedio(id, { metricas }) {
      n++; llamadas.push(`insightsMedio:${id}:${metricas.join(",")}`);
      if (typeof medio === "function") return medio(id, metricas);
      return { valores: nulos(metricas), faltantes: faltantesDe(metricas, "sin-permiso-insights"), error: { codigo: 10, subcodigo: null, mensaje: "(#10) Application does not have permission for this action" } };
    },
    llamadasHechas: () => n,
  };
}
const medioImagen = { id: "18001", tipo: "IMAGE", fecha: "2026-09-08T08:07:03.000Z", permalink: "https://www.instagram.com/p/AAA/", caption: "Registro Público", meGusta: 12, comentarios: 1, compartidoEnFeed: null };
const medioVideo = { id: "18002", tipo: "VIDEO", fecha: "2026-09-07T12:00:00.000Z", permalink: "https://www.instagram.com/reel/BBB/", caption: "", meGusta: null, comentarios: 0, compartidoEnFeed: true };

test("(sonda) sin permiso de estadísticas: el perfil y la lista de medios sí llegan; cada métrica de cuenta y de medio queda 'no disponible: requiere permiso', sin bloquear el resto", async () => {
  const ig = clienteFalso({ medios: { medios: [medioImagen, medioVideo], siguiente: "C2" } });
  const informe = await sondearMetricas({ cuenta: "luiseskivelgolcher", ig, dia: "2026-09-09" });
  assert.deepEqual(informe.perfil, { seguidores: 42, seguidos: 10, publicaciones: 3 });
  assert.equal(informe.medios.total, 2);
  assert.equal(informe.medios.haySiguiente, true);
  assert.deepEqual(informe.medios.muestra.map((m) => m.id), ["18001", "18002"]);
  assert.equal(informe.permiso, "basico");
  for (const m of [...GRUPOS.cuentaDocumentadas, ...GRUPOS.cuentaSeguidores, ...GRUPOS.cuentaPorConfirmar]) {
    assert.deepEqual(informe.cuenta[m], { valor: null, motivo: "sin-permiso-insights" }, m);
  }
  assert.equal(informe.medio.id, "18001");
  for (const m of GRUPOS.medioFeed) assert.deepEqual(informe.medio.metricas[m], { valor: null, motivo: "sin-permiso-insights" }, m);
  assert.ok(informe.llamadas >= 3);
  assert.ok(ig.llamadas.every((l) => !/crear|publicar|refrescar/.test(l)));
  const lineas = lineasDeSonda(informe);
  const texto = lineas.join("\n");
  assert.match(texto, /seguidores: 42/);
  assert.match(texto, /publicaciones en la primera página: 2/);
  assert.ok(texto.includes(`reach: ${textoMotivo("sin-permiso-insights")}`), "la línea de reach lleva el motivo completo");
  assert.match(texto, /cuenta luiseskivelgolcher ·/);
  assert.match(texto, /permiso vigente: básico/);
  assert.doesNotMatch(texto, /TOKEN|access_token/);
});

test("(sonda) con permiso: las métricas documentadas se piden juntas, las de ≥100 seguidores y las 'por confirmar' por separado; un 0 real se muestra como 0 y un conjunto vacío como no disponible", async () => {
  const ig = clienteFalso({
    medios: { medios: [medioImagen], siguiente: null },
    cuenta: (metricas) => {
      const valores = {}; const faltantes = {};
      for (const m of metricas) {
        if (m === "reach") valores[m] = 950;
        else if (m === "saves") valores[m] = 0;
        else if (m === "follows_and_unfollows") { valores[m] = null; faltantes[m] = "metrica-no-soportada"; }
        else if (GRUPOS.cuentaPorConfirmar.includes(m)) { valores[m] = null; faltantes[m] = "metrica-no-soportada"; }
        else { valores[m] = null; faltantes[m] = "conjunto-vacio"; }
      }
      return { valores, faltantes, error: null };
    },
    medio: (id, metricas) => ({ valores: Object.fromEntries(metricas.map((m) => [m, m === "reach" ? 400 : null])), faltantes: Object.fromEntries(metricas.filter((m) => m !== "reach").map((m) => [m, "conjunto-vacio"])), error: null }),
  });
  const informe = await sondearMetricas({ cuenta: "luiseskivelgolcher", ig, dia: "2026-09-09" });
  assert.equal(informe.permiso, "basico+insights");
  assert.deepEqual(informe.cuenta.reach, { valor: 950, motivo: null });
  assert.deepEqual(informe.cuenta.saves, { valor: 0, motivo: null });
  assert.deepEqual(informe.cuenta.follows_and_unfollows, { valor: null, motivo: "metrica-no-soportada" });
  assert.deepEqual(informe.cuenta.follower_count, { valor: null, motivo: "metrica-no-soportada" });
  assert.deepEqual(informe.medio.metricas.reach, { valor: 400, motivo: null });
  const pedidas = ig.llamadas.filter((l) => l.startsWith("insightsCuenta:"));
  assert.equal(pedidas[0], `insightsCuenta:${GRUPOS.cuentaDocumentadas.join(",")}`, "las documentadas van juntas en una llamada");
  assert.ok(pedidas.includes(`insightsCuenta:${GRUPOS.cuentaSeguidores.join(",")}`));
  for (const m of GRUPOS.cuentaPorConfirmar) assert.ok(pedidas.includes(`insightsCuenta:${m}`), `${m} se pide sola`);
  const texto = lineasDeSonda(informe).join("\n");
  assert.match(texto, /reach: 950/);
  assert.match(texto, /saves: 0\b/);
  assert.match(texto, /likes: No disponible \(la API devolvió un conjunto vacío\)/);
});

test("(sonda) metricasCuentas --sin-guardar corre aunque metricas.recoger sea false y las automatizaciones estén apagadas, no escribe en data/ ni posts/ y omite en modo Environment sin --por-cuenta", async () => {
  const raiz = raizConCuentas({ cuentas: ["sinlinea", "luiseskivelgolcher"], prefijo: "sonda-" });
  const rutaCfg = path.join(raiz, "cuentas/luiseskivelgolcher/config.json");
  const cfg = JSON.parse(fs.readFileSync(rutaCfg, "utf8"));
  cfg.instagram = { ...(cfg.instagram || {}), origen: "entorno" }; // esta prueba ejercita el modo Environment
  fs.writeFileSync(rutaCfg, JSON.stringify(cfg, null, 2) + "\n");
  assert.equal(cfg.automatico.generar, false); assert.equal(cfg.automatico.publicar, false);
  assert.notEqual(cfg.metricas?.recoger, true);
  const configuracion = cargarConfiguracion(raiz);
  const antesData = JSON.stringify(fs.readdirSync(path.join(raiz, "data/luiseskivelgolcher")));
  const antesPosts = JSON.stringify(fs.readdirSync(path.join(raiz, "posts")));
  const registros = [];
  const log = { info: (m) => registros.push(m), warn: (m) => registros.push(m), error: (m) => registros.push(m) };
  const r = await metricasCuentas({ configuracion, raiz, soloCuenta: "luiseskivelgolcher", porCuenta: true, sinGuardar: true, igDe: () => clienteFalso({ medios: { medios: [medioImagen], siguiente: null } }), env: { IG_ACCESS_TOKEN: "t", IG_USER_ID: "17841401947366983" }, log });
  assert.equal(r.resultados.luiseskivelgolcher.informe.permiso, "basico");
  assert.equal(JSON.stringify(fs.readdirSync(path.join(raiz, "data/luiseskivelgolcher"))), antesData, "la sonda no escribe en data/");
  assert.equal(JSON.stringify(fs.readdirSync(path.join(raiz, "posts"))), antesPosts, "la sonda no toca posts/");
  assert.ok(registros.some((m) => /credenciales · Environment cuenta-luiseskivelgolcher/.test(m)));
  const r2 = await metricasCuentas({ configuracion, raiz, soloCuenta: "luiseskivelgolcher", porCuenta: false, sinGuardar: true, igDe: () => { throw new Error("no debería crear cliente"); }, env: {}, log });
  assert.equal(r2.resultados.luiseskivelgolcher.motivo, "entorno-requiere-job-por-cuenta");
});
