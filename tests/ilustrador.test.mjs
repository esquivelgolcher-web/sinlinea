import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { crearIlustrador, extraerImagenBase64, textoDeRespuesta, guardarIlustracion, sanearMensaje } from "../src/lib/ilustrador.mjs";
import { cargarConfig } from "../src/lib/config.mjs";

const cfg = cargarConfig("config.json");
const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function fetchFalso(respuestas) {
  const llamadas = [];
  const impl = async (url, opciones) => {
    llamadas.push({ url, cabeceras: opciones.headers, cuerpo: JSON.parse(opciones.body) });
    const r = respuestas.shift();
    if (r.error) throw r.error;
    return new Response(JSON.stringify(r.json ?? {}), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  };
  return { impl, llamadas };
}
const dormir = async () => {};

test("extraerImagenBase64 entiende los tres formatos de respuesta", () => {
  assert.equal(extraerImagenBase64({ output_image: { data: "AAA" } }), "AAA");
  assert.equal(extraerImagenBase64({ interaction: { output_image: { data: "BBB" } } }), "BBB");
  assert.equal(extraerImagenBase64({ steps: [{ type: "model_output", content: [{ type: "text", text: "hola" }, { type: "image", data: "CCC" }] }] }), "CCC");
  assert.equal(extraerImagenBase64({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "DDD" } }] } }] }), "DDD");
  assert.equal(extraerImagenBase64({ output_text: "no" }), null);
  assert.equal(textoDeRespuesta({ output_text: "motivo" }), "motivo");
});

test("generar envía el estilo + escena con la clave en cabecera y devuelve un Buffer", async () => {
  const { impl, llamadas } = fetchFalso([{ json: { output_image: { data: pixel } } }]);
  const il = crearIlustrador({ apiKey: "CLAVE", config: cfg, fetchImpl: impl, dormir });
  const buf = await il.generar("Canal de Panamá al amanecer");
  assert.ok(Buffer.isBuffer(buf) && buf.length > 10);
  assert.equal(llamadas[0].url, "https://generativelanguage.googleapis.com/v1beta/interactions");
  assert.equal(llamadas[0].cabeceras["x-goog-api-key"], "CLAVE");
  assert.equal(llamadas[0].cuerpo.model, cfg.ilustraciones.modelo);
  assert.match(llamadas[0].cuerpo.input[0].text, /Fotografía editorial/);
  assert.match(llamadas[0].cuerpo.input[0].text, /Escena: Canal de Panamá al amanecer\n\nRecuerda: sin personas identificables ni rostros, sin texto, sin logotipos\.$/);
  assert.deepEqual(llamadas[0].cuerpo.response_format, { type: "image", mime_type: "image/jpeg", aspect_ratio: "4:5", image_size: cfg.ilustraciones.tamano });
  assert.ok(!JSON.stringify(llamadas[0].url).includes("CLAVE"));
});

test("(M4) la escena se recorta a 400 caracteres en el prompt", async () => {
  const larga = "x".repeat(450);
  const { impl, llamadas } = fetchFalso([{ json: { output_image: { data: pixel } } }]);
  const il = crearIlustrador({ apiKey: "K", config: cfg, fetchImpl: impl, dormir });
  await il.generar(larga);
  assert.match(llamadas[0].cuerpo.input[0].text, new RegExp(`Escena: ${"x".repeat(400)}\\n\\n`));
  assert.ok(!llamadas[0].cuerpo.input[0].text.includes("x".repeat(401)));
});

test("(M4) sanearMensaje oculta claves AIza... y recorta a 300 caracteres", () => {
  const claveFalsa = "AIza" + "a".repeat(35);
  assert.equal(sanearMensaje(`Gemini respondió 400: clave inválida ${claveFalsa}`), "Gemini respondió 400: clave inválida [clave]");
  assert.equal(sanearMensaje("x".repeat(400)).length, 300);
});

test("generar reintenta una vez ante 429 o error de red, y lanza ante 4xx o sin imagen", async () => {
  const a = fetchFalso([{ status: 429, json: { error: { message: "quota" } } }, { json: { output_image: { data: pixel } } }]);
  const il = crearIlustrador({ apiKey: "K", config: cfg, fetchImpl: a.impl, dormir });
  assert.ok(await il.generar("x"));
  assert.equal(a.llamadas.length, 2);
  const b = fetchFalso([{ error: new Error("red") }, { error: new Error("red") }]);
  await assert.rejects(() => crearIlustrador({ apiKey: "K", config: cfg, fetchImpl: b.impl, dormir }).generar("x"), /red/);
  const c = fetchFalso([{ status: 400, json: { error: { message: "Invalid model" } } }]);
  await assert.rejects(() => crearIlustrador({ apiKey: "K", config: cfg, fetchImpl: c.impl, dormir }).generar("x"), /400.*Invalid model/);
  assert.equal(c.llamadas.length, 1);
  const d = fetchFalso([{ json: { output_text: "No puedo generar esa imagen" } }]);
  await assert.rejects(() => crearIlustrador({ apiKey: "K", config: cfg, fetchImpl: d.impl, dormir }).generar("x"), /no devolvió imagen.*No puedo/);
});

test("guardarIlustracion escribe un JPEG 1080x1350", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ilus-"));
  const entrada = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#336699" } }).png().toBuffer();
  const ruta = path.join(dir, "sub", "a.jpg");
  await guardarIlustracion(entrada, ruta);
  const m = await sharp(ruta).metadata();
  assert.equal(m.format, "jpeg");
  assert.equal(m.width, 1080);
  assert.equal(m.height, 1350);
});
