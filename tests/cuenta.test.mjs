// Núcleo isomorfo del panel maestro: validación de cuentas, plantilla editorial, alta/edición/archivo y estado de conexión.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  nombresSecretosSugeridos, idSugerido, normalizarUsuario, erroresDeCuenta, plantillaEditorial,
  configDesdeFormulario, formularioDesdeConfig, archivarCuenta, reactivarCuenta, estadoConexion, cuentasActivas,
  secretosExpuestos, secretosExpuestosComunes, workflowsPorCuenta,
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
  assert.deepEqual(c.instagram, { origen: "repositorio", tokenSecreto: "IG_ACCESS_TOKEN_NUEVO_MEDIO", usuarioIdSecreto: "IG_USER_ID_NUEVO_MEDIO" }, "modo actual por defecto, con los nombres sugeridos");
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
  assert.deepEqual(editada.instagram, { origen: "repositorio", ...base.instagram });
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
    assert.deepEqual(vuelta.instagram, { origen: "repositorio", ...crudo.instagram }, "las cuentas actuales siguen en modo actual salvo que declaren otro origen");
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

const ahora = new Date("2026-09-10T12:00:00Z");
const cfgX = { marca: { usuario: "@luiseskivelgolcher" }, instagram: { tokenSecreto: "IG_ACCESSTOKEN_LUISESKIVELGOLCHER", usuarioIdSecreto: "IG_USER_ID_LUISESKIVELGOLCHER" } };
const secretosX = { tokenSecreto: "IG_ACCESSTOKEN_LUISESKIVELGOLCHER", usuarioIdSecreto: "IG_USER_ID_LUISESKIVELGOLCHER" };

test("(maestro) estadoConexion: sin verificación no afirma nada sobre los secretos (sin-verificar); credenciales pendientes solo si lo dijo Probar Instagram", () => {
  const s = estadoConexion({ conexion: null, tokenInfo: null, config: cfgX, ahora });
  assert.equal(s.clave, "sin-verificar");
  assert.match(s.texto, /sin verificar/i);
  assert.doesNotMatch(s.texto, /credenciales pendientes/i);
  assert.equal(estadoConexion({ conexion: null, tokenInfo: { vence: "2026-11-07" }, config: cfgX, ahora }).clave, "pendiente", "hay datos del token pero la identidad nunca se verificó");
  const cp = estadoConexion({ conexion: { estado: "credenciales-pendientes", detalle: "falta el secreto IG_ACCESS_TOKEN_X", comprobado: "2026-09-08T19:00:00Z" }, config: cfgX, ahora });
  assert.equal(cp.clave, "credenciales-pendientes");
  assert.match(cp.texto, /2026-09-08/);
  assert.match(cp.texto, /IG_ACCESS_TOKEN_X/);
  assert.equal(estadoConexion({ conexion: { estado: "raro" }, config: cfgX, ahora }).clave, "sin-verificar", "un estado desconocido nunca se muestra como conectado");
});

test("(maestro) estadoConexion: verificada muestra la fecha de la última verificación y avisa de que un resultado pasado no garantiza nada", () => {
  const v = estadoConexion({ conexion: { estado: "verificada", usuario: "luiseskivelgolcher", comprobado: "2026-09-08T20:20:00.000Z", secretos: secretosX }, config: cfgX, ahora });
  assert.equal(v.clave, "verificada");
  assert.match(v.texto, /@luiseskivelgolcher/);
  assert.match(v.texto, /2026-09-08 20:20/);
  assert.equal(v.fecha, "2026-09-08T20:20:00.000Z");
  assert.match(v.detalle, /no garantiza/i);
  assert.equal(v.antigua, false);
  const vieja = estadoConexion({ conexion: { estado: "verificada", usuario: "luiseskivelgolcher", comprobado: "2026-08-20T10:00:00.000Z", secretos: secretosX }, config: cfgX, ahora });
  assert.equal(vieja.antigua, true, "más de 7 días: se marca como antigua");
  assert.match(vieja.texto, /hace 21 días/);
  const e = estadoConexion({ conexion: { estado: "error", detalle: "code 190", comprobado: "2026-09-08T19:35:00Z" }, config: cfgX, ahora });
  assert.equal(e.clave, "error");
  assert.match(e.texto, /code 190/);
  assert.match(e.texto, /2026-09-08 19:35/);
});

test("(maestro) estadoConexion: si cambia el usuario o el nombre de los secretos, la verificación anterior deja de valer", () => {
  const verificada = { estado: "verificada", usuario: "luiseskivelgolcher", comprobado: "2026-09-08T20:20:00.000Z", secretos: secretosX };
  const otroUsuario = estadoConexion({ conexion: verificada, config: { ...cfgX, marca: { usuario: "@otro.usuario" } }, ahora });
  assert.equal(otroUsuario.clave, "pendiente");
  assert.match(otroUsuario.texto, /usuario cambió/i);
  assert.match(otroUsuario.texto, /2026-09-08/);
  const otroSecreto = estadoConexion({ conexion: verificada, config: { ...cfgX, instagram: { ...cfgX.instagram, tokenSecreto: "IG_ACCESS_TOKEN_NUEVO" } }, ahora });
  assert.equal(otroSecreto.clave, "pendiente");
  assert.match(otroSecreto.texto, /secretos cambiaron/i);
  const invalidada = estadoConexion({ conexion: { estado: "pendiente", motivo: "cambio", cambiado: "2026-09-09T10:00:00Z", anterior: { estado: "verificada", comprobado: "2026-09-08T20:20:00.000Z" } }, config: cfgX, ahora });
  assert.equal(invalidada.clave, "pendiente");
  assert.match(invalidada.texto, /ya no vale/i);
  assert.match(invalidada.texto, /2026-09-08/);
  assert.equal(estadoConexion({ conexion: { estado: "pendiente", solicitada: "2026-09-08T20:00:00Z" }, config: cfgX, ahora }).clave, "pendiente");
});

test("(maestro) estadoConexion: si los secretos de la cuenta no llegan a los workflows, la conexión está pendiente de configuración (aunque haya verificación previa)", () => {
  const expuestos = ["IG_ACCESS_TOKEN", "IG_USER_ID", "IG_ACCESSTOKEN_LUISESKIVELGOLCHER", "IG_USER_ID_LUISESKIVELGOLCHER"];
  assert.equal(estadoConexion({ conexion: null, config: cfgX, expuestos, ahora }).clave, "sin-verificar", "sus secretos sí llegan");
  const nueva = { marca: { usuario: "@nuevomedio" }, instagram: { tokenSecreto: "IG_ACCESS_TOKEN_NUEVO_MEDIO", usuarioIdSecreto: "IG_USER_ID_NUEVO_MEDIO" } };
  const pc = estadoConexion({ conexion: null, config: nueva, expuestos, ahora });
  assert.equal(pc.clave, "pendiente-configuracion");
  assert.match(pc.texto, /pendiente de configuración/i);
  assert.match(pc.detalle, /IG_ACCESS_TOKEN_NUEVO_MEDIO/);
  assert.equal(estadoConexion({ conexion: { estado: "verificada", usuario: "nuevomedio", comprobado: "2026-09-01T00:00:00Z" }, config: nueva, expuestos, ahora }).clave, "pendiente-configuracion");
  assert.equal(estadoConexion({ conexion: null, config: nueva, expuestos: null, ahora }).clave, "sin-verificar", "sin datos de los workflows no se afirma nada");
  // Sin nombres declarados se usan los sugeridos a partir del id
  assert.equal(estadoConexion({ conexion: null, id: "prueba", config: { marca: { usuario: "@prueba.diario" } }, expuestos, ahora }).clave, "pendiente-configuracion");
});

test("(maestro) secretosExpuestos lee los nombres de secretos que un workflow pasa por env", () => {
  const yml = `
      - name: Publicar
        env:
          IG_ACCESS_TOKEN: \${{ secrets.IG_ACCESS_TOKEN }}
          IG_USER_ID: \${{ secrets.IG_USER_ID }}
          IG_ACCESSTOKEN_LUISESKIVELGOLCHER: \${{ secrets.IG_ACCESSTOKEN_LUISESKIVELGOLCHER }}
          CUENTA: \${{ inputs.cuenta }}
        run: node src/publicar.mjs
  `;
  assert.deepEqual(secretosExpuestos(yml), ["IG_ACCESSTOKEN_LUISESKIVELGOLCHER", "IG_ACCESS_TOKEN", "IG_USER_ID"]);
  assert.deepEqual(secretosExpuestos(""), []);
  assert.deepEqual(secretosExpuestosComunes([secretosExpuestos(yml), ["IG_ACCESS_TOKEN", "IG_USER_ID", "OTRO"]]), ["IG_ACCESS_TOKEN", "IG_USER_ID"]);
  assert.equal(secretosExpuestosComunes([]), null, "sin workflows leídos no se sabe nada");
});

test("(maestro) estadoConexion: un secreto actualizado después de la comprobación (mismo nombre, valor nuevo) invalida la comprobación; si no se puede saber, lo dice; si el secreto no existe en GitHub, credenciales pendientes", () => {
  const verificada = { estado: "verificada", usuario: "luiseskivelgolcher", comprobado: "2026-09-08T20:20:00.000Z", secretos: secretosX };
  const despues = { IG_ACCESSTOKEN_LUISESKIVELGOLCHER: "2026-09-09T08:00:00Z", IG_USER_ID_LUISESKIVELGOLCHER: "2026-09-08T20:18:34Z" };
  const s = estadoConexion({ conexion: verificada, config: cfgX, secretosActualizados: despues, ahora });
  assert.equal(s.clave, "pendiente");
  assert.match(s.texto, /IG_ACCESSTOKEN_LUISESKIVELGOLCHER/);
  assert.match(s.texto, /2026-09-09 08:00/);
  assert.match(s.texto, /ya no vale/);
  const error = estadoConexion({ conexion: { estado: "error", detalle: "code 190", comprobado: "2026-09-08T19:35:00Z" }, config: cfgX, secretosActualizados: despues, ahora });
  assert.equal(error.clave, "pendiente", "tras un error, un secreto nuevo también exige verificar de nuevo");
  const antes = { IG_ACCESSTOKEN_LUISESKIVELGOLCHER: "2026-09-08T20:03:05Z", IG_USER_ID_LUISESKIVELGOLCHER: "2026-09-08T20:18:34Z" };
  const v = estadoConexion({ conexion: verificada, config: cfgX, secretosActualizados: antes, ahora });
  assert.equal(v.clave, "verificada");
  assert.doesNotMatch(v.detalle, /no se pudo comprobar/i);
  const desconocido = estadoConexion({ conexion: verificada, config: cfgX, secretosActualizados: null, ahora });
  assert.equal(desconocido.clave, "verificada");
  assert.match(desconocido.detalle, /no se pudo comprobar si los secretos cambiaron/i);
  const falta = estadoConexion({ conexion: verificada, config: cfgX, secretosActualizados: { IG_ACCESSTOKEN_LUISESKIVELGOLCHER: null, IG_USER_ID_LUISESKIVELGOLCHER: "2026-09-08T20:18:34Z" }, ahora });
  assert.equal(falta.clave, "credenciales-pendientes");
  assert.match(falta.texto, /IG_ACCESSTOKEN_LUISESKIVELGOLCHER no existe en GitHub/);
});

test("(fase 2) workflowsPorCuenta detecta los workflows que construyen un job por cuenta (entonces el env ya no limita qué cuentas llegan)", () => {
  const viejo = "      env:\n          IG_ACCESS_TOKEN: ${{ secrets.IG_ACCESS_TOKEN }}\n";
  const nuevo = "      - run: node src/cuentas-activas.mjs >> \"$GITHUB_OUTPUT\"\n    environment: ${{ matrix.entorno }}\n";
  assert.equal(workflowsPorCuenta([viejo]), false);
  assert.equal(workflowsPorCuenta([nuevo]), true);
  assert.equal(workflowsPorCuenta([nuevo, viejo]), false, "basta uno antiguo para no afirmar nada");
  assert.equal(workflowsPorCuenta([]), false);
});

test("(métricas) el formulario lleva el interruptor recogerMetricas: apagado por defecto al crear, conservado al editar, separado de las automatizaciones", () => {
  const nueva = configDesdeFormulario(datos);
  assert.deepEqual(nueva.metricas, { recoger: false });
  assert.deepEqual(nueva.automatico, { generar: false, publicar: false });
  const base = { ...nueva, automatico: { generar: true, publicar: false }, metricas: { recoger: false, maxLlamadas: 80 } };
  const encendida = configDesdeFormulario({ ...datos, recogerMetricas: true }, base);
  assert.deepEqual(encendida.metricas, { recoger: true, maxLlamadas: 80 }, "conserva los límites declarados y solo cambia recoger");
  assert.deepEqual(encendida.automatico, { generar: true, publicar: false }, "no toca generación ni publicación");
  const f = formularioDesdeConfig("x", encendida, "");
  assert.equal(f.recogerMetricas, true);
  assert.equal(formularioDesdeConfig("x", { ...encendida, metricas: undefined }, "").recogerMetricas, false);
  validarCuenta(encendida, "x");
});

test("(cierre) configDesdeFormulario aplica los interruptores del formulario cuando vienen como booleanos; sin ellos conserva lo de la cuenta (o apagado al crear)", () => {
  assert.deepEqual(configDesdeFormulario(datos).automatico, { generar: false, publicar: false });
  assert.deepEqual(configDesdeFormulario({ ...datos, generar: true, publicar: false }).automatico, { generar: true, publicar: false });
  const base = { ...configDesdeFormulario(datos), automatico: { generar: true, publicar: true } };
  assert.deepEqual(configDesdeFormulario(datos, base).automatico, { generar: true, publicar: true }, "sin casillas se conserva");
  assert.deepEqual(configDesdeFormulario({ ...datos, generar: false, publicar: true }, base).automatico, { generar: false, publicar: true });
  const f = formularioDesdeConfig("x", base, "");
  assert.equal(f.generar, true); assert.equal(f.publicar, true);
});

test("(maestro) estadoConexion: «API access blocked» (code 200) es un bloqueo de Meta a la app, no un secreto malo; la guía manda confirmar la cuenta de desarrollador", () => {
  const detalle = 'la API respondió con error: message "API access blocked." · code 200 · error_subcode - · type OAuthException';
  const e = estadoConexion({ conexion: { estado: "error", detalle, comprobado: "2026-09-09T16:52:17Z" }, config: cfgX, ahora });
  assert.equal(e.clave, "error");
  assert.match(e.detalle, /Meta bloqueó/i);
  assert.match(e.detalle, /developers\.facebook\.com/);
  assert.doesNotMatch(e.detalle, /corrige el secreto/i, "no pide cambiar un secreto que no está mal");
  const otro = estadoConexion({ conexion: { estado: "error", detalle: "code 190", comprobado: "2026-09-08T19:35:00Z" }, config: cfgX, ahora });
  assert.match(otro.detalle, /corrige el secreto/i, "los demás errores conservan la guía del secreto");
});
