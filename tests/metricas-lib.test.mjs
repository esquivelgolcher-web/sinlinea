// Métricas fase 1: funciones puras (isomorfas) de almacenamiento y lectura. Instantáneas con fecha de consulta,
// totales acumulados separados de las métricas por período, ausente = null (nunca 0), idempotencia por día y
// selección de pendientes con presupuesto para continuar en otra corrida.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  archivoDeMes, registrarConsultaCuenta, registrarPorDia, registrarConsultaMedio, seriesDeCuenta, rendimientoDePublicaciones,
  seleccionarPendientes, enlazarConPosts, textoValor, textoMotivo, variacionEntreConsultas,
} from "../src/lib/metricas.mjs";

test("(lib) archivoDeMes nombra los archivos por tipo y mes de la fecha dada", () => {
  assert.equal(archivoDeMes("cuenta", "2026-09-10T05:31:02Z"), "cuenta-2026-09.json");
  assert.equal(archivoDeMes("publicaciones", "2026-08-31T23:59:59Z"), "publicaciones-2026-08.json");
});

test("(lib) registrarConsultaCuenta guarda la instantánea del perfil con su fecha de consulta; dos consultas el mismo día dejan una sola (la última)", () => {
  let a = registrarConsultaCuenta(null, { cuenta: "x", consultadoEn: "2026-09-10T05:31:02Z", perfil: { seguidores: 42, seguidos: 10, publicaciones: null }, permiso: "basico", llamadas: 3, completo: true });
  assert.equal(a.version, 1);
  assert.equal(a.cuenta, "x");
  assert.deepEqual(Object.keys(a.consultas), ["2026-09-10T05:31:02Z"]);
  assert.deepEqual(a.consultas["2026-09-10T05:31:02Z"], { perfil: { seguidores: 42, seguidos: 10, publicaciones: null }, permiso: "basico", llamadas: 3, completo: true, motivoIncompleto: null });
  a = registrarConsultaCuenta(a, { cuenta: "x", consultadoEn: "2026-09-10T18:00:00Z", perfil: { seguidores: 43, seguidos: 10, publicaciones: 3 }, permiso: "basico", llamadas: 3, completo: false, motivoIncompleto: "limite-llamadas" });
  assert.deepEqual(Object.keys(a.consultas), ["2026-09-10T18:00:00Z"], "misma fecha de consulta: se sustituye, no se duplica");
  assert.equal(a.consultas["2026-09-10T18:00:00Z"].motivoIncompleto, "limite-llamadas");
  a = registrarConsultaCuenta(a, { cuenta: "x", consultadoEn: "2026-09-11T05:30:00Z", perfil: { seguidores: 44, seguidos: 10, publicaciones: 3 }, permiso: "basico", llamadas: 3, completo: true });
  assert.equal(Object.keys(a.consultas).length, 2);
});

test("(lib) registrarPorDia guarda las métricas por período bajo el día al que se refieren, con la fecha en que se consultaron, y sobrescribe (retraso de 48 h)", () => {
  let a = registrarPorDia(null, { cuenta: "x", dia: "2026-09-09", consultadoEn: "2026-09-10T05:31:02Z", valores: { reach: 950, views: null }, faltantes: { views: "conjunto-vacio" } });
  assert.deepEqual(a.porDia["2026-09-09"], { valores: { reach: 950, views: null }, faltantes: { views: "conjunto-vacio" }, consultadoEn: "2026-09-10T05:31:02Z" });
  a = registrarPorDia(a, { cuenta: "x", dia: "2026-09-09", consultadoEn: "2026-09-11T05:31:02Z", valores: { reach: 1020, views: 1800 }, faltantes: {} });
  assert.deepEqual(a.porDia["2026-09-09"].valores, { reach: 1020, views: 1800 });
  assert.equal(a.porDia["2026-09-09"].consultadoEn, "2026-09-11T05:31:02Z");
});

test("(lib) registrarConsultaMedio guarda los totales acumulados de cada publicación con fecha de consulta, una por día, y su origen sin inventar categoría", () => {
  const medio = { id: "18001", tipo: "IMAGE", fecha: "2026-09-08T08:07:03.000Z", permalink: "https://www.instagram.com/p/AAA/", caption: "Registro Público: cómo investigar una empresa en Panamá y qué buscar en cada fuente oficial disponible" };
  let a = registrarConsultaMedio(null, { cuenta: "x", medio, consultadoEn: "2026-09-10T05:31:40Z", acumulados: { meGusta: 12, comentarios: 1, reach: null }, faltantes: { reach: "sin-permiso-insights" }, enlace: { origen: "instagram", post: null, categoria: null, franja: null } });
  const p = a.publicaciones["18001"];
  assert.equal(p.origen, "instagram");
  assert.equal(p.post, null); assert.equal(p.categoria, null);
  assert.equal(p.titulo.length <= 90, true);
  assert.deepEqual(Object.keys(p.consultas), ["2026-09-10T05:31:40Z"]);
  assert.deepEqual(p.consultas["2026-09-10T05:31:40Z"], { acumulados: { meGusta: 12, comentarios: 1, reach: null }, faltantes: { reach: "sin-permiso-insights" } });
  a = registrarConsultaMedio(a, { cuenta: "x", medio, consultadoEn: "2026-09-10T20:00:00Z", acumulados: { meGusta: 13, comentarios: 1, reach: null }, faltantes: { reach: "sin-permiso-insights" }, enlace: { origen: "sistema", post: "2026-09-07-1336-x", categoria: "SEGURIDAD", franja: "14:30" } });
  assert.deepEqual(Object.keys(a.publicaciones["18001"].consultas), ["2026-09-10T20:00:00Z"], "una instantánea por día");
  assert.equal(a.publicaciones["18001"].origen, "sistema", "el enlace con el post se actualiza");
  assert.equal(a.publicaciones["18001"].ultimaConsulta, "2026-09-10T20:00:00Z");
});

test("(lib) seriesDeCuenta ordena las instantáneas por fecha de consulta y las métricas por día; los huecos quedan como null", () => {
  const sep = registrarPorDia(registrarConsultaCuenta(null, { cuenta: "x", consultadoEn: "2026-09-30T05:30:00Z", perfil: { seguidores: 40, seguidos: 1, publicaciones: 2 }, permiso: "basico", llamadas: 1, completo: true }), { cuenta: "x", dia: "2026-09-29", consultadoEn: "2026-09-30T05:30:00Z", valores: { reach: 10 }, faltantes: {} });
  const oct = registrarConsultaCuenta(null, { cuenta: "x", consultadoEn: "2026-10-01T05:30:00Z", perfil: { seguidores: null, seguidos: 1, publicaciones: 2 }, permiso: "basico+insights", llamadas: 1, completo: true });
  const s = seriesDeCuenta([oct, sep]);
  assert.deepEqual(s.instantaneas.map((i) => i.consultadoEn), ["2026-09-30T05:30:00Z", "2026-10-01T05:30:00Z"]);
  assert.deepEqual(s.instantaneas.map((i) => i.perfil.seguidores), [40, null]);
  assert.deepEqual(s.porDia, [{ dia: "2026-09-29", valores: { reach: 10 }, faltantes: {}, consultadoEn: "2026-09-30T05:30:00Z" }]);
  assert.equal(s.ultimaConsulta, "2026-10-01T05:30:00Z");
  assert.equal(s.permiso, "basico+insights");
  assert.deepEqual(seriesDeCuenta([]), { instantaneas: [], porDia: [], ultimaConsulta: null, permiso: null });
});

test("(lib) variacionEntreConsultas es aproximada y se etiqueta como tal; sin dos instantáneas o con un valor ausente no se inventa", () => {
  assert.deepEqual(variacionEntreConsultas({ valor: 12, consultadoEn: "2026-09-10T05:00:00Z" }, { valor: 20, consultadoEn: "2026-09-12T05:00:00Z" }), { diferencia: 8, dias: 2, aproximada: true });
  assert.equal(variacionEntreConsultas({ valor: null, consultadoEn: "2026-09-10T05:00:00Z" }, { valor: 20, consultadoEn: "2026-09-12T05:00:00Z" }), null);
  assert.equal(variacionEntreConsultas(null, { valor: 20, consultadoEn: "2026-09-12T05:00:00Z" }), null);
});

test("(lib) rendimientoDePublicaciones devuelve por publicación el último acumulado con su fecha y la variación aproximada respecto a la consulta anterior; null se muestra como no disponible", () => {
  const medio = { id: "18001", tipo: "IMAGE", fecha: "2026-09-08T08:07:03.000Z", permalink: "p", caption: "Hola" };
  let a = registrarConsultaMedio(null, { cuenta: "x", medio, consultadoEn: "2026-09-10T05:31:40Z", acumulados: { meGusta: 12, reach: null }, faltantes: { reach: "sin-permiso-insights" }, enlace: { origen: "instagram", post: null, categoria: null, franja: null } });
  a = registrarConsultaMedio(a, { cuenta: "x", medio, consultadoEn: "2026-09-12T05:31:40Z", acumulados: { meGusta: 20, reach: null }, faltantes: { reach: "sin-permiso-insights" }, enlace: { origen: "instagram", post: null, categoria: null, franja: null } });
  const r = rendimientoDePublicaciones([a]);
  assert.equal(r.length, 1);
  assert.equal(r[0].id, "18001");
  assert.equal(r[0].ultimaConsulta, "2026-09-12T05:31:40Z");
  assert.deepEqual(r[0].acumulados.meGusta, { valor: 20, motivo: null });
  assert.deepEqual(r[0].acumulados.reach, { valor: null, motivo: "sin-permiso-insights" });
  assert.deepEqual(r[0].variacion.meGusta, { diferencia: 8, dias: 2, aproximada: true });
  assert.equal(r[0].variacion.reach, null);
  assert.equal(textoValor(r[0].acumulados.reach.valor, r[0].acumulados.reach.motivo), "No disponible: requiere permiso de estadísticas (instagram_business_manage_insights)");
  assert.equal(textoValor(0), "0", "un 0 real sí se muestra");
  assert.equal(textoValor(null), "No disponible");
  assert.equal(textoMotivo("error-api:2"), "No disponible: la API respondió con el error 2");
});

test("(lib) seleccionarPendientes: primero lo que quedó pendiente, luego lo nunca consultado (más reciente primero), luego lo más antiguo; respeta el presupuesto y devuelve el resto", () => {
  const medios = [
    { id: "a", fecha: "2026-09-09T00:00:00Z" }, { id: "b", fecha: "2026-09-08T00:00:00Z" }, { id: "c", fecha: "2026-09-07T00:00:00Z" },
    { id: "d", fecha: "2026-09-01T00:00:00Z" }, { id: "e", fecha: "2026-08-20T00:00:00Z" },
  ];
  const ultimaConsulta = { c: "2026-09-10T05:00:00Z", d: "2026-09-09T05:00:00Z", e: "2026-09-08T05:00:00Z" };
  const r = seleccionarPendientes({ medios, pendientes: ["d"], ultimaConsulta, presupuesto: 3 });
  assert.deepEqual(r.ahora.map((m) => m.id), ["d", "a", "b"]);
  assert.deepEqual(r.restantes, ["e", "c"], "lo más antiguo en consultarse va antes que lo consultado hoy");
  const todo = seleccionarPendientes({ medios, pendientes: [], ultimaConsulta: {}, presupuesto: 10 });
  assert.deepEqual(todo.ahora.map((m) => m.id), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(todo.restantes, []);
  const nada = seleccionarPendientes({ medios, pendientes: ["zz"], ultimaConsulta: {}, presupuesto: 0 });
  assert.deepEqual(nada.ahora, []);
  assert.deepEqual(nada.restantes, ["a", "b", "c", "d", "e"], "un pendiente que ya no existe se descarta");
});

test("(lib) enlazarConPosts: un medio con publicacion.idMedia en posts/ es del sistema (categoría y franja del post); el resto es de Instagram, sin categoría", () => {
  const posts = [
    { id: "2026-09-07-1336-la-prensa-4fe9", cuenta: "sinlinea", estado: "publicado", categoria: "SEGURIDAD", programado: "2026-09-07T14:30:00-05:00", publicacion: { idMedia: "18143614624563114", permalink: "p", fecha: "2026-09-08T08:07:03.535Z" } },
    { id: "otro", cuenta: "luiseskivelgolcher", estado: "publicado", categoria: "INVESTIGACIÓN", programado: "2026-09-08T12:00:00-05:00", publicacion: { idMedia: "18001", permalink: "p2", fecha: "2026-09-08T17:00:00Z" } },
  ];
  const enlaces = enlazarConPosts(posts, "sinlinea");
  assert.deepEqual(enlaces.get("18143614624563114"), { origen: "sistema", post: "2026-09-07-1336-la-prensa-4fe9", categoria: "SEGURIDAD", franja: "14:30" });
  assert.equal(enlaces.get("18001"), undefined, "los posts de otra cuenta no se enlazan");
  assert.deepEqual(enlaces.get("nada") ?? { origen: "instagram", post: null, categoria: null, franja: null }, { origen: "instagram", post: null, categoria: null, franja: null });
});
