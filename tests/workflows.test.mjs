import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parse } from "yaml";

const leer = (n) => fs.readFileSync(`.github/workflows/${n}.yml`, "utf8");
const wf = (n) => parse(leer(n));

test("los cuatro workflows comparten el grupo de concurrencia sinlinea", () => {
  for (const n of ["generar", "regenerar", "publicar", "renovar-token"]) {
    assert.equal(wf(n).concurrency.group, "sinlinea", n);
    assert.equal(wf(n).concurrency["cancel-in-progress"], false, n);
  }
});

test("disparadores y secretos de cada workflow", () => {
  const g = wf("generar");
  assert.equal(g.on.schedule[0].cron, "20 */3 * * *");
  assert.ok(g.on.push["paths-ignore"].includes("posts/**"));
  assert.ok(g.on.push["paths-ignore"].includes("public/ilus/**"), "generar (M3) debe ignorar public/ilus/**");
  assert.match(leer("generar"), /secrets\.ANTHROPIC_API_KEY/);
  const r = wf("regenerar");
  assert.ok(r.on.push.paths.includes("posts/**"));
  assert.equal(r.on.schedule[0].cron, "40 * * * *");
  const p = wf("publicar");
  assert.equal(p.on.schedule[0].cron, "*/30 * * * *");
  assert.match(leer("publicar"), /secrets\.IG_ACCESS_TOKEN/);
  assert.match(leer("publicar"), /secrets\.IG_USER_ID/);
  const t = wf("renovar-token");
  assert.equal(t.on.schedule[0].cron, "0 14 * * 1");
  assert.match(leer("renovar-token"), /secrets\.GH_PAT/);
  assert.match(leer("renovar-token"), /gh secret set IG_ACCESS_TOKEN/);
});

test("generar y regenerar despliegan Pages; publicar y renovar solo escriben en el repo", () => {
  for (const n of ["generar", "regenerar"]) {
    assert.match(leer(n), /actions\/deploy-pages@v4/, n);
    assert.equal(wf(n).permissions.pages, "write", n);
  }
  for (const n of ["publicar", "renovar-token"]) {
    assert.ok(!leer(n).includes("deploy-pages"), n);
    assert.equal(wf(n).permissions.contents, "write", n);
  }
});

test("el reintento de push falla el paso cuando los tres intentos fallan", () => {
  for (const n of ["generar", "regenerar", "publicar", "renovar-token"]) {
    const texto = leer(n);
    assert.match(texto, /if \[ "\$i" = 3 \]; then echo "No se pudo hacer push tras 3 intentos"; exit 1; fi/, n);
    assert.ok(!texto.includes("&& break || sleep 5"), `${n} aún tiene el bucle antiguo`);
  }
});

test("regenerar recibe ANTHROPIC_API_KEY para acortar titulares que no caben", () => {
  assert.match(leer("regenerar"), /secrets\.ANTHROPIC_API_KEY/);
});

test("generar y regenerar reciben GEMINI_API_KEY y guardan public/ilus", () => {
  for (const n of ["generar", "regenerar"]) {
    assert.match(leer(n), /secrets\.GEMINI_API_KEY/, n);
    assert.match(leer(n), /git add posts public\/img public\/ilus/, n);
  }
});

test("probar-gemini es manual, solo lee y usa el secreto GEMINI_API_KEY", () => {
  const w = wf("probar-gemini");
  assert.ok(w.on.workflow_dispatch !== undefined);
  assert.equal(w.permissions.contents, "read");
  assert.match(leer("probar-gemini"), /secrets\.GEMINI_API_KEY/);
});
