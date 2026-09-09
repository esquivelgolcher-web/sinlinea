import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { REDES_CONEXION, SECRETOS_RED, conexionDe, destinosEncendidos, pausaGeneral, publicaAlgo, identificadorDe, nombresSecretosEntorno, erroresDeConexiones } from "../src/lib/conexiones.mjs";
import { validarCuenta, cargarConfiguracion } from "../src/lib/config.mjs";
import { leerSecretosDeRed, secretosRequeridos } from "../src/lib/secretos.mjs";
import { cuentasActivas } from "../src/cuentas-activas.mjs";
import { raizConCuentas } from "./ayuda/cuentas.mjs";

const cuentaBase = () => JSON.parse(fs.readFileSync("tests/fixtures/cuentas/prueba/config.json", "utf8"));

test("(conexiones) F1 solo conoce la conexión de Facebook, con su secreto fijo FB_PAGE_TOKEN en el Environment de la cuenta", () => {
  assert.deepEqual(REDES_CONEXION, ["facebook"]);
  assert.deepEqual(SECRETOS_RED.facebook, ["FB_PAGE_TOKEN"]);
});

test("(conexiones) los interruptores son independientes: Instagram sigue en automatico.publicar; Facebook en conexiones.facebook.publicar; la pausa general es aparte", () => {
  const soloFb = { automatico: { generar: false, publicar: false }, conexiones: { facebook: { publicar: true, pagina: "123" } } };
  assert.deepEqual(destinosEncendidos(soloFb), ["facebook"], "se puede publicar solo en Facebook con Instagram apagado");
  assert.equal(publicaAlgo(soloFb), true);
  const soloIg = { automatico: { publicar: true } };
  assert.deepEqual(destinosEncendidos(soloIg), ["instagram"]);
  assert.deepEqual(destinosEncendidos({ automatico: { publicar: false } }), []);
  assert.equal(publicaAlgo({ automatico: { publicar: false } }), false);
  const enPausa = { ...soloFb, automatico: { ...soloFb.automatico, pausa: true } };
  assert.equal(pausaGeneral(enPausa), true);
  assert.deepEqual(destinosEncendidos(enPausa), ["facebook"], "la pausa no cambia el valor de los interruptores");
  assert.equal(publicaAlgo(enPausa), false, "pero nada sale mientras dure");
  assert.deepEqual(conexionDe(soloFb, "facebook"), { publicar: true, pagina: "123" });
  assert.deepEqual(conexionDe({}, "facebook"), { publicar: false, pagina: "" }, "sin declarar: apagada");
  assert.equal(identificadorDe(soloFb, "facebook"), "123");
});

test("(conexiones) los nombres de secretos del Environment dependen de los destinos encendidos: solo se exige lo que se usa", () => {
  assert.deepEqual(nombresSecretosEntorno({ automatico: { publicar: true } }), ["IG_ACCESS_TOKEN", "IG_USER_ID"]);
  assert.deepEqual(nombresSecretosEntorno({ automatico: { publicar: false }, conexiones: { facebook: { publicar: true, pagina: "1" } } }), ["FB_PAGE_TOKEN"]);
  assert.deepEqual(nombresSecretosEntorno({ automatico: { publicar: true }, conexiones: { facebook: { publicar: true, pagina: "1" } } }), ["IG_ACCESS_TOKEN", "IG_USER_ID", "FB_PAGE_TOKEN"]);
  assert.deepEqual(nombresSecretosEntorno({ automatico: { publicar: false } }), [], "nada encendido: nada que exigir");
  assert.deepEqual(nombresSecretosEntorno({ automatico: { publicar: false } }, { redes: ["facebook"] }), ["FB_PAGE_TOKEN"], "una prueba de conexión pide los de su red aunque esté apagada");
});

test("(conexiones) la configuración valida `conexiones` y `automatico.pausa`; una conexión encendida sin identificador es inválida", () => {
  const c = cuentaBase();
  assert.doesNotThrow(() => validarCuenta({ ...c, conexiones: { facebook: { publicar: false } } }, "prueba"));
  assert.doesNotThrow(() => validarCuenta({ ...c, conexiones: { facebook: { publicar: true, pagina: "123456789" } } }, "prueba"));
  assert.doesNotThrow(() => validarCuenta({ ...c, automatico: { generar: false, publicar: false, pausa: true } }, "prueba"));
  assert.throws(() => validarCuenta({ ...c, conexiones: { facebook: { publicar: true } } }, "prueba"), /pagina/);
  assert.throws(() => validarCuenta({ ...c, conexiones: { facebook: { publicar: "sí" } } }, "prueba"), /publicar/);
  assert.throws(() => validarCuenta({ ...c, conexiones: { tiktok: { publicar: false } } }, "prueba"), /tiktok/);
  assert.throws(() => validarCuenta({ ...c, automatico: { pausa: "no" } }, "prueba"), /pausa/);
  assert.deepEqual(erroresDeConexiones({ facebook: { publicar: true, pagina: "abc" } }), ["conexiones.facebook.pagina debe ser el id numérico de la página"]);
  assert.deepEqual(erroresDeConexiones({}), []);
});

test("(conexiones) la configuración efectiva incluye `conexiones` (vacío si no se declara) y no hereda nada entre cuentas", () => {
  const raiz = raizConCuentas({ cuentas: ["sinlinea", "prueba"] });
  const rutaCfg = path.join(raiz, "cuentas", "prueba", "config.json");
  fs.writeFileSync(rutaCfg, JSON.stringify({ ...JSON.parse(fs.readFileSync(rutaCfg, "utf8")), conexiones: { facebook: { publicar: true, pagina: "42" } } }, null, 2));
  const c = cargarConfiguracion(raiz);
  assert.deepEqual(c.errores, []);
  const prueba = c.cuentas.find((x) => x.cuenta === "prueba");
  const sinlinea = c.cuentas.find((x) => x.cuenta === "sinlinea");
  assert.deepEqual(prueba.conexiones, { facebook: { publicar: true, pagina: "42" } });
  assert.deepEqual(sinlinea.conexiones, {});
  assert.notEqual(prueba.automatico.pausa, true, "sin declararla no hay pausa general");
});

test("(conexiones) leerSecretosDeRed solo lee los secretos de su red y nombra el secreto y el Environment cuando falta; nunca usa los de Instagram", () => {
  const config = { cuenta: "prueba", instagram: { origen: "entorno" }, conexiones: { facebook: { publicar: true, pagina: "42" } } };
  assert.deepEqual(leerSecretosDeRed(config, "facebook", { FB_PAGE_TOKEN: " EAAtok ", IG_ACCESS_TOKEN: "IGAAx" }), { token: "EAAtok" });
  assert.throws(() => leerSecretosDeRed(config, "facebook", { IG_ACCESS_TOKEN: "IGAAx" }), /FB_PAGE_TOKEN.*cuenta-prueba/);
  assert.throws(() => leerSecretosDeRed(config, "instagram", {}), /leerSecretos/);
  const req = secretosRequeridos({ ...config, automatico: { publicar: false } });
  const fb = req.find((r) => r.nombre === "FB_PAGE_TOKEN");
  assert.equal(fb.obligatorio, true);
  assert.match(fb.uso, /Facebook/);
  assert.equal(secretosRequeridos({ cuenta: "prueba", instagram: { origen: "entorno" } }).some((r) => r.nombre === "FB_PAGE_TOKEN"), false, "sin conexión de Facebook no se pide su secreto");
});

test("(conexiones) cuentas-activas anota los nombres de secretos que debe tener cada Environment según lo encendido", () => {
  const raiz = raizConCuentas({ cuentas: ["sinlinea", "prueba"] });
  const rutaCfg = path.join(raiz, "cuentas", "prueba", "config.json");
  const cfg = JSON.parse(fs.readFileSync(rutaCfg, "utf8"));
  fs.writeFileSync(rutaCfg, JSON.stringify({ ...cfg, instagram: { ...(cfg.instagram || {}), origen: "entorno" }, automatico: { generar: false, publicar: false }, conexiones: { facebook: { publicar: true, pagina: "42" } } }, null, 2));
  const { entorno } = cuentasActivas(cargarConfiguracion(raiz));
  const prueba = entorno.find((e) => e.cuenta === "prueba");
  assert.deepEqual(prueba.nombres, ["FB_PAGE_TOKEN"]);
  assert.equal(prueba.entorno, "cuenta-prueba");
});
