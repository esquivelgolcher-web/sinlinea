// Conexiones por red de una cuenta (multicanal: F1 Facebook, F2 Threads). Módulo isomorfo: sin imports de Node; aquí
// solo hay NOMBRES de secretos, nunca valores. Interruptores independientes (diseño §3.1):
// - Instagram sigue en automatico.publicar (mismo significado de siempre; no es maestro).
// - Cada red nueva tiene conexiones.<red>.publicar, que nace apagado.
// - automatico.pausa es la pausa general explícita: con true nada sale, y los interruptores conservan su valor.
export const REDES_CONEXION = ["facebook", "threads"];
export const SECRETOS_RED = Object.freeze({ facebook: ["FB_PAGE_TOKEN"], threads: ["THREADS_ACCESS_TOKEN"] });
export const SECRETOS_INSTAGRAM = Object.freeze(["IG_ACCESS_TOKEN", "IG_USER_ID"]);
// Identificador numérico de cada red: id de la página (Facebook) o id del perfil de Threads (distinto del de Instagram).
export const IDENTIFICADOR_RED = Object.freeze({ facebook: "pagina", threads: "usuario" });
// Campos extra opcionales por red: en Threads, el nombre de usuario esperado (se compara al verificar; nunca es el id).
export const CAMPOS_EXTRA_RED = Object.freeze({ facebook: [], threads: ["perfil"] });
export const NOMBRE_IDENTIFICADOR = Object.freeze({ facebook: "de la página", threads: "del perfil de Threads" });
const RE_ID_NUMERICO = /^\d+$/;
const RE_USUARIO_THREADS = /^@?[A-Za-z0-9._]{1,64}$/;

export function conexionDe(config, red) {
  const c = config?.conexiones?.[red] || {};
  const clave = IDENTIFICADOR_RED[red] || "usuario";
  const salida = { publicar: c.publicar === true, [clave]: String(c[clave] ?? "") };
  for (const extra of CAMPOS_EXTRA_RED[red] || []) salida[extra] = String(c[extra] ?? "");
  return salida;
}

export const pausaGeneral = (config) => config?.automatico?.pausa === true;

// Destinos con el interruptor encendido (sin mirar la pausa): Instagram y las redes declaradas.
export function destinosEncendidos(config) {
  const lista = [];
  if (config?.automatico?.publicar !== false) lista.push("instagram");
  for (const red of REDES_CONEXION) if (conexionDe(config, red).publicar) lista.push(red);
  return lista;
}

export const publicaAlgo = (config) => !pausaGeneral(config) && destinosEncendidos(config).length > 0;

export const identificadorDe = (config, red) => conexionDe(config, red)[IDENTIFICADOR_RED[red] || "usuario"];

// Nombres de secretos que el Environment cuenta-<id> debe tener: solo los de los destinos encendidos (o de las redes
// pedidas expresamente, p. ej. al probar una conexión apagada).
export function nombresSecretosEntorno(config, { redes = null } = {}) {
  const activas = redes || destinosEncendidos(config);
  const nombres = [];
  if (activas.includes("instagram")) nombres.push(...SECRETOS_INSTAGRAM);
  for (const red of REDES_CONEXION) if (activas.includes(red)) nombres.push(...SECRETOS_RED[red]);
  return nombres;
}

// Errores de validación del bloque `conexiones` (lista vacía = todo bien). Compartido por config.mjs y el panel.
export function erroresDeConexiones(conexiones) {
  const e = [];
  if (conexiones === undefined) return e;
  if (!conexiones || typeof conexiones !== "object" || Array.isArray(conexiones)) return ["conexiones debe ser un objeto { red: { publicar, pagina | usuario } }"];
  for (const [red, c] of Object.entries(conexiones)) {
    if (!REDES_CONEXION.includes(red)) { e.push(`conexiones: red "${red}" desconocida (${REDES_CONEXION.join(", ")})`); continue; }
    if (!c || typeof c !== "object") { e.push(`conexiones.${red} debe ser un objeto`); continue; }
    if (c.publicar !== undefined && typeof c.publicar !== "boolean") e.push(`conexiones.${red}.publicar debe ser true o false`);
    const clave = IDENTIFICADOR_RED[red];
    const valor = String(c[clave] ?? "");
    if (valor !== "" && !RE_ID_NUMERICO.test(valor)) e.push(`conexiones.${red}.${clave} debe ser el id numérico ${NOMBRE_IDENTIFICADOR[red]}`);
    else if (c.publicar === true && valor === "") e.push(`conexiones.${red}.${clave} es obligatorio para encender la publicación en ${red}`);
    if (red === "threads") {
      const perfil = String(c.perfil ?? "");
      if (perfil !== "" && !RE_USUARIO_THREADS.test(perfil)) e.push("conexiones.threads.perfil debe ser el nombre de usuario de Threads (letras, números, puntos o guiones bajos)");
    }
  }
  return e;
}
