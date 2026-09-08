// Núcleo isomorfo del panel maestro: reglas de una cuenta compartidas por el panel (navegador) y el
// servidor. Sin imports de Node. Aquí no hay valores de secretos: solo sus NOMBRES.

export const RE_ID_CUENTA = /^[a-z0-9][a-z0-9-]*$/;
export const RE_IDIOMA = /^[a-z]{2}(-[A-Z]{2})?$/;
export const RE_COLOR = /^#[0-9A-Fa-f]{6}$/;
export const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
export const RE_URL = /^https?:\/\//;
export const TIPOS_FUENTE = ["rss", "portada"];
export const LOGO_FORMAS = ["circulo", "cuadrado"];
export const LOGO_TAMANO = Object.freeze({ min: 60, max: 160, porDefecto: 120 });
export const COLORES_POR_DEFECTO = Object.freeze({ principal: "#FFD400", acento: "#E30613", oscuro: "#111111", claro: "#FFFFFF" });
export const AUTOMATICO_POR_DEFECTO = Object.freeze({ generar: true, publicar: true });
export const IDIOMA_POR_DEFECTO = "es-PA";
export const IDIOMAS = [
  ["es-PA", "Español (Panamá)"], ["es", "Español"], ["es-MX", "Español (México)"], ["es-CO", "Español (Colombia)"],
  ["es-ES", "Español (España)"], ["en", "English"], ["en-US", "English (US)"], ["pt-BR", "Português (Brasil)"],
];
export const ZONA_POR_DEFECTO = "America/Panama";
// Cupos prudentes para una cuenta nueva (la generación empieza apagada de todos modos).
export const GENERAR_POR_DEFECTO = Object.freeze({ maxPorCorrida: 1, maxBorradoresPorDia: 2, candidatosMax: 10, diasSinRepetir: 3, maxHorasAntiguedad: 48 });
export const FRANJAS_POR_DEFECTO = ["09:00", "13:00", "18:00"];
export const ESTILO_ILUSTRACION_POR_DEFECTO =
  "Fotografía editorial realista, formato vertical 4:5, luz natural, colores sobrios. El protagonista de la escena ocupa el "
  + "tercio superior derecho; la zona izquierda y central queda despejada y sin detalle. Sin texto, logos, marcos ni degradados. "
  + "Sin personas reales reconocibles.";
export const ESTADOS_CONEXION = ["credenciales-pendientes", "pendiente", "verificada", "error"];

const sinAcentos = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "");

// Convención de nombres de secretos: la misma que secretos.mjs (nombreSecretoDeCuenta).
export function nombresSecretosSugeridos(id) {
  const sufijo = String(id).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return { tokenSecreto: `IG_ACCESS_TOKEN_${sufijo}`, usuarioIdSecreto: `IG_USER_ID_${sufijo}` };
}

export function idSugerido(texto) {
  return sinAcentos(texto).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function normalizarUsuario(u) {
  return `@${String(u || "").trim().replace(/^@+/, "")}`;
}

export function nombreIdioma(idioma) {
  return (IDIOMAS.find(([codigo]) => codigo === idioma) || [])[1] || idioma;
}

function zonaValida(zona) {
  try { new Intl.DateTimeFormat("es", { timeZone: zona }); return true; } catch { return false; }
}

// Errores de validación del formulario de cuenta (lista vacía = todo bien). Cada mensaje nombra su campo.
export function erroresDeCuenta(d, { idsExistentes = [], editando = false } = {}) {
  const e = [];
  const id = String(d.id || "").trim();
  if (!RE_ID_CUENTA.test(id)) e.push("id: solo minúsculas, dígitos y guiones, sin espacios (p. ej. nuevo-medio)");
  else if (!editando && idsExistentes.includes(id)) e.push(`id: "${id}" ya existe; elige otro identificador`);
  if (!String(d.nombre || "").trim()) e.push("nombre: el nombre visible es obligatorio");
  const usuario = String(d.usuario || "").trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9._]{2,30}$/.test(usuario)) e.push("usuario: escribe el usuario de Instagram (letras, números, puntos o guiones bajos)");
  if (!RE_IDIOMA.test(String(d.idioma || ""))) e.push("idioma: usa un código como es-PA o en");
  if (!zonaValida(String(d.zonaHoraria || ""))) e.push("zonaHoraria: zona horaria desconocida (p. ej. America/Panama)");
  const franjas = Array.isArray(d.franjas) ? d.franjas : [];
  if (!franjas.length) e.push("franjas: indica al menos una hora HH:MM");
  else if (franjas.some((h) => !RE_HORA.test(h))) e.push("franjas: cada hora debe tener el formato HH:MM (00:00 a 23:59)");
  else if (new Set(franjas).size !== franjas.length) e.push("franjas: hay horas repetidas");
  const colores = d.colores || {};
  for (const k of Object.keys(COLORES_POR_DEFECTO)) {
    if (!RE_COLOR.test(String(colores[k] || ""))) e.push(`colores.${k}: debe ser un color #RRGGBB`);
  }
  if (d.logoForma !== undefined && !LOGO_FORMAS.includes(d.logoForma)) e.push("logoForma: círculo o cuadrado");
  const tamano = Number(d.logoTamano ?? LOGO_TAMANO.porDefecto);
  if (!Number.isInteger(tamano) || tamano < LOGO_TAMANO.min || tamano > LOGO_TAMANO.max) e.push(`logoTamano: entero entre ${LOGO_TAMANO.min} y ${LOGO_TAMANO.max} píxeles`);
  const fuentes = Array.isArray(d.fuentes) ? d.fuentes : [];
  fuentes.forEach((f, i) => {
    const n = i + 1;
    if (!String(f.nombre || "").trim()) e.push(`fuentes: la fuente ${n} no tiene nombre`);
    if (!TIPOS_FUENTE.includes(f.tipo)) e.push(`fuentes: la fuente ${n} debe ser rss o portada`);
    if (!RE_URL.test(String(f.url || ""))) e.push(`fuentes: la fuente ${n} necesita una URL http(s)`);
    if (f.tipo === "portada") {
      if (!String(f.patronArticulo || "").trim()) e.push(`fuentes: la fuente ${n} (portada) necesita un patrón de URL de artículo`);
      else { try { new RegExp(f.patronArticulo); } catch { e.push(`fuentes: el patrón de la fuente ${n} no es una expresión regular válida`); } }
    }
  });
  if (d.ilustracionesActivo && !String(d.estiloIlustracion || "").trim()) e.push("estiloIlustracion: describe el estilo de las ilustraciones o desactívalas");
  return e;
}

// Línea editorial inicial (cuentas/<id>/editorial.md) a partir de temas, tono e idioma. El operador la puede reescribir.
export function plantillaEditorial({ nombre, usuario, temas = [], tono = "", idioma = IDIOMA_POR_DEFECTO }) {
  const listaTemas = (temas.length ? temas : ["(pendiente de definir)"]).map((t) => `- ${t}`).join("\n");
  return [
    `# Línea editorial de ${normalizarUsuario(usuario)}`,
    "",
    `Cuenta de ${String(nombre || "").trim()} en Instagram. Idioma: ${nombreIdioma(idioma)} (${idioma}).`,
    "",
    "## Qué se publica",
    listaTemas,
    "",
    "## Tono",
    String(tono || "").trim() || "Claro, sobrio y directo.",
    "",
    "## Reglas fijas",
    "- Cada post cita su fuente (medio y fecha) en el caption.",
    "- Hechos verificables; se distingue hecho de interpretación. No se inventan citas, cifras ni opiniones.",
    "- Nada de datos personales de terceros ni acusaciones sin sustento.",
    "- Sin personas reales reconocibles en las ilustraciones.",
    "",
  ].join("\n");
}

// Convierte los datos del formulario en cuentas/<id>/config.json. `base` es la configuración actual al editar:
// se conservan los campos que el formulario no toca (cupos, automatico, archivada, nombres de secretos declarados).
export function configDesdeFormulario(d, base = null) {
  const id = String(d.id || "").trim();
  const colores = { ...COLORES_POR_DEFECTO, ...(d.colores || {}) };
  const marca = {
    ...(base?.marca || {}),
    nombre: String(d.nombre || "").trim(),
    usuario: normalizarUsuario(d.usuario),
    lema: String(d.lema ?? base?.marca?.lema ?? "").trim(),
    logoForma: d.logoForma || base?.marca?.logoForma || LOGO_FORMAS[0],
    logoTamano: Number(d.logoTamano ?? base?.marca?.logoTamano ?? LOGO_TAMANO.porDefecto),
    colores,
  };
  const temas = (d.temas || []).map((t) => String(t).trim()).filter(Boolean);
  const config = {
    ...(base || {}),
    nombre: String(d.nombre || "").trim(),
    idioma: d.idioma || base?.idioma || IDIOMA_POR_DEFECTO,
    zonaHoraria: d.zonaHoraria || base?.zonaHoraria || ZONA_POR_DEFECTO,
    // Al crear, todo apagado; al editar se conserva exactamente lo que la cuenta declaraba (incluso nada).
    automatico: base ? base.automatico : { generar: false, publicar: false },
    marca,
    editorial: { temas, tono: String(d.tono || "").trim() },
    fuentes: (d.fuentes || []).map((f) => ({
      nombre: String(f.nombre || "").trim(), tipo: f.tipo, url: String(f.url || "").trim(),
      ...(f.tipo === "portada" ? { patronArticulo: String(f.patronArticulo || "").trim() } : {}),
      ...(Array.isArray(f.excluirSecciones) && f.excluirSecciones.length ? { excluirSecciones: f.excluirSecciones } : {}),
    })),
    generar: base?.generar ? { ...base.generar } : { ...GENERAR_POR_DEFECTO },
    franjas: [...(d.franjas || [])],
    ilustraciones: {
      ...(base?.ilustraciones || {}),
      activo: Boolean(d.ilustracionesActivo),
      estilo: String(d.estiloIlustracion || base?.ilustraciones?.estilo || ESTILO_ILUSTRACION_POR_DEFECTO).trim(),
      rotulo: String(d.rotulo ?? base?.ilustraciones?.rotulo ?? ""),
    },
    instagram: base?.instagram && (base.instagram.tokenSecreto || base.instagram.usuarioIdSecreto) ? { ...base.instagram } : nombresSecretosSugeridos(id),
  };
  return config;
}

// Lo inverso: datos del formulario a partir de cuentas/<id>/config.json (y el texto de editorial.md).
export function formularioDesdeConfig(id, c, editorialMd = "") {
  return {
    id,
    nombre: c.nombre || "",
    usuario: c.marca?.usuario || "",
    lema: c.marca?.lema || "",
    idioma: c.idioma || IDIOMA_POR_DEFECTO,
    zonaHoraria: c.zonaHoraria || ZONA_POR_DEFECTO,
    temas: [...(c.editorial?.temas || [])],
    tono: c.editorial?.tono || "",
    fuentes: (c.fuentes || []).map((f) => ({ ...f })),
    franjas: [...(c.franjas || [])],
    colores: { ...COLORES_POR_DEFECTO, ...(c.marca?.colores || {}) },
    logoForma: c.marca?.logoForma || LOGO_FORMAS[0],
    logoTamano: c.marca?.logoTamano || LOGO_TAMANO.porDefecto,
    ilustracionesActivo: c.ilustraciones?.activo !== false,
    estiloIlustracion: c.ilustraciones?.estilo || "",
    rotulo: c.ilustraciones?.rotulo ?? "",
    editorialMd,
  };
}

// Archivar: detiene las automatizaciones y marca la cuenta; posts, historial y configuración se conservan.
export function archivarCuenta(c, ahoraIso) {
  return { ...c, archivada: true, archivadaEn: ahoraIso, automatico: { generar: false, publicar: false } };
}

// Reactivar: la cuenta vuelve a aparecer como activa, con las automatizaciones apagadas hasta que el operador las encienda.
export function reactivarCuenta(c) {
  const { archivadaEn: _fecha, ...resto } = c;
  return { ...resto, archivada: false, automatico: { generar: false, publicar: false } };
}

export function cuentasActivas(cuentas) {
  return (cuentas || []).filter((c) => !c.archivada);
}

// Estado de conexión con Instagram que muestra el panel. Nunca se deduce "conectada" de tener usuario o secretos:
// solo lo dice una verificación de identidad (data/<cuenta>/conexion.json, escrito por Probar Instagram).
export function estadoConexion({ conexion = null, tokenInfo = null } = {}) {
  const c = conexion || {};
  if (c.estado === "verificada") {
    return { clave: "verificada", texto: `Identidad verificada${c.usuario ? ` (@${c.usuario})` : ""}${c.comprobado ? ` el ${String(c.comprobado).slice(0, 10)}` : ""}`, detalle: c.detalle || null };
  }
  if (c.estado === "error") {
    return { clave: "error", texto: `Error de conexión${c.detalle ? `: ${c.detalle}` : ""}`, detalle: c.detalle || null };
  }
  if (c.estado === "pendiente") {
    return { clave: "pendiente", texto: `Pendiente de verificación${c.solicitada ? ` (solicitada ${String(c.solicitada).slice(0, 16).replace("T", " ")} UTC)` : ""}`, detalle: null };
  }
  if (c.estado === "credenciales-pendientes") {
    return { clave: "credenciales-pendientes", texto: `Credenciales pendientes${c.detalle ? `: ${c.detalle}` : ""}`, detalle: c.detalle || null };
  }
  if (!conexion && tokenInfo && (tokenInfo.vence || tokenInfo.comprobado)) {
    return { clave: "pendiente", texto: "Pendiente de verificación (hay datos del token, pero la identidad no se ha comprobado)", detalle: null };
  }
  return { clave: "credenciales-pendientes", texto: "Credenciales pendientes", detalle: null };
}
