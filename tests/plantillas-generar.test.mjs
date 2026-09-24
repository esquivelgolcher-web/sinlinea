// GENERAR con plantillas: Claude propone la cifra de la noticia, el sistema comprueba que está en el texto, elige la
// plantilla sin repetir la anterior y no pide ilustración a Gemini para dato ni titular. Una cuenta sin plantillas
// declaradas no cambia en nada.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ejecutarGenerar } from "../src/generar.mjs";
import { cargarConfiguracion } from "../src/lib/config.mjs";
import { leerPosts } from "../src/lib/posts.mjs";
import { construirSystem, EsquemaRedaccionConDato } from "../src/lib/redactor.mjs";
import { raizConCuentas } from "./ayuda/cuentas.mjs";

const ahora = new Date("2026-09-24T16:00:00.000Z");
const log = { info: () => {}, warn: () => {}, error: () => {} };
const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>La Prensa</title>
<item><title>Encuesta: casi la mitad de los hogares come menos</title><link>https://www.prensa.com/sociedad/encuesta-hogares/</link><pubDate>Thu, 24 Sep 2026 12:00:00 GMT</pubDate><description>La CCIAP revela que el 47% de los hogares comió menos de tres veces al día por falta de dinero.</description></item>
<item><title>Ministerios alquilan camionetas</title><link>https://www.prensa.com/politica/camionetas/</link><pubDate>Thu, 24 Sep 2026 11:00:00 GMT</pubDate><description>Trece ministerios contrataron más de 120 vehículos 4x4 entre enero y septiembre.</description></item>
<item><title>Asamblea debate circuitos</title><link>https://www.prensa.com/politica/circuitos/</link><pubDate>Thu, 24 Sep 2026 10:00:00 GMT</pubDate><description>El pleno inició el segundo debate del proyecto.</description></item>
</channel></rss>`;
const fetchText = async () => rss;
const render = async (post) => ({ ruta: `public/img/${post.id}.jpg`, url: `https://x/img/${post.id}.jpg`, hash: "0".repeat(16), version: 1, renderizada: ahora.toISOString() });

function redaccion(i, extra = {}) {
  return { indiceCandidato: i, categoria: "SOCIEDAD", titular: `Titular de prueba número ${i} para la tarjeta`, bajada: "Bajada de prueba.", caption: "Caption.", hashtags: ["#Panamá"], relevancia: 1 - i / 10, motivo: "m", escena: "Una mesa con platos vacíos en una cocina humilde", dato: null, ...extra };
}
function clientCon(seleccion) {
  const c = { peticiones: [], messages: { parse: async (req) => { c.peticiones.push(req); return { stop_reason: "end_turn", usage: {}, parsed_output: { descartados: [], seleccion } }; } } };
  return c;
}
function raizCon({ plantillas }) {
  const raiz = raizConCuentas({ cuentas: ["sinlinea"], global: { pages: { baseUrl: "https://prueba.github.io/sinlinea" } }, prefijo: "plantillas-generar-" });
  const ruta = path.join(raiz, "cuentas/sinlinea/config.json");
  const c = JSON.parse(fs.readFileSync(ruta, "utf8"));
  const marca = { ...c.marca };
  if (plantillas) marca.plantillas = plantillas; else delete marca.plantillas;
  fs.writeFileSync(ruta, JSON.stringify({ ...c, marca, automatico: { generar: true, publicar: false },
    fuentes: [{ nombre: "La Prensa", tipo: "rss", url: "https://www.prensa.com/arc/outboundfeeds/rss/" }],
    generar: { ...c.generar, maxPorCorrida: 3, maxBorradoresPorDia: 12 } }, null, 2));
  fs.writeFileSync(path.join(raiz, "data", "sinlinea", "seen.json"), '{ "urls": {} }\n');
  return { raiz, config: cargarConfiguracion(raiz).cuentas[0], dir: path.join(raiz, "posts") };
}
function ilustradorContador() {
  const i = { llamadas: 0, generar: async () => { i.llamadas++; return Buffer.from("jpg"); } };
  return i;
}

test("(plantillas) el esquema admite el dato o null, y la regla del dato solo va a Claude si la cuenta usa esa plantilla", () => {
  const ok = { seleccion: [redaccion(0, { dato: { cifra: "47%", frase: "de los hogares" } }), redaccion(1)], descartados: [] };
  assert.doesNotThrow(() => EsquemaRedaccionConDato.parse(ok));
  assert.throws(() => EsquemaRedaccionConDato.parse({ ...ok, seleccion: [{ ...ok.seleccion[0], dato: { cifra: 47 } }] }));
  const con = construirSystem("Línea editorial.", { idioma: "es-PA", plantillas: ["foto", "dato", "titular"] });
  const sin = construirSystem("Línea editorial.", { idioma: "es-PA" });
  assert.match(con, /"dato"/);
  assert.match(con, /tal cual/i, "la cifra se copia tal cual del texto");
  assert.doesNotMatch(sin, /"cifra"/, "sin la plantilla dato, Claude no recibe esa regla");
});

test("(plantillas) una cifra comprobada en el texto da un Dato, sin ilustración; las siguientes no repiten plantilla", async () => {
  const { raiz, config, dir } = raizCon({ plantillas: ["foto", "dato", "titular"] });
  const client = clientCon([
    redaccion(0, { dato: { cifra: "47%", frase: "de los hogares comió menos de 3 veces al día" } }),
    redaccion(1),
    redaccion(2),
  ]);
  const ilustrador = ilustradorContador();
  const r = await ejecutarGenerar({ config, raiz, ahora, fetchText, client, render, log, ilustrador, guardar: async () => {} });
  assert.equal(r.creados.length, 3);
  const [a, b, c] = r.creados;
  assert.equal(a.plantilla, "dato");
  assert.deepEqual(a.dato, { cifra: "47%", frase: "de los hogares comió menos de 3 veces al día" });
  assert.equal(b.plantilla, "foto", "tras un dato, una foto");
  assert.equal(c.plantilla, "titular", "tras una foto, un titular: nunca dos iguales seguidas");
  assert.equal(ilustrador.llamadas, 1, "solo la foto pide ilustración a Gemini");
  assert.equal(a.ilustracion.usar, false, "la escena se guarda por si se cambia a foto, pero no se usa");
  assert.ok(a.ilustracion.descripcion, "la escena se conserva");
  assert.match(client.peticiones[0].system[0].text, /"dato"/);
  assert.equal(leerPosts(dir).length, 3);
});

test("(plantillas) una cifra que no aparece en el texto se descarta: el post sale sin dato", async () => {
  const { raiz, config } = raizCon({ plantillas: ["foto", "dato", "titular"] });
  const avisos = [];
  const client = clientCon([redaccion(0, { dato: { cifra: "50%", frase: "de los hogares comió menos" } })]);
  const r = await ejecutarGenerar({ config, raiz, ahora, fetchText, client, render, log: { ...log, warn: (m) => avisos.push(m) } });
  assert.equal(r.creados[0].plantilla, "foto");
  assert.equal(r.creados[0].dato, undefined);
  assert.ok(avisos.some((m) => /50%/.test(m) && /texto/.test(m)), "queda dicho por qué se descartó la cifra");
});

test("(plantillas) una cuenta sin plantillas declaradas sigue exactamente igual: sin campo plantilla y con ilustración", async () => {
  const { raiz, config } = raizCon({ plantillas: null });
  const client = clientCon([redaccion(0, { dato: { cifra: "47%", frase: "de los hogares" } }), redaccion(1)]);
  const ilustrador = ilustradorContador();
  const r = await ejecutarGenerar({ config, raiz, ahora, fetchText, client, render, log, ilustrador, guardar: async () => {} });
  for (const p of r.creados) {
    assert.equal(p.plantilla, undefined);
    assert.equal(p.dato, undefined);
  }
  assert.equal(ilustrador.llamadas, 2);
  assert.doesNotMatch(client.peticiones[0].system[0].text, /"cifra"/);
});
