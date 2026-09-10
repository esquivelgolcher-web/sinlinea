// Renueva el token de larga duración de Instagram (y, F2, el de Threads de las cuentas que lo tienen) y registra su vencimiento.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cargarConfiguracion } from "./lib/config.mjs";
import { crearClienteInstagram } from "./lib/instagram.mjs";
import { crearClienteThreads } from "./lib/threads.mjs";
import { conexionDe, SECRETOS_RED } from "./lib/conexiones.mjs";
import { claveDia, ZONA_PANAMA } from "./lib/fechas.mjs";
import { ocultarSecretos, leerSecretos, leerSecretosDeRed, nombresDeSecretos, origenDeSecretos, describirCredenciales } from "./lib/secretos.mjs";
import { anotarFallos } from "./lib/corrida.mjs";

// Renueva un token y deja el valor nuevo en temp/nuevo-token-<NOMBRE_DEL_SECRETO>.txt (carpeta ignorada
// por git) para que el workflow lo guarde como secreto y lo borre. El valor nunca se registra. `ig` es cualquier cliente
// con refrescarToken() (Instagram o Threads); `archivoInfo` es el registro de vencimiento de esa red.
export async function ejecutarRenovar({ raiz = process.cwd(), ahora = new Date(), ig, log = console, zona = ZONA_PANAMA, rutaDatos = "data", nombreSecreto = "IG_ACCESS_TOKEN", archivoInfo = "token-info.json", red = "Instagram" }) {
  const { token, expiraEnSegundos } = await ig.refrescarToken();
  const vence = claveDia(new Date(ahora.getTime() + expiraEnSegundos * 1000), zona);
  const info = { vence, renovado: claveDia(ahora, zona) };
  fs.mkdirSync(path.join(raiz, rutaDatos), { recursive: true });
  fs.writeFileSync(path.join(raiz, rutaDatos, archivoInfo), JSON.stringify(info, null, 2) + "\n");
  fs.mkdirSync(path.join(raiz, "temp"), { recursive: true });
  fs.writeFileSync(path.join(raiz, "temp", `nuevo-token-${nombreSecreto}.txt`), token);
  log.info(`Token de ${red} (${nombreSecreto}) renovado; vence el ${vence}.`);
  return { vence };
}

export const ARCHIVO_INFO_THREADS = "token-info-threads.json";

// Renueva el token de cada cuenta que tenga sus secretos en el entorno. `igDe(config, secretos)` crea el cliente de
// Instagram; `threadsDe(config, secretos)` el de Threads, solo para cuentas en modo Environment con perfil de Threads
// declarado (job por cuenta). Un fallo en Threads no afecta a la renovación de Instagram ni al revés.
export async function renovarCuentas({ configuracion, raiz = process.cwd(), ahora = new Date(), env = process.env, igDe, threadsDe = null, log = console, soloCuenta = null, porCuenta = false }) {
  const resultados = {};
  for (const e of configuracion.errores || []) {
    if (soloCuenta && e.cuenta !== soloCuenta) continue;
    resultados[e.cuenta] = { error: e.mensaje };
    (log.error || log.warn)(`Cuenta ${e.cuenta}: configuración inválida, se omite (${e.mensaje}).`);
  }
  for (const config of configuracion.cuentas) {
    if (soloCuenta && config.cuenta !== soloCuenta) continue;
    if (config.archivada) { resultados[config.cuenta] = { motivo: "archivada" }; log.info(`Cuenta ${config.cuenta}: archivada, no se renueva su token.`); continue; }
    if (!porCuenta && origenDeSecretos(config) === "entorno") {
      resultados[config.cuenta] = { motivo: "entorno-requiere-job-por-cuenta" };
      log.warn(`Cuenta ${config.cuenta}: sus credenciales viven en el Environment cuenta-${config.cuenta}; solo se renuevan en el job por cuenta. Se omite aquí.`);
      continue;
    }
    log.info(`Cuenta ${config.cuenta}: credenciales · ${describirCredenciales(config, { porCuenta })}`);
    let resultado;
    try {
      const secretos = leerSecretos(config, env, { porCuenta });
      const ig = await igDe(config, secretos);
      resultado = await ejecutarRenovar({ raiz, ahora, ig, log, zona: config.zonaHoraria, rutaDatos: config.rutas?.datos || "data", nombreSecreto: nombresDeSecretos(config, { porCuenta }).token });
    } catch (err) {
      const mensaje = ocultarSecretos(err.message);
      resultado = { error: mensaje };
      log.warn(`Cuenta ${config.cuenta}: no se renovó el token (${mensaje}); se continúa con las demás.`);
    }
    // F2: el token de Threads vive en el mismo Environment (THREADS_ACCESS_TOKEN) y se refresca aparte.
    if (threadsDe && porCuenta && origenDeSecretos(config) === "entorno" && conexionDe(config, "threads").usuario) {
      try {
        const secretos = leerSecretosDeRed(config, "threads", env);
        const th = await threadsDe(config, secretos);
        resultado.threads = await ejecutarRenovar({ raiz, ahora, ig: th, log, zona: config.zonaHoraria, rutaDatos: config.rutas?.datos || "data", nombreSecreto: SECRETOS_RED.threads[0], archivoInfo: ARCHIVO_INFO_THREADS, red: "Threads" });
      } catch (err) {
        const mensaje = ocultarSecretos(err.message);
        resultado.threads = { error: mensaje };
        log.warn(`Cuenta ${config.cuenta}: no se renovó el token de Threads (${mensaje}); el de Instagram no se ve afectado.`);
      }
    }
    resultados[config.cuenta] = resultado;
  }
  return { resultados };
}

async function main() {
  const configuracion = cargarConfiguracion();
  const igDe = (config, { token, usuarioId }) => {
    const ig = crearClienteInstagram({ token, usuarioId, apiVersion: config.instagram.apiVersion });
    const original = ig.refrescarToken;
    ig.refrescarToken = async () => { const r = await original(); console.log(`::add-mask::${r.token}`); return r; };
    return ig;
  };
  const threadsDe = (config, { token }) => {
    const th = crearClienteThreads({ token, usuarioId: conexionDe(config, "threads").usuario });
    const original = th.refrescarToken;
    th.refrescarToken = async () => { const r = await original(); console.log(`::add-mask::${r.token}`); return r; };
    return th;
  };
  const porCuenta = process.argv.includes("--por-cuenta");
  const i = process.argv.indexOf("--cuenta");
  const soloCuenta = i >= 0 ? String(process.argv[i + 1] || "").trim() || null : null;
  const r = await renovarCuentas({ configuracion, igDe, threadsDe, soloCuenta, porCuenta });
  anotarFallos(r.resultados, "RENOVAR TOKEN");
  const renovadas = Object.values(r.resultados).filter((x) => !x.error).length;
  if (!renovadas) throw new Error("No se renovó ningún token");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(`Error al renovar el token: ${ocultarSecretos(err.message)}`); process.exit(1); });
}
