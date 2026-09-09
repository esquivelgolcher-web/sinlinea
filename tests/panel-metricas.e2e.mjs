// Métricas fase 1, vista del panel de extremo a extremo con el servidor local: evolución de la cuenta (instantáneas con
// fecha de consulta y métricas por día), rendimiento de publicaciones (acumulados y variación aproximada entre
// consultas) y "No disponible" con su motivo, nunca un 0 donde el archivo tiene null.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { crearServidor } from "../src/serve.mjs";
import { raizConCuentas } from "./ayuda/cuentas.mjs";
import { registrarConsultaCuenta, registrarPorDia, registrarConsultaMedio } from "../src/lib/metricas.mjs";

let navegador;
before(async () => { navegador = await chromium.launch(); });
after(async () => { await navegador?.close(); });

const base0 = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));

async function montar(prefijo, { conMetricas = true } = {}) {
  const raiz = raizConCuentas({ cuentas: ["sinlinea", "prueba"], prefijo });
  for (const d of ["templates", "panel", "src/lib", "public/img", "assets", "tests/fixtures"]) fs.mkdirSync(path.join(raiz, d), { recursive: true });
  fs.copyFileSync("templates/post.html", path.join(raiz, "templates/post.html"));
  fs.copyFileSync("tests/fixtures/post-ejemplo.json", path.join(raiz, "tests/fixtures/post-ejemplo.json"));
  for (const f of fs.readdirSync("panel")) fs.copyFileSync(path.join("panel", f), path.join(raiz, "panel", f));
  for (const f of fs.readdirSync("src/lib")) fs.copyFileSync(path.join("src/lib", f), path.join(raiz, "src/lib", f));
  fs.mkdirSync(path.join(raiz, ".github/workflows"), { recursive: true });
  for (const w of ["publicar.yml", "probar-instagram.yml"]) fs.copyFileSync(path.join(".github/workflows", w), path.join(raiz, ".github/workflows", w));
  const post = { ...base0, id: base0.id.slice(0, -4) + "c001", cuenta: "prueba", estado: "publicado", categoria: "SEGURIDAD", programado: "2026-09-07T14:30:00-05:00", publicacion: { idMedia: "18003", permalink: "https://www.instagram.com/p/AAA/", fecha: "2026-09-07T19:30:00.000Z" }, titular: "Publicado por el sistema" };
  fs.writeFileSync(path.join(raiz, "posts", `${post.id}.json`), JSON.stringify(post, null, 2));
  if (conMetricas) {
    const carpeta = path.join(raiz, "data/prueba/metricas");
    fs.mkdirSync(carpeta, { recursive: true });
    let cuenta = registrarConsultaCuenta(null, { cuenta: "prueba", consultadoEn: "2026-09-09T05:31:02.000Z", perfil: { seguidores: 81089, seguidos: 378, publicaciones: 27 }, permiso: "basico+insights", llamadas: 9, completo: true });
    cuenta = registrarConsultaCuenta(cuenta, { cuenta: "prueba", consultadoEn: "2026-09-10T05:31:02.000Z", perfil: { seguidores: 81102, seguidos: 378, publicaciones: 27 }, permiso: "basico+insights", llamadas: 9, completo: false, motivoIncompleto: "presupuesto-agotado" });
    cuenta = registrarPorDia(cuenta, { cuenta: "prueba", dia: "2026-09-08", consultadoEn: "2026-09-10T05:31:02.000Z", valores: { reach: 334, views: 465, total_interactions: 0, profile_views: 42, follows_and_unfollows: null, follower_count: null }, faltantes: { follows_and_unfollows: "conjunto-vacio", follower_count: "conjunto-vacio" } });
    cuenta = registrarPorDia(cuenta, { cuenta: "prueba", dia: "2026-09-09", consultadoEn: "2026-09-10T05:31:02.000Z", valores: { reach: null, views: null }, faltantes: { reach: "retraso-api", views: "retraso-api" } });
    fs.writeFileSync(path.join(carpeta, "cuenta-2026-09.json"), JSON.stringify(cuenta, null, 2));
    let pubs = registrarConsultaMedio(null, { cuenta: "prueba", medio: { id: "18003", tipo: "IMAGE", fecha: "2026-09-07T19:30:00.000Z", permalink: "https://www.instagram.com/p/AAA/", caption: "Publicado por el sistema" }, consultadoEn: "2026-09-09T05:31:02.000Z", acumulados: { meGusta: 12, comentarios: 1, reach: 400, views: 620, saved: 3, shares: 2, total_interactions: 18 }, faltantes: {}, enlace: { origen: "sistema", post: base0.id.slice(0, -4) + "c001", categoria: "SEGURIDAD", franja: "14:30" } });
    pubs = registrarConsultaMedio(pubs, { cuenta: "prueba", medio: { id: "18003", tipo: "IMAGE", fecha: "2026-09-07T19:30:00.000Z", permalink: "https://www.instagram.com/p/AAA/", caption: "Publicado por el sistema" }, consultadoEn: "2026-09-10T05:31:02.000Z", acumulados: { meGusta: 20, comentarios: 1, reach: 520, views: 800, saved: 5, shares: 4, total_interactions: 30 }, faltantes: {}, enlace: { origen: "sistema", post: base0.id.slice(0, -4) + "c001", categoria: "SEGURIDAD", franja: "14:30" } });
    pubs = registrarConsultaMedio(pubs, { cuenta: "prueba", medio: { id: "18386876893200089", tipo: "VIDEO", fecha: "2026-08-22T07:39:24.000Z", permalink: "https://www.instagram.com/reel/BBB/", caption: "Reel publicado desde la app de Instagram" }, consultadoEn: "2026-09-10T05:31:02.000Z", acumulados: { meGusta: 110, comentarios: 2, reach: 3624, views: 4710, saved: 13, shares: 85, total_interactions: 229, profile_visits: null }, faltantes: { profile_visits: "metrica-no-soportada" }, enlace: { origen: "instagram", post: null, categoria: null, franja: null } });
    fs.writeFileSync(path.join(carpeta, "publicaciones-2026-08.json"), JSON.stringify({ ...pubs, publicaciones: { 18386876893200089: pubs.publicaciones["18386876893200089"] } }, null, 2));
    fs.writeFileSync(path.join(carpeta, "publicaciones-2026-09.json"), JSON.stringify({ ...pubs, publicaciones: { 18003: pubs.publicaciones["18003"] } }, null, 2));
    fs.writeFileSync(path.join(carpeta, "estado.json"), JSON.stringify({ version: 1, cuenta: "prueba", ultimaCorrida: "2026-09-10T05:31:02.000Z", completo: false, motivoIncompleto: "presupuesto-agotado", pendientes: ["18400665205094430"], ultimaConsulta: {} }));
  }
  const servidor = crearServidor({ raiz });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  return { raiz, servidor, base: `http://127.0.0.1:${servidor.address().port}` };
}

async function abrirMetricas(page, base) {
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto(`${base}/panel/`);
  await page.waitForSelector("#cuentas button");
  await page.click('#cuentas button:has-text("Cuenta de prueba")');
  await page.click("#boton-metricas");
  await page.waitForSelector("#metricas:not([hidden])");
  await page.waitForFunction(() => /Última consulta/.test(document.getElementById("metricas-estado").textContent), null, { timeout: 10000 });
  assert.deepEqual(errores, [], "sin errores de JavaScript en la vista");
}

test("(métricas) la vista muestra la evolución con fecha de consulta, las métricas por día, el rendimiento de las publicaciones con variación aproximada y 'No disponible' con motivo; nunca un 0 por un null", async () => {
  const { servidor, base } = await montar("metricas-vista-");
  const page = await navegador.newPage();
  try {
    await abrirMetricas(page, base);
    const texto = await page.locator("#metricas").textContent();
    assert.match(texto, /Última consulta: 2026-09-10 05:31 UTC/);
    assert.match(texto, /básico \+ estadísticas/);
    assert.match(texto, /incompleta/i, "la última corrida se quedó sin presupuesto y se dice");
    assert.match(texto, /Recogida diaria: apagada/, "el interruptor está apagado por defecto y se muestra tal cual");
    assert.match(texto, /hasta 48 h/);
    // Evolución (acumulados con fecha de consulta)
    const filasEvolucion = page.locator("#metricas-evolucion tbody tr");
    assert.equal(await filasEvolucion.count(), 2);
    assert.match(await filasEvolucion.nth(1).textContent(), /2026-09-10 05:31 UTC.*81102.*378.*27/);
    // Métricas por día (por período), con retraso de la API como no disponible
    const porDia = await page.locator("#metricas-por-dia").textContent();
    assert.match(porDia, /2026-09-08.*334.*465/);
    assert.match(porDia, /No disponible todavía \(la API puede tardar hasta 48 h\)/);
    assert.match(porDia, /No disponible \(la API devolvió un conjunto vacío\)/);
    // Publicaciones
    const filas = page.locator("#metricas-publicaciones tbody tr");
    assert.equal(await filas.count(), 2);
    const sistema = await filas.nth(0).textContent();
    assert.match(sistema, /Publicado por el sistema/);
    assert.match(sistema, /sistema · SEGURIDAD · 14:30/);
    assert.match(sistema, /520 \+120.*800 \+180/, "últimos acumulados con su variación aproximada");
    assert.match(sistema, /\+8 en 1 día \(aprox\.\)/, "variación aproximada entre consultas, no actividad del día");
    const reel = await filas.nth(1).textContent();
    assert.match(reel, /Reel publicado desde la app/);
    assert.match(reel, /instagram/);
    assert.match(reel, /No disponible: la API no soporta esta métrica/);
    assert.match(reel, /3624/);
    assert.equal(/\b0\b/.test(await filas.nth(1).locator("td").nth(9).textContent()), false, "una métrica null nunca se pinta como 0");
    assert.equal(/sin recogida/i.test(texto), false);
  } finally {
    await page.close();
    servidor.close();
  }
});

test("(métricas) sin recogida la vista lo dice y no inventa valores", async () => {
  const { servidor, base } = await montar("metricas-vacia-", { conMetricas: false });
  const page = await navegador.newPage();
  try {
    await abrirMetricas(page, base);
    const texto = await page.locator("#metricas").textContent();
    assert.match(texto, /aún no hay ninguna recogida/i);
    assert.match(texto, /Recogida diaria: apagada/);
    assert.equal(await page.locator("#metricas-publicaciones tbody tr").count(), 0);
    assert.equal(/\b0\b/.test(texto.replace(/48 h|2026/g, "")), false, "sin datos no aparece ningún cero");
  } finally {
    await page.close();
    servidor.close();
  }
});
