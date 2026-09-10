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

export const RUTA_PLANTILLA = "templates/post.html";
export const RUTA_LOGO = "assets/logo.png";

export function versionPlantilla(html) {
  const m = String(html).match(/<html[^>]*\bdata-version="(\d+)"/);
  if (!m) throw new Error("La plantilla no declara data-version en <html>");
  return Number(m[1]);
}

// Iniciales de la marca para el círculo de reserva cuando la cuenta no tiene logo.
export function iniciales(nombre) {
  const letras = String(nombre || "").trim().split(/\s+/).filter(Boolean).slice(0, 3).map((w) => w[0].toUpperCase()).join("");
  return letras || "?";
}

// Sello de la identidad visual de la cuenta (colores + presencia y forma del logo + rótulo): si cambia, REGENERAR re-dibuja.
export function estiloVisual(config, logoUrl) {
  const c = config.marca?.colores || {};
  return hashTexto(JSON.stringify({ principal: c.principal, acento: c.acento, oscuro: c.oscuro, claro: c.claro, logo: Boolean(logoUrl), forma: config.marca?.logoForma || "circulo", tamano: config.marca?.logoTamano || 120, rotulo: config.ilustraciones?.rotulo || "" }));
}

export function datosDeRender(post, config, { logoUrl, ilustracionUrl = null }) {
  return {
    colores: config.marca?.colores ? { ...config.marca.colores } : undefined,
    iniciales: iniciales(config.marca?.nombre),
    logoForma: config.marca?.logoForma || "circulo",
    logoTamano: config.marca?.logoTamano || 120,
    titular: post.titular,
    bajada: post.bajada,
    categoria: post.categoria,
    variante: post.variante,
    medio: post.fuente.medio,
    fecha: fechaCorta(post.creado, config.zonaHoraria),
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
};

export function errorTextoNoCabe(campo) {
  const err = new Error(MENSAJES_NO_CABE[campo] || `El texto "${campo}" no cabe en la imagen`);
  err.code = "TEXTO_NO_CABE";
  err.campo = campo;
  return err;
}

export async function abrirNavegador() {
  return chromium.launch();
}

export async function renderizarPost(post, { config, navegador, raiz = process.cwd(), destino = rutaImagen(post.id) }) {
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
    categoria: post.categoria,
    atribucion: post.atribucion || post.fuente?.medio || "",
    nota: d.tipo === "cierre" ? "Ilustración generada con IA en la portada" : (d.tipo === "portada" ? "Desliza →" : ""),
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
