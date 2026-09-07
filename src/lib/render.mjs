// Render de un post a JPEG 1080x1350 con Playwright (Chromium) + sharp.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { chromium } from "playwright";
import { hashImagen } from "./estados.mjs";
import { rutaImagen, urlImagen } from "./posts.mjs";
import { fechaCorta } from "./fechas.mjs";

export const RUTA_PLANTILLA = "templates/post.html";
export const RUTA_LOGO = "assets/logo.png";

export function versionPlantilla(html) {
  const m = String(html).match(/<html[^>]*\bdata-version="(\d+)"/);
  if (!m) throw new Error("La plantilla no declara data-version en <html>");
  return Number(m[1]);
}

export function datosDeRender(post, config, { logoUrl }) {
  return {
    titular: post.titular,
    bajada: post.bajada,
    categoria: post.categoria,
    variante: post.variante,
    medio: post.fuente.medio,
    fecha: fechaCorta(post.creado, config.zonaHoraria),
    usuario: config.marca.usuario,
    lema: config.marca.lema,
    logoUrl,
  };
}

export function construirHtml(post, config, { plantilla, baseHref, logoUrl }) {
  const json = JSON.stringify(datosDeRender(post, config, { logoUrl })).replace(/<\//g, "<\\/");
  return plantilla
    .replace("__BASE__", () => baseHref)
    .replace(/<script id="datos" type="application\/json">[\s\S]*?<\/script>/, () => `<script id="datos" type="application/json">${json}</script>`);
}

export async function abrirNavegador() {
  return chromium.launch();
}

export async function renderizarPost(post, { config, navegador, raiz = process.cwd(), destino = rutaImagen(post.id) }) {
  const plantilla = fs.readFileSync(path.join(raiz, RUTA_PLANTILLA), "utf8");
  const version = versionPlantilla(plantilla);
  const logoUrl = fs.existsSync(path.join(raiz, RUTA_LOGO)) ? RUTA_LOGO : null;
  const baseHref = pathToFileURL(path.resolve(raiz) + path.sep).href;
  const html = construirHtml(post, config, { plantilla, baseHref, logoUrl });

  const dirTemp = path.join(raiz, "temp", "render");
  fs.mkdirSync(dirTemp, { recursive: true });
  const rutaHtml = path.join(dirTemp, `${post.id}.html`);
  fs.writeFileSync(rutaHtml, html);

  const page = await navegador.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  try {
    await page.goto(pathToFileURL(rutaHtml).href, { waitUntil: "load" });
    await page.waitForSelector('body[data-listo="1"]', { timeout: 15000 });
    const png = await page.screenshot({ type: "png", fullPage: false });
    const rutaSalida = path.join(raiz, destino);
    fs.mkdirSync(path.dirname(rutaSalida), { recursive: true });
    await sharp(png).jpeg({ quality: 88, progressive: true, mozjpeg: true }).toFile(rutaSalida);
  } finally {
    await page.close();
  }
  return {
    ruta: destino,
    url: urlImagen(config.pages.baseUrl, post.id),
    hash: hashImagen(post, version),
    version,
    renderizada: new Date().toISOString(),
  };
}
