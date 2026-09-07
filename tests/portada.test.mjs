import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { extraerEnlacesPortada, seccionDeUrl } from "../src/lib/portada.mjs";

const html = fs.readFileSync("tests/fixtures/laestrella-portada.html", "utf8");
const opciones = {
  baseUrl: "https://www.laestrella.com.pa/",
  patronArticulo: "^/[a-z-]+(?:/[a-z-]+)*/[a-z0-9-]+-[A-Z]{2}\\d{6,}$",
  excluirSecciones: ["opinion", "tag", "autor"],
};

test("extrae solo artículos del mismo host, sin repetidos, query ni hash", () => {
  assert.deepEqual(extraerEnlacesPortada(html, opciones), [
    "https://www.laestrella.com.pa/economia/panama-toma-distancia-del-impuesto-minimo-global-PE25472058",
    "https://www.laestrella.com.pa/panama/nacional/piscina-de-albrook-AE25479955",
    "https://www.laestrella.com.pa/panama/politica/salida-del-parlacen-LE25479615",
  ]);
});

test("sin exclusiones incluye la columna de opinión", () => {
  const urls = extraerEnlacesPortada(html, { ...opciones, excluirSecciones: [] });
  assert.ok(urls.some((u) => u.includes("/opinion/")));
});

test("seccionDeUrl devuelve el primer segmento", () => {
  assert.equal(seccionDeUrl("https://www.prensa.com/sociedad/x/"), "sociedad");
  assert.equal(seccionDeUrl("https://www.prensa.com/"), "");
});
