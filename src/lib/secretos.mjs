// Convención de secretos y saneado de mensajes.
// Aquí solo se manejan NOMBRES de secretos y patrones para ocultar valores; nunca se
// registran ni se guardan valores. Los valores llegan por variables de entorno.

// Patrones de valores que jamás deben quedar en logs ni en posts/*.json.
const PATRONES_DE_VALORES = [
  /IGAA[A-Za-z0-9_-]{20,}/g,      // token de Instagram (Instagram Login)
  /EAA[A-Za-z0-9]{20,}/g,         // token de Facebook Graph
  /AIza[0-9A-Za-z_-]{35}/g,       // clave de Google (Gemini)
  /sk-ant-[A-Za-z0-9_-]{20,}/g,   // clave de Anthropic (Claude)
  /github_pat_[A-Za-z0-9_]{20,}/g, // token fino de GitHub
  /gh[pousr]_[A-Za-z0-9]{20,}/g,  // tokens clásicos de GitHub
];

export function ocultarSecretos(texto) {
  let t = String(texto ?? "");
  for (const patron of PATRONES_DE_VALORES) t = t.replace(patron, "[secreto]");
  return t.replace(/(access_token=)[^&\s"']+/gi, "$1[secreto]");
}

// Nombre válido de un secreto de GitHub Actions / variable de entorno.
export const PATRON_NOMBRE = /^[A-Z][A-Z0-9_]*$/;

export function esNombreDeSecreto(nombre) {
  return typeof nombre === "string" && PATRON_NOMBRE.test(nombre);
}

// Convención para cuentas adicionales: <BASE>_<ID DE LA CUENTA EN MAYÚSCULAS>.
export function nombreSecretoDeCuenta(base, idCuenta) {
  const sufijo = String(idCuenta).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `${base}_${sufijo}`;
}

export const NOMBRES_POR_DEFECTO = Object.freeze({ token: "IG_ACCESS_TOKEN", usuarioId: "IG_USER_ID" });

// Nombres de los secretos de Instagram que usa esta configuración (la cuenta actual
// conserva los nombres históricos si no declara otros).
export function nombresDeSecretos(config) {
  return {
    token: config?.instagram?.tokenSecreto || NOMBRES_POR_DEFECTO.token,
    usuarioId: config?.instagram?.usuarioIdSecreto || NOMBRES_POR_DEFECTO.usuarioId,
  };
}

// Lee los valores del entorno. Si falta alguno, el error nombra el secreto (nunca el valor).
export function leerSecretos(config, env = process.env) {
  const n = nombresDeSecretos(config);
  const valor = (k) => String(env[k] ?? "").trim();
  const faltan = [n.token, n.usuarioId].filter((k) => !valor(k));
  if (faltan.length) throw new Error(`Faltan los secretos: ${faltan.join(", ")} (Settings → Secrets and variables → Actions)`);
  return { token: valor(n.token), usuarioId: valor(n.usuarioId) };
}

// Lista de secretos que necesita la configuración, con su uso, para verificar y documentar.
export function secretosRequeridos(config) {
  const n = nombresDeSecretos(config);
  const publica = config?.automatico?.publicar !== false;
  return [
    { nombre: "ANTHROPIC_API_KEY", obligatorio: true, uso: "Claude: redacción (GENERAR) y acortado de textos y escenas (REGENERAR)" },
    { nombre: "GEMINI_API_KEY", obligatorio: Boolean(config?.ilustraciones?.activo), uso: "Gemini: ilustraciones de los posts" },
    { nombre: n.token, obligatorio: publica, uso: publica ? "Instagram: publicar y renovar el token" : "Instagram: publicar y renovar el token (publicación apagada: hace falta al activar automatico.publicar)" },
    { nombre: n.usuarioId, obligatorio: publica, uso: publica ? "Instagram: id de la cuenta profesional" : "Instagram: id numérico de la cuenta (publicación apagada: hace falta al activar automatico.publicar)" },
    { nombre: "GH_PAT", obligatorio: false, uso: "renovación automática del token de Instagram (renovar-token.yml)" },
  ];
}

export function verificarSecretos(env, requeridos) {
  const presente = (k) => Boolean(String(env?.[k] ?? "").trim());
  const presentes = requeridos.filter((r) => presente(r.nombre)).map((r) => r.nombre);
  const faltantes = requeridos.filter((r) => r.obligatorio && !presente(r.nombre)).map((r) => r.nombre);
  const opcionalesFaltantes = requeridos.filter((r) => !r.obligatorio && !presente(r.nombre)).map((r) => r.nombre);
  return { ok: faltantes.length === 0, presentes, faltantes, opcionalesFaltantes };
}
