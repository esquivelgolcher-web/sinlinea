// Convierte cada fuente configurada (rss | portada) en candidatos uniformes.
import { parseFeed } from "./rss.mjs";
import { extraerEnlacesPortada, seccionDeUrl } from "./portada.mjs";
import { parrafosDesdeHtml, textoParaClaude, descargarArticulo } from "./articulo.mjs";

function fechaIso(valor, ahora) {
  const d = new Date(valor || "");
  return Number.isNaN(d.getTime()) ? ahora.toISOString() : d.toISOString();
}

function esReciente(iso, ahora, maxHoras) {
  return ahora.getTime() - new Date(iso).getTime() <= maxHoras * 3600000;
}

export function candidatosDesdeRss(items, fuente, { ahora, maxHoras }) {
  const excluidas = new Set(fuente.excluirSecciones || []);
  const salida = [];
  for (const it of items) {
    if (!/^https?:\/\//i.test(it.link)) continue;
    const seccion = seccionDeUrl(it.link);
    if (excluidas.has(seccion)) continue;
    const fecha = fechaIso(it.pubDate, ahora);
    if (!esReciente(fecha, ahora, maxHoras)) continue;
    const parrafos = parrafosDesdeHtml(it.contenido || "");
    const texto = parrafos.length ? textoParaClaude(parrafos) : it.description;
    salida.push({
      url: it.link, medio: fuente.nombre, seccion, titulo: it.title,
      descripcion: it.description, fecha, texto, origen: "rss",
    });
  }
  return salida;
}

export function candidatosDesdePortada(urls, fuente) {
  return urls.map((url) => ({
    url, medio: fuente.nombre, seccion: seccionDeUrl(url),
    titulo: "", descripcion: "", fecha: "", texto: "", origen: "portada",
  }));
}

export function completarCandidato(cand, articulo, { ahora }) {
  return {
    ...cand,
    titulo: articulo.titulo || cand.titulo,
    descripcion: articulo.descripcion || cand.descripcion,
    fecha: fechaIso(articulo.fecha, ahora),
    texto: textoParaClaude(articulo.parrafos) || articulo.descripcion || "",
  };
}

async function enParalelo(items, n, fn) {
  const resultados = new Array(items.length);
  let i = 0;
  async function trabajador() {
    while (i < items.length) {
      const idx = i++;
      resultados[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, trabajador));
  return resultados;
}

export async function recolectar(config, { fetchText, ahora = new Date(), log = console, filtrar = () => true, concurrencia = 4 }) {
  const maxHoras = config.generar.maxHorasAntiguedad;
  let candidatos = [];
  for (const fuente of config.fuentes) {
    let cuerpo;
    try {
      cuerpo = await fetchText(fuente.url, { timeoutMs: 20000, retries: 1 });
    } catch (err) {
      log.warn(`Fuente "${fuente.nombre}" no disponible: ${err.message}`);
      continue;
    }
    if (fuente.tipo === "rss") {
      candidatos.push(...candidatosDesdeRss(parseFeed(cuerpo), fuente, { ahora, maxHoras }).filter((c) => filtrar(c.url)));
    } else {
      const enlaces = extraerEnlacesPortada(cuerpo, {
        baseUrl: fuente.url, patronArticulo: fuente.patronArticulo, excluirSecciones: fuente.excluirSecciones || [],
      });
      if (enlaces.length === 0 && cuerpo.trim().length > 0) {
        log.warn(`La portada "${fuente.nombre}" no produjo enlaces de artículos; revisa patronArticulo.`);
      }
      const urls = enlaces.filter(filtrar).slice(0, config.generar.candidatosMax);
      const pendientes = candidatosDesdePortada(urls, fuente);
      const completos = await enParalelo(pendientes, concurrencia, async (cand) => {
        try {
          const art = await descargarArticulo(cand.url, { fetchText });
          if (!art.titulo && !art.parrafos.length) throw new Error("sin título ni párrafos");
          return completarCandidato(cand, art, { ahora });
        } catch (err) {
          log.warn(`Artículo omitido ${cand.url}: ${err.message}`);
          return null;
        }
      });
      candidatos.push(...completos.filter((c) => c && esReciente(c.fecha, ahora, maxHoras)));
    }
  }
  candidatos.sort((a, b) => b.fecha.localeCompare(a.fecha));
  return candidatos.slice(0, config.generar.candidatosMax);
}
