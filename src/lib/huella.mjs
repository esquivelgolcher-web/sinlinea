// Huella de un archivo: sha de blob de git ("blob <bytes>\0" + contenido, SHA-1), la misma que devuelve la API de
// contenidos de GitHub y el servidor local. Sirve para vincular la imagen aprobada de un destino a un archivo estable:
// antes de publicar, el publicador descarga la imagen de la URL pública (la que van a leer las redes) y compara.
import crypto from "node:crypto";

export function huellaDeBytes(contenido) {
  const buf = Buffer.isBuffer(contenido) ? contenido : Buffer.from(contenido);
  return crypto.createHash("sha1").update(`blob ${buf.length}\0`).update(buf).digest("hex");
}

export async function descargarHuella(url, { fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl(url, { cache: "no-store" });
    if (!res.ok) return { ok: false, motivo: `HTTP ${res.status}` };
    const bytes = Buffer.from(await res.arrayBuffer());
    if (!bytes.length) return { ok: false, motivo: "respuesta vacía" };
    return { ok: true, sha: huellaDeBytes(bytes) };
  } catch (err) {
    return { ok: false, motivo: err.message };
  }
}
