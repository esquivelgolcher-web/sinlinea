// Renueva el token de larga duración de Instagram y registra su vencimiento.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cargarConfiguracion } from "./lib/config.mjs";
import { crearClienteInstagram } from "./lib/instagram.mjs";
import { claveDia, ZONA_PANAMA } from "./lib/fechas.mjs";
import { ocultarSecretos, leerSecretos, nombresDeSecretos, origenDeSecretos, describirCredenciales } from "./lib/secretos.mjs";
import { anotarFallos } from "./lib/corrida.mjs";

// Renueva un token y deja el valor nuevo en temp/nuevo-token-<NOMBRE_DEL_SECRETO>.txt (carpeta ignorada
// por git) para que el workflow lo guarde como secreto y lo borre. El valor nunca se registra.
export async function ejecutarRenovar({ raiz = process.cwd(), ahora = new Date(), ig, log = console, zona = ZONA_PANAMA, rutaDatos = "data", nombreSecreto = "IG_ACCESS_TOKEN" }) {
  const { token, expiraEnSegundos } = await ig.refrescarToken();
  const vence = claveDia(new Date(ahora.getTime() + expiraEnSegundos * 1000), zona);
  const info = { vence, renovado: claveDia(ahora, zona) };
  fs.mkdirSync(path.join(raiz, rutaDatos), { recursive: true });
  fs.writeFileSync(path.join(raiz, rutaDatos, "token-info.json"), JSON.stringify(info, null, 2) + "\n");
  fs.mkdirSync(path.join(raiz, "temp"), { recursive: true });
  fs.writeFileSync(path.join(raiz, "temp", `nuevo-token-${nombreSecreto}.txt`), token);
  log.info(`Token de Instagram (${nombreSecreto}) renovado; vence el ${vence}.`);
  return { vence };
}

// Renueva el token de cada cuenta que tenga sus secretos en el entorno. `igDe(config, secretos)` crea el cliente.
export async function renovarCuentas({ configuracion, raiz = process.cwd(), ahora = new Date(), env = process.env, igDe, log = console, soloCuenta = null, porCuenta = false }) {
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
    try {
      const secretos = leerSecretos(config, env, { porCuenta });
      const ig = await igDe(config, secretos);
      resultados[config.cuenta] = await ejecutarRenovar({ raiz, ahora, ig, log, zona: config.zonaHoraria, rutaDatos: config.rutas?.datos || "data", nombreSecreto: nombresDeSecretos(config, { porCuenta }).token });
    } catch (err) {
      const mensaje = ocultarSecretos(err.message);
      resultados[config.cuenta] = { error: mensaje };
      log.warn(`Cuenta ${config.cuenta}: no se renovó el token (${mensaje}); se continúa con las demás.`);
    }
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
  const porCuenta = process.argv.includes("--por-cuenta");
  const i = process.argv.indexOf("--cuenta");
  const soloCuenta = i >= 0 ? String(process.argv[i + 1] || "").trim() || null : null;
  const r = await renovarCuentas({ configuracion, igDe, soloCuenta, porCuenta });
  anotarFallos(r.resultados, "RENOVAR TOKEN");
  const renovadas = Object.values(r.resultados).filter((x) => !x.error).length;
  if (!renovadas) throw new Error("No se renovó ningún token");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(`Error al renovar el token: ${ocultarSecretos(err.message)}`); process.exit(1); });
}
