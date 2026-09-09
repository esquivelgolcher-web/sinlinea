// Fase 2: comprobación del Environment cuenta-<id> por la API de GitHub (solo metadatos) antes de contactar con Instagram.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { comprobarEntorno, NOMBRES_ENTORNO } from "../src/lib/entornos.mjs";
import { cuentasActivas, anotarEntornos } from "../src/cuentas-activas.mjs";
import { cargarConfiguracion } from "../src/lib/config.mjs";
import { raizConCuentas } from "./ayuda/cuentas.mjs";

const tokenRepo = "IGAAR" + "r".repeat(60);

function fetchGitHub(respuestas) {
  const llamadas = [];
  const impl = async (url, opciones = {}) => {
    llamadas.push({ url: String(url), metodo: opciones.method || "GET", auth: opciones.headers?.Authorization || "" });
    const r = respuestas.shift() || { status: 200, json: {} };
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.json };
  };
  return { impl, llamadas };
}

test("(fase 2) ambos secretos presentes en el Environment: pasa aunque sus valores coincidan con los antiguos (solo se miran metadatos, nunca valores)", async () => {
  // La API de metadatos no devuelve valores: que el token del entorno sea igual al del repositorio es irrelevante.
  const f = fetchGitHub([
    { status: 200, json: { name: "IG_ACCESS_TOKEN", created_at: "2026-09-09T10:00:00Z", updated_at: "2026-09-09T10:00:00Z" } },
    { status: 200, json: { name: "IG_USER_ID", created_at: "2026-09-09T10:00:00Z", updated_at: "2026-09-09T10:00:00Z" } },
  ]);
  const r = await comprobarEntorno({ repo: "o/r", entorno: "cuenta-prueba", token: "github_pat_" + "x".repeat(30), fetchImpl: f.impl, valoresEnJob: { IG_ACCESS_TOKEN: tokenRepo, IG_USER_ID: "1784" }, valoresRepositorio: { IG_ACCESS_TOKEN: tokenRepo } });
  assert.equal(r.ok, true, r.motivo);
  assert.deepEqual(r.presentes, ["IG_ACCESS_TOKEN", "IG_USER_ID"]);
  assert.deepEqual(r.faltan, []);
  assert.deepEqual(f.llamadas.map((l) => l.url), [
    "https://api.github.com/repos/o/r/environments/cuenta-prueba/secrets/IG_ACCESS_TOKEN",
    "https://api.github.com/repos/o/r/environments/cuenta-prueba/secrets/IG_USER_ID",
  ], "consulta el Environment exacto, secreto por secreto");
  assert.ok(f.llamadas.every((l) => l.metodo === "GET"), "solo lectura de metadatos");
  assert.equal(JSON.stringify(r).includes(tokenRepo), false, "el resultado nunca lleva valores");
});

test("(fase 2) un secreto ausente en el Environment pero existente en el repositorio: falla nombrando el secreto que falta, sin usar el del repositorio", async () => {
  const f = fetchGitHub([
    { status: 200, json: { name: "IG_ACCESS_TOKEN", updated_at: "2026-09-09T10:00:00Z" } },
    { status: 404, json: { message: "Not Found" } },
  ]);
  const r = await comprobarEntorno({ repo: "o/r", entorno: "cuenta-prueba", token: "t", fetchImpl: f.impl, valoresRepositorio: { IG_USER_ID: "1784" } });
  assert.equal(r.ok, false);
  assert.deepEqual(r.faltan, ["IG_USER_ID"]);
  assert.match(r.motivo, /IG_USER_ID/);
  assert.match(r.motivo, /cuenta-prueba/);
  assert.match(r.motivo, /no se usa/i, "deja claro que no se toma el secreto del repositorio");
  // Environment inexistente: la API responde 404 a todos los secretos
  const g = fetchGitHub([{ status: 404, json: {} }, { status: 404, json: {} }]);
  const r2 = await comprobarEntorno({ repo: "o/r", entorno: "cuenta-nueva", token: "t", fetchImpl: g.impl });
  assert.equal(r2.ok, false);
  assert.deepEqual(r2.faltan, ["IG_ACCESS_TOKEN", "IG_USER_ID"]);
  assert.match(r2.motivo, /no existe|sin secretos/i);
  assert.match(r2.motivo, /Settings → Environments/);
});

test("(fase 2) sin permiso para consultar metadatos (o sin GH_PAT): falla con un mensaje claro que nombra el permiso Environments, antes de tocar Instagram", async () => {
  const sinPermiso = fetchGitHub([{ status: 403, json: { message: "Resource not accessible by personal access token" } }]);
  const r = await comprobarEntorno({ repo: "o/r", entorno: "cuenta-prueba", token: "t", fetchImpl: sinPermiso.impl });
  assert.equal(r.ok, false);
  assert.equal(r.permiso, false);
  assert.match(r.motivo, /Environments/);
  assert.match(r.motivo, /lectura/);
  assert.match(r.motivo, /GH_PAT/);
  const sinToken = fetchGitHub([]);
  const r2 = await comprobarEntorno({ repo: "o/r", entorno: "cuenta-prueba", token: "", fetchImpl: sinToken.impl });
  assert.equal(r2.ok, false);
  assert.equal(r2.permiso, false);
  assert.match(r2.motivo, /GH_PAT/);
  assert.equal(sinToken.llamadas.length, 0, "sin token no se consulta nada");
  const caido = { impl: async () => { throw new Error("red caída"); } };
  const r3 = await comprobarEntorno({ repo: "o/r", entorno: "cuenta-prueba", token: "t", fetchImpl: caido.impl });
  assert.equal(r3.ok, false);
  assert.match(r3.motivo, /no se pudo consultar/i);
});

test("(fase 2) cuentas-activas --comprobar-entornos anota en la matriz si cada Environment está completo; el job de la cuenta falla antes de Instagram si no lo está", async () => {
  const raiz = raizConCuentas({ cuentas: ["sinlinea", "prueba"], prefijo: "entornos-" });
  const ruta = path.join(raiz, "cuentas/prueba/config.json");
  fs.writeFileSync(ruta, JSON.stringify({ ...JSON.parse(fs.readFileSync(ruta, "utf8")), instagram: { origen: "entorno" } }, null, 2));
  const { entorno } = cuentasActivas(cargarConfiguracion(raiz));
  assert.deepEqual(entorno, [{ cuenta: "prueba", entorno: "cuenta-prueba" }]);
  const completo = await anotarEntornos(entorno, { comprobar: async ({ entorno: e }) => ({ ok: true, presentes: NOMBRES_ENTORNO, faltan: [], motivo: `Environment ${e} completo`, permiso: true }) });
  assert.deepEqual(completo, [{ cuenta: "prueba", entorno: "cuenta-prueba", completo: "true", motivo: "Environment cuenta-prueba completo" }]);
  const falta = await anotarEntornos(entorno, { comprobar: async () => ({ ok: false, presentes: ["IG_ACCESS_TOKEN"], faltan: ["IG_USER_ID"], motivo: "falta IG_USER_ID", permiso: true }) });
  assert.equal(falta[0].completo, "false");
  assert.match(falta[0].motivo, /IG_USER_ID/);
  assert.equal(JSON.stringify(falta).includes("\n"), false, "una sola línea para GITHUB_OUTPUT");
  assert.deepEqual(await anotarEntornos([], { comprobar: async () => { throw new Error("no debe llamarse"); } }), []);
});
