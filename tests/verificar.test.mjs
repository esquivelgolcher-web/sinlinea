import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ejecutarVerificacion } from "../src/verificar.mjs";
import { raizConCuentas } from "./ayuda/cuentas.mjs";

const ahora = new Date("2026-09-08T15:00:00Z");
const tokenIG = "IGAAR" + "x".repeat(60);
const envCompleto = { ANTHROPIC_API_KEY: "sk-ant-api03-" + "k".repeat(40), GEMINI_API_KEY: "AIza" + "B".repeat(35), IG_ACCESS_TOKEN: tokenIG, IG_USER_ID: "1784", GH_PAT: "github_pat_" + "g".repeat(40) };

function raizTemporal({ tokenInfo = { vence: "2026-11-07", renovado: "2026-09-08" }, baseUrl, cuentas = ["sinlinea"] } = {}) {
  const raiz = raizConCuentas({ cuentas, global: baseUrl ? { pages: { baseUrl } } : {}, prefijo: "verificar-" });
  if (tokenInfo) for (const c of cuentas) fs.writeFileSync(path.join(raiz, "data", c, "token-info.json"), JSON.stringify(tokenInfo));
  fs.mkdirSync(path.join(raiz, "templates"), { recursive: true });
  fs.copyFileSync("templates/post.html", path.join(raiz, "templates/post.html"));
  fs.mkdirSync(path.join(raiz, "assets/fonts"), { recursive: true });
  for (const f of ["Anton-Regular.ttf", "Inter-Variable.ttf"]) fs.writeFileSync(path.join(raiz, "assets/fonts", f), "");
  return raiz;
}

test("con configuración, archivos y secretos completos la verificación pasa y no imprime valores", () => {
  const r = ejecutarVerificacion({ raiz: raizTemporal(), env: envCompleto, ahora });
  assert.equal(r.ok, true, r.lineas.join("\n"));
  const texto = r.lineas.join("\n");
  for (const v of Object.values(envCompleto)) assert.equal(texto.includes(v), false, "nunca imprime un valor");
  assert.match(texto, /IG_ACCESS_TOKEN.*OK/);
  assert.match(texto, /GH_PAT.*OK/);
  assert.match(texto, /vence el 2026-11-07/);
});

test("falta un secreto obligatorio: falla y lo nombra; GH_PAT ausente solo avisa", () => {
  const { IG_ACCESS_TOKEN, GH_PAT, ...env } = envCompleto;
  const r = ejecutarVerificacion({ raiz: raizTemporal(), env, ahora });
  assert.equal(r.ok, false);
  assert.deepEqual(r.faltantes, ["IG_ACCESS_TOKEN"]);
  assert.match(r.lineas.join("\n"), /IG_ACCESS_TOKEN.*FALTA/);
  assert.match(r.lineas.join("\n"), /GH_PAT.*(opcional|aviso)/i);
});

test("token por vencer o sin fecha produce un aviso; baseUrl sin configurar y archivos ausentes producen errores", () => {
  const pronto = ejecutarVerificacion({ raiz: raizTemporal({ tokenInfo: { vence: "2026-09-12" } }), env: envCompleto, ahora });
  assert.equal(pronto.ok, true);
  assert.match(pronto.lineas.join("\n"), /vence en 4 días/);
  const sinFecha = ejecutarVerificacion({ raiz: raizTemporal({ tokenInfo: null }), env: envCompleto, ahora });
  assert.match(sinFecha.lineas.join("\n"), /data\/sinlinea\/token-info\.json/);
  const cambiar = ejecutarVerificacion({ raiz: raizTemporal({ baseUrl: "https://CAMBIAR.github.io/sinlinea" }), env: envCompleto, ahora });
  assert.equal(cambiar.ok, false);
  assert.match(cambiar.lineas.join("\n"), /CAMBIAR/);
  const raiz = raizTemporal();
  fs.rmSync(path.join(raiz, "cuentas/sinlinea/logo.png"));
  const sinLogo = ejecutarVerificacion({ raiz, env: envCompleto, ahora });
  assert.equal(sinLogo.ok, true, "sin logo se usan las iniciales: aviso, no error");
  assert.match(sinLogo.lineas.join("\n"), /AVISO.*logo\.png/);
});

test("una configuración inválida se reporta como error en lugar de lanzar", () => {
  const raiz = raizTemporal();
  fs.writeFileSync(path.join(raiz, "config.json"), "{ \"marca\": {} }");
  const r = ejecutarVerificacion({ raiz, env: envCompleto, ahora });
  assert.equal(r.ok, false);
  assert.match(r.lineas.join("\n"), /config\.json/);
});

test("(M1) la verificación recorre todas las cuentas: secretos por cuenta, archivos por cuenta y configuración inválida", () => {
  const raiz = raizTemporal({ cuentas: ["sinlinea", "prueba"] });
  const r = ejecutarVerificacion({ raiz, env: envCompleto, ahora });
  const texto = r.lineas.join("\n");
  assert.equal(r.ok, false, "a prueba le faltan sus secretos");
  assert.deepEqual(r.faltantes, ["IG_ACCESS_TOKEN_PRUEBA", "IG_USER_ID_PRUEBA"]);
  assert.match(texto, /Cuenta sinlinea/);
  assert.match(texto, /Cuenta prueba/);
  assert.match(texto, /cuentas\/prueba\/logo\.png/, "avisa del logo ausente de prueba");
  assert.equal((texto.match(/ANTHROPIC_API_KEY/g) || []).length, 1, "los secretos compartidos se informan una sola vez");
  const g = JSON.parse(fs.readFileSync(path.join(raiz, "config.json"), "utf8"));
  g.cuentas.push("rota");
  fs.writeFileSync(path.join(raiz, "config.json"), JSON.stringify(g));
  fs.mkdirSync(path.join(raiz, "cuentas/rota"), { recursive: true });
  fs.writeFileSync(path.join(raiz, "cuentas/rota/config.json"), "{}");
  const r2 = ejecutarVerificacion({ raiz, env: envCompleto, ahora });
  assert.match(r2.lineas.join("\n"), /ERROR.*cuentas\/rota\/config\.json/);
});

test("(M1 fix) avisa de posts cuya cuenta no está declarada (huérfanos que ningún flujo procesaría)", () => {
  const raiz = raizTemporal();
  const base = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));
  fs.writeFileSync(path.join(raiz, "posts", `${base.id}.json`), JSON.stringify({ ...base, cuenta: "fantasma" }));
  const r = ejecutarVerificacion({ raiz, env: envCompleto, ahora });
  assert.match(r.lineas.join("\n"), /AVISO.*fantasma.*1 post/);
});

test("(M2 fix) una cuenta apagada sin secretos ni logo produce avisos, no errores: la verificación pasa", () => {
  const raiz = raizTemporal({ cuentas: ["sinlinea", "luiseskivelgolcher"] });
  fs.rmSync(path.join(raiz, "cuentas", "luiseskivelgolcher", "logo.png"), { force: true }); // la cuenta ya tiene logo en el repo; aquí se prueba el caso sin logo
  const r = ejecutarVerificacion({ raiz, env: envCompleto, ahora });
  const texto = r.lineas.join("\n");
  assert.equal(r.ok, true, texto);
  assert.deepEqual(r.faltantes, []);
  assert.match(texto, /AVISO.*IG_ACCESSTOKEN_LUISESKIVELGOLCHER/);
  assert.match(texto, /AVISO.*cuentas\/luiseskivelgolcher\/logo\.png.*iniciales/i);
});

test("(M2) la verificación avisa cuando una cuenta tiene la generación o la publicación automática apagadas", () => {
  const raiz = raizTemporal({ cuentas: ["sinlinea", "luiseskivelgolcher"] });
  const r = ejecutarVerificacion({ raiz, env: { ...envCompleto, IG_ACCESSTOKEN_LUISESKIVELGOLCHER: "IGAAR" + "y".repeat(60), IG_USER_ID_LUISESKIVELGOLCHER: "9" }, ahora });
  const texto = r.lineas.join("\n");
  assert.match(texto, /Cuenta luiseskivelgolcher/);
  assert.match(texto, /AVISO.*luiseskivelgolcher.*generación automática apagada/i);
  assert.match(texto, /AVISO.*luiseskivelgolcher.*publicación automática apagada/i);
  assert.doesNotMatch(texto, /AVISO.*sinlinea.*apagada/i);
});
