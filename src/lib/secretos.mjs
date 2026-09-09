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

// Origen de las credenciales de Instagram de una cuenta (fase 2):
// - "repositorio" (modo actual): secretos de repositorio con el nombre declarado en instagram.tokenSecreto /
//   usuarioIdSecreto (o IG_ACCESS_TOKEN / IG_USER_ID si no declara ninguno).
// - "entorno" (Environment): secretos del entorno de GitHub `cuenta-<id>`, siempre llamados IG_ACCESS_TOKEN e IG_USER_ID.
// Cada cuenta declara su origen; no hay fallback de un origen al otro.
export const ORIGENES = Object.freeze(["repositorio", "entorno"]);

export function origenDeSecretos(config) {
  return config?.instagram?.origen === "entorno" ? "entorno" : "repositorio";
}

export function nombreEntorno(idCuenta) {
  return `cuenta-${idCuenta}`;
}

// Nombres de los secretos de Instagram que usa esta configuración. Con `porCuenta` (job por cuenta de los workflows)
// el job ya expuso las credenciales de la cuenta con los nombres fijos, sea cual sea el origen.
export function nombresDeSecretos(config, { porCuenta = false } = {}) {
  if (porCuenta || origenDeSecretos(config) === "entorno") return { ...NOMBRES_POR_DEFECTO };
  return {
    token: config?.instagram?.tokenSecreto || NOMBRES_POR_DEFECTO.token,
    usuarioId: config?.instagram?.usuarioIdSecreto || NOMBRES_POR_DEFECTO.usuarioId,
  };
}

// Texto explícito del modo de credenciales de una cuenta, para registros y resúmenes (solo nombres).
export function describirCredenciales(config, { porCuenta = false } = {}) {
  if (origenDeSecretos(config) === "entorno") return `Environment ${nombreEntorno(config?.cuenta)} (${NOMBRES_POR_DEFECTO.token}, ${NOMBRES_POR_DEFECTO.usuarioId})`;
  const n = nombresDeSecretos(config);
  return `modo actual: secretos del repositorio ${n.token} / ${n.usuarioId}${porCuenta ? ` (expuestos en el job como ${NOMBRES_POR_DEFECTO.token} / ${NOMBRES_POR_DEFECTO.usuarioId})` : ""}`;
}

// Lee los valores del entorno. Si falta alguno, el error nombra el secreto (nunca el valor) y, en modo Environment,
// el entorno donde debe estar. No se usan credenciales de otro origen.
export function leerSecretos(config, env = process.env, { porCuenta = false } = {}) {
  const n = nombresDeSecretos(config, { porCuenta });
  const valor = (k) => String(env[k] ?? "").trim();
  const faltan = [n.token, n.usuarioId].filter((k) => !valor(k));
  if (faltan.length) {
    if (origenDeSecretos(config) === "entorno") {
      throw new Error(`Faltan los secretos ${faltan.join(", ")} en el Environment ${nombreEntorno(config?.cuenta)} (Settings → Environments → ${nombreEntorno(config?.cuenta)} → Environment secrets). No se usan credenciales de otro origen.`);
    }
    throw new Error(`Faltan los secretos: ${faltan.join(", ")} (Settings → Secrets and variables → Actions)`);
  }
  return { token: valor(n.token), usuarioId: valor(n.usuarioId) };
}

// Lista de secretos que necesita la configuración, con su uso, para verificar y documentar.
export function secretosRequeridos(config, { porCuenta = false } = {}) {
  const n = nombresDeSecretos(config, { porCuenta });
  const publica = config?.automatico?.publicar !== false;
  const donde = origenDeSecretos(config) === "entorno" ? ` (Environment ${nombreEntorno(config?.cuenta)})` : "";
  return [
    { nombre: "ANTHROPIC_API_KEY", obligatorio: true, uso: "Claude: redacción (GENERAR) y acortado de textos y escenas (REGENERAR)" },
    { nombre: "GEMINI_API_KEY", obligatorio: Boolean(config?.ilustraciones?.activo), uso: "Gemini: ilustraciones de los posts" },
    { nombre: n.token, obligatorio: publica, uso: (publica ? "Instagram: publicar y renovar el token" : "Instagram: publicar y renovar el token (publicación apagada: hace falta al activar automatico.publicar)") + donde },
    { nombre: n.usuarioId, obligatorio: publica, uso: (publica ? "Instagram: id de la cuenta profesional" : "Instagram: id numérico de la cuenta (publicación apagada: hace falta al activar automatico.publicar)") + donde },
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
