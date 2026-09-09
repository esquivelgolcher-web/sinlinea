// CUENTAS ACTIVAS: lista las cuentas no archivadas separadas por origen de credenciales, para que los workflows
// de Instagram construyan una matriz con un job por cuenta sin editar el YAML al añadir cuentas.
// Uso: node src/cuentas-activas.mjs [--raiz <dir>] [--cuenta <id>] [--comprobar-entornos] [--solo-metricas]
//   → imprime `entorno=[...]` y `repositorio=[...]` (una línea por salida, listas para `>> "$GITHUB_OUTPUT"`).
// Con --comprobar-entornos consulta la API de GitHub (solo metadatos, con GH_TOKEN) y anota en cada cuenta de modo
// Environment si su Environment cuenta-<id> tiene IG_ACCESS_TOKEN e IG_USER_ID (`completo`, `motivo`); el job de la
// cuenta lo lee de la matriz y falla antes de contactar con Instagram si no está completo.
// Nunca imprime valores de secretos: solo ids, nombres y estados.
import { pathToFileURL } from "node:url";
import { cargarConfiguracion } from "./lib/config.mjs";
import { origenDeSecretos, nombreEntorno, nombresDeSecretos } from "./lib/secretos.mjs";
import { comprobarEntorno } from "./lib/entornos.mjs";

// `soloMetricas`: solo las cuentas con metricas.recoger = true (recogida diaria de métricas); no mira automatico.*.
export function cuentasActivas(configuracion, { soloCuenta = null, soloMetricas = false } = {}) {
  const entorno = [];
  const repositorio = [];
  for (const config of configuracion.cuentas) {
    if (config.archivada) continue;
    if (soloCuenta && config.cuenta !== soloCuenta) continue;
    if (soloMetricas && config.metricas?.recoger !== true) continue;
    if (origenDeSecretos(config) === "entorno") {
      entorno.push({ cuenta: config.cuenta, entorno: nombreEntorno(config.cuenta) });
    } else {
      const n = nombresDeSecretos(config);
      repositorio.push({ cuenta: config.cuenta, tokenSecreto: n.token, usuarioIdSecreto: n.usuarioId });
    }
  }
  return { entorno, repositorio };
}

// Anota en cada cuenta de modo Environment el resultado de la comprobación (cadenas, para la matriz de Actions).
export async function anotarEntornos(lista, { comprobar }) {
  const salida = [];
  for (const c of lista) {
    const r = await comprobar({ entorno: c.entorno, cuenta: c.cuenta });
    salida.push({ ...c, completo: r.ok ? "true" : "false", motivo: String(r.motivo || "").replace(/\s+/g, " ").trim() });
  }
  return salida;
}

export const listaParaMatriz = (lista) => JSON.stringify(lista);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? String(process.argv[i + 1] || "").trim() || null : null; };
  const raiz = arg("--raiz") || process.cwd();
  const configuracion = cargarConfiguracion(raiz);
  for (const e of configuracion.errores) console.error(`::warning::Cuenta ${e.cuenta} con configuración inválida: se omite (${e.mensaje})`);
  const { entorno, repositorio } = cuentasActivas(configuracion, { soloCuenta: arg("--cuenta"), soloMetricas: process.argv.includes("--solo-metricas") });
  const salida = async () => {
    if (!process.argv.includes("--comprobar-entornos")) return entorno;
    const repo = process.env.GITHUB_REPOSITORY || "";
    const token = process.env.GH_TOKEN || "";
    return anotarEntornos(entorno, { comprobar: ({ entorno: e }) => comprobarEntorno({ repo, entorno: e, token }) });
  };
  salida().then((lista) => {
    for (const c of lista) console.error(`Cuenta ${c.cuenta}: Environment ${c.entorno} ${c.completo === undefined ? "(sin comprobar)" : c.completo === "true" ? "completo" : `INCOMPLETO: ${c.motivo}`}`);
    console.log(`entorno=${listaParaMatriz(lista)}`);
    console.log(`repositorio=${listaParaMatriz(repositorio)}`);
  }).catch((err) => { console.error(`Error al listar las cuentas: ${err.message}`); process.exit(1); });
}
