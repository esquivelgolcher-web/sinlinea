// GENERAR: feeds → candidatos → Claude → render → posts/<id>.json
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { cargarConfig } from "./lib/config.mjs";
import { fetchText as fetchTextReal } from "./lib/rss.mjs";
import { recolectar } from "./lib/fuentes.mjs";
import { cargarVistas, guardarVistas, estaVista, marcarVistas, purgarVistas } from "./lib/seen.mjs";
import { leerPosts, escribirPost, crearPost, siguienteVariante, creadosHoy, archivar } from "./lib/posts.mjs";
import { redactar } from "./lib/redactor.mjs";
import { recortarCaption } from "./lib/caption.mjs";
import { marcarError, renderOk } from "./lib/estados.mjs";
import { abrirNavegador, renderizarPost } from "./lib/render.mjs";
import { claveDia } from "./lib/fechas.mjs";

export async function ejecutarGenerar({ config, raiz = process.cwd(), ahora = new Date(), fetchText, client, render, log = console, dryRun = false }) {
  if (/CAMBIAR/.test(config.pages.baseUrl)) throw new Error("config.json: pages.baseUrl todavía tiene el valor CAMBIAR");
  const zona = config.zonaHoraria;
  const hoy = claveDia(ahora, zona);
  const iso = ahora.toISOString();
  const dirReal = path.join(raiz, "posts");
  const dirSalida = dryRun ? path.join(raiz, "temp", "dry-run", "posts") : dirReal;
  const rutaVistas = path.join(raiz, "data", "seen.json");

  const posts = leerPosts(dirReal);
  let vistas = purgarVistas(cargarVistas(rutaVistas), hoy);

  const cupo = config.generar.maxBorradoresPorDia - creadosHoy(posts, hoy, zona);
  if (cupo <= 0) {
    log.info(`Cupo diario agotado (${config.generar.maxBorradoresPorDia}); no se llama a Claude.`);
    return { creados: [], motivo: "cupo" };
  }

  const urlsEnPosts = new Set(posts.map((p) => p.fuente.url));
  const candidatos = await recolectar(config, {
    fetchText, ahora, log, filtrar: (u) => !estaVista(vistas, u) && !urlsEnPosts.has(u),
  });
  if (!candidatos.length) {
    log.info("Sin candidatos nuevos.");
    return { creados: [], motivo: "sin-candidatos" };
  }

  const limite = ahora.getTime() - config.generar.diasSinRepetir * 86400000;
  const recientes = posts
    .filter((p) => p.estado !== "descartado" && new Date(p.creado).getTime() >= limite)
    .map((p) => p.titular);
  const editorialMd = fs.readFileSync(path.join(raiz, "prompts", "editorial.md"), "utf8");
  const max = Math.min(config.generar.maxPorCorrida, cupo);

  const { seleccion, uso } = await redactar({ client, config, editorialMd, candidatos, recientes, max });
  log.info(`Claude eligió ${seleccion.length} de ${candidatos.length} candidatos (tokens: ${uso?.input_tokens ?? "?"} entrada, ${uso?.output_tokens ?? "?"} salida).`);

  const creados = [];
  const existentes = [...posts];
  for (const s of seleccion) {
    const r = recortarCaption({ caption: s.caption, medio: s.candidato.medio, hashtags: s.hashtags });
    if (r.recortado) log.warn(`Caption recortado para "${s.titular}".`);
    let post = crearPost({
      candidato: s.candidato,
      redaccion: { ...s, caption: r.caption, hashtags: r.hashtags },
      variante: siguienteVariante(existentes),
      ahora, zona,
    });
    try {
      const imagen = await render(post, {
        config, raiz, destino: dryRun ? path.join("temp", "dry-run", "img", `${post.id}.jpg`) : undefined,
      });
      post = renderOk(post, imagen, iso);
    } catch (err) {
      log.warn(`Render falló para ${post.id}: ${err.message}`);
      post = marcarError(post, { paso: "render", mensaje: err.message }, iso);
    }
    escribirPost(dirSalida, post);
    existentes.push(post);
    creados.push(post);
    log.info(`Borrador ${post.id} (${post.variante}): ${post.titular}`);
  }

  if (!dryRun) {
    vistas = marcarVistas(vistas, candidatos.map((c) => c.url), hoy);
    guardarVistas(rutaVistas, vistas);
    const movidos = archivar(dirReal, { ahora, dias: config.archivarDespuesDeDias, zona });
    if (movidos.length) log.info(`Archivados ${movidos.length} posts antiguos.`);
  }
  return { creados, motivo: "ok" };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const config = cargarConfig();
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Falta la variable de entorno ANTHROPIC_API_KEY");
  const client = new Anthropic();
  const navegador = await abrirNavegador();
  try {
    const r = await ejecutarGenerar({
      config, fetchText: fetchTextReal, client, dryRun,
      render: (post, o) => renderizarPost(post, { ...o, navegador }),
    });
    console.log(`Listo: ${r.creados.length} borradores nuevos (${r.motivo})${dryRun ? " [dry-run]" : ""}.`);
  } finally {
    await navegador.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(`Error en generar: ${err.message}`); process.exit(1); });
}
