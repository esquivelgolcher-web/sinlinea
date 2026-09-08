import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { versionPlantilla, datosDeRender, construirHtml, estiloVisual, iniciales } from "../src/lib/render.mjs";
import { cargarConfiguracion } from "../src/lib/config.mjs";
import { cargarConfig } from "../src/lib/config.mjs";

const cfg = cargarConfig("config.json");
const post = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));
const plantilla = fs.readFileSync("templates/post.html", "utf8");

test("versionPlantilla lee data-version", () => {
  assert.equal(versionPlantilla('<html lang="es" data-version="7">'), 7);
  assert.equal(versionPlantilla(plantilla), 10);
});

test("datosDeRender arma los textos de la imagen", () => {
  const d = datosDeRender(post, cfg, { logoUrl: null });
  assert.equal(d.titular, post.titular);
  assert.equal(d.fecha, "7 sep 2026");
  assert.equal(d.usuario, cfg.marca.usuario);
  assert.equal(d.lema, "Nuestra línea es el Pueblo");
  assert.equal(d.variante, "negro");
  assert.equal(d.logoUrl, null);
});

test("construirHtml inyecta base y datos JSON escapando </", () => {
  const html = construirHtml({ ...post, titular: "Cierra </script> raro" }, cfg, { plantilla, baseHref: "file:///C:/x/", logoUrl: "assets/logo.png" });
  assert.match(html, /<base href="file:\/\/\/C:\/x\/">/);
  assert.ok(!html.includes("__BASE__"));
  const m = html.match(/<script id="datos" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(m);
  assert.ok(m[1].includes("<\\/script>"), "debe escapar </ dentro del JSON");
  assert.equal(JSON.parse(m[1]).logoUrl, "assets/logo.png");
});

test("construirHtml no interpreta patrones $ del texto (p. ej. $& o $$)", () => {
  const html = construirHtml({ ...post, titular: "Precio sube a $& y $$ el doble", bajada: "Cuesta $' hoy" }, cfg, { plantilla, baseHref: "file:///C:/x/", logoUrl: null });
  const m = html.match(/<script id="datos" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(m);
  const datos = JSON.parse(m[1]);
  assert.equal(datos.titular, "Precio sube a $& y $$ el doble");
  assert.equal(datos.bajada, "Cuesta $' hoy");
  assert.equal((html.match(/<script id="datos"/g) || []).length, 1);
});

test("construirHtml incluye la ilustración y el rótulo solo cuando se pasa ilustracionUrl", () => {
  const con = construirHtml(post, cfg, { plantilla, baseHref: "/", logoUrl: null, ilustracionUrl: "public/ilus/x.jpg" });
  const m = con.match(/<script id="datos" type="application\/json">([\s\S]*?)<\/script>/);
  const datos = JSON.parse(m[1]);
  assert.equal(datos.ilustracionUrl, "public/ilus/x.jpg");
  assert.equal(datos.rotulo, cfg.ilustraciones.rotulo);
  assert.equal(datos.rotulo, "", "(rótulo) Sin Línea ya no lleva rótulo de IA");
  const sin = construirHtml(post, cfg, { plantilla, baseHref: "/", logoUrl: null });
  assert.equal(JSON.parse(sin.match(/<script id="datos" type="application\/json">([\s\S]*?)<\/script>/)[1]).ilustracionUrl, null);
});

test("(M2) datosDeRender lleva los colores y las iniciales de la marca de la cuenta", () => {
  const d = datosDeRender(post, cfg, { logoUrl: null });
  assert.deepEqual(d.colores, { principal: "#FFD400", acento: "#E30613", oscuro: "#111111", claro: "#FFFFFF" });
  assert.equal(d.iniciales, "SL");
  const personal = cargarConfiguracion(".").cuentas.find((c) => c.cuenta === "luiseskivelgolcher");
  const d2 = datosDeRender(post, personal, { logoUrl: null });
  assert.equal(d2.colores.acento, "#1F5FBF");
  assert.equal(d2.iniciales, "LEG");
  assert.equal(d2.usuario, "@luiseskivelgolcher");
  assert.equal(iniciales("Sin Línea"), "SL");
  assert.equal(iniciales("  un   nombre muy largo de marca "), "UNM");
  assert.equal(iniciales(""), "?");
});

test("(M2) estiloVisual cambia con los colores o con la presencia del logo y es estable", () => {
  const a = estiloVisual(cfg, "cuentas/sinlinea/logo.png");
  assert.equal(a, estiloVisual(cfg, "cuentas/sinlinea/logo.png"));
  assert.notEqual(a, estiloVisual(cfg, null));
  assert.notEqual(a, estiloVisual({ ...cfg, marca: { ...cfg.marca, colores: { ...cfg.marca.colores, acento: "#000000" } } }, "cuentas/sinlinea/logo.png"));
  assert.match(a, /^[0-9a-f]{16}$/);
});

test("(rótulo) estiloVisual cambia si cambia el rótulo, para que REGENERAR vuelva a dibujar", () => {
  const conRotulo = { ...cfg, ilustraciones: { ...cfg.ilustraciones, rotulo: "Ilustración generada con IA" } };
  assert.notEqual(estiloVisual(cfg, null), estiloVisual(conRotulo, null));
});

test("(logo) datosDeRender lleva la forma del logo y estiloVisual cambia con ella", () => {
  const d = datosDeRender(post, cfg, { logoUrl: "cuentas/sinlinea/logo.png" });
  assert.equal(d.logoForma, "circulo");
  const personal = cargarConfiguracion(".").cuentas.find((c) => c.cuenta === "luiseskivelgolcher");
  assert.equal(datosDeRender(post, personal, { logoUrl: "cuentas/luiseskivelgolcher/logo.png" }).logoForma, "cuadrado");
  const cuadrado = { ...cfg, marca: { ...cfg.marca, logoForma: "cuadrado" } };
  assert.notEqual(estiloVisual(cfg, "x"), estiloVisual(cuadrado, "x"), "cambiar la forma del logo obliga a REGENERAR a re-dibujar");
});

test("(logo) datosDeRender lleva el tamaño del logo y estiloVisual cambia con él", () => {
  assert.equal(datosDeRender(post, cfg, { logoUrl: null }).logoTamano, 120);
  const personal = cargarConfiguracion(".").cuentas.find((c) => c.cuenta === "luiseskivelgolcher");
  assert.equal(datosDeRender(post, personal, { logoUrl: null }).logoTamano, 90);
  const chico = { ...cfg, marca: { ...cfg.marca, logoTamano: 90 } };
  assert.notEqual(estiloVisual(cfg, "x"), estiloVisual(chico, "x"));
});
