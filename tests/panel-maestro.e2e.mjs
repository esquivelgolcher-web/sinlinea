// Panel maestro (fase 1) de extremo a extremo con el servidor local: vista de cuentas, alta, edición, conflicto, archivo,
// verificación y conservación de las pausas. Cuentas de prueba sin credenciales.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { crearServidor } from "../src/serve.mjs";
import { raizConCuentas } from "./ayuda/cuentas.mjs";

let navegador;
before(async () => { navegador = await chromium.launch(); });
after(async () => { await navegador?.close(); });

const base0 = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));
const leerJson = (ruta) => JSON.parse(fs.readFileSync(ruta, "utf8"));

// Raíz con Sin Línea (publicación PAUSADA, como en producción), la cuenta personal (apagada) y la cuenta de prueba, cada una con posts.
async function montar(prefijo) {
  const raiz = raizConCuentas({ cuentas: ["sinlinea", "luiseskivelgolcher", "prueba"], prefijo });
  for (const d of ["templates", "panel", "src/lib", "public/img", "assets", "tests/fixtures"]) fs.mkdirSync(path.join(raiz, d), { recursive: true });
  fs.copyFileSync("templates/post.html", path.join(raiz, "templates/post.html"));
  fs.copyFileSync("tests/fixtures/post-ejemplo.json", path.join(raiz, "tests/fixtures/post-ejemplo.json"));
  for (const f of fs.readdirSync("panel")) fs.copyFileSync(path.join("panel", f), path.join(raiz, "panel", f));
  for (const f of fs.readdirSync("src/lib")) fs.copyFileSync(path.join("src/lib", f), path.join(raiz, "src/lib", f));
  fs.mkdirSync(path.join(raiz, ".github/workflows"), { recursive: true });
  for (const w of ["publicar.yml", "probar-instagram.yml"]) fs.copyFileSync(path.join(".github/workflows", w), path.join(raiz, ".github/workflows", w));
  const rutaSl = path.join(raiz, "cuentas/sinlinea/config.json");
  fs.writeFileSync(rutaSl, JSON.stringify({ ...leerJson(rutaSl), automatico: { generar: true, publicar: false } }, null, 2) + "\n");
  const posts = [
    { ...base0, id: base0.id.slice(0, -4) + "b001", cuenta: "sinlinea", titular: "Borrador de Sin Línea" },
    { ...base0, id: base0.id.slice(0, -4) + "b002", cuenta: "sinlinea", estado: "programado", programado: "2026-09-09T12:00:00-05:00", titular: "Programado de Sin Línea" },
    { ...base0, id: base0.id.slice(0, -4) + "b003", cuenta: "luiseskivelgolcher", titular: "Borrador personal" },
    { ...base0, id: base0.id.slice(0, -4) + "b004", cuenta: "prueba", titular: "Borrador de prueba" },
    { ...base0, id: base0.id.slice(0, -4) + "b005", cuenta: "prueba", estado: "programado", programado: "2026-09-09T18:00:00-05:00", titular: "Programado de prueba" },
  ];
  for (const p of posts) fs.writeFileSync(path.join(raiz, "posts", `${p.id}.json`), JSON.stringify(p, null, 2));
  fs.writeFileSync(path.join(raiz, "data/sinlinea/token-info.json"), '{ "vence": "2026-11-07" }');
  fs.writeFileSync(path.join(raiz, "data/luiseskivelgolcher/conexion.json"), JSON.stringify({ estado: "verificada", usuario: "luiseskivelgolcher", comprobado: "2026-09-08T20:20:00.000Z", detalle: null }));
  const servidor = crearServidor({ raiz });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  return { raiz, servidor, base };
}

async function abrirMaestro(page, base, viewport = { width: 1200, height: 900 }) {
  await page.setViewportSize(viewport);
  await page.goto(`${base}/panel/`);
  await page.waitForSelector(".tarjeta");
  await page.click("#boton-cuentas");
  await page.waitForSelector(".cuenta-tarjeta");
}

test("(maestro) la vista Todas las cuentas muestra tarjetas con identidad, contadores, automatizaciones y conexión, y abre el panel individual", async () => {
  const { raiz, servidor, base } = await montar("maestro-vista-");
  const page = await navegador.newPage();
  try {
    await abrirMaestro(page, base);
    assert.equal(await page.locator("#cuentas-grid .cuenta-tarjeta").count(), 3);
    const sl = page.locator('.cuenta-tarjeta[data-cuenta="sinlinea"]');
    assert.match(await sl.textContent(), /Sin Línea/);
    assert.match(await sl.textContent(), /@sinlinea\.pa/);
    assert.match(await sl.textContent(), /Generación automática: activa/);
    assert.match(await sl.textContent(), /Publicación automática: apagada/);
    assert.match(await sl.textContent(), /Borradores 1 · Programados 1/);
    assert.match(await sl.textContent(), /Pendiente de verificación/, "hay token-info pero ninguna verificación de identidad");
    assert.match(await sl.textContent(), /modo actual: secretos del repositorio IG_ACCESS_TOKEN \/ IG_USER_ID/, "modo de credenciales explícito con los nombres exactos");
    const luis = page.locator('.cuenta-tarjeta[data-cuenta="luiseskivelgolcher"]');
    assert.match(await luis.textContent(), /Identidad verificada \(@luiseskivelgolcher\) el 2026-09-08 20:20 UTC/);
    assert.match(await luis.textContent(), /Última comprobación: 2026-09-08 20:20 UTC/);
    assert.match(await luis.textContent(), /no garantiza/i, "un resultado pasado no garantiza que la conexión siga válida");
    assert.match(await luis.textContent(), /Generación automática: apagada/);
    assert.match(await luis.textContent(), /modo actual: secretos del repositorio IG_ACCESSTOKEN_LUISESKIVELGOLCHER \/ IG_USER_ID_LUISESKIVELGOLCHER/);
    const prueba = page.locator('.cuenta-tarjeta[data-cuenta="prueba"]');
    assert.match(await prueba.textContent(), /Conexión sin verificar/, "con un job por cuenta cualquier cuenta declarada llega a las corridas; sin verificación no se afirma nada más");
    assert.doesNotMatch(await prueba.textContent(), /Credenciales pendientes/, "no se afirma que falten credenciales sin haberlo comprobado");
    assert.match(await prueba.textContent(), /IG_ACCESS_TOKEN_PRUEBA \/ IG_USER_ID_PRUEBA/, "nombres sugeridos cuando la cuenta no los declara");
    assert.equal(await prueba.locator('button:has-text("Verificar identidad")').isDisabled(), false, "se puede pedir la verificación: su job existe por construcción");
    assert.equal((await page.textContent("#maestro")).includes("IGAA"), false, "ningún valor de secreto en la vista");
    // Abrir panel de la cuenta personal → vista de posts filtrada
    await luis.locator("text=Abrir panel").click();
    await page.waitForSelector("#vista-posts:not([hidden]) .tarjeta");
    assert.match(await page.$eval("#cuentas button.activa", (n) => n.textContent), /Luis Esquivel Golcher/);
    assert.equal(await page.inputValue(".tarjeta textarea >> nth=0"), "Borrador personal");
    assert.equal(await page.isHidden("#maestro"), true);
    // El botón de la cabecera vuelve a la vista de cuentas y la elección se recuerda al recargar
    await page.click("#boton-cuentas");
    await page.waitForSelector("#maestro:not([hidden])");
    await page.reload();
    await page.waitForSelector("#maestro:not([hidden]) .cuenta-tarjeta");
  } finally {
    await page.close();
    servidor.close();
  }
  assert.equal(leerJson(path.join(raiz, "cuentas/sinlinea/config.json")).automatico.publicar, false, "la pausa de Sin Línea no cambia");
});

test("(maestro) Añadir cuenta crea config, editorial y la lista global; empieza apagada, sin conexión y aparece en el selector", async () => {
  const { raiz, servidor, base } = await montar("maestro-alta-");
  const antesSl = fs.readFileSync(path.join(raiz, "cuentas/sinlinea/config.json"), "utf8");
  const page = await navegador.newPage();
  try {
    await abrirMaestro(page, base);
    await page.click("#boton-anadir");
    await page.waitForSelector("#formulario-cuenta:not([hidden])");
    await page.fill("#fc-nombre", "Nuevo Medio");
    await page.fill("#fc-usuario", "Nuevo.Medio");
    assert.equal(await page.inputValue("#fc-id"), "nuevo-medio", "id sugerido a partir del usuario");
    await page.fill("#fc-temas", "Economía local\nTransparencia");
    await page.fill("#fc-tono", "Claro y directo");
    await page.waitForFunction(() => document.getElementById("fc-editorial").value.includes("Economía local"));
    await page.click("#fc-anadir-fuente");
    await page.fill(".fuente-fila >> nth=0 >> input >> nth=0", "La Prensa");
    await page.fill(".fuente-fila >> nth=0 >> input >> nth=1", "https://www.prensa.com/arc/outboundfeeds/rss/?outputType=xml");
    await page.fill("#fc-franjas", "09:00, 18:00");
    await page.selectOption("#fc-logo-forma", "cuadrado");
    assert.equal(await page.inputValue("#fc-token-secreto"), "IG_ACCESS_TOKEN_NUEVO_MEDIO", "nombres de secretos sugeridos y editables");
    assert.equal(await page.inputValue("#fc-origen"), "entorno", "(cierre) las cuentas nuevas nacen en modo Environment");
    assert.match(await page.textContent("#fc-secretos"), /cuenta-nuevo-medio/);
    await page.selectOption("#fc-origen", "repositorio");
    assert.match(await page.textContent("#fc-secretos"), /Modo actual.*IG_ACCESS_TOKEN_NUEVO_MEDIO/, "el modo actual sigue disponible con los nombres sugeridos");
    // Fase 2: la cuenta nueva elige el Environment cuenta-<id>; los nombres fijos sustituyen a los propios
    await page.selectOption("#fc-origen", "entorno");
    await page.waitForFunction(() => document.getElementById("fc-nombres-secretos").hidden === true);
    assert.match(await page.textContent("#fc-secretos"), /Environment cuenta-nuevo-medio/);
    assert.match(await page.textContent("#fc-secretos"), /IG_ACCESS_TOKEN.*IG_USER_ID/);
    assert.match(await page.textContent("#fc-secretos"), /sin usar credenciales de otro origen/);
    // Un error de validación se muestra y conserva lo escrito
    await page.fill("#fc-franjas", "25:00");
    await page.click("#fc-guardar");
    await page.waitForSelector("#form-errores:not([hidden])");
    assert.match(await page.textContent("#form-errores"), /franjas/);
    assert.equal(await page.inputValue("#fc-nombre"), "Nuevo Medio");
    await page.fill("#fc-franjas", "09:00, 18:00");
    await page.click("#fc-guardar");
    await page.waitForSelector('.cuenta-tarjeta[data-cuenta="nuevo-medio"]');
    const cfg = leerJson(path.join(raiz, "cuentas/nuevo-medio/config.json"));
    assert.equal(cfg.nombre, "Nuevo Medio");
    assert.equal(cfg.marca.usuario, "@Nuevo.Medio");
    assert.equal(cfg.marca.logoForma, "cuadrado");
    assert.deepEqual(cfg.automatico, { generar: false, publicar: false });
    assert.deepEqual(cfg.editorial, { temas: ["Economía local", "Transparencia"], tono: "Claro y directo" });
    assert.deepEqual(cfg.franjas, ["09:00", "18:00"]);
    assert.equal(cfg.fuentes.length, 1);
    assert.deepEqual(cfg.instagram, { origen: "entorno", tokenSecreto: "IG_ACCESS_TOKEN_NUEVO_MEDIO", usuarioIdSecreto: "IG_USER_ID_NUEVO_MEDIO" }, "origen explícito: Environment");
    assert.equal(cfg.archivada, undefined);
    const editorial = fs.readFileSync(path.join(raiz, "cuentas/nuevo-medio/editorial.md"), "utf8");
    assert.match(editorial, /Línea editorial de @Nuevo\.Medio/);
    assert.match(editorial, /- Transparencia/);
    assert.deepEqual(leerJson(path.join(raiz, "config.json")).cuentas, ["sinlinea", "luiseskivelgolcher", "prueba", "nuevo-medio"]);
    assert.equal(fs.existsSync(path.join(raiz, "data/nuevo-medio/conexion.json")), false, "sin conexión verificada");
    const tarjeta = await page.textContent('.cuenta-tarjeta[data-cuenta="nuevo-medio"]');
    assert.match(tarjeta, /Generación automática: apagada/);
    assert.match(tarjeta, /Publicación automática: apagada/);
    assert.match(tarjeta, /Conexión sin verificar/);
    assert.match(tarjeta, /Environment cuenta-nuevo-medio \(IG_ACCESS_TOKEN, IG_USER_ID\)/, "la tarjeta dice qué modo usa la cuenta");
    assert.match(tarjeta, /Borradores 0 · Programados 0/);
    await page.click("#boton-cuentas");
    await page.waitForSelector("#vista-posts:not([hidden])");
    assert.match(await page.textContent("#cuentas"), /Nuevo Medio/, "la cuenta nueva entra en el selector sin recargar");
  } finally {
    await page.close();
    servidor.close();
  }
  assert.equal(fs.readFileSync(path.join(raiz, "cuentas/sinlinea/config.json"), "utf8"), antesSl, "Sin Línea no se toca");
});

test("(maestro) Editar guarda con sha y conserva cupos y automatizaciones; si el archivo cambió por fuera avisa, conserva lo escrito y el reintento escribe", async () => {
  const { raiz, servidor, base } = await montar("maestro-editar-");
  const ruta = path.join(raiz, "cuentas/prueba/config.json");
  const original = leerJson(ruta);
  const page = await navegador.newPage();
  try {
    await abrirMaestro(page, base);
    await page.locator('.cuenta-tarjeta[data-cuenta="prueba"] >> text=Editar').click();
    await page.waitForSelector("#formulario-cuenta:not([hidden])");
    assert.equal(await page.inputValue("#fc-nombre"), "Cuenta de prueba");
    assert.equal(await page.$eval("#fc-id", (n) => n.readOnly), true, "el identificador no se cambia al editar");
    assert.match(await page.inputValue("#fc-editorial"), /./, "carga la editorial existente");
    await page.fill("#fc-nombre", "Cuenta editada");
    // Alguien (bot u otro panel) cambia el archivo mientras el formulario está abierto
    fs.writeFileSync(ruta, JSON.stringify({ ...original, marca: { ...original.marca, lema: "Lema cambiado por fuera" } }, null, 2) + "\n");
    await page.click("#fc-guardar");
    await page.waitForSelector("#form-errores:not([hidden])");
    assert.match(await page.textContent("#form-errores"), /cambió/);
    assert.equal(await page.inputValue("#fc-nombre"), "Cuenta editada", "lo escrito se conserva");
    assert.equal(leerJson(ruta).marca.lema, "Lema cambiado por fuera", "no se pisó la versión ajena");
    await page.click("#fc-guardar");
    await page.waitForSelector('.cuenta-tarjeta[data-cuenta="prueba"]');
    const guardado = leerJson(ruta);
    assert.equal(guardado.nombre, "Cuenta editada");
    assert.deepEqual(guardado.generar, original.generar, "los cupos se conservan");
    assert.deepEqual(guardado.franjas, original.franjas);
    assert.equal(guardado.automatico, undefined, "no inventa automatizaciones que la cuenta no declaraba");
    assert.match(await page.textContent('.cuenta-tarjeta[data-cuenta="prueba"]'), /Cuenta editada/);
  } finally {
    await page.close();
    servidor.close();
  }
});

test("(maestro) Archivar detiene las automatizaciones y conserva id, posts e historial; Reactivar la devuelve apagada; Sin Línea sigue pausada", async () => {
  const { raiz, servidor, base } = await montar("maestro-archivar-");
  const antesSl = fs.readFileSync(path.join(raiz, "cuentas/sinlinea/config.json"), "utf8");
  const page = await navegador.newPage();
  page.on("dialog", (d) => d.accept());
  try {
    await abrirMaestro(page, base);
    await page.locator('.cuenta-tarjeta[data-cuenta="prueba"] >> text=Archivar').click();
    await page.waitForSelector('#cuentas-archivadas .cuenta-tarjeta[data-cuenta="prueba"]');
    const cfg = leerJson(path.join(raiz, "cuentas/prueba/config.json"));
    assert.equal(cfg.archivada, true);
    assert.match(cfg.archivadaEn, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(cfg.automatico, { generar: false, publicar: false });
    assert.equal(cfg.nombre, "Cuenta de prueba");
    assert.deepEqual(leerJson(path.join(raiz, "config.json")).cuentas, ["sinlinea", "luiseskivelgolcher", "prueba"], "el id sigue declarado");
    assert.equal(fs.existsSync(path.join(raiz, "posts", `${base0.id.slice(0, -4)}b004.json`)), true, "los posts se conservan");
    assert.equal(await page.locator("#cuentas-grid .cuenta-tarjeta").count(), 2);
    assert.match(await page.textContent("#archivadas-titulo"), /Archivadas \(1\)/);
    // El panel individual de la cuenta archivada sigue mostrando sus posts, con la nota
    await page.locator('#cuentas-archivadas .cuenta-tarjeta[data-cuenta="prueba"] >> text=Abrir panel').click();
    await page.waitForSelector("#vista-posts:not([hidden]) .tarjeta");
    assert.equal(await page.inputValue(".tarjeta textarea >> nth=0"), "Borrador de prueba");
    assert.match(await page.textContent("#nota-cuenta"), /archivada/i);
    assert.match(await page.textContent("#cuentas"), /Cuenta de prueba \(archivada\)/);
    // Reactivar
    await page.click("#boton-cuentas");
    await page.waitForSelector("#maestro:not([hidden])");
    await page.locator('#cuentas-archivadas .cuenta-tarjeta[data-cuenta="prueba"] >> text=Reactivar').click();
    await page.waitForSelector('#cuentas-grid .cuenta-tarjeta[data-cuenta="prueba"]');
    const re = leerJson(path.join(raiz, "cuentas/prueba/config.json"));
    assert.equal(re.archivada, false);
    assert.equal(re.archivadaEn, undefined);
    assert.deepEqual(re.automatico, { generar: false, publicar: false }, "reactivar no enciende nada");
    assert.match(await page.textContent("#aviso"), /siguen apagadas/i);
    assert.match(await page.textContent("#aviso"), /1 programado siguen en cola sin publicarse/);
    assert.equal(leerJson(path.join(raiz, "posts", `${base0.id.slice(0, -4)}b005.json`)).estado, "programado", "la cola se conserva y no se publica");
  } finally {
    await page.close();
    servidor.close();
  }
  assert.equal(fs.readFileSync(path.join(raiz, "cuentas/sinlinea/config.json"), "utf8"), antesSl, "Sin Línea sigue pausada e intacta");
});

test("(maestro) Verificar identidad marca la cuenta como pendiente de verificación (en local no lanza el workflow) y la vista se actualiza", async () => {
  const { raiz, servidor, base } = await montar("maestro-verificar-");
  const page = await navegador.newPage();
  try {
    await abrirMaestro(page, base, { width: 390, height: 800 }); // móvil
    await page.locator('.cuenta-tarjeta[data-cuenta="sinlinea"] >> button:has-text("Verificar identidad")').click();
    await page.waitForFunction(() => /Pendiente de verificación \(solicitada/.test(document.querySelector('.cuenta-tarjeta[data-cuenta="sinlinea"]')?.textContent || ""));
    const c = leerJson(path.join(raiz, "data/sinlinea/conexion.json"));
    assert.equal(c.estado, "pendiente");
    assert.match(c.solicitada, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(fs.existsSync(path.join(raiz, "data/prueba/conexion.json")), false, "no toca otras cuentas");
    const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(ancho <= 390, `sin desbordamiento horizontal en móvil (${ancho})`);
  } finally {
    await page.close();
    servidor.close();
  }
});

test("(maestro) cambiar el usuario de Instagram invalida la verificación anterior en la misma escritura y exige verificar de nuevo", async () => {
  const { raiz, servidor, base } = await montar("maestro-invalidar-");
  const page = await navegador.newPage();
  try {
    await abrirMaestro(page, base);
    await page.locator('.cuenta-tarjeta[data-cuenta="luiseskivelgolcher"] >> text=Editar').click();
    await page.waitForSelector("#formulario-cuenta:not([hidden])");
    assert.equal(await page.inputValue("#fc-token-secreto"), "IG_ACCESSTOKEN_LUISESKIVELGOLCHER", "muestra los nombres declarados");
    assert.equal(await page.inputValue("#fc-origen"), "repositorio", "la cuenta real sigue en modo actual hasta que se migre");
    // Guardar sin tocar usuario ni secretos conserva la verificación
    await page.fill("#fc-tono", "Tono revisado");
    await page.click("#fc-guardar");
    await page.waitForSelector('#maestro:not([hidden]) .cuenta-tarjeta[data-cuenta="luiseskivelgolcher"]');
    assert.equal(leerJson(path.join(raiz, "data/luiseskivelgolcher/conexion.json")).estado, "verificada");
    // Cambiar el usuario → pendiente (motivo cambio) con la verificación anterior registrada
    await page.locator('.cuenta-tarjeta[data-cuenta="luiseskivelgolcher"] >> text=Editar').click();
    await page.waitForSelector("#formulario-cuenta:not([hidden])");
    await page.fill("#fc-usuario", "@otro.usuario");
    await page.click("#fc-guardar");
    await page.waitForFunction(() => /ya no vale/.test(document.querySelector('.cuenta-tarjeta[data-cuenta="luiseskivelgolcher"]')?.textContent || ""));
    const c = leerJson(path.join(raiz, "data/luiseskivelgolcher/conexion.json"));
    assert.equal(c.estado, "pendiente");
    assert.equal(c.motivo, "cambio");
    assert.equal(c.anterior.estado, "verificada");
    assert.equal(c.anterior.comprobado, "2026-09-08T20:20:00.000Z");
    assert.equal(leerJson(path.join(raiz, "cuentas/luiseskivelgolcher/config.json")).marca.usuario, "@otro.usuario");
    const tarjeta = await page.textContent('.cuenta-tarjeta[data-cuenta="luiseskivelgolcher"]');
    assert.match(tarjeta, /Pendiente de verificación/);
    assert.doesNotMatch(tarjeta, /Identidad verificada/);
  } finally {
    await page.close();
    servidor.close();
  }
});

test("(fase 2) cambiar el origen de las credenciales a Environment invalida la verificación anterior y la tarjeta muestra el modo nuevo", async () => {
  const { raiz, servidor, base } = await montar("fase2-origen-");
  const page = await navegador.newPage();
  try {
    await abrirMaestro(page, base);
    await page.locator('.cuenta-tarjeta[data-cuenta="luiseskivelgolcher"] >> text=Editar').click();
    await page.waitForSelector("#formulario-cuenta:not([hidden])");
    await page.selectOption("#fc-origen", "entorno");
    await page.click("#fc-guardar");
    await page.waitForFunction(() => /Environment cuenta-luiseskivelgolcher/.test(document.querySelector('.cuenta-tarjeta[data-cuenta="luiseskivelgolcher"]')?.textContent || ""));
    const cfg = leerJson(path.join(raiz, "cuentas/luiseskivelgolcher/config.json"));
    assert.equal(cfg.instagram.origen, "entorno");
    assert.equal(cfg.instagram.tokenSecreto, "IG_ACCESSTOKEN_LUISESKIVELGOLCHER", "los nombres antiguos se conservan por si se vuelve al modo actual");
    assert.deepEqual(cfg.automatico, { generar: false, publicar: false }, "las pausas no cambian");
    const c = leerJson(path.join(raiz, "data/luiseskivelgolcher/conexion.json"));
    assert.equal(c.estado, "pendiente");
    assert.equal(c.motivo, "cambio");
    assert.match(c.detalle, /Environment cuenta-luiseskivelgolcher/);
    const tarjeta = await page.textContent('.cuenta-tarjeta[data-cuenta="luiseskivelgolcher"]');
    assert.match(tarjeta, /Pendiente de verificación/);
    assert.doesNotMatch(tarjeta, /Identidad verificada/);
  } finally {
    await page.close();
    servidor.close();
  }
});
