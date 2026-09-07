import { test } from "node:test";
import assert from "node:assert/strict";
import { construirSystem, construirUsuario, validarSeleccion, redactar, EsquemaRedaccion } from "../src/lib/redactor.mjs";
import { cargarConfig } from "../src/lib/config.mjs";

const cfg = cargarConfig("config.json");
const candidatos = [
  { url: "https://p.test/1", medio: "La Prensa", seccion: "sociedad", titulo: "Bomberos piden fondos", descripcion: "d1", fecha: "2026-09-07T13:10:00.000Z", texto: "Texto uno.", origen: "rss" },
  { url: "https://e.test/2", medio: "La Estrella de Panamá", seccion: "economia", titulo: "Impuesto mínimo global", descripcion: "d2", fecha: "2026-09-07T05:00:00.000Z", texto: "Texto dos.", origen: "portada" },
];
const salida = {
  seleccion: [
    { indiceCandidato: 1, categoria: "ECONOMÍA", titular: "T2", bajada: "B2", caption: "C2", hashtags: ["#Panamá"], relevancia: 0.6, motivo: "m" },
    { indiceCandidato: 0, categoria: "SOCIEDAD", titular: "T1", bajada: "B1", caption: "C1", hashtags: ["#Panamá"], relevancia: 0.9, motivo: "m" },
    { indiceCandidato: 0, categoria: "SOCIEDAD", titular: "dup", bajada: "b", caption: "c", hashtags: [], relevancia: 0.1, motivo: "m" },
    { indiceCandidato: 7, categoria: "SALUD", titular: "fuera", bajada: "b", caption: "c", hashtags: [], relevancia: 0.5, motivo: "m" },
  ],
  descartados: [],
};

test("EsquemaRedaccion acepta la salida esperada y rechaza categorías desconocidas", () => {
  assert.ok(EsquemaRedaccion.safeParse(salida).success);
  const mala = structuredClone(salida);
  mala.seleccion[0].categoria = "CHISMES";
  assert.equal(EsquemaRedaccion.safeParse(mala).success, false);
});

test("construirSystem incluye la línea editorial y las categorías; construirUsuario lista candidatos y recientes", () => {
  const sys = construirSystem("# Mi línea\nTexto editorial.");
  assert.match(sys, /Texto editorial\./);
  assert.match(sys, /ÚLTIMA HORA/);
  assert.match(sys, /No inventes/i);
  const usr = construirUsuario({ candidatos, recientes: ["Tema ya cubierto"], max: 2 });
  assert.match(usr, /\[0\] La Prensa/);
  assert.match(usr, /Impuesto mínimo global/);
  assert.match(usr, /Tema ya cubierto/);
  assert.match(usr, /hasta 2/);
});

test("validarSeleccion descarta índices repetidos o fuera de rango, ordena por relevancia y recorta", () => {
  const sel = validarSeleccion(salida, candidatos, 2);
  assert.deepEqual(sel.map((s) => s.titular), ["T1", "T2"]);
  assert.equal(sel[0].candidato.url, "https://p.test/1");
  assert.equal(validarSeleccion(salida, candidatos, 1).length, 1);
});

test("redactar llama a messages.parse con modelo, esfuerzo, formato y caché, y devuelve la selección", async () => {
  let params;
  const client = { messages: { parse: async (p) => { params = p; return { parsed_output: salida, stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } }; } } };
  const r = await redactar({ client, config: cfg, editorialMd: "Editorial.", candidatos, recientes: [], max: 2 });
  assert.equal(params.model, "claude-opus-5");
  assert.equal(params.output_config.effort, "medium");
  assert.ok(params.output_config.format, "debe enviar output_config.format");
  assert.deepEqual(params.thinking, { type: "adaptive" });
  assert.equal(params.system[0].cache_control.type, "ephemeral");
  assert.match(params.messages[0].content, /Bomberos piden fondos/);
  assert.equal(r.seleccion.length, 2);
  assert.equal(r.uso.input_tokens, 10);
});

test("redactar lanza si Claude rechaza o no devuelve salida válida", async () => {
  const rechazo = { messages: { parse: async () => ({ parsed_output: null, stop_reason: "refusal", stop_details: { explanation: "no" } }) } };
  await assert.rejects(() => redactar({ client: rechazo, config: cfg, editorialMd: "", candidatos, recientes: [], max: 1 }), /rechazó/);
  const vacio = { messages: { parse: async () => ({ parsed_output: null, stop_reason: "end_turn" }) } };
  await assert.rejects(() => redactar({ client: vacio, config: cfg, editorialMd: "", candidatos, recientes: [], max: 1 }), /salida válida/);
});
