import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("package.json es ESM y define los scripts principales", () => {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.equal(pkg.type, "module");
  for (const s of ["test", "generar", "regenerar", "publicar", "build", "preview"]) {
    assert.ok(pkg.scripts[s], `falta el script ${s}`);
  }
});

test("config.json y los archivos de datos son JSON válido", () => {
  for (const f of ["config.json", "cuentas/sinlinea/config.json", "data/sinlinea/seen.json", "data/sinlinea/token-info.json"]) {
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(f, "utf8")), f);
  }
});
