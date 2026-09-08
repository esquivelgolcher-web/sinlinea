import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { versionPlantilla, datosDeRender, construirHtml } from "../src/lib/render.mjs";
import { cargarConfig } from "../src/lib/config.mjs";

const cfg = cargarConfig("config.json");
const post = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));
const plantilla = fs.readFileSync("templates/post.html", "utf8");

test("versionPlantilla lee data-version", () => {
  assert.equal(versionPlantilla('<html lang="es" data-version="7">'), 7);
  assert.equal(versionPlantilla(plantilla), 6);
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
  assert.equal(datos.rotulo, "Ilustración generada con IA");
  const sin = construirHtml(post, cfg, { plantilla, baseHref: "/", logoUrl: null });
  assert.equal(JSON.parse(sin.match(/<script id="datos" type="application\/json">([\s\S]*?)<\/script>/)[1]).ilustracionUrl, null);
});
