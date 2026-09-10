// Panel de aprobación de Sin Línea y panel maestro de cuentas. Sin framework. Todo texto va por textContent.
import { aprobar, descartar, quitarDeCola, reintentar, editarTexto, imagenDesactualizada, hashTexto, CATEGORIAS, VARIANTES } from "./lib/estados.mjs";
import { componerCaption, validarCaption, normalizarHashtags, LIMITES } from "./lib/caption.mjs";
import { validarTextos, LIMITES as LIMITES_TEXTO } from "./lib/texto.mjs";
import { siguienteFranjaLibre, franjasOcupadas, choca } from "./lib/franjas.mjs";
import { claveDia, isoDesdeClave, horaMinutoDeIso, ZONA_PANAMA } from "./lib/fechas.mjs";
import {
  IDIOMAS, IDIOMA_POR_DEFECTO, ZONA_POR_DEFECTO, COLORES_POR_DEFECTO, LOGO_TAMANO, FRANJAS_POR_DEFECTO, ESTILO_ILUSTRACION_POR_DEFECTO,
  idSugerido, normalizarUsuario, nombresSecretosSugeridos, erroresDeCuenta, plantillaEditorial, configDesdeFormulario, formularioDesdeConfig,
  archivarCuenta, reactivarCuenta, estadoConexion, secretosExpuestos, secretosExpuestosComunes, workflowsPorCuenta, fechaCortaUtc,
  describirOrigen, nombreEntorno, requisitosGeneracion, requisitosPublicacion, postsVencidos, guiaConexion, resumenActividad, borradorDesdeFormulario,
  estadoConexionRed, requisitosPublicacionRed, guiaConexionRed, conexionesDeCuenta,
} from "./lib/cuenta.mjs";
import { crearAlmacenLocal, crearAlmacenGitHub, deducirRepo, ErrorConflicto, ErrorConflictoArchivo } from "./almacen.mjs";
import { seriesDeCuenta, rendimientoDePublicaciones, textoValor, textoMotivo } from "./lib/metricas.mjs";
// Multicanal (F1): destinos por pieza, versiones por red y conexiones por red.
import {
  REDES, NOMBRES_RED, destinosDe, aprobarDestinos, omitirDestino, reintentarDestinos, decidirIncierto, piezaCambiada, imagenCambiada,
  actualizarVersion, aprobarImagenActual,
} from "./lib/destinos.mjs";
import { proponerVersion, medirVersion } from "./lib/versiones.mjs";
import { destinosEncendidos, pausaGeneral } from "./lib/conexiones.mjs";

const configPanel = { franjas: ["07:00", "09:30", "12:00", "14:30", "17:00", "19:30"], zonaHoraria: ZONA_PANAMA, marca: {}, cuentas: [] };
async function cargarConfigPanel() {
  try {
    const r = await fetch("./config.json", { cache: "no-store" });
    if (r.ok) Object.assign(configPanel, await r.json());
  } catch { /* se usan los valores por defecto */ }
  if (!Array.isArray(configPanel.cuentas) || !configPanel.cuentas.length) {
    configPanel.cuentas = [{ id: "sinlinea", nombre: configPanel.marca.nombre || "Sin Línea", marca: configPanel.marca, franjas: configPanel.franjas, zonaHoraria: configPanel.zonaHoraria }];
  }
}
// --- Cuentas ----------------------------------------------------------------
const cuentaPrincipal = () => configPanel.cuentaPrincipal || configPanel.cuentas[0].id;
const cuentaDe = (post) => post.cuenta || cuentaPrincipal(); // los posts antiguos sin cuenta son de la principal
const configDeCuenta = (id) => configPanel.cuentas.find((c) => c.id === id) || configPanel.cuentas[0];
function elegirCuentaInicial() {
  let guardada = null;
  try { guardada = localStorage.getItem("sinlinea.cuenta"); } catch { /* sin almacenamiento */ }
  const existe = (id) => configPanel.cuentas.some((c) => c.id === id);
  estado.cuenta = existe(guardada) ? guardada : (existe(cuentaPrincipal()) ? cuentaPrincipal() : configPanel.cuentas[0].id);
}
function seleccionarCuenta(id) {
  estado.cuenta = id;
  try { localStorage.setItem("sinlinea.cuenta", id); } catch { /* sin almacenamiento */ }
  if (estado.items.length) pintar(); // los posts ya cargados se filtran al instante; cargar() refresca después
  cargar();
  if (estado.vista === "metricas") pintarMetricas();
}
const PESTANAS = [
  ["borrador", "Borradores"], ["programado", "Programados"], ["error", "Errores"], ["publicado", "Publicados"], ["descartado", "Descartados"],
];
const estado = { almacen: null, items: [], pestana: "borrador", borradores: new Map(), cuenta: null, vista: "posts", cuentasInfo: null, formulario: null };
const $ = (id) => document.getElementById(id);
const ahoraIso = () => new Date().toISOString();
const urlSegura = (u) => (/^https?:\/\//i.test(String(u)) ? u : "#");
const esLocal = () => ["localhost", "127.0.0.1"].includes(location.hostname);
const soloLectura = () => estado.almacen.modo === "github" && !localStorage.getItem("sinlinea.token");

// Pistas sobre el estado de la ilustración de un post (usadas por el sondeo y la tarjeta).
export function generandoIlustracion(ilus) {
  return Boolean(ilus && ilus.usar && !ilus.ruta && !ilus.error);
}
export function regenerandoIlustracion(ilus) {
  return Boolean(ilus && ilus.usar && ilus.ruta && ilus.hashDescripcion !== hashTexto(ilus.descripcion));
}

function el(tag, props = {}, hijos = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) n.setAttribute(k, v);
  }
  for (const h of hijos) n.append(h);
  return n;
}

function avisar(mensaje, ms = 6000) {
  const a = $("aviso");
  a.textContent = mensaje; a.hidden = !mensaje;
  if (mensaje && ms) setTimeout(() => { if (a.textContent === mensaje) a.hidden = true; }, ms);
}

// --- Conexión ---------------------------------------------------------------
function configurarAlmacen() {
  if (esLocal()) { estado.almacen = crearAlmacenLocal(); $("boton-config").hidden = true; return; }
  const deducido = deducirRepo(location) || {};
  const owner = localStorage.getItem("sinlinea.owner") || deducido.owner || "";
  const repo = localStorage.getItem("sinlinea.repo") || deducido.repo || "";
  const token = localStorage.getItem("sinlinea.token") || "";
  $("campo-owner").value = owner; $("campo-repo").value = repo; $("campo-token").value = token;
  if (!owner || !repo) { $("config").hidden = false; avisar("Indica el usuario y el repositorio de GitHub.", 0); }
  estado.almacen = crearAlmacenGitHub({ token, owner, repo });
  if (!token) avisar("Sin token: el panel está en modo solo lectura. Pulsa Configurar.", 0);
}

$("boton-config").addEventListener("click", () => { $("config").hidden = !$("config").hidden; });
$("boton-guardar-config").addEventListener("click", () => {
  localStorage.setItem("sinlinea.owner", $("campo-owner").value.trim());
  localStorage.setItem("sinlinea.repo", $("campo-repo").value.trim());
  localStorage.setItem("sinlinea.token", $("campo-token").value.trim());
  location.reload();
});
$("boton-borrar-config").addEventListener("click", () => { localStorage.removeItem("sinlinea.token"); location.reload(); });

// --- Vistas -----------------------------------------------------------------
function mostrarVista(vista) {
  estado.vista = vista;
  $("vista-posts").hidden = vista !== "posts";
  $("maestro").hidden = vista !== "maestro";
  $("formulario-cuenta").hidden = vista !== "formulario";
  $("metricas").hidden = vista !== "metricas";
  $("boton-cuentas").textContent = ["maestro", "formulario"].includes(vista) ? "Panel de posts" : "Cuentas";
  $("boton-metricas").hidden = !["posts", "metricas"].includes(vista);
  $("boton-metricas").textContent = vista === "metricas" ? "Posts" : "Métricas";
  try { localStorage.setItem("sinlinea.vista", ["formulario", "metricas"].includes(vista) ? (vista === "formulario" ? "maestro" : "posts") : vista); } catch { /* sin almacenamiento */ }
  if (vista === "maestro") pintarMaestro();
  if (vista === "metricas") pintarMetricas();
  window.scrollTo(0, 0);
}
$("boton-cuentas").addEventListener("click", () => mostrarVista(["maestro", "formulario"].includes(estado.vista) ? "posts" : "maestro"));
$("boton-metricas").addEventListener("click", () => mostrarVista(estado.vista === "metricas" ? "posts" : "metricas"));
$("metricas-actualizar").addEventListener("click", () => pintarMetricas({ frescos: true }));

// --- Métricas (fase 1): solo lectura de data/<cuenta>/metricas -----------------------------------------------
const CLAVES_POR_DIA = ["reach", "views", "total_interactions", "accounts_engaged", "profile_views", "follows_and_unfollows", "follower_count", "website_clicks"];
const CLAVES_PUBLICACION = ["meGusta", "comentarios", "reach", "views", "saved", "profile_visits", "shares", "total_interactions"];
const fechaConsulta = (iso) => (iso ? `${fechaCortaUtc(iso)} UTC` : "ninguna");
const celda = (texto, props = {}) => el("td", { text: texto, ...props });
// Valor de una métrica en la tabla: número real (incluido 0) o el motivo; nunca un 0 por un null.
function celdaMetrica(valor, motivo, variacion = null) {
  const td = el("td", { text: textoValor(valor, motivo) });
  if (typeof valor !== "number") td.className = "no-disponible";
  if (variacion) td.append(el("small", { text: ` ${variacion.diferencia >= 0 ? "+" : ""}${variacion.diferencia} en ${variacion.dias} día${variacion.dias === 1 ? "" : "s"} (aprox.)` }));
  return td;
}
function graficoSeguidores(instantaneas) {
  const puntos = instantaneas.filter((i) => typeof i.perfil?.seguidores === "number");
  if (puntos.length < 2) return el("p", { class: "nota", text: "El gráfico de seguidores aparece con dos o más consultas con valor." });
  const w = 640; const h = 120; const m = 24;
  const xs = puntos.map((p) => Date.parse(p.consultadoEn)); const ys = puntos.map((p) => p.perfil.seguidores);
  const x0 = Math.min(...xs); const x1 = Math.max(...xs) || x0 + 1; const y0 = Math.min(...ys); const y1 = Math.max(...ys);
  const px = (x) => m + ((x - x0) / Math.max(1, x1 - x0)) * (w - 2 * m);
  const py = (y) => h - m - ((y - y0) / Math.max(1, y1 - y0)) * (h - 2 * m);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "Seguidores por fecha de consulta");
  const linea = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  linea.setAttribute("points", puntos.map((p, i) => `${px(xs[i])},${py(ys[i])}`).join(" "));
  linea.setAttribute("fill", "none"); linea.setAttribute("stroke", "currentColor"); linea.setAttribute("stroke-width", "2");
  svg.append(linea);
  for (const [i, p] of puntos.entries()) {
    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
    t.setAttribute("x", px(xs[i])); t.setAttribute("y", py(ys[i]) - 6); t.setAttribute("font-size", "11"); t.setAttribute("text-anchor", "middle");
    t.textContent = String(p.perfil.seguidores);
    svg.append(t);
  }
  return svg;
}
async function pintarMetricas({ frescos = false } = {}) {
  const cfg = configDeCuenta(estado.cuenta);
  $("metricas-titulo").textContent = `Métricas · ${cfg.nombre}`;
  const nota = $("metricas-nota");
  nota.hidden = false; nota.textContent = "Cargando…";
  let datos;
  try { datos = await estado.almacen.leerMetricas(estado.cuenta, { frescos }); }
  catch (err) { nota.textContent = `No se pudieron leer las métricas: ${err.message}`; return; }
  const archivos = Object.values(datos.archivos || {}).filter(Boolean);
  const series = seriesDeCuenta(archivos.filter((a) => a.consultas || a.porDia));
  const publicaciones = rendimientoDePublicaciones(archivos.filter((a) => a.publicaciones));
  const cruda = estado.cuentasInfo?.cuentas?.find((c) => c.id === estado.cuenta)?.config;
  const recogida = cruda?.metricas?.recoger === true ? "encendida" : "apagada";
  // El permiso se infiere de las respuestas de la API (Instagram Login no permite consultar los permisos de un token).
  const permiso = series.permiso === "basico+insights" ? "básico + estadísticas (inferido: la API respondió a las consultas de estadísticas)" : (series.permiso === "basico" ? "básico (inferido: la API rechazó las estadísticas por falta de permiso)" : "sin comprobar");
  const partes = [`Última consulta: ${fechaConsulta(series.ultimaConsulta)}`, `Permiso: ${permiso}`, `Recogida diaria: ${recogida} (metricas.recoger, independiente de la generación y la publicación)`];
  const estadoCorrida = datos.estado;
  // Período medido: consultas del perfil (instantáneas) y días con métricas por período. Sin datos no se afirma nada.
  const dia = (iso) => String(iso || "").slice(0, 10);
  if (series.instantaneas.length) {
    const primera = series.instantaneas[0].consultadoEn; const ultima = series.instantaneas[series.instantaneas.length - 1].consultadoEn;
    const dias = series.porDia.length ? `; métricas por día del ${series.porDia[0].dia} al ${series.porDia[series.porDia.length - 1].dia}` : "; sin métricas por día todavía";
    partes.push(`Período medido: consultas del ${dia(primera)} al ${dia(ultima)} (${series.instantaneas.length})${dias}`);
  }
  // Cobertura: la lista que devuelve la API puede ser menor que lo que declara el perfil; no es el historial completo.
  const cob = estadoCorrida?.cobertura;
  if (cob) {
    const declara = typeof cob.declaradas === "number" ? `; el perfil declara ${cob.declaradas}${cob.declaradas > cob.listadas ? " y la API no expone el resto" : ""}` : "";
    partes.push(`Cobertura de publicaciones: ${cob.consultadas} consultadas de ${cob.listadas} que devuelve la API (${cob.enVentana} en la ventana)${declara}${cob.listadoCompleto === false ? "; listado incompleto: continúa en la próxima corrida" : ""}`);
  }
  if (estadoCorrida && estadoCorrida.completo === false) partes.push(`Última corrida incompleta: ${textoMotivo(estadoCorrida.motivoIncompleto)}${estadoCorrida.pendientes?.length ? `; publicaciones pendientes: ${estadoCorrida.pendientes.length}` : ""}`);
  partes.push("Instagram puede tardar hasta 48 h en consolidar los datos de un día; las métricas por día se vuelven a consultar durante tres días.");
  $("metricas-estado").textContent = partes.join(" · ");
  const hayDatos = series.instantaneas.length || series.porDia.length || publicaciones.length;
  if (!hayDatos) { nota.textContent = `Aún no hay ninguna recogida para ${cfg.nombre}. Enciende "Recoger métricas a diario" en la ficha de la cuenta o lanza el workflow Métricas de Instagram para esta cuenta.`; }
  else nota.hidden = true;
  $("metricas-evolucion").querySelector("tbody").replaceChildren(...series.instantaneas.map((i) => el("tr", {}, [
    celda(fechaConsulta(i.consultadoEn)),
    celdaMetrica(i.perfil?.seguidores ?? null, "conjunto-vacio"), celdaMetrica(i.perfil?.seguidos ?? null, "conjunto-vacio"), celdaMetrica(i.perfil?.publicaciones ?? null, "conjunto-vacio"),
    celda(i.permiso === "basico+insights" ? "básico + estadísticas" : "básico"),
  ])));
  $("metricas-grafico").replaceChildren(graficoSeguidores(series.instantaneas));
  $("metricas-por-dia").querySelector("tbody").replaceChildren(...series.porDia.map((d) => el("tr", {}, [
    celda(d.dia),
    ...CLAVES_POR_DIA.map((k) => celdaMetrica(d.valores?.[k] ?? null, d.faltantes?.[k] || (k in (d.valores || {}) ? "conjunto-vacio" : "no-solicitado"))),
    celda(fechaConsulta(d.consultadoEn)),
  ])));
  $("metricas-publicaciones").querySelector("tbody").replaceChildren(...publicaciones.map((p) => el("tr", {}, [
    celda(p.fecha ? fechaCortaUtc(p.fecha) : "—"),
    el("td", {}, [el("a", { href: urlSegura(p.permalink), target: "_blank", rel: "noopener", text: p.titulo || p.id })]),
    celda(p.origen === "sistema" ? `sistema · ${p.categoria || "—"} · ${p.franja || "—"}` : "instagram"),
    celda(p.tipo || "—"),
    ...CLAVES_PUBLICACION.map((k) => celdaMetrica(p.acumulados[k]?.valor ?? null, p.acumulados[k]?.motivo || "no-solicitado", p.variacion[k] || null)),
    celda(fechaConsulta(p.ultimaConsulta)),
  ])));
}

// --- Carga ------------------------------------------------------------------
async function cargar() {
  try {
    estado.items = await estado.almacen.listar();
    estado.items.sort((a, b) => b.post.creado.localeCompare(a.post.creado));
    const info = await estado.almacen.tokenInfo(estado.cuenta);
    mostrarToken(info);
    pintar();
    if (estado.vista === "maestro") pintarMaestro();
  } catch (err) {
    $("lista").replaceChildren(el("p", { class: "vacio", text: `No se pudieron cargar los posts: ${err.message}` }));
  }
}

// Lista de cuentas en vivo (config global + config de cada cuenta + estado de conexión). Sustituye a la copia
// estática de panel/config.json, que queda como reserva si la lectura falla.
function cuentaParaPanel(c) {
  const cfg = c.config || {};
  return {
    id: c.id, nombre: cfg.nombre || c.id, idioma: cfg.idioma || IDIOMA_POR_DEFECTO,
    zonaHoraria: cfg.zonaHoraria || estado.cuentasInfo?.global?.zonaHoraria || configPanel.zonaHoraria,
    marca: { ...(cfg.marca || {}), colores: { ...COLORES_POR_DEFECTO, ...(cfg.marca?.colores || {}) } },
    franjas: cfg.franjas || FRANJAS_POR_DEFECTO,
    automatico: { generar: true, publicar: true, ...(cfg.automatico || {}) },
    conexiones: cfg.conexiones || {},
    instagram: cfg.instagram || {}, // solo origen y nombres de secretos (nunca valores): las redes nuevas exigen modo Environment
    archivada: cfg.archivada === true,
  };
}
// Estado de conexión de una red nueva de una cuenta, tal como lo dejó Probar destino (null si no hay lectura en vivo).
const conexionRedDe = (id, red) => estado.cuentasInfo?.cuentas?.find((c) => c.id === id)?.conexiones?.[red]?.conexion || null;
// Redes de una pieza que hoy pueden salir: interruptor encendido, sin pausa general (para mostrar "en espera").
function redesEnEsperaDe(cfgCuenta) {
  const encendidos = destinosEncendidos(cfgCuenta);
  return (red) => (pausaGeneral(cfgCuenta) ? "pausa general" : (encendidos.includes(red) ? null : "conexión apagada"));
}
async function cargarCuentas({ frescos = false } = {}) {
  try {
    const info = await estado.almacen.listarCuentas({ frescos });
    estado.cuentasInfo = info;
    const validas = info.cuentas.filter((c) => c.config);
    if (validas.length) {
      configPanel.cuentas = validas.map(cuentaParaPanel);
      configPanel.cuentaPrincipal = info.global.cuentas[0];
      configPanel.zonaHoraria = info.global.zonaHoraria || configPanel.zonaHoraria;
    }
  } catch (err) {
    estado.cuentasInfo = { global: { cuentas: configPanel.cuentas.map((c) => c.id) }, cuentas: [], error: err.message };
  }
}

function mostrarToken(info) {
  const n = $("estado-token");
  if (!info?.vence) { n.hidden = false; n.textContent = "Token IG: caducidad desconocida"; n.className = "estado-token alerta"; return; }
  const dias = Math.floor((Date.parse(info.vence) - Date.parse(claveDia(new Date(), ZONA_PANAMA))) / 86400000);
  n.hidden = false;
  n.textContent = `Token IG vence ${info.vence}`;
  n.className = "estado-token" + (dias < 7 ? " alerta" : "");
}

// --- Pintado ----------------------------------------------------------------
function pintar() {
  const selector = $("cuentas");
  if (configPanel.cuentas.length > 1) {
    selector.hidden = false;
    selector.replaceChildren(...configPanel.cuentas.map((c) => el("button", {
      type: "button", class: c.id === estado.cuenta ? "activa" : "", text: c.archivada ? `${c.nombre} (archivada)` : c.nombre, onclick: () => seleccionarCuenta(c.id),
    })));
  } else {
    selector.hidden = true;
  }
  const activa = configDeCuenta(estado.cuenta);
  const apagado = [];
  if (activa.automatico?.generar === false) apagado.push("la generación automática de borradores");
  if (activa.automatico?.publicar === false) apagado.push("la publicación automática en Instagram");
  if (activa.automatico?.pausa === true) apagado.push("toda publicación (pausa general: nada sale en ninguna red hasta reanudar)");
  const nota = $("nota-cuenta");
  if (activa.archivada) {
    nota.hidden = false;
    nota.textContent = `${activa.nombre} está archivada: sus automatizaciones están detenidas y sus posts e historial se conservan. Puedes reactivarla desde Cuentas.`;
  } else if (apagado.length) {
    nota.hidden = false;
    const cola = activa.automatico?.publicar === false ? " Los posts aprobados quedan en cola hasta activarla." : "";
    nota.textContent = `En ${activa.nombre} está desactivada ${apagado.join(" y ")}.${cola} Se activa en cuentas/${activa.id}/config.json (automatico).`;
  } else {
    nota.hidden = true;
  }
  const deCuenta = estado.items.filter((x) => cuentaDe(x.post) === estado.cuenta);
  const conteo = Object.fromEntries(PESTANAS.map(([k]) => [k, deCuenta.filter((x) => x.post.estado === k).length]));
  $("pestanas").replaceChildren(...PESTANAS
    .filter(([k]) => k !== "error" || conteo.error > 0)
    .map(([k, nombre]) => el("button", {
      type: "button", class: k === estado.pestana ? "activa" : "", text: `${nombre} (${conteo[k]})`,
      onclick: () => { estado.pestana = k; pintar(); },
    })));
  const visibles = deCuenta.filter((x) => x.post.estado === estado.pestana);
  $("lista").replaceChildren(...(visibles.length ? visibles.map(tarjeta) : [el("p", { class: "vacio", text: "Nada por aquí." })]));
}

function urlImagen(post) {
  if (!post.imagen?.url) return null;
  const base = esLocal() ? `/img/${post.id}.jpg` : urlSegura(post.imagen.url);
  return `${base}?v=${post.imagen.hash}`;
}

function tarjeta({ post, sha }) {
  const bloqueado = ["publicado", "descartado"].includes(post.estado) || soloLectura();
  const src = urlImagen(post);
  const campos = {};
  const campo = (etiqueta, nombre, tipo = "textarea") => {
    const n = el(tipo, { disabled: bloqueado ? "" : null });
    if (tipo === "select") {
      const lista = nombre === "categoria" ? CATEGORIAS : VARIANTES;
      n.replaceChildren(...lista.map((v) => el("option", { value: v, text: v })));
    }
    n.value = nombre === "hashtags" ? post.hashtags.join(" ") : post[nombre];
    campos[nombre] = n;
    return el("label", { text: etiqueta }, [n]);
  };
  const ilus = post.ilustracion || null;
  const campoEscena = el("textarea", { disabled: bloqueado ? "" : null });
  campoEscena.value = ilus ? ilus.descripcion : "";
  campos.escena = campoEscena;
  const casillaUsar = el("input", { type: "checkbox", disabled: bloqueado ? "" : null });
  casillaUsar.checked = Boolean(ilus && ilus.usar);
  campos.usar = casillaUsar;
  const contador = el("p", { class: "contador" });
  const actualizarContador = () => {
    const texto = componerCaption({ caption: campos.caption.value, medio: post.fuente.medio, hashtags: campos.hashtags.value.split(/\s+/) });
    const v = validarCaption(texto);
    const t = validarTextos({ titular: campos.titular.value, bajada: campos.bajada.value });
    contador.textContent = `Titular ${campos.titular.value.trim().length}/${LIMITES_TEXTO.titularMax} · Bajada ${campos.bajada.value.trim().length}/${LIMITES_TEXTO.bajadaMax} · Caption ${texto.length}/${LIMITES.caracteres} · ${normalizarHashtags(campos.hashtags.value.split(/\s+/)).length}/${LIMITES.hashtags} hashtags`;
    contador.className = "contador" + (v.ok && t.ok ? "" : " excede");
  };

  const cuerpo = el("div", { class: "cuerpo" }, [
    el("div", { class: "meta" }, [
      el("span", { class: "chip", text: post.categoria }),
      el("span", { class: `badge ${post.estado}`, text: post.estado }),
      el("a", { href: urlSegura(post.fuente.url), target: "_blank", rel: "noopener", text: post.fuente.medio }),
      post.programado ? el("span", { text: `Programado: ${claveDia(post.programado)} ${horaMinutoDeIso(post.programado)}` }) : "",
      imagenDesactualizada(post) && !["publicado", "descartado"].includes(post.estado) ? el("span", { class: "regenerando", text: "Regenerando imagen…" }) : "",
      generandoIlustracion(ilus) ? el("span", { class: "regenerando", text: ilus.descripcion.trim() ? "Generando ilustración…" : "Generando ilustración… (Claude redacta la escena)" }) : "",
      regenerandoIlustracion(ilus) ? el("span", { class: "regenerando", text: ilus.descripcion.trim() ? "Regenerando ilustración…" : "Regenerando ilustración… (Claude redacta la escena)" }) : "",
    ]),
    post.error ? el("p", { class: "error-texto", text: `Error (${post.error.paso}): ${post.error.mensaje}` }) : "",
    campo("Titular", "titular"),
    campo("Bajada", "bajada"),
    el("div", { class: "fila" }, [campo("Categoría", "categoria", "select"), campo("Variante", "variante", "select")]),
    campo("Caption", "caption"),
    campo("Hashtags (separados por espacio)", "hashtags", "input"),
    el("label", { text: "Escena de la ilustración (sin personas reales)" }, [campoEscena]),
    el("label", { class: "casilla" }, [casillaUsar, el("span", { text: " Usar ilustración generada con IA" })]),
    ilus && ilus.error ? el("p", { class: "error-texto", text: `La ilustración falló: ${ilus.error.mensaje}` }) : "",
    contador,
    // Multicanal: destinos de la pieza (chips, versiones aprobadas, omitir, decisión sobre inciertos), tras los campos.
    bloqueDestinos({ post, sha, bloqueado }),
  ]);
  const cambios = () => {
    const escena = campos.escena.value.trim();
    const usar = campos.usar.checked; // sin escena, REGENERAR se la pide a Claude
    const reactivada = usar && !(post.ilustracion && post.ilustracion.usar);
    return {
      titular: campos.titular.value.trim(), bajada: campos.bajada.value.trim(), caption: campos.caption.value.trim(),
      hashtags: normalizarHashtags(campos.hashtags.value.split(/\s+/)), categoria: campos.categoria.value, variante: campos.variante.value,
      ilustracion: (escena || usar || post.ilustracion)
        ? { ...(post.ilustracion || { ruta: null, hashDescripcion: null, proveedor: null, modelo: null, generada: null, error: null }), descripcion: escena, usar, ...(reactivada ? { error: null } : {}) }
        : null,
    };
  };
  const hayCambios = () => {
    const c = cambios();
    return ["titular", "bajada", "caption", "categoria", "variante"].some((k) => c[k] !== post[k]) || c.hashtags.join(" ") !== post.hashtags.join(" ")
      || (c.ilustracion?.descripcion ?? "") !== (post.ilustracion?.descripcion ?? "") || Boolean(c.ilustracion?.usar) !== Boolean(post.ilustracion?.usar);
  };
  const captionValido = () => {
    const t = validarTextos({ titular: campos.titular.value, bajada: campos.bajada.value });
    const c = validarCaption(componerCaption({ caption: campos.caption.value, medio: post.fuente.medio, hashtags: campos.hashtags.value.split(/\s+/) }));
    return { ok: t.ok && c.ok, errores: [...t.errores, ...c.errores] };
  };

  const local = estado.borradores.get(post.id);
  if (local) for (const k of Object.keys(local)) {
    if (!campos[k]) continue;
    if (k === "usar") campos[k].checked = local[k];
    else campos[k].value = local[k];
  }
  const recordarBorrador = () => {
    if (hayCambios()) estado.borradores.set(post.id, {
      titular: campos.titular.value, bajada: campos.bajada.value, caption: campos.caption.value,
      hashtags: campos.hashtags.value, categoria: campos.categoria.value, variante: campos.variante.value,
      escena: campos.escena.value, usar: campos.usar.checked,
    });
    else estado.borradores.delete(post.id);
  };
  for (const n of Object.values(campos)) n.addEventListener("input", recordarBorrador);
  campos.categoria.addEventListener("change", recordarBorrador);
  campos.variante.addEventListener("change", recordarBorrador);
  campos.usar.addEventListener("change", recordarBorrador);

  campos.titular.addEventListener("input", actualizarContador);
  campos.bajada.addEventListener("input", actualizarContador);
  campos.caption.addEventListener("input", actualizarContador);
  campos.hashtags.addEventListener("input", actualizarContador);
  actualizarContador();

  const acciones = el("div", { class: "acciones" });
  // Aviso dentro de la tarjeta (el de arriba queda fuera de la vista en el celular).
  const avisoTarjeta = el("p", { class: "aviso aviso-tarjeta", hidden: "" });
  const avisarAqui = (mensaje) => { avisoTarjeta.textContent = mensaje; avisoTarjeta.hidden = false; avisar(mensaje); };
  for (const n of Object.values(campos)) n.addEventListener("input", () => { avisoTarjeta.hidden = true; });
  const conCambios = (p) => (hayCambios() ? editarTexto(p, cambios(), ahoraIso()) : p);
  const guardarSiCambio = (p) => {
    const v = captionValido(); if (!v.ok) { avisarAqui(v.errores.join(" ")); return null; }
    if (!hayCambios()) { avisarAqui("No hay cambios que guardar."); return null; }
    return conCambios(p);
  };
  const boton = (texto, clase, fn) => el("button", { type: "button", class: `boton ${clase}`, text: texto, onclick: () => ejecutar(post.id, sha, fn) });

  if (!bloqueado) {
    // Aprobar = elegir hora, destinos y revisar la versión de cada red (multicanal): lo aprobado no cambia solo después.
    const aprobarConHora = async (p) => {
      const v = captionValido(); if (!v.ok) { avisarAqui(v.errores.join(" ")); return null; }
      const pieza = conCambios(p);
      const r = await pedirHora(pieza);
      if (!r) return null;
      // La imagen aprobada se vincula a la huella del archivo renderizado (null si aún no existe: se aprobará después).
      const imagenSha = pieza.imagen ? await huellaSegura(pieza.id) : null;
      if (pieza.imagen && !imagenSha) avisar("No se pudo leer la huella de la imagen: el destino esperará hasta que pulses «Aprobar imagen actual».", 10000);
      try { return aprobarDestinos(pieza, r.iso, { versiones: r.versiones, imagenSha }, ahoraIso()); }
      catch (err) { avisarAqui(err.message); return null; }
    };
    const regenerarIlustracion = (p) => {
      const descripcion = campos.escena.value.trim();
      const v = captionValido(); if (!v.ok) { avisarAqui(v.errores.join(" ")); return null; }
      // Sin escena: se guarda usar=true con la escena vacía y REGENERAR se la pide a Claude.
      const base = p.ilustracion || { ruta: null, proveedor: null, modelo: null, generada: null };
      return editarTexto(conCambios(p), { ilustracion: { ...base, descripcion, usar: true, hashDescripcion: null, error: null } }, ahoraIso());
    };
    if (post.estado === "borrador") {
      acciones.append(boton("Aprobar", "primario", aprobarConHora));
      acciones.append(boton("Guardar cambios", "", guardarSiCambio));
      acciones.append(boton("Regenerar ilustración", "", regenerarIlustracion));
      acciones.append(boton("Descartar", "peligro", (p) => descartar(p, ahoraIso())));
    } else if (post.estado === "programado") {
      acciones.append(boton("Cambiar hora", "primario", aprobarConHora));
      acciones.append(boton("Guardar cambios", "", guardarSiCambio));
      acciones.append(boton("Regenerar ilustración", "", regenerarIlustracion));
      acciones.append(boton("Quitar de la cola", "peligro", (p) => quitarDeCola(p, ahoraIso())));
    } else if (post.estado === "error") {
      // Reintentar solo vuelve a poner en cola los destinos fallidos; los publicados no se repiten.
      if (post.error?.paso === "instagram" || post.error?.paso === "destino") acciones.append(boton("Reintentar", "primario", (p) => (p.destinos ? reintentarDestinos(conCambios(p), ahoraIso()) : reintentar(conCambios(p), ahoraIso()))));
      acciones.append(boton("Guardar cambios", "", guardarSiCambio));
      acciones.append(boton("Regenerar ilustración", "", regenerarIlustracion));
      acciones.append(boton("Descartar", "peligro", (p) => descartar(p, ahoraIso())));
    }
  }
  if (post.publicacion?.permalink) acciones.append(el("a", { class: "boton", href: urlSegura(post.publicacion.permalink), target: "_blank", rel: "noopener", text: "Ver en Instagram" }));
  cuerpo.append(acciones, avisoTarjeta);

  return el("article", { class: "tarjeta", "data-id": post.id }, [
    src ? el("img", { src, alt: "", loading: "lazy" }) : el("div", { class: "sin-imagen", text: post.error?.paso === "render" ? "La imagen falló; se reintenta sola" : "Imagen en proceso…" }),
    cuerpo,
  ]);
}

// --- Acciones ---------------------------------------------------------------
async function ejecutar(id, sha, fn) {
  const item = estado.items.find((x) => x.post.id === id);
  if (!item) return;
  const botones = document.querySelectorAll(`[data-id="${id}"] button`);
  botones.forEach((b) => { b.disabled = true; });
  try {
    let nuevo = await fn(item.post);
    if (nuevo === null) { botones.forEach((b) => { b.disabled = false; }); return; }
    try {
      item.sha = await estado.almacen.guardar(nuevo, item.sha);
    } catch (err) {
      if (!(err instanceof ErrorConflicto) || !err.actual) throw err;
      nuevo = await fn(err.actual.post);
      if (nuevo === null) { botones.forEach((b) => { b.disabled = false; }); return; }
      item.sha = await estado.almacen.guardar(nuevo, err.actual.sha);
      avisar("El post había cambiado; se aplicó tu acción sobre la versión nueva.");
    }
    item.post = nuevo;
    estado.borradores.delete(id);
    pintar();
  } catch (err) {
    avisar(`No se pudo guardar: ${err.message}`, 8000);
    botones.forEach((b) => { b.disabled = false; });
  }
}

// Diálogo de aprobación: hora, destinos y versión por red. Devuelve { iso, versiones } o null.
// Las versiones se muestran para revisarlas: nunca se recortan; si una excede el límite, ese destino no se puede aprobar.
function pedirHora(post) {
  // Franjas y horas ocupadas de la cuenta del post: dos cuentas pueden publicar a la misma hora.
  const cuenta = cuentaDe(post);
  const cfgCuenta = configDeCuenta(cuenta);
  const ocupadas = franjasOcupadas(estado.items.map((x) => x.post).filter((p) => p.id !== post.id && cuentaDe(p) === cuenta));
  let propuesta;
  try { propuesta = siguienteFranjaLibre({ franjas: cfgCuenta.franjas, ocupadas, ahora: new Date(), zonaHoraria: cfgCuenta.zonaHoraria || configPanel.zonaHoraria }); }
  catch { propuesta = isoDesdeClave(claveDia(new Date()), cfgCuenta.franjas[cfgCuenta.franjas.length - 1]); }
  const dialogo = $("dialogo-hora");
  $("hora-fecha").value = claveDia(propuesta); $("hora-hora").value = horaMinutoDeIso(propuesta); $("hora-nota").textContent = "";
  // La hora se interpreta en la zona de la cuenta (hoy, Panamá, UTC−5, sin cambio de horario), no en la del navegador.
  const zona = cfgCuenta.zonaHoraria || configPanel.zonaHoraria || ZONA_PANAMA;
  $("hora-zona").textContent = zona === "America/Panama" ? "Hora de Panamá (UTC−5), sea cual sea el país desde el que abras el panel." : `Zona horaria de la cuenta: ${zona}.`;

  // Destinos: Instagram siempre; las redes nuevas solo si su conexión está verificada y encendida (si no, se explica).
  const existentes = destinosDe(post);
  const contenedor = $("hora-destinos");
  const casillas = {}; const areas = {}; const contadores = {};
  const disponibilidad = (red) => {
    if (red === "instagram") return null;
    const cx = conexionRedDe(cuenta, red);
    const e = estadoConexionRed({ conexion: cx, config: cfgCuenta, id: cuenta, red, ahora: new Date() });
    if (e.clave !== "verificada") return `identidad no verificada (${e.texto})`;
    if (!destinosEncendidos(cfgCuenta).includes(red)) return "conexión apagada en la cuenta";
    return null;
  };
  const filas = [];
  for (const red of REDES) {
    const d = existentes[red];
    const nombre = NOMBRES_RED[red];
    if (d && ["publicado", "omitido"].includes(d.estado)) { filas.push(el("p", { class: "nota-destino", text: `${nombre}: ${d.estado} (no cambia).` })); continue; }
    const motivo = disponibilidad(red);
    const casilla = el("input", { type: "checkbox", id: `destino-${red}` });
    // Instagram va marcado por defecto (con su interruptor apagado la entrega queda en espera, no se omite); las redes
    // nuevas solo si están disponibles.
    casilla.checked = d ? true : (red === "instagram" ? true : !motivo);
    if (motivo) { casilla.checked = false; casilla.disabled = true; }
    casillas[red] = casilla;
    const area = el("textarea", { id: `version-${red}`, rows: "4" });
    area.value = d?.texto ?? proponerVersion(post, red).texto;
    areas[red] = area;
    const contador = el("p", { class: "contador" });
    contadores[red] = contador;
    const medir = () => {
      const m = medirVersion(area.value, red);
      contador.textContent = `${m.longitud}/${m.limite}${m.excede ? ` · ${m.errores.join(" ")}` : ""}`;
      contador.className = "contador" + (m.excede ? " excede" : "");
    };
    area.addEventListener("input", medir); medir();
    const proponer = el("button", { type: "button", class: "boton pequeno", text: "Proponer de nuevo", onclick: () => { area.value = proponerVersion(post, red).texto; medir(); } });
    const bloque = el("div", { class: `destino-fila${motivo ? " no-disponible" : ""}` }, [
      el("label", { class: "casilla" }, [casilla, el("span", { text: `${nombre}${motivo ? ` · no disponible: ${motivo}` : ""}` })]),
      el("label", { text: `Versión para ${nombre}` }, [area]),
      el("div", { class: "fila-compacta" }, [contador, proponer]),
    ]);
    const ajustar = () => { area.parentElement.hidden = !casilla.checked; contador.hidden = !casilla.checked; proponer.hidden = !casilla.checked; };
    casilla.addEventListener("change", ajustar); ajustar();
    filas.push(bloque);
  }
  contenedor.replaceChildren(el("p", { class: "nota-destinos", text: "Destinos de esta pieza. La versión de cada red se publica tal cual la apruebes aquí; si luego editas el caption, no cambiará sola." }), ...filas);

  const revisar = () => {
    const iso = isoDesdeClave($("hora-fecha").value, $("hora-hora").value);
    if (Date.parse(iso) < Date.now()) $("hora-nota").textContent = "Esa hora ya pasó; se publicará en la próxima corrida.";
    else if (choca(iso, ocupadas)) $("hora-nota").textContent = "Ya hay otro post a esa hora.";
    else $("hora-nota").textContent = "";
  };
  $("hora-fecha").oninput = revisar; $("hora-hora").oninput = revisar;
  const confirmar = $("hora-confirmar");
  confirmar.onclick = (ev) => {
    const marcados = Object.entries(casillas).filter(([, c]) => c.checked).map(([red]) => red);
    const conservados = Object.entries(existentes).filter(([, d]) => ["publicado", "omitido"].includes(d.estado)).length;
    if (!marcados.length && !conservados) { ev.preventDefault(); $("hora-nota").textContent = "Elige al menos un destino."; return; }
    const excedidos = marcados.filter((red) => medirVersion(areas[red].value, red).excede);
    if (excedidos.length) { ev.preventDefault(); $("hora-nota").textContent = `Revisa la versión de ${excedidos.map((r) => NOMBRES_RED[r]).join(" y ")}: excede el límite o está vacía (no se recorta sola).`; }
  };
  return new Promise((resolve) => {
    dialogo.onclose = () => {
      if (dialogo.returnValue !== "ok" || !$("hora-fecha").value || !$("hora-hora").value) return resolve(null);
      const versiones = {};
      for (const [red, c] of Object.entries(casillas)) if (c.checked) versiones[red] = areas[red].value;
      resolve({ iso: isoDesdeClave($("hora-fecha").value, $("hora-hora").value), versiones });
    };
    dialogo.showModal();
  });
}

// Huella del archivo de imagen del post (null si no existe o no se pudo leer): vincula lo aprobado a un archivo estable.
async function huellaSegura(id) {
  try { return await estado.almacen.huellaImagen(id); } catch { return null; }
}
const textoEspera = (motivo) => ({ "imagen-cambiada": "la imagen cambió tras aprobar", "imagen-sin-aprobar": "imagen sin aprobar" })[motivo] || motivo;

// Bloque de destinos de una pieza: chips con estado y enlace, versiones por red, omitir y decisión sobre inciertos.
function bloqueDestinos({ post, sha, bloqueado }) {
  const destinos = destinosDe(post);
  const redes = Object.keys(destinos);
  if (!redes.length) return "";
  const cuenta = cuentaDe(post);
  const cfgCuenta = configDeCuenta(cuenta);
  const espera = redesEnEsperaDe(cfgCuenta);
  const activos = redes.filter((r) => destinos[r].estado !== "omitido");
  const accion = (texto, clase, fn) => el("button", { type: "button", class: `boton pequeno ${clase}`, text: texto, onclick: () => ejecutar(post.id, sha, fn) });
  const chips = el("div", { class: "destinos" });
  const acciones = el("div", { class: "acciones acciones-destinos" });
  for (const red of redes) {
    const d = destinos[red];
    const nombre = NOMBRES_RED[red];
    let etiqueta = d.estado; let clase = d.estado;
    if (d.estado === "pendiente" && espera(red)) { etiqueta = `en espera (${espera(red)})`; clase = "espera"; }
    else if (d.estado === "pendiente" && (d.espera || imagenCambiada(post, red))) { etiqueta = `en espera (${textoEspera(d.espera?.motivo || "imagen-cambiada")})`; clase = "espera"; }
    else if (d.estado === "error") etiqueta = `error: ${d.error?.mensaje || "sin detalle"}`;
    else if (d.estado === "incierto") etiqueta = `incierto: ${d.intento?.incierto?.motivo || "sin detalle"}`;
    const chip = el("span", { class: `destino ${clase}`, text: `${nombre}: ${etiqueta}` });
    if (d.estado === "publicado" && d.publicacion?.permalink) chip.append(" ", el("a", { href: urlSegura(d.publicacion.permalink), target: "_blank", rel: "noopener", text: `Ver en ${nombre}` }));
    chips.append(chip);
    if (bloqueado) continue;
    if (d.estado === "incierto") acciones.append(accion(`Decidir ${nombre}`, "primario", (p) => decidirDestino(p, red)));
    if (["pendiente", "error", "incierto"].includes(d.estado) && activos.length > 1) acciones.append(accion(`Omitir en ${nombre}`, "peligro", (p) => omitirDestino(p, red, ahoraIso(), { por: "operador" })));
  }
  const bloque = el("div", { class: "bloque-destinos" }, [chips]);
  // Versiones aprobadas por red (solo piezas aprobadas con destinos y destinos que aún no salieron): editable, con aviso
  // si la pieza o la imagen cambiaron. Un programado anterior al multicanal no tiene versiones: se compone al publicar.
  const editables = post.destinos ? redes.filter((r) => !["publicado", "omitido"].includes(destinos[r].estado)) : [];
  if (editables.length && !bloqueado) {
    const detalles = el("details", { class: "versiones" }, [el("summary", { text: "Versiones por red (texto aprobado)" })]);
    let imagenAvisada = false;
    for (const red of editables) {
      const d = destinos[red];
      const nombre = NOMBRES_RED[red];
      const area = el("textarea", { rows: "4" });
      area.value = d.texto ?? proponerVersion(post, red).texto;
      const contador = el("p", { class: "contador" });
      const medir = () => { const m = medirVersion(area.value, red); contador.textContent = `${m.longitud}/${m.limite}${m.excede ? ` · ${m.errores.join(" ")}` : ""}`; contador.className = "contador" + (m.excede ? " excede" : ""); };
      area.addEventListener("input", medir); medir();
      const avisos = [];
      if (piezaCambiada(post, red)) avisos.push(el("p", { class: "aviso aviso-tarjeta", text: `La pieza cambió después de aprobar la versión de ${nombre}: revísala y pulsa "Guardar versión" si quieres actualizarla. Mientras tanto se publicará el texto aprobado.` }));
      detalles.append(el("div", { class: "version-red" }, [
        el("label", { text: `${nombre}${d.texto === null ? " (sin versión aprobada: se propone la de siempre)" : ""}` }, [area]),
        contador, ...avisos,
        el("div", { class: "acciones" }, [
          el("button", { type: "button", class: "boton pequeno", text: "Guardar versión", onclick: () => { const m = medirVersion(area.value, red); if (m.excede) { avisar(m.errores.join(" "), 8000); return; } ejecutar(post.id, sha, (p) => actualizarVersion(p, red, area.value, ahoraIso())); } }),
          el("button", { type: "button", class: "boton pequeno", text: "Proponer de nuevo", onclick: () => { area.value = proponerVersion(post, red).texto; medir(); } }),
        ]),
      ]));
      if (!imagenAvisada && (imagenCambiada(post, red) || /^imagen-/.test(d.espera?.motivo || ""))) {
        imagenAvisada = true;
        detalles.append(
          el("p", { class: "aviso aviso-tarjeta", text: d.espera?.motivo === "imagen-sin-aprobar" || !d.aprobado?.imagenSha ? "La imagen se renderizó después de aprobar: no se publicará hasta que apruebes la imagen actual." : "La imagen cambió después de aprobar: no se publicará hasta que apruebes la imagen actual." }),
          el("div", { class: "acciones" }, [accion("Aprobar imagen actual", "primario", async (p) => {
            const imagenSha = p.imagen ? await huellaSegura(p.id) : null;
            if (p.imagen && !imagenSha) { avisar("No se pudo leer la huella de la imagen; inténtalo de nuevo.", 8000); return null; }
            return aprobarImagenActual(p, ahoraIso(), { imagenSha });
          })]),
        );
      }
    }
    bloque.append(detalles);
  }
  if (acciones.childElementCount) bloque.append(acciones);
  return bloque;
}

// Decisión manual sobre un destino incierto: publicado (con el enlace que ves en la red), pendiente u omitido.
function decidirDestino(post, red) {
  const d = destinosDe(post)[red];
  const dialogo = $("dialogo-incierto");
  $("di-texto").textContent = `${NOMBRES_RED[red]}: ${d?.intento?.incierto?.motivo || "resultado incierto"}. Comprueba en ${NOMBRES_RED[red]} si la publicación existe y decide. No se volverá a publicar sin tu decisión.`;
  $("di-enlace").value = "";
  dialogo.returnValue = "cancelar";
  return new Promise((resolve) => {
    dialogo.onclose = () => {
      const r = dialogo.returnValue;
      if (r === "publicado") { const enlace = $("di-enlace").value.trim(); if (!/^https?:\/\//.test(enlace)) { avisar("Pega el enlace de la publicación para marcarla como publicada.", 8000); return resolve(null); } return resolve(decidirIncierto(post, red, "publicado", { permalink: enlace }, ahoraIso())); }
      if (r === "pendiente") return resolve(decidirIncierto(post, red, "pendiente", {}, ahoraIso()));
      if (r === "omitido") return resolve(decidirIncierto(post, red, "omitido", { por: "operador" }, ahoraIso()));
      resolve(null);
    };
    dialogo.showModal();
  });
}

// --- Panel maestro: todas las cuentas -----------------------------------------
const iniciales = (nombre) => String(nombre || "").trim().split(/\s+/).filter(Boolean).slice(0, 3).map((w) => w[0].toUpperCase()).join("") || "?";
const urlLogo = (id) => (esLocal() ? `/cuentas/${id}/logo.png` : `../cuentas/${id}/logo.png`); // en Pages el logo no se publica: se usan las iniciales

function logoMini(c) {
  const cfg = c.config || {};
  const forma = cfg.marca?.logoForma === "cuadrado" ? "cuadrado" : "circulo";
  if (c.logo && esLocal()) return el("img", { class: `logo-mini ${forma}`, src: `${urlLogo(c.id)}?v=${c.sha || ""}`, alt: "" });
  const colores = { ...COLORES_POR_DEFECTO, ...(cfg.marca?.colores || {}) };
  const n = el("div", { class: `logo-mini ${forma}`, text: iniciales(cfg.marca?.nombre || cfg.nombre || c.id) });
  n.style.background = colores.oscuro; n.style.color = colores.principal;
  return n;
}

function tarjetaCuenta(c) {
  const cfg = c.config || {};
  const auto = { generar: true, publicar: true, pausa: false, ...(cfg.automatico || {}) };
  const repo = repoActual();
  const enlace = (href, texto) => (href ? el("a", { href, target: "_blank", rel: "noopener", text: texto }) : el("span", { text: `${texto} (repositorio no configurado)` }));
  const archivada = cfg.archivada === true;
  const conexion = estadoConexion({ conexion: c.conexion, tokenInfo: c.tokenInfo, config: cfg, id: c.id, expuestos: secretosExpuestosActuales(), secretosActualizados: c.secretosActualizados ?? null, ahora: new Date() });
  const posts = estado.items.map((x) => x.post).filter((p) => cuentaDe(p) === c.id);
  const cuenta = (e) => posts.filter((p) => p.estado === e).length;
  const bloqueado = soloLectura();
  const acciones = el("div", { class: "acciones" }, [
    el("button", { type: "button", class: "boton primario", text: "Abrir panel", onclick: () => { seleccionarCuenta(c.id); mostrarVista("posts"); } }),
  ]);
  if (!bloqueado) {
    if (!archivada) {
      acciones.append(el("button", { type: "button", class: "boton", text: "Editar", onclick: () => abrirFormulario("editar", c.id) }));
      acciones.append(el("button", {
        type: "button", class: "boton", text: "Verificar identidad", onclick: () => verificarIdentidad(c.id),
        disabled: conexion.clave === "pendiente-configuracion" ? "" : null,
        title: conexion.clave === "pendiente-configuracion" ? "Sus secretos todavía no llegan a los workflows: la verificación no puede pasar" : "Marca la cuenta como pendiente y lanza el workflow Probar Instagram",
      }));
      acciones.append(el("button", { type: "button", class: "boton", "data-accion": "generar", text: auto.generar ? "Pausar generación" : "Encender generación", title: auto.generar ? "Claude deja de redactar borradores para esta cuenta; los existentes se conservan" : "Cada 3 horas Claude redacta borradores; exige editorial.md y fuentes", onclick: () => cambiarAutomatico(c.id, "generar", !auto.generar) }));
      acciones.append(el("button", { type: "button", class: "boton", "data-accion": "publicar", text: auto.publicar ? "Pausar publicación" : "Encender publicación", title: auto.publicar ? "Los programados quedan en cola sin publicarse" : "Publica los programados cuya hora llegó; exige identidad verificada y decidir sobre los vencidos", onclick: () => cambiarAutomatico(c.id, "publicar", !auto.publicar) }));
      // Multicanal (F1): una conexión por red con su propio interruptor (nace apagado) y su verificación.
      for (const cx of conexionesDeCuenta(cfg)) {
        const estadoRed = estadoConexionRed({ conexion: c.conexiones?.[cx.red]?.conexion || null, config: cfg, id: c.id, red: cx.red, ahora: new Date() });
        acciones.append(el("button", { type: "button", class: "boton", "data-accion": `verificar-${cx.red}`, text: `Verificar ${cx.nombre}`, disabled: estadoRed.clave === "pendiente-configuracion" ? "" : null, title: `Lanza el workflow Probar destino para ${cx.nombre}`, onclick: () => verificarIdentidad(c.id, cx.red) }));
        acciones.append(el("button", { type: "button", class: "boton", "data-accion": `conexion-${cx.red}`, text: cx.publicar ? `Pausar ${cx.nombre}` : `Encender ${cx.nombre}`, title: cx.publicar ? `Las entregas para ${cx.nombre} quedan en espera; no se omiten` : `Exige identidad verificada ${cx.red === "threads" ? "del perfil" : "de la página"}; los demás interruptores no cambian`, onclick: () => cambiarConexionRed(c.id, cx.red, !cx.publicar) }));
      }
      acciones.append(el("button", { type: "button", class: "boton", "data-accion": "pausa", text: auto.pausa ? "Reanudar todo" : "Pausar todo", title: auto.pausa ? "Las entregas en espera salen en la próxima corrida" : "Pausa general: nada sale en ninguna red; los interruptores conservan su valor", onclick: () => cambiarPausa(c.id, !auto.pausa) }));
      acciones.append(el("button", { type: "button", class: "boton", text: "Métricas", onclick: () => { seleccionarCuenta(c.id); mostrarVista("metricas"); } }));
      acciones.append(el("button", { type: "button", class: "boton peligro", text: "Archivar", onclick: () => archivar(c.id) }));
    } else {
      acciones.append(el("button", { type: "button", class: "boton", text: "Reactivar", onclick: () => reactivar(c.id) }));
    }
  }
  // Actividad (de lo ya guardado: posts, conexión, estado de métricas) y guía de conexión (solo nombres y enlaces).
  const actividad = resumenActividad({ posts, cuenta: c.id, conexion: c.conexion, conexiones: c.conexiones || null, metricasEstado: c.metricasEstado || null });
  // Multicanal (F1): estado y guía de cada red nueva.
  const filasRedes = []; const guiasRedes = [];
  for (const cx of conexionesDeCuenta(cfg)) {
    const estadoRed = estadoConexionRed({ conexion: c.conexiones?.[cx.red]?.conexion || null, config: cfg, id: c.id, red: cx.red, ahora: new Date() });
    filasRedes.push(el("span", { class: `estado ${cx.publicar ? "encendido" : "apagado"}`, text: `${cx.nombre}: ${cx.publicar ? "activa" : "apagada"}` }));
    filasRedes.push(el("span", { class: `estado conexion-${estadoRed.clave}`, text: estadoRed.texto }));
    if (estadoRed.clave !== "verificada" && !archivada) {
      const g = guiaConexionRed({ config: cfg, id: c.id, red: cx.red, owner: repo?.owner || null, repo: repo?.repo || null });
      const notaRed = cx.red === "threads"
        ? "El token se genera en el User Token Generator de la app de Meta (perfil invitado como Threads Tester) y se pega en GitHub. Aquí solo van nombres y enlaces; ningún valor pasa por el panel ni por inputs de workflows. La publicación en Threads está validada con la API real (10 de septiembre de 2026); la recuperación de contenedores y los resultados inciertos siguen probados solo con simulaciones."
        : "El token de página se obtiene en las herramientas de Meta y se pega en GitHub. Aquí solo van nombres y enlaces; ningún valor pasa por el panel ni por inputs de workflows. La publicación en Facebook está validada con la API real (10 de septiembre de 2026); la reconciliación de resultados inciertos sigue probada solo con simulaciones.";
      const enlacesRed = cx.red === "threads"
        ? [enlace(g.enlaces.meta, "Apps de Meta for Developers"), enlace(g.enlaces.threads, "Ajustes de Threads (Website permissions)"), enlace(g.enlaces.docsThreads, "Documentación de la Threads API")]
        : [enlace(g.enlaces.explorador, "Explorador de la API Graph"), enlace(g.enlaces.depurador, "Depurador de tokens")];
      guiasRedes.push(el("details", { class: "guia-red", "data-red": cx.red }, [
        el("summary", { text: `Guía de conexión con ${cx.nombre} · Environment ${g.entorno} · ${g.secretos.join(", ")}` }),
        el("p", { class: "nota", text: notaRed }),
        estadoRed.detalle ? el("p", { class: "cuenta-detalle", text: estadoRed.detalle }) : "",
        el("ol", {}, g.pasos.map((p) => el("li", { text: p }))),
        el("p", { class: "enlaces" }, [...enlacesRed, enlace(g.enlaces.entorno, `Environments del repositorio`), enlace(g.enlaces.probar, "Workflow Probar destino")]),
      ]));
    }
  }
  const fechaO = (iso, vacio) => (iso ? `${fechaCortaUtc(iso)} UTC` : vacio);
  const guia = guiaConexion({ config: cfg, id: c.id, owner: repo?.owner || null, repo: repo?.repo || null });
  const guiaDetalles = el("details", { class: "guia-conexion" }, [
    el("summary", { text: `Guía de conexión: ${guia.origen === "entorno" ? `Environment ${guia.entorno}` : "secretos del repositorio"} · ${guia.secretos.join(" e ")}` }),
    el("p", { class: "nota", text: "Los valores de los secretos nunca pasan por el panel: se pegan en GitHub. Aquí solo van los nombres exactos y los enlaces." }),
    el("ol", {}, guia.pasos.map((p) => el("li", { text: p }))),
    el("p", { class: "enlaces" }, [
      enlace(guia.enlaces.meta, "Meta for Developers"),
      guia.origen === "entorno" ? enlace(guia.enlaces.nuevoEntorno, `Crear Environment ${guia.entorno}`) : enlace(guia.enlaces.secretosRepositorio, "Nuevo secreto del repositorio"),
      guia.origen === "entorno" ? enlace(guia.enlaces.entornos, "Environments del repositorio") : "",
      enlace(guia.enlaces.probar, "Workflow Probar Instagram"),
    ]),
  ]);
  return el("article", { class: `cuenta-tarjeta${archivada ? " archivada" : ""}`, "data-cuenta": c.id }, [
    el("div", { class: "cuenta-encabezado" }, [
      logoMini(c),
      el("div", {}, [
        el("div", { class: "cuenta-nombre", text: cfg.nombre || c.id }),
        el("div", { class: "cuenta-usuario", text: `${cfg.marca?.usuario || ""} · ${c.id}${cfg.idioma ? ` · ${cfg.idioma}` : ""}` }),
      ]),
    ]),
    c.error ? el("p", { class: "error-texto", text: c.error }) : "",
    el("div", { class: "cuenta-estados" }, [
      archivada ? el("span", { class: "estado apagado", text: `Archivada${cfg.archivadaEn ? ` desde ${String(cfg.archivadaEn).slice(0, 10)}` : ""}` }) : "",
      el("span", { class: `estado ${auto.generar ? "encendido" : "apagado"}`, text: `Generación automática: ${auto.generar ? "activa" : "apagada"}` }),
      el("span", { class: `estado ${auto.publicar ? "encendido" : "apagado"}`, text: `Publicación automática: ${auto.publicar ? "activa" : "apagada"}` }),
      el("span", { class: `estado conexion-${conexion.clave}`, text: conexion.texto }),
      ...filasRedes,
      auto.pausa ? el("span", { class: "estado conexion-error", text: "Pausa general: activa (nada sale en ninguna red)" }) : "",
    ]),
    el("p", { class: "cuenta-contadores", text: `Borradores ${cuenta("borrador")} · Programados ${cuenta("programado")}${cuenta("error") ? ` · Errores ${cuenta("error")}` : ""}` }),
    el("p", { class: "cuenta-secretos", text: `Credenciales de Instagram: ${describirOrigen(cfg, c.id)}` }),
    conexion.fecha ? el("p", { class: "cuenta-fecha", text: `Última comprobación: ${fechaCortaUtc(conexion.fecha)} UTC` }) : "",
    conexion.detalle && !archivada ? el("p", { class: `cuenta-detalle${conexion.antigua ? " antigua" : ""}`, text: conexion.detalle }) : "",
    el("p", { class: "cuenta-actividad", text: `Último borrador generado: ${fechaO(actividad.ultimoBorrador, "ninguno")} · Última publicación: ${fechaO(actividad.ultimaPublicacion, "ninguna")} · Última recogida de métricas: ${fechaO(actividad.ultimaRecogida, cfg.metricas?.recoger === true ? "pendiente" : "recogida apagada")}` }),
    actividad.errores.length ? el("p", { class: "cuenta-errores", text: `Último error: ${actividad.errores[0].texto}${actividad.errores[0].cuando ? ` (${fechaCortaUtc(actividad.errores[0].cuando)} UTC)` : ""}${actividad.errores.length > 1 ? ` · ${actividad.errores.length - 1} más` : ""}` }) : "",
    conexion.clave === "verificada" || archivada ? "" : guiaDetalles,
    ...guiasRedes,
    acciones,
  ]);
}

// Nombres de secretos que llegan a los workflows de Instagram (null si no se pudieron leer: no se afirma nada).
function secretosExpuestosActuales() {
  const w = estado.cuentasInfo?.workflows;
  if (!w) return null;
  if (w.porCuenta === true) return null; // fase 2: cada cuenta declarada tiene su job; el env no limita nada
  if (Array.isArray(w.expuestos)) return w.expuestos;
  if (Array.isArray(w.textos) && w.textos.length) return workflowsPorCuenta(w.textos) ? null : secretosExpuestosComunes(w.textos.map(secretosExpuestos));
  return null;
}

function pintarMaestro() {
  const grid = $("cuentas-grid");
  const info = estado.cuentasInfo;
  const nota = $("nota-maestro");
  if (!info) { grid.replaceChildren(el("p", { class: "vacio", text: "Cargando…" })); return; }
  if (info.error) { nota.hidden = false; nota.textContent = `No se pudo leer la configuración de las cuentas: ${info.error}`; }
  // Límite de la API de GitHub a mitad de la carga: las cuentas se muestran, pero el estado de los secretos puede no
  // estar al día y el panel no vuelve a consultar hasta la hora indicada.
  else if (info.limite) { nota.hidden = false; nota.textContent = `${info.limite.mensaje} Los estados de conexión pueden no estar al día.`; }
  else if (soloLectura()) { nota.hidden = false; nota.textContent = "Sin token: puedes ver las cuentas pero no crear, editar ni archivar. Pulsa Configurar."; }
  else if (esLocal()) { nota.hidden = false; nota.textContent = "Modo local: los cambios se escriben en la carpeta del proyecto. Verificar identidad solo marca la cuenta como pendiente; el workflow corre en GitHub."; }
  else nota.hidden = true;
  $("boton-anadir").disabled = soloLectura();
  const activas = info.cuentas.filter((c) => !(c.config?.archivada === true));
  const archivadas = info.cuentas.filter((c) => c.config?.archivada === true);
  grid.replaceChildren(...(activas.length ? activas.map(tarjetaCuenta) : [el("p", { class: "vacio", text: "No hay cuentas activas." })]));
  $("archivadas").hidden = archivadas.length === 0;
  $("archivadas-titulo").textContent = `Archivadas (${archivadas.length})`;
  $("cuentas-archivadas").replaceChildren(...archivadas.map(tarjetaCuenta));
}

async function refrescarCuentas({ frescos = false } = {}) {
  await cargarCuentas({ frescos });
  if (!configPanel.cuentas.some((c) => c.id === estado.cuenta)) elegirCuentaInicial();
  pintar();
  pintarMaestro();
}

async function verificarIdentidad(id, red = "instagram") {
  const boton = red === "instagram" ? document.querySelector(`[data-cuenta="${id}"] button:nth-of-type(3)`) : document.querySelector(`[data-cuenta="${id}"] button[data-accion="verificar-${red}"]`);
  if (boton) boton.disabled = true;
  try {
    const r = await estado.almacen.solicitarVerificacion(id, red);
    avisar(r.nota || "Verificación solicitada.", 10000);
  } catch (err) {
    avisar(`No se pudo solicitar la verificación: ${err.message}`, 15000);
  }
  await refrescarCuentas();
}

async function archivar(id) {
  const c = estado.cuentasInfo.cuentas.find((x) => x.id === id);
  if (!c || !confirm(`¿Archivar la cuenta ${c.config?.nombre || id}? Se detienen su generación y publicación automáticas; sus posts, imágenes e historial se conservan y podrás reactivarla.`)) return;
  await guardarConfigCuenta(id, (actual) => archivarCuenta(actual, ahoraIso()), `panel: archivar cuenta ${id}`);
}

async function reactivar(id) {
  const ok = await guardarConfigCuenta(id, (actual) => reactivarCuenta(actual), `panel: reactivar cuenta ${id}`);
  if (!ok) return;
  const enCola = estado.items.filter((x) => cuentaDe(x.post) === id && x.post.estado === "programado").length;
  avisar(`Cuenta reactivada. La generación y la publicación automáticas siguen apagadas hasta que las actives expresamente en cuentas/${id}/config.json (automatico)${enCola ? `; ${enCola} programado${enCola === 1 ? "" : "s"} siguen en cola sin publicarse` : ""}.`, 15000);
}

// Lee la versión actual del config de la cuenta, aplica `transformar` y guarda con su sha (un reintento si cambió entre medias).
async function guardarConfigCuenta(id, transformar, mensaje) {
  const ruta = `cuentas/${id}/config.json`;
  for (let intento = 0; intento < 2; intento++) {
    const actual = await estado.almacen.leerArchivo(ruta);
    if (!actual) { avisar(`No existe ${ruta}.`, 10000); return; }
    const nuevo = transformar(JSON.parse(actual.texto));
    try {
      await estado.almacen.escribirArchivo(ruta, JSON.stringify(nuevo, null, 2) + "\n", { sha: actual.sha, mensaje });
      await refrescarCuentas();
      return true;
    } catch (err) {
      if (err instanceof ErrorConflictoArchivo && intento === 0) continue; // alguien lo cambió: se reintenta sobre la versión nueva
      avisar(`No se pudo guardar ${ruta}: ${err.message}`, 15000);
      return false;
    }
  }
  return false;
}

// --- Cierre del panel maestro: interruptores seguros, vencidos, guía y borrador manual ------------------------------
// Repositorio de GitHub para los enlaces de la guía: el configurado en el panel o el deducido de pages.baseUrl.
function repoActual() {
  const owner = (!esLocal() && localStorage.getItem("sinlinea.owner")) || null;
  const repo = (!esLocal() && localStorage.getItem("sinlinea.repo")) || null;
  if (owner && repo) return { owner, repo };
  try { const u = new URL(estado.cuentasInfo?.global?.pages?.baseUrl || configPanel.baseUrl || ""); return deducirRepo(u) || deducirRepo(location); } catch { return deducirRepo(location); }
}

// Programados vencidos de la cuenta: se muestran y se pide una decisión antes de encender la publicación.
// Devuelve "publicar" (se mantienen y saldrán en la próxima corrida), "quitar" (vuelven a borradores) o null (cancelar).
function decidirVencidos(id) {
  const vencidos = postsVencidos(estado.items.map((x) => x.post), id, ahoraIso());
  if (!vencidos.length) return Promise.resolve("ninguno");
  const dialogo = $("dialogo-vencidos");
  $("dv-texto").textContent = `${vencidos.length} programado${vencidos.length === 1 ? "" : "s"} de esta cuenta ya pasaron de hora y se publicarían en la próxima corrida (cada 30 minutos) al encender la publicación. Decide qué hacer con ellos antes de activarla.`;
  $("dv-lista").replaceChildren(...vencidos.map((p) => el("li", { text: `${claveDia(p.programado)} ${horaMinutoDeIso(p.programado)} · ${p.titular}` })));
  dialogo.returnValue = "cancelar";
  dialogo.showModal();
  return new Promise((resolve) => {
    dialogo.addEventListener("close", async () => {
      const r = dialogo.returnValue;
      if (r === "quitar") {
        for (const p of vencidos) {
          const item = estado.items.find((x) => x.post.id === p.id);
          await ejecutar(p.id, item?.sha ?? null, (post) => quitarDeCola(post, ahoraIso()));
        }
        resolve("quitar");
      } else if (r === "publicar") resolve("publicar");
      else resolve(null);
    }, { once: true });
  });
}

// Interruptor rápido desde la tarjeta: misma activación segura que el formulario. Nunca toca el otro interruptor.
async function cambiarAutomatico(id, clave, valor) {
  const c = estado.cuentasInfo?.cuentas.find((x) => x.id === id);
  if (!c?.config) return;
  if (valor) {
    let faltan = [];
    if (clave === "generar") {
      let editorialMd = c.editorial;
      if (editorialMd === undefined || editorialMd === null) { try { editorialMd = (await estado.almacen.leerArchivo(`cuentas/${id}/editorial.md`))?.texto || ""; } catch { editorialMd = ""; } }
      faltan = requisitosGeneracion({ config: c.config, editorialMd });
    } else {
      faltan = requisitosPublicacion({ config: c.config, id, conexion: c.conexion, tokenInfo: c.tokenInfo, ahora: new Date() });
    }
    if (faltan.length) { avisar(`No se puede encender la ${clave === "generar" ? "generación" : "publicación"} de ${c.config.nombre}: ${faltan.join(" · ")}`, 15000); return; }
    if (clave === "publicar") {
      const decision = await decidirVencidos(id);
      if (decision === null) { avisar("Publicación no activada: cancelaste la decisión sobre los programados vencidos.", 8000); return; }
    }
  }
  const ok = await guardarConfigCuenta(id, (cfg) => ({ ...cfg, automatico: { generar: cfg.automatico?.generar !== false, publicar: cfg.automatico?.publicar !== false, ...(cfg.automatico || {}), [clave]: valor } }), `panel: ${clave} ${valor ? "encendida" : "pausada"} en ${id}`);
  if (ok) avisar(`${clave === "generar" ? "Generación" : "Publicación"} de ${c.config.nombre}: ${valor ? "encendida" : "pausada"}.`, 6000);
}

// Multicanal (F1): interruptor de una red nueva con activación segura (identidad verificada de la página). Nunca toca
// el interruptor de Instagram ni la pausa general. Apagar deja las entregas en espera; no las omite.
async function cambiarConexionRed(id, red, valor) {
  const c = estado.cuentasInfo?.cuentas.find((x) => x.id === id);
  if (!c?.config) return;
  const nombre = NOMBRES_RED[red] || red;
  if (valor) {
    const faltan = requisitosPublicacionRed({ config: c.config, id, red, conexion: c.conexiones?.[red]?.conexion || null, ahora: new Date() });
    if (faltan.length) { avisar(`No se puede encender ${nombre} de ${c.config.nombre}: ${faltan.join(" · ")}`, 15000); return; }
  }
  const ok = await guardarConfigCuenta(id, (cfg) => ({ ...cfg, conexiones: { ...(cfg.conexiones || {}), [red]: { ...(cfg.conexiones?.[red] || {}), publicar: valor } } }), `panel: ${red} ${valor ? "encendido" : "pausado"} en ${id}`);
  if (ok) avisar(`${nombre} de ${c.config.nombre}: ${valor ? "encendida" : "pausada"}.${valor ? "" : " Sus entregas pendientes quedan en espera, no se omiten."}`, 8000);
}

// Pausa general explícita: nada sale en ninguna red; los interruptores conservan su valor.
async function cambiarPausa(id, valor) {
  const c = estado.cuentasInfo?.cuentas.find((x) => x.id === id);
  if (!c?.config) return;
  const ok = await guardarConfigCuenta(id, (cfg) => {
    const auto = { generar: cfg.automatico?.generar !== false, publicar: cfg.automatico?.publicar !== false, ...(cfg.automatico || {}) };
    if (valor) auto.pausa = true; else delete auto.pausa;
    return { ...cfg, automatico: auto };
  }, `panel: pausa general ${valor ? "activada" : "desactivada"} en ${id}`);
  if (ok) avisar(`Pausa general ${valor ? "activada" : "desactivada"} en ${c.config.nombre}: ${valor ? "nada sale en ninguna red hasta reanudar; los interruptores no cambian" : "las entregas en espera salen en la próxima corrida"}.`, 8000);
}

// Borrador manual desde el panel para la cuenta seleccionada.
$("nb-categoria").replaceChildren(...CATEGORIAS.map((k) => el("option", { value: k, text: k })));
$("boton-nuevo-borrador").addEventListener("click", () => {
  const cfg = configDeCuenta(estado.cuenta);
  if (soloLectura()) { avisar("Sin token: el panel está en modo solo lectura.", 6000); return; }
  if (cfg.archivada) { avisar(`${cfg.nombre} está archivada: reactívala antes de crear borradores.`, 8000); return; }
  $("nb-titulo-dialogo").textContent = `Nuevo borrador · ${cfg.nombre}`;
  for (const k of ["nb-titular", "nb-bajada", "nb-caption", "nb-hashtags", "nb-medio", "nb-url", "nb-titulo-fuente", "nb-escena"]) $(k).value = "";
  $("nb-variante").value = "";
  $("nb-publicado").value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  $("nb-errores").hidden = true;
  $("dialogo-borrador").showModal();
});
$("nb-cancelar").addEventListener("click", () => $("dialogo-borrador").close("cancelar"));
$("form-borrador").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const cfg = configDeCuenta(estado.cuenta);
  const entrada = {
    categoria: $("nb-categoria").value, titular: $("nb-titular").value.trim(), bajada: $("nb-bajada").value.trim(), caption: $("nb-caption").value.trim(),
    hashtags: $("nb-hashtags").value.split(/[\s,]+/).map((h) => h.trim()).filter(Boolean),
    fuente: { medio: $("nb-medio").value.trim(), url: $("nb-url").value.trim(), titulo: $("nb-titulo-fuente").value.trim(), publicado: $("nb-publicado").value ? new Date($("nb-publicado").value).toISOString() : "" },
    escena: $("nb-escena").value.trim(),
  };
  let post;
  try {
    post = borradorDesdeFormulario(entrada, { cuenta: estado.cuenta, zona: cfg.zonaHoraria, ahora: new Date(), variante: $("nb-variante").value || null, ilustracionesActivas: cfg.ilustraciones?.activo !== false, postsExistentes: estado.items.map((x) => x.post) });
  } catch (err) { $("nb-errores").hidden = false; $("nb-errores").textContent = err.message; return; }
  $("nb-crear").disabled = true;
  try {
    const sha = await estado.almacen.guardar(post);
    estado.items.unshift({ post, sha });
    estado.pestana = "borrador";
    $("dialogo-borrador").close("creado");
    pintar();
    avisar(`Borrador creado: ${post.titular}. La imagen se dibuja en la próxima corrida de REGENERAR.`, 8000);
  } catch (err) {
    $("nb-errores").hidden = false; $("nb-errores").textContent = `No se pudo guardar: ${err.message}`;
  } finally { $("nb-crear").disabled = false; }
});

// --- Formulario de cuenta -------------------------------------------------------
const ZONAS = ["America/Panama", "America/Bogota", "America/Mexico_City", "America/Lima", "America/Santiago", "America/Argentina/Buenos_Aires", "America/Costa_Rica", "America/Guatemala", "America/Caracas", "America/Santo_Domingo", "America/New_York", "Europe/Madrid", "UTC"];
$("fc-idioma").replaceChildren(...IDIOMAS.map(([codigo, nombre]) => el("option", { value: codigo, text: `${nombre} (${codigo})` })));
$("zonas").replaceChildren(...ZONAS.map((z) => el("option", { value: z })));

function filaFuente(f = { nombre: "", tipo: "rss", url: "", patronArticulo: "" }) {
  const nombre = el("input", { placeholder: "Medio", autocomplete: "off" }); nombre.value = f.nombre || "";
  const tipo = el("select", {}, [el("option", { value: "rss", text: "RSS" }), el("option", { value: "portada", text: "Portada" })]); tipo.value = f.tipo || "rss";
  const url = el("input", { placeholder: "https://…", autocomplete: "off" }); url.value = f.url || "";
  const patron = el("input", { placeholder: "Patrón de URL de artículo (expresión regular)", autocomplete: "off" }); patron.value = f.patronArticulo || "";
  const labelPatron = el("label", { class: "patron", text: "Patrón de artículo (solo portada)" }, [patron]);
  const quitar = el("button", { type: "button", class: "boton peligro", text: "Quitar" });
  const fila = el("div", { class: "fuente-fila" }, [
    el("label", { text: "Nombre" }, [nombre]), el("label", { text: "Tipo" }, [tipo]), el("label", { class: "url", text: "URL" }, [url]), quitar, labelPatron,
  ]);
  const ajustar = () => { labelPatron.hidden = tipo.value !== "portada"; };
  tipo.addEventListener("change", ajustar); ajustar();
  quitar.addEventListener("click", () => fila.remove());
  fila.leer = () => ({ nombre: nombre.value.trim(), tipo: tipo.value, url: url.value.trim(), ...(tipo.value === "portada" ? { patronArticulo: patron.value.trim() } : {}) });
  return fila;
}
$("fc-anadir-fuente").addEventListener("click", () => $("fc-fuentes").append(filaFuente()));

function leerFormulario() {
  const f = estado.formulario;
  return {
    id: (f.modo === "editar" ? f.id : $("fc-id").value.trim()),
    nombre: $("fc-nombre").value.trim(),
    usuario: $("fc-usuario").value.trim(),
    lema: $("fc-lema").value.trim(),
    idioma: $("fc-idioma").value,
    zonaHoraria: $("fc-zona").value.trim(),
    temas: $("fc-temas").value.split("\n").map((t) => t.trim()).filter(Boolean),
    tono: $("fc-tono").value.trim(),
    editorialMd: $("fc-editorial").value,
    fuentes: [...$("fc-fuentes").children].map((fila) => fila.leer()),
    franjas: $("fc-franjas").value.split(/[\s,;]+/).map((h) => h.trim()).filter(Boolean),
    colores: { principal: $("fc-color-principal").value.toUpperCase(), acento: $("fc-color-acento").value.toUpperCase(), oscuro: $("fc-color-oscuro").value.toUpperCase(), claro: $("fc-color-claro").value.toUpperCase() },
    logoForma: $("fc-logo-forma").value,
    logoTamano: Number($("fc-logo-tamano").value),
    ilustracionesActivo: $("fc-ilus-activo").checked,
    estiloIlustracion: $("fc-ilus-estilo").value.trim(),
    rotulo: $("fc-rotulo").value,
    origen: $("fc-origen").value === "entorno" ? "entorno" : "repositorio",
    tokenSecreto: $("fc-token-secreto").value.trim(),
    usuarioIdSecreto: $("fc-id-secreto").value.trim(),
    recogerMetricas: $("fc-metricas").checked,
    generar: $("fc-generar").checked,
    publicar: $("fc-publicar").checked,
    pausa: $("fc-pausa").checked,
    facebookPublicar: $("fc-fb-publicar").checked,
    facebookPagina: $("fc-fb-pagina").value.trim(),
    threadsPublicar: $("fc-th-publicar").checked,
    threadsUsuario: $("fc-th-usuario").value.trim(),
    threadsPerfil: $("fc-th-perfil").value.trim(),
  };
}

function rellenarFormulario(d) {
  $("fc-nombre").value = d.nombre || "";
  $("fc-usuario").value = d.usuario || "";
  $("fc-id").value = d.id || "";
  $("fc-idioma").value = IDIOMAS.some(([c]) => c === d.idioma) ? d.idioma : IDIOMA_POR_DEFECTO;
  $("fc-lema").value = d.lema || "";
  $("fc-temas").value = (d.temas || []).join("\n");
  $("fc-tono").value = d.tono || "";
  $("fc-editorial").value = d.editorialMd || "";
  $("fc-fuentes").replaceChildren(...(d.fuentes || []).map(filaFuente));
  $("fc-franjas").value = (d.franjas || []).join(", ");
  const colores = { ...COLORES_POR_DEFECTO, ...(d.colores || {}) };
  for (const k of Object.keys(COLORES_POR_DEFECTO)) $(`fc-color-${k}`).value = colores[k];
  $("fc-logo-forma").value = d.logoForma || "circulo";
  $("fc-logo-tamano").value = d.logoTamano || LOGO_TAMANO.porDefecto;
  $("fc-ilus-activo").checked = d.ilustracionesActivo !== false;
  $("fc-ilus-estilo").value = d.estiloIlustracion || "";
  $("fc-rotulo").value = d.rotulo || "";
  $("fc-zona").value = d.zonaHoraria || ZONA_POR_DEFECTO;
  $("fc-origen").value = d.origen === "entorno" ? "entorno" : "repositorio";
  $("fc-token-secreto").value = d.tokenSecreto || "";
  $("fc-id-secreto").value = d.usuarioIdSecreto || "";
  $("fc-metricas").checked = d.recogerMetricas === true;
  $("fc-generar").checked = d.generar === true;
  $("fc-publicar").checked = d.publicar === true;
  $("fc-pausa").checked = d.pausa === true;
  $("fc-fb-publicar").checked = d.facebookPublicar === true;
  $("fc-fb-pagina").value = d.facebookPagina || "";
  $("fc-th-publicar").checked = d.threadsPublicar === true;
  $("fc-th-usuario").value = d.threadsUsuario || "";
  $("fc-th-perfil").value = d.threadsPerfil || "";
  $("fc-requisitos").hidden = true;
  $("fc-logo").value = "";
  $("fc-logo-previa").replaceChildren();
  $("fc-logo-nota").textContent = "";
  actualizarSecretosFormulario();
}

function actualizarSecretosFormulario() {
  const f = estado.formulario;
  if (!f) return;
  const id = f.modo === "editar" ? f.id : $("fc-id").value.trim();
  if (f.modo === "crear" && !f.secretosManuales) {
    const s = nombresSecretosSugeridos(id || "nueva-cuenta");
    $("fc-token-secreto").value = s.tokenSecreto;
    $("fc-id-secreto").value = s.usuarioIdSecreto;
  }
  const enEntorno = $("fc-origen").value === "entorno";
  $("fc-nombres-secretos").hidden = enEntorno;
  const cambio = f.modo === "editar" ? " Si cambias el usuario de Instagram, el origen o estos nombres, la verificación anterior deja de valer y habrá que verificar de nuevo." : "";
  if (enEntorno) {
    const entorno = nombreEntorno(id || "nueva-cuenta");
    $("fc-secretos").textContent = `Crea en GitHub el Environment ${entorno} (Settings → Environments → New environment; hace falta ser administrador del repositorio) y añade en él dos secretos con estos nombres exactos: IG_ACCESS_TOKEN (token de acceso) e IG_USER_ID (id numérico). Los jobs de esta cuenta solo verán esos dos secretos; si faltan, fallan sin usar credenciales de otro origen. Aquí no se guardan valores.${cambio}`;
    return;
  }
  const token = $("fc-token-secreto").value.trim() || "(sin nombre)";
  const numero = $("fc-id-secreto").value.trim() || "(sin nombre)";
  const expuestos = secretosExpuestosActuales();
  const llegan = Array.isArray(expuestos) ? expuestos.includes(token) && expuestos.includes(numero) : null;
  const aviso = llegan === false
    ? " Estos nombres todavía no llegan a los workflows: la cuenta quedará como «Conexión pendiente de configuración»."
    : "";
  $("fc-secretos").textContent = `Modo actual: guarda en GitHub (Settings → Secrets and variables → Actions) dos secretos con estos nombres exactos: ${token} (token de acceso) y ${numero} (id numérico). Aquí solo se guardan los nombres, nunca los valores.${aviso}${cambio}`;
}
$("fc-origen").addEventListener("change", actualizarSecretosFormulario);
for (const id of ["fc-token-secreto", "fc-id-secreto"]) $(id).addEventListener("input", () => { if (estado.formulario) estado.formulario.secretosManuales = true; actualizarSecretosFormulario(); });

// La editorial se genera sola mientras el operador no la haya tocado (solo al crear).
function regenerarEditorialSiAuto() {
  const f = estado.formulario;
  if (!f || f.modo !== "crear" || f.editorialManual) return;
  const d = leerFormulario();
  $("fc-editorial").value = plantillaEditorial(d);
}
for (const id of ["fc-nombre", "fc-usuario", "fc-temas", "fc-tono"]) $(id).addEventListener("input", regenerarEditorialSiAuto);
$("fc-idioma").addEventListener("change", regenerarEditorialSiAuto);
$("fc-editorial").addEventListener("input", () => { if (estado.formulario) { estado.formulario.editorialManual = true; $("fc-editorial-nota").textContent = "Editado a mano: se guardará tal cual."; } });
$("fc-usuario").addEventListener("input", () => {
  const f = estado.formulario;
  if (!f || f.modo !== "crear" || f.idManual) return;
  $("fc-id").value = idSugerido($("fc-usuario").value);
  actualizarSecretosFormulario();
});
$("fc-id").addEventListener("input", () => { if (estado.formulario) estado.formulario.idManual = true; actualizarSecretosFormulario(); });
$("fc-logo").addEventListener("change", () => {
  const archivo = $("fc-logo").files[0];
  const f = estado.formulario;
  if (!archivo || !f) return;
  if (archivo.type !== "image/png" || archivo.size > 1024 * 1024) { $("fc-logo-nota").textContent = "El logo debe ser un PNG de menos de 1 MB."; $("fc-logo").value = ""; return; }
  const lector = new FileReader();
  lector.onload = () => {
    f.logoBase64 = String(lector.result).split(",")[1];
    $("fc-logo-previa").replaceChildren(el("img", { src: lector.result, alt: "" }));
    $("fc-logo-nota").textContent = `${archivo.name} (${Math.round(archivo.size / 1024)} KB) se subirá al guardar.`;
  };
  lector.readAsDataURL(archivo);
});

async function abrirFormulario(modo, id = null) {
  $("form-errores").hidden = true;
  if (modo === "crear") {
    estado.formulario = { modo, id: null, base: null, shas: {}, editorialManual: false, idManual: false, secretosManuales: false, logoBase64: null };
    $("fc-titulo").textContent = "Añadir cuenta";
    $("fc-id").readOnly = false;
    // Cuenta nueva: valores por defecto (nada se hereda de otra cuenta), origen Environment cuenta-<id> (fase 2) y todo apagado.
    rellenarFormulario({ idioma: IDIOMA_POR_DEFECTO, zonaHoraria: estado.cuentasInfo?.global?.zonaHoraria || ZONA_POR_DEFECTO, franjas: FRANJAS_POR_DEFECTO, colores: COLORES_POR_DEFECTO, logoForma: "circulo", logoTamano: LOGO_TAMANO.porDefecto, ilustracionesActivo: true, estiloIlustracion: ESTILO_ILUSTRACION_POR_DEFECTO, rotulo: "", fuentes: [], origen: "entorno", generar: false, publicar: false, recogerMetricas: false });
    $("fc-editorial-nota").textContent = "Se redacta solo a partir de los temas y el tono hasta que lo edites a mano.";
    regenerarEditorialSiAuto();
  } else {
    const c = estado.cuentasInfo.cuentas.find((x) => x.id === id);
    if (!c?.config) { avisar("No se pudo abrir la cuenta.", 8000); return; }
    let editorial = c.editorial;
    let editorialSha = c.editorialSha;
    if (editorial === undefined || editorial === null) {
      try { const a = await estado.almacen.leerArchivo(`cuentas/${id}/editorial.md`); editorial = a?.texto || ""; editorialSha = a?.sha || null; } catch { editorial = ""; }
    }
    estado.formulario = { modo, id, base: c.config, shas: { config: c.sha, editorial: editorialSha, conexion: c.conexionSha || null }, conexion: c.conexion || null, conexiones: c.conexiones || null, editorialManual: true, idManual: true, secretosManuales: true, logoBase64: null };
    $("fc-titulo").textContent = `Editar ${c.config.nombre}`;
    $("fc-id").readOnly = true;
    rellenarFormulario(formularioDesdeConfig(id, c.config, editorial));
    $("fc-editorial-nota").textContent = "Se guarda tal cual en cuentas/" + id + "/editorial.md.";
  }
  mostrarVista("formulario");
}
$("boton-anadir").addEventListener("click", () => abrirFormulario("crear"));
$("fc-cancelar").addEventListener("click", () => { estado.formulario = null; mostrarVista("maestro"); });

function mostrarErroresFormulario(lista) {
  const n = $("form-errores");
  n.hidden = false;
  n.replaceChildren(...lista.map((m) => el("div", { text: m })));
  n.scrollIntoView({ block: "nearest" });
}

$("form-cuenta").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const f = estado.formulario;
  if (!f) return;
  const d = leerFormulario();
  const idsExistentes = (estado.cuentasInfo?.global?.cuentas || []);
  const errores = erroresDeCuenta(d, { idsExistentes, editando: f.modo === "editar" });
  if (errores.length) { mostrarErroresFormulario(errores); return; }
  const botones = $("form-cuenta").querySelectorAll("button");
  botones.forEach((b) => { b.disabled = true; });
  try {
    await guardarFormulario(d);
    estado.formulario = null;
    avisar(f.modo === "crear" ? `Cuenta ${d.id} creada: empieza apagada y sin conexión verificada.` : `Cuenta ${d.id} guardada.`, 8000);
    await refrescarCuentas();
    mostrarVista("maestro");
  } catch (err) {
    // El formulario conserva lo escrito: el operador corrige o reintenta.
    mostrarErroresFormulario([err.message]);
  } finally {
    botones.forEach((b) => { b.disabled = false; });
  }
});

// Guarda config, editorial, logo y (al crear) la lista global de cuentas en UNA sola escritura atómica: o entra todo o no
// entra nada, así no quedan cuentas a medias. Cada archivo lleva su sha: si alguien lo cambió, se avisa, se conserva lo
// escrito y se actualiza el sha para que el siguiente Guardar escriba sobre la versión nueva.
async function guardarFormulario(d) {
  const f = estado.formulario;
  const id = d.id;
  const config = configDesdeFormulario(d, f.base);
  // Al editar una cuenta que no declaraba `automatico`, si las casillas siguen en su valor efectivo (encendidas) no se
  // inventa el bloque; en cuanto el operador cambia algo, se escribe explícito.
  if (f.modo === "editar" && f.base && f.base.automatico === undefined && d.generar === true && d.publicar === true && d.pausa !== true) delete config.automatico;
  const textoConfig = JSON.stringify(config, null, 2) + "\n";
  const editorial = d.editorialMd.trim() ? d.editorialMd.replace(/\r\n/g, "\n").replace(/\n*$/, "\n") : plantillaEditorial(d);
  const accion = f.modo === "crear" ? "alta" : "edición";
  // Activación segura: encender la generación exige requisitos editoriales; encender la publicación, identidad verificada
  // y una decisión sobre los programados vencidos que saldrían en la próxima corrida.
  const antesAuto = { generar: f.base?.automatico?.generar !== false && f.modo === "editar", publicar: f.base?.automatico?.publicar !== false && f.modo === "editar" };
  const faltan = [];
  const enciende = (k) => (config.automatico ? config.automatico[k] === true : d[k] === true) && !antesAuto[k];
  if (enciende("generar")) faltan.push(...requisitosGeneracion({ config, editorialMd: editorial }).map((m) => `generación: ${m}`));
  if (enciende("publicar")) faltan.push(...requisitosPublicacion({ config, id, conexion: f.conexion, ahora: new Date() }).map((m) => `publicación: ${m}`));
  // Multicanal (F1): encender una red nueva desde el formulario exige la identidad verificada de esa red.
  for (const cx of conexionesDeCuenta(config)) {
    const antesRed = f.modo === "editar" && f.base?.conexiones?.[cx.red]?.publicar === true;
    if (cx.publicar && !antesRed) faltan.push(...requisitosPublicacionRed({ config, id, red: cx.red, conexion: f.conexiones?.[cx.red]?.conexion || null, ahora: new Date() }).map((m) => `${cx.nombre}: ${m}`));
  }
  if (faltan.length) throw new Error(`No se puede activar: ${faltan.join(" · ")}`);
  if (enciende("publicar")) {
    const decision = await decidirVencidos(id);
    if (decision === null) throw new Error("Publicación no activada: cancelaste la decisión sobre los programados vencidos.");
  }
  const archivos = [
    { clave: "config", ruta: `cuentas/${id}/config.json`, texto: textoConfig, sha: f.shas.config ?? null },
    { clave: "editorial", ruta: `cuentas/${id}/editorial.md`, texto: editorial, sha: f.shas.editorial ?? null },
  ];
  if (f.logoBase64) archivos.push({ clave: "logo", ruta: `cuentas/${id}/logo.png`, base64: f.logoBase64 }); // sin comprobación de versión
  if (f.modo === "editar") {
    // Si cambió el usuario de Instagram o el nombre de los secretos, la verificación anterior deja de valer.
    const antes = f.base || {};
    const usuarioCambio = normalizarUsuario(antes.marca?.usuario || "").toLowerCase() !== normalizarUsuario(config.marca.usuario).toLowerCase();
    const nombresAntes = { ...nombresSecretosSugeridos(id), ...(antes.instagram || {}) };
    const origenAntes = antes.instagram?.origen === "entorno" ? "entorno" : "repositorio";
    const origenCambio = origenAntes !== config.instagram.origen;
    const secretosCambio = config.instagram.origen === "repositorio" && (nombresAntes.tokenSecreto !== config.instagram.tokenSecreto || nombresAntes.usuarioIdSecreto !== config.instagram.usuarioIdSecreto);
    if ((usuarioCambio || secretosCambio || origenCambio) && f.conexion?.estado !== "sin-verificar") {
      const anterior = f.conexion ? { estado: f.conexion.estado, comprobado: f.conexion.comprobado || null, usuario: f.conexion.usuario || null } : null;
      const detalle = usuarioCambio ? `el usuario de Instagram cambió a ${config.marca.usuario}` : (origenCambio ? `el origen de las credenciales cambió a ${config.instagram.origen === "entorno" ? `Environment ${nombreEntorno(id)}` : "modo actual (repositorio)"}` : "cambiaron los nombres de los secretos");
      const conexion = { estado: "pendiente", motivo: "cambio", cambiado: ahoraIso(), detalle, anterior };
      archivos.push({ clave: "conexion", ruta: `data/${id}/conexion.json`, texto: JSON.stringify(conexion, null, 2) + "\n", sha: f.shas.conexion ?? null });
    }
  }
  for (let intento = 0; intento < 2; intento++) {
    const lote = [...archivos];
    if (f.modo === "crear") {
      const actual = await estado.almacen.leerArchivo("config.json");
      if (!actual) throw new Error("No se encontró config.json en el repositorio.");
      const global = JSON.parse(actual.texto);
      if (!(global.cuentas || []).includes(id)) lote.push({ clave: "global", ruta: "config.json", texto: JSON.stringify({ ...global, cuentas: [...(global.cuentas || []), id] }, null, 2) + "\n", sha: actual.sha });
    }
    try {
      const r = await estado.almacen.escribirArchivos(lote, { mensaje: `panel: ${accion} de cuenta ${id}` });
      for (const a of lote) if (a.clave !== "global") f.shas[a.clave] = r.shas[a.ruta] || f.shas[a.clave] || null;
      f.logoBase64 = null;
      return;
    } catch (err) {
      if (!(err instanceof ErrorConflictoArchivo)) throw err;
      if (err.ruta === "config.json" && intento === 0) continue; // la lista global cambió entre medias: se rehace con la versión nueva
      const propio = archivos.find((a) => a.ruta === err.ruta);
      if (propio) f.shas[propio.clave] = err.actual?.sha || null;
      if (f.modo === "crear" && propio && err.actual) throw new Error(`${err.ruta} ya existe en el repositorio. Si es una cuenta anterior, edítala desde su tarjeta; si no, elige otro identificador.`);
      throw new Error(`${err.message} Lo que escribiste sigue aquí: pulsa Guardar de nuevo para escribir sobre la versión actual. No se guardó ningún archivo.`);
    }
  }
}

// --- Arranque ---------------------------------------------------------------
configurarAlmacen();
cargarConfigPanel().then(async () => {
  await cargarCuentas();
  elegirCuentaInicial();
  let vista = "posts";
  try { vista = localStorage.getItem("sinlinea.vista") === "maestro" ? "maestro" : "posts"; } catch { /* sin almacenamiento */ }
  mostrarVista(vista);
  return cargar();
});
setInterval(() => {
  const hayRegenerando = estado.items.some((x) => ["borrador", "programado", "error"].includes(x.post.estado)
    && (imagenDesactualizada(x.post) || generandoIlustracion(x.post.ilustracion) || regenerandoIlustracion(x.post.ilustracion)));
  if (estado.almacen.limiteActual?.()) return; // límite de la API de GitHub: no insistir hasta la hora de reinicio
  if (hayRegenerando && !document.querySelector("dialog[open]") && estado.borradores.size === 0 && estado.vista === "posts") cargar();
}, 30000);
