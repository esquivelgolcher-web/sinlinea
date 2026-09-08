import { test } from "node:test";
import assert from "node:assert/strict";
import { construirSystem, construirUsuario, validarSeleccion, redactar, EsquemaRedaccion, acortarTextos, escribirEscena } from "../src/lib/redactor.mjs";
import { cargarConfig } from "../src/lib/config.mjs";

const cfg = cargarConfig("config.json");
const candidatos = [
  { url: "https://p.test/1", medio: "La Prensa", seccion: "sociedad", titulo: "Bomberos piden fondos", descripcion: "d1", fecha: "2026-09-07T13:10:00.000Z", texto: "Texto uno.", origen: "rss" },
  { url: "https://e.test/2", medio: "La Estrella de Panamá", seccion: "economia", titulo: "Impuesto mínimo global", descripcion: "d2", fecha: "2026-09-07T05:00:00.000Z", texto: "Texto dos.", origen: "portada" },
];
const salida = {
  seleccion: [
    { indiceCandidato: 1, categoria: "ECONOMÍA", titular: "T2", bajada: "B2", caption: "C2", hashtags: ["#Panamá"], relevancia: 0.6, motivo: "m", escena: "Estación de bomberos" },
    { indiceCandidato: 0, categoria: "SOCIEDAD", titular: "T1", bajada: "B1", caption: "C1", hashtags: ["#Panamá"], relevancia: 0.9, motivo: "m", escena: "Estación de bomberos" },
    { indiceCandidato: 0, categoria: "SOCIEDAD", titular: "dup", bajada: "b", caption: "c", hashtags: [], relevancia: 0.1, motivo: "m", escena: "Estación de bomberos" },
    { indiceCandidato: 7, categoria: "SALUD", titular: "fuera", bajada: "b", caption: "c", hashtags: [], relevancia: 0.5, motivo: "m", escena: "Estación de bomberos" },
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
  assert.equal(params.model, cfg.claude.modelo);
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

test("el esquema exige escena y las reglas la describen", () => {
  const sin = structuredClone(salida);
  delete sin.seleccion[0].escena;
  assert.equal(EsquemaRedaccion.safeParse(sin).success, false);
  assert.match(construirSystem(""), /"escena"/);
  assert.match(construirSystem(""), /Nunca personas reales/);
});

test("las reglas fijan los límites del titular (40-55, máx. 65) y de la bajada (máx. 110)", () => {
  const sys = construirSystem("");
  assert.match(sys, /40 y 55 caracteres/);
  assert.match(sys, /65 caracteres/);
  assert.match(sys, /110 caracteres/);
  assert.match(sys, /protagonista/i);
  assert.match(sys, /sin repetir el titular/i);
});

test("las reglas de la escena piden protagonista arriba a la derecha y zona izquierda despejada", () => {
  const sys = construirSystem("");
  assert.match(sys, /tercio superior derecho/);
  assert.match(sys, /izquierda/);
});

test("acortarTextos pide a Claude titular (máx. 65) y bajada (máx. 110) y los devuelve recortados", async () => {
  let params;
  const client = { messages: { parse: async (p) => { params = p; return { parsed_output: { titular: "  Asamblea aprueba ley de arrecifes pese a veto de Mulino ", bajada: " El pleno avaló el proyecto 571. " }, stop_reason: "end_turn", usage: {} }; } } };
  const r = await acortarTextos({ client, config: cfg, titular: "Asamblea aprueba por insistencia ley de arrecifes coralinos pese a objeción de Mulino", bajada: "El pleno legislativo avaló con 50 votos a favor el proyecto 571, que refuerza la protección de arrecifes y pastos marinos, tras el rechazo presidencial.", motivo: "ocupa 4 líneas" });
  assert.deepEqual(r, { titular: "Asamblea aprueba ley de arrecifes pese a veto de Mulino", bajada: "El pleno avaló el proyecto 571." });
  assert.equal(params.model, cfg.claude.modelo);
  assert.ok(params.max_tokens >= 800, "margen para pensamiento + salida");
  assert.ok(params.output_config.format, "debe usar salida estructurada");
  assert.match(params.messages[0].content, /65 caracteres/);
  assert.match(params.messages[0].content, /110 caracteres/);
  assert.match(params.messages[0].content, /ocupa 4 líneas/);
  assert.match(params.messages[0].content, /proyecto 571/);
  assert.match(params.system, /No inventes/i);
});

test("acortarTextos lanza si Claude rechaza, devuelve titular vacío, o se pasa de 65 / 110 caracteres", async () => {
  const rechazo = { messages: { parse: async () => ({ parsed_output: null, stop_reason: "refusal", stop_details: { explanation: "no" } }) } };
  await assert.rejects(() => acortarTextos({ client: rechazo, config: cfg, titular: "t", bajada: "b", motivo: "m" }), /rechazó/);
  const largo = { messages: { parse: async () => ({ parsed_output: { titular: "X".repeat(66), bajada: "b" }, stop_reason: "end_turn" }) } };
  await assert.rejects(() => acortarTextos({ client: largo, config: cfg, titular: "t", bajada: "b", motivo: "m" }), /66 caracteres/);
  const bajadaLarga = { messages: { parse: async () => ({ parsed_output: { titular: "ok", bajada: "B".repeat(111) }, stop_reason: "end_turn" }) } };
  await assert.rejects(() => acortarTextos({ client: bajadaLarga, config: cfg, titular: "t", bajada: "b", motivo: "m" }), /111 caracteres/);
  const vacio = { messages: { parse: async () => ({ parsed_output: { titular: "  ", bajada: "b" }, stop_reason: "end_turn" }) } };
  await assert.rejects(() => acortarTextos({ client: vacio, config: cfg, titular: "t", bajada: "b", motivo: "m" }), /vacío/);
});

test("escribirEscena pide a Claude una escena a partir del titular y la bajada y la devuelve recortada", async () => {
  let params;
  const client = { messages: { parse: async (p) => { params = p; return { parsed_output: { escena: "  Flota de vehículos oficiales estacionados frente a un edificio público en Panamá, sin personas  " }, stop_reason: "end_turn" }; } } };
  const e = await escribirEscena({ client, config: cfg, titular: "Contralor frena compra de vehículos", bajada: "Pidió al MEF suspender adquisiciones." });
  assert.equal(e, "Flota de vehículos oficiales estacionados frente a un edificio público en Panamá, sin personas");
  assert.equal(params.model, cfg.claude.modelo);
  assert.ok(params.output_config.format, "salida estructurada");
  assert.match(params.messages[0].content, /Contralor frena compra/);
  assert.match(params.messages[0].content, /suspender adquisiciones/);
  assert.match(params.system, /tercio superior derecho/);
  assert.match(params.system, /Nunca personas reales/);
});

test("escribirEscena lanza si Claude rechaza o devuelve una escena vacía", async () => {
  const rechazo = { messages: { parse: async () => ({ parsed_output: null, stop_reason: "refusal", stop_details: { explanation: "no" } }) } };
  await assert.rejects(() => escribirEscena({ client: rechazo, config: cfg, titular: "t", bajada: "b" }), /rechazó/);
  const vacio = { messages: { parse: async () => ({ parsed_output: { escena: " " }, stop_reason: "end_turn" }) } };
  await assert.rejects(() => escribirEscena({ client: vacio, config: cfg, titular: "t", bajada: "b" }), /vacía/);
});

test("(M1) las reglas piden escribir en el idioma de la cuenta (español de Panamá por defecto)", () => {
  assert.match(construirSystem(""), /Escribe en español de Panamá\./);
  assert.match(construirSystem("", { idioma: "es-PA" }), /Escribe en español de Panamá\./);
  assert.match(construirSystem("", { idioma: "en" }), /Escribe en inglés\./);
  assert.match(construirSystem("", { idioma: "pt-BR" }), /Escribe en portugués de Brasil\./);
  assert.match(construirSystem("", { idioma: "xx" }), /Escribe en el idioma "xx"\./);
});

test("(M1) redactar y acortarTextos usan config.idioma en sus instrucciones", async () => {
  let params;
  const client = { messages: { parse: async (p) => { params = p; return { parsed_output: salida, stop_reason: "end_turn", usage: {} }; } } };
  await redactar({ client, config: { ...cfg, idioma: "en" }, editorialMd: "Editorial.", candidatos, recientes: [], max: 1 });
  assert.match(params.system[0].text, /Escribe en inglés/);
  const client2 = { messages: { parse: async (p) => { params = p; return { parsed_output: { titular: "Short title", bajada: "Short" }, stop_reason: "end_turn" }; } } };
  await acortarTextos({ client: client2, config: { ...cfg, idioma: "en" }, titular: "t", bajada: "b", motivo: "m" });
  assert.match(params.messages[0].content, /inglés/);
  assert.doesNotMatch(params.messages[0].content, /en español/);
});
