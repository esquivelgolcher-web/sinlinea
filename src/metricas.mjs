// MÉTRICAS (fase 1): consulta de solo lectura de la API de Instagram por cuenta.
// - Sonda (--sin-guardar): informa por nombres qué campos y métricas devuelve la API para la cuenta; no escribe nada
//   y corre aunque metricas.recoger sea false (no toca las automatizaciones ni las colas).
// - Recogida (sin --sin-guardar): guarda instantáneas en data/<cuenta>/metricas/ (ver lib/metricas.mjs). Solo con
//   metricas.recoger = true, que es independiente de automatico.generar y automatico.publicar.
// Nunca imprime ni guarda valores de secretos. No usa Claude ni Gemini.
// Uso: node src/metricas.mjs --cuenta <id> --por-cuenta [--sin-guardar] [--dia AAAA-MM-DD]
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cargarConfiguracion } from "./lib/config.mjs";
import { crearClienteInstagram, ErrorLimiteInstagram } from "./lib/instagram.mjs";
import { ocultarSecretos, leerSecretos, origenDeSecretos, describirCredenciales } from "./lib/secretos.mjs";
import { leerPosts, CUENTA_LEGADO } from "./lib/posts.mjs";
import { GRUPOS, textoValor, archivoDeMes, registrarConsultaCuenta, registrarPorDia, registrarConsultaMedio, seleccionarPendientes, enlazarConPosts, ENLACE_INSTAGRAM } from "./lib/metricas.mjs";

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
  // El permiso no se consulta a la API (Instagram Login no expone los permisos del token): se infiere de si las
  // consultas de estadísticas respondieron con datos o con el error de permiso (código 10).
  l.push(`--- sonda de métricas · cuenta ${informe.cuentaId} · métricas de cuenta del día ${informe.dia} (UTC) · permiso vigente (inferido por las respuestas, no consultado): ${informe.permiso === "basico" ? "básico" : "básico + estadísticas"} · llamadas: ${informe.llamadas}`);
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

// --- Recogida con guardado --------------------------------------------------------------------------------------
const LIMITES_POR_DEFECTO = Object.freeze({ ventanaDias: 90, maxLlamadas: 150, maxPaginas: 4, maxPublicaciones: 40 });
const leerJson = (ruta) => { try { return JSON.parse(fs.readFileSync(ruta, "utf8")); } catch { return null; } };
const escribirJson = (ruta, datos) => { fs.mkdirSync(path.dirname(ruta), { recursive: true }); fs.writeFileSync(ruta, JSON.stringify(datos, null, 2) + "\n"); };
const diasAtras = (ahora, n) => new Date(ahora.getTime() - n * 86400000).toISOString().slice(0, 10);

// Guarda en data/<cuenta>/metricas/ una instantánea con fecha de consulta: perfil (acumulados), métricas de cuenta de los
// tres últimos días (por período, se corrigen hasta 48 h después) y los totales acumulados de las publicaciones de la
// ventana, dentro de un presupuesto de llamadas. Lo que no cabe queda pendiente en estado.json para la corrida siguiente.
// Ante un límite de la API se detiene sin lanzar y guarda lo obtenido. Solo lecturas en Instagram; nunca toca posts/.
export async function recogerMetricas({ config, ig, raiz = process.cwd(), ahora = new Date(), log = console }) {
  const cuenta = config.cuenta;
  const limites = { ...LIMITES_POR_DEFECTO, ...(config.metricas || {}) };
  const carpeta = path.join(raiz, config.rutas?.datos || `data/${cuenta}`, "metricas");
  const consultadoEn = ahora.toISOString();
  const inicio = ig.llamadasHechas();
  const usadas = () => ig.llamadasHechas() - inicio;
  const quedan = () => limites.maxLlamadas - usadas();
  const estadoPrevio = leerJson(path.join(carpeta, "estado.json")) || {};
  const ultimaConsulta = { ...(estadoPrevio.ultimaConsulta || {}) };
  const noSoportadas = { ...(estadoPrevio.noSoportadas || {}) };
  let completo = true; let motivoIncompleto = null;
  const incompleto = (motivo) => { if (completo) { completo = false; motivoIncompleto = motivo; } };
  const registros = [];

  // 1. Perfil (acumulados). Si esto falla (token inválido, permiso básico ausente), no hay nada que guardar: se lanza.
  const perfil = await ig.perfilResumen();

  // 2. Métricas de cuenta por período: D-3, D-2, D-1 (una llamada por día; la API corrige hasta 48 h después).
  const metricasCuenta = [...GRUPOS.cuentaDocumentadas, ...GRUPOS.cuentaSeguidores, ...GRUPOS.cuentaPorConfirmar];
  const porDia = [];
  let permiso = "basico+insights";
  let limiteApi = null;
  for (const n of [3, 2, 1]) {
    const dia = diasAtras(ahora, n);
    if (quedan() < 2) { incompleto("presupuesto-agotado"); break; }
    try {
      const r = await ig.insightsCuenta({ metricas: metricasCuenta, desde: dia, hasta: diasAtras(ahora, n - 1), maxLlamadas: quedan() });
      porDia.push({ dia, valores: r.valores, faltantes: r.faltantes });
      if (metricasCuenta.every((m) => r.faltantes[m] === "sin-permiso-insights")) permiso = "basico";
    } catch (err) {
      if (!(err instanceof ErrorLimiteInstagram)) throw err;
      limiteApi = err; incompleto("limite-llamadas"); break;
    }
  }

  // 3. Lista de publicaciones (paginación limitada) dentro de la ventana, más las del sistema (posts/) aunque sean antiguas.
  const posts = leerPosts(path.join(raiz, "posts"), { cuentaPorDefecto: config.cuentaPrincipal || CUENTA_LEGADO });
  const enlaces = enlazarConPosts(posts, cuenta);
  const desdeVentana = diasAtras(ahora, limites.ventanaDias);
  const candidatos = [];
  let cursor = null; let listadoCompleto = true; let listadas = 0;
  if (!limiteApi) {
    for (let pagina = 0; pagina < limites.maxPaginas; pagina++) {
      if (quedan() < 2) { listadoCompleto = false; incompleto("presupuesto-agotado"); break; }
      let r;
      try { r = await ig.listarMedios({ limite: 50, despues: cursor }); }
      catch (err) { if (!(err instanceof ErrorLimiteInstagram)) throw err; limiteApi = err; listadoCompleto = false; incompleto("limite-llamadas"); break; }
      listadas += r.medios.length;
      let fueraDeVentana = false;
      for (const m of r.medios) {
        if ((m.fecha || "") >= desdeVentana || enlaces.has(m.id)) candidatos.push(m);
        else fueraDeVentana = true;
      }
      cursor = r.siguiente;
      if (!cursor || fueraDeVentana) break;
      if (pagina === limites.maxPaginas - 1) listadoCompleto = false;
    }
  }

  // 4. Publicaciones a consultar en esta corrida: pendientes de la anterior, nunca consultadas (recientes primero), más antiguas.
  // Una llamada por publicación. Los reintentos que excluyen métricas rechazadas (como máximo dos) solo ocurren la primera
  // vez que se ve un tipo de publicación (después se recuerdan en estado.noSoportadas): el exceso posible es mínimo.
  const presupuestoPublicaciones = limiteApi ? 0 : Math.max(0, Math.min(limites.maxPublicaciones, quedan()));
  const seleccion = seleccionarPendientes({ medios: candidatos, pendientes: estadoPrevio.pendientes || [], ultimaConsulta, presupuesto: presupuestoPublicaciones });
  const publicacionesPorMes = new Map();
  const archivoPublicaciones = (fechaIso) => {
    const nombre = archivoDeMes("publicaciones", fechaIso || consultadoEn);
    if (!publicacionesPorMes.has(nombre)) publicacionesPorMes.set(nombre, leerJson(path.join(carpeta, nombre)));
    return nombre;
  };
  let consultadas = 0;
  const pendientes = [...seleccion.restantes];
  for (let i = 0; i < seleccion.ahora.length; i++) {
    const m = seleccion.ahora[i];
    if (quedan() < 1) { incompleto("presupuesto-agotado"); pendientes.unshift(...seleccion.ahora.slice(i).map((x) => x.id)); break; }
    const tipo = m.tipo || "DESCONOCIDO";
    const excluidas = new Set(noSoportadas[tipo] || []);
    const metricas = [...GRUPOS.medioFeed, ...(tipo === "VIDEO" ? GRUPOS.medioReel : [])].filter((x) => !excluidas.has(x));
    let r;
    try { r = await ig.insightsMedio(m.id, { metricas, maxLlamadas: quedan() }); } // los reintentos caben o no en lo que queda
    catch (err) {
      if (!(err instanceof ErrorLimiteInstagram)) throw err;
      limiteApi = err; incompleto("limite-llamadas"); pendientes.unshift(...seleccion.ahora.slice(i).map((x) => x.id)); break;
    }
    if (r.noSoportadas?.length) noSoportadas[tipo] = [...new Set([...(noSoportadas[tipo] || []), ...r.noSoportadas])];
    const acumulados = { meGusta: m.meGusta ?? null, comentarios: m.comentarios ?? null, ...r.valores };
    const faltantes = { ...r.faltantes };
    if (m.meGusta === null || m.meGusta === undefined) faltantes.meGusta = "conjunto-vacio";
    if (m.comentarios === null || m.comentarios === undefined) faltantes.comentarios = "conjunto-vacio";
    for (const x of excluidas) { acumulados[x] = null; faltantes[x] = "metrica-no-soportada"; }
    const nombre = archivoPublicaciones(m.fecha);
    publicacionesPorMes.set(nombre, registrarConsultaMedio(publicacionesPorMes.get(nombre), { cuenta, medio: m, consultadoEn, acumulados, faltantes, enlace: enlaces.get(m.id) || ENLACE_INSTAGRAM }));
    ultimaConsulta[m.id] = consultadoEn;
    consultadas++;
  }
  if (pendientes.length && completo) incompleto("presupuesto-agotado");
  if (limiteApi) registros.push(`Cuenta ${cuenta}: la API de Instagram devolvió un límite de llamadas (code ${limiteApi.codigo}); se guarda lo obtenido y el resto queda pendiente para otra corrida.`);

  // 5. Escritura: archivo de cuenta del mes de la consulta, archivos de publicaciones por mes y estado para continuar.
  const nombreCuenta = archivoDeMes("cuenta", consultadoEn);
  let archivoCuenta = registrarConsultaCuenta(leerJson(path.join(carpeta, nombreCuenta)), { cuenta, consultadoEn, perfil, permiso, llamadas: usadas(), completo, motivoIncompleto });
  for (const d of porDia) archivoCuenta = registrarPorDia(archivoCuenta, { cuenta, dia: d.dia, consultadoEn, valores: d.valores, faltantes: d.faltantes });
  escribirJson(path.join(carpeta, nombreCuenta), archivoCuenta);
  for (const [nombre, datos] of publicacionesPorMes) if (datos) escribirJson(path.join(carpeta, nombre), datos);
  // Cobertura: lo que declara el perfil, lo que la API devolvió al listar, lo que entra en la ventana y lo consultado.
  // La muestra que expone la API no es necesariamente el historial completo de la cuenta.
  const cobertura = { declaradas: perfil.publicaciones ?? null, listadas, enVentana: candidatos.length, consultadas, listadoCompleto };
  escribirJson(path.join(carpeta, "estado.json"), { version: 1, cuenta, ultimaCorrida: consultadoEn, llamadas: usadas(), completo, motivoIncompleto, listadoCompleto, cobertura, pendientes: [...new Set(pendientes)], noSoportadas, ultimaConsulta });
  for (const m of registros) log.warn(m);
  log.info(`Cuenta ${cuenta}: métricas guardadas (${consultadoEn}) · permiso (inferido) ${permiso === "basico" ? "básico" : "básico + estadísticas"} · ${porDia.length} día(s) de cuenta · publicaciones: ${consultadas} consultada(s) de ${listadas} que devolvió la API (${candidatos.length} en la ventana; el perfil declara ${textoValor(perfil.publicaciones, "conjunto-vacio")}; listado ${listadoCompleto ? "completo" : "incompleto"}), ${pendientes.length} pendiente(s) · ${usadas()} llamada(s)${completo ? "" : ` · incompleta: ${motivoIncompleto}`}`);
  return { guardado: true, permiso, llamadas: usadas(), diasDeCuenta: porDia.length, publicacionesConsultadas: consultadas, pendientes: pendientes.length, listadoCompleto, cobertura, completo, motivoIncompleto, archivos: [nombreCuenta, ...publicacionesPorMes.keys(), "estado.json"] };
}

// Ejecuta la sonda o la recogida para las cuentas seleccionadas, con el mismo aislamiento de credenciales que PUBLICAR:
// en modo Environment solo con --por-cuenta; los secretos se leen con leerSecretos (sin fallback entre orígenes).
export async function metricasCuentas({ configuracion, raiz = process.cwd(), ahora = new Date(), log = console, igDe, soloCuenta = null, porCuenta = false, env = null, sinGuardar = false, dia = null, recoger = recogerMetricas }) {
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
