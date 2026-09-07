// REGENERAR: vuelve a renderizar imágenes desactualizadas o fallidas.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cargarConfig } from "./lib/config.mjs";
import { leerPosts, escribirPost, urlImagen } from "./lib/posts.mjs";
import { imagenDesactualizada, renderOk, marcarError } from "./lib/estados.mjs";
import { versionPlantilla, RUTA_PLANTILLA, abrirNavegador, renderizarPost } from "./lib/render.mjs";

export async function ejecutarRegenerar({ config, raiz = process.cwd(), ahora = new Date(), render, log = console, version }) {
  const dir = path.join(raiz, "posts");
  const iso = ahora.toISOString();
  const actual = version ?? versionPlantilla(fs.readFileSync(path.join(raiz, RUTA_PLANTILLA), "utf8"));
  const activos = leerPosts(dir).filter((p) => ["borrador", "programado", "error"].includes(p.estado));
  const pendientes = activos.filter((p) =>
    imagenDesactualizada(p, actual)
    || (p.estado === "error" && p.error?.paso === "render")
    || (p.imagen && p.imagen.url !== urlImagen(config.pages.baseUrl, p.id)));
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
  const navegador = await abrirNavegador();
  try {
    const r = await ejecutarRegenerar({ config, render: (post, o) => renderizarPost(post, { ...o, navegador }) });
    console.log(`Listo: ${r.renderizados.length} regeneradas, ${r.fallidos.length} fallidas.`);
  } finally {
    await navegador.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(`Error en regenerar: ${err.message}`); process.exit(1); });
}
