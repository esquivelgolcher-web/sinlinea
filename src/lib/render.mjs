// Render de un post a JPEG 1080x1350 con Playwright (Chromium) + sharp.
// Las rutas (logoUrl, ilustracionUrl) son relativas a la raíz del repo.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { chromium } from "playwright";
import { hashImagen, hashTexto } from "./estados.mjs";
import { rutaImagen, urlImagen, rutaDiapositiva, urlDiapositiva } from "./posts.mjs";
import { fechaCorta } from "./fechas.mjs";
import { plantillaDe } from "./plantillas.mjs";

export const RUTA_PLANTILLA = "templates/post.html";
export const RUTA_LOGO = "assets/logo.png";

export function versionPlantilla(html) {
  const m = String(html).match(/<html[^>]*\bdata-version="(\d+)"/);
  if (!m) throw new Error("La plantilla no declara data-version en <html>");
  return Number(m[1]);
}

// Contraste WCAG 2.1 entre dos colores #RRGGBB (1 = ninguno, 21 = blanco sobre negro).
function luminancia(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return 0;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
export function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// Primer color de la lista que se lea bien sobre `fondo`; si ninguno llega al mínimo, el de mayor contraste.
// Con ilustración, el titular va sobre el fondo oscuro de la cuenta: una marca de color oscuro (granate, azul marino)
// sería ilegible ahí, así que se pasa al acento o al claro sin tocar las cuentas cuyo color principal ya contrasta.
export function colorLegible(candidatos, fondo, minimo = 4.5) {
  const lista = (candidatos || []).filter((c) => /^#?[0-9a-f]{6}$/i.test(String(c || "")));
  if (!lista.length) return null;
  return lista.find((c) => contraste(c, fondo) >= minimo) || lista.reduce((mejor, c) => (contraste(c, fondo) > contraste(mejor, fondo) ? c : mejor));
}

// Iniciales de la marca para el círculo de reserva cuando la cuenta no tiene logo.
export function iniciales(nombre) {
  const letras = String(nombre || "").trim().split(/\s+/).filter(Boolean).slice(0, 3).map((w) => w[0].toUpperCase()).join("");
  return letras || "?";
}

// Sello de la identidad visual de la cuenta (colores + presencia y forma del logo + rótulo): si cambia, REGENERAR re-dibuja.
// `formato`: la plantilla de la frase no dibuja ni la etiqueta de categoría ni el titular sobre ilustración, así que esas
// dos opciones no entran en su sello (si entraran, cambiarlas obligaría a redibujar frases sin motivo). Las claves solo se
// añaden cuando la cuenta se aparta del valor por defecto: así las demás cuentas conservan el sello que ya tenían.
export function estiloVisual(config, logoUrl, { formato = "post" } = {}) {
  const c = config.marca?.colores || {};
  const deLaImagen = formato !== "frase";
  return hashTexto(JSON.stringify({
    ...(deLaImagen && config.marca?.mostrarCategoria === false ? { categoria: false } : {}),
    ...(deLaImagen && colorTitular(config) !== (config.marca?.colores?.principal ?? "#FFD400") ? { titular: colorTitular(config) } : {}), principal: c.principal, acento: c.acento, oscuro: c.oscuro, claro: c.claro, logo: Boolean(logoUrl), forma: config.marca?.logoForma || "circulo", tamano: config.marca?.logoTamano || 120, rotulo: config.ilustraciones?.rotulo || "", fecha: config.marca?.mostrarFecha !== false }));
}

// Color del titular cuando hay ilustración de fondo: el principal si se lee, si no el acento y, en último caso, el claro.
function colorTitular(config) {
  const c = { ...COLORES_POR_DEFECTO_RENDER, ...(config.marca?.colores || {}) };
  return colorLegible([c.principal, c.acento, c.claro], c.oscuro);
}
const COLORES_POR_DEFECTO_RENDER = Object.freeze({ principal: "#FFD400", acento: "#E30613", oscuro: "#111111", claro: "#FFFFFF" });

export function datosDeRender(post, config, { logoUrl, ilustracionUrl = null }) {
  return {
    colores: config.marca?.colores ? { ...config.marca.colores } : undefined,
    iniciales: iniciales(config.marca?.nombre),
    logoForma: config.marca?.logoForma || "circulo",
    logoTamano: config.marca?.logoTamano || 120,
    titular: post.titular,
    bajada: post.bajada,
    // marca.mostrarCategoria=false: la imagen no lleva la etiqueta de sección; por defecto se muestra.
    categoria: config.marca?.mostrarCategoria === false ? "" : post.categoria,
    titularIlustracion: colorTitular(config),
    variante: post.variante,
    medio: post.fuente.medio,
    // marca.mostrarFecha=false: el pie no lleva fecha (estilo de medio tecnológico); por defecto se muestra.
    fecha: config.marca?.mostrarFecha === false ? "" : fechaCorta(post.creado, config.zonaHoraria),
    usuario: config.marca.usuario,
    lema: config.marca.lema,
    logoUrl,
    ilustracionUrl,
    rotulo: config.ilustraciones.rotulo,
  };
}

export function construirHtml(post, config, { plantilla, baseHref, logoUrl, ilustracionUrl = null }) {
  const json = JSON.stringify(datosDeRender(post, config, { logoUrl, ilustracionUrl })).replace(/<\//g, "<\\/");
  return plantilla
    .replace("__BASE__", () => baseHref)
    .replace(/<script id="datos" type="application\/json">[\s\S]*?<\/script>/, () => `<script id="datos" type="application/json">${json}</script>`);
}

export const MENSAJES_NO_CABE = {
  titular: "El titular no cabe en 3 líneas ni a 70 px: acórtalo (máximo 65 caracteres)",
  bajada: "La bajada no cabe en 2 líneas ni a 30 px: acórtala (máximo 110 caracteres)",
  frase: "La frase no cabe en 10 líneas ni a 36 px: elige una más corta o recórtala con puntos suspensivos",
  glosa: "Algún verso de la glosa no cabe en el globo ni a 48 px: acórtalo (máximo 34 caracteres por verso)",
};

// La tarjeta (plantillas dato y titular) tiene sus propios tamaños: el mensaje dice los suyos.
export const MENSAJES_NO_CABE_TARJETA = {
  titular: "El titular no cabe en la tarjeta ni en 5 líneas a 96 px: acórtalo (máximo 65 caracteres)",
  bajada: "La bajada no cabe en la tarjeta ni en 3 líneas a 32 px: acórtala (máximo 110 caracteres)",
  dato: "La cifra o su frase no caben en la tarjeta: acorta la frase (máximo 90 caracteres) o usa una cifra más corta",
};

export function errorTextoNoCabe(campo, mensaje = null) {
  const err = new Error(mensaje || MENSAJES_NO_CABE[campo] || `El texto "${campo}" no cabe en la imagen`);
  err.code = "TEXTO_NO_CABE";
  err.campo = campo;
  return err;
}

export async function abrirNavegador() {
  return chromium.launch();
}

export async function renderizarPost(post, { config, navegador, raiz = process.cwd(), destino = rutaImagen(post.id) }) {
  // Plantillas dato y titular: otra composición, sin ilustración (templates/tarjeta.html).
  if (plantillaDe(post) !== "foto") return renderizarTarjeta(post, { config, navegador, raiz, destino });
  const plantilla = fs.readFileSync(path.join(raiz, RUTA_PLANTILLA), "utf8");
  const version = versionPlantilla(plantilla);
  const rutaLogo = config.rutas?.logo || RUTA_LOGO;
  const logoUrl = fs.existsSync(path.join(raiz, rutaLogo)) ? rutaLogo.replace(/\\/g, "/") : null;
  const il = post.ilustracion;
  const ilustracionUrl = il && il.usar && il.ruta && fs.existsSync(path.join(raiz, il.ruta)) ? il.ruta.replace(/\\/g, "/") : null;
  const baseHref = pathToFileURL(path.resolve(raiz) + path.sep).href;
  const html = construirHtml(post, config, { plantilla, baseHref, logoUrl, ilustracionUrl });

  const dirTemp = path.join(raiz, "temp", "render");
  fs.mkdirSync(dirTemp, { recursive: true });
  const rutaHtml = path.join(dirTemp, `${post.id}.html`);
  fs.writeFileSync(rutaHtml, html);

  const page = await navegador.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  try {
    await page.goto(pathToFileURL(rutaHtml).href, { waitUntil: "load" });
    await page.waitForSelector('body[data-listo="1"]', { timeout: 15000 });
    const noCabe = await page.evaluate(() => document.body.dataset.error || "");
    if (noCabe) throw errorTextoNoCabe(noCabe);
    const png = await page.screenshot({ type: "png", fullPage: false });
    const rutaSalida = path.join(raiz, destino);
    fs.mkdirSync(path.dirname(rutaSalida), { recursive: true });
    await sharp(png).jpeg({ quality: 88, progressive: true, mozjpeg: true }).toFile(rutaSalida);
  } finally {
    await page.close();
    fs.rmSync(rutaHtml, { force: true });
  }
  return {
    ruta: destino,
    url: urlImagen(config.pages.baseUrl, post.id),
    hash: hashImagen(post, version),
    version,
    estilo: estiloVisual(config, logoUrl),
    renderizada: new Date().toISOString(),
  };
}

// --- Tarjeta: plantillas dato y titular, 1080x1350 con templates/tarjeta.html (sin ilustración) ------------------------
export const RUTA_PLANTILLA_TARJETA = "templates/tarjeta.html";

export function datosDeTarjeta(post, config, { logoUrl }) {
  return {
    plantilla: plantillaDe(post),
    colores: config.marca?.colores ? { ...config.marca.colores } : undefined,
    iniciales: iniciales(config.marca?.nombre),
    logoForma: config.marca?.logoForma || "circulo",
    logoTamano: config.marca?.logoTamano || 120,
    titular: post.titular,
    bajada: post.bajada,
    categoria: config.marca?.mostrarCategoria === false ? "" : post.categoria,
    fecha: config.marca?.mostrarFecha === false ? "" : fechaCorta(post.creado, config.zonaHoraria),
    usuario: config.marca.usuario,
    lema: config.marca.lema,
    cifra: post.dato?.cifra || "",
    frase: post.dato?.frase || "",
    logoUrl,
  };
}

export function construirHtmlTarjeta(post, config, { plantilla, baseHref, logoUrl }) {
  const json = JSON.stringify(datosDeTarjeta(post, config, { logoUrl })).replace(/<\//g, "<\\/");
  return plantilla
    .replace("__BASE__", () => baseHref)
    .replace(/<script id="datos" type="application\/json">[\s\S]*?<\/script>/, () => `<script id="datos" type="application/json">${json}</script>`);
}

export async function renderizarTarjeta(post, { config, navegador, raiz = process.cwd(), destino = rutaImagen(post.id) }) {
  const plantilla = fs.readFileSync(path.join(raiz, RUTA_PLANTILLA_TARJETA), "utf8");
  const version = versionPlantilla(plantilla);
  const rutaLogo = config.rutas?.logo || RUTA_LOGO;
  const logoUrl = fs.existsSync(path.join(raiz, rutaLogo)) ? rutaLogo.split(path.sep).join("/") : null;
  const baseHref = pathToFileURL(path.resolve(raiz) + path.sep).href;
  const html = construirHtmlTarjeta(post, config, { plantilla, baseHref, logoUrl });
  const dirTemp = path.join(raiz, "temp", "render");
  fs.mkdirSync(dirTemp, { recursive: true });
  const rutaHtml = path.join(dirTemp, `${post.id}.html`);
  fs.writeFileSync(rutaHtml, html);
  const page = await navegador.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  try {
    await page.goto(pathToFileURL(rutaHtml).href, { waitUntil: "load" });
    await page.waitForSelector('body[data-listo="1"]', { timeout: 15000 });
    const noCabe = await page.evaluate(() => document.body.dataset.error || "");
    if (noCabe) throw errorTextoNoCabe(noCabe, MENSAJES_NO_CABE_TARJETA[noCabe]);
    const png = await page.screenshot({ type: "png", fullPage: false });
    const rutaSalida = path.join(raiz, destino);
    fs.mkdirSync(path.dirname(rutaSalida), { recursive: true });
    await sharp(png).jpeg({ quality: 88, progressive: true, mozjpeg: true }).toFile(rutaSalida);
  } finally {
    await page.close();
    fs.rmSync(rutaHtml, { force: true });
  }
  // El sello de estilo es el del post: si cambian los colores o la sección de la cuenta, la tarjeta se redibuja igual.
  return { ruta: destino, url: urlImagen(config.pages.baseUrl, post.id), hash: hashImagen(post, version), version, estilo: estiloVisual(config, logoUrl), renderizada: new Date().toISOString() };
}

// --- Frase célebre: tarjeta tipográfica 1080x1350 con templates/frase.html (sin ilustración) ---------------------------
export const RUTA_PLANTILLA_FRASE = "templates/frase.html";

export function datosDeFrase(post, config, { logoUrl }) {
  const f = post.frase || {};
  const nota = f.origen === "texto" && post.fuente?.medio ? `${String(config.idioma || "es").toLowerCase().startsWith("en") ? "Via" : "Vía"} ${post.fuente.medio}` : "";
  return {
    colores: config.marca?.colores ? { ...config.marca.colores } : undefined,
    iniciales: iniciales(config.marca?.nombre),
    logoForma: config.marca?.logoForma || "circulo",
    logoTamano: Math.min(Number(config.marca?.logoTamano) || 96, 110),
    usuario: config.marca.usuario,
    frase: f.texto || "",
    autor: f.autor || "",
    fuente: f.fuente || "",
    anio: f.anio ? String(f.anio) : "",
    nota,
    serie: "",
    logoUrl,
  };
}

export function construirHtmlFrase(post, config, { plantilla, baseHref, logoUrl }) {
  const json = JSON.stringify(datosDeFrase(post, config, { logoUrl })).replace(/<\//g, "<\\/");
  return plantilla
    .replace("__BASE__", () => baseHref)
    .replace(/<script id="datos" type="application\/json">[\s\S]*?<\/script>/, () => `<script id="datos" type="application/json">${json}</script>`);
}

// Mismo resultado que renderizarPost (ruta, url, hash, version, estilo, renderizada): la pieza se publica como imagen única.
export async function renderizarFrase(post, { config, navegador, raiz = process.cwd(), destino = rutaImagen(post.id) }) {
  const plantilla = fs.readFileSync(path.join(raiz, RUTA_PLANTILLA_FRASE), "utf8");
  const version = versionPlantilla(plantilla);
  const rutaLogo = config.rutas?.logo || RUTA_LOGO;
  const logoUrl = fs.existsSync(path.join(raiz, rutaLogo)) ? rutaLogo.replace(/\\/g, "/") : null;
  const baseHref = pathToFileURL(path.resolve(raiz) + path.sep).href;
  const html = construirHtmlFrase(post, config, { plantilla, baseHref, logoUrl });
  const estilo = estiloVisual(config, logoUrl, { formato: "frase" });
  const dirTemp = path.join(raiz, "temp", "render");
  fs.mkdirSync(dirTemp, { recursive: true });
  const rutaHtml = path.join(dirTemp, `${post.id}.html`);
  fs.writeFileSync(rutaHtml, html);
  const page = await navegador.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  try {
    await page.goto(pathToFileURL(rutaHtml).href, { waitUntil: "load" });
    await page.waitForSelector('body[data-listo="1"]', { timeout: 15000 });
    const noCabe = await page.evaluate(() => document.body.dataset.error || "");
    if (noCabe) throw errorTextoNoCabe(noCabe);
    const png = await page.screenshot({ type: "png", fullPage: false });
    const rutaSalida = path.join(raiz, destino);
    fs.mkdirSync(path.dirname(rutaSalida), { recursive: true });
    await sharp(png).jpeg({ quality: 88, progressive: true, mozjpeg: true }).toFile(rutaSalida);
  } finally {
    await page.close();
    fs.rmSync(rutaHtml, { force: true });
  }
  return { ruta: destino, url: urlImagen(config.pages.baseUrl, post.id), hash: hashImagen(post, version), version, estilo, renderizada: new Date().toISOString() };
}

// Render según el formato de la pieza: cada formato con su plantilla; por defecto, la del post.
const RENDER_POR_FORMATO = { frase: (p, o) => renderizarFrase(p, o), glosa: (p, o) => renderizarGlosa(p, o) };
export async function renderizarPieza(post, opciones) {
  const render = RENDER_POR_FORMATO[post.formato];
  return render ? render(post, opciones) : renderizarPost(post, opciones);
}

// --- Glosa: La Garza comenta la cuarteta en un globo, 1080x1350 con templates/garza.html (sin ilustración) ----------
export const RUTA_PLANTILLA_GARZA = "templates/garza.html";

export function datosDeGlosa(post, config, { logoUrl, personajeUrl }) {
  const p = config.glosas?.personaje || {};
  const sobre = [post.glosa?.sobre?.titular, post.fuente?.medio].filter(Boolean).join(" · ");
  return {
    colores: config.marca?.colores ? { ...config.marca.colores } : undefined,
    iniciales: iniciales(config.marca?.nombre),
    logoForma: config.marca?.logoForma || "circulo",
    logoTamano: config.marca?.logoTamano || 120,
    versos: (post.glosa?.versos || []).map((v) => String(v).trim()),
    sobre: sobre ? `Sobre: ${sobre}` : "",
    nombre: p.nombre || "La Garza",
    cargo: p.cargo || "",
    fecha: config.marca?.mostrarFecha === false ? "" : fechaCorta(post.creado, config.zonaHoraria),
    usuario: config.marca.usuario,
    lema: config.marca.lema,
    logoUrl,
    personajeUrl,
  };
}

export function construirHtmlGlosa(post, config, { plantilla, baseHref, logoUrl, personajeUrl }) {
  const json = JSON.stringify(datosDeGlosa(post, config, { logoUrl, personajeUrl })).replace(/<\//g, "<\\/");
  return plantilla
    .replace("__BASE__", () => baseHref)
    .replace(/<script id="datos" type="application\/json">[\s\S]*?<\/script>/, () => `<script id="datos" type="application/json">${json}</script>`);
}

export async function renderizarGlosa(post, { config, navegador, raiz = process.cwd(), destino = rutaImagen(post.id) }) {
  const plantilla = fs.readFileSync(path.join(raiz, RUTA_PLANTILLA_GARZA), "utf8");
  const version = versionPlantilla(plantilla);
  const rutaLogo = config.rutas?.logo || RUTA_LOGO;
  const logoUrl = fs.existsSync(path.join(raiz, rutaLogo)) ? rutaLogo.split(path.sep).join("/") : null;
  const personajeUrl = urlPersonaje(config, raiz);
  const baseHref = pathToFileURL(path.resolve(raiz) + path.sep).href;
  const html = construirHtmlGlosa(post, config, { plantilla, baseHref, logoUrl, personajeUrl });
  const dirTemp = path.join(raiz, "temp", "render");
  fs.mkdirSync(dirTemp, { recursive: true });
  const rutaHtml = path.join(dirTemp, `${post.id}.html`);
  fs.writeFileSync(rutaHtml, html);
  const page = await navegador.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  try {
    await page.goto(pathToFileURL(rutaHtml).href, { waitUntil: "load" });
    await page.waitForSelector('body[data-listo="1"]', { timeout: 15000 });
    const noCabe = await page.evaluate(() => document.body.dataset.error || "");
    if (noCabe) throw errorTextoNoCabe(noCabe);
    const png = await page.screenshot({ type: "png", fullPage: false });
    const rutaSalida = path.join(raiz, destino);
    fs.mkdirSync(path.dirname(rutaSalida), { recursive: true });
    await sharp(png).jpeg({ quality: 88, progressive: true, mozjpeg: true }).toFile(rutaSalida);
  } finally {
    await page.close();
    fs.rmSync(rutaHtml, { force: true });
  }
  return { ruta: destino, url: urlImagen(config.pages.baseUrl, post.id), hash: hashImagen(post, version), version, estilo: estiloGlosa(config, { logoUrl, personajeUrl }), renderizada: new Date().toISOString() };
}

// Sello de estilo de la glosa: colores y logo de la marca más el personaje (dibujo, nombre y cargo). Si cambia
// cualquiera, REGENERAR vuelve a dibujar las glosas activas.
export function estiloGlosa(config, { logoUrl = null, personajeUrl = null } = {}) {
  return hashTexto(JSON.stringify([estiloVisual(config, logoUrl, { formato: "frase" }), personajeUrl, config.glosas?.personaje?.nombre || "", config.glosas?.personaje?.cargo || ""]));
}

// Ruta pública del dibujo del personaje de la cuenta (cuentas/<id>/garza.png), o null si no existe.
export function urlPersonaje(config, raiz = process.cwd()) {
  const ruta = config.rutas?.personaje || null;
  return ruta && fs.existsSync(path.join(raiz, ruta)) ? ruta.split(path.sep).join("/") : null;
}

// --- Carrusel (perfil editorial): una imagen 1080x1350 por diapositiva con templates/carrusel.html --------------------
export const RUTA_PLANTILLA_CARRUSEL = "templates/carrusel.html";

// Diapositivas con su tipo: la primera es portada (con la ilustración de fondo), la última cierra con las fuentes.
export function diapositivasDe(post) {
  const lista = post.carrusel?.diapositivas || [];
  const total = lista.length;
  const fuentes = (post.fuentes || []).map((f) => `${f.medio}${f.autor ? ` (${f.autor})` : ""} · ${f.canonica || f.url}`);
  return lista.map((d, i) => {
    const numero = i + 1;
    const tipo = i === 0 ? "portada" : (i === total - 1 && total > 1 ? "cierre" : "contenido");
    return { numero, total, tipo, titulo: d.titulo, texto: d.texto, etiqueta: tipo === "contenido" ? `${numero - 1} de ${Math.max(total - 2, 1)}` : "", fuentes: tipo === "cierre" ? fuentes : [] };
  });
}

export function datosDeDiapositiva(post, config, indice, { logoUrl, ilustracionUrl = null }) {
  const d = diapositivasDe(post)[indice];
  if (!d) throw new Error(`El carrusel no tiene la diapositiva ${indice + 1}`);
  return {
    colores: config.marca?.colores ? { ...config.marca.colores } : undefined,
    iniciales: iniciales(config.marca?.nombre),
    logoForma: config.marca?.logoForma || "circulo",
    logoTamano: Math.min(Number(config.marca?.logoTamano) || 90, 100),
    usuario: config.marca.usuario,
    titularIlustracion: colorTitular(config),
    categoria: config.marca?.mostrarCategoria === false ? "" : post.categoria,
    atribucion: post.atribucion || post.fuente?.medio || "",
    nota: d.tipo === "cierre" ? (config.ilustraciones?.rotulo ? `${config.ilustraciones.rotulo} en la portada` : "") : (d.tipo === "portada" ? "Desliza →" : ""),
    logoUrl,
    ilustracionUrl: d.tipo === "portada" ? ilustracionUrl : null,
    ...d,
  };
}

export function construirHtmlCarrusel(post, config, indice, { plantilla, baseHref, logoUrl, ilustracionUrl = null }) {
  const json = JSON.stringify(datosDeDiapositiva(post, config, indice, { logoUrl, ilustracionUrl })).replace(/<\//g, "<\\/");
  return plantilla
    .replace("__BASE__", () => baseHref)
    .replace(/<script id="datos" type="application\/json">[\s\S]*?<\/script>/, () => `<script id="datos" type="application/json">${json}</script>`);
}

// Huella del carrusel: cambia si cambian las diapositivas, la atribución, las fuentes o la plantilla.
export function hashCarrusel(post, version) {
  return hashTexto(JSON.stringify({ d: post.carrusel?.diapositivas || [], a: post.atribucion || "", f: (post.fuentes || []).map((x) => x.url), v: version }));
}

export async function renderizarCarrusel(post, { config, navegador, raiz = process.cwd(), destinoDe = (n) => rutaDiapositiva(post.id, n) }) {
  const plantilla = fs.readFileSync(path.join(raiz, RUTA_PLANTILLA_CARRUSEL), "utf8");
  const version = versionPlantilla(plantilla);
  const rutaLogo = config.rutas?.logo || RUTA_LOGO;
  const logoUrl = fs.existsSync(path.join(raiz, rutaLogo)) ? rutaLogo.replace(/\\/g, "/") : null;
  const il = post.ilustracion;
  const ilustracionUrl = il && il.usar && il.ruta && fs.existsSync(path.join(raiz, il.ruta)) ? il.ruta.replace(/\\/g, "/") : null;
  const baseHref = pathToFileURL(path.resolve(raiz) + path.sep).href;
  const dirTemp = path.join(raiz, "temp", "render");
  fs.mkdirSync(dirTemp, { recursive: true });
  const imagenes = [];
  const total = diapositivasDe(post).length;
  for (let i = 0; i < total; i++) {
    const numero = i + 1;
    const html = construirHtmlCarrusel(post, config, i, { plantilla, baseHref, logoUrl, ilustracionUrl });
    const rutaHtml = path.join(dirTemp, `${post.id}-${numero}.html`);
    fs.writeFileSync(rutaHtml, html);
    const page = await navegador.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
    try {
      await page.goto(pathToFileURL(rutaHtml).href, { waitUntil: "load" });
      await page.waitForSelector('body[data-listo="1"]', { timeout: 15000 });
      const noCabe = await page.evaluate(() => document.body.dataset.error || "");
      if (noCabe) throw new Error(`La diapositiva ${numero} no cabe: ${noCabe === "titulo" ? "acorta el título" : "acorta el texto"} (máximo 45 palabras)`);
      const png = await page.screenshot({ type: "png", fullPage: false });
      const destino = destinoDe(numero);
      const rutaSalida = path.join(raiz, destino);
      fs.mkdirSync(path.dirname(rutaSalida), { recursive: true });
      await sharp(png).jpeg({ quality: 88, progressive: true, mozjpeg: true }).toFile(rutaSalida);
      imagenes.push({ numero, ruta: destino, url: urlDiapositiva(config.pages.baseUrl, post.id, numero), hash: hashTexto(JSON.stringify(datosDeDiapositiva(post, config, i, { logoUrl, ilustracionUrl })) + version) });
    } finally {
      await page.close();
      fs.rmSync(rutaHtml, { force: true });
    }
  }
  return { imagenes, version, hash: hashCarrusel(post, version) };
}
