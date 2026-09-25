// Métrica de la glosa: sílabas de un verso en español (diptongos, sinalefa opcional, acento final), clave de rima
// consonante y esquema de la cuarteta (ABBA o ABAB). Es lo que decide si un verso escrito por Claude es una cuarteta
// octosílaba de verdad o se descarta.
import { test } from "node:test";
import assert from "node:assert/strict";
import { silabasDePalabra, silabasDeVerso, esOctosilabo, claveDeRima, esquemaDeRima, erroresDeGlosa, LIMITES_GLOSA } from "../src/lib/metrica.mjs";

test("(métrica) sílabas de una palabra: diptongos, hiatos, u muda de que/gui, y final", () => {
  const casos = [["trece", 2], ["ministerios", 4], ["andan", 2], ["camioneta", 4], ["alquilada", 4], ["pueblo", 2], ["pie", 1], ["que", 1], ["guerra", 2],
    ["artículos", 4], ["asamblea", 4], ["país", 2], ["aquí", 2], ["hoy", 1], ["y", 1], ["reglamento", 4], ["vetó", 2], ["pingüino", 3], ["río", 2], ["ciudad", 2]];
  for (const [p, n] of casos) assert.equal(silabasDePalabra(p), n, p);
});

test("(métrica) sílabas de un verso: rango entre aplicar todas las sinalefas y ninguna, más el ajuste del acento final", () => {
  assert.deepEqual(silabasDeVerso("Trece ministerios andan"), { min: 8, max: 8, sinalefas: 0 });
  assert.deepEqual(silabasDeVerso("en camioneta alquilada;"), { min: 8, max: 9, sinalefas: 1 });
  assert.deepEqual(silabasDeVerso("el pueblo a pie, sin más nada,"), { min: 8, max: 9, sinalefas: 1 });
  assert.deepEqual(silabasDeVerso("Nueve artículos vetó"), { min: 8, max: 9, sinalefas: 1 }, "aguda al final: una más");
  assert.deepEqual(silabasDeVerso("¿quién manda aquí, tú o yo?"), { min: 7, max: 9, sinalefas: 2 }, "monosílabo final cuenta como aguda");
  assert.deepEqual(silabasDeVerso("cantan los pájaros"), { min: 5, max: 5, sinalefas: 0 }, "esdrújula al final: una menos");
});

test("(métrica) octosílabo: vale si ocho cabe en el rango; los versos cojos no", () => {
  for (const v of ["Trece ministerios andan", "en camioneta alquilada;", "el pueblo a pie, sin más nada,", "pagando lo que ellos mandan.",
    "Nueve artículos vetó", "Mulino de un reglamento;", "y en la Asamblea, el lamento:", "¿quién manda aquí, tú o yo?"]) {
    assert.equal(esOctosilabo(v), true, v);
  }
  assert.equal(esOctosilabo("Trece ministerios andan hoy"), false, "nueve sílabas más una por acabar en aguda");
  assert.equal(esOctosilabo("El pueblo paga"), false, "cinco sílabas");
  assert.equal(esOctosilabo(""), false);
});

test("(métrica) clave de rima consonante: desde la vocal tónica hasta el final, sin tildes", () => {
  assert.equal(claveDeRima("andan"), "andan");
  assert.equal(claveDeRima("mandan."), "andan");
  assert.equal(claveDeRima("alquilada;"), "ada");
  assert.equal(claveDeRima("nada,"), "ada");
  assert.equal(claveDeRima("vetó"), "o");
  assert.equal(claveDeRima("yo?"), "o");
  assert.equal(claveDeRima("reglamento;"), "ento");
  assert.equal(claveDeRima("lamento:"), "ento");
  assert.equal(claveDeRima("país"), "is");
  assert.equal(claveDeRima("pájaro"), "ajaro");
});

test("(métrica) esquema de rima de la cuarteta: ABBA, ABAB o ninguno", () => {
  assert.equal(esquemaDeRima(["Trece ministerios andan", "en camioneta alquilada;", "el pueblo a pie, sin más nada,", "pagando lo que ellos mandan."]), "ABBA");
  assert.equal(esquemaDeRima(["Nueve artículos vetó", "Mulino de un reglamento;", "y en la Asamblea, el lamento:", "¿quién manda aquí, tú o yo?"]), "ABBA");
  assert.equal(esquemaDeRima(["sube el pan y sube el arroz", "la quincena no rindió", "y el que manda, con su voz", "dice que todo mejoró"]), "ABAB");
  assert.equal(esquemaDeRima(["uno", "dos", "tres", "cuatro"]), null);
  assert.equal(esquemaDeRima(["andan", "mandan", "andan", "mandan"]), null, "AABB no es cuarteta glosada");
});

test("(métrica) erroresDeGlosa: cuatro versos octosílabos que rimen y quepan en la imagen", () => {
  const buena = ["Trece ministerios andan", "en camioneta alquilada;", "el pueblo a pie, sin más nada,", "pagando lo que ellos mandan."];
  assert.deepEqual(erroresDeGlosa(buena), []);
  assert.match(erroresDeGlosa(["solo tres", "versos", "aquí"])[0], /cuatro versos/);
  assert.match(erroresDeGlosa([...buena.slice(0, 3), ""])[0], /verso 4 está vacío/);
  assert.match(erroresDeGlosa(["Trece ministerios andan hoy", ...buena.slice(1)])[0], /verso 1 tiene 10 sílabas/);
  assert.match(erroresDeGlosa(["Trece ministerios cantan", ...buena.slice(1)])[0], /no riman/);
  assert.match(erroresDeGlosa(["x".repeat(LIMITES_GLOSA.versoMax + 1), ...buena.slice(1)])[0], /caracteres/);
});
