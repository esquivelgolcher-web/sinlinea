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
  medioFeed: Object.freeze(["reach", "views", "likes", "comments", "saved", "shares", "reposts", "total_interactions", "profile_visits", "profile_activity", "follows"]),
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
