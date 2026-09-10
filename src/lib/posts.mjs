// Posts como archivos JSON: validación, lectura, escritura, creación y archivo.
import fs from "node:fs";
import path from "node:path";
import { ESTADOS, VARIANTES, CATEGORIAS, PASOS_ERROR } from "./estados.mjs";
import { validarDestinos } from "./destinos.mjs";
import { claveDia, claveMinuto, ZONA_PANAMA } from "./fechas.mjs";
import { slugify, sha1short } from "./util.mjs";
import { normalizarHashtags } from "./caption.mjs";
import { FORMATOS, TIPOS_AFIRMACION, ALCANCES, ALERTAS, ESTADOS_REVISION } from "./formatos.mjs";

const esTextoONull = (v) => v === null || v === undefined || typeof v === "string";
const esListaDeTextos = (v) => Array.isArray(v) && v.every((s) => typeof s === "string");

// Campos del perfil editorial (opcionales; los posts anteriores no los tienen).
function validarPerfilDePost(post) {
  if (post.formato !== undefined) exigir(FORMATOS.includes(post.formato), `formato "${post.formato}" desconocido (${FORMATOS.join(", ")})`);
  if (post.fuentes !== undefined) {
    exigir(Array.isArray(post.fuentes) && post.fuentes.every((f) => f && typeof f === "object" && typeof f.medio === "string" && /^https?:\/\//.test(f.url || "") && ["principal", "referencia"].includes(f.rol)
      && (f.alcance === undefined || f.alcance === null || ALCANCES.includes(f.alcance)) && (f.fuentesPrimarias === undefined || esListaDeTextos(f.fuentesPrimarias))
      && ["autor", "idioma", "publicado", "actualizado", "fechaHecho", "consultado", "canonica", "licenciaMedios"].every((k) => esTextoONull(f[k]))),
    "fuentes debe ser una lista de { rol principal|referencia, medio, url, autor, idioma, fechas, alcance, fuentesPrimarias, licenciaMedios }");
  }
  if (post.afirmaciones !== undefined) {
    exigir(Array.isArray(post.afirmaciones) && post.afirmaciones.every((a) => a && typeof a.texto === "string" && TIPOS_AFIRMACION.includes(a.tipo) && typeof a.fuente === "string" && (a.contrastada === undefined || typeof a.contrastada === "boolean")),
      `afirmaciones debe ser una lista de { texto, tipo (${TIPOS_AFIRMACION.join("|")}), fuente, contrastada }`);
  }
  for (const k of ["angulo", "atribucion"]) if (post[k] !== undefined) exigir(esTextoONull(post[k]), `${k} debe ser texto`);
  if (post.alertas !== undefined) exigir(Array.isArray(post.alertas) && post.alertas.every((a) => ALERTAS.includes(a)), `alertas solo admite ${ALERTAS.join(", ")}`);
  if (post.revision !== undefined) exigir(post.revision && ESTADOS_REVISION.includes(post.revision.estado) && esListaDeTextos(post.revision.notas || []), `revision debe tener estado (${ESTADOS_REVISION.join("|")}) y notas`);
  if (post.puntuacion !== undefined && post.puntuacion !== null) exigir(typeof post.puntuacion.total === "number" && post.puntuacion.componentes && typeof post.puntuacion.componentes === "object", "puntuacion debe tener total y componentes");
  if (post.carrusel !== undefined && post.carrusel !== null) {
    const c = post.carrusel;
    exigir(c && Array.isArray(c.diapositivas) && c.diapositivas.length > 0 && c.diapositivas.every((d) => d && typeof d.titulo === "string" && typeof d.texto === "string")
      && Array.isArray(c.imagenes || []) && (c.imagenes || []).every((i) => Number.isInteger(i.numero) && typeof i.ruta === "string" && typeof i.url === "string" && typeof i.hash === "string")
      && (c.hash === undefined || typeof c.hash === "string"),
    "carrusel debe tener diapositivas { titulo, texto } (al menos una) e imagenes { numero, ruta, url, hash }");
  }
  if (post.reel !== undefined && post.reel !== null) {
    const r = post.reel;
    exigir(r && typeof r.narracion === "string" && r.narracion.trim() && esListaDeTextos(r.subtitulos || []) && Array.isArray(r.escenas || [])
      && (r.escenas || []).every((e) => e && typeof e.segundos === "number" && typeof e.descripcion === "string" && typeof e.recurso === "string") && esListaDeTextos(r.recursos || []),
    "reel debe tener narracion, subtitulos, escenas { segundos, descripcion, recurso } y recursos");
  }
}

// Fuente con trazabilidad a partir de un candidato (lo desconocido queda en null, nunca inventado).
export function fuenteDeCandidato(c, rol, { fechaHecho = null } = {}) {
  return {
    rol, medio: c.medio, autor: c.autor ?? null, url: c.url, canonica: c.canonica ?? null, idioma: c.idioma ?? null,
    publicado: c.fecha || null, actualizado: c.actualizado ?? null, fechaHecho, consultado: c.consultado ?? null,
    alcance: c.alcance ?? null, textoRecuperado: c.textoRecuperado ?? null, fuentesPrimarias: Array.isArray(c.fuentesPrimarias) ? c.fuentesPrimarias : [],
    licenciaMedios: c.licenciaMedios ?? null,
  };
}

const RE_ID = /^\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9-]+-[0-9a-f]{4}$/;
const RE_CUENTA = /^[a-z0-9][a-z0-9-]*$/;
// Cuenta a la que pertenecen los posts creados antes del soporte multi-cuenta (sin campo `cuenta`).
export const CUENTA_LEGADO = "sinlinea";

function exigir(cond, msg) {
  if (!cond) throw new Error(`Post inválido: ${msg}`);
}

export function validarPost(post) {
  exigir(post && typeof post === "object", "no es un objeto");
  exigir(RE_ID.test(post.id || ""), `id "${post.id}" no tiene el formato esperado`);
  exigir(ESTADOS.includes(post.estado), `estado "${post.estado}" desconocido`);
  if (post.cuenta !== undefined) exigir(typeof post.cuenta === "string" && RE_CUENTA.test(post.cuenta), `cuenta "${post.cuenta}" no es un id de cuenta válido`);
  exigir(post.fuente && typeof post.fuente.medio === "string" && /^https?:\/\//.test(post.fuente.url || ""), "fuente.medio y fuente.url son obligatorios");
  exigir(typeof post.fuente.titulo === "string", "fuente.titulo debe ser texto");
  exigir(!Number.isNaN(Date.parse(post.fuente.publicado)), "fuente.publicado debe ser una fecha ISO");
  exigir(CATEGORIAS.includes(post.categoria), `categoria "${post.categoria}" no permitida`);
  exigir(VARIANTES.includes(post.variante), `variante "${post.variante}" no permitida`);
  for (const k of ["titular", "bajada", "caption"]) exigir(typeof post[k] === "string" && post[k].trim(), `${k} es obligatorio`);
  exigir(Array.isArray(post.hashtags), "hashtags debe ser una lista");
  if (post.imagen !== null) {
    const i = post.imagen;
    exigir(
      i && typeof i === "object" && typeof i.ruta === "string" && typeof i.url === "string" && typeof i.hash === "string"
        && Number.isInteger(i.version) && !Number.isNaN(Date.parse(i.renderizada)),
      "imagen debe ser null o tener ruta, url, hash, version y renderizada"
    );
    exigir(i.estilo === undefined || typeof i.estilo === "string", "imagen.estilo debe ser texto si está presente");
  }
  if (post.publicacion !== null) {
    const u = post.publicacion;
    exigir(
      u && typeof u === "object" && typeof u.idMedia === "string" && typeof u.permalink === "string" && !Number.isNaN(Date.parse(u.fecha)),
      "publicacion debe ser null o tener idMedia, permalink y fecha"
    );
  }
  if (post.error !== null) {
    const e = post.error;
    exigir(
      e && typeof e === "object" && PASOS_ERROR.includes(e.paso) && typeof e.mensaje === "string" && !Number.isNaN(Date.parse(e.fecha)),
      `error debe ser null o tener paso (${PASOS_ERROR.join("|")}), mensaje y fecha`
    );
  }
  if (post.destinos !== undefined && post.destinos !== null) validarDestinos(post.destinos);
  exigir(post.programado === null || !Number.isNaN(Date.parse(post.programado)), "programado debe ser null o una fecha ISO");
  for (const k of ["creado", "actualizado"]) exigir(!Number.isNaN(Date.parse(post[k])), `${k} debe ser una fecha ISO`);
  if (post.ilustracion !== undefined && post.ilustracion !== null) {
    const il = post.ilustracion;
    exigir(
      il && typeof il === "object" && typeof il.descripcion === "string" && typeof il.usar === "boolean"
        && (il.ruta === null || typeof il.ruta === "string") && (il.hashDescripcion === null || typeof il.hashDescripcion === "string")
        && (il.error === null || (il.error && typeof il.error.mensaje === "string" && !Number.isNaN(Date.parse(il.error.fecha))
          && (il.error.intentos === undefined || (Number.isInteger(il.error.intentos) && il.error.intentos >= 1)))),
      "ilustracion debe tener descripcion, usar, ruta, hashDescripcion y error válidos"
    );
  }
  validarPerfilDePost(post);
  return post;
}

// Diapositivas del carrusel: public/img/<id>-01.jpg, -02.jpg…
export function rutaDiapositiva(id, numero) {
  return `public/img/${id}-${String(numero).padStart(2, "0")}.jpg`;
}

export function urlDiapositiva(baseUrl, id, numero) {
  return `${String(baseUrl).replace(/\/+$/, "")}/img/${id}-${String(numero).padStart(2, "0")}.jpg`;
}

export function rutaImagen(id) {
  return `public/img/${id}.jpg`;
}

export function rutaIlustracion(id) {
  return `public/ilus/${id}.jpg`;
}

export function urlImagen(baseUrl, id) {
  return `${String(baseUrl).replace(/\/+$/, "")}/img/${id}.jpg`;
}

export function nuevoId({ medio, url, ahora, zona = ZONA_PANAMA, cuenta = null }) {
  const parteCuenta = cuenta ? `${cuenta}-` : "";
  return `${claveMinuto(ahora, zona)}-${parteCuenta}${slugify(medio, 12)}-${sha1short(url, 4)}`;
}

export function crearPost({ candidato, redaccion, variante, ahora, zona = ZONA_PANAMA, cuenta = null, referencias = [] }) {
  const iso = ahora.toISOString();
  const conPerfil = redaccion.formato !== undefined;
  const ilustracion = typeof redaccion.escena === "string" && redaccion.escena.trim()
    ? { descripcion: redaccion.escena.trim(), usar: false, ruta: null, hashDescripcion: null, proveedor: null, modelo: null, generada: null, error: null, ...(conPerfil ? { procedencia: "generada" } : {}) }
    : null;
  // Perfil editorial: formato, fuentes con trazabilidad (principal y referencias del mismo hecho), afirmaciones con su
  // fuente, ángulo, atribución pública, puntuación, alertas, carrusel o reel, y revisión pendiente.
  const extras = conPerfil ? {
    formato: redaccion.formato,
    fuentes: [fuenteDeCandidato(candidato, "principal", { fechaHecho: redaccion.fechaHecho ?? null }), ...referencias.map((r) => fuenteDeCandidato(r, "referencia"))],
    afirmaciones: Array.isArray(redaccion.afirmaciones) ? redaccion.afirmaciones : [],
    angulo: redaccion.angulo ?? null,
    atribucion: redaccion.atribucion ?? null,
    puntuacion: redaccion.puntuacion ?? null,
    alertas: Array.isArray(redaccion.alertas) ? redaccion.alertas : [],
    carrusel: Array.isArray(redaccion.carrusel) && redaccion.carrusel.length ? { diapositivas: redaccion.carrusel, imagenes: [] } : null,
    reel: redaccion.reel ?? null,
    revision: { estado: "pendiente", notas: [] },
  } : {};
  return validarPost({
    id: nuevoId({ medio: candidato.medio, url: candidato.url, ahora, zona, cuenta }),
    ...(cuenta ? { cuenta } : {}),
    estado: "borrador",
    fuente: { medio: candidato.medio, url: candidato.url, titulo: candidato.titulo, publicado: candidato.fecha },
    categoria: redaccion.categoria,
    titular: redaccion.titular.trim(),
    bajada: redaccion.bajada.trim(),
    caption: redaccion.caption.trim(),
    hashtags: normalizarHashtags(redaccion.hashtags),
    variante,
    imagen: null,
    ilustracion,
    ...extras,
    programado: null,
    publicacion: null,
    error: null,
    creado: iso,
    actualizado: iso,
  });
}

// Los posts sin `cuenta` (anteriores al soporte multi-cuenta) se leen como de `cuentaPorDefecto`;
// el archivo no se reescribe.
export function leerPosts(dir = "posts", { log = console, cuentaPorDefecto = CUENTA_LEGADO } = {}) {
  if (!fs.existsSync(dir)) return [];
  const posts = [];
  for (const f of fs.readdirSync(dir).filter((a) => a.endsWith(".json"))) {
    try {
      const post = validarPost(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
      posts.push(post.cuenta ? post : { ...post, cuenta: cuentaPorDefecto });
    } catch (err) {
      log.warn(`Post omitido ${f}: ${err.message}`);
    }
  }
  posts.sort((a, b) => b.creado.localeCompare(a.creado));
  return posts;
}

export function escribirPost(dir, post) {
  validarPost(post);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${post.id}.json`), JSON.stringify(post, null, 2) + "\n");
}

export function siguienteVariante(posts) {
  if (!posts.length) return VARIANTES[0];
  // Ante empate en `creado` (posts creados en la misma corrida) gana el último de la lista.
  const ultimo = posts.reduce((a, b) => (b.creado >= a.creado ? b : a));
  const i = VARIANTES.indexOf(ultimo.variante);
  return VARIANTES[(i + 1) % VARIANTES.length];
}

export function creadosHoy(posts, claveDiaHoy, zona = ZONA_PANAMA) {
  return posts.filter((p) => claveDia(p.creado, zona) === claveDiaHoy).length;
}

export function archivar(dir, { ahora, dias, zona = ZONA_PANAMA, raiz = path.dirname(dir) }) {
  const limite = ahora.getTime() - dias * 86400000;
  const movidos = [];
  for (const p of leerPosts(dir)) {
    if (!["publicado", "descartado"].includes(p.estado)) continue;
    if (new Date(p.actualizado).getTime() > limite) continue;
    const mes = claveDia(p.actualizado, zona).slice(0, 7);
    const destino = path.join(dir, "archivo", mes);
    fs.mkdirSync(destino, { recursive: true });
    fs.renameSync(path.join(dir, `${p.id}.json`), path.join(destino, `${p.id}.json`));
    fs.rmSync(path.join(raiz, "public", "ilus", `${p.id}.jpg`), { force: true });
    movidos.push(p.id);
  }
  return movidos;
}
