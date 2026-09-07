// Registro de URLs ya evaluadas para no volver a procesarlas.
import fs from "node:fs";
import { sumarDias } from "./fechas.mjs";

export function cargarVistas(ruta) {
  if (!fs.existsSync(ruta)) return { urls: {} };
  const datos = JSON.parse(fs.readFileSync(ruta, "utf8"));
  return { urls: datos.urls || {} };
}

export function guardarVistas(ruta, vistas) {
  fs.writeFileSync(ruta, JSON.stringify(vistas, null, 2) + "\n");
}

export function estaVista(vistas, url) {
  return Object.prototype.hasOwnProperty.call(vistas.urls, url);
}

export function marcarVistas(vistas, urls, claveDiaHoy) {
  const nuevas = { ...vistas.urls };
  for (const u of urls) nuevas[u] = claveDiaHoy;
  return { urls: nuevas };
}

export function purgarVistas(vistas, claveDiaHoy, dias = 30) {
  const limite = sumarDias(claveDiaHoy, -dias);
  const urls = {};
  for (const [u, dia] of Object.entries(vistas.urls)) {
    if (dia >= limite) urls[u] = dia;
  }
  return { urls };
}
