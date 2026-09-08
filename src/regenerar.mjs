// REGENERAR: vuelve a renderizar imágenes desactualizadas o fallidas.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cargarConfig } from "./lib/config.mjs";
import { leerPosts, escribirPost, urlImagen, rutaIlustracion } from "./lib/posts.mjs";
import { imagenDesactualizada, renderOk, marcarError, necesitaIlustracion, hashTexto } from "./lib/estados.mjs";
import { versionPlantilla, RUTA_PLANTILLA, abrirNavegador, renderizarPost } from "./lib/render.mjs";
import { crearIlustrador, guardarIlustracion } from "./lib/ilustrador.mjs";

export async function ejecutarRegenerar({ config, raiz = process.cwd(), ahora = new Date(), render, log = console, version, ilustrador = null, guardar = guardarIlustracion }) {
  const dir = path.join(raiz, "posts");
  const iso = ahora.toISOString();
  const actual = version ?? versionPlantilla(fs.readFileSync(path.join(raiz, RUTA_PLANTILLA), "utf8"));
  const activos = leerPosts(dir).filter((p) => ["borrador", "programado", "error"].includes(p.estado));
  const regeneradas = new Set();
  if (ilustrador) {
    for (const p of activos) {
      if (!necesitaIlustracion(p, ahora)) continue;
      const ruta = rutaIlustracion(p.id);
      let nuevo;
      try {
        const buf = await ilustrador.generar(p.ilustracion.descripcion);
        await guardar(buf, path.join(raiz, ruta));
        nuevo = { ...p, ilustracion: { ...p.ilustracion, ruta, hashDescripcion: hashTexto(p.ilustracion.descripcion), proveedor: config.ilustraciones.proveedor, modelo: config.ilustraciones.modelo, generada: iso, error: null }, actualizado: iso };
        regeneradas.add(p.id);
        log.info(`Ilustración regenerada: ${p.id}`);
      } catch (err) {
        nuevo = { ...p, ilustracion: { ...p.ilustracion, error: { mensaje: err.message, fecha: iso } }, actualizado: iso };
        log.warn(`Ilustración falló para ${p.id}: ${err.message}`);
      }
      escribirPost(dir, nuevo);
    }
  }
  const vigentes = leerPosts(dir).filter((p) => ["borrador", "programado", "error"].includes(p.estado));
  const pendientes = vigentes.filter((p) =>
    imagenDesactualizada(p, actual)
    || (p.estado === "error" && p.error?.paso === "render")
    || (p.imagen && p.imagen.url !== urlImagen(config.pages.baseUrl, p.id))
    || regeneradas.has(p.id));
  const resultado = { renderizados: [], fallidos: [] };
  if (!pendientes.length) { log.info("Ninguna imagen que regenerar."); return resultado; }
  for (const p of pendientes) {
    try {
      const imagen = await render(p, { config, raiz });
      escribirPost(dir, renderOk(p, imagen, iso));
      resultado.renderizados.push(p.id);
      log.info(`Imagen regenerada: ${p.id}`);
    } catch (err) {
      escribirPost(dir, marcarError(p, { paso: "render", mensaje: err.message }, iso));
      resultado.fallidos.push(p.id);
      log.warn(`Render falló para ${p.id}: ${err.message}`);
    }
  }
  return resultado;
}

async function main() {
  const config = cargarConfig();
  const ilustrador = config.ilustraciones.activo && process.env.GEMINI_API_KEY ? crearIlustrador({ apiKey: process.env.GEMINI_API_KEY, config }) : null;
  if (config.ilustraciones.activo && !process.env.GEMINI_API_KEY) console.info("Sin GEMINI_API_KEY: los posts saldrán sin ilustración.");
  const navegador = await abrirNavegador();
  try {
    const r = await ejecutarRegenerar({ config, render: (post, o) => renderizarPost(post, { ...o, navegador }), ilustrador });
    console.log(`Listo: ${r.renderizados.length} regeneradas, ${r.fallidos.length} fallidas.`);
  } finally {
    await navegador.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(`Error en regenerar: ${err.message}`); process.exit(1); });
}
