// Plantillas de imagen de un post (foto, dato, titular): modelo, cifra comprobada contra el texto, elección automática
// sin repetir la anterior, huella de la imagen, edición desde el panel y configuración por cuenta.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  PLANTILLAS, NOMBRES_PLANTILLA, LIMITES_DATO, plantillaDe, plantillasDeCuenta, erroresDeDato, datoEnTexto, elegirPlantilla,
} from "../src/lib/plantillas.mjs";
import { hashImagen, editarTexto, imagenDesactualizada } from "../src/lib/estados.mjs";
import { validarPost } from "../src/lib/posts.mjs";
import { validarCuenta, cargarCuenta } from "../src/lib/config.mjs";

const base = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));

test("(plantillas) existen foto, dato y titular; un post sin el campo es una foto", () => {
  assert.deepEqual(PLANTILLAS, ["foto", "dato", "titular"]);
  assert.equal(NOMBRES_PLANTILLA.dato, "Dato");
  assert.equal(plantillaDe({}), "foto");
  assert.equal(plantillaDe({ plantilla: "titular" }), "titular");
  assert.equal(plantillaDe({ plantilla: "rara" }), "foto");
});

test("(plantillas) por cuenta: sin marca.plantillas solo hay foto; con ella, las declaradas", () => {
  assert.deepEqual(plantillasDeCuenta({ marca: {} }), ["foto"]);
  assert.deepEqual(plantillasDeCuenta({ marca: { plantillas: ["foto", "dato", "titular"] } }), ["foto", "dato", "titular"]);
  const c = cargarCuenta(".", "sinlinea");
  assert.doesNotThrow(() => validarCuenta({ ...c, marca: { ...c.marca, plantillas: ["foto", "titular"] } }, "sinlinea"));
  assert.throws(() => validarCuenta({ ...c, marca: { ...c.marca, plantillas: ["foto", "collage"] } }, "sinlinea"), /marca\.plantillas/);
  assert.throws(() => validarCuenta({ ...c, marca: { ...c.marca, plantillas: [] } }, "sinlinea"), /marca\.plantillas/);
  assert.throws(() => validarCuenta({ ...c, marca: { ...c.marca, plantillas: ["dato"] } }, "sinlinea"), /marca\.plantillas/, "la foto siempre está: es la de reserva");
});

test("(plantillas) el dato necesita cifra corta y frase que la complete, dentro de sus límites", () => {
  assert.deepEqual(erroresDeDato({ cifra: "47%", frase: "de los hogares comió menos de 3 veces al día" }), []);
  assert.match(erroresDeDato(null)[0], /cifra/);
  assert.match(erroresDeDato({ cifra: "", frase: "algo" })[0], /cifra/);
  assert.match(erroresDeDato({ cifra: "cuarenta y siete", frase: "algo" })[0], /número/);
  assert.match(erroresDeDato({ cifra: "47%", frase: "" })[0], /frase/);
  assert.match(erroresDeDato({ cifra: "x".repeat(LIMITES_DATO.cifraMax) + "1", frase: "a" })[0], /caracteres/);
  assert.match(erroresDeDato({ cifra: "47%", frase: "a".repeat(LIMITES_DATO.fraseMax + 1) })[0], /caracteres/);
});

test("(plantillas) la cifra tiene que estar en el texto de la noticia: nada de números inventados ni redondeados", () => {
  const texto = "Una encuesta de la CCIAP revela que el 47% de los hogares comió menos de tres veces al día. Los ministerios gastaron $1.5 millones.";
  assert.equal(datoEnTexto({ cifra: "47%", frase: "x" }, [texto]), true);
  assert.equal(datoEnTexto({ cifra: "$1.5 millones", frase: "x" }, [texto]), true);
  assert.equal(datoEnTexto({ cifra: "$1,5 millones", frase: "x" }, [texto]), true, "la coma decimal y el punto valen igual");
  assert.equal(datoEnTexto({ cifra: "50%", frase: "x" }, [texto]), false, "un redondeo no está en el texto");
  assert.equal(datoEnTexto({ cifra: "$2 millones", frase: "x" }, [texto]), false);
  assert.equal(datoEnTexto({ cifra: "5,100", frase: "x" }, ["Más de 5.100 personas siguen desaparecidas"]), true);
  assert.equal(datoEnTexto({ cifra: "147%", frase: "x" }, ["el 47% de los hogares"]), false, "47 dentro de 147 no cuenta");
  assert.equal(datoEnTexto({ cifra: "$1.5 millones", frase: "x" }, ["contrataron 15 ministerios"]), false, "1.5 no es 15");
});

test("(plantillas) elección automática: dato si hay cifra comprobada; nunca la misma plantilla que el post anterior", () => {
  const todas = ["foto", "dato", "titular"];
  const dato = { cifra: "47%", frase: "de los hogares" };
  const post = (plantilla, creado) => ({ plantilla, creado });
  assert.equal(elegirPlantilla({ permitidas: ["foto"], dato, anteriores: [] }), "foto", "una cuenta sin plantillas nuevas sigue con foto");
  assert.equal(elegirPlantilla({ permitidas: todas, dato, anteriores: [] }), "dato");
  assert.equal(elegirPlantilla({ permitidas: todas, dato: null, anteriores: [] }), "foto");
  assert.equal(elegirPlantilla({ permitidas: todas, dato: null, anteriores: [post("foto", "2026-09-24T10:00:00Z")] }), "titular");
  assert.equal(elegirPlantilla({ permitidas: todas, dato, anteriores: [post("dato", "2026-09-24T10:00:00Z")] }), "foto");
  assert.equal(elegirPlantilla({ permitidas: todas, dato: null, anteriores: [post("titular", "2026-09-24T10:00:00Z")] }), "foto");
  // Cuenta el más reciente, no el primero de la lista.
  const anteriores = [post("titular", "2026-09-24T12:00:00Z"), post("foto", "2026-09-23T10:00:00Z")];
  assert.equal(elegirPlantilla({ permitidas: todas, dato: null, anteriores }), "foto");
  assert.equal(elegirPlantilla({ permitidas: ["foto", "titular"], dato, anteriores: [] }), "foto", "sin la plantilla dato permitida, la cifra no cambia nada");
  assert.equal(elegirPlantilla({ permitidas: todas, dato: null, anteriores: [{ creado: "2026-09-24T10:00:00Z" }] }), "titular", "un post antiguo sin campo es una foto");
});

test("(plantillas) la huella de la imagen: los posts antiguos no cambian; la plantilla y el dato sí la cambian", () => {
  const p = { ...base };
  assert.equal(hashImagen({ ...p, plantilla: "foto" }, 11), hashImagen(p, 11), "foto es lo de siempre: misma huella, no se redibuja nada");
  assert.notEqual(hashImagen({ ...p, plantilla: "titular" }, 1), hashImagen(p, 1));
  const conDato = { ...p, plantilla: "dato", dato: { cifra: "47%", frase: "de los hogares" } };
  assert.notEqual(hashImagen(conDato, 1), hashImagen({ ...conDato, dato: { cifra: "48%", frase: "de los hogares" } }, 1));
});

test("(plantillas) el panel cambia la plantilla y el dato; la imagen queda pendiente de redibujar", () => {
  const ahora = "2026-09-24T15:00:00.000Z";
  const imagen = { ruta: "public/img/x.jpg", url: "https://x/img/x.jpg", hash: hashImagen({ ...base, plantilla: "foto" }, 11), version: 11, renderizada: ahora };
  const post = { ...base, estado: "borrador", plantilla: "foto", imagen };
  assert.equal(imagenDesactualizada(post), false);
  const titular = editarTexto(post, { plantilla: "titular" }, ahora);
  assert.equal(titular.plantilla, "titular");
  assert.equal(imagenDesactualizada(titular), true);
  const dato = editarTexto(post, { plantilla: "dato", dato: { cifra: "47%", frase: "de los hogares comió menos de 3 veces al día" } }, ahora);
  assert.deepEqual(dato.dato, { cifra: "47%", frase: "de los hogares comió menos de 3 veces al día" });
  assert.throws(() => editarTexto(post, { plantilla: "collage" }, ahora), /plantilla/i);
  assert.throws(() => editarTexto(post, { plantilla: "dato" }, ahora), /cifra/, "la plantilla dato sin cifra no se acepta");
  assert.throws(() => editarTexto(post, { plantilla: "dato", dato: { cifra: "47%", frase: "" } }, ahora), /frase/);
});

test("(plantillas) un post con plantilla y dato es válido; valores raros no", () => {
  const ok = { ...base, plantilla: "dato", dato: { cifra: "47%", frase: "de los hogares" } };
  assert.doesNotThrow(() => validarPost(ok));
  assert.throws(() => validarPost({ ...base, plantilla: "collage" }), /plantilla/);
  assert.throws(() => validarPost({ ...base, plantilla: "dato", dato: { cifra: 47 } }), /dato/);
});
