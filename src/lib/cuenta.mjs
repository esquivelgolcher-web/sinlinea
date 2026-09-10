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
  // Multicanal (F1): la página de Facebook se identifica por su id numérico; hace falta para encender esa conexión.
  const pagina = String(d.facebookPagina ?? "").trim();
  if (pagina && !/^\d+$/.test(pagina)) e.push("facebookPagina: el id de la página de Facebook es numérico");
  else if (d.facebookPublicar === true && !pagina) e.push("facebookPagina: indica el id numérico de la página para encender Facebook");
  // Multicanal (F2): el perfil de Threads por su id numérico (distinto del de Instagram) y, opcional, su nombre de usuario.
  const thUsuario = String(d.threadsUsuario ?? "").trim();
  if (thUsuario && !/^\d+$/.test(thUsuario)) e.push("threadsUsuario: el id del perfil de Threads es numérico");
  else if (d.threadsPublicar === true && !thUsuario) e.push("threadsUsuario: indica el id numérico del perfil de Threads para encender Threads");
  const thPerfil = String(d.threadsPerfil ?? "").trim().replace(/^@/, "");
  if (thPerfil && !/^[A-Za-z0-9._]{1,64}$/.test(thPerfil)) e.push("threadsPerfil: el nombre de usuario de Threads solo lleva letras, números, puntos o guiones bajos");
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
    // Interruptores: si el formulario los trae como booleanos, mandan; si no, al crear todo apagado y al editar se
    // conserva exactamente lo que la cuenta declaraba (incluso nada).
    automatico: typeof d.generar === "boolean" || typeof d.publicar === "boolean"
      ? { generar: d.generar === true, publicar: d.publicar === true }
      : (base ? base.automatico : { generar: false, publicar: false }),
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
      origen: d.origen === "entorno" || d.origen === "repositorio" ? d.origen : (base?.instagram?.origen === "entorno" ? "entorno" : "repositorio"),
      tokenSecreto: String(d.tokenSecreto || "").trim() || base?.instagram?.tokenSecreto || nombresSecretosSugeridos(id).tokenSecreto,
      usuarioIdSecreto: String(d.usuarioIdSecreto || "").trim() || base?.instagram?.usuarioIdSecreto || nombresSecretosSugeridos(id).usuarioIdSecreto,
    },
    // Recogida diaria de métricas: interruptor propio, apagado por defecto e independiente de automatico.*;
    // los límites declarados (maxLlamadas, ventanaDias…) se conservan tal cual.
    metricas: { ...(base?.metricas || {}), recoger: d.recogerMetricas === true },
  };
  // Multicanal (F1): pausa general explícita (solo se escribe cuando está activa) y conexiones por red. Instagram sigue
  // en automatico.publicar; Facebook en conexiones.facebook.publicar. No se inventa el bloque si no hay nada que declarar.
  if (config.automatico) {
    const auto = { ...config.automatico };
    if (d.pausa === true) auto.pausa = true;
    else if (d.pausa === false) delete auto.pausa;
    else if (base?.automatico?.pausa === true) auto.pausa = true;
    config.automatico = auto;
  }
  const conexiones = { ...(base?.conexiones || {}) };
  const fbBase = base?.conexiones?.facebook || null;
  const fbPagina = String(d.facebookPagina ?? fbBase?.pagina ?? "").trim();
  const fbPublicar = typeof d.facebookPublicar === "boolean" ? d.facebookPublicar : fbBase?.publicar === true;
  if (fbPagina || fbPublicar || fbBase) {
    conexiones.facebook = { ...(fbBase || {}), publicar: fbPublicar, ...(fbPagina ? { pagina: fbPagina } : {}) };
    if (!fbPagina) delete conexiones.facebook.pagina;
  } else {
    delete conexiones.facebook;
  }
  // F2: perfil de Threads (id numérico y nombre de usuario esperado, sin @). Vaciar un campo lo quita; nada se inventa.
  const thBase = base?.conexiones?.threads || null;
  const thUsuario = String(d.threadsUsuario ?? thBase?.usuario ?? "").trim();
  const thPerfil = String(d.threadsPerfil ?? thBase?.perfil ?? "").trim().replace(/^@/, "");
  const thPublicar = typeof d.threadsPublicar === "boolean" ? d.threadsPublicar : thBase?.publicar === true;
  if (thUsuario || thPerfil || thPublicar || thBase) {
    conexiones.threads = { ...(thBase || {}), publicar: thPublicar, ...(thUsuario ? { usuario: thUsuario } : {}), ...(thPerfil ? { perfil: thPerfil } : {}) };
    if (!thUsuario) delete conexiones.threads.usuario;
    if (!thPerfil) delete conexiones.threads.perfil;
  } else {
    delete conexiones.threads;
  }
  if (Object.keys(conexiones).length) config.conexiones = conexiones;
  else delete config.conexiones;
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
    origen: origenDe(c),
    tokenSecreto: c.instagram?.tokenSecreto || nombresSecretosSugeridos(id).tokenSecreto,
    usuarioIdSecreto: c.instagram?.usuarioIdSecreto || nombresSecretosSugeridos(id).usuarioIdSecreto,
    recogerMetricas: c.metricas?.recoger === true,
    generar: c.automatico?.generar !== false,
    publicar: c.automatico?.publicar !== false,
    pausa: c.automatico?.pausa === true,
    facebookPublicar: c.conexiones?.facebook?.publicar === true,
    facebookPagina: String(c.conexiones?.facebook?.pagina ?? ""),
    threadsPublicar: c.conexiones?.threads?.publicar === true,
    threadsUsuario: String(c.conexiones?.threads?.usuario ?? ""),
    threadsPerfil: String(c.conexiones?.threads?.perfil ?? ""),
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

export const ORIGENES_CREDENCIALES = ["repositorio", "entorno"];
export const NOMBRES_FIJOS = Object.freeze({ tokenSecreto: "IG_ACCESS_TOKEN", usuarioIdSecreto: "IG_USER_ID" });
export const nombreEntorno = (id) => `cuenta-${id}`;
export const origenDe = (config) => (config?.instagram?.origen === "entorno" ? "entorno" : "repositorio");

// Nombres de secretos efectivos de una cuenta y su origen. Modo Environment: nombres fijos en el entorno cuenta-<id>.
// Modo actual (repositorio): los declarados o, si no, los sugeridos a partir del id.
export function nombresSecretosDe(config, id = "") {
  if (origenDe(config) === "entorno") return { ...NOMBRES_FIJOS, origen: "entorno", entorno: nombreEntorno(id || "cuenta") };
  const sugeridos = nombresSecretosSugeridos(id || "cuenta");
  return {
    tokenSecreto: config?.instagram?.tokenSecreto || sugeridos.tokenSecreto,
    usuarioIdSecreto: config?.instagram?.usuarioIdSecreto || sugeridos.usuarioIdSecreto,
    origen: "repositorio",
  };
}

// Texto explícito del modo de credenciales de una cuenta (solo nombres).
export function describirOrigen(config, id = "") {
  const n = nombresSecretosDe(config, id);
  if (n.origen === "entorno") return `Environment ${n.entorno} (${n.tokenSecreto}, ${n.usuarioIdSecreto})`;
  return `modo actual: secretos del repositorio ${n.tokenSecreto} / ${n.usuarioIdSecreto}`;
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

// Fase 2: los workflows construyen un job por cuenta a partir de config.json; entonces cualquier cuenta declarada llega a
// las corridas por construcción y el "env" ya no dice nada por cuenta (solo se leen los nombres fijos).
export const MARCA_JOB_POR_CUENTA = "src/cuentas-activas.mjs";
export function workflowsPorCuenta(textosYml) {
  const lista = Array.isArray(textosYml) ? textosYml : [textosYml];
  return lista.length > 0 && lista.every((t) => String(t || "").includes(MARCA_JOB_POR_CUENTA));
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
  const enEntorno = nombres.origen === "entorno";
  if (act) {
    const inexistentes = [nombres.tokenSecreto, nombres.usuarioIdSecreto].filter((n) => n in act && act[n] === null);
    if (inexistentes.length && enEntorno) {
      return { clave: "pendiente-configuracion", texto: `Conexión pendiente de configuración: al Environment ${nombres.entorno} le falta ${inexistentes.join(" y ")} (comprobado ahora con la API)`, detalle: `Crea el Environment ${nombres.entorno} en GitHub (Settings → Environments) con los secretos IG_ACCESS_TOKEN e IG_USER_ID y verifica la identidad. Sin ellos el job de esta cuenta falla sin usar credenciales de otro origen.`, fecha: null, antigua: false };
    }
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
  const sinMetadatos = act ? "" : (enEntorno
    ? ` No se pudo comprobar el Environment ${nombres.entorno} ni si sus secretos cambiaron: el token del panel necesita el permiso Environments (lectura).`
    : " No se pudo comprobar si los secretos cambiaron después de la verificación: el token del panel necesita el permiso Secrets (lectura) para consultar sus fechas de actualización.");
  // Cambiar el origen de las credenciales (modo actual ↔ Environment) invalida la verificación anterior.
  if (c.estado === "verificada" && c.secretos && (c.secretos.origen || "repositorio") !== nombres.origen) {
    const cuandoV = c.comprobado ? ` el ${fechaCortaUtc(c.comprobado)} UTC` : "";
    return { clave: "pendiente", texto: `Pendiente de verificación: el origen de las credenciales cambió (${c.secretos.origen || "repositorio"} → ${nombres.origen}); la verificación${cuandoV} ya no vale`, detalle: "Verifica de nuevo la identidad con las credenciales del origen actual.", fecha: c.comprobado || null, antigua: true };
  }
  const fecha = c.comprobado || c.cambiado || c.solicitada || null;
  const cuando = fecha ? ` el ${fechaCortaUtc(fecha)} UTC` : "";
  if (c.estado === "verificada") {
    const usuarioVerificado = c.usuario ? String(c.usuario).replace(/^@/, "").toLowerCase() : null;
    if (usuarioConfig && usuarioVerificado && usuarioVerificado !== usuarioConfig) {
      return { clave: "pendiente", texto: `Pendiente de verificación: el usuario cambió (@${usuarioVerificado} → @${usuarioConfig}); la verificación${cuando} ya no vale`, detalle: "Verifica de nuevo la identidad antes de activar la publicación.", fecha, antigua: true };
    }
    if (c.secretos && nombres.origen === "repositorio" && (c.secretos.tokenSecreto !== nombres.tokenSecreto || c.secretos.usuarioIdSecreto !== nombres.usuarioIdSecreto)) {
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
    // "API access blocked." (code 200) no es un secreto malo: Meta bloqueó a la app hasta que quien la
    // administra confirme su cuenta en developers.facebook.com. Pedir cambiar el secreto despistaría.
    const bloqueoMeta = String(c.detalle || "").includes("API access blocked");
    const detalle = bloqueoMeta
      ? "Meta bloqueó el acceso de la app a la API (no es un problema del secreto): entra en developers.facebook.com con la cuenta que administra la app, atiende el aviso de confirmación de cuenta y vuelve a verificar la identidad; hasta entonces no actives la publicación."
      : "Corrige el secreto en GitHub y vuelve a verificar la identidad; hasta entonces no actives la publicación.";
    return { clave: "error", texto: `Error de conexión${cuando}${c.detalle ? `: ${c.detalle}` : ""}`, detalle, fecha, antigua: false };
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
  return {
    clave: "sin-verificar",
    texto: "Conexión sin verificar: no se ha comprobado la identidad (se desconoce si los secretos existen)",
    detalle: enEntorno
      ? `Guarda IG_ACCESS_TOKEN e IG_USER_ID en el Environment ${nombres.entorno} si aún no están y pulsa Verificar identidad.${act ? "" : " (El panel no pudo comprobar el Environment: el token necesita el permiso Environments (lectura).)"}`
      : "Guarda los secretos en GitHub si aún no están y pulsa Verificar identidad.",
    fecha: null, antigua: false,
  };
}

// --- Cierre del Panel Maestro: reglas para gestionar cuentas de principio a fin -------------------------------------
import { CATEGORIAS, VARIANTES, hashTexto } from "./estados.mjs";
import { claveMinuto } from "./fechas.mjs";
import { normalizarHashtags, recortarCaption } from "./caption.mjs";
import { validarTextos } from "./texto.mjs";

// Activación segura de la generación: hace falta línea editorial (editorial.md con contenido) y al menos una fuente.
export function requisitosGeneracion({ config, editorialMd = "" }) {
  const faltan = [];
  if (config?.archivada === true) faltan.push("la cuenta está archivada: reactívala antes de encender la generación");
  if (String(editorialMd || "").trim().length < 20) faltan.push("editorial.md está vacía o casi vacía: escribe la línea editorial que Claude debe seguir");
  const fuentes = Array.isArray(config?.fuentes) ? config.fuentes.filter((f) => f && RE_URL.test(String(f.url || ""))) : [];
  if (!fuentes.length) faltan.push("no hay ninguna fuente válida: añade al menos una (RSS o portada) con URL http(s)");
  return faltan;
}

// Activación segura de la publicación: identidad verificada para el usuario configurado (estadoConexion), sin error.
export function requisitosPublicacion({ config, id = "", conexion = null, tokenInfo = null, ahora = new Date() }) {
  const faltan = [];
  if (config?.archivada === true) faltan.push("la cuenta está archivada: reactívala antes de encender la publicación");
  const estado = estadoConexion({ conexion, tokenInfo, config, id, ahora });
  if (estado.clave === "verificada") return faltan;
  if (estado.clave === "error") faltan.push(`la conexión está en error (${estado.texto}); corrige el secreto en GitHub y vuelve a verificar la identidad`);
  else if (estado.clave === "pendiente" && /usuario cambió/.test(estado.texto)) faltan.push(`el usuario configurado no coincide con la identidad verificada (${estado.texto}); verifica de nuevo`);
  else faltan.push(`hace falta verificar la identidad de ${config?.marca?.usuario || "la cuenta"} con Probar Instagram (${estado.texto})`);
  return faltan;
}

// Programados de la cuenta cuya hora ya pasó: saldrían en la siguiente corrida al reactivar la publicación.
export function postsVencidos(posts, cuenta, ahoraIso) {
  const limite = Date.parse(ahoraIso);
  return (posts || [])
    .filter((p) => (p.cuenta || "sinlinea") === cuenta && p.estado === "programado" && Number.isFinite(Date.parse(p.programado)) && Date.parse(p.programado) <= limite)
    .sort((a, b) => Date.parse(a.programado) - Date.parse(b.programado));
}

// Guía de conexión: qué crear en GitHub y en Meta, con los nombres exactos y enlaces directos. Solo nombres.
export function guiaConexion({ config, id, owner = null, repo = null }) {
  const origen = origenDe(config);
  const nombres = nombresSecretosDe(config, id);
  const base = owner && repo ? `https://github.com/${owner}/${repo}` : null;
  const enlaces = {
    entornos: base ? `${base}/settings/environments` : null,
    nuevoEntorno: base ? `${base}/settings/environments/new` : null,
    secretosRepositorio: base ? `${base}/settings/secrets/actions/new` : null,
    probar: base ? `${base}/actions/workflows/probar-instagram.yml` : null,
    meta: "https://developers.facebook.com/apps/",
  };
  const usuario = config?.marca?.usuario || "@usuario";
  const pasos = [
    `En Meta for Developers (${enlaces.meta}): abre la app de Instagram, en Use cases → API setup with Instagram login añade ${usuario} como Instagram Tester (pestaña Roles) y pulsa Generate token en su fila. Copia el token: se muestra una sola vez.`,
  ];
  if (origen === "entorno") {
    pasos.push(`En GitHub → Settings → Environments → New environment, crea exactamente ${nombreEntorno(id)}.`);
    pasos.push(`Dentro de ${nombreEntorno(id)} → Add environment secret: ${NOMBRES_FIJOS.tokenSecreto} (pega el token) e ${NOMBRES_FIJOS.usuarioIdSecreto} (el id numérico de la cuenta profesional; si no lo conoces, Probar Instagram lo indica).`);
    pasos.push("Comprueba que el secreto GH_PAT existe en el repositorio (los jobs lo usan para confirmar por metadatos que el Environment está completo).");
  } else {
    pasos.push(`En GitHub → Settings → Secrets and variables → Actions → New repository secret, crea ${nombres.tokenSecreto} (pega el token) y ${nombres.usuarioIdSecreto} (el id numérico de la cuenta profesional).`);
  }
  pasos.push("Vuelve al panel y pulsa Verificar identidad: el workflow Probar Instagram comprueba usuario e id numérico y guarda el resultado aquí.");
  return { origen, entorno: origen === "entorno" ? nombreEntorno(id) : null, secretos: [nombres.tokenSecreto, nombres.usuarioIdSecreto], enlaces, pasos };
}

// Actividad por cuenta a partir de lo que ya se guarda (posts, conexión, estado de métricas). Sin datos: null, nunca fechas inventadas.
export function resumenActividad({ posts = [], cuenta, conexion = null, conexiones = null, metricasEstado = null }) {
  const propios = (posts || []).filter((p) => (p.cuenta || "sinlinea") === cuenta);
  const max = (valores) => valores.filter((v) => typeof v === "string" && Number.isFinite(Date.parse(v))).sort().pop() || null;
  const errores = [];
  for (const p of propios.filter((x) => x.estado === "error").sort((a, b) => String(b.error?.cuando || b.actualizado || "").localeCompare(String(a.error?.cuando || a.actualizado || "")))) {
    errores.push({ tipo: "post", id: p.id, cuando: p.error?.cuando || p.actualizado || null, texto: `${p.error?.paso ? `${p.error.paso}: ` : ""}${p.error?.mensaje || "error sin detalle"}` });
  }
  if (conexion?.estado === "error") errores.push({ tipo: "conexion", id: null, cuando: conexion.comprobado || null, texto: `conexión: ${conexion.detalle || "error"}` });
  for (const red of REDES_CONEXION) {
    const cx = conexiones?.[red]?.conexion || conexiones?.[red] || null;
    if (cx?.estado === "error") errores.push({ tipo: "conexion", id: red, cuando: cx.comprobado || null, texto: `conexión con ${NOMBRES_RED[red]}: ${cx.detalle || "error"}` });
  }
  return {
    ultimoBorrador: max(propios.map((p) => p.creado)),
    ultimaPublicacion: max(propios.map((p) => p.publicacion?.fecha)),
    ultimaRecogida: metricasEstado?.ultimaCorrida || null,
    errores,
  };
}

// Borrador manual desde el panel: el mismo post que crea src/borrador.mjs, construido sin Node (id con hora local,
// cuenta y medio; sin imagen: REGENERAR la dibuja en la siguiente corrida).
const slugSimple = (texto, max = 12) => String(texto || "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/g, "") || "medio";
export function borradorDesdeFormulario(entrada, { cuenta, zona = ZONA_POR_DEFECTO, ahora = new Date(), variante = null, ilustracionesActivas = false, postsExistentes = [] }) {
  if (!CATEGORIAS.includes(entrada.categoria)) throw new Error(`categoría "${entrada.categoria}" no permitida (${CATEGORIAS.join(", ")})`);
  const v = validarTextos({ titular: entrada.titular, bajada: entrada.bajada });
  if (!v.ok) throw new Error(v.errores.join(" "));
  const f = entrada.fuente || {};
  if (!String(f.medio || "").trim() || !RE_URL.test(String(f.url || "")) || !Number.isFinite(Date.parse(f.publicado))) throw new Error("fuente: indica medio, URL http(s) y fecha de publicación");
  const propios = (postsExistentes || []).filter((p) => (p.cuenta || "sinlinea") === cuenta);
  let elegida = VARIANTES.includes(variante) ? variante : VARIANTES[0];
  if (!VARIANTES.includes(variante) && propios.length) {
    const ultimo = propios.reduce((a, b) => (String(b.creado) >= String(a.creado) ? b : a));
    elegida = VARIANTES[(VARIANTES.indexOf(ultimo.variante) + 1) % VARIANTES.length];
  }
  const r = recortarCaption({ caption: String(entrada.caption || ""), medio: f.medio, hashtags: entrada.hashtags || [] });
  const iso = ahora.toISOString();
  const escena = String(entrada.escena || "").trim();
  return {
    id: `${claveMinuto(ahora, zona)}-${cuenta}-${slugSimple(f.medio)}-${hashTexto(f.url).slice(0, 4)}`,
    cuenta,
    estado: "borrador",
    fuente: { medio: String(f.medio).trim(), url: String(f.url).trim(), titulo: String(f.titulo || entrada.titular).trim(), publicado: new Date(Date.parse(f.publicado)).toISOString() },
    categoria: entrada.categoria,
    titular: String(entrada.titular).trim(),
    bajada: String(entrada.bajada).trim(),
    caption: r.caption,
    hashtags: normalizarHashtags(r.hashtags),
    variante: elegida,
    imagen: null,
    ilustracion: escena ? { descripcion: escena, usar: Boolean(ilustracionesActivas), ruta: null, hashDescripcion: null, proveedor: null, modelo: null, generada: null, error: null } : null,
    programado: null,
    publicacion: null,
    error: null,
    creado: iso,
    actualizado: iso,
  };
}

// --- Multicanal: conexiones por red (F1 Facebook, F2 Threads) ---------------------------------------------------------
import { REDES_CONEXION, SECRETOS_RED, IDENTIFICADOR_RED, conexionDe, identificadorDe } from "./conexiones.mjs";
import { NOMBRES_RED } from "./destinos.mjs";

// Cómo se nombra lo que identifica cada red en los textos del panel.
const SUJETO_RED = Object.freeze({
  facebook: { que: "página", articulo: "la", del: "de la", verificado: "verificada" },
  threads: { que: "perfil de Threads", corto: "perfil", articulo: "el", del: "del", verificado: "verificado" },
});
const sujetoDe = (red) => SUJETO_RED[red] || { que: "perfil", corto: "perfil", articulo: "el", del: "del", verificado: "verificado" };

// Redes con conexión propia de una cuenta, con su interruptor e identificador público (para tarjetas y formulario).
export function conexionesDeCuenta(config) {
  return REDES_CONEXION.map((red) => ({ red, nombre: NOMBRES_RED[red], publicar: conexionDe(config, red).publicar, identificador: identificadorDe(config, red) }));
}

// Estado de conexión de una red nueva (data/<cuenta>/conexion-<red>.json, escrito por Probar destino). Mismas reglas que
// Instagram: nunca se deduce "conectada" de tener secretos; toda verificación muestra su fecha; si cambia la página, la
// verificación anterior deja de valer. Las redes nuevas solo existen en modo Environment.
export function estadoConexionRed({ conexion = null, config = null, id = "", red, ahora = new Date() } = {}) {
  const nombre = NOMBRES_RED[red] || red;
  const secreto = (SECRETOS_RED[red] || [])[0] || "";
  if (origenDe(config) !== "entorno") {
    return { clave: "pendiente-configuracion", texto: `${nombre}: pendiente de configuración (las conexiones nuevas solo existen en modo Environment)`, detalle: `Cambia el origen de las credenciales de la cuenta a Environment ${nombreEntorno(id || "cuenta")} y verifica de nuevo Instagram; después podrás conectar ${nombre}.`, fecha: null, antigua: false };
  }
  // Un registro de otra red (p. ej. el de Facebook leído por error para Threads) no vale como verificación.
  const c = conexion && (!conexion.red || conexion.red === red) ? conexion : {};
  const s = sujetoDe(red);
  const fecha = c.comprobado || c.solicitada || null;
  const cuando = fecha ? ` el ${fechaCortaUtc(fecha)} UTC` : "";
  const esperado = identificadorDe(config, red);
  if (c.estado === "verificada") {
    const idVerificado = c.identidad?.id ? String(c.identidad.id) : "";
    if (esperado && idVerificado && idVerificado !== String(esperado)) {
      return { clave: "pendiente", texto: `${nombre}: pendiente de verificación: ${s.articulo} ${s.corto || s.que} cambió (${idVerificado} → ${esperado}); la verificación${cuando} ya no vale`, detalle: `Verifica de nuevo ${nombre} con ${s.articulo} ${s.corto || s.que} actual.`, fecha, antigua: true };
    }
    const dias = diasDesde(fecha, ahora);
    const antigua = dias !== null && dias > DIAS_VERIFICACION_ANTIGUA;
    return {
      clave: "verificada",
      texto: `${nombre}: ${s.corto || s.que} «${c.identidad?.nombre || esperado || "?"}» (${idVerificado || esperado || "?"}) ${s.verificado}${cuando}${dias !== null && dias >= 1 ? ` · hace ${dias} día${dias === 1 ? "" : "s"}` : ""}`,
      detalle: `Una verificación pasada no garantiza que la conexión siga válida: vuelve a verificar antes de encender ${nombre} o si cambia el token.`,
      fecha, antigua,
    };
  }
  if (c.estado === "error") return { clave: "error", texto: `${nombre}: error de conexión${cuando}${c.detalle ? `: ${c.detalle}` : ""}`, detalle: `Revisa el secreto ${secreto} en el Environment ${nombreEntorno(id || "cuenta")} y vuelve a verificar; hasta entonces no enciendas ${nombre}.`, fecha, antigua: false };
  if (c.estado === "credenciales-pendientes") return { clave: "credenciales-pendientes", texto: `${nombre}: credenciales pendientes${cuando}${c.detalle ? `: ${c.detalle}` : ""}`, detalle: c.detalle || null, fecha, antigua: false };
  if (c.estado === "pendiente") return { clave: "pendiente", texto: `${nombre}: pendiente de verificación${c.solicitada ? ` (solicitada el ${fechaCortaUtc(c.solicitada)} UTC)` : ""}`, detalle: null, fecha, antigua: false };
  return { clave: "sin-verificar", texto: `${nombre}: conexión sin verificar`, detalle: `Guarda ${secreto} en el Environment ${nombreEntorno(id || "cuenta")} y pulsa Verificar ${nombre}. Nace apagada: la enciendes cuando esté verificada.`, fecha: null, antigua: false };
}

// Activación segura de una red nueva: página declarada e identidad verificada para esa página.
export function requisitosPublicacionRed({ config, id = "", red, conexion = null, ahora = new Date() }) {
  const nombre = NOMBRES_RED[red] || red;
  const faltan = [];
  if (config?.archivada === true) faltan.push(`la cuenta está archivada: reactívala antes de encender ${nombre}`);
  const s = sujetoDe(red);
  if (!identificadorDe(config, red)) faltan.push(`falta el id ${s.del} ${s.que} (conexiones.${red}.${IDENTIFICADOR_RED[red] || "usuario"}): guárdalo en el formulario de la cuenta`);
  const estado = estadoConexionRed({ conexion, config, id, red, ahora });
  if (estado.clave !== "verificada") faltan.push(`hace falta verificar la conexión con ${nombre} con el workflow Probar destino (${estado.texto})`);
  return faltan;
}

// Guía de conexión de una red nueva: pasos externos (Meta y GitHub) con nombres exactos y enlaces. Solo nombres; ningún
// token pasa por el panel ni por inputs de workflows (diseño §6).
export function guiaConexionRed({ config, id, red, owner = null, repo = null }) {
  const base = owner && repo ? `https://github.com/${owner}/${repo}` : null;
  const entorno = nombreEntorno(id);
  const secretos = [...(SECRETOS_RED[red] || [])];
  const enlaces = {
    entorno: base ? `${base}/settings/environments` : null,
    nuevoEntorno: base ? `${base}/settings/environments/new` : null,
    probar: base ? `${base}/actions/workflows/probar-destino.yml` : null,
    meta: "https://developers.facebook.com/apps/",
    explorador: "https://developers.facebook.com/tools/explorer/",
    depurador: "https://developers.facebook.com/tools/debug/accesstoken/",
    threads: "https://www.threads.com/settings/account",
    docsThreads: "https://developers.facebook.com/docs/threads/get-started",
  };
  const pagina = identificadorDe(config, red) || "(id de la página)";
  const perfilTh = conexionDe(config, "threads").perfil ? `@${String(conexionDe(config, "threads").perfil).replace(/^@/, "")}` : "de Threads de esta cuenta";
  const pasos = red === "threads" ? [
    "Ten el perfil de Threads de la cuenta (va unido a su cuenta de Instagram) y una sesión abierta con él en threads.com o en la app.",
    "En Meta for Developers, en la app de esta cuenta: Casos de uso → Añadir caso de uso → «Access the Threads API». Meta crea un Threads App ID propio y pide los permisos threads_basic y threads_content_publish (Customize → añádelos si no están).",
    `App roles → Roles → Add People → rol Threads Tester (lista Threads Testers): invita al perfil ${perfilTh}. Después acepta la invitación desde la app de Threads del teléfono: Configuración → Cuenta → Permisos de sitios web (Website permissions) → Invitaciones (en la web solo aparece «Suprimir»).`,
    "De vuelta en la app: Casos de uso → Access the Threads API → Customize → Settings → «User Token Generator»: junto al perfil aceptado pulsa Generate Access Token, confirma con la sesión de Threads y copia el token (de larga duración, 60 días; el workflow Renovar token lo refresca cada lunes). Solo funciona con perfiles públicos.",
    `En GitHub → Settings → Environments → ${entorno} → Add environment secret: ${secretos[0]} (pega ahí el token). Aquí no se guardan valores, solo el nombre.`,
    `Lanza Actions → Probar destino → Run workflow con cuenta = ${id} y red = threads (o pulsa Verificar Threads en la tarjeta). Si aún no guardaste el id numérico del perfil (es distinto del id de Instagram), el resultado lo muestra: guárdalo con el nombre de usuario en el formulario de la cuenta (apartado «Perfil de Threads») y repite la verificación.`,
    "Con la identidad verificada, enciende Threads desde la tarjeta. Es independiente de Instagram y Facebook: se puede publicar solo en Threads. El texto de Threads admite 500 caracteres (los emojis cuentan por sus bytes): si una versión excede, el panel la bloquea y nunca la recorta.",
  ] : red === "facebook" ? [
    "Ten una página de Facebook y sé su administrador (Meta Business Suite → Páginas). Si la marca no tiene página, créala.",
    "En Meta for Developers, en la app de tipo empresa de esta cuenta: Casos de uso → añade «Facebook Login for Business» si no está y crea una configuración con tipo de token «Usuario» y permisos pages_show_list, pages_manage_posts y pages_read_engagement.",
    "En el Explorador de la API Graph (herramienta oficial, con tu sesión de administrador): elige la app, marca esos tres permisos y pulsa Generar token de acceso.",
    "En la Herramienta de depuración de tokens pega ese token y pulsa «Ampliar token de acceso» (Extend Access Token) para obtener el de larga duración.",
    `De vuelta en el Explorador, con el token ampliado, consulta me/accounts: verás cada página con su id y su access_token (token de página, que no caduca). Copia el id de tu página (en el panel: ${pagina}) y su token.`,
    `En GitHub → Settings → Environments → ${entorno} → Add environment secret: ${secretos[0]} (pega el token de página). Aquí no se guardan valores, solo el nombre.`,
    `Guarda el id de la página en el formulario de la cuenta y lanza Actions → Probar destino → Run workflow con cuenta = ${id} y red = facebook (o pulsa Verificar Facebook en la tarjeta). Con la identidad verificada, enciende Facebook desde la tarjeta.`,
  ] : [];
  return { red, entorno, secretos, enlaces, pasos };
}
