// Selección y redacción de posts con Claude (salida estructurada con Zod).
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { CATEGORIAS } from "./estados.mjs";
import { LIMITES } from "./texto.mjs";

export const EsquemaRedaccion = z.object({
  seleccion: z.array(z.object({
    indiceCandidato: z.number().int(),
    categoria: z.enum(CATEGORIAS),
    titular: z.string(),
    bajada: z.string(),
    caption: z.string(),
    hashtags: z.array(z.string()),
    relevancia: z.number(),
    motivo: z.string(),
    escena: z.string(),
  })),
  descartados: z.array(z.object({ indiceCandidato: z.number().int(), motivo: z.string() })),
});

const NOMBRES_IDIOMA = {
  "es": "español", "es-PA": "español de Panamá", "es-MX": "español de México", "es-CO": "español de Colombia",
  "es-ES": "español de España", "es-AR": "español de Argentina", "en": "inglés", "en-US": "inglés", "en-GB": "inglés",
  "pt": "portugués", "pt-BR": "portugués de Brasil", "fr": "francés", "it": "italiano",
};

export function nombreIdioma(idioma = "es-PA") {
  return NOMBRES_IDIOMA[idioma] || `el idioma "${idioma}"`;
}

const reglasFijas = (idioma) => `
## Reglas que no se negocian
- No inventes datos, nombres, cifras ni declaraciones: usa solo lo que dice el texto del candidato.
- Escribe en ${nombreIdioma(idioma)}.
- Una noticia por post. No repitas temas que aparezcan en la lista de "publicado recientemente",
  salvo que el candidato aporte un hecho nuevo y lo digas en el motivo.
- Prefiere noticias de interés general e impacto para la ciudadanía.
- Categorías permitidas (usa exactamente una de estas): ${CATEGORIAS.join(", ")}.
- "indiceCandidato" es el número entre corchetes de la lista de candidatos.
- "relevancia" va de 0 a 1. Devuelve primero los más relevantes.
- Si ningún candidato vale la pena, devuelve "seleccion" vacía y explica en "descartados".
- "titular": entre 40 y 55 caracteres (ideal) y nunca más de 65 caracteres. Prioriza protagonista +
  hecho principal. Sin punto final. Cabe en tres líneas de letra grande: si dudas, acórtalo.
- "bajada": máximo 110 caracteres. Añade información complementaria sin repetir el titular.
- "escena": describe en 15 a 40 palabras, en ${nombreIdioma(idioma)}, una imagen concreta que represente el hecho
  principal de la noticia (un lugar, un objeto, una situación): por ejemplo "Fachada de la Asamblea
  Nacional de Panamá al atardecer". Indica que el protagonista o elemento principal queda en el
  tercio superior derecho y que la zona izquierda y central queda despejada. Si el titular nombra a una persona pública (un papa, un presidente, un ministro, un\n  directivo) y la noticia trata de su actividad pública, la escena puede mostrarla en esa función, descrita por su\n  cargo y el contexto (por ejemplo "el papa saluda desde el balcón de la basílica"), con un tratamiento de\n  ilustración editorial que no pretenda ser una fotografía real del hecho. La persona aparece a media distancia, de perfil, de espaldas o en plano general, reconocible por el cargo, la vestimenta y el contexto, sin primeros planos del rostro y sin buscar el parecido facial. Nunca personas privadas, menores,\n  víctimas ni testigos; nunca alguien acusado, investigado o detenido; nunca una persona real cometiendo un delito\n  ni escenas que parezcan pruebas. Nunca texto ni logotipos, nunca violencia gráfica ni sangre. No incluyas el
  estilo fotográfico: se añade aparte.
`;

export function construirSystem(editorialMd, { idioma = "es-PA" } = {}) {
  return `${String(editorialMd || "").trim()}\n${reglasFijas(idioma)}`.trim();
}

export function construirUsuario({ candidatos, recientes, max }) {
  const lista = candidatos.map((c, i) =>
    `[${i}] ${c.medio} · ${c.seccion || "sin sección"} · ${c.fecha}\nTítulo: ${c.titulo}\nDescripción: ${c.descripcion || "(sin descripción)"}\nTexto: ${c.texto || "(texto no disponible)"}`
  ).join("\n\n");
  const rec = recientes.length ? recientes.map((t) => `- ${t}`).join("\n") : "- (ninguno)";
  return `Elige hasta ${max} noticias de la lista de candidatos y redacta el post de cada una.

## Publicado recientemente (no repetir)
${rec}

## Candidatos
${lista}`;
}

export function validarSeleccion(salida, candidatos, max) {
  const vistos = new Set();
  const validos = [];
  for (const s of salida.seleccion || []) {
    const i = s.indiceCandidato;
    if (!Number.isInteger(i) || i < 0 || i >= candidatos.length || vistos.has(i)) continue;
    vistos.add(i);
    validos.push({ ...s, candidato: candidatos[i] });
  }
  validos.sort((a, b) => b.relevancia - a.relevancia);
  return validos.slice(0, max);
}

export async function redactar({ client, config, editorialMd, candidatos, recientes, max }) {
  const res = await client.messages.parse({
    model: config.claude.modelo,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: config.claude.esfuerzo, format: zodOutputFormat(EsquemaRedaccion) },
    system: [{ type: "text", text: construirSystem(editorialMd, { idioma: config.idioma }), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: construirUsuario({ candidatos, recientes, max }) }],
  });
  if (res.stop_reason === "refusal") {
    throw new Error(`Claude rechazó la solicitud: ${res.stop_details?.explanation || "sin explicación"}`);
  }
  if (!res.parsed_output) throw new Error("Claude no devolvió una salida válida según el esquema");
  return {
    seleccion: validarSeleccion(res.parsed_output, candidatos, max),
    descartados: res.parsed_output.descartados || [],
    uso: res.usage,
  };
}

const EsquemaTextos = z.object({ titular: z.string(), bajada: z.string() });

// Pide a Claude un titular y una bajada más cortos cuando el texto actual no cabe en la imagen.
export async function acortarTextos({ client, config, titular, bajada, motivo }) {
  const [min, ideal] = LIMITES.titularIdeal;
  const res = await client.messages.parse({
    model: config.claude.modelo,
    max_tokens: 1000,
    thinking: { type: "adaptive" },
    output_config: { effort: "low", format: zodOutputFormat(EsquemaTextos) },
    system: "Eres editor de titulares de un medio panameño. No inventes datos, nombres ni cifras: usa solo lo que dicen el titular y la bajada actuales.",
    messages: [{ role: "user", content: `Reescribe el titular y la bajada para que quepan en la imagen del post. Escribe en ${nombreIdioma(config.idioma)}.
- Titular: entre ${min} y ${ideal} caracteres (nunca más de ${LIMITES.titularMax} caracteres), mayúsculas y minúsculas normales, sin punto final. Mantén protagonista + hecho principal.
- Bajada: máximo ${LIMITES.bajadaMax} caracteres, información complementaria sin repetir el titular. Si la bajada actual ya cumple, devuélvela igual.

Motivo: ${motivo}
Titular actual: ${titular}
Bajada actual: ${bajada}` }],
  });
  if (res.stop_reason === "refusal") {
    throw new Error(`Claude rechazó la solicitud: ${res.stop_details?.explanation || "sin explicación"}`);
  }
  const t = String(res.parsed_output?.titular ?? "").trim();
  const b = String(res.parsed_output?.bajada ?? "").trim();
  if (!t) throw new Error("Claude devolvió un titular vacío");
  if (t.length > LIMITES.titularMax) throw new Error(`Claude devolvió un titular de ${t.length} caracteres (máximo ${LIMITES.titularMax})`);
  if (b.length > LIMITES.bajadaMax) throw new Error(`Claude devolvió una bajada de ${b.length} caracteres (máximo ${LIMITES.bajadaMax})`);
  return { titular: t, bajada: b };
}

const EsquemaEscena = z.object({ escena: z.string() });

// Redacta la escena de la ilustración cuando el post no la tiene (p. ej. borradores antiguos).
export async function escribirEscena({ client, config, titular, bajada }) {
  const res = await client.messages.parse({
    model: config.claude.modelo,
    max_tokens: 800,
    thinking: { type: "adaptive" },
    output_config: { effort: "low", format: zodOutputFormat(EsquemaEscena) },
    system: `Eres editor gráfico de un medio de noticias. Describe en 15 a 40 palabras, en ${nombreIdioma(config.idioma)}, una imagen concreta que represente el hecho principal de la noticia (un lugar, un objeto, una situación). El protagonista o elemento principal queda en el tercio superior derecho y la zona izquierda y central queda despejada. Si el titular nombra a una persona pública (un papa, un presidente, un ministro, un directivo) y la noticia trata de su actividad pública, la escena puede mostrarla en esa función, descrita por su cargo y el contexto, con un tratamiento de ilustración editorial que no pretenda ser una fotografía real del hecho. La persona aparece a media distancia, de perfil, de espaldas o en plano general, reconocible por el cargo, la vestimenta y el contexto, sin primeros planos del rostro y sin buscar el parecido facial. Nunca personas privadas, menores, víctimas ni testigos; nunca alguien acusado, investigado o detenido; nunca una persona real cometiendo un delito ni escenas que parezcan pruebas. Nunca texto ni logotipos, nunca violencia gráfica ni sangre. No incluyas el estilo fotográfico. No inventes datos que no estén en el titular o la bajada.`,
    messages: [{ role: "user", content: `Titular: ${titular}\nBajada: ${bajada}` }],
  });
  if (res.stop_reason === "refusal") {
    throw new Error(`Claude rechazó la solicitud: ${res.stop_details?.explanation || "sin explicación"}`);
  }
  const escena = String(res.parsed_output?.escena ?? "").trim();
  if (!escena) throw new Error("Claude devolvió una escena vacía");
  return escena;
}

// --- Frases célebres: una frase literal dicha por el papa dentro de textos reales del día -------------------------------
const EsquemaFrase = z.object({ indice: z.number().int().nullable(), frase: z.string(), autor: z.string(), fuente: z.string(), motivo: z.string() });

// `textos`: [{ url, medio, titulo, fecha, texto }]. Devuelve { indice, frase, autor, fuente } o null si ningún texto sirve.
// Quien llama comprueba además que la frase aparece literalmente en el texto (esLiteral): nada se publica de memoria.
export async function extraerFrase({ client, config, textos }) {
  if (!textos?.length) return null;
  const lista = textos.map((t, i) => `[${i}] ${t.medio} · ${t.titulo}${t.fecha ? ` · ${t.fecha}` : ""}\n${String(t.texto || "").slice(0, 6000)}`).join("\n\n---\n\n");
  const res = await client.messages.parse({
    model: config.claude.modelo,
    max_tokens: 600,
    thinking: { type: "adaptive" },
    output_config: { effort: "low", format: zodOutputFormat(EsquemaFrase) },
    system: `Eres editor de la cuenta ${config.marca?.nombre || ""}, dedicada al papa y la Iglesia. De los textos numerados elige UNA frase memorable dicha por el papa (palabras suyas citadas en el texto, no del redactor ni de otra persona), copiada de forma literal (verbatim, exacta: sin cambiar, añadir ni quitar palabras dentro de la frase), de entre 8 y 45 palabras, con sentido completo por sí sola y apta para publicarse como cita en ${nombreIdioma(config.idioma)}. Devuelve: indice (número del texto), frase (copia exacta), autor (el nombre del papa tal como aparece en el texto, p. ej. "Pope Leo XIV"), fuente (la ocasión: Angelus, homilía, discurso, audiencia general, mensaje…) y motivo (breve). Si ningún texto contiene palabras del papa adecuadas, devuelve indice null y frase vacía. Nunca inventes, traduzcas ni parafrasees.`,
    messages: [{ role: "user", content: lista }],
  });
  if (res.stop_reason === "refusal") throw new Error(`Claude rechazó la solicitud: ${res.stop_details?.explanation || "sin explicación"}`);
  const s = res.parsed_output;
  if (!s || s.indice === null || !Number.isInteger(s.indice) || !textos[s.indice] || !String(s.frase || "").trim()) return null;
  return { indice: s.indice, frase: String(s.frase).trim(), autor: String(s.autor || "").trim(), fuente: String(s.fuente || "").trim() };
}

// --- Perfil editorial (periodismo tecnológico): selección puntuada, afirmaciones con fuente, formatos post/carrusel/reel --
import { FORMATOS, TIPOS_AFIRMACION, ALERTAS } from "./formatos.mjs";
import { puntuar, PESOS_POR_DEFECTO } from "./puntuacion.mjs";

export const EsquemaRedaccionPerfil = z.object({
  seleccion: z.array(z.object({
    indiceGrupo: z.number().int(),
    formato: z.enum(FORMATOS),
    categoria: z.enum(CATEGORIAS),
    titular: z.string(),
    bajada: z.string(),
    caption: z.string(),
    hashtags: z.array(z.string()),
    escena: z.string(),
    angulo: z.string(),
    atribucion: z.string(),
    fechaHecho: z.string().nullable(),
    afirmaciones: z.array(z.object({ texto: z.string(), tipo: z.enum(TIPOS_AFIRMACION), fuente: z.string(), contrastada: z.boolean() })),
    puntuacion: z.object({ afinidad: z.number(), interes: z.number(), evidencia: z.number(), visual: z.number() }),
    alertas: z.array(z.string()),
    carrusel: z.array(z.object({ titulo: z.string(), texto: z.string() })).nullable(),
    reel: z.object({
      narracion: z.string(),
      subtitulos: z.array(z.string()),
      escenas: z.array(z.object({ segundos: z.number(), descripcion: z.string(), recurso: z.string() })),
      recursos: z.array(z.string()),
    }).nullable(),
    motivo: z.string(),
  })),
  descartados: z.array(z.object({ indiceGrupo: z.number().int(), motivo: z.string() })),
});

const reglasPerfil = (idioma, perfil) => `
## Reglas del perfil editorial (periodismo tecnológico)
Especialidad: ${(perfil?.temas || []).join("; ")}.
- Voz: ${nombreIdioma(idioma)} natural para una audiencia latinoamericana; directa, curiosa, crítica y rigurosa. Explica cada término
  técnico la primera vez que aparezcan (una frase, sin condescendencia). Ironía solo cuando aporta y no distorsiona los hechos.
- Distingue siempre hecho, denuncia, hipótesis u opinión, y dilo en el texto. Cada afirmación va en "afirmaciones" con su tipo y la
  URL de la fuente (del grupo o de sus fuentes primarias). Una denuncia o acusación sin fuente es una alerta, nunca un hecho.
- Atribuye los hallazgos al medio o investigador que los publicó ("según WIRED", "documentos revisados por…"). Nunca uses
  "descubrimos", "revelamos" ni "nuestra investigación": el material no es una investigación propia. No inventes experiencias
  personales y no conectes el tema con Panamá o Latinoamérica salvo que la fuente lo pruebe.
- Prohibidas las exageraciones: "nadie te lo cuenta", "la verdad que ocultan", "esto lo cambia todo" y similares.
- Fecha del hecho: si el acontecimiento es anterior a la publicación, ponla en "fechaHecho" (AAAA-MM-DD) y dila en el texto; un
  hecho antiguo nunca se presenta como reciente. Si no consta, "fechaHecho" es null.
- Redacta desde cero en ${nombreIdioma(idioma)}: nada de traducir el artículo ni parafrasearlo párrafo a párrafo. Citas textuales
  solo si son necesarias, breves (máximo 25 palabras) y atribuidas. Si solo hay una fuente, dilo en "alertas" y ajusta la
  certeza del texto.
- "acceso" en la lista de candidatos describe cuánto del artículo pudo leer este sistema (completo, parcial, fragmento), no el
  acceso del medio a sus fuentes: nunca escribas que el medio "tuvo acceso parcial". Si el acceso es parcial, marca la alerta
  acceso-parcial y, si hace falta decirlo, escribe que este resumen se basa en un extracto del artículo.
- Seguridad: explica mecanismo, impacto y protección; nunca conviertas técnicas de hackeo ofensivo en un tutorial operativo.
- Puntuación (0-10 por eje; es una heurística editorial, no es una predicción de alcance): "afinidad" con la especialidad,
  "interes" público e impacto humano, "evidencia" (calidad de lo disponible: documento original, varias fuentes, datos),
  "visual" (potencial de explicación visual). La actualidad la calcula el sistema con la fecha de publicación.
- Formatos disponibles: ${(perfil?.formatos || FORMATOS).join(", ")}. Reglas por formato:
  · post: una idea principal; titular de 6-12 palabras (y nunca más de 65 caracteres: la precisión manda sobre el límite);
    bajada opcional de hasta 25 palabras; "caption" de 100-180 palabras con atribución visible y referencia a la fuente;
    pregunta final solo si invita a una conversación concreta. "carrusel" y "reel" en null.
  · carrusel: además del post de portada, "carrusel" con entre 5 y 7 diapositivas (titulo breve + texto de una idea, legible en
    móvil, máximo 45 palabras): portada (hallazgo o pregunta), qué ocurrió, cómo funciona o qué evidencia existe, a quién
    afecta y por qué, contexto/límites o qué falta por saber, cierre y fuentes. Adapta la estructura al tema sin rellenar.
    El "titulo" de cada diapositiva es un título real (el gancho o la idea), nunca la etiqueta de su función: en la portada
    va la pregunta o el hallazgo, no la palabra "Portada"; en la última, una conclusión, no "Cierre y fuentes".
  · reel: además del post de portada, "reel" con narración de 85-140 palabras (35-60 segundos de voz real) que abre con un
    hecho concreto o una pregunta relevante y sigue con explicación, evidencia, consecuencias y cierre; "subtitulos" (frases
    cortas en orden), "escenas" (segundos de inicio, descripción visual y recurso sugerido) y "recursos" necesarios. No prometas
    revelaciones que el vídeo no contiene.
- Imagen ("escena"): ilustración o fotografía protagonista, alto contraste, sin el cliché del hacker con capucha, código verde
  o candados; nunca documentos, capturas o escenas que parezcan pruebas reales. Con la persona pública nombrada en el titular
  se aplica la regla de la escena; en una pieza sobre denuncias, acusaciones o investigaciones nunca se representa a la persona
  señalada: van el lugar, la institución o el contexto.
- "alertas" solo admite: ${ALERTAS.join(", ")}.
`;

export function construirSystemPerfil(editorialMd, { idioma = "es-PA", perfil = {} } = {}) {
  return `${String(editorialMd || "").trim()}\n${reglasFijas(idioma)}\n${reglasPerfil(idioma, perfil)}`.trim();
}

function describirCandidato(c) {
  return `${c.medio}${c.autor ? ` · ${c.autor}` : ""} · ${c.idioma || "idioma desconocido"} · publicado ${c.fecha || "?"} · actualizado ${c.actualizado || "sin dato"} · acceso ${c.alcance || "desconocido"}`;
}

export function construirUsuarioPerfil({ grupos, recientes, max, formatos = FORMATOS }) {
  const lista = grupos.map((g, i) => {
    const p = g.principal;
    const refs = (g.referencias || []).map((r) => `  - ${r.medio} · ${r.alcance || "?"} · ${r.titulo} (${r.url})`).join("\n");
    const primarias = (p.fuentesPrimarias || []).map((u) => `  - ${u}`).join("\n");
    return `[${i}] ${describirCandidato(p)}\nURL: ${p.url}\nTítulo: ${p.titulo}\nDescripción: ${p.descripcion || "(sin descripción)"}\nTexto: ${p.texto || "(texto no disponible)"}`
      + (primarias ? `\nFuentes primarias enlazadas:\n${primarias}` : "") + (refs ? `\nReferencias del grupo:\n${refs}` : "");
  }).join("\n\n");
  const rec = recientes.length ? recientes.map((t) => `- ${t}`).join("\n") : "- (ninguno)";
  return `Elige hasta ${max} grupos de la lista y redacta una pieza por grupo. Si eliges varios, usa formatos distintos entre sí (disponibles: ${formatos.join(", ")}). Cada grupo reúne fuentes sobre el mismo acontecimiento: la principal es la que tiene más texto; las referencias solo sirven para contexto y contraste.

## Publicado recientemente (no repetir)
${rec}

## Grupos de candidatos
${lista}`;
}

const diasEntre = (a, b) => (b.getTime() - Date.parse(a)) / 86400000;

// Valida la selección del perfil: índices, grupos aptos, formatos permitidos, puntuación mínima y alertas.
export function validarSeleccionPerfil(salida, grupos, { max, perfil = {}, ahora = new Date() }) {
  const pesos = perfil.puntuacion?.pesos || PESOS_POR_DEFECTO;
  const minimo = perfil.puntuacion?.minimo ?? 0;
  const formatos = perfil.formatos || FORMATOS;
  const vistos = new Set();
  const seleccion = [];
  const descartados = [];
  for (const s of salida.seleccion || []) {
    const i = s.indiceGrupo;
    if (!Number.isInteger(i) || i < 0 || i >= grupos.length || vistos.has(i)) { descartados.push({ indiceGrupo: i, motivo: "índice fuera de rango o repetido" }); continue; }
    vistos.add(i);
    const g = grupos[i];
    if (!g.apto) { descartados.push({ indiceGrupo: i, motivo: g.motivo || "grupo no apto" }); continue; }
    if (!formatos.includes(s.formato)) { descartados.push({ indiceGrupo: i, motivo: `formato ${s.formato} no habilitado en el perfil` }); continue; }
    const p = g.principal;
    const puntuacion = puntuar(s.puntuacion, { publicado: p.fecha, ahora, pesos });
    if (puntuacion.total < minimo) { descartados.push({ indiceGrupo: i, motivo: `puntuación ${puntuacion.total} por debajo del mínimo ${minimo}` }); continue; }
    const alertas = new Set((s.alertas || []).filter((a) => ALERTAS.includes(a)));
    if (!(g.referencias || []).length) alertas.add("fuente-unica");
    if (p.alcance === "parcial") alertas.add("acceso-parcial");
    if ((s.afirmaciones || []).some((a) => a.tipo === "denuncia" && !String(a.fuente || "").trim())) alertas.add("acusacion-sin-fuente");
    const fechaHecho = s.fechaHecho && !Number.isNaN(Date.parse(s.fechaHecho)) ? s.fechaHecho : null;
    if ((fechaHecho && diasEntre(fechaHecho, ahora) > 30) || (!fechaHecho && p.fecha && diasEntre(p.fecha, ahora) > 30)) alertas.add("hecho-antiguo");
    if (Number(s.puntuacion?.evidencia) < 4) alertas.add("evidencia-insuficiente");
    seleccion.push({ ...s, fechaHecho, candidato: p, referencias: g.referencias || [], puntuacion: { total: puntuacion.total, componentes: puntuacion.componentes }, alertas: [...alertas] });
  }
  seleccion.sort((a, b) => b.puntuacion.total - a.puntuacion.total);
  return { seleccion: seleccion.slice(0, max), descartados };
}

export async function redactarPerfil({ client, config, editorialMd, grupos, recientes, max, ahora = new Date() }) {
  const perfil = config.perfil || {};
  const res = await client.messages.parse({
    model: config.claude.modelo,
    // Tres piezas con carrusel y reel necesitan salida larga, pero el SDK exige streaming por encima de ~21 000 tokens.
    max_tokens: 20000,
    thinking: { type: "adaptive" },
    output_config: { effort: config.claude.esfuerzo, format: zodOutputFormat(EsquemaRedaccionPerfil) },
    system: [{ type: "text", text: construirSystemPerfil(editorialMd, { idioma: config.idioma, perfil }), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: construirUsuarioPerfil({ grupos, recientes, max, formatos: perfil.formatos || FORMATOS }) }],
  });
  if (res.stop_reason === "refusal") throw new Error(`Claude rechazó la solicitud: ${res.stop_details?.explanation || "sin explicación"}`);
  if (!res.parsed_output) throw new Error("Claude no devolvió una salida válida según el esquema");
  const v = validarSeleccionPerfil(res.parsed_output, grupos, { max, perfil, ahora });
  return { seleccion: v.seleccion, descartados: [...(res.parsed_output.descartados || []), ...v.descartados], uso: res.usage };
}
