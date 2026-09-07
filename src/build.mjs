// Construye dist/ para GitHub Pages: imágenes públicas + panel + módulos isomorfos.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const MODULOS_ISOMORFOS = ["estados.mjs", "caption.mjs", "franjas.mjs", "fechas.mjs"];

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
  copiarDir(path.join(raiz, "public"), dist);
  copiarDir(path.join(raiz, "panel"), path.join(dist, "panel"));
  fs.mkdirSync(path.join(dist, "panel", "lib"), { recursive: true });
  for (const f of MODULOS_ISOMORFOS) fs.copyFileSync(path.join(raiz, "src", "lib", f), path.join(dist, "panel", "lib", f));
  fs.writeFileSync(path.join(dist, "index.html"), '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=panel/"><title>Sin Línea</title><a href="panel/">Panel</a>\n');
  fs.writeFileSync(path.join(dist, ".nojekyll"), "");
  return dist;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dist = construirDist();
  console.log(`dist/ construido en ${dist}`);
}
