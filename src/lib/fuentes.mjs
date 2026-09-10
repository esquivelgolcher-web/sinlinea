// Convierte cada fuente configurada (rss | portada) en candidatos uniformes.
// Perfil editorial: cada candidato conserva medio, autor, idioma, fechas, fecha de consulta, alcance de acceso al
// texto (lo que de verdad se recuperó) y las fuentes primarias enlazadas; los artículos RSS se descargan para leer el
// texto completo (salvo vídeos), y lo que no se pudo leer queda como fragmento, nunca como texto leído.
import { parseFeed } from "./rss.mjs";
import { extraerEnlacesPortada, seccionDeUrl } from "./portada.mjs";
import { parrafosDesdeHtml, textoParaClaude, descargarArticulo } from "./articulo.mjs";
import { urlCanonica, esYoutube } from "./temas.mjs";

function fechaIso(valor, ahora) {
  const d = new Date(valor || "");
  return Number.isNaN(d.getTime()) ? ahora.toISOString() : d.toISOString();
}

function fechaIsoONull(valor) {
  const d = new Date(valor || "");
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function esReciente(iso, ahora, maxHoras) {
  return ahora.getTime() - new Date(iso).getTime() <= maxHoras * 3600000;
}

// Alcance de acceso según lo recuperado: completo (artículo entero), parcial (algunos párrafos), fragmento (solo la
// descripción del feed) o titular (nada más que el título).
export function alcanceDe({ parrafos = 0, caracteres = 0, descripcion = "" } = {}) {
  if (parrafos >= 4 && caracteres >= 1200) return "completo";
  if (parrafos >= 1) return "parcial";
  return String(descripcion || "").trim() ? "fragmento" : "titular";
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
      url: it.link, canonica: urlCanonica(it.link), medio: fuente.nombre, seccion, titulo: it.title,
      descripcion: it.description, fecha, texto, origen: "rss",
      autor: it.autor || null, idioma: fuente.idioma || null, prioridad: fuente.prioridad ?? null,
      actualizado: null, consultado: ahora.toISOString(),
      alcance: alcanceDe({ parrafos: parrafos.length, caracteres: texto.length, descripcion: it.description }),
      textoRecuperado: { parrafos: parrafos.length, caracteres: texto.length },
      fuentesPrimarias: [],
    });
  }
  return salida;
}

export function candidatosDesdePortada(urls, fuente, { ahora = new Date() } = {}) {
  return urls.map((url) => ({
    url, canonica: urlCanonica(url), medio: fuente.nombre, seccion: seccionDeUrl(url),
    titulo: "", descripcion: "", fecha: "", texto: "", origen: "portada",
    autor: null, idioma: fuente.idioma || null, prioridad: fuente.prioridad ?? null,
    actualizado: null, consultado: ahora.toISOString(), alcance: "titular", textoRecuperado: { parrafos: 0, caracteres: 0 }, fuentesPrimarias: [],
  }));
}

export function completarCandidato(cand, articulo, { ahora }) {
  const texto = textoParaClaude(articulo.parrafos) || articulo.descripcion || "";
  const descripcion = articulo.descripcion || cand.descripcion;
  return {
    ...cand,
    titulo: articulo.titulo || cand.titulo,
    descripcion,
    fecha: fechaIso(articulo.fecha || cand.fecha, ahora),
    texto,
    autor: articulo.autor || cand.autor || null,
    canonica: articulo.canonica || cand.canonica || urlCanonica(cand.url),
    actualizado: fechaIsoONull(articulo.actualizado) ?? cand.actualizado ?? null,
    consultado: ahora.toISOString(),
    alcance: alcanceDe({ parrafos: articulo.parrafos.length, caracteres: texto.length, descripcion }),
    textoRecuperado: { parrafos: articulo.parrafos.length, caracteres: texto.length },
    fuentesPrimarias: Array.isArray(articulo.enlaces) ? articulo.enlaces : [],
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

// Con perfil editorial (o fuentes con `descargar: true`) se lee el artículo de cada ítem RSS para conocer el texto completo
// y su alcance real. Los vídeos (YouTube) no se descargan: aportan título y descripción, es decir, un fragmento.
function debeDescargar(config, fuente) {
  if (fuente.descargar === false) return false;
  return fuente.descargar === true || Boolean(config.perfil);
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
      let deFeed = candidatosDesdeRss(parseFeed(cuerpo), fuente, { ahora, maxHoras }).filter((c) => filtrar(c.url));
      if (debeDescargar(config, fuente)) {
        deFeed = await enParalelo(deFeed.slice(0, config.generar.candidatosMax), concurrencia, async (cand) => {
          if (esYoutube(cand.url)) return cand;
          try {
            const art = await descargarArticulo(cand.url, { fetchText });
            return completarCandidato(cand, art, { ahora });
          } catch (err) {
            log.warn(`Artículo no accesible ${cand.url}: ${err.message}; se conserva como ${cand.alcance} (no se finge haberlo leído)`);
            return cand;
          }
        });
      }
      candidatos.push(...deFeed);
    } else {
      const enlaces = extraerEnlacesPortada(cuerpo, {
        baseUrl: fuente.url, patronArticulo: fuente.patronArticulo, excluirSecciones: fuente.excluirSecciones || [],
      });
      if (enlaces.length === 0 && cuerpo.trim().length > 0) {
        log.warn(`La portada "${fuente.nombre}" no produjo enlaces de artículos; revisa patronArticulo.`);
      }
      const urls = enlaces.filter(filtrar).slice(0, config.generar.candidatosMax);
      const pendientes = candidatosDesdePortada(urls, fuente, { ahora });
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
