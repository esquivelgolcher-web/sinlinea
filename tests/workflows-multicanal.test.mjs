import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parse } from "yaml";

const leer = (a) => fs.readFileSync(`.github/workflows/${a}.yml`, "utf8");
const wf = (a) => parse(leer(a));

test("(multicanal) publicar.yml: identidad git antes de publicar (el publicador sube cada intento) y guardado final aunque falle el paso", () => {
  const w = wf("publicar");
  for (const job of ["publicar-entorno", "publicar-repositorio"]) {
    const pasos = w.jobs[job].steps;
    const identidad = pasos.findIndex((s) => /identidad de git/i.test(s.name || ""));
    const publicar = pasos.findIndex((s) => /node src\/publicar\.mjs/.test(s.run || ""));
    const guardar = pasos.find((s) => /Guardar cambios/.test(s.name || ""));
    assert.ok(identidad >= 0 && identidad < publicar, `${job}: git config antes de publicar`);
    assert.equal(guardar.if, "always()", `${job}: lo que quedó sin subir se guarda también si el paso falló`);
  }
  assert.equal(w.jobs["publicar-entorno"].env.FB_PAGE_TOKEN, "${{ secrets.FB_PAGE_TOKEN }}", "el secreto de Facebook viene del Environment de la cuenta");
  assert.equal(w.jobs["publicar-repositorio"].env.FB_PAGE_TOKEN, undefined, "el modo repositorio no conoce Facebook (las redes nuevas son solo Environment)");
});

test("(multicanal) probar-destino.yml: manual, cuenta y red como nombres, solo el secreto de la red desde el Environment, guarda data/ también al fallar", () => {
  const w = wf("probar-destino");
  assert.deepEqual(Object.keys(w.on), ["workflow_dispatch"]);
  assert.deepEqual(w.on.workflow_dispatch.inputs.red.options, ["facebook"]);
  assert.equal(w.on.workflow_dispatch.inputs.cuenta.required, true);
  assert.equal(w.concurrency.group, "sinlinea");
  const lista = w.jobs.cuentas.steps.find((s) => s.id === "lista");
  assert.match(lista.run, /--red "\$RED"/);
  assert.match(lista.run, /--comprobar-entornos/);
  const job = w.jobs["probar-entorno"];
  assert.equal(job.environment, "${{ matrix.entorno }}");
  assert.deepEqual(Object.keys(job.env).filter((k) => !["CUENTA", "ENTORNO", "RED"].includes(k)), ["FB_PAGE_TOKEN"]);
  const guardar = job.steps.find((s) => /Guardar el estado/.test(s.name || ""));
  assert.equal(guardar.if, "always()");
  assert.match(guardar.run, /git add data/);
  assert.match(job.steps.find((s) => /probar-destino\.mjs/.test(s.run || "")).run, /--por-cuenta/);
  const texto = leer("probar-destino");
  assert.equal(/inputs\.token|inputs\.secreto|inputs\.code/.test(texto), false, "ningún token ni código OAuth entra por inputs");
});

test("(multicanal) los workflows de Instagram exigen los secretos de Instagram aunque su publicación esté apagada (--instagram)", () => {
  for (const a of ["probar-instagram", "renovar-token", "verificar"]) assert.match(leer(a), /--instagram --comprobar-entornos/, a);
  assert.match(leer("metricas"), /--cuenta "\$CUENTA" --instagram --comprobar-entornos/);
  assert.doesNotMatch(leer("publicar"), /--instagram/, "PUBLICAR exige solo los secretos de los destinos encendidos");
});
