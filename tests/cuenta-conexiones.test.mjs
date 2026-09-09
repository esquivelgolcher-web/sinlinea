import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estadoConexionRed, requisitosPublicacionRed, guiaConexionRed, conexionesDeCuenta, configDesdeFormulario, formularioDesdeConfig, erroresDeCuenta, resumenActividad, COLORES_POR_DEFECTO,
} from "../src/lib/cuenta.mjs";

const ahora = new Date("2026-09-10T20:00:00Z");
const cfg = { nombre: "Prueba", marca: { usuario: "@prueba" }, instagram: { origen: "entorno" }, conexiones: { facebook: { publicar: false, pagina: "123" } } };
const verificada = { red: "facebook", estado: "verificada", identidad: { id: "123", nombre: "Mi página" }, comprobado: "2026-09-10T18:00:00.000Z", detalle: null };

test("(panel) estadoConexionRed: sin verificación no afirma nada; verificada muestra página y fecha; página distinta deja de valer; error y pendientes se muestran", () => {
  assert.equal(estadoConexionRed({ conexion: null, config: cfg, id: "prueba", red: "facebook", ahora }).clave, "sin-verificar");
  const v = estadoConexionRed({ conexion: verificada, config: cfg, id: "prueba", red: "facebook", ahora });
  assert.equal(v.clave, "verificada");
  assert.match(v.texto, /Mi página/);
  assert.match(v.texto, /2026-09-10 18:00/);
  assert.equal(v.antigua, false);
  const otra = estadoConexionRed({ conexion: verificada, config: { ...cfg, conexiones: { facebook: { publicar: false, pagina: "999" } } }, id: "prueba", red: "facebook", ahora });
  assert.equal(otra.clave, "pendiente");
  assert.match(otra.texto, /página cambió/i);
  const err = estadoConexionRed({ conexion: { ...verificada, estado: "error", detalle: "code 190" }, config: cfg, id: "prueba", red: "facebook", ahora });
  assert.equal(err.clave, "error");
  assert.match(err.texto, /code 190/);
  const cp = estadoConexionRed({ conexion: { red: "facebook", estado: "credenciales-pendientes", detalle: "Faltan FB_PAGE_TOKEN", comprobado: "2026-09-10T18:00:00.000Z" }, config: cfg, id: "prueba", red: "facebook", ahora });
  assert.equal(cp.clave, "credenciales-pendientes");
  const pend = estadoConexionRed({ conexion: { red: "facebook", estado: "pendiente", solicitada: "2026-09-10T19:00:00.000Z" }, config: cfg, id: "prueba", red: "facebook", ahora });
  assert.equal(pend.clave, "pendiente");
  const repo = estadoConexionRed({ conexion: verificada, config: { ...cfg, instagram: { origen: "repositorio" } }, id: "prueba", red: "facebook", ahora });
  assert.equal(repo.clave, "pendiente-configuracion", "las redes nuevas solo existen en modo Environment");
  const vieja = estadoConexionRed({ conexion: { ...verificada, comprobado: "2026-08-01T00:00:00.000Z" }, config: cfg, id: "prueba", red: "facebook", ahora });
  assert.equal(vieja.antigua, true);
});

test("(panel) requisitosPublicacionRed: solo se enciende Facebook con identidad verificada de la página configurada", () => {
  assert.deepEqual(requisitosPublicacionRed({ config: cfg, id: "prueba", red: "facebook", conexion: verificada, ahora }), []);
  const sin = requisitosPublicacionRed({ config: cfg, id: "prueba", red: "facebook", conexion: null, ahora });
  assert.equal(sin.length, 1);
  assert.match(sin[0], /verificar/i);
  assert.match(requisitosPublicacionRed({ config: { ...cfg, conexiones: {} }, id: "prueba", red: "facebook", conexion: verificada, ahora })[0], /pagina/);
  assert.match(requisitosPublicacionRed({ config: { ...cfg, archivada: true }, id: "prueba", red: "facebook", conexion: verificada, ahora })[0], /archivada/);
});

test("(panel) guiaConexionRed(facebook): pasos en Meta y GitHub con nombres exactos y enlaces, sin valores", () => {
  const g = guiaConexionRed({ config: cfg, id: "prueba", red: "facebook", owner: "o", repo: "r" });
  assert.equal(g.entorno, "cuenta-prueba");
  assert.deepEqual(g.secretos, ["FB_PAGE_TOKEN"]);
  assert.equal(g.enlaces.entorno, "https://github.com/o/r/settings/environments");
  assert.equal(g.enlaces.probar, "https://github.com/o/r/actions/workflows/probar-destino.yml");
  assert.match(g.enlaces.explorador, /developers\.facebook\.com\/tools\/explorer/);
  assert.match(g.enlaces.depurador, /developers\.facebook\.com\/tools\/debug\/accesstoken/);
  assert.ok(g.pasos.length >= 5);
  assert.ok(g.pasos.some((p) => /pages_manage_posts/.test(p)));
  assert.ok(g.pasos.some((p) => /me\/accounts/.test(p)));
  assert.ok(g.pasos.some((p) => /FB_PAGE_TOKEN/.test(p)));
  assert.equal(g.pasos.some((p) => /input|inputs del workflow/i.test(p)), false, "ningún token pasa por inputs de workflow");
});

test("(panel) conexionesDeCuenta lista las redes de F1 con interruptor e identificador; el formulario guarda y lee conexiones y pausa sin inventar bloques", () => {
  assert.deepEqual(conexionesDeCuenta(cfg), [{ red: "facebook", nombre: "Facebook", publicar: false, identificador: "123" }]);
  const d = formularioDesdeConfig("prueba", { ...cfg, automatico: { generar: false, publicar: false, pausa: true }, marca: { usuario: "@prueba", colores: {} }, fuentes: [], franjas: ["09:00"] });
  assert.equal(d.facebookPublicar, false);
  assert.equal(d.facebookPagina, "123");
  assert.equal(d.pausa, true);
  const base = { nombre: "P", marca: { usuario: "@prueba", colores: {} }, fuentes: [], franjas: ["09:00"], automatico: { generar: false, publicar: false }, instagram: { origen: "entorno" } };
  const entrada = { id: "prueba", nombre: "P", usuario: "@prueba", idioma: "es-PA", zonaHoraria: "America/Panama", franjas: ["09:00"], colores: { ...COLORES_POR_DEFECTO }, fuentes: [], facebookPublicar: false, facebookPagina: "123", pausa: false };
  const c = configDesdeFormulario(entrada, base);
  assert.deepEqual(c.conexiones, { facebook: { publicar: false, pagina: "123" } });
  assert.equal(c.automatico.pausa, undefined, "pausa en false no se escribe");
  const enPausa = configDesdeFormulario({ ...entrada, pausa: true }, base);
  assert.equal(enPausa.automatico.pausa, true);
  const sinFb = configDesdeFormulario({ ...entrada, facebookPagina: "", facebookPublicar: false }, base);
  assert.equal(sinFb.conexiones, undefined, "sin página ni interruptor no se inventa el bloque");
  assert.deepEqual(erroresDeCuenta({ ...entrada, facebookPagina: "abc" }), ["facebookPagina: el id de la página de Facebook es numérico"]);
  assert.deepEqual(erroresDeCuenta({ ...entrada, facebookPublicar: true, facebookPagina: "" }), ["facebookPagina: indica el id numérico de la página para encender Facebook"]);
});

test("(panel) resumenActividad incluye los errores de conexión de las redes nuevas", () => {
  const r = resumenActividad({ posts: [], cuenta: "prueba", conexion: null, conexiones: { facebook: { conexion: { red: "facebook", estado: "error", detalle: "code 190", comprobado: "2026-09-10T18:00:00.000Z" } } } });
  assert.equal(r.errores.length, 1);
  assert.match(r.errores[0].texto, /Facebook.*code 190/);
});
