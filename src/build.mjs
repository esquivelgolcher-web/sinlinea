// Construye dist/ para GitHub Pages: imágenes públicas + panel + módulos isomorfos.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cargarConfiguracion, resumenParaPanel } from "./lib/config.mjs";

export const MODULOS_ISOMORFOS = ["estados.mjs", "caption.mjs", "franjas.mjs", "fechas.mjs", "texto.mjs", "cuenta.mjs", "metricas.mjs"];

function copiarDir(origen, destino) {
  if (!fs.existsSync(origen)) return;
  fs.mkdirSync(destino, { recursive: true });
  for (const entrada of fs.readdirSync(origen, { withFileTypes: true })) {
    if (entrada.name.startsWith(".")) continue;
    const o = path.join(origen, entrada.name);
    const d = path.join(destino, entrada.name);
    if (entrada.isDirectory()) copiarDir(o, d);
    else fs.copyFileSync(o, d);
  }
}

export function construirDist({ raiz = process.cwd(), destino = "dist" } = {}) {
  const dist = path.join(raiz, destino);
  fs.rmSync(dist, { recursive: true, force: true });
  fs.mkdirSync(dist, { recursive: true });
  copiarDir(path.join(raiz, "public", "img"), path.join(dist, "img"));
  copiarDir(path.join(raiz, "panel"), path.join(dist, "panel"));
  fs.mkdirSync(path.join(dist, "panel", "lib"), { recursive: true });
  for (const f of MODULOS_ISOMORFOS) fs.copyFileSync(path.join(raiz, "src", "lib", f), path.join(dist, "panel", "lib", f));
  const { cuentas, errores } = cargarConfiguracion(raiz);
  for (const e of errores) console.warn(`Cuenta ${e.cuenta} omitida en el panel: ${e.mensaje}`);
  fs.writeFileSync(path.join(dist, "panel", "config.json"), JSON.stringify(resumenParaPanel(cuentas), null, 2));
  fs.writeFileSync(path.join(dist, "index.html"), '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=panel/"><title>Sin Línea</title><a href="panel/">Panel</a>\n');
  fs.writeFileSync(path.join(dist, ".nojekyll"), "");
  return dist;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dist = construirDist();
  console.log(`dist/ construido en ${dist}`);
}
