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
import { redactar, redactarPerfil, acortarTextos, extraerFrase } from "./lib/redactor.mjs";
import { descargarArticulo } from "./lib/articulo.mjs";
import { frasesCreadasHoy, elegirDelBanco, esLiteral, crearPostFrase, MAX_FRASE } from "./lib/frases.mjs";
import { agruparCandidatos } from "./lib/temas.mjs";
import { renderizarConAjuste } from "./lib/texto.mjs";
import { todasFallaron, anotarFallos, resumirResultados } from "./lib/corrida.mjs";
import { ocultarSecretos } from "./lib/secretos.mjs";
import { recortarCaption } from "./lib/caption.mjs";
import { marcarError, renderOk, hashTexto } from "./lib/estados.mjs";
import { abrirNavegador, renderizarPost, renderizarCarrusel, renderizarFrase } from "./lib/render.mjs";
import { claveDia } from "./lib/fechas.mjs";
import { crearIlustrador, guardarIlustracion, sanearMensaje } from "./lib/ilustrador.mjs";

export async function ejecutarGenerar({ config, raiz = process.cwd(), ahora = new Date(), fetchText, client, render, renderCarrusel = null, log = console, dryRun = false, ilustrador = null, guardar = guardarIlustracion, acortar = null }) {
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

  let seleccion, uso;
  if (config.perfil) {
    // Perfil editorial: los candidatos se agrupan por acontecimiento y solo se redacta sobre grupos con texto legible
    // (completo o parcial); un titular o fragmento (vídeos, resúmenes) es una pista, nunca la base de una pieza.
    const grupos = agruparCandidatos(candidatos);
    const aptos = grupos.filter((g) => g.apto);
    for (const g of grupos.filter((x) => !x.apto)) log.info(`Solo pista (${g.motivo}): ${g.principal.medio} · ${g.principal.titulo}`);
    if (!aptos.length) {
      log.info("Sin candidatos con texto legible; no se llama a Claude.");
      return { creados: [], motivo: "sin-candidatos-legibles" };
    }
    const r = await redactarPerfil({ client, config, editorialMd, grupos: aptos, recientes, max, ahora });
    seleccion = r.seleccion; uso = r.uso;
    for (const d of r.descartados) log.info(`Grupo ${d.indiceGrupo} descartado: ${d.motivo}`);
    log.info(`Claude eligió ${seleccion.length} de ${aptos.length} grupos legibles (${grupos.length - aptos.length} solo pista; tokens: ${uso?.input_tokens ?? "?"} entrada, ${uso?.output_tokens ?? "?"} salida).`);
  } else {
    ({ seleccion, uso } = await redactar({ client, config, editorialMd, candidatos, recientes, max }));
    log.info(`Claude eligió ${seleccion.length} de ${candidatos.length} candidatos (tokens: ${uso?.input_tokens ?? "?"} entrada, ${uso?.output_tokens ?? "?"} salida).`);
  }

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
      referencias: s.referencias || [],
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
    // Carrusel: una imagen por diapositiva. Si no cabe o falla, la pieza se conserva con una nota de revisión.
    if (renderCarrusel && post.formato === "carrusel" && post.carrusel && post.estado !== "error") {
      try {
        const destinoDe = dryRun ? (n) => path.join("temp", "dry-run", "img", `${post.id}-${String(n).padStart(2, "0")}.jpg`) : undefined;
        const c = await renderCarrusel(post, { config, raiz, destinoDe });
        post = { ...post, carrusel: { ...post.carrusel, imagenes: c.imagenes, hash: c.hash, version: c.version } };
        log.info(`Carrusel renderizado para ${post.id} (${c.imagenes.length} diapositivas).`);
      } catch (err) {
        log.warn(`Carrusel falló para ${post.id}: ${err.message}`);
        post = { ...post, revision: { estado: "pendiente", notas: [...(post.revision?.notas || []), `Carrusel sin renderizar: ${err.message}`] } };
      }
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

// Frase célebre del día para una cuenta (formato "frase"): cupo propio (frases.porDia), sin repetir frases ni artículos.
// Con `preferir: "textos"` se ofrecen a Claude los textos más recientes de las fuentes (homilías, discursos…) y solo se
// acepta una frase que aparezca literalmente en el texto; si no la hay, o se prefiere el banco, sale la siguiente frase
// del banco de la cuenta. Sin ilustración: la tipografía es la imagen (templates/frase.html).
export async function ejecutarGenerarFrases({ config, raiz = process.cwd(), ahora = new Date(), fetchText, leerArticulo = null, extraerFrase = null, renderFrase, log = console, dryRun = false }) {
  const cuenta = config.cuenta || CUENTA_LEGADO;
  const f = config.frases || {};
  if (!f.activo) return { creadas: [], motivo: "frases-desactivadas" };
  if (config.automatico?.generar === false) {
    log.info(`Cuenta ${cuenta}: generación automática desactivada; tampoco se generan frases.`);
    return { creadas: [], motivo: "generar-desactivado" };
  }
  const zona = config.zonaHoraria;
  const iso = ahora.toISOString();
  const dir = path.join(raiz, "posts");
  const dirSalida = dryRun ? path.join(raiz, "temp", "dry-run", "posts") : dir;
  const posts = leerPosts(dir, { cuentaPorDefecto: config.cuentaPrincipal || CUENTA_LEGADO }).filter((p) => p.cuenta === cuenta);
  const cupo = (f.porDia || 1) - frasesCreadasHoy(posts, ahora, zona);
  if (cupo <= 0) {
    log.info(`Cuenta ${cuenta}: cupo diario de frases agotado (${f.porDia || 1}).`);
    return { creadas: [], motivo: "cupo-frases" };
  }
  let eleccion = null;
  if ((f.preferir || "textos") === "textos" && extraerFrase && config.fuentes?.length) {
    const usadas = new Set(posts.filter((p) => p.frase?.url).map((p) => p.frase.url));
    const candidatos = (await recolectar(config, { fetchText, ahora, log, filtrar: (u) => !usadas.has(u) }))
      .sort((a, b) => Date.parse(b.fecha || 0) - Date.parse(a.fecha || 0))
      .slice(0, f.maxTextos || 3);
    const lector = leerArticulo || (async (url) => { const a = await descargarArticulo(url, { fetchText }); return { titulo: a.titulo, fecha: a.fecha, texto: (a.parrafos || []).join("\n") }; });
    const textos = [];
    for (const c of candidatos) {
      try {
        const a = await lector(c.url);
        if (a && String(a.texto || "").trim()) textos.push({ url: c.url, medio: c.medio, titulo: a.titulo || c.titulo, fecha: a.fecha || c.fecha, texto: String(a.texto) });
      } catch (err) {
        log.warn(`Texto no accesible ${c.url}: ${err.message}`);
      }
    }
    if (textos.length) {
      const r = await extraerFrase({ textos });
      if (r && Number.isInteger(r.indice) && textos[r.indice]) {
        const t = textos[r.indice];
        if (esLiteral(r.frase, t.texto) && String(r.frase).trim().length <= MAX_FRASE) {
          eleccion = { frase: { texto: r.frase.trim(), autor: r.autor, fuente: r.fuente, anio: new Date(t.fecha || ahora).getUTCFullYear(), url: t.url }, origen: "texto", articulo: { medio: t.medio, url: t.url, titulo: t.titulo, fecha: t.fecha } };
        } else {
          log.warn(`Cuenta ${cuenta}: la frase propuesta no aparece literalmente en ${t.url} (o es demasiado larga); se descarta y se usa el banco.`);
        }
      }
    }
  }
  if (!eleccion) {
    const b = elegirDelBanco(f.banco || [], posts);
    if (b) eleccion = { frase: b, origen: "banco", articulo: null };
  }
  if (!eleccion) {
    log.info(`Cuenta ${cuenta}: sin frase disponible (banco agotado y sin frase literal en los textos del día).`);
    return { creadas: [], motivo: "sin-frases" };
  }
  let post = crearPostFrase({ frase: eleccion.frase, origen: eleccion.origen, articulo: eleccion.articulo, config, ahora, zona, cuenta, variante: siguienteVariante(posts) });
  try {
    const destino = dryRun ? path.join("temp", "dry-run", "img", `${post.id}.jpg`) : undefined;
    const imagen = await renderFrase(post, { config, raiz, destino });
    post = renderOk(post, imagen, iso);
  } catch (err) {
    log.warn(`Render de la frase falló para ${post.id}: ${err.message}`);
    post = marcarError(post, { paso: "render", mensaje: err.message }, iso);
  }
  escribirPost(dirSalida, post);
  log.info(`Frase ${post.id} (${eleccion.origen}): “${post.frase.texto.slice(0, 70)}${post.frase.texto.length > 70 ? "…" : ""}” — ${post.frase.autor}`);
  return { creadas: [post], motivo: "ok" };
}

// Ejecuta GENERAR para cada cuenta activa. Un fallo en una cuenta se registra y no detiene a las demás.
// `ilustradorDe(config)` y `acortarDe(config)` crean las dependencias que dependen de cada cuenta
// (estilo de ilustración, idioma); si no se pasan, se usan `ilustrador` y `acortar` tal cual.
// `soloCuenta`: procesa una sola cuenta. `forzar` (solo con `soloCuenta`): una generación única aunque su
// `automatico.generar` esté apagado; la configuración no cambia y las demás cuentas no se tocan.
export async function generarCuentas({ configuracion, raiz = process.cwd(), ahora = new Date(), fetchText, client, render, renderCarrusel = null, log = console, dryRun = false, ilustrador = null, guardar = guardarIlustracion, acortar = null, ilustradorDe = null, acortarDe = null, soloCuenta = null, forzar = false, renderFrase = null, leerArticulo = null, extraerFrase = null, extraerFraseDe = null }) {
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
        config, raiz, ahora, fetchText, client, render, renderCarrusel, log, dryRun, guardar,
        ilustrador: config.ilustraciones?.activo === false ? null : (ilustradorDe ? ilustradorDe(config) : ilustrador),
        acortar: acortarDe ? acortarDe(config) : acortar,
      });
      // Frases célebres (si la cuenta las tiene activas): un paso aparte, con su propio cupo, tras las noticias.
      if (renderFrase && config.frases?.activo) {
        resultados[config.cuenta].frases = await ejecutarGenerarFrases({
          config, raiz, ahora, fetchText, leerArticulo, renderFrase, log, dryRun,
          extraerFrase: extraerFraseDe ? extraerFraseDe(config) : extraerFrase,
        });
      }
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
      renderCarrusel: (post, o) => renderizarCarrusel(post, { ...o, navegador }),
      renderFrase: (post, o) => renderizarFrase(post, { ...o, navegador }),
      ilustradorDe: (config) => (conGemini ? crearIlustrador({ apiKey: process.env.GEMINI_API_KEY, config }) : null),
      acortarDe: (config) => (a) => acortarTextos({ client, config, ...a }),
      extraerFraseDe: (config) => (a) => extraerFrase({ client, config, ...a }),
    });
    console.log(`Listo: ${resumirResultados(r.resultados, (x) => `${x.creados.length} borradores (${x.motivo})${x.frases ? ` · ${x.frases.creadas.length} frase(s) (${x.frases.motivo})` : ""}`)}${dryRun ? " [dry-run]" : ""}.`);
    anotarFallos(r.resultados, "GENERAR");
    if (todasFallaron(r.resultados)) process.exitCode = 1;
  } finally {
    await navegador.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(`Error en generar: ${err.message}`); process.exit(1); });
}
