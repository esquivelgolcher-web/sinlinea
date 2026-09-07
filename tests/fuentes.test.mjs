import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseFeed } from "../src/lib/rss.mjs";
import { candidatosDesdeRss, candidatosDesdePortada, completarCandidato, recolectar } from "../src/lib/fuentes.mjs";
import { cargarConfig } from "../src/lib/config.mjs";

const ahora = new Date("2026-09-07T20:00:00Z");
const xml = fs.readFileSync("tests/fixtures/laprensa.xml", "utf8");
const portadaHtml = fs.readFileSync("tests/fixtures/laestrella-portada.html", "utf8");
const articuloHtml = fs.readFileSync("tests/fixtures/laestrella-articulo.html", "utf8");
const cfg = cargarConfig("config.json");

test("candidatosDesdeRss excluye secciones y convierte content:encoded en texto", () => {
  const c = candidatosDesdeRss(parseFeed(xml), cfg.fuentes[0], { ahora, maxHoras: 48 });
  assert.equal(c.length, 1); // status-k excluido
  assert.equal(c[0].medio, "La Prensa");
  assert.equal(c[0].seccion, "sociedad");
  assert.equal(c[0].fecha, "2026-09-07T13:10:00.000Z");
  assert.match(c[0].texto, /^El Cuerpo de Bomberos de Panamá/);
  assert.ok(!c[0].texto.includes("Foto: LP"));
  assert.equal(c[0].origen, "rss");
});

test("candidatosDesdeRss descarta ítems más viejos que maxHoras", () => {
  const c = candidatosDesdeRss(parseFeed(xml), cfg.fuentes[0], { ahora: new Date("2026-09-12T00:00:00Z"), maxHoras: 48 });
  assert.equal(c.length, 0);
});

test("completarCandidato rellena desde el artículo", () => {
  const [cand] = candidatosDesdePortada(["https://www.laestrella.com.pa/economia/x-PE25472058"], cfg.fuentes[1]);
  assert.equal(cand.origen, "portada");
  assert.equal(cand.titulo, "");
  const lleno = completarCandidato(cand, {
    titulo: "T", descripcion: "D", fecha: "2026-09-07T00:00:00-05:00", parrafos: ["p".repeat(50)],
  }, { ahora });
  assert.equal(lleno.titulo, "T");
  assert.equal(lleno.fecha, "2026-09-07T05:00:00.000Z");
  assert.equal(lleno.texto, "p".repeat(50));
});

test("recolectar sigue si una fuente falla, respeta filtrar y completa las portadas", async () => {
  const llamadas = [];
  const fetchText = async (url) => {
    llamadas.push(url);
    if (url.includes("prensa.com")) throw new Error("HTTP 503 en feed");
    if (url === "https://www.laestrella.com.pa/") return portadaHtml;
    return articuloHtml;
  };
  const avisos = [];
  const log = { warn: (m) => avisos.push(m), info: () => {} };
  const filtrar = (url) => !url.includes("parlacen");
  const c = await recolectar(cfg, { fetchText, ahora, log, filtrar });
  assert.equal(c.length, 2);
  assert.ok(c.every((x) => x.medio === "La Estrella de Panamá" && x.titulo && x.texto));
  assert.ok(!llamadas.some((u) => u.includes("parlacen")), "no debe descargar lo filtrado");
  assert.ok(avisos.some((m) => /La Prensa/.test(m)));
});

test("recolectar limita las descargas de portada a candidatosMax y avisa si la portada no da enlaces", async () => {
  const descargas = [];
  const fetchText = async (url) => {
    if (url.includes("prensa.com")) throw new Error("no");
    if (url === "https://www.laestrella.com.pa/") return portadaHtml;
    descargas.push(url);
    return articuloHtml;
  };
  const cfg1 = { ...cfg, generar: { ...cfg.generar, candidatosMax: 1 } };
  const c = await recolectar(cfg1, { fetchText, ahora, log: { warn: () => {}, info: () => {} } });
  assert.equal(descargas.length, 1);
  assert.equal(c.length, 1);
  const avisos = [];
  await recolectar(cfg, { fetchText: async (u) => (u === "https://www.laestrella.com.pa/" ? "<html><body><p>sin enlaces</p></body></html>" : ""), ahora, log: { warn: (m) => avisos.push(m), info: () => {} } });
  assert.ok(avisos.some((m) => /patronArticulo/.test(m)));
});
