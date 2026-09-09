// CUENTAS ACTIVAS: lista las cuentas no archivadas separadas por origen de credenciales, para que los workflows
// de Instagram construyan una matriz con un job por cuenta sin editar el YAML al añadir cuentas.
// Uso: node src/cuentas-activas.mjs [--raiz <dir>] [--cuenta <id>]   → imprime `entorno=[...]` y `repositorio=[...]`
// (una línea por salida, listas para `>> "$GITHUB_OUTPUT"`). Nunca imprime valores de secretos: solo ids y nombres.
import { pathToFileURL } from "node:url";
import { cargarConfiguracion } from "./lib/config.mjs";
import { origenDeSecretos, nombreEntorno, nombresDeSecretos } from "./lib/secretos.mjs";

export function cuentasActivas(configuracion, { soloCuenta = null } = {}) {
  const entorno = [];
  const repositorio = [];
  for (const config of configuracion.cuentas) {
    if (config.archivada) continue;
    if (soloCuenta && config.cuenta !== soloCuenta) continue;
    if (origenDeSecretos(config) === "entorno") {
      entorno.push({ cuenta: config.cuenta, entorno: nombreEntorno(config.cuenta) });
    } else {
      const n = nombresDeSecretos(config);
      repositorio.push({ cuenta: config.cuenta, tokenSecreto: n.token, usuarioIdSecreto: n.usuarioId });
    }
  }
  return { entorno, repositorio };
}

export const listaParaMatriz = (lista) => JSON.stringify(lista);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? String(process.argv[i + 1] || "").trim() || null : null; };
  const raiz = arg("--raiz") || process.cwd();
  const configuracion = cargarConfiguracion(raiz);
  for (const e of configuracion.errores) console.error(`::warning::Cuenta ${e.cuenta} con configuración inválida: se omite (${e.mensaje})`);
  const { entorno, repositorio } = cuentasActivas(configuracion, { soloCuenta: arg("--cuenta") });
  console.log(`entorno=${listaParaMatriz(entorno)}`);
  console.log(`repositorio=${listaParaMatriz(repositorio)}`);
}
