// Carga y valida la configuración: config.json (global) + cuentas/<id>/config.json (por cuenta).
// La "configuración efectiva" de una cuenta tiene la misma forma que tenía config.json cuando
// solo existía una cuenta, así que el resto de módulos no necesita saber de cuentas.
import fs from "node:fs";
import path from "node:path";
import { esNombreDeSecreto, ORIGENES } from "./secretos.mjs";
import { RE_ID_CUENTA, RE_IDIOMA, RE_COLOR, TIPOS_FUENTE, LOGO_FORMAS, LOGO_TAMANO, COLORES_POR_DEFECTO, AUTOMATICO_POR_DEFECTO, IDIOMA_POR_DEFECTO } from "./cuenta.mjs";

export { RE_ID_CUENTA, LOGO_FORMAS, COLORES_POR_DEFECTO, AUTOMATICO_POR_DEFECTO, IDIOMA_POR_DEFECTO };
export const ESFUERZOS = ["low", "medium", "high", "xhigh", "max"];

function exigir(cond, mensaje, archivo = "config.json") {
  if (!cond) throw new Error(`${archivo}: ${mensaje}`);
}

function validarFuentes(fuentes, archivo, { permitirVacio = false } = {}) {
  exigir(Array.isArray(fuentes), "fuentes debe ser una lista", archivo);
  exigir(fuentes.length > 0 || permitirVacio, "fuentes debe tener al menos una fuente (o apaga automatico.generar)", archivo);
  fuentes.forEach((f, i) => {
    exigir(typeof f.nombre === "string" && f.nombre, `fuentes[${i}].nombre es obligatorio`, archivo);
    exigir(TIPOS_FUENTE.includes(f.tipo), `fuentes[${i}].tipo debe ser rss o portada`, archivo);
    exigir(/^https?:\/\//.test(f.url || ""), `fuentes[${i}].url debe ser una URL`, archivo);
    if (f.tipo === "portada") {
      exigir(typeof f.patronArticulo === "string", `fuentes[${i}].patronArticulo es obligatorio para portada`, archivo);
      try { new RegExp(f.patronArticulo); } catch { exigir(false, `fuentes[${i}].patronArticulo no es una expresión regular válida`, archivo); }
    }
    if (f.excluirSecciones !== undefined) {
      exigir(Array.isArray(f.excluirSecciones), `fuentes[${i}].excluirSecciones debe ser una lista`, archivo);
    }
  });
}

function validarFranjas(franjas, archivo) {
  exigir(Array.isArray(franjas) && franjas.length > 0, "franjas debe tener al menos una hora", archivo);
  const vistas = new Set();
  for (const h of franjas) {
    exigir(/^([01]\d|2[0-3]):[0-5]\d$/.test(h), `franjas: "${h}" no tiene formato HH:MM`, archivo);
    exigir(!vistas.has(h), `franjas: "${h}" está repetida`, archivo);
    vistas.add(h);
  }
}

function validarGenerar(g, archivo) {
  for (const k of ["maxPorCorrida", "maxBorradoresPorDia", "candidatosMax", "diasSinRepetir", "maxHorasAntiguedad"]) {
    exigir(Number.isInteger(g?.[k]) && g[k] > 0, `generar.${k} debe ser un entero positivo`, archivo);
  }
  // Opcional: con ese número de borradores sin revisar, GENERAR no llama a Claude (controla coste y acumulación).
  if (g?.maxBorradoresPendientes !== undefined) exigir(Number.isInteger(g.maxBorradoresPendientes) && g.maxBorradoresPendientes > 0, "generar.maxBorradoresPendientes debe ser un entero positivo", archivo);
}

export const LOGO_FORMA_POR_DEFECTO = LOGO_FORMAS[0];
export const LOGO_TAMANO_POR_DEFECTO = LOGO_TAMANO.porDefecto; // px en la imagen de 1080x1350

function validarMarca(marca, archivo) {
  exigir(typeof marca?.nombre === "string" && marca.nombre, "marca.nombre es obligatorio", archivo);
  if (marca.logoForma !== undefined) exigir(LOGO_FORMAS.includes(marca.logoForma), `marca.logoForma debe ser ${LOGO_FORMAS.join(" o ")}`, archivo);
  if (marca.logoTamano !== undefined) exigir(Number.isInteger(marca.logoTamano) && marca.logoTamano >= LOGO_TAMANO.min && marca.logoTamano <= LOGO_TAMANO.max, `marca.logoTamano debe ser un entero entre ${LOGO_TAMANO.min} y ${LOGO_TAMANO.max} (píxeles)`, archivo);
  exigir(typeof marca?.usuario === "string" && marca.usuario.startsWith("@"), "marca.usuario debe empezar con @", archivo);
  exigir(typeof marca?.lema === "string", "marca.lema es obligatorio", archivo);
  if (marca.colores !== undefined) {
    exigir(marca.colores && typeof marca.colores === "object", "marca.colores debe ser un objeto", archivo);
    for (const k of Object.keys(COLORES_POR_DEFECTO)) {
      exigir(typeof marca.colores[k] === "string" && RE_COLOR.test(marca.colores[k]), `marca.colores.${k} es obligatorio y debe ser un color #RRGGBB`, archivo);
    }
  }
}

function validarAutomatico(a, archivo) {
  if (a === undefined) return;
  exigir(a && typeof a === "object", "automatico debe ser un objeto", archivo);
  for (const k of Object.keys(AUTOMATICO_POR_DEFECTO)) {
    if (a[k] !== undefined) exigir(typeof a[k] === "boolean", `automatico.${k} debe ser true o false`, archivo);
  }
}

// Panel maestro: una cuenta archivada conserva posts e historial pero no corre en ningún flujo.
function validarArchivo(c, archivo) {
  if (c.archivada !== undefined) exigir(typeof c.archivada === "boolean", "archivada debe ser true o false", archivo);
  if (c.archivadaEn !== undefined) exigir(typeof c.archivadaEn === "string" && !Number.isNaN(Date.parse(c.archivadaEn)), "archivadaEn debe ser una fecha ISO", archivo);
  if (c.archivada === true) exigir(c.automatico?.generar === false && c.automatico?.publicar === false, "archivada: una cuenta archivada debe tener automatico.generar y automatico.publicar en false", archivo);
}

function validarEditorial(e, archivo) {
  if (e === undefined) return;
  exigir(e && typeof e === "object", "editorial debe ser un objeto { temas, tono }", archivo);
  exigir(Array.isArray(e.temas) && e.temas.every((t) => typeof t === "string"), "editorial.temas debe ser una lista de textos", archivo);
  if (e.tono !== undefined) exigir(typeof e.tono === "string", "editorial.tono debe ser texto", archivo);
}

function validarSecretosInstagram(ig, archivo) {
  if (ig?.origen !== undefined) exigir(ORIGENES.includes(ig.origen), `instagram.origen debe ser ${ORIGENES.join(" o ")} (repositorio = secretos del repositorio con nombre; entorno = Environment cuenta-<id>)`, archivo);
  for (const k of ["tokenSecreto", "usuarioIdSecreto"]) {
    if (ig?.[k] !== undefined) exigir(esNombreDeSecreto(ig[k]), `instagram.${k} debe ser un nombre de secreto en mayúsculas (A-Z, 0-9 y _), p. ej. IG_ACCESS_TOKEN_OTRO_MEDIO`, archivo);
  }
}

// Métricas (fase 1): recogida diaria opcional, apagada por defecto e independiente de automatico.*.
function validarMetricas(m, archivo) {
  if (m === undefined) return;
  exigir(m && typeof m === "object" && !Array.isArray(m), "metricas debe ser un objeto", archivo);
  if (m.recoger !== undefined) exigir(typeof m.recoger === "boolean", "metricas.recoger debe ser true o false", archivo);
  for (const k of ["maxLlamadas", "maxPaginas", "maxPublicaciones", "ventanaDias"]) {
    if (m[k] !== undefined) exigir(Number.isInteger(m[k]) && m[k] > 0, `metricas.${k} debe ser un entero positivo`, archivo);
  }
}

function validarIlustracionesGlobal(il, archivo) {
  exigir(il && typeof il === "object", "ilustraciones es obligatorio", archivo);
  exigir(typeof il.activo === "boolean", "ilustraciones.activo debe ser true o false", archivo);
  exigir(il.proveedor === "gemini", "ilustraciones.proveedor debe ser gemini", archivo);
  exigir(typeof il.modelo === "string" && il.modelo.trim(), "ilustraciones.modelo es obligatorio", archivo);
  exigir(["512px", "1K", "2K"].includes(il.tamano), "ilustraciones.tamano debe ser 512px, 1K o 2K", archivo);
  exigir(Number.isInteger(il.timeoutMs) && il.timeoutMs > 0, "ilustraciones.timeoutMs debe ser un entero positivo", archivo);
  exigir(Number.isInteger(il.maxPorCorrida) && il.maxPorCorrida > 0, "ilustraciones.maxPorCorrida debe ser un entero positivo", archivo);
}

function validarIlustracionesCuenta(il, archivo) {
  exigir(il && typeof il === "object", "ilustraciones (estilo y rotulo) es obligatorio", archivo);
  exigir(typeof il.estilo === "string" && il.estilo.trim(), "ilustraciones.estilo es obligatorio", archivo);
  exigir(typeof il.rotulo === "string", "ilustraciones.rotulo debe ser texto (vacío = sin rótulo en la imagen)", archivo);
}

function validarComunes(cfg, archivo) {
  exigir(typeof cfg.zonaHoraria === "string", "zonaHoraria es obligatoria", archivo);
  exigir(/^https:\/\/[^/]+/.test(cfg.pages?.baseUrl || ""), "pages.baseUrl debe ser una URL https", archivo);
  exigir(typeof cfg.claude?.modelo === "string" && cfg.claude.modelo, "claude.modelo es obligatorio", archivo);
  exigir(ESFUERZOS.includes(cfg.claude?.esfuerzo), `claude.esfuerzo debe ser uno de ${ESFUERZOS.join(", ")}`, archivo);
  exigir(/^v\d+\.\d+$/.test(cfg.instagram?.apiVersion || ""), "instagram.apiVersion debe tener la forma vNN.N", archivo);
  exigir(Number.isInteger(cfg.archivarDespuesDeDias) && cfg.archivarDespuesDeDias > 0, "archivarDespuesDeDias debe ser un entero positivo", archivo);
}

// Configuración global (config.json de la raíz): lo compartido entre cuentas + la lista de cuentas.
export function validarGlobal(g) {
  exigir(g && typeof g === "object", "debe ser un objeto");
  validarComunes(g, "config.json");
  validarIlustracionesGlobal(g.ilustraciones, "config.json");
  exigir(Array.isArray(g.cuentas) && g.cuentas.length > 0, "cuentas debe ser una lista con al menos un id de cuenta");
  const vistos = new Set();
  for (const id of g.cuentas) {
    exigir(typeof id === "string" && RE_ID_CUENTA.test(id), `cuentas: "${id}" no es un id de cuenta válido (minúsculas, dígitos y guiones)`);
    exigir(!vistos.has(id), `cuentas: "${id}" está repetida`);
    vistos.add(id);
  }
  return g;
}

export const CLAVES_DE_CUENTA = ["nombre", "idioma", "zonaHoraria", "automatico", "marca", "fuentes", "generar", "franjas", "ilustraciones", "instagram", "editorial", "archivada", "archivadaEn", "metricas"];
const CLAVES_SOLO_GLOBALES = ["pages", "claude", "archivarDespuesDeDias", "cuentas"];

// Configuración de una cuenta (cuentas/<id>/config.json).
export function validarCuenta(c, id) {
  const archivo = `cuentas/${id}/config.json`;
  exigir(typeof id === "string" && RE_ID_CUENTA.test(id), `"${id}" no es un id de cuenta válido (minúsculas, dígitos y guiones)`, "id de cuenta");
  exigir(c && typeof c === "object", "debe ser un objeto", archivo);
  for (const k of CLAVES_SOLO_GLOBALES) exigir(c[k] === undefined, `${k} es global: va en el config.json de la raíz, no en la cuenta`, archivo);
  exigir(typeof c.nombre === "string" && c.nombre.trim(), "nombre es obligatorio", archivo);
  if (c.idioma !== undefined) exigir(typeof c.idioma === "string" && RE_IDIOMA.test(c.idioma), `idioma "${c.idioma}" debe tener la forma xx o xx-XX (p. ej. es-PA)`, archivo);
  if (c.zonaHoraria !== undefined) exigir(typeof c.zonaHoraria === "string" && c.zonaHoraria, "zonaHoraria debe ser texto", archivo);
  validarAutomatico(c.automatico, archivo);
  validarArchivo(c, archivo);
  validarEditorial(c.editorial, archivo);
  validarMarca(c.marca, archivo);
  validarFuentes(c.fuentes, archivo, { permitirVacio: c.automatico?.generar === false });
  validarGenerar(c.generar, archivo);
  validarFranjas(c.franjas, archivo);
  validarIlustracionesCuenta(c.ilustraciones, archivo);
  validarSecretosInstagram(c.instagram, archivo);
  validarMetricas(c.metricas, archivo);
  return c;
}

// Configuración efectiva: la forma "de siempre" (una sola cuenta) más cuenta, nombre, idioma y rutas.
export function validarConfig(cfg) {
  exigir(cfg && typeof cfg === "object", "debe ser un objeto");
  validarAutomatico(cfg.automatico, "config.json");
  validarMarca(cfg.marca, "config.json");
  validarComunes(cfg, "config.json");
  validarFuentes(cfg.fuentes, "config.json", { permitirVacio: cfg.automatico?.generar === false });
  validarGenerar(cfg.generar, "config.json");
  validarFranjas(cfg.franjas, "config.json");
  validarSecretosInstagram(cfg.instagram, "config.json");
  validarIlustracionesGlobal(cfg.ilustraciones, "config.json");
  validarIlustracionesCuenta(cfg.ilustraciones, "config.json");
  validarMetricas(cfg.metricas, "config.json");
  if (cfg.cuenta !== undefined) exigir(RE_ID_CUENTA.test(String(cfg.cuenta)), `cuenta "${cfg.cuenta}" no es un id válido`);
  if (cfg.idioma !== undefined) exigir(RE_IDIOMA.test(String(cfg.idioma)), `idioma "${cfg.idioma}" debe tener la forma xx o xx-XX`);
  return cfg;
}

export function rutasDeCuenta(id) {
  const carpeta = `cuentas/${id}`;
  return { carpeta, editorial: `${carpeta}/editorial.md`, logo: `${carpeta}/logo.png`, datos: `data/${id}` };
}

export function configDeCuenta(global, cuenta, id) {
  validarGlobal(global);
  validarCuenta(cuenta, id);
  exigir(global.cuentas.includes(id), `cuentas no incluye "${id}"`);
  const { cuentas, ...compartido } = global;
  const propias = Object.fromEntries(CLAVES_DE_CUENTA.filter((k) => cuenta[k] !== undefined).map((k) => [k, cuenta[k]]));
  const efectiva = {
    ...compartido,
    ...propias,
    cuenta: id,
    cuentaPrincipal: global.cuentas[0],
    archivada: cuenta.archivada === true,
    nombre: cuenta.nombre,
    idioma: cuenta.idioma || IDIOMA_POR_DEFECTO,
    automatico: { ...AUTOMATICO_POR_DEFECTO, ...(cuenta.automatico || {}) },
    marca: { ...cuenta.marca, logoForma: cuenta.marca.logoForma || LOGO_FORMA_POR_DEFECTO, logoTamano: cuenta.marca.logoTamano || LOGO_TAMANO_POR_DEFECTO, colores: { ...COLORES_POR_DEFECTO, ...(cuenta.marca.colores || {}) } },
    zonaHoraria: cuenta.zonaHoraria || global.zonaHoraria,
    instagram: { apiVersion: global.instagram.apiVersion, origen: "repositorio", ...cuenta.instagram },
    ilustraciones: { ...global.ilustraciones, ...cuenta.ilustraciones },
    metricas: { recoger: false, ...(cuenta.metricas || {}) },
    rutas: rutasDeCuenta(id),
  };
  return validarConfig(efectiva);
}

export function cargarGlobal(ruta = "config.json") {
  return validarGlobal(JSON.parse(fs.readFileSync(ruta, "utf8")));
}

export function cargarCuenta(raiz, id) {
  const ruta = path.join(raiz, "cuentas", id, "config.json");
  if (!fs.existsSync(ruta)) throw new Error(`Falta cuentas/${id}/config.json`);
  let c;
  try { c = JSON.parse(fs.readFileSync(ruta, "utf8")); } catch (err) { throw new Error(`cuentas/${id}/config.json: JSON inválido (${err.message})`); }
  return validarCuenta(c, id);
}

// Todas las cuentas activas con su configuración efectiva. Una cuenta inválida se reporta en
// `errores` y no impide cargar las demás.
export function cargarConfiguracion(raiz = ".") {
  const global = cargarGlobal(path.join(raiz, "config.json"));
  const cuentas = [];
  const errores = [];
  for (const id of global.cuentas) {
    try { cuentas.push(configDeCuenta(global, cargarCuenta(raiz, id), id)); }
    catch (err) { errores.push({ cuenta: id, mensaje: err.message }); }
  }
  return { global, cuentas, errores };
}

// Compatibilidad: configuración efectiva de la primera cuenta (herramientas y pruebas de un solo flujo).
export function cargarConfig(ruta = "config.json") {
  const raiz = path.dirname(path.resolve(ruta));
  const global = cargarGlobal(ruta);
  const id = global.cuentas[0];
  return configDeCuenta(global, cargarCuenta(raiz, id), id);
}

// Lo que el panel necesita de cada cuenta (nunca nombres de secretos ni fuentes).
export function resumenParaPanel(cuentas) {
  if (!cuentas.length) throw new Error("config.json: ninguna cuenta válida");
  const principal = cuentas.find((c) => c.cuenta === cuentas[0].cuentaPrincipal) || cuentas[0];
  return {
    cuentaPrincipal: cuentas[0].cuentaPrincipal, // primera cuenta declarada: dueña de los posts sin campo `cuenta`
    zonaHoraria: principal.zonaHoraria,
    franjas: principal.franjas,
    marca: principal.marca,
    cuentas: cuentas.map((c) => ({ id: c.cuenta, nombre: c.nombre, idioma: c.idioma, zonaHoraria: c.zonaHoraria, marca: c.marca, franjas: c.franjas, automatico: c.automatico, archivada: c.archivada === true })),
  };
}
