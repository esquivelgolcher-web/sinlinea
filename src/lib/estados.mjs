// Estados de un post, transiciones inmutables y hash de la imagen.
// Módulo isomorfo: sin imports de Node, se usa también en el panel.
export const ESTADOS = ["borrador", "programado", "publicado", "descartado", "error"];
export const VARIANTES = ["negro", "amarillo", "rojo"];
export const CATEGORIAS = [
  "POLÍTICA", "ECONOMÍA", "SOCIEDAD", "SEGURIDAD", "SALUD",
  "EDUCACIÓN", "DEPORTES", "CULTURA", "INTERNACIONAL", "ÚLTIMA HORA",
];
export const CAMPOS_IMAGEN = ["titular", "bajada", "categoria", "variante"];
const CAMPOS_EDITABLES = ["titular", "bajada", "caption", "hashtags", "categoria", "variante", "ilustracion"];

function fnv1a(texto, base) {
  let h = base >>> 0;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function hashTexto(texto) {
  const t = String(texto ?? "");
  return fnv1a(t, 0x811c9dc5) + fnv1a(t, 0x050c5d1f);
}

export function hashImagen(post, version) {
  const il = post.ilustracion;
  const ilus = il && il.usar && il.ruta ? String(il.hashDescripcion || "") : "";
  const texto = [...CAMPOS_IMAGEN.map((c) => String(post[c] ?? "")), ilus, String(version)].join("\u0000");
  return fnv1a(texto, 0x811c9dc5) + fnv1a(texto, 0x050c5d1f);
}

const HORA_MS = 3600000;

// ¿Hay que pedir (o volver a pedir) la ilustración a Gemini?
export function necesitaIlustracion(post, ahora) {
  const il = post.ilustracion;
  if (!il || !il.usar) return false;
  if (!String(il.descripcion || "").trim()) return false;
  if (il.ruta && il.hashDescripcion === hashTexto(il.descripcion)) return false;
  if (il.error && ahora.getTime() - Date.parse(il.error.fecha) < HORA_MS) return false;
  return true;
}

// ¿Hay que pedir a Claude la escena (usar=true sin descripción, sin error reciente)?
export function necesitaEscena(post, ahora) {
  const il = post.ilustracion;
  if (!il || !il.usar) return false;
  if (String(il.descripcion || "").trim()) return false;
  if (il.error && ahora.getTime() - Date.parse(il.error.fecha) < HORA_MS) return false;
  return true;
}

export function imagenDesactualizada(post, version = post.imagen?.version) {
  if (!post.imagen || !post.imagen.hash) return true;
  return post.imagen.hash !== hashImagen(post, version ?? 1);
}

function invalida(post, accion) {
  return new Error(`Transición inválida: ${post.estado} → ${accion}`);
}

function con(post, cambios, ahoraIso) {
  return { ...post, ...cambios, actualizado: ahoraIso };
}

export function aprobar(post, isoHora, ahoraIso) {
  if (!["borrador", "programado"].includes(post.estado)) throw invalida(post, "aprobar");
  if (Number.isNaN(Date.parse(isoHora))) throw new Error(`Hora inválida: ${isoHora}`);
  return con(post, { estado: "programado", programado: isoHora, error: null }, ahoraIso);
}

export function descartar(post, ahoraIso) {
  if (!["borrador", "error"].includes(post.estado)) throw invalida(post, "descartar");
  return con(post, { estado: "descartado", programado: null }, ahoraIso);
}

export function quitarDeCola(post, ahoraIso) {
  if (post.estado !== "programado") throw invalida(post, "quitarDeCola");
  return con(post, { estado: "borrador", programado: null }, ahoraIso);
}

export function reintentar(post, ahoraIso) {
  if (post.estado !== "error" || post.error?.paso !== "instagram") throw invalida(post, "reintentar");
  return con(post, { estado: post.programado ? "programado" : "borrador", error: null }, ahoraIso);
}

export function marcarPublicado(post, { idMedia, permalink }, ahoraIso) {
  if (post.estado !== "programado") throw invalida(post, "marcarPublicado");
  return con(post, { estado: "publicado", publicacion: { idMedia, permalink, fecha: ahoraIso }, error: null }, ahoraIso);
}

export function marcarError(post, { paso, mensaje }, ahoraIso) {
  if (["publicado", "descartado"].includes(post.estado)) throw invalida(post, "marcarError");
  if (!["render", "instagram"].includes(paso)) throw new Error(`Paso de error desconocido: ${paso}`);
  return con(post, { estado: "error", error: { paso, mensaje: String(mensaje), fecha: ahoraIso } }, ahoraIso);
}

export function renderOk(post, imagen, ahoraIso) {
  const cambios = { imagen };
  if (post.estado === "error" && post.error?.paso === "render") {
    cambios.estado = post.programado ? "programado" : "borrador";
    cambios.error = null;
  }
  return con(post, cambios, ahoraIso);
}

export function editarTexto(post, cambios, ahoraIso) {
  if (!["borrador", "programado", "error"].includes(post.estado)) throw invalida(post, "editarTexto");
  for (const k of Object.keys(cambios)) {
    if (!CAMPOS_EDITABLES.includes(k)) throw new Error(`Campo no editable: ${k}`);
  }
  if (cambios.categoria !== undefined && !CATEGORIAS.includes(cambios.categoria)) throw new Error(`Categoría inválida: ${cambios.categoria}`);
  if (cambios.variante !== undefined && !VARIANTES.includes(cambios.variante)) throw new Error(`Variante inválida: ${cambios.variante}`);
  if (cambios.hashtags !== undefined && !Array.isArray(cambios.hashtags)) throw new Error("hashtags debe ser una lista");
  if (cambios.ilustracion !== undefined && cambios.ilustracion !== null) {
    const il = cambios.ilustracion;
    if (!il || typeof il !== "object" || typeof il.descripcion !== "string" || typeof il.usar !== "boolean") {
      throw new Error("ilustracion debe tener descripcion (texto) y usar (true/false)");
    }
  }
  return con(post, cambios, ahoraIso);
}
