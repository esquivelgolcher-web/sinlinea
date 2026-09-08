// BORRADOR MANUAL: crea un post en estado borrador para una cuenta a partir de un archivo JSON,
// sin Claude ni credenciales de Instagram. Lo dibuja en local si hay Chromium; si no, REGENERAR lo hará.
// Uso: node src/borrador.mjs --cuenta <id> --entrada <archivo.json> [--sin-render]
// Entrada: { categoria, titular, bajada, caption, hashtags: [], variante?, escena?,
//            fuente: { medio, url, titulo, publicado } }
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cargarConfiguracion } from "./lib/config.mjs";
import { crearPost, escribirPost, leerPosts, siguienteVariante } from "./lib/posts.mjs";
import { validarTextos } from "./lib/texto.mjs";
import { recortarCaption } from "./lib/caption.mjs";
import { renderOk, marcarError, CATEGORIAS, VARIANTES } from "./lib/estados.mjs";
import { abrirNavegador, renderizarPost } from "./lib/render.mjs";

export async function crearBorradorManual({ configuracion, cuenta, entrada, ahora = new Date(), raiz = process.cwd(), render = null, log = console }) {
  const config = configuracion.cuentas.find((c) => c.cuenta === cuenta);
  if (!config) throw new Error(`La cuenta "${cuenta}" no está declarada o su configuración es inválida`);
  if (!CATEGORIAS.includes(entrada.categoria)) throw new Error(`categoria "${entrada.categoria}" no permitida (${CATEGORIAS.join(", ")})`);
  const v = validarTextos({ titular: entrada.titular, bajada: entrada.bajada });
  if (!v.ok) throw new Error(v.errores.join(" "));
  const f = entrada.fuente || {};
  if (!f.medio || !/^https?:\/\//.test(f.url || "") || Number.isNaN(Date.parse(f.publicado))) {
    throw new Error("fuente debe tener medio, url (http/https) y publicado (fecha ISO)");
  }
  const dir = path.join(raiz, "posts");
  const propios = leerPosts(dir, { log }).filter((p) => p.cuenta === cuenta);
  const variante = entrada.variante && VARIANTES.includes(entrada.variante) ? entrada.variante : siguienteVariante(propios);
  const iso = ahora.toISOString();
  const r = recortarCaption({ caption: entrada.caption, medio: f.medio, hashtags: entrada.hashtags || [] });
  if (r.recortado) log.warn("Caption recortado para respetar los límites de Instagram.");
  let post = crearPost({
    candidato: { medio: f.medio, url: f.url, titulo: f.titulo || entrada.titular, fecha: f.publicado },
    redaccion: { categoria: entrada.categoria, titular: entrada.titular, bajada: entrada.bajada, caption: r.caption, hashtags: r.hashtags, escena: entrada.escena || "" },
    variante, ahora, zona: config.zonaHoraria, cuenta,
  });
  // La ilustración solo se pide a Gemini (en REGENERAR) si la cuenta tiene las ilustraciones activas.
  if (post.ilustracion) post = { ...post, ilustracion: { ...post.ilustracion, usar: Boolean(config.ilustraciones.activo) } };
  if (render) {
    try {
      const imagen = await render(post, { config, raiz });
      post = renderOk(post, imagen, iso);
    } catch (err) {
      log.warn(`Render falló para ${post.id}: ${err.message}; REGENERAR lo reintentará.`);
      post = marcarError(post, { paso: "render", mensaje: err.message }, iso);
    }
  }
  escribirPost(dir, post);
  log.info(`Borrador ${post.id} (${cuenta}, ${post.variante}): ${post.titular}`);
  return post;
}

async function main() {
  const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
  const cuenta = arg("--cuenta");
  const rutaEntrada = arg("--entrada");
  if (!cuenta || !rutaEntrada) throw new Error("Uso: node src/borrador.mjs --cuenta <id> --entrada <archivo.json> [--sin-render]");
  const entrada = JSON.parse(fs.readFileSync(rutaEntrada, "utf8"));
  const configuracion = cargarConfiguracion();
  const sinRender = process.argv.includes("--sin-render");
  const navegador = sinRender ? null : await abrirNavegador();
  try {
    const render = navegador ? (post, o) => renderizarPost(post, { ...o, navegador }) : null;
    const post = await crearBorradorManual({ configuracion, cuenta, entrada, render });
    console.log(`Listo: posts/${post.id}.json (${post.estado})`);
  } finally {
    await navegador?.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(`Error en borrador: ${err.message}`); process.exit(1); });
}
