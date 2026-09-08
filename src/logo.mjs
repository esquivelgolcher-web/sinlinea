// LOGO: genera el logo cuadrado de una cuenta (iniciales en Anton sobre un fondo liso) como PNG,
// con la misma tipografía y colores que usa la plantilla. Por defecto escribe cuentas/<id>/logo.png.
// Uso: node src/logo.mjs --cuenta <id> [--texto LEG] [--fondo #3B2B1F] [--letra #E9E4DA] [--tamano 1024] [--salida ruta.png]
// Ejemplo versión clara: node src/logo.mjs --cuenta luiseskivelgolcher --fondo #FFFFFF --letra #111111 --salida cuentas/luiseskivelgolcher/logo-claro.png
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { cargarConfiguracion } from "./lib/config.mjs";
import { abrirNavegador, iniciales } from "./lib/render.mjs";

const RE_COLOR = /^#[0-9A-Fa-f]{6}$/;
const PROPORCION_LETRAS = 0.68; // las letras ocupan ~2/3 del ancho, como en la referencia de la marca

// Opciones efectivas del logo: lo que venga en `argumentos` manda; si no, iniciales de la marca y colores oscuro/principal.
export function opcionesDeLogo(config, argumentos = {}) {
  const texto = argumentos.texto ?? iniciales(config.marca?.nombre);
  if (typeof texto !== "string" || !texto.trim()) throw new Error("texto: hacen falta las letras del logo");
  const fondo = argumentos.fondo ?? config.marca.colores.oscuro;
  if (!RE_COLOR.test(fondo)) throw new Error("fondo debe ser un color #RRGGBB");
  const letra = argumentos.letra ?? config.marca.colores.principal;
  if (!RE_COLOR.test(letra)) throw new Error("letra debe ser un color #RRGGBB");
  const tamano = argumentos.tamano === undefined ? 1024 : Number(argumentos.tamano);
  if (!Number.isInteger(tamano) || tamano < 64) throw new Error("tamano debe ser un entero de al menos 64 píxeles");
  const salida = argumentos.salida ?? (config.rutas?.logo || `cuentas/${config.cuenta}/logo.png`);
  return { texto: texto.trim(), fondo, letra, tamano, salida };
}

// Dibuja el logo en un lienzo del navegador (para usar la fuente Anton de assets/fonts) y lo guarda como PNG.
// Las letras se centran por su tinta real (métricas del texto), no por la caja de línea.
export async function generarLogo({ texto, fondo, letra, tamano = 1024, salida, navegador, raiz = process.cwd() }) {
  const baseHref = pathToFileURL(path.resolve(raiz) + path.sep).href;
  const html = [
    "<!doctype html><html><head><meta charset=\"utf-8\">",
    `<base href="${baseHref}">`,
    "<style>@font-face { font-family: \"Anton\"; src: url(\"assets/fonts/Anton-Regular.ttf\") format(\"truetype\"); font-display: block; }",
    "html, body { margin: 0; padding: 0; background: #888; }</style>",
    "</head><body><canvas id=\"lienzo\"></canvas></body></html>",
  ].join("");
  const dirTemp = path.join(raiz, "temp", "render");
  fs.mkdirSync(dirTemp, { recursive: true });
  const rutaHtml = path.join(dirTemp, `logo-${process.pid}-${Date.now()}.html`);
  fs.writeFileSync(rutaHtml, html);
  const page = await navegador.newPage({ viewport: { width: tamano, height: tamano }, deviceScaleFactor: 1 });
  try {
    await page.goto(pathToFileURL(rutaHtml).href, { waitUntil: "load" });
    const dataUrl = await page.evaluate(async ({ texto, fondo, letra, tamano, proporcion }) => {
      await document.fonts.load('100px "Anton"');
      const lienzo = document.getElementById("lienzo");
      lienzo.width = tamano;
      lienzo.height = tamano;
      const ctx = lienzo.getContext("2d");
      ctx.fillStyle = fondo;
      ctx.fillRect(0, 0, tamano, tamano);
      if ("letterSpacing" in ctx) ctx.letterSpacing = "0.02em";
      const objetivo = tamano * proporcion;
      let size = tamano;
      const medir = () => { ctx.font = `${size}px "Anton"`; return ctx.measureText(texto); };
      let m = medir();
      while (m.actualBoundingBoxLeft + m.actualBoundingBoxRight > objetivo && size > 8) { size -= 2; m = medir(); }
      const anchoTinta = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
      const altoTinta = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
      ctx.fillStyle = letra;
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
      ctx.fillText(texto, (tamano - anchoTinta) / 2 + m.actualBoundingBoxLeft, (tamano - altoTinta) / 2 + m.actualBoundingBoxAscent);
      return lienzo.toDataURL("image/png");
    }, { texto, fondo, letra, tamano, proporcion: PROPORCION_LETRAS });
    const png = Buffer.from(dataUrl.split(",")[1], "base64");
    const rutaSalida = path.join(raiz, salida);
    fs.mkdirSync(path.dirname(rutaSalida), { recursive: true });
    await sharp(png).png({ compressionLevel: 9 }).toFile(rutaSalida);
  } finally {
    await page.close();
    fs.rmSync(rutaHtml, { force: true });
  }
  return { ruta: salida, texto, fondo, letra, tamano };
}

async function main() {
  const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
  const cuenta = arg("--cuenta");
  if (!cuenta) throw new Error("Uso: node src/logo.mjs --cuenta <id> [--texto LEG] [--fondo #RRGGBB] [--letra #RRGGBB] [--tamano 1024] [--salida ruta.png]");
  const configuracion = cargarConfiguracion();
  const config = configuracion.cuentas.find((c) => c.cuenta === cuenta);
  if (!config) throw new Error(`La cuenta "${cuenta}" no está declarada o su configuración es inválida`);
  const opciones = opcionesDeLogo(config, { texto: arg("--texto"), fondo: arg("--fondo"), letra: arg("--letra"), tamano: arg("--tamano"), salida: arg("--salida") });
  const navegador = await abrirNavegador();
  try {
    const r = await generarLogo({ ...opciones, navegador });
    console.log(`Listo: ${r.ruta} (${r.texto}, ${r.tamano}x${r.tamano}, fondo ${r.fondo}, letras ${r.letra})`);
  } finally {
    await navegador.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(`Error en logo: ${err.message}`); process.exit(1); });
}
