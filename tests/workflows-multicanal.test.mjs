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
  assert.equal(w.jobs["publicar-entorno"].env.THREADS_ACCESS_TOKEN, "${{ secrets.THREADS_ACCESS_TOKEN }}", "el de Threads también");
  assert.equal(w.jobs["publicar-repositorio"].env.FB_PAGE_TOKEN, undefined, "el modo repositorio no conoce Facebook (las redes nuevas son solo Environment)");
  assert.equal(w.jobs["publicar-repositorio"].env.THREADS_ACCESS_TOKEN, undefined);
});

test("(multicanal) probar-destino.yml: manual, cuenta y red como nombres, solo el secreto de la red desde el Environment, guarda data/ también al fallar", () => {
  const w = wf("probar-destino");
  assert.deepEqual(Object.keys(w.on), ["workflow_dispatch"]);
  assert.deepEqual(w.on.workflow_dispatch.inputs.red.options, ["facebook", "threads"]);
  assert.equal(w.on.workflow_dispatch.inputs.cuenta.required, true);
  assert.equal(w.concurrency.group, "sinlinea");
  const lista = w.jobs.cuentas.steps.find((s) => s.id === "lista");
  assert.match(lista.run, /--red "\$RED"/);
  assert.match(lista.run, /--comprobar-entornos/);
  const job = w.jobs["probar-entorno"];
  assert.equal(job.environment, "${{ matrix.entorno }}");
  assert.deepEqual(Object.keys(job.env).filter((k) => !["CUENTA", "ENTORNO", "RED"].includes(k)), ["FB_PAGE_TOKEN", "THREADS_ACCESS_TOKEN"], "solo los secretos de las redes nuevas; el script usa el de la red pedida");
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

test("(F2) renovar-token.yml: el job por Environment recibe THREADS_ACCESS_TOKEN y guarda el token renovado de Threads en el mismo Environment; el modo repositorio no conoce Threads", () => {
  const w = wf("renovar-token");
  const job = w.jobs["renovar-entorno"];
  assert.equal(job.env.THREADS_ACCESS_TOKEN, "${{ secrets.THREADS_ACCESS_TOKEN }}");
  const guardarTh = job.steps.find((s) => /Threads/.test(s.name || ""));
  assert.ok(guardarTh, "hay un paso que guarda el token de Threads");
  assert.match(guardarTh.run, /temp\/nuevo-token-THREADS_ACCESS_TOKEN\.txt/);
  assert.match(guardarTh.run, /gh secret set THREADS_ACCESS_TOKEN --env "\$ENTORNO"/);
  assert.match(guardarTh.run, /rm -f/);
  const guardarIg = job.steps.find((s) => /Guardar el token renovado en el Environment/.test(s.name || ""));
  assert.match(guardarIg.run, /gh secret set IG_ACCESS_TOKEN --env/);
  assert.equal(w.jobs["renovar-repositorio"].env.THREADS_ACCESS_TOKEN, undefined);
  assert.ok(!/THREADS/.test(JSON.stringify(w.jobs["renovar-repositorio"])), "el modo repositorio no toca Threads");
  assert.equal(/inputs\.token|inputs\.secreto/.test(leer("renovar-token")), false);
});
