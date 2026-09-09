import { test } from "node:test";
import assert from "node:assert/strict";
import { crearPersistenciaGit, persistenciaLocal } from "../src/lib/persistencia.mjs";

// git simulado: registra los comandos y responde según un guion { "pull --rebase": () => salida | throw }.
function gitFalso(guion = {}) {
  const comandos = [];
  const ejecutar = (args) => {
    comandos.push(args.join(" "));
    const clave = Object.keys(guion).find((k) => args.join(" ").startsWith(k));
    const r = clave ? guion[clave] : null;
    if (typeof r === "function") return r(args);
    return r ?? "";
  };
  return { ejecutar, comandos };
}
const falla = (texto) => () => { const e = new Error(texto); e.stderr = texto; throw e; };
const log = { warn: () => {} };

test("(persistencia) guardar = add + commit + push de las rutas indicadas; sin cambios no hay commit", async () => {
  const g = gitFalso({ "diff --cached --quiet": falla("hay cambios") });
  const p = crearPersistenciaGit({ ejecutar: g.ejecutar, log });
  const r = await p.guardar(["posts/a.json"], "reserva (x): a → Facebook");
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(g.comandos, ["add -- posts/a.json", "diff --cached --quiet", "commit --quiet -m reserva (x): a → Facebook", "push --quiet"]);
  const sin = gitFalso({});
  assert.deepEqual(await crearPersistenciaGit({ ejecutar: sin.ejecutar, log }).guardar(["posts/a.json"], "m"), { ok: true, sinCambios: true });
  assert.equal(sin.comandos.some((c) => c.startsWith("commit")), false);
});

test("(persistencia) un push rechazado vuelve a sincronizar y reintenta; tras tres rechazos informa del fallo", async () => {
  let pushes = 0;
  const g = gitFalso({ "diff --cached --quiet": falla("hay cambios"), "push --quiet": () => { pushes++; if (pushes < 2) throw Object.assign(new Error("rejected"), { stderr: "! [rejected] non-fast-forward" }); return ""; } });
  const r = await crearPersistenciaGit({ ejecutar: g.ejecutar, log }).guardar(["posts/a.json"], "m");
  assert.deepEqual(r, { ok: true });
  assert.equal(g.comandos.filter((c) => c.startsWith("pull --rebase --autostash")).length, 1);
  const siempre = gitFalso({ "diff --cached --quiet": falla("hay cambios"), "push --quiet": falla("! [rejected]") });
  const r2 = await crearPersistenciaGit({ ejecutar: siempre.ejecutar, log, reintentos: 3 }).guardar(["posts/a.json"], "m");
  assert.equal(r2.ok, false);
  assert.match(r2.motivo, /3 intentos/);
});

test("(persistencia) sincronizar aborta el rebase en conflicto y devuelve los archivos afectados; descartarLocal vuelve al remoto", async () => {
  const g = gitFalso({
    "pull --rebase --autostash --quiet": falla("CONFLICT (content): Merge conflict in posts/a.json"),
    "status --porcelain": () => "UU posts/a.json\n M otro.txt\n",
  });
  const p = crearPersistenciaGit({ ejecutar: g.ejecutar, log });
  const s = await p.sincronizar();
  assert.equal(s.ok, false);
  assert.equal(s.conflicto, true);
  assert.deepEqual(s.archivos, ["posts/a.json"]);
  assert.ok(g.comandos.includes("rebase --abort"));
  await p.descartarLocal();
  assert.ok(g.comandos.includes("reset --hard @{u}"));
  assert.deepEqual(await crearPersistenciaGit({ ejecutar: gitFalso({}).ejecutar, log }).sincronizar(), { ok: true });
});

test("(persistencia) la persistencia local no ejecuta git y siempre responde ok", async () => {
  const p = persistenciaLocal();
  assert.equal(p.local, true);
  assert.deepEqual(await p.sincronizar(), { ok: true });
  assert.equal((await p.guardar(["x"], "m")).ok, true);
});
