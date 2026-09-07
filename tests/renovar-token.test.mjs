import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ejecutarRenovar } from "../src/renovar-token.mjs";

test("escribe token-info.json con la fecha de vencimiento y el token en temp/", async () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "tok-"));
  fs.mkdirSync(path.join(raiz, "data"));
  const ig = { refrescarToken: async () => ({ token: "NUEVO123", expiraEnSegundos: 60 * 86400 }) };
  const r = await ejecutarRenovar({ raiz, ahora: new Date("2026-09-07T15:00:00Z"), ig, log: { info: () => {} } });
  assert.equal(r.vence, "2026-11-06");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(raiz, "data/token-info.json"), "utf8")), { vence: "2026-11-06", renovado: "2026-09-07" });
  assert.equal(fs.readFileSync(path.join(raiz, "temp/nuevo-token.txt"), "utf8"), "NUEVO123");
});
