// Carga y valida config.json. Falla temprano con un mensaje claro.
import fs from "node:fs";
import { esNombreDeSecreto } from "./secretos.mjs";

export const ESFUERZOS = ["low", "medium", "high", "xhigh", "max"];
const TIPOS_FUENTE = ["rss", "portada"];

function exigir(cond, mensaje) {
  if (!cond) throw new Error(`config.json: ${mensaje}`);
}

export function validarConfig(cfg) {
  exigir(cfg && typeof cfg === "object", "debe ser un objeto");
  exigir(typeof cfg.marca?.nombre === "string" && cfg.marca.nombre, "marca.nombre es obligatorio");
  exigir(typeof cfg.marca?.usuario === "string" && cfg.marca.usuario.startsWith("@"), "marca.usuario debe empezar con @");
  exigir(typeof cfg.marca?.lema === "string", "marca.lema es obligatorio");
  exigir(typeof cfg.zonaHoraria === "string", "zonaHoraria es obligatoria");
  exigir(/^https:\/\/[^/]+/.test(cfg.pages?.baseUrl || ""), "pages.baseUrl debe ser una URL https");

  exigir(Array.isArray(cfg.fuentes) && cfg.fuentes.length > 0, "fuentes debe tener al menos una fuente");
  cfg.fuentes.forEach((f, i) => {
    exigir(typeof f.nombre === "string" && f.nombre, `fuentes[${i}].nombre es obligatorio`);
    exigir(TIPOS_FUENTE.includes(f.tipo), `fuentes[${i}].tipo debe ser rss o portada`);
    exigir(/^https?:\/\//.test(f.url || ""), `fuentes[${i}].url debe ser una URL`);
    if (f.tipo === "portada") {
      exigir(typeof f.patronArticulo === "string", `fuentes[${i}].patronArticulo es obligatorio para portada`);
      try { new RegExp(f.patronArticulo); } catch { exigir(false, `fuentes[${i}].patronArticulo no es una expresión regular válida`); }
    }
    if (f.excluirSecciones !== undefined) {
      exigir(Array.isArray(f.excluirSecciones), `fuentes[${i}].excluirSecciones debe ser una lista`);
    }
  });

  const g = cfg.generar || {};
  for (const k of ["maxPorCorrida", "maxBorradoresPorDia", "candidatosMax", "diasSinRepetir", "maxHorasAntiguedad"]) {
    exigir(Number.isInteger(g[k]) && g[k] > 0, `generar.${k} debe ser un entero positivo`);
  }
  exigir(typeof cfg.claude?.modelo === "string" && cfg.claude.modelo, "claude.modelo es obligatorio");
  exigir(ESFUERZOS.includes(cfg.claude?.esfuerzo), `claude.esfuerzo debe ser uno de ${ESFUERZOS.join(", ")}`);

  exigir(Array.isArray(cfg.franjas) && cfg.franjas.length > 0, "franjas debe tener al menos una hora");
  const vistas = new Set();
  for (const h of cfg.franjas) {
    exigir(/^([01]\d|2[0-3]):[0-5]\d$/.test(h), `franjas: "${h}" no tiene formato HH:MM`);
    exigir(!vistas.has(h), `franjas: "${h}" está repetida`);
    vistas.add(h);
  }
  exigir(/^v\d+\.\d+$/.test(cfg.instagram?.apiVersion || ""), "instagram.apiVersion debe tener la forma vNN.N");
  for (const k of ["tokenSecreto", "usuarioIdSecreto"]) {
    if (cfg.instagram[k] !== undefined) exigir(esNombreDeSecreto(cfg.instagram[k]), `instagram.${k} debe ser un nombre de secreto en mayúsculas (A-Z, 0-9 y _), p. ej. IG_ACCESS_TOKEN_OTRO_MEDIO`);
  }

  const il = cfg.ilustraciones;
  exigir(il && typeof il === "object", "ilustraciones es obligatorio");
  exigir(typeof il.activo === "boolean", "ilustraciones.activo debe ser true o false");
  exigir(il.proveedor === "gemini", "ilustraciones.proveedor debe ser gemini");
  for (const k of ["modelo", "estilo", "rotulo"]) exigir(typeof il[k] === "string" && il[k].trim(), `ilustraciones.${k} es obligatorio`);
  exigir(["512px", "1K", "2K"].includes(il.tamano), "ilustraciones.tamano debe ser 512px, 1K o 2K");
  exigir(Number.isInteger(il.timeoutMs) && il.timeoutMs > 0, "ilustraciones.timeoutMs debe ser un entero positivo");
  exigir(Number.isInteger(il.maxPorCorrida) && il.maxPorCorrida > 0, "ilustraciones.maxPorCorrida debe ser un entero positivo");

  exigir(Number.isInteger(cfg.archivarDespuesDeDias) && cfg.archivarDespuesDeDias > 0, "archivarDespuesDeDias debe ser un entero positivo");
  return cfg;
}

export function cargarConfig(ruta = "config.json") {
  const cfg = JSON.parse(fs.readFileSync(ruta, "utf8"));
  return validarConfig(cfg);
}
