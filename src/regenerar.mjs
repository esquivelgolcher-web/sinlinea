// REGENERAR: vuelve a renderizar imágenes desactualizadas o fallidas.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cargarConfiguracion } from "./lib/config.mjs";
import { leerPosts, escribirPost, urlImagen, rutaIlustracion, CUENTA_LEGADO } from "./lib/posts.mjs";
import { imagenDesactualizada, renderOk, marcarError, necesitaIlustracion, necesitaEscena, hashTexto } from "./lib/estados.mjs";
import { versionPlantilla, RUTA_PLANTILLA, RUTA_LOGO, abrirNavegador, renderizarPost, estiloVisual } from "./lib/render.mjs";
import { crearIlustrador, guardarIlustracion, sanearMensaje } from "./lib/ilustrador.mjs";
import { acortarTextos, escribirEscena } from "./lib/redactor.mjs";
import { renderizarConAjuste } from "./lib/texto.mjs";
import Anthropic from "@anthropic-ai/sdk";
import { todasFallaron, anotarFallos, resumirResultados } from "./lib/corrida.mjs";
import { ocultarSecretos } from "./lib/secretos.mjs";

export async function ejecutarRegenerar({ config, raiz = process.cwd(), ahora = new Date(), render, log = console, version, ilustrador = null, guardar = guardarIlustracion, acortar = null, redactarEscena = null, estiloActual = null }) {
  const dir = path.join(raiz, "posts");
  const iso = ahora.toISOString();
  const actual = version ?? versionPlantilla(fs.readFileSync(path.join(raiz, RUTA_PLANTILLA), "utf8"));
  const rutaLogo = config.rutas?.logo || RUTA_LOGO;
  const estilo = estiloActual ?? estiloVisual(config, fs.existsSync(path.join(raiz, rutaLogo)) ? rutaLogo : null);
  const cuenta = config.cuenta || CUENTA_LEGADO;
  const opcionesLectura = { cuentaPorDefecto: config.cuentaPrincipal || CUENTA_LEGADO };
  // Solo los posts de esta cuenta; los antiguos sin campo `cuenta` pertenecen a la cuenta principal.
  const esActivo = (p) => p.cuenta === cuenta && ["borrador", "programado", "error"].includes(p.estado);
  // 1) Escenas: posts marcados para ilustrar pero sin escena (p. ej. borradores antiguos) → Claude la redacta.
  const tope = config.ilustraciones.maxPorCorrida;
  const sinEscena = leerPosts(dir, opcionesLectura).filter((p) => esActivo(p) && necesitaEscena(p, ahora));
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
  const activos = leerPosts(dir, opcionesLectura).filter(esActivo);
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
  const vigentes = leerPosts(dir, opcionesLectura).filter(esActivo);
  const pendientes = vigentes.filter((p) =>
    imagenDesactualizada(p, actual)
    || (p.estado === "error" && p.error?.paso === "render")
    || (p.imagen && p.imagen.url !== urlImagen(config.pages.baseUrl, p.id))
    || (typeof p.imagen?.estilo === "string" && p.imagen.estilo !== estilo) // cambió la paleta o el logo de la cuenta
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

// Ejecuta REGENERAR para cada cuenta activa; un fallo en una cuenta no detiene a las demás.
// `ilustradorDe`, `acortarDe` y `redactarEscenaDe` reciben la configuración efectiva de la cuenta.
export async function regenerarCuentas({ configuracion, raiz = process.cwd(), ahora = new Date(), render, log = console, version, ilustrador = null, guardar = guardarIlustracion, acortar = null, redactarEscena = null, ilustradorDe = null, acortarDe = null, redactarEscenaDe = null }) {
  const resultados = {};
  for (const e of configuracion.errores || []) {
    resultados[e.cuenta] = { error: ocultarSecretos(e.mensaje) };
    (log.error || log.warn)(`Cuenta ${e.cuenta}: configuración inválida, se omite (${ocultarSecretos(e.mensaje)}).`);
  }
  for (const config of configuracion.cuentas) {
    try {
      resultados[config.cuenta] = await ejecutarRegenerar({
        config, raiz, ahora, render, log, version, guardar,
        ilustrador: config.ilustraciones?.activo === false ? null : (ilustradorDe ? ilustradorDe(config) : ilustrador),
        acortar: acortarDe ? acortarDe(config) : acortar,
        redactarEscena: redactarEscenaDe ? redactarEscenaDe(config) : redactarEscena,
      });
    } catch (err) {
      const mensaje = ocultarSecretos(err.message);
      resultados[config.cuenta] = { error: mensaje };
      (log.error || log.warn)(`Cuenta ${config.cuenta}: falló REGENERAR (${mensaje}); se continúa con las demás.`);
    }
  }
  return { resultados };
}

async function main() {
  const configuracion = cargarConfiguracion();
  const global = configuracion.global;
  const conGemini = global.ilustraciones.activo && process.env.GEMINI_API_KEY;
  if (global.ilustraciones.activo && !process.env.GEMINI_API_KEY) console.info("Sin GEMINI_API_KEY: los posts saldrán sin ilustración.");
  const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
  if (!client) console.info("Sin ANTHROPIC_API_KEY: los titulares que no quepan quedarán en error para corregirlos en el panel.");
  const navegador = await abrirNavegador();
  try {
    const r = await regenerarCuentas({
      configuracion,
      render: (post, o) => renderizarPost(post, { ...o, navegador }),
      ilustradorDe: (config) => (conGemini ? crearIlustrador({ apiKey: process.env.GEMINI_API_KEY, config }) : null),
      acortarDe: (config) => (client ? (a) => acortarTextos({ client, config, ...a }) : null),
      redactarEscenaDe: (config) => (client ? (a) => escribirEscena({ client, config, ...a }) : null),
    });
    console.log(`Listo: ${resumirResultados(r.resultados, (x) => `${x.renderizados.length} regeneradas, ${x.fallidos.length} fallidas`)}.`);
    anotarFallos(r.resultados, "REGENERAR");
    if (todasFallaron(r.resultados)) process.exitCode = 1;
  } finally {
    await navegador.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(`Error en regenerar: ${err.message}`); process.exit(1); });
}
