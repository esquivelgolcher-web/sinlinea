import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ejecutarGenerar } from "../src/generar.mjs";
import { cargarConfiguracion } from "../src/lib/config.mjs";
import { leerPosts } from "../src/lib/posts.mjs";
import { cargarVistas } from "../src/lib/seen.mjs";
import { raizConCuentas } from "./ayuda/cuentas.mjs";

const ahora = new Date("2026-09-10T15:00:00Z");
const log = { info: () => {}, warn: () => {} };
const perfil = {
  nombre: "periodismo-tecnologico", temas: ["espionaje", "privacidad", "ciberseguridad"], idiomas: ["es", "en", "fr"],
  puntuacion: { pesos: { afinidad: 30, interes: 25, evidencia: 20, actualidad: 15, visual: 10 }, minimo: 60 },
  formatos: ["post", "carrusel", "reel"], revision: { alertas: ["fuente-unica", "acceso-parcial", "acusacion-sin-fuente", "hecho-antiguo", "evidencia-insuficiente"] },
};
const item = (slug, titulo, desc) => `<item><title>${titulo}</title><link>https://www.wired.com/story/${slug}/?utm_source=rss</link><pubDate>Thu, 10 Sep 2026 10:00:00 +0000</pubDate><description>${desc}</description><dc:creator>Autora WIRED</dc:creator></item>`;
const rssWired = `<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>WIRED</title>${item("clearview", "Clearview AI Is Testing a Tool for Cops", "A facial recognition tool.")}${item("pegasus", "Pegasus Spyware Found on Journalists Phones", "Forensic analysis found Pegasus.")}${item("outage", "A Cyberattack Took Down a Hospital Network", "Hospitals went offline.")}</channel></rss>`;
const atomAj = `<feed xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom"><title>AJ+</title><entry><id>yt:video:abc</id><title>Journalists phones infected with Pegasus spyware</title><link rel="alternate" href="https://www.youtube.com/watch?v=abc"/><author><name>AJ+</name></author><published>2026-09-10T02:00:00+00:00</published><media:group><media:description>Short explainer.</media:description></media:group></entry></feed>`;
const htmlDe = (titulo) => `<html><head><meta property="og:title" content="${titulo}"><meta property="og:description" content="Resumen."><meta property="article:published_time" content="2026-09-10T10:00:00.000Z"><link rel="canonical" href="https://www.wired.com/story/${titulo.split(" ")[0].toLowerCase()}/"><script type="application/ld+json">{"author":{"name":"Autora WIRED"}}</script></head><body>${Array.from({ length: 6 }, (_, i) => `<p>Párrafo ${i} del artículo ${titulo} con texto suficiente para contar como contenido real ${"y".repeat(150)}.</p>`).join("")}<p>Ver el <a href="https://www.citizenlab.ca/report">informe original</a>.</p></body></html>`;
const fetchOk = async (url) => {
  if (url === "https://feed.test/wired") return rssWired;
  if (url === "https://feed.test/ajplus") return atomAj;
  if (url.includes("/story/clearview")) return htmlDe("Clearview AI Is Testing a Tool for Cops");
  if (url.includes("/story/pegasus")) return htmlDe("Pegasus Spyware Found on Journalists Phones");
  if (url.includes("/story/outage")) return htmlDe("Outage A Cyberattack Took Down a Hospital Network");
  throw new Error("HTTP 404");
};

function raizPerfil() {
  const raiz = raizConCuentas({ cuentas: ["sinlinea", "prueba"], global: { pages: { baseUrl: "https://prueba.github.io/sinlinea" } }, prefijo: "gen-perfil-" });
  const ruta = path.join(raiz, "cuentas/prueba/config.json");
  const cfg = JSON.parse(fs.readFileSync(ruta, "utf8"));
  fs.writeFileSync(ruta, JSON.stringify({
    ...cfg, perfil, automatico: { generar: true, publicar: false }, ilustraciones: { ...(cfg.ilustraciones || {}), activo: false },
    generar: { maxPorCorrida: 3, maxBorradoresPorDia: 5, candidatosMax: 10, diasSinRepetir: 3, maxHorasAntiguedad: 48 },
    fuentes: [{ nombre: "WIRED", tipo: "rss", url: "https://feed.test/wired", idioma: "en", prioridad: 1 }, { nombre: "AJ+", tipo: "rss", url: "https://feed.test/ajplus", idioma: "en", prioridad: 2 }],
  }, null, 2));
  fs.writeFileSync(path.join(raiz, "data/prueba/seen.json"), '{ "urls": {} }\n');
  return raiz;
}
const configDe = (raiz) => cargarConfiguracion(raiz).cuentas.find((c) => c.cuenta === "prueba");

const pieza = (indiceGrupo, formato, extra = {}) => ({
  indiceGrupo, formato, categoria: "INVESTIGACIÓN", titular: `Titular ${formato} ${indiceGrupo}`, bajada: "Bajada breve", caption: "Texto de la publicación con atribución. Según WIRED.", hashtags: ["#Privacidad"],
  escena: "Ilustración de alto contraste", angulo: "Ángulo", atribucion: "Según WIRED", fechaHecho: null,
  afirmaciones: [{ texto: "Afirmación", tipo: "hecho", fuente: "https://www.wired.com/story/x/", contrastada: true }],
  puntuacion: { afinidad: 9, interes: 8, evidencia: 7, visual: 7 }, alertas: [], motivo: "m",
  carrusel: formato === "carrusel" ? Array.from({ length: 5 }, (_, i) => ({ titulo: `Diapositiva ${i + 1}`, texto: "Texto breve." })) : null,
  reel: formato === "reel" ? { narracion: "Narración de prueba.", subtitulos: ["s1", "s2"], escenas: [{ segundos: 0, descripcion: "Apertura", recurso: "ilustración" }], recursos: ["voz"] } : null,
  ...extra,
});
function clientePerfil(seleccion) {
  const llamadas = [];
  return { llamadas, messages: { parse: async (p) => { llamadas.push(p); return { stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 }, parsed_output: { seleccion, descartados: [] } }; } } };
}
const renderOk = async (post) => ({ ruta: `public/img/${post.id}.jpg`, url: `https://prueba.github.io/sinlinea/img/${post.id}.jpg`, hash: "0".repeat(16), version: 1, renderizada: ahora.toISOString() });
const renderCarruselOk = async (post) => ({ imagenes: (post.carrusel?.diapositivas || []).map((_, i) => ({ numero: i + 1, ruta: `public/img/${post.id}-0${i + 1}.jpg`, url: `https://prueba.github.io/sinlinea/img/${post.id}-0${i + 1}.jpg`, hash: "a".repeat(16) })), version: 1, hash: "b".repeat(16) });

test("(generar perfil) agrupa por acontecimiento, redacta un post, un carrusel y un reel con fuentes trazables, renderiza las diapositivas y marca las URL vistas; nada queda programado", async () => {
  const raiz = raizPerfil();
  const config = configDe(raiz);
  const client = clientePerfil([pieza(0, "post"), pieza(1, "carrusel"), pieza(2, "reel", { fechaHecho: "2026-07-01", afirmaciones: [{ texto: "La empresa ocultó el ataque", tipo: "denuncia", fuente: "", contrastada: false }] })]);
  const r = await ejecutarGenerar({ config, raiz, ahora, fetchText: fetchOk, client, render: renderOk, renderCarrusel: renderCarruselOk, log });
  assert.equal(r.motivo, "ok");
  assert.equal(r.creados.length, 3);
  const posts = leerPosts(path.join(raiz, "posts"));
  assert.deepEqual(posts.map((p) => p.formato).sort(), ["carrusel", "post", "reel"]);
  assert.ok(posts.every((p) => p.estado === "borrador" && p.programado === null && p.destinos === undefined), "borradores sin programar ni destinos");
  assert.ok(posts.every((p) => p.revision.estado === "pendiente" && typeof p.puntuacion.total === "number" && p.afirmaciones.length === 1));
  const grupos = client.llamadas[0].messages[0].content;
  assert.match(grupos, /Referencias del grupo:\n\s*- AJ\+ · fragmento · Journalists phones infected with Pegasus spyware/, "el vídeo de AJ+ se agrupa con el artículo de WIRED sobre Pegasus como referencia");
  assert.match(grupos, /Fuentes primarias enlazadas:\n\s*- https:\/\/www\.citizenlab\.ca\/report/);
  const conReferencia = posts.find((p) => p.fuentes.length === 2);
  assert.ok(conReferencia, "la pieza del grupo Pegasus conserva la referencia");
  assert.equal(conReferencia.fuentes[0].rol, "principal");
  assert.equal(conReferencia.fuentes[0].alcance, "completo");
  assert.equal(conReferencia.fuentes[0].autor, "Autora WIRED");
  assert.equal(conReferencia.fuentes[1].medio, "AJ+");
  assert.equal(conReferencia.fuentes[1].alcance, "fragmento");
  assert.deepEqual(conReferencia.alertas, [], "con referencia no hay alerta de fuente única");
  const carrusel = posts.find((p) => p.formato === "carrusel");
  assert.equal(carrusel.carrusel.imagenes.length, 5);
  assert.equal(carrusel.carrusel.hash, "b".repeat(16));
  const reel = posts.find((p) => p.formato === "reel");
  assert.equal(reel.reel.narracion, "Narración de prueba.");
  assert.ok(reel.alertas.includes("hecho-antiguo") && reel.alertas.includes("acusacion-sin-fuente"), reel.alertas.join(","));
  assert.equal(reel.fuentes[0].fechaHecho, "2026-07-01", "la fecha del hecho se conserva junto a la fuente");
  const vistas = cargarVistas(path.join(raiz, "data/prueba/seen.json"));
  assert.ok(Object.keys(vistas.urls).some((u) => u.includes("youtube.com")) && Object.keys(vistas.urls).length >= 4, "todas las URL evaluadas quedan vistas");
  // Segunda corrida: las mismas noticias no vuelven a generar nada.
  const r2 = await ejecutarGenerar({ config, raiz, ahora, fetchText: fetchOk, client: clientePerfil([pieza(0, "post")]), render: renderOk, renderCarrusel: renderCarruselOk, log });
  assert.equal(r2.motivo, "sin-candidatos");
});

test("(generar perfil) si ningún artículo es accesible no se llama a Claude ni se inventa un resumen; un fallo del render del carrusel deja nota de revisión sin perder la pieza", async () => {
  const raiz = raizPerfil();
  const config = configDe(raiz);
  const fetch403 = async (url) => { if (url === "https://feed.test/wired") return rssWired; if (url === "https://feed.test/ajplus") return atomAj; throw new Error("HTTP 403"); };
  const client = clientePerfil([pieza(0, "post")]);
  const r = await ejecutarGenerar({ config, raiz, ahora, fetchText: fetch403, client, render: renderOk, renderCarrusel: renderCarruselOk, log });
  assert.equal(r.motivo, "sin-candidatos-legibles");
  assert.equal(client.llamadas.length, 0);
  assert.equal(leerPosts(path.join(raiz, "posts")).length, 0);
  const raiz2 = raizPerfil();
  const r2 = await ejecutarGenerar({ config: configDe(raiz2), raiz: raiz2, ahora, fetchText: fetchOk, client: clientePerfil([pieza(1, "carrusel")]), render: renderOk, renderCarrusel: async () => { throw new Error("La diapositiva 3 no cabe: acorta el texto"); }, log });
  assert.equal(r2.creados.length, 1);
  const p = leerPosts(path.join(raiz2, "posts"))[0];
  assert.equal(p.estado, "borrador");
  assert.deepEqual(p.carrusel.imagenes, []);
  assert.match(p.revision.notas[0], /Carrusel sin renderizar: La diapositiva 3 no cabe/);
});
