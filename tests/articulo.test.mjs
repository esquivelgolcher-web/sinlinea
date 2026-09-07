import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { extraerArticulo, parrafosDesdeHtml, textoParaClaude, descargarArticulo } from "../src/lib/articulo.mjs";

const html = fs.readFileSync("tests/fixtures/laestrella-articulo.html", "utf8");

test("extraerArticulo lee og:title (en cualquier orden de atributos), descripción, fecha y párrafos p_N", () => {
  const a = extraerArticulo(html);
  assert.equal(a.titulo, "Panamá toma distancia en la aplicación del impuesto mínimo global");
  assert.equal(a.descripcion, "El país, que hace seis años respaldó la iniciativa, ahora opta por esperar.");
  assert.equal(a.fecha, "2026-09-07T00:00:00-05:00");
  assert.equal(a.parrafos.length, 2); // p_3 es demasiado corto; el <p> del nav no es p_N
  assert.match(a.parrafos[0], /^Panamá pasó/);
});

test("parrafosDesdeHtml sin clases p_N usa todos los <p> largos", () => {
  const p = parrafosDesdeHtml("<p>Uno muy largo que supera los cuarenta caracteres sin problema.</p><p>Foto: LP</p>");
  assert.deepEqual(p, ["Uno muy largo que supera los cuarenta caracteres sin problema."]);
});

test("extraerArticulo sin metadatos devuelve cadenas vacías, no lanza", () => {
  assert.deepEqual(extraerArticulo("<html><body><p>Solo un párrafo que es suficientemente largo para contar.</p></body></html>"),
    { titulo: "", descripcion: "", fecha: "", parrafos: ["Solo un párrafo que es suficientemente largo para contar."] });
});

test("textoParaClaude une párrafos completos hasta el máximo", () => {
  const parrafos = ["a".repeat(600), "b".repeat(600), "c".repeat(600)];
  const t = textoParaClaude(parrafos, 1500);
  assert.equal(t, parrafos[0] + "\n\n" + parrafos[1]);
  assert.equal(textoParaClaude(["x".repeat(2000)], 100).length, 100);
});

test("descargarArticulo usa el fetchText inyectado", async () => {
  const a = await descargarArticulo("https://ejemplo.test/a", { fetchText: async () => html });
  assert.equal(a.parrafos.length, 2);
});
