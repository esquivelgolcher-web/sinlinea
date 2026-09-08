// REGENERAR: vuelve a renderizar imágenes desactualizadas o fallidas.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cargarConfig } from "./lib/config.mjs";
import { leerPosts, escribirPost, urlImagen, rutaIlustracion } from "./lib/posts.mjs";
import { imagenDesactualizada, renderOk, marcarError, necesitaIlustracion, necesitaEscena, hashTexto } from "./lib/estados.mjs";
import { versionPlantilla, RUTA_PLANTILLA, abrirNavegador, renderizarPost } from "./lib/render.mjs";
import { crearIlustrador, guardarIlustracion, sanearMensaje } from "./lib/ilustrador.mjs";
import { acortarTextos, escribirEscena } from "./lib/redactor.mjs";
import { renderizarConAjuste } from "./lib/texto.mjs";
import Anthropic from "@anthropic-ai/sdk";

export async function ejecutarRegenerar({ config, raiz = process.cwd(), ahora = new Date(), render, log = console, version, ilustrador = null, guardar = guardarIlustracion, acortar = null, redactarEscena = null }) {
  const dir = path.join(raiz, "posts");
  const iso = ahora.toISOString();
  const actual = version ?? versionPlantilla(fs.readFileSync(path.join(raiz, RUTA_PLANTILLA), "utf8"));
  const esActivo = (p) => ["borrador", "programado", "error"].includes(p.estado);
  // 1) Escenas: posts marcados para ilustrar pero sin escena (p. ej. borradores antiguos) → Claude la redacta.
  const tope = config.ilustraciones.maxPorCorrida;
  const sinEscena = leerPosts(dir).filter((p) => esActivo(p) && necesitaEscena(p, ahora));
  if (ilustrador && redactarEscena) {
    let escenas = 0;
    for (const p of sinEscena) {
      if (escenas >= tope) { log.info(`Tope de escenas por corrida (${tope}) alcanzado; ${p.id} espera a la siguiente hora.`); break; }
      escenas++;
      let nuevo;
      try {
        const descripcion = await redactarEscena({ titular: p.titular, bajada: p.bajada });
        nuevo = { ...p, ilustracion: { ...p.ilustracion, descripcion, hashDescripcion: null, error: null }, actualizado: iso };
        log.info(`Escena redactada para ${p.id}: "${descripcion}"`);
      } catch (err) {
        const intentos = (p.ilustracion.error?.intentos ?? 0) + 1;
        const ilustracion = { ...p.ilustracion, error: { mensaje: sanearMensaje(err.message), fecha: iso, intentos } };
        if (intentos >= 3) ilustracion.usar = false;
        nuevo = { ...p, ilustracion, actualizado: iso };
        log.warn(`No se pudo redactar la escena de ${p.id}: ${err.message}`);
      }
      escribirPost(dir, nuevo);
    }
  } else if (ilustrador && sinEscena.length) {
    log.info("Hay posts sin escena marcados para ilustrar; sin ANTHROPIC_API_KEY no se puede redactarla.");
  }
  // 2) Ilustraciones.
  const activos = leerPosts(dir).filter(esActivo);
  const regeneradas = new Set();
  if (ilustrador) {
    let llamadas = 0;
    for (const p of activos) {
      if (!necesitaIlustracion(p, ahora)) continue;
      if (llamadas >= tope) { log.info(`Tope de ilustraciones por corrida (${tope}) alcanzado; ${p.id} espera a la siguiente hora.`); continue; }
      llamadas++;
      const ruta = rutaIlustracion(p.id);
      let nuevo;
      try {
        const buf = await ilustrador.generar(p.ilustracion.descripcion);
        await guardar(buf, path.join(raiz, ruta));
        nuevo = { ...p, ilustracion: { ...p.ilustracion, ruta, hashDescripcion: hashTexto(p.ilustracion.descripcion), proveedor: config.ilustraciones.proveedor, modelo: config.ilustraciones.modelo, generada: iso, error: null }, actualizado: iso };
        regeneradas.add(p.id);
        log.info(`Ilustración regenerada: ${p.id}`);
      } catch (err) {
        const intentos = (p.ilustracion.error?.intentos ?? 0) + 1;
        const ilustracion = { ...p.ilustracion, error: { mensaje: sanearMensaje(err.message), fecha: iso, intentos } };
        if (intentos >= 3) ilustracion.usar = false;
        nuevo = { ...p, ilustracion, actualizado: iso };
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
      const { post: ajustado, imagen } = await renderizarConAjuste({ post: p, acortar, log, render: (q) => render(q, { config, raiz }) });
      escribirPost(dir, renderOk(ajustado, imagen, iso));
      resultado.renderizados.push(p.id);
      log.info(`Imagen regenerada: ${p.id}`);
    } catch (err) {
      escribirPost(dir, marcarError(err.post ?? p, { paso: "render", mensaje: err.message }, iso));
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
  const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
  const acortar = client ? (a) => acortarTextos({ client, config, ...a }) : null;
  const redactarEscena = client ? (a) => escribirEscena({ client, config, ...a }) : null;
  if (!process.env.ANTHROPIC_API_KEY) console.info("Sin ANTHROPIC_API_KEY: los titulares que no quepan quedarán en error para corregirlos en el panel.");
  const navegador = await abrirNavegador();
  try {
    const r = await ejecutarRegenerar({ config, render: (post, o) => renderizarPost(post, { ...o, navegador }), ilustrador, acortar, redactarEscena });
    console.log(`Listo: ${r.renderizados.length} regeneradas, ${r.fallidos.length} fallidas.`);
  } finally {
    await navegador.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(`Error en regenerar: ${err.message}`); process.exit(1); });
}
