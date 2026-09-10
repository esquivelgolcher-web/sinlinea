import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseFeed } from "../src/lib/rss.mjs";
import { extraerArticulo } from "../src/lib/articulo.mjs";
import { candidatosDesdeRss, completarCandidato, recolectar, alcanceDe } from "../src/lib/fuentes.mjs";
import { cargarConfig } from "../src/lib/config.mjs";

const ahora = new Date("2026-09-10T15:00:00Z");
const atomYoutube = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <title>AJ+</title>
 <entry>
  <id>yt:video:abc</id>
  <title>How Pegasus spyware works</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=abc"/>
  <author><name>AJ+</name></author>
  <published>2026-09-10T02:00:00+00:00</published>
  <updated>2026-09-10T06:58:37+00:00</updated>
  <media:group>
   <media:title>How Pegasus spyware works</media:title>
   <media:description>A short explainer on how the spyware infects phones. &quot;Zero-click&quot; attacks need no tap.</media:description>
  </media:group>
 </entry>
</feed>`;
const rssConAutor = `<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>WIRED</title>
<item><title>Clearview AI Is Testing a Tool</title><link>https://www.wired.com/story/clearview/?utm_source=rss</link><pubDate>Thu, 10 Sep 2026 10:00:00 +0000</pubDate>
<description>Documents show the facial recognition company is testing a tool.</description><dc:creator>Dhruv Mehrotra</dc:creator></item>
</channel></rss>`;
const htmlArticulo = `<html><head><title>Clearview AI Is Testing a Tool | WIRED</title>
<meta property="og:title" content="Clearview AI Is Testing a Tool"><meta property="og:description" content="Documents show the company is testing a tool.">
<meta property="article:published_time" content="2026-09-10T10:00:00.000Z"><meta property="article:modified_time" content="2026-09-10T12:30:00.000Z">
<link rel="canonical" href="https://www.wired.com/story/clearview/">
<script type="application/ld+json">{"@type":"NewsArticle","author":[{"@type":"Person","name":"Dhruv Mehrotra"}],"datePublished":"2026-09-10T10:00:00.000Z","dateModified":"2026-09-10T12:30:00.000Z"}</script>
</head><body>
${Array.from({ length: 6 }, (_, i) => `<p class="paywall">Párrafo ${i} con bastante texto para contar como contenido real del artículo y superar el mínimo de caracteres exigido por el extractor ${"x".repeat(160)}.</p>`).join("\n")}
<p>Según la <a href="https://www.aclu.org/cases/aclu-v-clearview-ai">demanda de la ACLU</a> y un <a href="https://www.wired.com/story/otro/">artículo anterior</a>, la empresa <a href="https://www.priv.gc.ca/en/opc-news/2020/an_200221/">fue sancionada</a>.</p>
</body></html>`;

test("(fuentes) parseFeed lee Atom de YouTube (media:description como descripción, autor) y dc:creator en RSS", () => {
  const [v] = parseFeed(atomYoutube);
  assert.equal(v.link, "https://www.youtube.com/watch?v=abc");
  assert.match(v.description, /Zero-click/);
  assert.equal(v.autor, "AJ+");
  const [w] = parseFeed(rssConAutor);
  assert.equal(w.autor, "Dhruv Mehrotra");
});

test("(fuentes) extraerArticulo añade autor, URL canónica, fecha de actualización y enlaces externos del cuerpo (fuentes primarias)", () => {
  const a = extraerArticulo(htmlArticulo);
  assert.equal(a.autor, "Dhruv Mehrotra");
  assert.equal(a.canonica, "https://www.wired.com/story/clearview/");
  assert.equal(a.actualizado, "2026-09-10T12:30:00.000Z");
  assert.equal(a.parrafos.length, 7);
  assert.deepEqual(a.enlaces, ["https://www.aclu.org/cases/aclu-v-clearview-ai", "https://www.priv.gc.ca/en/opc-news/2020/an_200221/"], "solo enlaces a otros dominios, sin repetir");
});

test("(fuentes) alcance de acceso: completo, parcial, fragmento o titular según lo recuperado; nunca se finge haber leído más", () => {
  assert.equal(alcanceDe({ parrafos: 6, caracteres: 1500, descripcion: "d" }), "completo");
  assert.equal(alcanceDe({ parrafos: 2, caracteres: 400, descripcion: "d" }), "parcial");
  assert.equal(alcanceDe({ parrafos: 0, caracteres: 0, descripcion: "un resumen" }), "fragmento");
  assert.equal(alcanceDe({ parrafos: 0, caracteres: 0, descripcion: "" }), "titular");
});

test("(fuentes) los candidatos conservan medio, autor, idioma, fechas, consulta y alcance; los vídeos de YouTube quedan como fragmento", () => {
  const fuente = { nombre: "AJ+", tipo: "rss", url: "https://www.youtube.com/feeds/videos.xml?channel_id=x", idioma: "en", prioridad: 2 };
  const [c] = candidatosDesdeRss(parseFeed(atomYoutube), fuente, { ahora, maxHoras: 48 });
  assert.equal(c.idioma, "en");
  assert.equal(c.autor, "AJ+");
  assert.equal(c.prioridad, 2);
  assert.equal(c.consultado, ahora.toISOString());
  assert.equal(c.alcance, "fragmento");
  assert.equal(c.canonica, "https://www.youtube.com/watch?v=abc");
  assert.deepEqual(c.fuentesPrimarias, []);
  assert.equal(c.actualizado, null);
  const completado = completarCandidato(c, extraerArticulo(htmlArticulo), { ahora });
  assert.equal(completado.alcance, "completo");
  assert.equal(completado.autor, "Dhruv Mehrotra");
  assert.equal(completado.canonica, "https://www.wired.com/story/clearview/");
  assert.equal(completado.actualizado, "2026-09-10T12:30:00.000Z");
  assert.deepEqual(completado.textoRecuperado, { parrafos: 7, caracteres: completado.texto.length });
  assert.equal(completado.fuentesPrimarias.length, 2);
});

test("(fuentes) con perfil, recolectar descarga el artículo de cada ítem RSS (salvo YouTube) y registra el alcance; un artículo inaccesible queda como fragmento con aviso, no como texto completo", async () => {
  const config = { ...cargarConfig("config.json"), perfil: { nombre: "p" }, generar: { maxHorasAntiguedad: 48, candidatosMax: 10 }, fuentes: [
    { nombre: "WIRED", tipo: "rss", url: "https://feed.test/wired", idioma: "en", prioridad: 1 },
    { nombre: "AJ+", tipo: "rss", url: "https://feed.test/ajplus", idioma: "en", prioridad: 2 },
  ] };
  const pedidas = [];
  const fetchText = async (url) => {
    pedidas.push(url);
    if (url === "https://feed.test/wired") return rssConAutor.replace("clearview/?utm_source=rss", "clearview/?utm_source=rss") + "";
    if (url === "https://feed.test/ajplus") return atomYoutube;
    if (url.startsWith("https://www.wired.com/story/clearview")) return htmlArticulo;
    throw new Error("HTTP 403");
  };
  const avisos = [];
  const c = await recolectar(config, { fetchText, ahora, log: { warn: (m) => avisos.push(m), info: () => {} } });
  const wired = c.find((x) => x.medio === "WIRED");
  assert.equal(wired.alcance, "completo");
  assert.equal(wired.autor, "Dhruv Mehrotra");
  assert.equal(wired.url, "https://www.wired.com/story/clearview/?utm_source=rss", "la URL del feed se conserva tal cual");
  assert.equal(wired.canonica, "https://www.wired.com/story/clearview/");
  const aj = c.find((x) => x.medio === "AJ+");
  assert.equal(aj.alcance, "fragmento");
  assert.equal(pedidas.filter((u) => u.includes("youtube.com/watch")).length, 0, "los vídeos no se descargan");
  // Artículo inaccesible (403): el candidato sigue con la descripción del feed y alcance fragmento.
  const fetch403 = async (url) => { if (url === "https://feed.test/wired") return rssConAutor; if (url === "https://feed.test/ajplus") return atomYoutube; throw new Error("HTTP 403"); };
  const c2 = await recolectar(config, { fetchText: fetch403, ahora, log: { warn: (m) => avisos.push(m), info: () => {} } });
  const w2 = c2.find((x) => x.medio === "WIRED");
  assert.equal(w2.alcance, "fragmento");
  assert.equal(w2.texto, "Documents show the facial recognition company is testing a tool.");
  assert.ok(avisos.some((m) => /HTTP 403/.test(m) && /fragmento/.test(m)));
  // Sin perfil (cuentas actuales) no se descargan artículos de RSS: el comportamiento de siempre.
  const sinPerfil = { ...config }; delete sinPerfil.perfil;
  pedidas.length = 0;
  await recolectar(sinPerfil, { fetchText, ahora, log: { warn: () => {}, info: () => {} } });
  assert.equal(pedidas.filter((u) => u.includes("wired.com/story")).length, 0);
});
