// Núcleo isomorfo del panel maestro: validación de cuentas, plantilla editorial, alta/edición/archivo y estado de conexión.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  nombresSecretosSugeridos, idSugerido, normalizarUsuario, erroresDeCuenta, plantillaEditorial,
  configDesdeFormulario, formularioDesdeConfig, archivarCuenta, reactivarCuenta, estadoConexion, cuentasActivas,
} from "../src/lib/cuenta.mjs";
import { nombreSecretoDeCuenta } from "../src/lib/secretos.mjs";
import { validarCuenta, cargarConfiguracion } from "../src/lib/config.mjs";

const datos = {
  id: "nuevo-medio", nombre: "Nuevo Medio", usuario: "@nuevomedio", lema: "", idioma: "es-PA", zonaHoraria: "America/Panama",
  temas: ["Economía local", "Transparencia"], tono: "Claro y directo",
  fuentes: [{ nombre: "La Prensa", tipo: "rss", url: "https://www.prensa.com/feed" }],
  franjas: ["08:00", "18:00"],
  colores: { principal: "#112233", acento: "#445566", oscuro: "#000000", claro: "#FFFFFF" },
  logoForma: "cuadrado", logoTamano: 100, ilustracionesActivo: true, estiloIlustracion: "Estilo sobrio",
};

test("(maestro) los nombres de secretos sugeridos siguen la convención IG_ACCESS_TOKEN_<ID> y coinciden con secretos.mjs", () => {
  assert.deepEqual(nombresSecretosSugeridos("nuevo-medio"), { tokenSecreto: "IG_ACCESS_TOKEN_NUEVO_MEDIO", usuarioIdSecreto: "IG_USER_ID_NUEVO_MEDIO" });
  assert.equal(nombresSecretosSugeridos("nuevo-medio").tokenSecreto, nombreSecretoDeCuenta("IG_ACCESS_TOKEN", "nuevo-medio"));
});

test("(maestro) idSugerido y normalizarUsuario limpian lo que escribe el operador", () => {
  assert.equal(idSugerido("@Nuevo.Medio_PA"), "nuevo-medio-pa");
  assert.equal(idSugerido("  Sin Línea  "), "sin-linea");
  assert.equal(idSugerido("---"), "");
  assert.equal(normalizarUsuario(" nuevomedio "), "@nuevomedio");
  assert.equal(normalizarUsuario("@@x"), "@x");
});

test("(maestro) erroresDeCuenta acepta datos completos y nombra cada campo inválido", () => {
  assert.deepEqual(erroresDeCuenta(datos, { idsExistentes: ["sinlinea"] }), []);
  const e = erroresDeCuenta({
    ...datos, id: "Nuevo Medio", nombre: "", usuario: "x", idioma: "espanol", franjas: ["25:00", "08:00", "08:00"],
    colores: { ...datos.colores, acento: "rojo" }, fuentes: [{ nombre: "", tipo: "web", url: "ftp://x" }], zonaHoraria: "Marte/Base", logoTamano: 10,
  }, { idsExistentes: ["sinlinea"] });
  for (const campo of ["id", "nombre", "usuario", "idioma", "franjas", "colores", "fuentes", "zonaHoraria", "logoTamano"]) {
    assert.ok(e.some((m) => m.includes(campo)), `falta el error de ${campo}: ${e.join(" | ")}`);
  }
  assert.ok(erroresDeCuenta(datos, { idsExistentes: ["nuevo-medio"] }).some((m) => /ya existe/.test(m)), "id repetido");
  assert.deepEqual(erroresDeCuenta(datos, { idsExistentes: ["nuevo-medio"], editando: true }), [], "al editar, el propio id no cuenta como repetido");
  assert.deepEqual(erroresDeCuenta({ ...datos, fuentes: [] }), [], "sin fuentes es válido porque la generación empieza apagada");
  assert.ok(erroresDeCuenta({ ...datos, fuentes: [{ nombre: "Portada", tipo: "portada", url: "https://x.com/" }] }).some((m) => /patr/.test(m)), "portada sin patrón");
});

test("(maestro) plantillaEditorial produce una línea editorial con temas, tono, idioma y las reglas fijas", () => {
  const md = plantillaEditorial(datos);
  assert.match(md, /^# Línea editorial de @nuevomedio/);
  assert.match(md, /- Economía local/);
  assert.match(md, /- Transparencia/);
  assert.match(md, /Claro y directo/);
  assert.match(md, /Español \(Panamá\)/);
  assert.match(md, /no se inventan/i);
  assert.match(md, /fuente/i);
});

test("(maestro) configDesdeFormulario crea una cuenta apagada y sin conexión, con los nombres de secretos sugeridos, y pasa validarCuenta", () => {
  const c = configDesdeFormulario(datos);
  assert.deepEqual(c.automatico, { generar: false, publicar: false });
  assert.equal(c.archivada, undefined);
  assert.deepEqual(c.instagram, { tokenSecreto: "IG_ACCESS_TOKEN_NUEVO_MEDIO", usuarioIdSecreto: "IG_USER_ID_NUEVO_MEDIO" });
  assert.equal(c.marca.usuario, "@nuevomedio");
  assert.equal(c.marca.logoForma, "cuadrado");
  assert.equal(c.marca.logoTamano, 100);
  assert.deepEqual(c.marca.colores, datos.colores);
  assert.deepEqual(c.editorial, { temas: datos.temas, tono: datos.tono });
  assert.equal(c.ilustraciones.activo, true);
  assert.equal(c.ilustraciones.estilo, "Estilo sobrio");
  assert.equal(c.ilustraciones.rotulo, "");
  assert.equal(c.zonaHoraria, "America/Panama");
  assert.doesNotThrow(() => validarCuenta(c, "nuevo-medio"));
  // Editar conserva lo que el formulario no toca: cupos, automatico, archivada y secretos ya declarados.
  const base = { ...c, automatico: { generar: true, publicar: false }, generar: { ...c.generar, maxPorCorrida: 3 }, instagram: { tokenSecreto: "IG_ACCESSTOKEN_X", usuarioIdSecreto: "IG_USER_ID_X" } };
  const editada = configDesdeFormulario({ ...datos, nombre: "Otro nombre" }, base);
  assert.equal(editada.nombre, "Otro nombre");
  assert.deepEqual(editada.automatico, base.automatico);
  assert.equal(editada.generar.maxPorCorrida, 3);
  assert.deepEqual(editada.instagram, base.instagram);
  assert.doesNotThrow(() => validarCuenta(editada, "nuevo-medio"));
});

test("(maestro) formularioDesdeConfig y configDesdeFormulario van y vuelven para las cuentas reales del repositorio", () => {
  const conf = cargarConfiguracion(".");
  for (const c of conf.cuentas) {
    const crudo = JSON.parse(fs.readFileSync(`cuentas/${c.cuenta}/config.json`, "utf8"));
    const f = formularioDesdeConfig(c.cuenta, crudo, "# editorial");
    assert.equal(f.id, c.cuenta);
    assert.equal(f.usuario, crudo.marca.usuario);
    assert.equal(f.editorialMd, "# editorial");
    const vuelta = configDesdeFormulario(f, crudo);
    assert.equal(vuelta.nombre, crudo.nombre);
    assert.deepEqual(vuelta.fuentes, crudo.fuentes);
    assert.deepEqual(vuelta.franjas, crudo.franjas);
    assert.deepEqual(vuelta.automatico, crudo.automatico);
    assert.deepEqual(vuelta.instagram, crudo.instagram);
    assert.equal(vuelta.marca.usuario, crudo.marca.usuario);
    assert.equal(vuelta.ilustraciones.estilo, crudo.ilustraciones.estilo);
    assert.equal(vuelta.ilustraciones.rotulo, crudo.ilustraciones.rotulo);
    assert.doesNotThrow(() => validarCuenta(vuelta, c.cuenta));
  }
});

test("(maestro) archivarCuenta detiene las automatizaciones y conserva el resto; reactivarCuenta las deja apagadas", () => {
  const c = { ...configDesdeFormulario(datos), automatico: { generar: true, publicar: true } };
  const a = archivarCuenta(c, "2026-09-08T21:00:00.000Z");
  assert.equal(a.archivada, true);
  assert.equal(a.archivadaEn, "2026-09-08T21:00:00.000Z");
  assert.deepEqual(a.automatico, { generar: false, publicar: false });
  assert.equal(a.nombre, c.nombre);
  assert.deepEqual(a.fuentes, c.fuentes);
  assert.doesNotThrow(() => validarCuenta(a, "nuevo-medio"));
  const r = reactivarCuenta(a);
  assert.equal(r.archivada, false);
  assert.equal(r.archivadaEn, undefined);
  assert.deepEqual(r.automatico, { generar: false, publicar: false }, "reactivar no enciende nada por sí solo");
  assert.deepEqual(cuentasActivas([{ cuenta: "a" }, { cuenta: "b", archivada: true }]).map((x) => x.cuenta), ["a"]);
});

test("(maestro) estadoConexion distingue credenciales pendientes, pendiente de verificación, verificada y error", () => {
  assert.equal(estadoConexion({ conexion: null, tokenInfo: null }).clave, "credenciales-pendientes");
  assert.equal(estadoConexion({ conexion: null, tokenInfo: { vence: "2026-11-07" } }).clave, "pendiente", "hay datos del token pero la identidad nunca se verificó");
  assert.equal(estadoConexion({ conexion: { estado: "pendiente", solicitada: "2026-09-08T20:00:00Z" } }).clave, "pendiente");
  const v = estadoConexion({ conexion: { estado: "verificada", usuario: "luiseskivelgolcher", comprobado: "2026-09-08" } });
  assert.equal(v.clave, "verificada");
  assert.match(v.texto, /@luiseskivelgolcher/);
  assert.match(v.texto, /2026-09-08/);
  const e = estadoConexion({ conexion: { estado: "error", detalle: "code 190", comprobado: "2026-09-08" } });
  assert.equal(e.clave, "error");
  assert.match(e.texto, /code 190/);
  assert.equal(estadoConexion({ conexion: { estado: "credenciales-pendientes", detalle: "falta el secreto IG_ACCESS_TOKEN_X" } }).clave, "credenciales-pendientes");
  assert.equal(estadoConexion({ conexion: { estado: "raro" } }).clave, "credenciales-pendientes", "un estado desconocido nunca se muestra como conectado");
});
