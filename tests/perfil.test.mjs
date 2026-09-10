import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { FORMATOS, FORMATOS_PUBLICABLES, esPublicable, formatoDe, TIPOS_AFIRMACION, ALCANCES, ALERTAS } from "../src/lib/formatos.mjs";
import { PESOS_POR_DEFECTO, actualidadDe, puntuar, validarPesos } from "../src/lib/puntuacion.mjs";
import { urlCanonica, claveTema, similitud, agruparCandidatos, esYoutube } from "../src/lib/temas.mjs";
import { validarCuenta, cargarConfiguracion } from "../src/lib/config.mjs";
import { raizConCuentas } from "./ayuda/cuentas.mjs";

const ahora = new Date("2026-09-10T15:00:00Z");
const cuentaBase = () => JSON.parse(fs.readFileSync("tests/fixtures/cuentas/prueba/config.json", "utf8"));
const perfilBase = () => ({
  nombre: "periodismo-tecnologico",
  temas: ["espionaje estatal y comercial", "Pegasus y herramientas de vigilancia", "filtraciones y exposición de datos"],
  idiomas: ["es", "en", "fr"],
  puntuacion: { pesos: { afinidad: 30, interes: 25, evidencia: 20, actualidad: 15, visual: 10 }, minimo: 60 },
  formatos: ["post", "carrusel", "reel"],
  revision: { alertas: ["fuente-unica", "acceso-parcial", "acusacion-sin-fuente", "hecho-antiguo", "evidencia-insuficiente"] },
});

test("(perfil) formatos: post, carrusel y reel existen; solo post es publicable por el publicador actual; los posts antiguos son formato post", () => {
  assert.deepEqual(FORMATOS, ["post", "carrusel", "reel"]);
  assert.deepEqual(FORMATOS_PUBLICABLES, ["post"]);
  assert.equal(esPublicable("post"), true);
  assert.equal(esPublicable("carrusel"), false);
  assert.equal(esPublicable("reel"), false);
  assert.equal(esPublicable(undefined), true, "sin formato = post");
  assert.equal(formatoDe({ titular: "x" }), "post");
  assert.equal(formatoDe({ formato: "reel" }), "reel");
  assert.deepEqual(TIPOS_AFIRMACION, ["hecho", "denuncia", "hipotesis", "opinion"]);
  assert.deepEqual(ALCANCES, ["completo", "parcial", "fragmento", "titular"]);
  assert.ok(ALERTAS.includes("acusacion-sin-fuente") && ALERTAS.includes("hecho-antiguo") && ALERTAS.includes("fuente-unica"));
});

test("(perfil) puntuación: pesos configurables que suman 100; actualidad por antigüedad; total 0-100 con componentes", () => {
  assert.deepEqual(PESOS_POR_DEFECTO, { afinidad: 30, interes: 25, evidencia: 20, actualidad: 15, visual: 10 });
  assert.deepEqual(validarPesos(PESOS_POR_DEFECTO), []);
  assert.match(validarPesos({ ...PESOS_POR_DEFECTO, visual: 20 })[0], /suman 110/);
  assert.match(validarPesos({ afinidad: 100 })[0], /falta/);
  assert.equal(actualidadDe("2026-09-10T10:00:00Z", ahora), 10, "menos de 24 h");
  assert.equal(actualidadDe("2026-09-08T20:00:00Z", ahora), 8, "menos de 48 h");
  assert.equal(actualidadDe("2026-09-07T20:00:00Z", ahora), 6, "menos de 72 h");
  assert.equal(actualidadDe("2026-09-05T15:00:00Z", ahora), 3, "menos de 7 días");
  assert.equal(actualidadDe("2026-08-01T00:00:00Z", ahora), 0, "más de 7 días");
  assert.equal(actualidadDe("no-es-fecha", ahora), 0);
  const r = puntuar({ afinidad: 10, interes: 8, evidencia: 5, visual: 10 }, { publicado: "2026-09-10T10:00:00Z", ahora, pesos: PESOS_POR_DEFECTO });
  assert.equal(r.total, 30 + 20 + 10 + 15 + 10);
  assert.deepEqual(r.componentes, { afinidad: 30, interes: 20, evidencia: 10, actualidad: 15, visual: 10 });
  const viejo = puntuar({ afinidad: 10, interes: 10, evidencia: 10, visual: 10 }, { publicado: "2026-01-01T00:00:00Z", ahora, pesos: PESOS_POR_DEFECTO });
  assert.equal(viejo.total, 85, "un hecho antiguo pierde solo la actualidad");
  const tope = puntuar({ afinidad: 99, interes: -3, evidencia: "7", visual: null }, { publicado: "2026-09-10T10:00:00Z", ahora, pesos: PESOS_POR_DEFECTO });
  assert.deepEqual(tope.componentes, { afinidad: 30, interes: 0, evidencia: 14, actualidad: 15, visual: 0 }, "los valores se acotan a 0-10");
});

test("(perfil) temas: URL canónica sin rastreo, clave de tema sin palabras vacías, similitud y agrupación de candidatos sobre el mismo hecho", () => {
  assert.equal(urlCanonica("https://www.wired.com/story/abc/?utm_source=rss&utm_medium=x#top"), "https://www.wired.com/story/abc");
  assert.equal(urlCanonica("HTTPS://Example.com/a/b/"), "https://example.com/a/b");
  assert.ok(esYoutube("https://www.youtube.com/watch?v=abc") && esYoutube("https://youtu.be/abc") && !esYoutube("https://www.wired.com/story/x"));
  const clave = claveTema("Pegasus spyware found on the phones of journalists in Mexico");
  assert.ok(clave.has("pegasus") && clave.has("spyware") && clave.has("journalist") && !clave.has("the") && !clave.has("of"), "singular y plural cuentan igual; las palabras vacías no cuentan");
  assert.ok(similitud(claveTema("Pegasus spyware found on phones of journalists"), claveTema("Journalists' phones infected with Pegasus spyware")) >= 0.5);
  assert.ok(similitud(claveTema("Pegasus spyware found on phones of journalists"), claveTema("Corridos tumbados en la calle")) < 0.2);
  const c = (extra) => ({ url: "https://a.test/1", medio: "A", titulo: "Pegasus spyware found on phones of journalists", fecha: "2026-09-10T10:00:00Z", alcance: "completo", prioridad: 1, ...extra });
  const candidatos = [
    c({ url: "https://www.youtube.com/watch?v=1", medio: "AJ+", titulo: "Journalists' phones infected with Pegasus spyware", alcance: "fragmento", prioridad: 2 }),
    c({}),
    c({ url: "https://a.test/1?utm_source=rss", medio: "A", titulo: "Pegasus spyware found on phones of journalists (updated)", fecha: "2026-09-10T12:00:00Z" }),
    c({ url: "https://b.test/2", medio: "B", titulo: "Un ciberataque deja sin luz a media ciudad durante horas", alcance: "parcial" }),
    c({ url: "https://www.youtube.com/watch?v=3", medio: "HugoDécrypte", titulo: "Corridos tumbados en la calle", alcance: "fragmento" }),
  ];
  const grupos = agruparCandidatos(candidatos);
  assert.equal(grupos.length, 3, "misma URL canónica y títulos parecidos se agrupan");
  const pegasus = grupos.find((g) => /Pegasus/.test(g.principal.titulo));
  assert.equal(pegasus.principal.url, "https://a.test/1", "el principal es el de texto completo, no el fragmento de vídeo");
  assert.equal(pegasus.referencias.length, 1, "la URL repetida no se cuenta dos veces; el vídeo queda como referencia");
  assert.equal(pegasus.referencias[0].medio, "AJ+");
  assert.equal(pegasus.apto, true);
  const ciber = grupos.find((g) => /ciberataque/.test(g.principal.titulo));
  assert.equal(ciber.apto, true, "acceso parcial basta, con alerta después");
  const corridos = grupos.find((g) => /Corridos/.test(g.principal.titulo));
  assert.equal(corridos.apto, false);
  assert.match(corridos.motivo, /fragmento/);
});

test("(perfil) la configuración de cuenta valida el bloque perfil y los campos idioma/prioridad/descargar de las fuentes", () => {
  const base = cuentaBase();
  assert.doesNotThrow(() => validarCuenta({ ...base, perfil: perfilBase() }, "prueba"));
  assert.throws(() => validarCuenta({ ...base, perfil: { ...perfilBase(), formatos: ["post", "video"] } }, "prueba"), /perfil\.formatos/);
  assert.throws(() => validarCuenta({ ...base, perfil: { ...perfilBase(), puntuacion: { pesos: { ...perfilBase().puntuacion.pesos, visual: 20 }, minimo: 60 } } }, "prueba"), /suman 110/);
  assert.throws(() => validarCuenta({ ...base, perfil: { ...perfilBase(), puntuacion: { pesos: perfilBase().puntuacion.pesos, minimo: 120 } } }, "prueba"), /perfil\.puntuacion\.minimo/);
  assert.throws(() => validarCuenta({ ...base, perfil: { ...perfilBase(), temas: [] } }, "prueba"), /perfil\.temas/);
  assert.throws(() => validarCuenta({ ...base, perfil: { ...perfilBase(), idiomas: ["klingon"] } }, "prueba"), /perfil\.idiomas/);
  assert.throws(() => validarCuenta({ ...base, perfil: { ...perfilBase(), revision: { alertas: ["rara"] } } }, "prueba"), /perfil\.revision/);
  const conFuentes = { ...base, fuentes: [{ nombre: "WIRED", tipo: "rss", url: "https://www.wired.com/feed/rss", idioma: "en", prioridad: 1, descargar: true }] };
  assert.doesNotThrow(() => validarCuenta(conFuentes, "prueba"));
  assert.throws(() => validarCuenta({ ...conFuentes, fuentes: [{ ...conFuentes.fuentes[0], idioma: "english" }] }, "prueba"), /fuentes\[0\]\.idioma/);
  assert.throws(() => validarCuenta({ ...conFuentes, fuentes: [{ ...conFuentes.fuentes[0], prioridad: 0 }] }, "prueba"), /fuentes\[0\]\.prioridad/);
  assert.throws(() => validarCuenta({ ...conFuentes, fuentes: [{ ...conFuentes.fuentes[0], descargar: "sí" }] }, "prueba"), /fuentes\[0\]\.descargar/);
  // Se conserva al cargar la configuración efectiva de la cuenta y no se hereda entre cuentas.
  const raiz = raizConCuentas({ cuentas: ["sinlinea", "prueba"], prefijo: "perfil-" });
  const ruta = path.join(raiz, "cuentas/prueba/config.json");
  fs.writeFileSync(ruta, JSON.stringify({ ...JSON.parse(fs.readFileSync(ruta, "utf8")), perfil: perfilBase() }, null, 2));
  const cfg = cargarConfiguracion(raiz);
  assert.equal(cfg.errores.length, 0);
  assert.deepEqual(cfg.cuentas.find((c) => c.cuenta === "prueba").perfil.formatos, ["post", "carrusel", "reel"]);
  assert.equal(cfg.cuentas.find((c) => c.cuenta === "sinlinea").perfil, undefined);
});
