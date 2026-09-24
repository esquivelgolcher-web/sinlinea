// Plantillas de imagen de un post: "foto" (la de siempre, con ilustración de fondo), "dato" (una cifra enorme que es la
// noticia) y "titular" (portada tipográfica, sin ilustración). Sirven para que el perfil no sea una pared de tarjetas
// iguales. La plantilla la decide el contenido (dato si la noticia gira en torno a una cifra comprobada en el texto) y
// nunca se repite la del post anterior. Módulo isomorfo (sin node:fs ni node:crypto): lo usa también el panel.

export const PLANTILLAS = Object.freeze(["foto", "dato", "titular"]);
export const NOMBRES_PLANTILLA = Object.freeze({ foto: "Foto", dato: "Dato", titular: "Titular" });
export const LIMITES_DATO = Object.freeze({ cifraMax: 14, fraseMax: 90 });

// Un post sin el campo (todos los anteriores a las plantillas) es una foto.
export function plantillaDe(post) {
  return PLANTILLAS.includes(post?.plantilla) ? post.plantilla : "foto";
}

// Plantillas que puede usar una cuenta (marca.plantillas). Sin declarar, solo la foto: nada cambia para esa cuenta.
export function plantillasDeCuenta(config) {
  const p = config?.marca?.plantillas;
  return Array.isArray(p) && p.length ? p.filter((x) => PLANTILLAS.includes(x)) : ["foto"];
}

export function erroresDeDato(dato) {
  const cifra = String(dato?.cifra ?? "").trim();
  const frase = String(dato?.frase ?? "").trim();
  if (!dato || typeof dato !== "object") return ["el dato necesita una cifra y una frase"];
  if (typeof dato.cifra !== "string" || typeof dato.frase !== "string") return ["el dato necesita una cifra y una frase de texto"];
  const e = [];
  if (!cifra) e.push("falta la cifra del dato");
  else if (!/\d/.test(cifra)) e.push("la cifra del dato tiene que llevar un número");
  else if (cifra.length > LIMITES_DATO.cifraMax) e.push(`la cifra tiene ${cifra.length} caracteres y caben ${LIMITES_DATO.cifraMax}`);
  if (!frase) e.push("falta la frase que acompaña a la cifra");
  else if (frase.length > LIMITES_DATO.fraseMax) e.push(`la frase del dato tiene ${frase.length} caracteres y caben ${LIMITES_DATO.fraseMax}`);
  return e;
}

// Los números de un texto con el separador unificado: "$1,5 millones" → ["1.5"], "5,100" → ["5.100"], "47%" → ["47"].
// Se unifica en vez de borrarse para que "1.5" no se confunda con "15".
function numeros(texto) {
  return (String(texto || "").match(/\d+(?:[.,]\d+)*/g) || []).map((n) => n.replace(/,/g, "."));
}

// ¿Aparecen los números de la cifra, tal cual, en el texto de la noticia? Se aceptan coma o punto como separador;
// un redondeo o un número inventado no pasa. Se compara número a número, no por subcadena: 47 no está dentro de 147.
export function datoEnTexto(dato, textos) {
  const buscados = numeros(dato?.cifra);
  if (!buscados.length) return false;
  const presentes = new Set((textos || []).flatMap((t) => numeros(t)));
  return buscados.every((n) => presentes.has(n));
}

// El post más reciente; si varios comparten fecha (los de una misma corrida), el último de la lista.
function masReciente(posts) {
  return (posts || []).reduce((m, p) => (!m || String(p?.creado || "") >= String(m?.creado || "") ? p : m), null);
}

// Elige la plantilla de un post nuevo: la que pide el contenido y, si coincide con la del post anterior de la cuenta,
// otra permitida, para que dos tarjetas seguidas nunca se vean iguales.
export function elegirPlantilla({ permitidas = ["foto"], dato = null, anteriores = [] }) {
  const puede = (p) => permitidas.includes(p);
  if (!permitidas.some((p) => p !== "foto")) return "foto";
  const preferida = dato && puede("dato") ? "dato" : "foto";
  const ultima = masReciente(anteriores);
  if (!ultima || plantillaDe(ultima) !== preferida) return preferida;
  const alternativas = { dato: ["foto", "titular"], foto: ["titular", "dato"], titular: ["foto"] }[preferida];
  return alternativas.find((p) => puede(p) && (p !== "dato" || dato)) || preferida;
}
