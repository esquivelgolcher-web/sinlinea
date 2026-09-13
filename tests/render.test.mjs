import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { versionPlantilla, datosDeRender, construirHtml, estiloVisual, iniciales, datosDeDiapositiva, contraste, colorLegible } from "../src/lib/render.mjs";
import { cargarConfiguracion } from "../src/lib/config.mjs";
import { cargarConfig } from "../src/lib/config.mjs";

const cfg = cargarConfig("config.json");
const post = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));
const plantilla = fs.readFileSync("templates/post.html", "utf8");

test("versionPlantilla lee data-version", () => {
  assert.equal(versionPlantilla('<html lang="es" data-version="7">'), 7);
  assert.equal(versionPlantilla(plantilla), 11);
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

test("(marca) marca.mostrarFecha=false deja el pie sin fecha y cambia el sello visual para que REGENERAR vuelva a dibujar", () => {
  const sinFecha = { ...cfg, marca: { ...cfg.marca, mostrarFecha: false } };
  assert.equal(datosDeRender(post, sinFecha, { logoUrl: null }).fecha, "");
  assert.notEqual(datosDeRender(post, cfg, { logoUrl: null }).fecha, "", "por defecto la fecha se muestra");
  assert.notEqual(estiloVisual(sinFecha, null), estiloVisual(cfg, null));
});

test("(marca) marca.mostrarCategoria=false quita la etiqueta de categoría de la imagen y de la portada del carrusel, y solo cambia el sello visual de esa cuenta", () => {
  const sinCategoria = { ...cfg, marca: { ...cfg.marca, mostrarCategoria: false } };
  assert.equal(datosDeRender(post, cfg, { logoUrl: null }).categoria, post.categoria, "por defecto se muestra");
  assert.equal(datosDeRender(post, sinCategoria, { logoUrl: null }).categoria, "", "apagada, el chip queda vacío y la plantilla no lo dibuja");
  assert.equal(datosDeRender(post, { ...cfg, marca: { ...cfg.marca, mostrarCategoria: true } }, { logoUrl: null }).categoria, post.categoria);
  // El sello visual cambia para esa cuenta (REGENERAR redibuja) y no para quien no use la opción.
  assert.notEqual(estiloVisual(sinCategoria, null), estiloVisual(cfg, null));
  assert.equal(estiloVisual(cfg, null), estiloVisual({ ...cfg, marca: { ...cfg.marca } }, null), "no declararla no cambia nada de lo ya dibujado");
  // Las frases no llevan categoría: su sello no depende de la opción y no se redibujan al apagarla.
  assert.equal(estiloVisual(sinCategoria, null, { formato: "frase" }), estiloVisual(cfg, null, { formato: "frase" }));
  // Carrusel: la portada deja de llevar la etiqueta; el resto de diapositivas conservan su numeración y el cierre sus fuentes.
  const carrusel = { ...post, formato: "carrusel", carrusel: { diapositivas: [{ titulo: "A", texto: "a" }, { titulo: "B", texto: "b" }, { titulo: "C", texto: "c" }], imagenes: [] } };
  assert.equal(datosDeDiapositiva(carrusel, cfg, 0, { logoUrl: null }).categoria, post.categoria);
  assert.equal(datosDeDiapositiva(carrusel, sinCategoria, 0, { logoUrl: null }).categoria, "");
  assert.equal(datosDeDiapositiva(carrusel, sinCategoria, 1, { logoUrl: null }).etiqueta, "1 de 1");
});

test("(contraste) el titular sobre la ilustración usa el primer color de la marca que se lea bien sobre el fondo oscuro", () => {
  // WCAG: blanco sobre negro es el máximo; un color sobre sí mismo, el mínimo.
  assert.equal(Math.round(contraste("#FFFFFF", "#000000")), 21);
  assert.equal(contraste("#123456", "#123456"), 1);
  // Sin Línea: el amarillo de marca ya contrasta con su negro, así que no cambia nada de lo que hay dibujado.
  assert.equal(colorLegible(["#FFD400", "#E30613", "#FFFFFF"], "#111111"), "#FFD400");
  // Leo Pope: el granate es ilegible sobre su fondo oscuro; se pasa al dorado de acento, no al marfil.
  assert.equal(colorLegible(["#500014", "#C8A45D", "#F5F0E6"], "#202020"), "#C8A45D");
  // Si ninguno llega al mínimo, gana el de mayor contraste, aunque sea por ser más oscuro que el fondo.
  assert.equal(colorLegible(["#500014", "#3A0010"], "#202020"), "#3A0010");
  assert.ok(contraste("#3A0010", "#202020") > contraste("#500014", "#202020"));
  assert.equal(colorLegible([], "#202020"), null);
});

test("(contraste) datosDeRender y la portada del carrusel llevan el color del titular ya resuelto para el fondo con ilustración", () => {
  const marcaOscura = { ...cfg.marca, colores: { principal: "#500014", acento: "#C8A45D", oscuro: "#202020", claro: "#F5F0E6" } };
  assert.equal(datosDeRender(post, cfg, { logoUrl: null }).titularIlustracion, cfg.marca.colores.principal, "con una marca legible se conserva el color principal");
  assert.equal(datosDeRender(post, { ...cfg, marca: marcaOscura }, { logoUrl: null }).titularIlustracion, "#C8A45D");
  const carrusel = { ...post, formato: "carrusel", carrusel: { diapositivas: [{ titulo: "A", texto: "a" }, { titulo: "B", texto: "b" }], imagenes: [] } };
  assert.equal(datosDeDiapositiva(carrusel, { ...cfg, marca: marcaOscura }, 0, { logoUrl: null }).titularIlustracion, "#C8A45D");
});

test("(sello) el de una frase no depende de la etiqueta de sección ni del color del titular sobre ilustración: esas opciones no la redibujan", () => {
  const marcaOscura = { ...cfg.marca, colores: { principal: "#500014", acento: "#C8A45D", oscuro: "#202020", claro: "#F5F0E6" }, mostrarCategoria: false };
  const conOpciones = { ...cfg, marca: marcaOscura };
  const sinOpciones = { ...cfg, marca: { ...marcaOscura, mostrarCategoria: true } };
  assert.equal(estiloVisual(conOpciones, null, { formato: "frase" }), estiloVisual(sinOpciones, null, { formato: "frase" }), "la frase ignora ambas");
  assert.notEqual(estiloVisual(conOpciones, null), estiloVisual(sinOpciones, null), "la imagen del post sí las refleja");
  // Cambiar los colores sí afecta a las frases: su tarjeta los usa.
  assert.notEqual(estiloVisual(conOpciones, null, { formato: "frase" }), estiloVisual(cfg, null, { formato: "frase" }));
});
