import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { LIMITES_RED, proponerVersion, medirVersion, versionesPropuestas } from "../src/lib/versiones.mjs";

const base = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));

test("(versiones) Instagram propone el caption de siempre (caption + fuente + hashtags) y Facebook el caption con la fuente y sin hashtags", () => {
  const ig = proponerVersion(base, "instagram");
  assert.match(ig.texto, /Fuente: La Prensa/);
  assert.match(ig.texto, /#/);
  assert.equal(ig.limite, LIMITES_RED.instagram.caracteres);
  assert.equal(ig.excede, false);
  const fb = proponerVersion(base, "facebook");
  assert.equal(fb.texto, `${base.caption.trim()}\n\nFuente: La Prensa`);
  assert.doesNotMatch(fb.texto, /#/);
  assert.equal(fb.limite, LIMITES_RED.facebook.caracteres);
  assert.equal(fb.longitud, fb.texto.length);
  assert.throws(() => proponerVersion(base, "tiktok"), /tiktok/);
});

test("(versiones) nunca se recorta: si la propuesta excede el límite se marca `excede` y el texto queda íntegro para revisarlo", () => {
  const largo = { ...base, caption: "Según OCCRP, el presunto responsable ".repeat(80) };
  const ig = proponerVersion(largo, "instagram");
  assert.equal(ig.excede, true);
  assert.match(ig.texto, /presunto responsable/);
  assert.ok(ig.longitud > ig.limite);
  assert.equal(ig.texto.includes("…"), false, "sin puntos suspensivos de recorte");
});

test("(versiones) medirVersion evalúa un texto editado por el operador con el límite de su red", () => {
  assert.deepEqual(medirVersion("Hola", "facebook"), { limite: LIMITES_RED.facebook.caracteres, longitud: 4, excede: false, errores: [] });
  const m = medirVersion("x".repeat(2201), "instagram");
  assert.equal(m.excede, true);
  assert.ok(m.errores.length >= 1);
  assert.equal(medirVersion("   ", "facebook").excede, true, "una versión vacía no vale");
});

test("(versiones) versionesPropuestas devuelve una propuesta por red pedida, en el orden pedido", () => {
  const v = versionesPropuestas(base, ["facebook", "instagram"]);
  assert.deepEqual(Object.keys(v), ["facebook", "instagram"]);
  assert.equal(v.facebook.texto, proponerVersion(base, "facebook").texto);
});
