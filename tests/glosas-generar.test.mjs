// GENERAR de glosas por cuenta: cupo propio, noticias recientes de la propia cuenta como materia (nunca de otra
// cuenta, nunca descartadas, nunca glosadas dos veces), escritura con Claude simulado, comprobación de métrica y rima
// con un reintento, render con la plantilla de La Garza, y encadenado en generarCuentas. Todo sale como borrador.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ejecutarGenerarGlosas, generarCuentas } from "../src/generar.mjs";
import { cargarConfiguracion } from "../src/lib/config.mjs";
import { leerPosts, escribirPost } from "../src/lib/posts.mjs";
import { escribirGlosa, construirSystemGlosa } from "../src/lib/redactor.mjs";
import { raizConCuentas } from "./ayuda/cuentas.mjs";

const ahora = new Date("2026-09-25T16:00:00.000Z");
const log = { info: () => {}, warn: () => {}, error: () => {} };
const base = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));
const versos = ["Trece ministerios andan", "en camioneta alquilada;", "el pueblo a pie, sin más nada,", "pagando lo que ellos mandan."];
const renderGlosa = async (post) => ({ ruta: `public/img/${post.id}.jpg`, url: `https://prueba.github.io/sinlinea/img/${post.id}.jpg`, hash: "0".repeat(16), version: 1, renderizada: ahora.toISOString() });

function noticia(n, extra = {}) {
  return { ...base, id: `${base.id.slice(0, -4)}${String(n).padStart(4, "0")}`, cuenta: "prueba", estado: "borrador", titular: `Noticia número ${n} de la cuenta`, categoria: "POLÍTICA",
    fuente: { medio: "La Prensa", url: `https://www.prensa.com/nota-${n}/`, titulo: `Nota ${n}`, publicado: ahora.toISOString() },
    creado: new Date(ahora.getTime() - 3600000).toISOString(), actualizado: new Date(ahora.getTime() - 3600000).toISOString(), imagen: null, programado: null, ...extra };
}
function escritorDe(respuestas) {
  const llamadas = [];
  let i = 0;
  return { llamadas, escribir: async (args) => { llamadas.push(args); return respuestas[Math.min(i++, respuestas.length - 1)]; } };
}
function raizTemporal(glosas, posts = [noticia(1)]) {
  const raiz = raizConCuentas({ cuentas: ["sinlinea", "prueba"], global: { pages: { baseUrl: "https://prueba.github.io/sinlinea" } }, prefijo: "glosas-generar-" });
  const ruta = path.join(raiz, "cuentas/prueba/config.json");
  const c = JSON.parse(fs.readFileSync(ruta, "utf8"));
  fs.writeFileSync(ruta, JSON.stringify({ ...c, idioma: "es-PA", zonaHoraria: "America/Panama", automatico: { generar: true, publicar: false }, glosas }, null, 2));
  for (const x of ["sinlinea", "prueba"]) fs.writeFileSync(path.join(raiz, "data", x, "seen.json"), '{ "urls": {} }\n');
  // La cuenta principal copiada del repositorio puede traer sus propias glosas activas: aquí se prueba solo "prueba".
  const rutaSl = path.join(raiz, "cuentas/sinlinea/config.json");
  const sl = JSON.parse(fs.readFileSync(rutaSl, "utf8"));
  delete sl.glosas;
  fs.writeFileSync(rutaSl, JSON.stringify(sl, null, 2));
  for (const p of posts) escribirPost(path.join(raiz, "posts"), p);
  const config = cargarConfiguracion(raiz).cuentas.find((x) => x.cuenta === "prueba");
  return { raiz, config, dir: path.join(raiz, "posts") };
}

test("(glosas) apagadas por defecto; con la generación automática apagada tampoco se escriben", async () => {
  const a = raizTemporal(undefined);
  const r1 = await ejecutarGenerarGlosas({ config: a.config, raiz: a.raiz, ahora, escribirGlosa: async () => null, renderGlosa, log });
  assert.equal(r1.motivo, "glosas-desactivadas");
  const b = raizTemporal({ activo: true });
  const r2 = await ejecutarGenerarGlosas({ config: { ...b.config, automatico: { generar: false, publicar: false } }, raiz: b.raiz, ahora, escribirGlosa: async () => null, renderGlosa, log });
  assert.equal(r2.motivo, "generar-desactivado");
});

test("(glosas) escribe una glosa sobre una noticia reciente de la cuenta, la dibuja y la deja en borrador", async () => {
  const { raiz, config, dir } = raizTemporal({ activo: true, hashtags: ["#Glosa"], personaje: { nombre: "La Garza María", cargo: "Comentarista del Palacio" } });
  const escritor = escritorDe([{ indice: 0, versos, porQue: "el contraste camioneta / a pie" }]);
  const r = await ejecutarGenerarGlosas({ config, raiz, ahora, escribirGlosa: escritor.escribir, renderGlosa, log });
  assert.equal(r.motivo, "ok");
  assert.equal(r.creadas.length, 1);
  const g = leerPosts(dir).find((p) => p.formato === "glosa");
  assert.deepEqual(g.glosa.versos, versos);
  assert.equal(g.glosa.sobre.id, noticia(1).id);
  assert.equal(g.estado, "borrador");
  assert.equal(g.programado, null);
  assert.ok(g.imagen?.url);
  assert.ok(g.caption.includes("#Glosa"));
  const [args] = escritor.llamadas;
  assert.equal(args.noticias.length, 1);
  assert.equal(args.noticias[0].titular, "Noticia número 1 de la cuenta");
  assert.equal(args.noticias[0].medio, "La Prensa");
  assert.equal(args.personaje.nombre, "La Garza María");
  assert.ok(args.editorialMd.length > 0, "la línea editorial de la cuenta viaja con la petición");
});

test("(glosas) solo se ofrecen noticias de la propia cuenta, recientes, no descartadas y sin glosa previa", async () => {
  const vieja = noticia(2, { creado: new Date(ahora.getTime() - 72 * 3600000).toISOString() });
  const descartada = noticia(3, { estado: "descartado" });
  const ajena = noticia(4, { cuenta: "sinlinea" });
  const publicada = noticia(5, { estado: "publicado", publicacion: { idMedia: "1", permalink: "https://www.instagram.com/p/x/", fecha: ahora.toISOString() } });
  const { raiz, config } = raizTemporal({ activo: true, horasVentana: 48 }, [noticia(1), vieja, descartada, ajena, publicada]);
  const escritor = escritorDe([{ indice: 0, versos, porQue: "x" }]);
  await ejecutarGenerarGlosas({ config, raiz, ahora, escribirGlosa: escritor.escribir, renderGlosa, log });
  assert.deepEqual(escritor.llamadas[0].noticias.map((n) => n.titular).sort(), ["Noticia número 1 de la cuenta", "Noticia número 5 de la cuenta"]);

  // La noticia 1 ya tiene glosa: en la siguiente corrida (otro día) no se vuelve a ofrecer.
  const manana = new Date(ahora.getTime() + 24 * 3600000);
  const segundo = escritorDe([{ indice: 0, versos, porQue: "x" }]);
  await ejecutarGenerarGlosas({ config, raiz, ahora: manana, escribirGlosa: segundo.escribir, renderGlosa, log });
  assert.deepEqual(segundo.llamadas[0].noticias.map((n) => n.titular), ["Noticia número 5 de la cuenta"]);
});

test("(glosas) sin noticias recientes no se llama a Claude; con el cupo del día gastado tampoco", async () => {
  const sinNoticias = raizTemporal({ activo: true }, []);
  let pedido = false;
  const r = await ejecutarGenerarGlosas({ config: sinNoticias.config, raiz: sinNoticias.raiz, ahora, escribirGlosa: async () => { pedido = true; return null; }, renderGlosa, log });
  assert.equal(r.motivo, "sin-noticias");
  assert.equal(pedido, false);

  const { raiz, config } = raizTemporal({ activo: true, porDia: 1 }, [noticia(1), noticia(2)]);
  await ejecutarGenerarGlosas({ config, raiz, ahora, escribirGlosa: escritorDe([{ indice: 0, versos, porQue: "x" }]).escribir, renderGlosa, log });
  const r2 = await ejecutarGenerarGlosas({ config, raiz, ahora, escribirGlosa: async () => { pedido = true; return null; }, renderGlosa, log });
  assert.equal(r2.motivo, "cupo-glosas");
  assert.equal(pedido, false, "con el cupo agotado no se gasta una llamada a Claude");
});

test("(glosas) una cuarteta coja se devuelve a Claude con sus errores una vez; si sigue coja, se descarta con aviso", async () => {
  const coja = ["Trece ministerios andan hoy", ...versos.slice(1)];
  const { raiz, config, dir } = raizTemporal({ activo: true });
  const escritor = escritorDe([{ indice: 0, versos: coja, porQue: "x" }, { indice: 0, versos, porQue: "x" }]);
  const r = await ejecutarGenerarGlosas({ config, raiz, ahora, escribirGlosa: escritor.escribir, renderGlosa, log });
  assert.equal(r.motivo, "ok");
  assert.equal(escritor.llamadas.length, 2);
  assert.match(escritor.llamadas[1].errores[0], /verso 1 tiene 10 sílabas/);
  assert.deepEqual(escritor.llamadas[1].versosAnteriores, coja);

  const otra = raizTemporal({ activo: true });
  const avisos = [];
  const terco = escritorDe([{ indice: 0, versos: coja, porQue: "x" }]);
  const r2 = await ejecutarGenerarGlosas({ config: otra.config, raiz: otra.raiz, ahora, escribirGlosa: terco.escribir, renderGlosa, log: { ...log, warn: (m) => avisos.push(m) } });
  assert.equal(r2.motivo, "glosa-invalida");
  assert.equal(terco.llamadas.length, 2);
  assert.equal(leerPosts(otra.dir).some((p) => p.formato === "glosa"), false);
  assert.ok(avisos.some((m) => /sílabas/.test(m)));
  assert.equal(leerPosts(dir).filter((p) => p.formato === "glosa").length, 1);
});

test("(glosas) si Claude no ve ninguna noticia apta para el humor, no se escribe nada", async () => {
  const { raiz, config, dir } = raizTemporal({ activo: true });
  const r = await ejecutarGenerarGlosas({ config, raiz, ahora, escribirGlosa: async () => null, renderGlosa, log });
  assert.equal(r.motivo, "sin-glosa");
  assert.equal(leerPosts(dir).some((p) => p.formato === "glosa"), false);
});

test("(glosas) generarCuentas encadena las glosas tras las noticias solo en las cuentas que las tienen activas", async () => {
  const { raiz } = raizTemporal({ activo: true });
  const configuracion = cargarConfiguracion(raiz);
  const cuentas = [];
  const client = { messages: { parse: async () => ({ stop_reason: "end_turn", usage: {}, parsed_output: { descartados: [], seleccion: [] } }) } };
  const r = await generarCuentas({
    configuracion, raiz, ahora, fetchText: async () => "<rss><channel></channel></rss>", client, render: renderGlosa, renderGlosa, log,
    escribirGlosaDe: (config) => async () => { cuentas.push(config.cuenta); return { indice: 0, versos, porQue: "x" }; },
  });
  assert.deepEqual(cuentas, ["prueba"]);
  assert.equal(r.resultados.prueba.glosas.creadas.length, 1);
  assert.equal(r.resultados.sinlinea.glosas, undefined);
});

test("(glosas) escribirGlosa: el personaje, las reglas de la cuarteta y las noticias van a Claude; con errores se pide corregir", async () => {
  const config = { claude: { modelo: "claude-x", esfuerzo: "medium" }, idioma: "es-PA", marca: { nombre: "Sin Línea" } };
  const personaje = { nombre: "La Garza María", cargo: "Comentarista del Palacio" };
  const noticias = [{ titular: "Ministerios gastan $1.5 millones en alquiler de camionetas", bajada: "Más de 120 vehículos.", caption: "Texto.", categoria: "POLÍTICA", medio: "La Prensa" }];
  const peticiones = [];
  const client = { messages: { parse: async (req) => { peticiones.push(req); return { stop_reason: "end_turn", parsed_output: { indice: 0, versos, porQue: "contraste" } }; } } };
  const r = await escribirGlosa({ client, config, editorialMd: "Línea editorial.", noticias, personaje });
  assert.deepEqual(r, { indice: 0, versos, porQue: "contraste" });
  const system = construirSystemGlosa("Línea editorial.", { idioma: "es-PA", personaje });
  assert.match(system, /La Garza María/);
  assert.match(system, /ocho sílabas/i);
  assert.match(system, /rima/i);
  assert.match(system, /muert/i, "los temas vetados van en las reglas");
  assert.match(peticiones[0].messages[0].content, /Ministerios gastan/);
  await escribirGlosa({ client, config, editorialMd: "Línea editorial.", noticias, personaje, errores: ["el verso 1 tiene 10 sílabas y la glosa pide 8"], versosAnteriores: ["Trece ministerios andan hoy", ...versos.slice(1)] });
  assert.match(peticiones[1].messages[0].content, /10 sílabas/);
  assert.match(peticiones[1].messages[0].content, /Trece ministerios andan hoy/);
  const ninguna = { messages: { parse: async () => ({ stop_reason: "end_turn", parsed_output: { indice: null, versos: [], porQue: "solo hay tragedias" } }) } };
  assert.equal(await escribirGlosa({ client: ninguna, config, editorialMd: "x", noticias, personaje }), null);
});
