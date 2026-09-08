// Genera una ilustración de prueba con Gemini para verificar clave, modelo y formato de respuesta.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cargarConfig } from "./lib/config.mjs";
import { crearIlustrador, guardarIlustracion } from "./lib/ilustrador.mjs";

export async function ejecutarPrueba({ config, apiKey, raiz = process.cwd(), log = console }) {
  const il = crearIlustrador({ apiKey, config });
  const inicio = Date.now();
  const buf = await il.generar("Vista del Canal de Panamá desde las esclusas de Miraflores al amanecer, sin personas");
  const destino = path.join(raiz, "temp", "prueba-gemini.jpg");
  await guardarIlustracion(buf, destino);
  log.info(`Ilustración de prueba generada en ${Math.round((Date.now() - inicio) / 1000)} s: ${destino} (${buf.length} bytes recibidos)`);
  return destino;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.GEMINI_API_KEY) { console.error("Falta la variable de entorno GEMINI_API_KEY"); process.exit(1); }
  ejecutarPrueba({ config: cargarConfig(), apiKey: process.env.GEMINI_API_KEY })
    .catch((err) => { console.error(`La prueba de Gemini falló: ${err.message}`); process.exit(1); });
}
