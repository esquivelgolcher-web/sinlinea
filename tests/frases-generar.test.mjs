// Generación de frases célebres por cuenta: configuración `frases`, cupo diario propio, banco sin repeticiones, extracción
// literal de textos reales (nunca inventada) con Claude simulado, render con la plantilla de frases y fallos claros.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ejecutarGenerarFrases, generarCuentas } from "../src/generar.mjs";
import { cargarConfiguracion, cargarConfig, validarCuenta, cargarCuenta } from "../src/lib/config.mjs";
import { leerPosts, escribirPost } from "../src/lib/posts.mjs";
import { extraerFrase } from "../src/lib/redactor.mjs";
import { raizConCuentas } from "./ayuda/cuentas.mjs";

const ahora = new Date("2026-09-11T16:00:00.000Z");
const log = { info: () => {}, warn: () => {}, error: () => {} };
const banco = [
  { texto: "Peace be with you all!", autor: "Pope Leo XIV", fuente: "First blessing from the loggia of St. Peter's", anio: 2025, url: "https://www.vatican.va/content/leo-xiv/en.html" },
  { texto: "Be not afraid!", autor: "Saint John Paul II", fuente: "Homily at the inauguration of his pontificate", anio: 1978, url: null },
];
const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Vatican News</title>
<item><title>Pope at Angelus: peace is built every day</title><link>https://www.vaticannews.va/en/pope/news/2026-09/angelus.html</link><pubDate>Fri, 11 Sep 2026 10:00:00 GMT</pubDate><description>The Pope prayed for peace.</description></item>
<item><title>Bishops meet in Rome</title><link>https://www.vaticannews.va/en/church/news/2026-09/bishops.html</link><pubDate>Fri, 11 Sep 2026 09:00:00 GMT</pubDate><description>Meeting.</description></item>
</channel></rss>`;
const articulos = {
  "https://www.vaticannews.va/en/pope/news/2026-09/angelus.html": { titulo: "Pope at Angelus: peace is built every day", fecha: "2026-09-11T10:00:00.000Z", texto: "At the Angelus the Pope said: “Peace is built every day, in the small things, with patience and courage.” He then greeted the pilgrims." },
  "https://www.vaticannews.va/en/church/news/2026-09/bishops.html": { titulo: "Bishops meet in Rome", fecha: "2026-09-11T09:00:00.000Z", texto: "The bishops discussed pastoral plans." },
};
const fetchText = async () => rss;
const leerArticulo = async (url) => articulos[url];
const renderFrase = async (post) => ({ ruta: `public/img/${post.id}.jpg`, url: `https://prueba.github.io/sinlinea/img/${post.id}.jpg`, hash: "0".repeat(16), version: 1, renderizada: ahora.toISOString() });

function raizTemporal(frases) {
  const raiz = raizConCuentas({ cuentas: ["sinlinea", "prueba"], global: { pages: { baseUrl: "https://prueba.github.io/sinlinea" } }, prefijo: "frases-generar-" });
  const ruta = path.join(raiz, "cuentas/prueba/config.json");
  const c = JSON.parse(fs.readFileSync(ruta, "utf8"));
  fs.writeFileSync(ruta, JSON.stringify({ ...c, idioma: "en", zonaHoraria: "America/New_York", automatico: { generar: true, publicar: false }, fuentes: [{ nombre: "Vatican News", tipo: "rss", url: "https://www.vaticannews.va/en.rss.xml" }], frases }, null, 2));
  for (const x of ["sinlinea", "prueba"]) fs.writeFileSync(path.join(raiz, "data", x, "seen.json"), '{ "urls": {} }\n');
  const config = cargarConfiguracion(raiz).cuentas.find((x) => x.cuenta === "prueba");
  return { raiz, config, dir: path.join(raiz, "posts") };
}

test("(frases) configuración: el bloque frases es opcional; activo, porDia (1 a 5), preferir (textos|banco), categoria, hashtags y banco con texto, autor, fuente, anio y url se validan", () => {
  const c = cargarCuenta(".", "sinlinea");
  assert.doesNotThrow(() => validarCuenta({ ...c }, "sinlinea"), "sin bloque frases sigue valiendo");
  assert.doesNotThrow(() => validarCuenta({ ...c, frases: { activo: true, porDia: 1, preferir: "banco", categoria: "CULTURA", hashtags: ["#Vatican"], banco } }, "sinlinea"));
  assert.throws(() => validarCuenta({ ...c, frases: { activo: "sí" } }, "sinlinea"), /frases\.activo/);
  assert.throws(() => validarCuenta({ ...c, frases: { activo: true, porDia: 0 } }, "sinlinea"), /frases\.porDia/);
  assert.throws(() => validarCuenta({ ...c, frases: { activo: true, preferir: "memoria" } }, "sinlinea"), /frases\.preferir/);
  assert.throws(() => validarCuenta({ ...c, frases: { activo: true, categoria: "PAPAS" } }, "sinlinea"), /frases\.categoria/);
  assert.throws(() => validarCuenta({ ...c, frases: { activo: true, banco: [{ texto: "", autor: "x", fuente: "y" }] } }, "sinlinea"), /frases\.banco/);
  assert.throws(() => validarCuenta({ ...c, frases: { activo: true, banco: [{ texto: "x".repeat(321), autor: "x", fuente: "y" }] } }, "sinlinea"), /frases\.banco/);
  assert.throws(() => validarCuenta({ ...c, frases: { activo: true, banco: [{ texto: "x", autor: "x", fuente: "y", anio: "2025" }] } }, "sinlinea"), /frases\.banco/);
  assert.throws(() => validarCuenta({ ...c, frases: { activo: true, banco: [{ texto: "x", autor: "x", fuente: "y", url: "vatican.va" }] } }, "sinlinea"), /frases\.banco/);
  const { config } = raizTemporal({ activo: true, banco });
  assert.equal(config.frases.porDia, 1, "porDia por defecto 1");
  assert.equal(config.frases.preferir, "textos", "por defecto se prefiere una frase de un texto real del día");
  assert.deepEqual(config.frases.hashtags, []);
  const sin = raizTemporal(undefined).config;
  assert.equal(sin.frases.activo, false, "sin bloque, las frases están apagadas");
});

test("(frases) con preferir=textos se extrae una frase literal de un artículo real (Claude simulado): pieza con origen texto, fuente = el artículo, render con la plantilla de frases; un segundo intento el mismo día respeta el cupo", async () => {
  const { raiz, config, dir } = raizTemporal({ activo: true, porDia: 1, banco });
  const llamadas = [];
  const extraerFrase = async ({ textos }) => { llamadas.push(textos.map((t) => t.url)); return { indice: 0, frase: "Peace is built every day, in the small things, with patience and courage.", autor: "Pope Leo XIV", fuente: "Angelus" }; };
  const r = await ejecutarGenerarFrases({ config, raiz, ahora, fetchText, leerArticulo, extraerFrase, renderFrase, log });
  assert.equal(r.motivo, "ok");
  assert.equal(r.creadas.length, 1);
  const p = leerPosts(dir).find((x) => x.formato === "frase");
  assert.equal(p.frase.origen, "texto");
  assert.equal(p.frase.texto, "Peace is built every day, in the small things, with patience and courage.");
  assert.equal(p.fuente.url, "https://www.vaticannews.va/en/pope/news/2026-09/angelus.html");
  assert.equal(p.fuente.medio, "Vatican News");
  assert.equal(p.imagen.ruta, `public/img/${p.id}.jpg`);
  assert.equal(p.ilustracion, null);
  assert.deepEqual(llamadas[0], ["https://www.vaticannews.va/en/pope/news/2026-09/angelus.html", "https://www.vaticannews.va/en/church/news/2026-09/bishops.html"], "se ofrecen los textos del día, el más reciente primero");
  const r2 = await ejecutarGenerarFrases({ config, raiz, ahora: new Date(ahora.getTime() + 3600000), fetchText, leerArticulo, extraerFrase, renderFrase, log });
  assert.equal(r2.motivo, "cupo-frases");
  assert.equal(llamadas.length, 1, "con el cupo agotado no se llama a Claude");
});

test("(frases) una frase que no está literalmente en el texto se rechaza y se usa el banco; un artículo ya usado no se vuelve a ofrecer; agotado el banco no hay frase", async () => {
  const { raiz, config, dir } = raizTemporal({ activo: true, porDia: 3, banco });
  const inventada = async () => ({ indice: 0, frase: "Peace is built every single day with courage.", autor: "Pope Leo XIV", fuente: "Angelus" });
  const avisos = [];
  const r = await ejecutarGenerarFrases({ config, raiz, ahora, fetchText, leerArticulo, extraerFrase: inventada, renderFrase, log: { ...log, warn: (m) => avisos.push(m) } });
  assert.equal(r.motivo, "ok");
  const p = leerPosts(dir).find((x) => x.formato === "frase");
  assert.equal(p.frase.origen, "banco");
  assert.equal(p.frase.texto, "Peace be with you all!");
  assert.ok(avisos.some((m) => /no aparece literalmente/.test(m)), "el rechazo queda en el registro");
  // Segunda pieza: la frase del banco ya usada se salta; tercera: banco agotado y sin frase literal.
  const r2 = await ejecutarGenerarFrases({ config, raiz, ahora: new Date(ahora.getTime() + 60000), fetchText, leerArticulo, extraerFrase: async () => null, renderFrase, log });
  assert.equal(leerPosts(dir).filter((x) => x.formato === "frase").map((x) => x.frase.texto).sort().join("|"), "Be not afraid!|Peace be with you all!");
  const r3 = await ejecutarGenerarFrases({ config, raiz, ahora: new Date(ahora.getTime() + 120000), fetchText, leerArticulo, extraerFrase: async () => null, renderFrase, log });
  assert.equal(r3.motivo, "sin-frases");
  assert.equal(r2.motivo, "ok");
  // Un artículo del que ya salió una frase no se vuelve a ofrecer a Claude.
  const usado = { ...leerPosts(dir).find((x) => x.formato === "frase"), frase: { ...banco[0], anio: 2025, url: "https://www.vaticannews.va/en/pope/news/2026-09/angelus.html", origen: "texto" } };
  escribirPost(dir, { ...usado, id: `${usado.id.slice(0, -4)}ffff` });
  const ofrecidos = [];
  await ejecutarGenerarFrases({ config: { ...config, frases: { ...config.frases, porDia: 9 } }, raiz, ahora: new Date(ahora.getTime() + 180000), fetchText, leerArticulo, extraerFrase: async ({ textos }) => { ofrecidos.push(...textos.map((t) => t.url)); return null; }, renderFrase, log });
  assert.deepEqual(ofrecidos, ["https://www.vaticannews.va/en/church/news/2026-09/bishops.html"]);
});

test("(frases) con preferir=banco no se descargan textos ni se llama a Claude; con frases apagadas o generación apagada no se hace nada; un fallo de render deja la pieza en error de render", async () => {
  const { raiz, config, dir } = raizTemporal({ activo: true, preferir: "banco", banco });
  let claude = 0; let lecturas = 0;
  const r = await ejecutarGenerarFrases({ config, raiz, ahora, fetchText, leerArticulo: async (u) => { lecturas++; return leerArticulo(u); }, extraerFrase: async () => { claude++; return null; }, renderFrase, log });
  assert.equal(r.motivo, "ok");
  assert.equal(claude, 0); assert.equal(lecturas, 0);
  assert.equal(leerPosts(dir).find((x) => x.formato === "frase").frase.origen, "banco");
  const apagadas = raizTemporal({ activo: false, banco });
  assert.equal((await ejecutarGenerarFrases({ config: apagadas.config, raiz: apagadas.raiz, ahora, fetchText, leerArticulo, extraerFrase: async () => null, renderFrase, log })).motivo, "frases-desactivadas");
  const sinGenerar = raizTemporal({ activo: true, banco });
  assert.equal((await ejecutarGenerarFrases({ config: { ...sinGenerar.config, automatico: { ...sinGenerar.config.automatico, generar: false } }, raiz: sinGenerar.raiz, ahora, fetchText, leerArticulo, extraerFrase: async () => null, renderFrase, log })).motivo, "generar-desactivado");
  const falla = raizTemporal({ activo: true, preferir: "banco", banco });
  const r4 = await ejecutarGenerarFrases({ config: falla.config, raiz: falla.raiz, ahora, fetchText, leerArticulo, extraerFrase: async () => null, renderFrase: async () => { throw new Error("Chromium no arrancó"); }, log });
  assert.equal(r4.motivo, "ok");
  const e = leerPosts(falla.dir).find((x) => x.formato === "frase");
  assert.equal(e.estado, "error"); assert.equal(e.error.paso, "render");
});

test("(frases) generarCuentas encadena las frases tras las noticias de cada cuenta y las expone en el resultado", async () => {
  const { raiz } = raizTemporal({ activo: true, preferir: "banco", banco });
  const configuracion = cargarConfiguracion(raiz);
  const client = { messages: { parse: async () => ({ stop_reason: "end_turn", usage: {}, parsed_output: { descartados: [], seleccion: [] } }) } };
  const r = await generarCuentas({ configuracion, raiz, ahora, fetchText, client, render: renderFrase, renderFrase, leerArticulo, extraerFraseDe: () => async () => null, log, soloCuenta: "prueba" });
  assert.equal(r.resultados.prueba.frases.motivo, "ok");
  assert.equal(r.resultados.prueba.frases.creadas.length, 1);
});

test("(frases) extraerFrase pide a Claude una frase literal dicha por el papa dentro de los textos, con índice, autor y fuente; sin frase adecuada devuelve null; una respuesta fuera de rango se descarta", async () => {
  const config = { claude: { modelo: "claude-x" }, idioma: "en", marca: { nombre: "Leo Pope" } };
  const textos = [{ url: "https://x/1", medio: "Vatican News", titulo: "Pope at Angelus", fecha: "2026-09-11T10:00:00.000Z", texto: "The Pope said: “Peace is built every day.”" }];
  const peticiones = [];
  const client = { messages: { parse: async (req) => { peticiones.push(req); return { stop_reason: "end_turn", parsed_output: { indice: 0, frase: "Peace is built every day.", autor: "Pope Leo XIV", fuente: "Angelus", motivo: "ok" } }; } } };
  const r = await extraerFrase({ client, config, textos });
  assert.deepEqual(r, { indice: 0, frase: "Peace is built every day.", autor: "Pope Leo XIV", fuente: "Angelus" });
  assert.match(peticiones[0].system, /literal|verbatim|exact/i);
  assert.match(peticiones[0].messages[0].content, /Peace is built every day/);
  const ninguna = { messages: { parse: async () => ({ stop_reason: "end_turn", parsed_output: { indice: null, frase: "", autor: "", fuente: "", motivo: "no hay palabras del papa" } }) } };
  assert.equal(await extraerFrase({ client: ninguna, config, textos }), null);
  const fuera = { messages: { parse: async () => ({ stop_reason: "end_turn", parsed_output: { indice: 7, frase: "x", autor: "y", fuente: "z", motivo: "" } }) } };
  assert.equal(await extraerFrase({ client: fuera, config, textos }), null);
});
