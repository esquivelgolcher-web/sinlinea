import { test } from "node:test";
import assert from "node:assert/strict";
import { EsquemaRedaccionPerfil, construirSystemPerfil, construirUsuarioPerfil, validarSeleccionPerfil, redactarPerfil } from "../src/lib/redactor.mjs";
import { cargarConfig } from "../src/lib/config.mjs";

const ahora = new Date("2026-09-10T15:00:00Z");
const cfg = { ...cargarConfig("config.json"), idioma: "es-PA", perfil: {
  nombre: "periodismo-tecnologico", temas: ["espionaje", "privacidad"], idiomas: ["es", "en", "fr"],
  puntuacion: { pesos: { afinidad: 30, interes: 25, evidencia: 20, actualidad: 15, visual: 10 }, minimo: 60 },
  formatos: ["post", "carrusel", "reel"], revision: { alertas: ["fuente-unica", "acceso-parcial", "acusacion-sin-fuente", "hecho-antiguo", "evidencia-insuficiente"] },
} };
const principal = { url: "https://www.wired.com/story/clearview/", canonica: "https://www.wired.com/story/clearview/", medio: "WIRED", autor: "Dhruv Mehrotra", idioma: "en", titulo: "Clearview AI Is Testing a Tool", descripcion: "d", fecha: "2026-09-10T10:00:00Z", actualizado: "2026-09-10T12:30:00Z", consultado: ahora.toISOString(), texto: "Texto del artículo.", alcance: "completo", fuentesPrimarias: ["https://www.aclu.org/x"], prioridad: 1 };
const referencia = { url: "https://www.youtube.com/watch?v=abc", medio: "AJ+", autor: "AJ+", idioma: "en", titulo: "How Pegasus spyware works", descripcion: "explainer", fecha: "2026-09-10T02:00:00Z", texto: "explainer", alcance: "fragmento", fuentesPrimarias: [], prioridad: 2 };
const grupos = [
  { principal, referencias: [referencia], apto: true, motivo: "" },
  { principal: { ...principal, url: "https://b.test/2", canonica: "https://b.test/2", medio: "B", titulo: "Ciberataque a un hospital", alcance: "parcial", fecha: "2026-08-01T00:00:00Z" }, referencias: [], apto: true, motivo: "" },
  { principal: { ...principal, url: "https://c.test/3", canonica: "https://c.test/3", medio: "C", titulo: "Otra noticia distinta" }, referencias: [], apto: true, motivo: "" },
];
const item = (extra = {}) => ({
  indiceGrupo: 0, formato: "post", categoria: "INVESTIGACIÓN", titular: "Clearview prueba una herramienta para policías", bajada: "Documentos internos", caption: "Texto de 100 palabras.", hashtags: ["#Privacidad"],
  escena: "Escena", angulo: "Qué permite la herramienta y a quién afecta", atribucion: "Según documentos revisados por WIRED (Dhruv Mehrotra)", fechaHecho: "2026-09-09",
  afirmaciones: [{ texto: "Clearview prueba la herramienta", tipo: "hecho", fuente: "https://www.wired.com/story/clearview/", contrastada: true }],
  puntuacion: { afinidad: 9, interes: 8, evidencia: 7, visual: 6 }, alertas: [], carrusel: null, reel: null, motivo: "m", ...extra,
});

test("(redactor perfil) el esquema exige formato, ángulo, atribución, afirmaciones tipadas con fuente, puntuación por ejes y admite carrusel y reel", () => {
  assert.ok(EsquemaRedaccionPerfil.safeParse({ seleccion: [item()], descartados: [] }).success);
  const conCarrusel = item({ formato: "carrusel", carrusel: [{ titulo: "Portada", texto: "t" }, { titulo: "Qué pasó", texto: "t" }, { titulo: "Cierre", texto: "t" }] });
  assert.ok(EsquemaRedaccionPerfil.safeParse({ seleccion: [conCarrusel], descartados: [] }).success);
  const conReel = item({ formato: "reel", reel: { narracion: "n", subtitulos: ["s1"], escenas: [{ segundos: 0, descripcion: "d", recurso: "r" }], recursos: ["r"] } });
  assert.ok(EsquemaRedaccionPerfil.safeParse({ seleccion: [conReel], descartados: [] }).success);
  assert.equal(EsquemaRedaccionPerfil.safeParse({ seleccion: [item({ formato: "video" })], descartados: [] }).success, false);
  assert.equal(EsquemaRedaccionPerfil.safeParse({ seleccion: [item({ afirmaciones: [{ texto: "x", tipo: "rumor", fuente: "u", contrastada: false }] })], descartados: [] }).success, false);
});

test("(redactor perfil) el system lleva la línea editorial, las reglas de atribución y formatos, y el usuario lista grupos con metadatos, referencias y alcance", () => {
  const sys = construirSystemPerfil("# Línea\nVoz propia.", { idioma: "es-PA", perfil: cfg.perfil });
  assert.match(sys, /Voz propia\./);
  for (const regla of [/descubrimos/, /revelamos/, /nadie te lo cuenta/, /hecho, denuncia, hipótesis u opinión/i, /primera vez que aparezcan/i, /tutorial/i, /fecha del hecho/i, /100.{1,3}180 palabras/, /5 y 7 diapositivas/, /85.{1,3}140 palabras/, /afinidad/i, /no es una predicción/i]) assert.match(sys, regla);
  const usr = construirUsuarioPerfil({ grupos, recientes: ["Tema previo"], max: 3, formatos: ["post", "carrusel", "reel"] });
  assert.match(usr, /\[0\] WIRED · Dhruv Mehrotra · en · publicado 2026-09-10T10:00:00Z · actualizado 2026-09-10T12:30:00Z · acceso completo/);
  assert.match(usr, /Referencias del grupo:\n\s*- AJ\+ · fragmento · How Pegasus spyware works/);
  assert.match(usr, /Fuentes primarias enlazadas:\n\s*- https:\/\/www\.aclu\.org\/x/);
  assert.match(usr, /\[1\] B .*acceso parcial/);
  assert.match(usr, /hasta 3/);
  assert.match(usr, /formatos distintos/);
  assert.match(usr, /Tema previo/);
});

test("(redactor perfil) validarSeleccionPerfil puntúa con los pesos, descarta por debajo del mínimo y añade alertas: fuente única, acceso parcial, acusación sin fuente, hecho antiguo", () => {
  const salida = { seleccion: [
    item(),
    item({ indiceGrupo: 1, titular: "Ciberataque", afirmaciones: [{ texto: "La empresa X ocultó la brecha", tipo: "denuncia", fuente: "", contrastada: false }], puntuacion: { afinidad: 9, interes: 9, evidencia: 6, visual: 6 }, fechaHecho: "2026-07-15" }),
    item({ indiceGrupo: 2, titular: "floja", puntuacion: { afinidad: 2, interes: 2, evidencia: 2, visual: 2 } }),
    item({ indiceGrupo: 0, titular: "duplicado" }),
    item({ indiceGrupo: 7 }),
  ], descartados: [] };
  const r = validarSeleccionPerfil(salida, grupos, { max: 3, perfil: cfg.perfil, ahora });
  assert.equal(r.seleccion.length, 2);
  const [a, b] = r.seleccion;
  assert.equal(a.candidato.url, principal.url);
  assert.deepEqual(a.referencias, [referencia]);
  assert.equal(a.puntuacion.total, 27 + 20 + 14 + 15 + 6);
  assert.deepEqual(a.alertas, [], "dos fuentes, acceso completo y afirmación con fuente: sin alertas");
  assert.equal(b.candidato.medio, "B");
  assert.ok(b.alertas.includes("fuente-unica") && b.alertas.includes("acceso-parcial") && b.alertas.includes("acusacion-sin-fuente") && b.alertas.includes("hecho-antiguo"), b.alertas.join(","));
  assert.equal(b.puntuacion.componentes.actualidad, 0, "publicado hace más de un mes");
  assert.ok(r.descartados.some((d) => /mínimo/.test(d.motivo)), "el de puntuación baja se descarta por el mínimo");
  assert.ok(r.descartados.some((d) => /fuera de rango|repetido/.test(d.motivo)));
  // Un grupo no apto (solo pista) nunca se selecciona aunque Claude lo devuelva.
  const soloPista = [{ principal: referencia, referencias: [], apto: false, motivo: "solo fragmento" }];
  const r2 = validarSeleccionPerfil({ seleccion: [item()], descartados: [] }, soloPista, { max: 1, perfil: cfg.perfil, ahora });
  assert.equal(r2.seleccion.length, 0);
  assert.match(r2.descartados[0].motivo, /solo fragmento/);
});

test("(redactor perfil) redactarPerfil llama a Claude con el esquema del perfil y devuelve selección puntuada y descartes", async () => {
  let params;
  const client = { messages: { parse: async (p) => { params = p; return { parsed_output: { seleccion: [item()], descartados: [{ indiceGrupo: 1, motivo: "sin evidencia" }] }, stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } }; } } };
  const r = await redactarPerfil({ client, config: cfg, editorialMd: "Editorial.", grupos, recientes: [], max: 3, ahora });
  assert.equal(params.model, cfg.claude.modelo);
  assert.match(params.system[0].text, /Editorial\./);
  assert.match(params.messages[0].content, /\[0\] WIRED/);
  assert.equal(r.seleccion.length, 1);
  assert.equal(r.seleccion[0].puntuacion.total, 82);
  assert.equal(r.descartados.length, 1);
  assert.equal(r.uso.input_tokens, 10);
});
