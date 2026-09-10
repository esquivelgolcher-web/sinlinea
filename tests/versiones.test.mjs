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

import { longitudRed } from "../src/lib/versiones.mjs";

test("(versiones F2) Threads: 500 caracteres; las letras y acentos cuentan uno, los emojis por sus bytes UTF-8", () => {
  assert.equal(LIMITES_RED.threads.caracteres, 500);
  assert.equal(longitudRed("hola", "threads"), 4);
  assert.equal(longitudRed("canción", "threads"), 7, "los acentos cuentan como un carácter");
  assert.equal(longitudRed("hola 😀", "threads"), 9, "el emoji cuenta 4 bytes");
  assert.equal(longitudRed("hola 😀", "facebook"), "hola 😀".length, "en las demás redes se mide como hasta ahora");
  const m = medirVersion("a".repeat(497) + "😀", "threads");
  assert.equal(m.longitud, 501);
  assert.equal(m.excede, true);
  assert.match(m.errores[0], /501.*500/);
});

test("(versiones F2) Threads propone caption + fuente si cabe; si no, titular, bajada y «Según <medio> (<fecha>)»; y si tampoco cabe, marca excede sin recortar", () => {
  const corta = { ...base, caption: "Caption breve." };
  const v = proponerVersion(corta, "threads");
  assert.equal(v.texto, "Caption breve.\n\nFuente: La Prensa");
  assert.equal(v.excede, false);
  const larga = { ...base, caption: "x".repeat(520), fuente: { ...base.fuente, publicado: "2026-09-08T17:30:00.000Z" } };
  const v2 = proponerVersion(larga, "threads");
  assert.equal(v2.excede, false);
  assert.ok(v2.texto.startsWith(base.titular), "empieza por el titular");
  assert.match(v2.texto, /Según La Prensa \(8 de septiembre de 2026\)/);
  assert.ok(v2.texto.includes(base.bajada), "incluye la bajada íntegra");
  assert.equal(v2.texto.includes("…"), false, "sin puntos suspensivos de recorte");
  const imposible = { ...larga, titular: "t".repeat(60), bajada: "b".repeat(100) + " " + "c".repeat(400) };
  const v3 = proponerVersion(imposible, "threads");
  assert.equal(v3.excede, true);
  assert.match(v3.texto, /x{520}/, "la propuesta que excede conserva el caption íntegro para editarlo");
});
