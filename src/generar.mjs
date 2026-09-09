// GENERAR: feeds → candidatos → Claude → render → posts/<id>.json
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { cargarConfiguracion } from "./lib/config.mjs";
import { fetchText as fetchTextReal } from "./lib/rss.mjs";
import { recolectar } from "./lib/fuentes.mjs";
import { cargarVistas, guardarVistas, estaVista, marcarVistas, purgarVistas } from "./lib/seen.mjs";
import { leerPosts, escribirPost, crearPost, siguienteVariante, creadosHoy, archivar, rutaIlustracion, CUENTA_LEGADO } from "./lib/posts.mjs";
import { redactar, acortarTextos } from "./lib/redactor.mjs";
import { renderizarConAjuste } from "./lib/texto.mjs";
import { todasFallaron, anotarFallos, resumirResultados } from "./lib/corrida.mjs";
import { ocultarSecretos } from "./lib/secretos.mjs";
import { recortarCaption } from "./lib/caption.mjs";
import { marcarError, renderOk, hashTexto } from "./lib/estados.mjs";
import { abrirNavegador, renderizarPost } from "./lib/render.mjs";
import { claveDia } from "./lib/fechas.mjs";
import { crearIlustrador, guardarIlustracion, sanearMensaje } from "./lib/ilustrador.mjs";

export async function ejecutarGenerar({ config, raiz = process.cwd(), ahora = new Date(), fetchText, client, render, log = console, dryRun = false, ilustrador = null, guardar = guardarIlustracion, acortar = null }) {
  if (/CAMBIAR/.test(config.pages.baseUrl)) throw new Error("config.json: pages.baseUrl todavía tiene el valor CAMBIAR");
  const zona = config.zonaHoraria;
  const cuenta = config.cuenta || CUENTA_LEGADO;
  const hoy = claveDia(ahora, zona);
  const iso = ahora.toISOString();
  const dirReal = path.join(raiz, "posts");
  const dirSalida = dryRun ? path.join(raiz, "temp", "dry-run", "posts") : dirReal;
  const rutaVistas = path.join(raiz, config.rutas?.datos || "data", "seen.json");
  const rutaEditorial = path.join(raiz, config.rutas?.editorial || path.join("prompts", "editorial.md"));

  // Solo cuentan los posts de esta cuenta (cupo, repetición de temas, rotación de variantes).
  if (config.automatico?.generar === false) {
    log.info(`Cuenta ${cuenta}: generación automática desactivada (automatico.generar); no se llama a Claude.`);
    return { creados: [], motivo: "generar-desactivado" };
  }
  if (!config.fuentes.length) {
    log.info(`Cuenta ${cuenta}: sin fuentes configuradas; nada que generar.`);
    return { creados: [], motivo: "sin-fuentes" };
  }
  const posts = leerPosts(dirReal, { cuentaPorDefecto: config.cuentaPrincipal || CUENTA_LEGADO }).filter((p) => p.cuenta === cuenta);
  let vistas = purgarVistas(cargarVistas(rutaVistas), hoy);

  const cupo = config.generar.maxBorradoresPorDia - creadosHoy(posts, hoy, zona);
  if (cupo <= 0) {
    log.info(`Cupo diario agotado (${config.generar.maxBorradoresPorDia}); no se llama a Claude.`);
    return { creados: [], motivo: "cupo" };
  }
  // Tope de borradores sin revisar (opcional): evita acumular borradores y coste mientras el operador no aprueba.
  const pendientes = posts.filter((p) => p.estado === "borrador").length;
  if (config.generar.maxBorradoresPendientes && pendientes >= config.generar.maxBorradoresPendientes) {
    log.info(`Cuenta ${cuenta}: ${pendientes} borrador(es) sin revisar (tope ${config.generar.maxBorradoresPendientes}); no se llama a Claude hasta que se revisen.`);
    return { creados: [], motivo: "pendientes" };
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
  const editorialMd = fs.readFileSync(rutaEditorial, "utf8");
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
      ahora, zona, cuenta,
    });
    if (ilustrador && post.ilustracion) {
      const rutaIlus = dryRun ? path.join("temp", "dry-run", "ilus", `${post.id}.jpg`) : rutaIlustracion(post.id);
      try {
        const buf = await ilustrador.generar(post.ilustracion.descripcion);
        await guardar(buf, path.join(raiz, rutaIlus));
        post = { ...post, ilustracion: { ...post.ilustracion, usar: true, ruta: rutaIlus, hashDescripcion: hashTexto(post.ilustracion.descripcion), proveedor: config.ilustraciones.proveedor, modelo: config.ilustraciones.modelo, generada: iso, error: null } };
        log.info(`Ilustración generada para ${post.id}.`);
      } catch (err) {
        log.warn(`Ilustración falló para ${post.id}: ${err.message}`);
        post = { ...post, ilustracion: { ...post.ilustracion, usar: false, error: { mensaje: sanearMensaje(err.message), fecha: iso, intentos: 1 } } };
      }
    }
    try {
      const destino = dryRun ? path.join("temp", "dry-run", "img", `${post.id}.jpg`) : undefined;
      const { post: ajustado, imagen } = await renderizarConAjuste({ post, acortar, log, render: (q) => render(q, { config, raiz, destino }) });
      post = renderOk(ajustado, imagen, iso);
    } catch (err) {
      log.warn(`Render falló para ${post.id}: ${err.message}`);
      post = marcarError(err.post ?? post, { paso: "render", mensaje: err.message }, iso);
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

// Ejecuta GENERAR para cada cuenta activa. Un fallo en una cuenta se registra y no detiene a las demás.
// `ilustradorDe(config)` y `acortarDe(config)` crean las dependencias que dependen de cada cuenta
// (estilo de ilustración, idioma); si no se pasan, se usan `ilustrador` y `acortar` tal cual.
// `soloCuenta`: procesa una sola cuenta. `forzar` (solo con `soloCuenta`): una generación única aunque su
// `automatico.generar` esté apagado; la configuración no cambia y las demás cuentas no se tocan.
export async function generarCuentas({ configuracion, raiz = process.cwd(), ahora = new Date(), fetchText, client, render, log = console, dryRun = false, ilustrador = null, guardar = guardarIlustracion, acortar = null, ilustradorDe = null, acortarDe = null, soloCuenta = null, forzar = false }) {
  if (forzar && !soloCuenta) throw new Error("--forzar exige --cuenta <id>: la generación forzada es siempre de una sola cuenta");
  const resultados = {};
  for (const e of configuracion.errores || []) {
    if (soloCuenta && e.cuenta !== soloCuenta) continue;
    resultados[e.cuenta] = { error: ocultarSecretos(e.mensaje) };
    (log.error || log.warn)(`Cuenta ${e.cuenta}: configuración inválida, se omite (${ocultarSecretos(e.mensaje)}).`);
  }
  for (const cuentaConfig of configuracion.cuentas) {
    if (soloCuenta && cuentaConfig.cuenta !== soloCuenta) continue;
    if (cuentaConfig.archivada) { resultados[cuentaConfig.cuenta] = { creados: [], motivo: "archivada" }; log.info(`Cuenta ${cuentaConfig.cuenta}: archivada, se omite.`); continue; }
    const config = forzar ? { ...cuentaConfig, automatico: { ...(cuentaConfig.automatico || {}), generar: true } } : cuentaConfig;
    if (forzar) log.info(`Cuenta ${config.cuenta}: generación única forzada (la generación automática sigue como estaba).`);
    try {
      log.info(`Cuenta ${config.cuenta}: generando…`);
      resultados[config.cuenta] = await ejecutarGenerar({
        config, raiz, ahora, fetchText, client, render, log, dryRun, guardar,
        ilustrador: config.ilustraciones?.activo === false ? null : (ilustradorDe ? ilustradorDe(config) : ilustrador),
        acortar: acortarDe ? acortarDe(config) : acortar,
      });
    } catch (err) {
      const mensaje = ocultarSecretos(err.message);
      resultados[config.cuenta] = { error: mensaje };
      (log.error || log.warn)(`Cuenta ${config.cuenta}: falló GENERAR (${mensaje}); se continúa con las demás.`);
    }
  }
  return { resultados };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const forzar = process.argv.includes("--forzar");
  const i = process.argv.indexOf("--cuenta");
  const soloCuenta = i >= 0 ? String(process.argv[i + 1] || "").trim() || null : null;
  const configuracion = cargarConfiguracion();
  const global = configuracion.global;
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Falta la variable de entorno ANTHROPIC_API_KEY");
  const client = new Anthropic();
  const conGemini = global.ilustraciones.activo && process.env.GEMINI_API_KEY;
  if (global.ilustraciones.activo && !process.env.GEMINI_API_KEY) console.info("Sin GEMINI_API_KEY: los posts saldrán sin ilustración.");
  const navegador = await abrirNavegador();
  try {
    const r = await generarCuentas({
      configuracion, fetchText: fetchTextReal, client, dryRun, soloCuenta, forzar,
      render: (post, o) => renderizarPost(post, { ...o, navegador }),
      ilustradorDe: (config) => (conGemini ? crearIlustrador({ apiKey: process.env.GEMINI_API_KEY, config }) : null),
      acortarDe: (config) => (a) => acortarTextos({ client, config, ...a }),
    });
    console.log(`Listo: ${resumirResultados(r.resultados, (x) => `${x.creados.length} borradores (${x.motivo})`)}${dryRun ? " [dry-run]" : ""}.`);
    anotarFallos(r.resultados, "GENERAR");
    if (todasFallaron(r.resultados)) process.exitCode = 1;
  } finally {
    await navegador.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(`Error en generar: ${err.message}`); process.exit(1); });
}
