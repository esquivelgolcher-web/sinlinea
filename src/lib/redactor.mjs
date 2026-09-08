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

const REGLAS_FIJAS = `
## Reglas que no se negocian
- No inventes datos, nombres, cifras ni declaraciones: usa solo lo que dice el texto del candidato.
- Escribe en español de Panamá.
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
- "escena": describe en 15 a 40 palabras, en español, una imagen concreta que represente el hecho
  principal de la noticia (un lugar, un objeto, una situación): por ejemplo "Fachada de la Asamblea
  Nacional de Panamá al atardecer". Indica que el protagonista o elemento principal queda en el
  tercio superior derecho y que la zona izquierda y central queda despejada. Nunca personas reales ni
  rostros reconocibles, nunca texto ni logotipos, nunca violencia gráfica ni sangre. No incluyas el
  estilo fotográfico: se añade aparte.
`;

export function construirSystem(editorialMd) {
  return `${String(editorialMd || "").trim()}\n${REGLAS_FIJAS}`.trim();
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
    system: [{ type: "text", text: construirSystem(editorialMd), cache_control: { type: "ephemeral" } }],
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
    messages: [{ role: "user", content: `Reescribe el titular y la bajada para que quepan en la imagen del post.
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
