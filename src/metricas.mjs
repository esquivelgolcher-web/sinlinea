// MÉTRICAS (fase 1): consulta de solo lectura de la API de Instagram por cuenta.
// - Sonda (--sin-guardar): informa por nombres qué campos y métricas devuelve la API para la cuenta; no escribe nada
//   y corre aunque metricas.recoger sea false (no toca las automatizaciones ni las colas).
// - Recogida (sin --sin-guardar): guarda instantáneas en data/<cuenta>/metricas/ (ver lib/metricas.mjs). Solo con
//   metricas.recoger = true, que es independiente de automatico.generar y automatico.publicar.
// Nunca imprime ni guarda valores de secretos. No usa Claude ni Gemini.
// Uso: node src/metricas.mjs --cuenta <id> --por-cuenta [--sin-guardar] [--dia AAAA-MM-DD]
import { pathToFileURL } from "node:url";
import { cargarConfiguracion } from "./lib/config.mjs";
import { crearClienteInstagram } from "./lib/instagram.mjs";
import { ocultarSecretos, leerSecretos, origenDeSecretos, describirCredenciales } from "./lib/secretos.mjs";
import { GRUPOS, textoValor } from "./lib/metricas.mjs";

const diaAnterior = (dia) => new Date(Date.parse(`${dia}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
const entrada = (r, m) => ({ valor: r.valores[m] ?? null, motivo: r.faltantes[m] ?? null });

// Consulta de solo lectura: perfil, primera página de medios, métricas de cuenta por grupos y las de un medio de muestra.
// `dia` = día (UTC) cuyas métricas de cuenta se piden (por defecto, ayer respecto a `ahora`).
export async function sondearMetricas({ cuenta, ig, dia = null, ahora = new Date() }) {
  const hasta = dia ? new Date(Date.parse(`${dia}T00:00:00Z`) + 86400000).toISOString().slice(0, 10) : ahora.toISOString().slice(0, 10);
  const desde = diaAnterior(hasta);
  const informe = { cuentaId: cuenta, dia: desde, perfil: null, medios: { total: 0, haySiguiente: false, muestra: [] }, cuenta: {}, medio: null, permiso: "basico", llamadas: 0, errores: [] };
  informe.perfil = await ig.perfilResumen();
  const pagina = await ig.listarMedios({ limite: 25 });
  informe.medios = { total: pagina.medios.length, haySiguiente: Boolean(pagina.siguiente), muestra: pagina.medios.slice(0, 5).map((m) => ({ id: m.id, tipo: m.tipo, fecha: m.fecha, meGusta: m.meGusta, comentarios: m.comentarios })) };
  const grupos = [GRUPOS.cuentaDocumentadas, GRUPOS.cuentaSeguidores, ...GRUPOS.cuentaPorConfirmar.map((m) => [m])];
  for (const metricas of grupos) {
    const r = await ig.insightsCuenta({ metricas: [...metricas], desde, hasta });
    for (const m of metricas) informe.cuenta[m] = entrada(r, m);
    if (r.error) informe.errores.push({ donde: `cuenta:${metricas.join(",")}`, codigo: r.error.codigo, mensaje: ocultarSecretos(r.error.mensaje) });
  }
  const muestra = pagina.medios[0] || null;
  if (muestra) {
    const metricas = [...GRUPOS.medioFeed, ...(muestra.tipo === "VIDEO" ? GRUPOS.medioReel : [])];
    const r = await ig.insightsMedio(muestra.id, { metricas });
    informe.medio = { id: muestra.id, tipo: muestra.tipo, fecha: muestra.fecha, metricas: Object.fromEntries(metricas.map((m) => [m, entrada(r, m)])) };
    if (r.error) informe.errores.push({ donde: `medio:${muestra.id}`, codigo: r.error.codigo, mensaje: ocultarSecretos(r.error.mensaje) });
  }
  const sinPermiso = GRUPOS.cuentaDocumentadas.every((m) => informe.cuenta[m]?.motivo === "sin-permiso-insights");
  informe.permiso = sinPermiso ? "basico" : "basico+insights";
  informe.llamadas = ig.llamadasHechas();
  return informe;
}

// Informe legible (solo nombres, ids de medios y valores de métricas; nunca secretos).
export function lineasDeSonda(informe) {
  const l = [];
  const v = (e) => textoValor(e?.valor ?? null, e?.motivo ?? "no-solicitado");
  l.push(`--- sonda de métricas · cuenta ${informe.cuentaId} · métricas de cuenta del día ${informe.dia} (UTC) · permiso vigente: ${informe.permiso === "basico" ? "básico" : "básico + estadísticas"} · llamadas: ${informe.llamadas}`);
  const p = informe.perfil || {};
  l.push(`perfil (permiso básico) · seguidores: ${textoValor(p.seguidores)} · seguidos: ${textoValor(p.seguidos)} · publicaciones: ${textoValor(p.publicaciones)}`);
  l.push(`publicaciones en la primera página: ${informe.medios.total}${informe.medios.haySiguiente ? " (hay más páginas)" : ""}`);
  for (const m of informe.medios.muestra) l.push(`  medio ${m.id} · ${m.tipo || "?"} · ${m.fecha || "?"} · me gusta: ${textoValor(m.meGusta, "conjunto-vacio")} · comentarios: ${textoValor(m.comentarios, "conjunto-vacio")}`);
  l.push("métricas de cuenta (period=day):");
  for (const [m, e] of Object.entries(informe.cuenta)) l.push(`  ${m}: ${v(e)}`);
  if (informe.medio) {
    l.push(`métricas acumuladas del medio ${informe.medio.id} (${informe.medio.tipo || "?"}, ${informe.medio.fecha || "?"}):`);
    for (const [m, e] of Object.entries(informe.medio.metricas)) l.push(`  ${m}: ${v(e)}`);
  } else l.push("sin medios: no se probaron métricas de publicación");
  for (const e of informe.errores) l.push(`  (API · ${e.donde} · code ${e.codigo}: ${e.mensaje})`);
  return l;
}

// Ejecuta la sonda o la recogida para las cuentas seleccionadas, con el mismo aislamiento de credenciales que PUBLICAR:
// en modo Environment solo con --por-cuenta; los secretos se leen con leerSecretos (sin fallback entre orígenes).
export async function metricasCuentas({ configuracion, raiz = process.cwd(), ahora = new Date(), log = console, igDe, soloCuenta = null, porCuenta = false, env = null, sinGuardar = false, dia = null, recoger = null }) {
  const resultados = {};
  for (const e of configuracion.errores || []) {
    if (soloCuenta && e.cuenta !== soloCuenta) continue;
    resultados[e.cuenta] = { error: e.mensaje };
    (log.error || log.warn)(`Cuenta ${e.cuenta}: configuración inválida, se omite (${e.mensaje}).`);
  }
  for (const config of configuracion.cuentas) {
    if (soloCuenta && config.cuenta !== soloCuenta) continue;
    if (config.archivada) { resultados[config.cuenta] = { motivo: "archivada" }; log.info(`Cuenta ${config.cuenta}: archivada, se omite.`); continue; }
    if (!porCuenta && origenDeSecretos(config) === "entorno") {
      resultados[config.cuenta] = { motivo: "entorno-requiere-job-por-cuenta" };
      log.warn(`Cuenta ${config.cuenta}: sus credenciales viven en el Environment cuenta-${config.cuenta}; solo se consulta en el job por cuenta (--cuenta ${config.cuenta} --por-cuenta). Se omite aquí.`);
      continue;
    }
    if (!sinGuardar && config.metricas?.recoger !== true) {
      resultados[config.cuenta] = { motivo: "metricas-desactivadas" };
      log.info(`Cuenta ${config.cuenta}: recogida de métricas apagada (metricas.recoger); no se consulta nada. Es independiente de automatico.generar y automatico.publicar.`);
      continue;
    }
    const credenciales = describirCredenciales(config, { porCuenta });
    log.info(`Cuenta ${config.cuenta}: credenciales · ${credenciales} · ${sinGuardar ? "sonda de solo lectura (no se guarda nada)" : "recogida"}`);
    try {
      const secretos = env ? leerSecretos(config, env, { porCuenta }) : null;
      const ig = await igDe(config, secretos);
      if (sinGuardar) {
        const informe = await sondearMetricas({ cuenta: config.cuenta, ig, dia, ahora });
        for (const l of lineasDeSonda(informe)) log.info(l);
        resultados[config.cuenta] = { informe, credenciales };
      } else {
        if (typeof recoger !== "function") throw new Error("la recogida con guardado todavía no está disponible; usa --sin-guardar");
        resultados[config.cuenta] = { ...(await recoger({ config, ig, raiz, ahora, log })), credenciales };
      }
    } catch (err) {
      const mensaje = ocultarSecretos(err.message);
      resultados[config.cuenta] = { error: mensaje, codigo: err.codigo ?? null };
      (log.error || log.warn)(`Cuenta ${config.cuenta}: falló la consulta de métricas (${mensaje}${err.codigo ? ` · code ${err.codigo}` : ""}); se continúa con las demás.`);
    }
  }
  return { resultados };
}

async function main() {
  const porCuenta = process.argv.includes("--por-cuenta");
  const sinGuardar = process.argv.includes("--sin-guardar");
  const i = process.argv.indexOf("--cuenta");
  const soloCuenta = i >= 0 ? String(process.argv[i + 1] || "").trim() || null : null;
  const d = process.argv.indexOf("--dia");
  const dia = d >= 0 ? String(process.argv[d + 1] || "").trim() || null : null;
  const configuracion = cargarConfiguracion();
  const igDe = (config, secretos) => {
    const { token, usuarioId } = secretos || leerSecretos(config, process.env, { porCuenta });
    return crearClienteInstagram({ token, usuarioId, apiVersion: config.instagram.apiVersion });
  };
  const r = await metricasCuentas({ configuracion, igDe, soloCuenta, porCuenta, env: process.env, sinGuardar, dia });
  const fallos = Object.entries(r.resultados).filter(([, x]) => x.error);
  for (const [c, x] of fallos) console.log(`::error::Cuenta ${c}: ${x.error}`);
  const consultadas = Object.values(r.resultados).filter((x) => x.informe || x.guardado).length;
  console.log(`Listo: ${consultadas} cuenta(s) consultada(s), ${fallos.length} con error, ${Object.values(r.resultados).filter((x) => x.motivo).length} omitida(s).${sinGuardar ? " [sin guardar]" : ""}`);
  if (fallos.length && !consultadas) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(`Error en metricas: ${ocultarSecretos(err.message)}`); process.exit(1); });
}
