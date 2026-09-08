import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ejecutarVerificacion } from "../src/verificar.mjs";

const ahora = new Date("2026-09-08T15:00:00Z");
const tokenIG = "IGAAR" + "x".repeat(60);
const envCompleto = { ANTHROPIC_API_KEY: "sk-ant-api03-" + "k".repeat(40), GEMINI_API_KEY: "AIza" + "B".repeat(35), IG_ACCESS_TOKEN: tokenIG, IG_USER_ID: "1784", GH_PAT: "github_pat_" + "g".repeat(40) };

function raizTemporal({ tokenInfo = { vence: "2026-11-07", renovado: "2026-09-08" }, baseUrl } = {}) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "verificar-"));
  for (const d of ["data", "prompts", "assets/fonts", "templates", "posts"]) fs.mkdirSync(path.join(raiz, d), { recursive: true });
  let cfg = fs.readFileSync("config.json", "utf8");
  if (baseUrl) cfg = cfg.replace(/"baseUrl":\s*"[^"]*"/, `"baseUrl": "${baseUrl}"`);
  fs.writeFileSync(path.join(raiz, "config.json"), cfg);
  if (tokenInfo) fs.writeFileSync(path.join(raiz, "data/token-info.json"), JSON.stringify(tokenInfo));
  fs.copyFileSync("prompts/editorial.md", path.join(raiz, "prompts/editorial.md"));
  fs.copyFileSync("templates/post.html", path.join(raiz, "templates/post.html"));
  fs.writeFileSync(path.join(raiz, "assets/logo.png"), "");
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
  assert.match(sinFecha.lineas.join("\n"), /token-info\.json/);
  const cambiar = ejecutarVerificacion({ raiz: raizTemporal({ baseUrl: "https://CAMBIAR.github.io/sinlinea" }), env: envCompleto, ahora });
  assert.equal(cambiar.ok, false);
  assert.match(cambiar.lineas.join("\n"), /CAMBIAR/);
  const raiz = raizTemporal();
  fs.rmSync(path.join(raiz, "assets/logo.png"));
  const sinLogo = ejecutarVerificacion({ raiz, env: envCompleto, ahora });
  assert.equal(sinLogo.ok, false);
  assert.match(sinLogo.lineas.join("\n"), /logo\.png/);
});

test("una configuración inválida se reporta como error en lugar de lanzar", () => {
  const raiz = raizTemporal();
  fs.writeFileSync(path.join(raiz, "config.json"), "{ \"marca\": {} }");
  const r = ejecutarVerificacion({ raiz, env: envCompleto, ahora });
  assert.equal(r.ok, false);
  assert.match(r.lineas.join("\n"), /config\.json/);
});
