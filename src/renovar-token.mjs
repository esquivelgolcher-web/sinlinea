// Renueva el token de larga duración de Instagram y registra su vencimiento.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cargarConfig } from "./lib/config.mjs";
import { crearClienteInstagram } from "./lib/instagram.mjs";
import { claveDia, ZONA_PANAMA } from "./lib/fechas.mjs";

export async function ejecutarRenovar({ raiz = process.cwd(), ahora = new Date(), ig, log = console, zona = ZONA_PANAMA }) {
  const { token, expiraEnSegundos } = await ig.refrescarToken();
  const vence = claveDia(new Date(ahora.getTime() + expiraEnSegundos * 1000), zona);
  const info = { vence, renovado: claveDia(ahora, zona) };
  fs.writeFileSync(path.join(raiz, "data", "token-info.json"), JSON.stringify(info, null, 2) + "\n");
  fs.mkdirSync(path.join(raiz, "temp"), { recursive: true });
  fs.writeFileSync(path.join(raiz, "temp", "nuevo-token.txt"), token);
  log.info(`Token de Instagram renovado; vence el ${vence}.`);
  return { vence };
}

async function main() {
  const config = cargarConfig();
  if (!process.env.IG_ACCESS_TOKEN) throw new Error("Falta la variable de entorno IG_ACCESS_TOKEN");
  const ig = crearClienteInstagram({ token: process.env.IG_ACCESS_TOKEN, usuarioId: process.env.IG_USER_ID || "", apiVersion: config.instagram.apiVersion });
  const original = ig.refrescarToken;
  ig.refrescarToken = async () => { const r = await original(); console.log(`::add-mask::${r.token}`); return r; };
  await ejecutarRenovar({ ig });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(`Error al renovar el token: ${err.message}`); process.exit(1); });
}
