// Glosas (formato "glosa"): la cuarteta de La Garza sobre una noticia ya publicada o en borrador de la cuenta.
// Modelo de la pieza, cupo diario, noticias ya glosadas, configuración por cuenta, huella de la imagen y edición.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { crearPostGlosa, glosasCreadasHoy, noticiasGlosadas, captionDeGlosa } from "../src/lib/glosas.mjs";
import { FORMATOS, NOMBRES_FORMATO, esPublicable } from "../src/lib/formatos.mjs";
import { hashImagen, editarTexto, imagenDesactualizada, renderOk } from "../src/lib/estados.mjs";
import { validarPost } from "../src/lib/posts.mjs";
import { validarCuenta, cargarCuenta, configDeCuenta, cargarGlobal } from "../src/lib/config.mjs";
import { configDesdeFormulario, formularioDesdeConfig, erroresDeCuenta } from "../src/lib/cuenta.mjs";

const base = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));
const ahora = new Date("2026-09-25T15:00:00.000Z");
const versos = ["Trece ministerios andan", "en camioneta alquilada;", "el pueblo a pie, sin más nada,", "pagando lo que ellos mandan."];
const noticia = { ...base, id: base.id.slice(0, -4) + "a001", cuenta: "sinlinea", titular: "Ministerios gastan $1.5 millones en alquiler de camionetas", categoria: "POLÍTICA", fuente: { medio: "La Prensa", url: "https://www.prensa.com/politica/camionetas/", titulo: "Ministerios gastan en camionetas", publicado: "2026-09-21T10:00:00.000Z" } };
const config = { idioma: "es-PA", marca: { usuario: "@sinlinea.pa" }, glosas: { hashtags: ["#Panamá", "#Glosa"], personaje: { nombre: "La Garza María", cargo: "Comentarista del Palacio" } } };

test("(glosas) el formato glosa existe, se llama Glosa y se publica como imagen única", () => {
  assert.ok(FORMATOS.includes("glosa"));
  assert.equal(NOMBRES_FORMATO.glosa, "Glosa");
  assert.equal(esPublicable("glosa"), true);
});

test("(glosas) crearPostGlosa arma la pieza sobre una noticia de la cuenta: versos, esquema, fuente y caption", () => {
  const post = crearPostGlosa({ versos, sobre: noticia, config, ahora, zona: "America/Panama", cuenta: "sinlinea", variante: "rojo" });
  assert.equal(post.formato, "glosa");
  assert.equal(post.estado, "borrador");
  assert.equal(post.cuenta, "sinlinea");
  assert.deepEqual(post.glosa.versos, versos);
  assert.equal(post.glosa.esquema, "ABBA");
  assert.equal(post.glosa.sobre.id, noticia.id);
  assert.equal(post.glosa.sobre.titular, noticia.titular);
  assert.deepEqual(post.fuente, noticia.fuente, "la fuente es la de la noticia glosada");
  assert.equal(post.categoria, "POLÍTICA");
  assert.equal(post.titular, versos[0], "el titular del panel es el primer verso");
  assert.match(post.bajada, /^Sobre: Ministerios gastan/);
  assert.ok(post.caption.startsWith(versos.join("\n")));
  assert.ok(post.caption.includes("Sobre: Ministerios gastan $1.5 millones en alquiler de camionetas · La Prensa"));
  assert.ok(post.caption.includes("#Glosa"));
  assert.equal(post.ilustracion, null);
  assert.equal(post.imagen, null);
  assert.equal(post.programado, null);
  assert.doesNotThrow(() => validarPost(post));
  assert.equal(captionDeGlosa(post.glosa, { medio: "La Prensa", hashtags: [] }), `${versos.join("\n")}\n\nSobre: ${noticia.titular} · La Prensa`);
});

test("(glosas) crearPostGlosa rechaza una cuarteta coja o que no rima", () => {
  assert.throws(() => crearPostGlosa({ versos: ["Trece ministerios andan hoy", ...versos.slice(1)], sobre: noticia, config, ahora, zona: "America/Panama" }), /sílabas/);
  assert.throws(() => crearPostGlosa({ versos: ["Trece ministerios cantan", ...versos.slice(1)], sobre: noticia, config, ahora, zona: "America/Panama" }), /riman/);
});

test("(glosas) cupo diario y noticias ya glosadas", () => {
  const post = crearPostGlosa({ versos, sobre: noticia, config, ahora, zona: "America/Panama", cuenta: "sinlinea" });
  assert.equal(glosasCreadasHoy([post, noticia], ahora, "America/Panama"), 1);
  assert.equal(glosasCreadasHoy([post], new Date("2026-09-27T15:00:00.000Z"), "America/Panama"), 0);
  assert.deepEqual([...noticiasGlosadas([post, { ...post, estado: "descartado" }, noticia])], [noticia.id], "una noticia glosada (aunque la glosa se descarte) no se vuelve a glosar");
});

test("(glosas) configuración: el bloque glosas es opcional; activo, porDia, horasVentana, hashtags y personaje se validan", () => {
  const c = cargarCuenta(".", "sinlinea");
  assert.doesNotThrow(() => validarCuenta({ ...c }, "sinlinea"));
  assert.doesNotThrow(() => validarCuenta({ ...c, glosas: { activo: true, porDia: 1, horasVentana: 48, hashtags: ["#Glosa"], personaje: { nombre: "La Garza María", cargo: "Comentarista del Palacio" } } }, "sinlinea"));
  assert.throws(() => validarCuenta({ ...c, glosas: { activo: "sí" } }, "sinlinea"), /glosas\.activo/);
  assert.throws(() => validarCuenta({ ...c, glosas: { activo: true, porDia: 0 } }, "sinlinea"), /glosas\.porDia/);
  assert.throws(() => validarCuenta({ ...c, glosas: { activo: true, porDia: 4 } }, "sinlinea"), /glosas\.porDia/);
  assert.throws(() => validarCuenta({ ...c, glosas: { activo: true, horasVentana: 0 } }, "sinlinea"), /glosas\.horasVentana/);
  assert.throws(() => validarCuenta({ ...c, glosas: { activo: true, personaje: { nombre: "" } } }, "sinlinea"), /glosas\.personaje\.nombre/);
  assert.throws(() => validarCuenta({ ...c, glosas: { activo: true, personaje: { nombre: "x".repeat(41) } } }, "sinlinea"), /glosas\.personaje\.nombre/);
  const efectiva = configDeCuenta(cargarGlobal("config.json"), { ...c, glosas: { activo: true } }, "sinlinea");
  assert.equal(efectiva.glosas.porDia, 1, "una glosa al día por defecto");
  assert.equal(efectiva.glosas.horasVentana, 48);
  assert.equal(efectiva.glosas.personaje.nombre, "La Garza");
  assert.equal(efectiva.rutas.personaje, "cuentas/sinlinea/garza.png", "el dibujo del personaje vive en la carpeta de la cuenta");
  const sinBloque = { ...c };
  delete sinBloque.glosas;
  const sin = configDeCuenta(cargarGlobal("config.json"), sinBloque, "sinlinea");
  assert.equal(sin.glosas.activo, false, "sin bloque, las glosas están apagadas");
});

test("(glosas) la huella de la imagen cambia con los versos; editar desde el panel exige cuarteta válida y deja la imagen por rehacer", () => {
  const post = crearPostGlosa({ versos, sobre: noticia, config, ahora, zona: "America/Panama", cuenta: "sinlinea" });
  const otra = { ...post, glosa: { ...post.glosa, versos: ["Nueve artículos vetó", "Mulino de un reglamento;", "y en la Asamblea, el lamento:", "¿quién manda aquí, tú o yo?"] } };
  assert.notEqual(hashImagen(post, 1), hashImagen(otra, 1));
  const conImagen = renderOk(post, { ruta: "public/img/x.jpg", url: "https://x/x.jpg", hash: hashImagen(post, 1), version: 1, renderizada: ahora.toISOString() }, ahora.toISOString());
  assert.equal(imagenDesactualizada(conImagen), false);
  const editado = editarTexto(conImagen, { glosa: { versos: otra.glosa.versos } }, ahora.toISOString());
  assert.deepEqual(editado.glosa.versos, otra.glosa.versos);
  assert.equal(editado.glosa.esquema, "ABBA", "el esquema se recalcula");
  assert.equal(editado.glosa.sobre.id, noticia.id, "la noticia de origen se conserva");
  assert.equal(imagenDesactualizada(editado), true);
  assert.throws(() => editarTexto(conImagen, { glosa: { versos: ["a", "b", "c", "d"] } }, ahora.toISOString()), /sílabas/);
  assert.throws(() => editarTexto({ ...conImagen, formato: "post", glosa: undefined }, { glosa: { versos } }, ahora.toISOString()), /formato glosa/);
});

test("(glosas) el formulario de la cuenta enciende las glosas y nombra al personaje sin tocar el JSON", () => {
  const c = cargarCuenta(".", "sinlinea");
  const sinGlosas = { ...c }; delete sinGlosas.glosas;
  const formulario = formularioDesdeConfig("sinlinea", sinGlosas, "");
  assert.equal(formulario.glosasActivo, false);
  const encendido = configDesdeFormulario({ ...formulario, glosasActivo: true, glosasPorDia: "2", glosasVentana: "72", glosasNombre: "La Garza María", glosasCargo: "Comentarista del Palacio", glosasHashtags: "#Panamá #Glosa" }, sinGlosas);
  assert.deepEqual(encendido.glosas, { activo: true, porDia: 2, horasVentana: 72, hashtags: ["#Panamá", "#Glosa"], personaje: { nombre: "La Garza María", cargo: "Comentarista del Palacio" } });
  assert.doesNotThrow(() => validarCuenta(encendido, "sinlinea"));
  const vuelta = formularioDesdeConfig("sinlinea", encendido, "");
  assert.equal(vuelta.glosasNombre, "La Garza María");
  assert.equal(vuelta.glosasVentana, 72);
  const apagado = configDesdeFormulario({ ...vuelta, glosasActivo: false }, encendido);
  assert.equal(apagado.glosas.activo, false, "apagarlas también se guarda");
  assert.equal(apagado.glosas.personaje.nombre, "La Garza María", "el personaje se conserva");
  assert.ok(erroresDeCuenta({ ...formulario, glosasActivo: true, glosasNombre: "" }).some((e) => /glosasNombre/.test(e)));
  assert.ok(erroresDeCuenta({ ...formulario, glosasActivo: true, glosasNombre: "x", glosasPorDia: "5" }).some((e) => /glosasPorDia/.test(e)));
});
