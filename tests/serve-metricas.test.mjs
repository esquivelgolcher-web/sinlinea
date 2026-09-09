// Métricas fase 1: el servidor local expone los archivos de data/<cuenta>/metricas para la vista del panel.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { crearServidor } from "../src/serve.mjs";
import { raizConCuentas } from "./ayuda/cuentas.mjs";
import { registrarConsultaCuenta, registrarPorDia, registrarConsultaMedio } from "../src/lib/metricas.mjs";

let servidor, base, raiz;
before(async () => {
  raiz = raizConCuentas({ cuentas: ["sinlinea", "prueba"], prefijo: "serve-metricas-" });
  const carpeta = path.join(raiz, "data/prueba/metricas");
  fs.mkdirSync(carpeta, { recursive: true });
  let cuenta = registrarConsultaCuenta(null, { cuenta: "prueba", consultadoEn: "2026-09-10T05:31:02.000Z", perfil: { seguidores: 42, seguidos: 3, publicaciones: 1 }, permiso: "basico", llamadas: 5, completo: true });
  cuenta = registrarPorDia(cuenta, { cuenta: "prueba", dia: "2026-09-09", consultadoEn: "2026-09-10T05:31:02.000Z", valores: { reach: null }, faltantes: { reach: "sin-permiso-insights" } });
  fs.writeFileSync(path.join(carpeta, "cuenta-2026-09.json"), JSON.stringify(cuenta, null, 2));
  const pubs = registrarConsultaMedio(null, { cuenta: "prueba", medio: { id: "18001", tipo: "IMAGE", fecha: "2026-09-08T08:07:03.000Z", permalink: "p", caption: "Hola" }, consultadoEn: "2026-09-10T05:31:02.000Z", acumulados: { meGusta: 12, comentarios: 1, reach: null }, faltantes: { reach: "sin-permiso-insights" }, enlace: { origen: "instagram", post: null, categoria: null, franja: null } });
  fs.writeFileSync(path.join(carpeta, "publicaciones-2026-09.json"), JSON.stringify(pubs, null, 2));
  fs.writeFileSync(path.join(carpeta, "estado.json"), JSON.stringify({ version: 1, cuenta: "prueba", ultimaCorrida: "2026-09-10T05:31:02.000Z", pendientes: [], ultimaConsulta: { 18001: "2026-09-10T05:31:02.000Z" } }));
  fs.writeFileSync(path.join(carpeta, "notas.txt"), "no es un archivo de métricas");
  servidor = crearServidor({ raiz });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
after(() => servidor.close());

test("(métricas) GET /api/metricas?cuenta=<id> devuelve los archivos mensuales y el estado; solo los nombres reconocidos", async () => {
  const res = await fetch(`${base}/api/metricas?cuenta=prueba`);
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.deepEqual(Object.keys(j.archivos).sort(), ["cuenta-2026-09.json", "publicaciones-2026-09.json"]);
  assert.equal(j.archivos["cuenta-2026-09.json"].consultas["2026-09-10T05:31:02.000Z"].perfil.seguidores, 42);
  assert.equal(j.archivos["cuenta-2026-09.json"].porDia["2026-09-09"].valores.reach, null);
  assert.equal(j.estado.ultimaCorrida, "2026-09-10T05:31:02.000Z");
  assert.equal(JSON.stringify(j).includes("notas.txt"), false);
});

test("(métricas) sin carpeta de métricas responde vacío (no cero); una cuenta desconocida es 404", async () => {
  const j = await (await fetch(`${base}/api/metricas?cuenta=sinlinea`)).json();
  assert.deepEqual(j, { archivos: {}, estado: null });
  assert.equal((await fetch(`${base}/api/metricas?cuenta=nadie`)).status, 404);
  assert.equal((await fetch(`${base}/api/metricas?cuenta=..%2Fprueba`)).status, 404);
});
