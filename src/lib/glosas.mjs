// Glosas (formato "glosa"): la cuarteta satírica de La Garza sobre una noticia que la cuenta ya tiene en borrador,
// programada o publicada. Cuatro versos octosílabos con rima consonante (src/lib/metrica.mjs decide si cumplen).
// La glosa lleva siempre la noticia que comenta: su titular y su fuente viajan en la pieza y en el caption.
import { nuevoId } from "./posts.mjs";
import { normalizarHashtags } from "./caption.mjs";
import { claveDia } from "./fechas.mjs";
import { erroresDeGlosa, esquemaDeRima } from "./metrica.mjs";

export function glosasCreadasHoy(posts, ahora, zona) {
  const hoy = claveDia(ahora, zona);
  return (posts || []).filter((p) => p?.formato === "glosa" && claveDia(new Date(p.creado), zona) === hoy).length;
}

// Noticias que ya tienen glosa (aunque se haya descartado): no se glosa dos veces la misma.
export function noticiasGlosadas(posts) {
  return new Set((posts || []).filter((p) => p?.formato === "glosa" && p.glosa?.sobre?.id).map((p) => p.glosa.sobre.id));
}

function recortar(s, max) {
  const t = String(s ?? "").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

// Texto de publicación: los cuatro versos, la noticia que comenta con su medio, y los hashtags de la cuenta.
export function captionDeGlosa(glosa, { medio = "", hashtags = [] } = {}) {
  const partes = [(glosa?.versos || []).map((v) => String(v).trim()).join("\n")];
  const sobre = [glosa?.sobre?.titular, medio].filter(Boolean).join(" · ");
  if (sobre) partes.push(`Sobre: ${sobre}`);
  const etiquetas = normalizarHashtags(hashtags || []);
  if (etiquetas.length) partes.push(etiquetas.join(" "));
  return partes.join("\n\n");
}

// Pieza en formato glosa. `sobre` es el post de la noticia que se comenta (de la misma cuenta).
export function crearPostGlosa({ versos, sobre, config, ahora, zona, cuenta = null, variante = "rojo" }) {
  const limpios = (versos || []).map((v) => String(v).trim());
  const errores = erroresDeGlosa(limpios);
  if (errores.length) throw new Error(errores[0]);
  if (!sobre?.id || !sobre.fuente?.url) throw new Error("la glosa necesita la noticia que comenta (id y fuente)");
  const iso = ahora.toISOString();
  const cfg = config.glosas || {};
  const glosa = { versos: limpios, esquema: esquemaDeRima(limpios), sobre: { id: sobre.id, titular: String(sobre.titular || "").trim() } };
  const hashtags = normalizarHashtags(cfg.hashtags || []);
  return {
    id: nuevoId({ medio: "glosa", url: `${sobre.fuente.url}#glosa`, ahora, zona, cuenta }),
    ...(cuenta ? { cuenta } : {}),
    estado: "borrador",
    formato: "glosa",
    glosa,
    fuente: { ...sobre.fuente },
    categoria: cfg.categoria || sobre.categoria,
    titular: recortar(limpios[0], 65),
    bajada: recortar(`Sobre: ${glosa.sobre.titular}`, 110),
    caption: captionDeGlosa(glosa, { medio: sobre.fuente.medio, hashtags }),
    hashtags,
    variante,
    imagen: null,
    ilustracion: null,
    programado: null,
    publicacion: null,
    error: null,
    creado: iso,
    actualizado: iso,
  };
}
