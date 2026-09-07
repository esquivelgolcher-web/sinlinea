// Extrae los enlaces de artículos de la portada HTML de un medio.
import { decodeEntities } from "./util.mjs";

export function seccionDeUrl(url) {
  try {
    const seg = new URL(url).pathname.split("/").filter(Boolean);
    return seg[0] || "";
  } catch {
    return "";
  }
}

export function extraerEnlacesPortada(html, { baseUrl, patronArticulo, excluirSecciones = [] }) {
  const base = new URL(baseUrl);
  const patron = new RegExp(patronArticulo);
  const excluidas = new Set(excluirSecciones);
  const vistos = new Set();
  const salida = [];
  const re = /href\s*=\s*"([^"]+)"/gi;
  let m;
  while ((m = re.exec(String(html || "")))) {
    let u;
    try { u = new URL(decodeEntities(m[1]), base); } catch { continue; }
    if (u.host !== base.host) continue;
    if (!patron.test(u.pathname)) continue;
    const seccion = u.pathname.split("/").filter(Boolean)[0] || "";
    if (excluidas.has(seccion)) continue;
    const limpio = `${u.origin}${u.pathname}`;
    if (vistos.has(limpio)) continue;
    vistos.add(limpio);
    salida.push(limpio);
  }
  return salida;
}
