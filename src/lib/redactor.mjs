// Selección y redacción de posts con Claude (salida estructurada con Zod).
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { CATEGORIAS } from "./estados.mjs";

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
