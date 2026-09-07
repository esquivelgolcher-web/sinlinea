// Posts como archivos JSON: validación, lectura, escritura, creación y archivo.
import fs from "node:fs";
import path from "node:path";
import { ESTADOS, VARIANTES, CATEGORIAS } from "./estados.mjs";
import { claveDia, claveMinuto, ZONA_PANAMA } from "./fechas.mjs";
import { slugify, sha1short } from "./util.mjs";
import { normalizarHashtags } from "./caption.mjs";

const RE_ID = /^\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9-]+-[0-9a-f]{4}$/;

function exigir(cond, msg) {
  if (!cond) throw new Error(`Post inválido: ${msg}`);
}

export function validarPost(post) {
  exigir(post && typeof post === "object", "no es un objeto");
  exigir(RE_ID.test(post.id || ""), `id "${post.id}" no tiene el formato esperado`);
  exigir(ESTADOS.includes(post.estado), `estado "${post.estado}" desconocido`);
  exigir(post.fuente && typeof post.fuente.medio === "string" && /^https?:\/\//.test(post.fuente.url || ""), "fuente.medio y fuente.url son obligatorios");
  exigir(CATEGORIAS.includes(post.categoria), `categoria "${post.categoria}" no permitida`);
  exigir(VARIANTES.includes(post.variante), `variante "${post.variante}" no permitida`);
  for (const k of ["titular", "bajada", "caption"]) exigir(typeof post[k] === "string" && post[k].trim(), `${k} es obligatorio`);
  exigir(Array.isArray(post.hashtags), "hashtags debe ser una lista");
  exigir(post.imagen === null || (post.imagen && typeof post.imagen.hash === "string"), "imagen debe ser null o tener hash");
  exigir(post.programado === null || !Number.isNaN(Date.parse(post.programado)), "programado debe ser null o una fecha ISO");
  for (const k of ["creado", "actualizado"]) exigir(!Number.isNaN(Date.parse(post[k])), `${k} debe ser una fecha ISO`);
  return post;
}

export function rutaImagen(id) {
  return `public/img/${id}.jpg`;
}

export function urlImagen(baseUrl, id) {
  return `${String(baseUrl).replace(/\/+$/, "")}/img/${id}.jpg`;
}

export function nuevoId({ medio, url, ahora, zona = ZONA_PANAMA }) {
  return `${claveMinuto(ahora, zona)}-${slugify(medio, 12)}-${sha1short(url, 4)}`;
}

export function crearPost({ candidato, redaccion, variante, ahora, zona = ZONA_PANAMA }) {
  const iso = ahora.toISOString();
  return validarPost({
    id: nuevoId({ medio: candidato.medio, url: candidato.url, ahora, zona }),
    estado: "borrador",
    fuente: { medio: candidato.medio, url: candidato.url, titulo: candidato.titulo, publicado: candidato.fecha },
    categoria: redaccion.categoria,
    titular: redaccion.titular.trim(),
    bajada: redaccion.bajada.trim(),
    caption: redaccion.caption.trim(),
    hashtags: normalizarHashtags(redaccion.hashtags),
    variante,
    imagen: null,
    programado: null,
    publicacion: null,
    error: null,
    creado: iso,
    actualizado: iso,
  });
}

export function leerPosts(dir = "posts") {
  if (!fs.existsSync(dir)) return [];
  const posts = fs.readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => validarPost(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))));
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
  const ultimo = [...posts].sort((a, b) => b.creado.localeCompare(a.creado))[0];
  const i = VARIANTES.indexOf(ultimo.variante);
  return VARIANTES[(i + 1) % VARIANTES.length];
}

export function creadosHoy(posts, claveDiaHoy, zona = ZONA_PANAMA) {
  return posts.filter((p) => claveDia(p.creado, zona) === claveDiaHoy).length;
}

export function archivar(dir, { ahora, dias, zona = ZONA_PANAMA }) {
  const limite = ahora.getTime() - dias * 86400000;
  const movidos = [];
  for (const p of leerPosts(dir)) {
    if (!["publicado", "descartado"].includes(p.estado)) continue;
    if (new Date(p.actualizado).getTime() > limite) continue;
    const mes = claveDia(p.actualizado, zona).slice(0, 7);
    const destino = path.join(dir, "archivo", mes);
    fs.mkdirSync(destino, { recursive: true });
    fs.renameSync(path.join(dir, `${p.id}.json`), path.join(destino, `${p.id}.json`));
    movidos.push(p.id);
  }
  return movidos;
}
