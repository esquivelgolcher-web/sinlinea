// Agrupación de candidatos por acontecimiento (evita duplicados) y utilidades de URL. Módulo isomorfo.
import { ALCANCES } from "./formatos.mjs";

const PARAMETROS_RASTREO = /^(utm_|fbclid|gclid|mc_|ref$|source$|igshid)/i;

export function urlCanonica(url) {
  try {
    const u = new URL(String(url || "").trim());
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (PARAMETROS_RASTREO.test(k)) u.searchParams.delete(k);
    u.hostname = u.hostname.toLowerCase();
    u.protocol = u.protocol.toLowerCase();
    let s = u.toString();
    if (u.search === "") s = s.replace(/\?$/, "");
    return s.replace(/\/+$/, "") || s;
  } catch {
    return String(url || "").trim();
  }
}

export const esYoutube = (url) => /^(https?:\/\/)?(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(String(url || ""));

// Palabras vacías frecuentes en español, inglés y francés (fuentes del perfil).
const VACIAS = new Set(("de la el los las un una unos unas y o a en por para con sin sobre del al que como más su sus es son fue han ha ser " +
  "the of and or in on at to for with from by is are was were be been as an that this these those its it their his her how why what who " +
  "le la les un une des du de et ou en dans sur pour avec sans par est sont ce cette ces qui que quoi comment pourquoi").split(/\s+/));
const normalizar = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

export function claveTema(titulo) {
  const tokens = normalizar(titulo).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length >= 4 && !VACIAS.has(t));
  // Plural simple → singular (phones/phone, journalists/journalist); se respetan pegasus, análisis, congress…
  return new Set(tokens.map((t) => (/(us|ss|is)$/.test(t) ? t : t.replace(/s$/, ""))));
}

export function similitud(a, b) {
  if (!a.size || !b.size) return 0;
  let comunes = 0;
  for (const t of a) if (b.has(t)) comunes++;
  return comunes / (a.size + b.size - comunes);
}

const rangoAlcance = (c) => { const i = ALCANCES.indexOf(c?.alcance); return i < 0 ? ALCANCES.length : i; };
// Mejor candidato de un grupo: más acceso al texto, mayor prioridad de fuente, más reciente.
function comparar(a, b) {
  return rangoAlcance(a) - rangoAlcance(b) || (a.prioridad ?? 9) - (b.prioridad ?? 9) || String(b.fecha || "").localeCompare(String(a.fecha || ""));
}

// Agrupa por URL canónica y por títulos parecidos. Un grupo es apto si su principal tiene texto completo o parcial:
// con solo titular o fragmento (vídeos, resúmenes) no se redacta una pieza como si se hubiera leído el contenido.
export function agruparCandidatos(candidatos, { umbral = 0.5 } = {}) {
  const grupos = [];
  for (const c of candidatos) {
    const canon = c.canonica || urlCanonica(c.url);
    const clave = claveTema(c.titulo);
    const g = grupos.find((x) => x.urls.has(canon) || x.claves.some((k) => similitud(k, clave) >= umbral));
    if (g) {
      if (!g.urls.has(canon)) { g.miembros.push(c); g.claves.push(clave); }
      g.urls.add(canon);
    } else {
      grupos.push({ urls: new Set([canon]), claves: [clave], miembros: [c] });
    }
  }
  return grupos.map((g) => {
    const ordenados = [...g.miembros].sort(comparar);
    const principal = ordenados[0];
    const apto = ["completo", "parcial"].includes(principal.alcance);
    return {
      principal, referencias: ordenados.slice(1), apto,
      motivo: apto ? "" : `solo ${principal.alcance || "titular"}: sirve como pista, no como base de una pieza`,
    };
  });
}
