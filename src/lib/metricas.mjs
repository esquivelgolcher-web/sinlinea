// Métricas fase 1 (isomorfo: lo usan el orquestador y el panel). Constantes de qué se pide a la API, etiquetas en
// español, motivos normalizados de ausencia y utilidades puras. Un dato ausente es null, nunca 0.

// Grupos de métricas de cuenta (period=day, metric_type=total_value) según la referencia de Instagram Login:
// - documentadas: se piden juntas en una llamada;
// - seguidores: exige ≥ 100 seguidores (se pide aparte para que su fallo no arrastre al resto);
// - porConfirmar: solo detalladas para la variante con Facebook Login; se piden una a una.
export const GRUPOS = Object.freeze({
  cuentaDocumentadas: Object.freeze(["reach", "views", "accounts_engaged", "total_interactions", "likes", "comments", "shares", "saves", "reposts", "replies", "profile_links_taps"]),
  cuentaSeguidores: Object.freeze(["follows_and_unfollows"]),
  cuentaPorConfirmar: Object.freeze(["follower_count", "profile_views", "website_clicks"]),
  // Hallazgo real (2026-09-09): la API rechaza `reposts` en publicaciones; en reels tampoco existen profile_visits,
  // profile_activity ni follows (la recogida aprende por tipo lo que la API rechaza y deja de pedirlo).
  medioFeed: Object.freeze(["reach", "views", "likes", "comments", "saved", "shares", "total_interactions", "profile_visits", "profile_activity", "follows"]),
  medioReel: Object.freeze(["ig_reels_avg_watch_time", "ig_reels_video_view_total_time", "reels_skip_rate"]),
});

export const ETIQUETAS = Object.freeze({
  seguidores: "Seguidores", seguidos: "Seguidos", publicaciones: "Publicaciones",
  reach: "Alcance", views: "Vistas", accounts_engaged: "Cuentas que interactuaron", total_interactions: "Interacciones",
  likes: "Me gusta", comments: "Comentarios", shares: "Compartidos", saves: "Guardados", saved: "Guardados", reposts: "Reposts",
  replies: "Respuestas a historias", profile_links_taps: "Toques en botones de contacto", follows_and_unfollows: "Altas y bajas de seguidores",
  follower_count: "Seguidores nuevos", profile_views: "Visitas al perfil", website_clicks: "Clics en el sitio web",
  profile_visits: "Visitas al perfil", profile_activity: "Acciones en el perfil", follows: "Seguimientos desde la publicación",
  ig_reels_avg_watch_time: "Tiempo medio de visionado (ms)", ig_reels_video_view_total_time: "Tiempo total de visionado (ms)", reels_skip_rate: "Tasa de salto",
  meGusta: "Me gusta", comentarios: "Comentarios",
});

// Motivos por los que una métrica no tiene valor. El texto se muestra tal cual en el panel y en los registros.
export const MOTIVOS = Object.freeze({
  "sin-permiso-insights": "No disponible: requiere permiso de estadísticas (instagram_business_manage_insights)",
  "menos-de-100-seguidores": "No disponible: la cuenta tiene menos de 100 seguidores",
  "metrica-no-soportada": "No disponible: la API no soporta esta métrica para esta cuenta o tipo de publicación",
  "conjunto-vacio": "No disponible (la API devolvió un conjunto vacío)",
  "retraso-api": "No disponible todavía (la API puede tardar hasta 48 h)",
  "limite-llamadas": "No disponible: se alcanzó el límite de llamadas; se completa en otra corrida",
  "presupuesto-agotado": "No disponible: se agotó el presupuesto de llamadas de esta corrida; se completa en otra",
  "no-solicitado": "No disponible: no se ha consultado",
  "sin-recogida": "No disponible: aún no hay ninguna recogida",
});

export function textoMotivo(motivo) {
  if (!motivo) return "No disponible";
  if (MOTIVOS[motivo]) return MOTIVOS[motivo];
  if (String(motivo).startsWith("error-api:")) return `No disponible: la API respondió con el error ${String(motivo).slice("error-api:".length)}`;
  return `No disponible (${motivo})`;
}

// Valor para mostrar: un número (incluido 0 real) o el texto del motivo. Nunca convierte null en 0.
export function textoValor(valor, motivo = null, { formato = (n) => String(n) } = {}) {
  if (typeof valor === "number" && Number.isFinite(valor)) return formato(valor);
  return textoMotivo(motivo);
}

export const etiqueta = (clave) => ETIQUETAS[clave] || clave;

// --- Almacenamiento (data/<cuenta>/metricas/): instantáneas con fecha de consulta ---------------------------------
// Dos familias de datos que NO se mezclan:
// - acumulados: totales en el momento de la consulta (perfil: seguidores…; publicación: me gusta, alcance…). Se guardan
//   como instantáneas con la fecha exacta de consulta, una por día (la última del día sustituye a la anterior).
// - por período: métricas de cuenta de la API con period=day, guardadas bajo el día al que se refieren, con la fecha en
//   que se consultaron (la API puede corregirlas hasta 48 h después; se sobrescriben).
// La diferencia entre dos instantáneas es una variación APROXIMADA entre consultas, nunca la actividad exacta de un día.

const mesDe = (fechaIso) => String(fechaIso).slice(0, 7);
const diaDe = (fechaIso) => String(fechaIso).slice(0, 10);

export function archivoDeMes(tipo, fechaIso) {
  return `${tipo}-${mesDe(fechaIso)}.json`;
}

function baseCuenta(archivo, cuenta) {
  const a = archivo && typeof archivo === "object" ? archivo : {};
  return { version: 1, cuenta: a.cuenta || cuenta, consultas: { ...(a.consultas || {}) }, porDia: { ...(a.porDia || {}) } };
}
function sinMismoDia(obj, fechaIso) {
  const dia = diaDe(fechaIso);
  return Object.fromEntries(Object.entries(obj).filter(([k]) => diaDe(k) !== dia));
}
const ordenar = (obj) => Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));

// Instantánea del perfil (acumulados) con la fecha de consulta.
export function registrarConsultaCuenta(archivo, { cuenta, consultadoEn, perfil, permiso, llamadas, completo = true, motivoIncompleto = null }) {
  const a = baseCuenta(archivo, cuenta);
  const consultas = sinMismoDia(a.consultas, consultadoEn);
  consultas[consultadoEn] = {
    perfil: { seguidores: perfil?.seguidores ?? null, seguidos: perfil?.seguidos ?? null, publicaciones: perfil?.publicaciones ?? null },
    permiso, llamadas: llamadas ?? null, completo: completo !== false, motivoIncompleto: completo === false ? (motivoIncompleto || null) : null,
  };
  return { ...a, consultas: ordenar(consultas) };
}

// Métricas por período del día `dia` (AAAA-MM-DD, UTC), con la fecha en que se consultaron. Sobrescribe.
export function registrarPorDia(archivo, { cuenta, dia, consultadoEn, valores, faltantes = {} }) {
  const a = baseCuenta(archivo, cuenta);
  const porDia = { ...a.porDia, [dia]: { valores: { ...valores }, faltantes: { ...faltantes }, consultadoEn } };
  return { ...a, porDia: ordenar(porDia) };
}

function basePublicaciones(archivo, cuenta) {
  const a = archivo && typeof archivo === "object" ? archivo : {};
  return { version: 1, cuenta: a.cuenta || cuenta, publicaciones: { ...(a.publicaciones || {}) } };
}
const tituloDe = (caption) => String(caption || "").replace(/\s+/g, " ").trim().slice(0, 90);

// Totales acumulados de una publicación en la fecha de consulta (una instantánea por día) más su enlace con posts/.
export function registrarConsultaMedio(archivo, { cuenta, medio, consultadoEn, acumulados, faltantes = {}, enlace = {} }) {
  const a = basePublicaciones(archivo, cuenta);
  const previa = a.publicaciones[medio.id] || {};
  const consultas = sinMismoDia(previa.consultas || {}, consultadoEn);
  consultas[consultadoEn] = { acumulados: { ...acumulados }, faltantes: { ...faltantes } };
  a.publicaciones[medio.id] = {
    fecha: medio.fecha ?? previa.fecha ?? null, permalink: medio.permalink || previa.permalink || "", tipo: medio.tipo ?? previa.tipo ?? null,
    origen: enlace.origen || previa.origen || "instagram", post: enlace.post ?? previa.post ?? null, categoria: enlace.categoria ?? previa.categoria ?? null, franja: enlace.franja ?? previa.franja ?? null,
    titulo: tituloDe(medio.caption) || previa.titulo || "",
    consultas: ordenar(consultas), ultimaConsulta: consultadoEn,
  };
  return a;
}

// Serie de una cuenta a partir de sus archivos mensuales (en cualquier orden).
export function seriesDeCuenta(archivos) {
  const instantaneas = []; const porDia = [];
  for (const a of archivos || []) {
    for (const [consultadoEn, c] of Object.entries(a?.consultas || {})) instantaneas.push({ consultadoEn, ...c });
    for (const [dia, d] of Object.entries(a?.porDia || {})) porDia.push({ dia, ...d });
  }
  instantaneas.sort((x, y) => x.consultadoEn.localeCompare(y.consultadoEn));
  porDia.sort((x, y) => x.dia.localeCompare(y.dia));
  const ultima = instantaneas[instantaneas.length - 1] || null;
  return { instantaneas, porDia, ultimaConsulta: ultima?.consultadoEn ?? null, permiso: ultima?.permiso ?? null };
}

// Variación entre dos instantáneas: aproximada (depende de cuándo se consultó), nunca "actividad del día".
export function variacionEntreConsultas(anterior, ultima) {
  if (!anterior || !ultima) return null;
  if (typeof anterior.valor !== "number" || typeof ultima.valor !== "number") return null;
  const dias = Math.round((Date.parse(ultima.consultadoEn) - Date.parse(anterior.consultadoEn)) / 86400000);
  return { diferencia: ultima.valor - anterior.valor, dias, aproximada: true };
}

// Por publicación: último acumulado (con motivo si falta) y variación aproximada respecto a la consulta anterior.
export function rendimientoDePublicaciones(archivos) {
  const salida = [];
  for (const a of archivos || []) {
    for (const [id, p] of Object.entries(a?.publicaciones || {})) {
      const fechas = Object.keys(p.consultas || {}).sort();
      const ultimaF = fechas[fechas.length - 1]; const previaF = fechas[fechas.length - 2];
      const ultima = ultimaF ? p.consultas[ultimaF] : { acumulados: {}, faltantes: {} };
      const previa = previaF ? p.consultas[previaF] : null;
      const claves = new Set([...Object.keys(ultima.acumulados || {}), ...Object.keys(ultima.faltantes || {})]);
      const acumulados = {}; const variacion = {};
      for (const k of claves) {
        const valor = ultima.acumulados?.[k] ?? null;
        acumulados[k] = { valor, motivo: valor === null ? (ultima.faltantes?.[k] || "conjunto-vacio") : null };
        variacion[k] = previa ? variacionEntreConsultas({ valor: previa.acumulados?.[k] ?? null, consultadoEn: previaF }, { valor, consultadoEn: ultimaF }) : null;
      }
      salida.push({ id, fecha: p.fecha, permalink: p.permalink, tipo: p.tipo, origen: p.origen, post: p.post, categoria: p.categoria, franja: p.franja, titulo: p.titulo, ultimaConsulta: ultimaF || null, consultas: fechas.length, acumulados, variacion });
    }
  }
  return salida.sort((x, y) => String(y.fecha || "").localeCompare(String(x.fecha || "")));
}

// Qué publicaciones consultar en esta corrida: primero las pendientes de la anterior, luego las nunca consultadas (más
// recientes primero), luego las de consulta más antigua. `presupuesto` = máximo de publicaciones ahora; el resto queda
// como pendiente para la siguiente corrida (recuperación).
export function seleccionarPendientes({ medios, pendientes = [], ultimaConsulta = {}, presupuesto = 0 }) {
  const porId = new Map(medios.map((m) => [m.id, m]));
  const orden = [];
  const visto = new Set();
  const meter = (m) => { if (m && !visto.has(m.id)) { visto.add(m.id); orden.push(m); } };
  for (const id of pendientes) meter(porId.get(id));
  const nunca = medios.filter((m) => !ultimaConsulta[m.id]).sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));
  for (const m of nunca) meter(m);
  const antiguos = medios.filter((m) => ultimaConsulta[m.id]).sort((a, b) => String(ultimaConsulta[a.id]).localeCompare(String(ultimaConsulta[b.id])));
  for (const m of antiguos) meter(m);
  const n = Math.max(0, presupuesto);
  return { ahora: orden.slice(0, n), restantes: orden.slice(n).map((m) => m.id) };
}

// Enlace publicación ↔ post del sistema (por publicacion.idMedia). Solo posts de la cuenta; el resto es "instagram".
export function enlazarConPosts(posts, cuenta) {
  const enlaces = new Map();
  for (const p of posts || []) {
    if (p.cuenta !== cuenta || !p.publicacion?.idMedia) continue;
    const hora = /T(\d{2}:\d{2})/.exec(String(p.programado || ""));
    enlaces.set(String(p.publicacion.idMedia), { origen: "sistema", post: p.id, categoria: p.categoria || null, franja: hora ? hora[1] : null });
  }
  return enlaces;
}
export const ENLACE_INSTAGRAM = Object.freeze({ origen: "instagram", post: null, categoria: null, franja: null });
