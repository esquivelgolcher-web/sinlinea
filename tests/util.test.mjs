import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeEntities, stripCdata, cleanText, escapeHtml, sha1short, slugify } from "../src/lib/util.mjs";

test("decodeEntities convierte entidades con nombre, decimales y hex", () => {
  assert.equal(decodeEntities("Panam&aacute; &amp; &#241; &#x00BF;"), "Panamá & ñ ¿");
});

test("stripCdata y cleanText dejan texto plano sin HTML ni espacios dobles", () => {
  assert.equal(stripCdata("<![CDATA[hola]]>"), "hola");
  assert.equal(cleanText("<![CDATA[<p>Hola   <b>mundo</b>&nbsp;</p>]]>"), "Hola mundo");
  assert.equal(cleanText("&lt;p&gt;doble escape&lt;/p&gt;"), "doble escape");
});

test("escapeHtml escapa los cinco caracteres peligrosos", () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
});

test("sha1short es estable y respeta la longitud", () => {
  assert.equal(sha1short("hola"), sha1short("hola"));
  assert.equal(sha1short("hola", 6).length, 6);
});

test("slugify quita tildes, símbolos y limita el largo", () => {
  assert.equal(slugify("La Estrella de Panamá"), "la-estrella-de-panama");
  assert.equal(slugify("¡Hola!  Mundo -- 2026"), "hola-mundo-2026");
  assert.equal(slugify("a".repeat(100), 10), "aaaaaaaaaa");
  assert.equal(slugify("   "), "x");
});
