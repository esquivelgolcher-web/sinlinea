import { test } from "node:test";
import assert from "node:assert/strict";
import { componerCaption, validarCaption, recortarCaption, normalizarHashtags, contarHashtags, LIMITES } from "../src/lib/caption.mjs";

test("componerCaption sigue el formato caption / fuente / hashtags", () => {
  const t = componerCaption({ caption: "Hola.  ", medio: "La Prensa", hashtags: ["#Panamá", "#SinLínea"] });
  assert.equal(t, "Hola.\n\nFuente: La Prensa\n\n#Panamá #SinLínea");
  assert.equal(componerCaption({ caption: "Hola.", medio: "La Prensa", hashtags: [] }), "Hola.\n\nFuente: La Prensa");
});

test("normalizarHashtags agrega #, quita espacios y duplicados", () => {
  assert.deepEqual(normalizarHashtags(["Panamá", "#Panamá", " #Sin Línea ", "", "#x"]), ["#Panamá", "#SinLínea", "#x"]);
});

test("validarCaption detecta exceso de caracteres, hashtags, menciones y líneas vacías", () => {
  assert.deepEqual(validarCaption("Bien.\n\nFuente: X"), { ok: true, errores: [] });
  const largo = validarCaption("a".repeat(LIMITES.caracteres + 1));
  assert.equal(largo.ok, false);
  assert.match(largo.errores[0], /2200/);
  const muchos = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ");
  assert.match(validarCaption(muchos).errores[0], /hashtags/);
  const menciones = Array.from({ length: 21 }, (_, i) => `@u${i}`).join(" ");
  assert.match(validarCaption(menciones).errores[0], /menciones/);
  assert.match(validarCaption("a\n\n\nb").errores[0], /vac/);
});

test("recortarCaption elimina párrafos finales y limita hashtags", () => {
  const caption = ["p1 ".repeat(300).trim(), "p2 ".repeat(300).trim(), "p3 ".repeat(300).trim()].join("\n\n");
  const hashtags = Array.from({ length: 40 }, (_, i) => `#t${i}`);
  const r = recortarCaption({ caption, medio: "La Prensa", hashtags });
  assert.equal(r.recortado, true);
  assert.equal(r.hashtags.length, LIMITES.hashtags);
  assert.ok(r.caption.startsWith("p1 p1"));
  assert.ok(!r.caption.includes("p3"));
  assert.equal(validarCaption(componerCaption({ ...r, medio: "La Prensa" })).ok, true);
  const sin = recortarCaption({ caption: "corto", medio: "X", hashtags: ["#a"] });
  assert.equal(sin.recortado, false);
});

test("contarHashtags cuenta tildes y guiones bajos", () => {
  assert.equal(contarHashtags("#Panamá #Sin_Línea texto #x"), 3);
});
