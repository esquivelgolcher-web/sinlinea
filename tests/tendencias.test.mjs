// Fuentes de tipo "tendencias" (qué se busca hoy en un país, formato RSS de Google Trends): un candidato por tema, cada
// uno con URL propia, porque todos los temas comparten el enlace del feed y el sistema los tomaría por uno solo.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { candidatosDesdeTendencias, recolectar } from "../src/lib/fuentes.mjs";
import { TIPOS_FUENTE, erroresDeCuenta } from "../src/lib/cuenta.mjs";
import { validarCuenta, cargarCuenta } from "../src/lib/config.mjs";

const xml = fs.readFileSync("tests/fixtures/tendencias-google.xml", "utf8");
const fuente = { nombre: "Tendencias de Panamá", tipo: "tendencias", url: "https://trends.google.com/trending/rss?geo=PA" };
const ahora = new Date("2026-09-13T14:00:00.000Z");

test("(tendencias) el tipo existe y se valida como los demás", () => {
  assert.ok(TIPOS_FUENTE.includes("tendencias"));
  const c = cargarCuenta(".", "sinlinea");
  assert.doesNotThrow(() => validarCuenta({ ...c, fuentes: [fuente] }, "sinlinea"));
  assert.throws(() => validarCuenta({ ...c, fuentes: [{ ...fuente, tipo: "memes" }] }, "sinlinea"), /tipo/);
  // El formulario del panel acepta el tipo nuevo y no le exige patrón de artículo (eso es solo de las portadas).
  const base = { id: "x", nombre: "X", usuario: "@x", idioma: "es-PA", zonaHoraria: "America/Panama", temas: ["a"], tono: "b", franjas: ["09:00"], colores: { principal: "#FFD400", acento: "#E30613", oscuro: "#111111", claro: "#FFFFFF" }, logoForma: "circulo", logoTamano: 120, ilustracionesActivo: false, estiloIlustracion: "", rotulo: "" };
  assert.deepEqual(erroresDeCuenta({ ...base, fuentes: [fuente] }).filter((e) => /fuentes/.test(e)), []);
});

test("(tendencias) cada tema es un candidato con URL propia, el término como título y el contexto y el volumen de búsquedas en el texto", () => {
  const c = candidatosDesdeTendencias(xml, fuente, { ahora, maxHoras: 48 });
  assert.equal(c.length, 3, "tres temas en la fixture, no uno solo");
  assert.equal(new Set(c.map((x) => x.url)).size, 3, "URLs distintas: si no, seen.json los daría por vistos tras el primero");
  for (const x of c) assert.match(x.url, /^https?:\/\//);
  const primero = c[0];
  assert.equal(primero.titulo, "levante - barcelona");
  assert.equal(primero.medio, "Tendencias de Panamá");
  assert.equal(primero.origen, "tendencias");
  assert.match(primero.texto, /Levante - Barcelona hoy, en directo/, "el texto lleva la noticia que explica el tema");
  assert.match(primero.texto, /2000\+/, "y cuánta gente lo está buscando");
  assert.equal(primero.fecha, "2026-09-13T13:20:00.000Z");
  assert.equal(primero.url, "https://as.com/futbol/primera/levante-barcelona-hoy-en-directo-partido-de-laliga-ea-sports-en-vivo-f202609-d/", "la URL es la de la noticia del tema");
});

test("(tendencias) un tema sin noticia asociada conserva una URL propia derivada del término, y los temas viejos se descartan", () => {
  // Un tema puede traer varias noticias; se quitan todas para comprobar el caso sin ninguna.
  const sinNoticia = xml.replace(/<ht:news_item>[\s\S]*?<\/ht:news_item>/g, "");
  const c = candidatosDesdeTendencias(sinNoticia, fuente, { ahora, maxHoras: 48 });
  assert.equal(c.length, 3);
  assert.match(c[0].url, /trends\.google\.com.*levante/i);
  assert.match(c[0].texto, /2000\+/);
  assert.equal(candidatosDesdeTendencias(xml, fuente, { ahora: new Date("2026-09-20T00:00:00.000Z"), maxHoras: 48 }).length, 0, "una semana después ya no son tendencia");
});

test("(tendencias) recolectar admite el tipo nuevo junto a los feeds normales y respeta el filtro de vistos", async () => {
  const config = { fuentes: [fuente], generar: { maxHorasAntiguedad: 48, candidatosMax: 10 } };
  const fetchText = async () => xml;
  const todos = await recolectar(config, { fetchText, ahora, log: { info: () => {}, warn: () => {} } });
  assert.equal(todos.length, 3);
  const filtrados = await recolectar(config, { fetchText, ahora, log: { info: () => {}, warn: () => {} }, filtrar: (u) => !u.includes("as.com") });
  assert.equal(filtrados.length, 2, "lo ya visto no vuelve a proponerse");
});

test("(tendencias) el mismo tema en varios países llega una sola vez: se descartan los candidatos con la URL repetida", async () => {
  const dos = [
    { nombre: "Tendencias de México", tipo: "tendencias", url: "https://trends.google.com/trending/rss?geo=MX" },
    { nombre: "Tendencias de Colombia", tipo: "tendencias", url: "https://trends.google.com/trending/rss?geo=CO" },
  ];
  const config = { fuentes: dos, generar: { maxHorasAntiguedad: 48, candidatosMax: 10 } };
  const c = await recolectar(config, { fetchText: async () => xml, ahora, log: { info: () => {}, warn: () => {} } });
  assert.equal(c.length, 3, "los dos países traen los mismos tres temas: se envían una vez");
  assert.equal(new Set(c.map((x) => x.url)).size, c.length);
  assert.equal(c[0].medio, "Tendencias de México", "se conserva el primero que lo trajo");
});
