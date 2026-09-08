// PUBLICAR: posts programados con hora cumplida → Instagram.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cargarConfig } from "./lib/config.mjs";
import { leerPosts, escribirPost } from "./lib/posts.mjs";
import { marcarPublicado, marcarError, imagenDesactualizada } from "./lib/estados.mjs";
import { componerCaption, validarCaption } from "./lib/caption.mjs";
import { crearClienteInstagram } from "./lib/instagram.mjs";
import { claveDia } from "./lib/fechas.mjs";
import { ocultarSecretos, leerSecretos, nombresDeSecretos } from "./lib/secretos.mjs";

const MAX_ESPERAS_IMAGEN = 3;

export function leerTokenInfo(raiz) {
  const ruta = path.join(raiz, "data", "token-info.json");
  if (!fs.existsSync(ruta)) return { vence: null };
  try { return JSON.parse(fs.readFileSync(ruta, "utf8")); } catch { return { vence: null }; }
}

function avisarToken(raiz, ahora, config, log) {
  const info = leerTokenInfo(raiz);
  if (!info.vence) { log.warn("data/token-info.json no tiene fecha de vencimiento del token de Instagram."); return; }
  const dias = Math.floor((Date.parse(info.vence) - Date.parse(claveDia(ahora, config.zonaHoraria))) / 86400000);
  if (dias < 7) log.warn(`El token de Instagram vence en ${dias} días (${info.vence}); revisa renovar-token.yml.`);
}

export async function ejecutarPublicar({ config, raiz = process.cwd(), ahora = new Date(), ig, log = console, dryRun = false }) {
  if (/CAMBIAR/.test(config.pages.baseUrl)) throw new Error("config.json: pages.baseUrl todavía tiene el valor CAMBIAR");
  const dir = path.join(raiz, "posts");
  const iso = ahora.toISOString();
  const resumen = { publicados: [], errores: [], pospuestos: [] };
  const listos = leerPosts(dir)
    .filter((p) => p.estado === "programado" && Date.parse(p.programado) <= ahora.getTime())
    .sort((a, b) => Date.parse(a.programado) - Date.parse(b.programado));
  avisarToken(raiz, ahora, config, log);
  if (!listos.length) { log.info("Nada que publicar."); return resumen; }

  const q = await ig.cuota();
  let disponibles = q.limite - q.usados;
  for (const p of listos) {
    if (disponibles <= 0) { log.warn(`Cuota de Instagram agotada (${q.usados}/${q.limite}); ${p.id} espera.`); resumen.pospuestos.push(p.id); continue; }
    if (!p.imagen?.url || imagenDesactualizada(p)) {
      log.warn(`${p.id}: la imagen no está lista (falta o está desactualizada); se espera al re-render.`);
      resumen.pospuestos.push(p.id);
      continue;
    }
    if (!(await ig.imagenPublica(p.imagen.url))) {
      const esperas = (p.esperasImagen || 0) + 1;
      if (esperas >= MAX_ESPERAS_IMAGEN) {
        escribirPost(dir, marcarError(p, { paso: "render", mensaje: `La imagen ${p.imagen.url} no está disponible públicamente tras ${esperas} intentos` }, iso));
        resumen.errores.push(p.id);
      } else {
        escribirPost(dir, { ...p, esperasImagen: esperas, actualizado: iso });
        resumen.pospuestos.push(p.id);
      }
      log.warn(`${p.id}: imagen aún no pública (intento ${esperas}/${MAX_ESPERAS_IMAGEN}).`);
      continue;
    }
    const listo = p.esperasImagen ? { ...p, esperasImagen: 0 } : p;
    const caption = componerCaption({ caption: listo.caption, medio: listo.fuente.medio, hashtags: listo.hashtags });
    const v = validarCaption(caption);
    if (!v.ok) {
      escribirPost(dir, marcarError(listo, { paso: "instagram", mensaje: v.errores.join(" ") }, iso));
      resumen.errores.push(listo.id);
      continue;
    }
    if (dryRun) { log.info(`[dry-run] Publicaría ${listo.id}: ${listo.titular}`); continue; }
    try {
      const r = await ig.publicarImagen({ imageUrl: listo.imagen.url, caption });
      escribirPost(dir, marcarPublicado(listo, r, iso));
      resumen.publicados.push(listo.id);
      disponibles -= 1;
      log.info(`Publicado ${listo.id}: ${r.permalink}`);
    } catch (err) {
      const mensaje = ocultarSecretos(err.message);
      escribirPost(dir, marcarError(listo, { paso: "instagram", mensaje }, iso));
      resumen.errores.push(listo.id);
      log.warn(`Instagram rechazó ${listo.id}: ${mensaje}`);
    }
  }
  return resumen;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const config = cargarConfig();
  let ig;
  if (dryRun && !process.env[nombresDeSecretos(config).token]) {
    ig = { cuota: async () => ({ usados: 0, limite: 100 }), imagenPublica: async () => true, publicarImagen: async () => { throw new Error("no aplica en dry-run"); } };
  } else {
    const { token, usuarioId } = leerSecretos(config, process.env);
    ig = crearClienteInstagram({ token, usuarioId, apiVersion: config.instagram.apiVersion });
  }
  const r = await ejecutarPublicar({ config, ig, dryRun });
  console.log(`Listo: ${r.publicados.length} publicados, ${r.errores.length} con error, ${r.pospuestos.length} pospuestos${dryRun ? " [dry-run]" : ""}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(`Error en publicar: ${ocultarSecretos(err.message)}`); process.exit(1); });
}
