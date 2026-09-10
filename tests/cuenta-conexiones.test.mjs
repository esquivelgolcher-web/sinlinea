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

test("(panel) conexionesDeCuenta lista las redes con interruptor e identificador; el formulario guarda y lee conexiones y pausa sin inventar bloques", () => {
  assert.deepEqual(conexionesDeCuenta(cfg), [{ red: "facebook", nombre: "Facebook", publicar: false, identificador: "123" }, { red: "threads", nombre: "Threads", publicar: false, identificador: "" }]);
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

// --- F2 · Threads ---------------------------------------------------------------------------------------------------
const cfgTh = { ...cfg, conexiones: { ...cfg.conexiones, threads: { publicar: false, usuario: "555", perfil: "prueba.diario" } } };
const verificadaTh = { red: "threads", estado: "verificada", identidad: { id: "555", nombre: "@prueba.diario" }, comprobado: "2026-09-10T18:00:00.000Z", detalle: null };

test("(F2) estadoConexionRed(threads) habla de perfil, no de página: sin verificar no afirma nada; verificado muestra @usuario, id y fecha; si cambia el id deja de valer", () => {
  const sin = estadoConexionRed({ conexion: null, config: cfgTh, id: "prueba", red: "threads", ahora });
  assert.equal(sin.clave, "sin-verificar");
  assert.match(sin.texto, /^Threads: conexión sin verificar/);
  assert.match(sin.detalle, /THREADS_ACCESS_TOKEN.*cuenta-prueba/);
  const v = estadoConexionRed({ conexion: verificadaTh, config: cfgTh, id: "prueba", red: "threads", ahora });
  assert.equal(v.clave, "verificada");
  assert.match(v.texto, /Threads: perfil «@prueba\.diario» \(555\) verificado el 2026-09-10 18:00 UTC/);
  assert.doesNotMatch(v.texto, /página/);
  const otro = estadoConexionRed({ conexion: verificadaTh, config: { ...cfgTh, conexiones: { threads: { publicar: false, usuario: "999" } } }, id: "prueba", red: "threads", ahora });
  assert.equal(otro.clave, "pendiente");
  assert.match(otro.texto, /perfil cambió \(555 → 999\)/);
  assert.equal(estadoConexionRed({ conexion: verificadaTh, config: { ...cfgTh, instagram: { origen: "repositorio" } }, id: "prueba", red: "threads", ahora }).clave, "pendiente-configuracion");
});

test("(F2) requisitosPublicacionRed(threads): id del perfil declarado y verificación de Threads; Facebook e Instagram no cuentan", () => {
  assert.deepEqual(requisitosPublicacionRed({ config: cfgTh, id: "prueba", red: "threads", conexion: verificadaTh, ahora }), []);
  const sinId = requisitosPublicacionRed({ config: { ...cfgTh, conexiones: { facebook: cfg.conexiones.facebook } }, id: "prueba", red: "threads", conexion: verificadaTh, ahora });
  assert.match(sinId[0], /conexiones\.threads\.usuario/);
  assert.match(sinId[0], /perfil de Threads/);
  const sinVerificar = requisitosPublicacionRed({ config: cfgTh, id: "prueba", red: "threads", conexion: verificada, ahora });
  assert.equal(sinVerificar.length, 1, "la verificación de Facebook no vale para Threads");
  assert.match(sinVerificar[0], /verificar.*Threads/i);
});

test("(F2) guiaConexionRed(threads): caso de uso Access the Threads API, permisos threads_basic y threads_content_publish, Threads Testers, User Token Generator y THREADS_ACCESS_TOKEN; sin valores ni inputs", () => {
  const g = guiaConexionRed({ config: cfgTh, id: "prueba", red: "threads", owner: "o", repo: "r" });
  assert.equal(g.entorno, "cuenta-prueba");
  assert.deepEqual(g.secretos, ["THREADS_ACCESS_TOKEN"]);
  assert.equal(g.enlaces.probar, "https://github.com/o/r/actions/workflows/probar-destino.yml");
  assert.match(g.enlaces.meta, /developers\.facebook\.com\/apps/);
  assert.match(g.enlaces.threads, /threads\.(net|com)/);
  assert.ok(g.pasos.length >= 5);
  assert.ok(g.pasos.some((p) => /Access the Threads API/.test(p)));
  assert.ok(g.pasos.some((p) => /threads_basic/.test(p) && /threads_content_publish/.test(p)));
  assert.ok(g.pasos.some((p) => /Threads Testers/i.test(p)));
  assert.ok(g.pasos.some((p) => /User Token Generator/.test(p)));
  assert.ok(g.pasos.some((p) => /THREADS_ACCESS_TOKEN/.test(p)));
  assert.ok(g.pasos.some((p) => /red = threads/.test(p)));
  assert.ok(g.pasos.some((p) => /id numérico del perfil|id del perfil/.test(p)), "explica de dónde sale el id del perfil (Probar destino lo muestra)");
  assert.equal(g.pasos.some((p) => /input|inputs del workflow|me\/accounts|pages_/i.test(p)), false, "nada de Facebook ni tokens por inputs");
});

test("(F2) formulario de cuenta: lee y guarda threadsUsuario, threadsPerfil (sin @) y threadsPublicar sin inventar bloques; errores de validación", () => {
  const d = formularioDesdeConfig("prueba", { ...cfgTh, marca: { usuario: "@prueba", colores: {} }, fuentes: [], franjas: ["09:00"] });
  assert.equal(d.threadsPublicar, false);
  assert.equal(d.threadsUsuario, "555");
  assert.equal(d.threadsPerfil, "prueba.diario");
  const base = { nombre: "P", marca: { usuario: "@prueba", colores: {} }, fuentes: [], franjas: ["09:00"], automatico: { generar: false, publicar: false }, instagram: { origen: "entorno" } };
  const entrada = { id: "prueba", nombre: "P", usuario: "@prueba", idioma: "es-PA", zonaHoraria: "America/Panama", franjas: ["09:00"], colores: { ...COLORES_POR_DEFECTO }, fuentes: [], facebookPublicar: false, facebookPagina: "", pausa: false, threadsPublicar: false, threadsUsuario: "555", threadsPerfil: "@prueba.diario" };
  const c = configDesdeFormulario(entrada, base);
  assert.deepEqual(c.conexiones, { threads: { publicar: false, usuario: "555", perfil: "prueba.diario" } }, "sin página de Facebook no se inventa su bloque; el @ del perfil se quita");
  const conFb = configDesdeFormulario({ ...entrada, facebookPagina: "123" }, base);
  assert.deepEqual(conFb.conexiones, { facebook: { publicar: false, pagina: "123" }, threads: { publicar: false, usuario: "555", perfil: "prueba.diario" } });
  const sinTh = configDesdeFormulario({ ...entrada, threadsUsuario: "", threadsPerfil: "" }, base);
  assert.equal(sinTh.conexiones, undefined, "sin identificadores ni interruptores no hay bloque");
  const conserva = configDesdeFormulario({ ...entrada, threadsUsuario: "", threadsPerfil: "" }, { ...base, conexiones: { threads: { publicar: true, usuario: "555" } } });
  assert.deepEqual(conserva.conexiones.threads, { publicar: false }, "como en Facebook, vaciar el campo quita el id; la casilla desmarcada apaga y el bloque se conserva");
  assert.deepEqual(erroresDeCuenta({ ...entrada, threadsUsuario: "abc" }), ["threadsUsuario: el id del perfil de Threads es numérico"]);
  assert.deepEqual(erroresDeCuenta({ ...entrada, threadsPublicar: true, threadsUsuario: "" }), ["threadsUsuario: indica el id numérico del perfil de Threads para encender Threads"]);
  assert.deepEqual(erroresDeCuenta({ ...entrada, threadsPerfil: "con espacios" }), ["threadsPerfil: el nombre de usuario de Threads solo lleva letras, números, puntos o guiones bajos"]);
  assert.deepEqual(erroresDeCuenta(entrada), []);
});

test("(F2) resumenActividad incluye los errores de conexión de Threads", () => {
  const r = resumenActividad({ posts: [], cuenta: "prueba", conexion: null, conexiones: { threads: { conexion: { red: "threads", estado: "error", detalle: "code 190", comprobado: "2026-09-10T18:00:00.000Z" } } } });
  assert.equal(r.errores.length, 1);
  assert.match(r.errores[0].texto, /Threads.*code 190/);
});
