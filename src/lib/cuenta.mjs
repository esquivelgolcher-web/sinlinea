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
  for (const k of ["tokenSecreto", "usuarioIdSecreto"]) {
    if (d[k] !== undefined && d[k] !== "" && !/^[A-Z][A-Z0-9_]*$/.test(String(d[k]))) e.push(`${k}: el nombre del secreto va en mayúsculas (A-Z, 0-9 y _), p. ej. IG_ACCESS_TOKEN_NUEVO_MEDIO`);
  }
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
    instagram: {
      tokenSecreto: String(d.tokenSecreto || "").trim() || base?.instagram?.tokenSecreto || nombresSecretosSugeridos(id).tokenSecreto,
      usuarioIdSecreto: String(d.usuarioIdSecreto || "").trim() || base?.instagram?.usuarioIdSecreto || nombresSecretosSugeridos(id).usuarioIdSecreto,
    },
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
    tokenSecreto: c.instagram?.tokenSecreto || nombresSecretosSugeridos(id).tokenSecreto,
    usuarioIdSecreto: c.instagram?.usuarioIdSecreto || nombresSecretosSugeridos(id).usuarioIdSecreto,
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

export const ESTADOS_CONEXION_PANEL = ["sin-verificar", "pendiente-configuracion", "credenciales-pendientes", "pendiente", "verificada", "error"];
export const DIAS_VERIFICACION_ANTIGUA = 7;

// Nombres de secretos efectivos de una cuenta: los declarados o, si no, los sugeridos a partir del id.
export function nombresSecretosDe(config, id = "") {
  const sugeridos = nombresSecretosSugeridos(id || "cuenta");
  return {
    tokenSecreto: config?.instagram?.tokenSecreto || sugeridos.tokenSecreto,
    usuarioIdSecreto: config?.instagram?.usuarioIdSecreto || sugeridos.usuarioIdSecreto,
  };
}

// "2026-09-08T20:20:00.000Z" → "2026-09-08 20:20" (UTC). Devuelve "" si no hay fecha válida.
export function fechaCortaUtc(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = new Date(t);
  const dos = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())} ${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}`;
}

function diasDesde(iso, ahora) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((ahora.getTime() - t) / 86400000);
}

// Nombres de secretos que un workflow expone por `env` como `NOMBRE: ${{ secrets.NOMBRE }}`.
export function secretosExpuestos(textoYml) {
  const nombres = new Set();
  const re = /^\s*([A-Z][A-Z0-9_]*):\s*\$\{\{\s*secrets\.([A-Z][A-Z0-9_]*)\s*\}\}\s*$/gm;
  let m;
  while ((m = re.exec(String(textoYml || ""))) !== null) nombres.add(m[1]);
  return [...nombres].sort();
}

// Nombres presentes en TODOS los workflows leídos (null si no se leyó ninguno: no se afirma nada).
export function secretosExpuestosComunes(listas) {
  if (!Array.isArray(listas) || !listas.length) return null;
  return listas.slice(1).reduce((acc, l) => acc.filter((n) => l.includes(n)), [...listas[0]]).sort();
}

// Estado de conexión con Instagram que muestra el panel. Nunca se deduce "conectada" de tener usuario o secretos: solo
// lo dice una verificación de identidad (data/<cuenta>/conexion.json, escrito por Probar Instagram). Reglas:
// - Si los secretos de la cuenta no llegan a los workflows (`expuestos` los conocidos), la conexión está pendiente de
//   configuración, haya o no verificación previa.
// - Una verificación deja de valer si cambió el usuario de Instagram o el nombre de los secretos.
// - Toda verificación muestra su fecha: un resultado pasado no garantiza que la conexión siga válida.
// - Sin ninguna verificación no se afirma que falten credenciales: solo que la conexión está sin verificar.
export function estadoConexion({ conexion = null, tokenInfo = null, config = null, id = "", expuestos = null, secretosActualizados = null, ahora = new Date() } = {}) {
  const nombres = nombresSecretosDe(config, id);
  const usuarioConfig = config?.marca?.usuario ? normalizarUsuario(config.marca.usuario).slice(1).toLowerCase() : null;
  if (Array.isArray(expuestos)) {
    const faltan = [nombres.tokenSecreto, nombres.usuarioIdSecreto].filter((n) => !expuestos.includes(n));
    if (faltan.length) {
      return {
        clave: "pendiente-configuracion",
        texto: "Conexión pendiente de configuración: sus secretos todavía no llegan a los workflows",
        detalle: `Falta exponer ${faltan.join(" y ")} en los workflows de Instagram (fase 2: entornos por cuenta). Hasta entonces la verificación no puede pasar.`,
        fecha: null, antigua: false,
      };
    }
  }
  const c = conexion || {};
  // Metadatos de los secretos en GitHub (fecha de actualización, nunca valores). Un valor nuevo con el mismo nombre
  // invalida la comprobación anterior; un secreto inexistente es una credencial pendiente comprobada con la API.
  const act = secretosActualizados && typeof secretosActualizados === "object" ? secretosActualizados : null;
  if (act) {
    const inexistentes = [nombres.tokenSecreto, nombres.usuarioIdSecreto].filter((n) => n in act && act[n] === null);
    if (inexistentes.length) {
      return { clave: "credenciales-pendientes", texto: `Credenciales pendientes: ${inexistentes.join(" y ")} no existe${inexistentes.length > 1 ? "n" : ""} en GitHub (comprobado ahora con la API)`, detalle: "Guarda el secreto en GitHub (Settings → Secrets and variables → Actions) y verifica la identidad.", fecha: null, antigua: false };
    }
    if ((c.estado === "verificada" || c.estado === "error") && c.comprobado) {
      const cambiados = [nombres.tokenSecreto, nombres.usuarioIdSecreto].filter((n) => act[n] && Date.parse(act[n]) > Date.parse(c.comprobado));
      if (cambiados.length) {
        return { clave: "pendiente", texto: `Pendiente de verificación: ${cambiados.map((n) => `${n} se actualizó el ${fechaCortaUtc(act[n])} UTC`).join(" y ")}, después de la comprobación del ${fechaCortaUtc(c.comprobado)} UTC; esa comprobación ya no vale para el valor nuevo`, detalle: "Verifica de nuevo la identidad con el secreto actualizado.", fecha: c.comprobado, antigua: true };
      }
    }
  }
  const sinMetadatos = act ? "" : " No se pudo comprobar si los secretos cambiaron después de la verificación: el token del panel necesita el permiso Secrets (lectura) para consultar sus fechas de actualización.";
  const fecha = c.comprobado || c.cambiado || c.solicitada || null;
  const cuando = fecha ? ` el ${fechaCortaUtc(fecha)} UTC` : "";
  if (c.estado === "verificada") {
    const usuarioVerificado = c.usuario ? String(c.usuario).replace(/^@/, "").toLowerCase() : null;
    if (usuarioConfig && usuarioVerificado && usuarioVerificado !== usuarioConfig) {
      return { clave: "pendiente", texto: `Pendiente de verificación: el usuario cambió (@${usuarioVerificado} → @${usuarioConfig}); la verificación${cuando} ya no vale`, detalle: "Verifica de nuevo la identidad antes de activar la publicación.", fecha, antigua: true };
    }
    if (c.secretos && (c.secretos.tokenSecreto !== nombres.tokenSecreto || c.secretos.usuarioIdSecreto !== nombres.usuarioIdSecreto)) {
      return { clave: "pendiente", texto: `Pendiente de verificación: los nombres de los secretos cambiaron; la verificación${cuando} ya no vale`, detalle: "Verifica de nuevo la identidad con los secretos nuevos.", fecha, antigua: true };
    }
    const dias = diasDesde(fecha, ahora);
    const antigua = dias !== null && dias > DIAS_VERIFICACION_ANTIGUA;
    return {
      clave: "verificada",
      texto: `Identidad verificada${c.usuario ? ` (@${String(c.usuario).replace(/^@/, "")})` : ""}${cuando}${dias !== null && dias >= 1 ? ` · hace ${dias} día${dias === 1 ? "" : "s"}` : ""}`,
      detalle: `Una verificación pasada no garantiza que la conexión siga válida: vuelve a verificar antes de activar la publicación o si cambian las credenciales.${sinMetadatos}`,
      fecha, antigua,
    };
  }
  if (c.estado === "error") {
    return { clave: "error", texto: `Error de conexión${cuando}${c.detalle ? `: ${c.detalle}` : ""}`, detalle: "Corrige el secreto en GitHub y vuelve a verificar la identidad; hasta entonces no actives la publicación.", fecha, antigua: false };
  }
  if (c.estado === "pendiente") {
    if (c.motivo === "cambio") {
      const ant = c.anterior?.comprobado ? ` (la verificación del ${fechaCortaUtc(c.anterior.comprobado)} UTC ya no vale)` : " (la verificación anterior ya no vale)";
      return { clave: "pendiente", texto: `Pendiente de verificación: el usuario o los secretos cambiaron${cuando}${ant}`, detalle: "Verifica de nuevo la identidad.", fecha, antigua: true };
    }
    return { clave: "pendiente", texto: `Pendiente de verificación${c.solicitada ? ` (solicitada el ${fechaCortaUtc(c.solicitada)} UTC)` : ""}`, detalle: null, fecha, antigua: false };
  }
  if (c.estado === "credenciales-pendientes") {
    return { clave: "credenciales-pendientes", texto: `Credenciales pendientes según Probar Instagram${cuando}${c.detalle ? `: ${c.detalle}` : ""}`, detalle: c.detalle || null, fecha, antigua: false };
  }
  if (!conexion && tokenInfo && (tokenInfo.vence || tokenInfo.comprobado)) {
    return { clave: "pendiente", texto: "Pendiente de verificación: hay datos del token, pero la identidad no se ha comprobado", detalle: null, fecha: null, antigua: false };
  }
  return { clave: "sin-verificar", texto: "Conexión sin verificar: no se ha comprobado la identidad (se desconoce si los secretos existen)", detalle: "Guarda los secretos en GitHub si aún no están y pulsa Verificar identidad.", fecha: null, antigua: false };
}
