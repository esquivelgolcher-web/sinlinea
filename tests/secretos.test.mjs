import { test } from "node:test";
import assert from "node:assert/strict";
import { cargarConfig } from "../src/lib/config.mjs";
import {
  ocultarSecretos, esNombreDeSecreto, nombreSecretoDeCuenta, nombresDeSecretos,
  leerSecretos, secretosRequeridos, verificarSecretos,
} from "../src/lib/secretos.mjs";

const cfg = cargarConfig("config.json");
const tokenIG = "IGAAR" + "x".repeat(60);
const claveGoogle = "AIza" + "B".repeat(35);
const claveAnthropic = "sk-ant-api03-" + "k".repeat(40);
const tokenGitHub = "github_pat_" + "g".repeat(40);

test("ocultarSecretos tapa tokens de Instagram, Google, Anthropic y GitHub y parámetros access_token", () => {
  const texto = `IG ${tokenIG}; G ${claveGoogle}; A ${claveAnthropic}; GH ${tokenGitHub} ghp_${"h".repeat(36)}; url ?access_token=abc123&x=1`;
  const limpio = ocultarSecretos(texto);
  for (const s of [tokenIG, claveGoogle, claveAnthropic, tokenGitHub, "ghp_" + "h".repeat(36), "abc123"]) {
    assert.ok(!limpio.includes(s), `no debe contener ${s.slice(0, 12)}…`);
  }
  assert.match(limpio, /\[secreto\]/);
  assert.equal(limpio.includes("&x=1"), true, "conserva el resto de la URL");
  assert.equal(ocultarSecretos("Gemini respondió 429: cuota"), "Gemini respondió 429: cuota");
  assert.equal(ocultarSecretos(null), "");
});

test("esNombreDeSecreto acepta solo mayúsculas, dígitos y guion bajo; nombreSecretoDeCuenta deriva el nombre por cuenta", () => {
  assert.equal(esNombreDeSecreto("IG_ACCESS_TOKEN"), true);
  assert.equal(esNombreDeSecreto("IG_ACCESS_TOKEN_OTRO_MEDIO"), true);
  assert.equal(esNombreDeSecreto("ig token"), false);
  assert.equal(esNombreDeSecreto("1ABC"), false);
  assert.equal(esNombreDeSecreto(""), false);
  assert.equal(nombreSecretoDeCuenta("IG_ACCESS_TOKEN", "otro-medio"), "IG_ACCESS_TOKEN_OTRO_MEDIO");
  assert.equal(nombreSecretoDeCuenta("IG_USER_ID", "Diario 24"), "IG_USER_ID_DIARIO_24");
});

test("nombresDeSecretos usa IG_ACCESS_TOKEN e IG_USER_ID por defecto y respeta la configuración", () => {
  assert.deepEqual(nombresDeSecretos({ instagram: { apiVersion: "v23.0" } }), { token: "IG_ACCESS_TOKEN", usuarioId: "IG_USER_ID" });
  assert.deepEqual(nombresDeSecretos({ instagram: { apiVersion: "v23.0", tokenSecreto: "IG_ACCESS_TOKEN_X", usuarioIdSecreto: "IG_USER_ID_X" } }), { token: "IG_ACCESS_TOKEN_X", usuarioId: "IG_USER_ID_X" });
  assert.deepEqual(nombresDeSecretos(cfg), { token: "IG_ACCESS_TOKEN", usuarioId: "IG_USER_ID" });
});

test("leerSecretos devuelve los valores del entorno y, si faltan, nombra los secretos sin revelar valores", () => {
  const env = { IG_ACCESS_TOKEN: tokenIG, IG_USER_ID: "1784" };
  assert.deepEqual(leerSecretos(cfg, env), { token: tokenIG, usuarioId: "1784" });
  assert.throws(() => leerSecretos(cfg, { IG_USER_ID: "1784" }), (err) => /IG_ACCESS_TOKEN/.test(err.message) && !err.message.includes("1784"));
  assert.throws(() => leerSecretos(cfg, { IG_ACCESS_TOKEN: tokenIG }), (err) => /IG_USER_ID/.test(err.message) && !err.message.includes(tokenIG));
  assert.throws(() => leerSecretos(cfg, { IG_ACCESS_TOKEN: "  ", IG_USER_ID: "1" }), /IG_ACCESS_TOKEN/);
});

test("secretosRequeridos lista los secretos de la cuenta con su uso; GEMINI solo es obligatorio con ilustraciones activas", () => {
  const req = secretosRequeridos(cfg);
  const porNombre = Object.fromEntries(req.map((r) => [r.nombre, r]));
  assert.equal(porNombre.ANTHROPIC_API_KEY.obligatorio, true);
  assert.equal(porNombre.IG_ACCESS_TOKEN.obligatorio, true);
  assert.equal(porNombre.IG_USER_ID.obligatorio, true);
  assert.equal(porNombre.GH_PAT.obligatorio, false);
  assert.equal(porNombre.GEMINI_API_KEY.obligatorio, cfg.ilustraciones.activo);
  const sinIlus = secretosRequeridos({ ...cfg, ilustraciones: { ...cfg.ilustraciones, activo: false } });
  assert.equal(sinIlus.find((r) => r.nombre === "GEMINI_API_KEY").obligatorio, false);
  assert.ok(req.every((r) => typeof r.uso === "string" && r.uso));
});

test("verificarSecretos separa presentes, faltantes obligatorios y opcionales, sin tocar los valores", () => {
  const req = secretosRequeridos(cfg);
  const r = verificarSecretos({ ANTHROPIC_API_KEY: claveAnthropic, IG_ACCESS_TOKEN: tokenIG, GEMINI_API_KEY: "", IG_USER_ID: "1" }, req);
  assert.deepEqual(r.faltantes, cfg.ilustraciones.activo ? ["GEMINI_API_KEY"] : []);
  assert.deepEqual(r.opcionalesFaltantes, cfg.ilustraciones.activo ? ["GH_PAT"] : ["GEMINI_API_KEY", "GH_PAT"]);
  assert.ok(r.presentes.includes("IG_ACCESS_TOKEN"));
  assert.equal(r.ok, !cfg.ilustraciones.activo);
  assert.equal(JSON.stringify(r).includes(tokenIG), false, "el resultado nunca incluye valores");
});

test("(M2 fix) los secretos de Instagram de una cuenta con publicación apagada son opcionales hasta que se active", () => {
  const apagada = { ...cfg, automatico: { generar: false, publicar: false }, instagram: { ...cfg.instagram, tokenSecreto: "IG_ACCESS_TOKEN_X", usuarioIdSecreto: "IG_USER_ID_X" } };
  const req = Object.fromEntries(secretosRequeridos(apagada).map((r) => [r.nombre, r]));
  assert.equal(req.IG_ACCESS_TOKEN_X.obligatorio, false);
  assert.equal(req.IG_USER_ID_X.obligatorio, false);
  assert.match(req.IG_ACCESS_TOKEN_X.uso, /apagada|activar/i);
  const encendida = { ...apagada, automatico: { generar: false, publicar: true } };
  assert.equal(secretosRequeridos(encendida).find((r) => r.nombre === "IG_ACCESS_TOKEN_X").obligatorio, true);
});
