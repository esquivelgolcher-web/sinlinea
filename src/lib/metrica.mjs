// Métrica de la glosa (cuarteta octosílaba con rima consonante, como la glosa panameña). Cuenta sílabas con las reglas
// del verso en español: diptongos, hiatos, u muda de "que/gui", sinalefa entre palabras (opcional: el poeta puede
// hacerla o no, así que se da un rango) y el ajuste del acento final (aguda +1, esdrújula −1). Módulo isomorfo: lo
// usa también el panel para avisar de un verso cojo antes de guardar.

export const LIMITES_GLOSA = Object.freeze({ versos: 4, silabas: 8, versoMax: 34 });

const FUERTES = "aeoáéó";
const VOCALES = "aeiouáéíóúü";
const esFuerte = (v) => FUERTES.includes(v) || v === "í" || v === "ú"; // una débil con tilde rompe el diptongo
const esDebilAcentuada = (v) => v === "í" || v === "ú";

function limpiar(palabra) {
  return String(palabra || "").toLowerCase().normalize("NFC").replace(/[^a-záéíóúüñ]/g, "");
}

// La "u" de que/qui/gue/gui no suena (la de güe/güi sí). La "y" final suena "i" (hoy, ley); la "y" sola es una vocal.
function fonetica(palabra) {
  let p = limpiar(palabra).replace(/qu([eéií])/g, "q$1").replace(/gu([eéií])/g, "g$1");
  if (p === "y") p = "i";
  else if (p.endsWith("y")) p = `${p.slice(0, -1)}i`;
  return p;
}

// Cada vocal de la palabra con la sílaba a la que pertenece: dos fuertes seguidas = hiato (sílabas distintas);
// fuerte + débil o débil + débil = diptongo (misma sílaba); una débil con tilde va en sílaba propia.
function vocales(p) {
  const lista = [];
  let silaba = -1;
  let anterior = null;
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (!VOCALES.includes(c)) { anterior = null; continue; }
    const nueva = anterior === null
      || (esFuerte(c) && esFuerte(anterior) && !esDebilAcentuada(c) && !esDebilAcentuada(anterior))
      || esDebilAcentuada(c) || esDebilAcentuada(anterior);
    if (nueva) silaba++;
    lista.push({ c, i, silaba });
    anterior = c;
  }
  return lista;
}

export function silabasDePalabra(palabra) {
  const v = vocales(fonetica(palabra));
  return v.length ? v[v.length - 1].silaba + 1 : 0;
}

// Sílaba tónica contada desde el final: 1 aguda, 2 llana, 3 o más esdrújula.
function tonicaDesdeElFinal(palabra) {
  const p = fonetica(palabra);
  const v = vocales(p);
  if (!v.length) return 1;
  const total = v[v.length - 1].silaba + 1;
  if (total === 1) return 1;
  const conTilde = v.find((x) => "áéíóú".includes(x.c));
  if (conTilde) return total - conTilde.silaba;
  const ultima = p[p.length - 1];
  return VOCALES.includes(ultima) || ultima === "n" || ultima === "s" ? 2 : 1;
}

function palabrasDe(verso) {
  return String(verso || "").split(/\s+/).map(limpiar).filter(Boolean);
}
const empiezaPorVocal = (p) => { const q = p.startsWith("h") ? p.slice(1) : p; return Boolean(q) && VOCALES.includes(q[0]); };
const acabaEnVocal = (p) => VOCALES.includes(p[p.length - 1]) || p.endsWith("y");

// Sílabas del verso: `max` sin sinalefas, `min` con todas; el acento de la última palabra ajusta las dos.
export function silabasDeVerso(verso) {
  const palabras = palabrasDe(verso);
  if (!palabras.length) return { min: 0, max: 0, sinalefas: 0 };
  let total = 0;
  let sinalefas = 0;
  palabras.forEach((p, i) => {
    total += silabasDePalabra(p);
    if (i > 0 && acabaEnVocal(palabras[i - 1]) && empiezaPorVocal(p)) sinalefas++;
  });
  const tonica = tonicaDesdeElFinal(palabras[palabras.length - 1]);
  const ajuste = tonica === 1 ? 1 : tonica >= 3 ? -1 : 0;
  return { min: total - sinalefas + ajuste, max: total + ajuste, sinalefas };
}

export function esOctosilabo(verso) {
  const { min, max } = silabasDeVerso(verso);
  return max > 0 && min <= LIMITES_GLOSA.silabas && LIMITES_GLOSA.silabas <= max;
}

// Clave de rima consonante: desde la vocal tónica de la última palabra hasta el final, sin tildes ni signos.
// En un diptongo, la clave empieza en la vocal que suena (la fuerte, o la débil con tilde).
// La rima se compara como suena en Panamá: seseo (z, ce, ci → s), b y v iguales, yeísmo (ll → y), ge/gi → j y h muda
// (salvo en ch). "voz" rima con "dos" y "cabe" con "nave"; "hecho" sigue sin rimar con "eco".
function sonido(clave) {
  return clave.replace(/z/g, "s").replace(/c([ei])/g, "s$1").replace(/v/g, "b").replace(/ll/g, "y").replace(/g([ei])/g, "j$1").replace(/(^|[^c])h/g, "$1");
}

export function claveDeRima(palabraOVerso) {
  const palabras = palabrasDe(palabraOVerso);
  const p = fonetica(palabras[palabras.length - 1] || "");
  const v = vocales(p);
  if (!v.length) return "";
  const total = v[v.length - 1].silaba + 1;
  const silabaTonica = total - tonicaDesdeElFinal(p);
  const enTonica = v.filter((x) => x.silaba === silabaTonica);
  const nucleo = enTonica.find((x) => esFuerte(x.c)) || enTonica[0];
  return sonido(p.slice(nucleo.i).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ü/g, "u"));
}

// Esquema de la cuarteta: ABBA (1 con 4, 2 con 3) o ABAB (1 con 3, 2 con 4). Las dos rimas tienen que ser distintas.
export function esquemaDeRima(versos) {
  if (!Array.isArray(versos) || versos.length !== 4) return null;
  const [a, b, c, d] = versos.map(claveDeRima);
  if (!a || !b || !c || !d) return null;
  if (a === d && b === c && a !== b) return "ABBA";
  if (a === c && b === d && a !== b) return "ABAB";
  return null;
}

export function erroresDeGlosa(versos) {
  if (!Array.isArray(versos) || versos.length !== LIMITES_GLOSA.versos) return [`la glosa necesita cuatro versos (llegaron ${Array.isArray(versos) ? versos.length : 0})`];
  const e = [];
  versos.forEach((v, i) => {
    const t = String(v ?? "").trim();
    if (!t) { e.push(`el verso ${i + 1} está vacío`); return; }
    if (t.length > LIMITES_GLOSA.versoMax) { e.push(`el verso ${i + 1} tiene ${t.length} caracteres y en la imagen caben ${LIMITES_GLOSA.versoMax}`); return; }
    if (!esOctosilabo(t)) {
      const { min, max } = silabasDeVerso(t);
      e.push(`el verso ${i + 1} tiene ${min === max ? min : `${min} a ${max}`} sílabas y la glosa pide ${LIMITES_GLOSA.silabas}`);
    }
  });
  if (e.length) return e;
  if (!esquemaDeRima(versos)) e.push("los versos no riman en cuarteta (1 con 4 y 2 con 3, o 1 con 3 y 2 con 4)");
  return e;
}
