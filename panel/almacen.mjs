// Acceso a los posts y a los archivos de cuenta: modo local (serve.mjs) o GitHub (API de contenidos).
// Todo lo que se escribe pasa por bloqueo optimista (sha): si el archivo cambió (bot u otro panel), se avisa y no se pisa.
export function base64Utf8(texto) {
  const bytes = new TextEncoder().encode(texto);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function desdeBase64Utf8(b64) {
  const bin = atob(String(b64).replace(/\n/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function deducirRepo(loc) {
  const m = String(loc.hostname).match(/^([^.]+)\.github\.io$/);
  if (!m) return null;
  const repo = String(loc.pathname).split("/").filter(Boolean)[0];
  return repo ? { owner: m[1], repo } : null;
}

export class ErrorConflicto extends Error {
  constructor(actual) { super("El post cambió en el repositorio; se recargó la versión nueva."); this.actual = actual; }
}

// Conflicto al escribir un archivo de cuenta: `actual` trae { texto, sha } de la versión que hay ahora (o null si ya no existe).
export class ErrorConflictoArchivo extends Error {
  constructor(ruta, actual) {
    super(`${ruta} cambió en el repositorio desde que lo abriste (bot u otro panel). Revisa y vuelve a guardar.`);
    this.ruta = ruta;
    this.actual = actual;
  }
}

export const WORKFLOWS_INSTAGRAM = [".github/workflows/publicar.yml", ".github/workflows/probar-instagram.yml"];

// --- Límites de la API de GitHub (también con token: 5000 peticiones/hora por usuario y límites secundarios) ---
// Una respuesta 403 con x-ratelimit-remaining: 0 (límite primario) o 429 (límite secundario) indica que hay que esperar.
// Devuelve el instante (ms) en que se puede volver a consultar, o null si la respuesta no es un límite (un 403 sin esas
// cabeceras es un error de permiso normal). Solo se leen cabeceras; nunca cuerpos con valores.
export function limiteDeRespuesta(res, ahora = Date.now()) {
  if (!res || (res.status !== 403 && res.status !== 429)) return null;
  const cabecera = (k) => (typeof res.headers?.get === "function" ? res.headers.get(k) : null);
  const restantes = cabecera("x-ratelimit-remaining");
  const reinicio = Number(cabecera("x-ratelimit-reset"));
  const espera = Number(cabecera("retry-after"));
  if (res.status === 403 && restantes !== "0") return null;
  if (espera > 0) return ahora + espera * 1000;
  if (reinicio > 0) return reinicio * 1000;
  return ahora + 60_000;
}
const horaLocal = (ms) => new Date(ms).toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit", hour12: false });
export function mensajeLimite(reiniciaMs, { conToken = true } = {}) {
  if (!conToken) {
    return `Sin token, GitHub solo permite 60 consultas por hora desde esta conexión y ya se agotaron (cada carga del panel usa varias). Se reanudan a las ${horaLocal(reiniciaMs)}. `
      + "Pulsa Configurar y pega tu token del panel: con token el límite es de 5000 por hora.";
  }
  return `GitHub limitó las consultas de la API para este token (límite de peticiones). Se reanudan a las ${horaLocal(reiniciaMs)}; `
    + "hasta entonces el panel no vuelve a consultar. Evita recargar el panel muchas veces seguidas.";
}
export class ErrorLimiteApi extends Error {
  constructor(reiniciaMs, { conToken = true } = {}) {
    super(mensajeLimite(reiniciaMs, { conToken }));
    this.name = "ErrorLimiteApi";
    this.reinicia = new Date(reiniciaMs).toISOString();
  }
}
const PENDIENTE = (ahoraIso) => JSON.stringify({ estado: "pendiente", solicitada: ahoraIso }, null, 2) + "\n";

export function crearAlmacenLocal() {
  const json = async (res) => { const j = await res.json().catch(() => ({})); return { res, j }; };
  return {
    modo: "local",
    async listar() {
      const posts = await (await fetch("/api/posts")).json();
      return posts.map((post) => ({ post, sha: null }));
    },
    async leerUno(id) {
      const todos = await this.listar();
      return todos.find((x) => x.post.id === id) || null;
    },
    async guardar(post) {
      const res = await fetch(`/api/posts/${post.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(post) });
      if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
      return null;
    },
    async tokenInfo(cuenta) {
      try { return await (await fetch(`/api/token-info${cuenta ? `?cuenta=${encodeURIComponent(cuenta)}` : ""}`)).json(); } catch { return { vence: null }; }
    },
    // --- Panel maestro ---
    async listarCuentas() {
      const res = await fetch("/api/cuentas", { cache: "no-store" });
      if (!res.ok) throw new Error(`No se pudo leer la lista de cuentas (HTTP ${res.status})`);
      return res.json();
    },
    async leerArchivo(ruta) {
      const res = await fetch(`/api/archivo?ruta=${encodeURIComponent(ruta)}`, { cache: "no-store" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`No se pudo leer ${ruta} (HTTP ${res.status})`);
      return res.json();
    },
    async escribirArchivo(ruta, texto, { sha = null } = {}) {
      const { res, j } = await json(await fetch(`/api/archivo?ruta=${encodeURIComponent(ruta)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ texto, sha }) }));
      if (res.status === 409) throw new ErrorConflictoArchivo(ruta, j.sha ? { texto: j.texto, sha: j.sha } : null);
      if (!res.ok) throw new Error(j.error || `No se pudo guardar ${ruta} (HTTP ${res.status})`);
      return j.sha;
    },
    async escribirBinario(ruta, base64, { sha = null } = {}) {
      const { res, j } = await json(await fetch(`/api/archivo?ruta=${encodeURIComponent(ruta)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ base64, sha }) }));
      if (res.status === 409) throw new ErrorConflictoArchivo(ruta, j.sha ? { texto: null, sha: j.sha } : null);
      if (!res.ok) throw new Error(j.error || `No se pudo guardar ${ruta} (HTTP ${res.status})`);
      return j.sha;
    },
    // Varios archivos de una vez o ninguno (alta y edición de cuentas).
    async escribirArchivos(archivos, { mensaje = "" } = {}) {
      const { res, j } = await json(await fetch("/api/archivos", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ mensaje, archivos }) }));
      if (res.status === 409) throw new ErrorConflictoArchivo(j.ruta, j.sha ? { texto: j.texto ?? null, sha: j.sha } : null);
      if (!res.ok) throw new Error(j.error || `No se pudieron guardar los archivos (HTTP ${res.status})`);
      return { commit: null, shas: j.shas };
    },
    // Métricas (fase 1): archivos mensuales y estado de data/<cuenta>/metricas.
    async leerMetricas(cuenta) {
      const res = await fetch(`/api/metricas?cuenta=${encodeURIComponent(cuenta)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`No se pudieron leer las métricas de ${cuenta} (HTTP ${res.status})`);
      return res.json();
    },
    async solicitarVerificacion(cuenta) {
      const { res, j } = await json(await fetch(`/api/verificar-conexion?cuenta=${encodeURIComponent(cuenta)}`, { method: "POST" }));
      if (!res.ok) throw new Error(j.error || `No se pudo solicitar la verificación (HTTP ${res.status})`);
      return { ok: true, nota: "En local se marca como pendiente; el workflow Probar Instagram solo corre en GitHub." };
    },
  };
}

export function crearAlmacenGitHub({ token, owner, repo, rama = "main", fetchImpl = (...a) => fetch(...a), ahora = () => Date.now(), vidaMetadatosMs = 10 * 60 * 1000 }) {
  const api = `https://api.github.com/repos/${owner}/${repo}`;
  const cabeceras = (extra = {}) => ({
    Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra,
  });
  // Todas las peticiones pasan por aquí: si GitHub devolvió un límite, no se vuelve a llamar a la API hasta la hora de
  // reinicio (se falla en el acto con ErrorLimiteApi, sin gastar más peticiones) y el panel puede explicarlo.
  let limiteHasta = 0;
  const conToken = Boolean(token);
  const limiteActual = () => (limiteHasta > ahora() ? { reinicia: new Date(limiteHasta).toISOString(), mensaje: mensajeLimite(limiteHasta, { conToken }) } : null);
  async function pedir(url, opciones) {
    if (limiteHasta > ahora()) throw new ErrorLimiteApi(limiteHasta, { conToken });
    const res = await fetchImpl(url, opciones);
    const l = limiteDeRespuesta(res, ahora());
    if (l) { limiteHasta = l; throw new ErrorLimiteApi(l, { conToken }); }
    return res;
  }
  // Metadatos de secretos ya consultados (por nombres): las recargas del panel tras guardar, archivar o verificar no los
  // vuelven a pedir hasta que caducan (vidaMetadatosMs) o se piden frescos. Un límite de la API no se guarda.
  const metadatos = new Map();
  async function recordar(clave, frescos, consultar) {
    const guardado = metadatos.get(clave);
    if (!frescos && guardado && guardado.hasta > ahora()) return guardado.valor;
    const valor = await consultar();
    metadatos.set(clave, { valor, hasta: ahora() + vidaMetadatosMs });
    return valor;
  }
  async function leerArchivo(ruta) {
    const res = await pedir(`${api}/contents/${ruta}?ref=${rama}`, { headers: cabeceras() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub respondió ${res.status} al leer ${ruta}`);
    const j = await res.json();
    return { texto: desdeBase64Utf8(j.content), sha: j.sha };
  }
  async function leerJson(ruta) {
    try { const a = await leerArchivo(ruta); return a ? JSON.parse(a.texto) : null; } catch { return null; }
  }
  async function subir(ruta, contentBase64, { sha = null, mensaje }) {
    const res = await pedir(`${api}/contents/${ruta}`, {
      method: "PUT", headers: cabeceras({ "content-type": "application/json" }),
      body: JSON.stringify({ message: mensaje || `panel: ${ruta}`, content: contentBase64, ...(sha ? { sha } : {}), branch: rama }),
    });
    if (res.status === 409 || res.status === 422) {
      let actual = null;
      try { actual = await leerArchivo(ruta); } catch { /* sin versión actual */ }
      throw new ErrorConflictoArchivo(ruta, actual);
    }
    if (!res.ok) throw new Error(`GitHub respondió ${res.status} al guardar ${ruta} (¿el token tiene permiso de escritura en Contents?)`);
    return (await res.json()).content.sha;
  }
  const enviar = (ruta, metodo, cuerpo) => pedir(`${api}/${ruta}`, { method: metodo, headers: cabeceras({ "content-type": "application/json" }), body: JSON.stringify(cuerpo) });
  // Metadatos de secretos (nombre y fecha de actualización; nunca valores): permiten saber si un secreto cambió después
  // de la última verificación. Necesita el permiso Secrets (lectura) en el token; sin él no se afirma nada.
  async function leerSecretosActualizados(nombres, { frescos = false } = {}) {
    if (!token) return { disponible: false, actualizados: null };
    return recordar(`repo|${[...nombres].sort().join(",")}`, frescos, async () => {
      const actualizados = {};
      for (const n of nombres) {
        const res = await pedir(`${api}/actions/secrets/${n}`, { headers: cabeceras() });
        if (res.status === 404) { actualizados[n] = null; continue; }
        if (!res.ok) return { disponible: false, actualizados: null };
        actualizados[n] = (await res.json()).updated_at || null;
      }
      return { disponible: true, actualizados };
    });
  }
  // Secretos de un Environment (fase 2): mismos metadatos, endpoint de entornos. Permiso: Environments (lectura).
  async function leerSecretosDeEntorno(entorno, nombres, { frescos = false } = {}) {
    if (!token) return { disponible: false, actualizados: null };
    return recordar(`entorno|${entorno}|${[...nombres].sort().join(",")}`, frescos, async () => {
      const actualizados = {};
      for (const n of nombres) {
        const res = await pedir(`${api}/environments/${entorno}/secrets/${n}`, { headers: cabeceras() });
        if (res.status === 404) { actualizados[n] = null; continue; }
        if (!res.ok) return { disponible: false, actualizados: null };
        actualizados[n] = (await res.json()).updated_at || null;
      }
      return { disponible: true, actualizados };
    });
  }
  const sufijo = (id) => String(id).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const nombresDe = (id, config) => (config?.instagram?.origen === "entorno"
    ? { tokenSecreto: "IG_ACCESS_TOKEN", usuarioIdSecreto: "IG_USER_ID", entorno: `cuenta-${id}` }
    : {
      tokenSecreto: config?.instagram?.tokenSecreto || `IG_ACCESS_TOKEN_${sufijo(id)}`,
      usuarioIdSecreto: config?.instagram?.usuarioIdSecreto || `IG_USER_ID_${sufijo(id)}`,
    });
  // Varios archivos en UN solo commit (API de git: blobs → árbol → commit → ref), para que un alta no quede a medias.
  // `sha`: null = debe ser nuevo; texto = versión que se espera encontrar; undefined = sin comprobación (p. ej. el logo).
  // Si la rama avanzó entre la lectura y el commit (la ref no avanza en línea recta), se rehace todo sobre la punta nueva.
  async function escribirArchivos(archivos, { mensaje = "panel: cambios de cuenta" } = {}) {
    for (let intento = 0; intento < 3; intento++) {
      const ref = await pedir(`${api}/git/ref/heads/${rama}`, { headers: cabeceras() });
      if (!ref.ok) throw new Error(`GitHub respondió ${ref.status} al leer la rama ${rama}`);
      const head = (await ref.json()).object.sha;
      const commitBase = await pedir(`${api}/git/commits/${head}`, { headers: cabeceras() });
      if (!commitBase.ok) throw new Error(`GitHub respondió ${commitBase.status} al leer el commit ${head}`);
      const arbolBase = (await commitBase.json()).tree.sha;
      for (const a of archivos) {
        if (a.sha === undefined) continue;
        const res = await pedir(`${api}/contents/${a.ruta}?ref=${head}`, { headers: cabeceras() });
        if (!res.ok && res.status !== 404) throw new Error(`GitHub respondió ${res.status} al leer ${a.ruta}`);
        const actual = res.status === 404 ? null : await res.json();
        const version = actual ? { texto: actual.content ? desdeBase64Utf8(actual.content) : null, sha: actual.sha } : null;
        if (a.sha === null && version) throw new ErrorConflictoArchivo(a.ruta, version);
        if (a.sha && (version?.sha || null) !== a.sha) throw new ErrorConflictoArchivo(a.ruta, version);
      }
      const shas = {};
      const arbol = [];
      for (const a of archivos) {
        const blob = await enviar("git/blobs", "POST", a.base64 !== undefined ? { content: a.base64, encoding: "base64" } : { content: a.texto, encoding: "utf-8" });
        if (!blob.ok) throw new Error(`GitHub respondió ${blob.status} al subir ${a.ruta} (¿el token tiene permiso de escritura en Contents?)`);
        shas[a.ruta] = (await blob.json()).sha;
        arbol.push({ path: a.ruta, mode: "100644", type: "blob", sha: shas[a.ruta] });
      }
      const arbolRes = await enviar("git/trees", "POST", { base_tree: arbolBase, tree: arbol });
      if (!arbolRes.ok) throw new Error(`GitHub respondió ${arbolRes.status} al crear el árbol`);
      const commitRes = await enviar("git/commits", "POST", { message: mensaje, tree: (await arbolRes.json()).sha, parents: [head] });
      if (!commitRes.ok) throw new Error(`GitHub respondió ${commitRes.status} al crear el commit`);
      const commit = (await commitRes.json()).sha;
      const mover = await enviar(`git/refs/heads/${rama}`, "PATCH", { sha: commit, force: false });
      if (mover.status === 422 || mover.status === 409) continue; // la rama avanzó: se rehace sobre la punta nueva
      if (!mover.ok) throw new Error(`GitHub respondió ${mover.status} al actualizar la rama ${rama}`);
      return { commit, shas };
    }
    throw new Error(`La rama ${rama} cambió varias veces mientras se guardaba; vuelve a intentarlo.`);
  }
  return {
    modo: "github",
    async listar() {
      const res = await pedir(`${api}/contents/posts?ref=${rama}`, { headers: cabeceras() });
      if (!res.ok) throw new Error(`GitHub respondió ${res.status} al listar posts (¿token válido?)`);
      const entradas = (await res.json()).filter((e) => e.type === "file" && e.name.endsWith(".json"));
      return Promise.all(entradas.map(async (e) => {
        const r = await pedir(`${api}/contents/posts/${e.name}?ref=${rama}`, { headers: cabeceras({ Accept: "application/vnd.github.raw+json" }) });
        if (!r.ok) throw new Error(`GitHub respondió ${r.status} al leer ${e.name}`);
        return { post: await r.json(), sha: e.sha };
      }));
    },
    async leerUno(id) {
      const a = await leerArchivo(`posts/${id}.json`);
      return a ? { post: JSON.parse(a.texto), sha: a.sha } : null;
    },
    async guardar(post, sha) {
      const res = await pedir(`${api}/contents/posts/${post.id}.json`, {
        method: "PUT", headers: cabeceras({ "content-type": "application/json" }),
        body: JSON.stringify({ message: `panel: ${post.estado} ${post.id}`, content: base64Utf8(JSON.stringify(post, null, 2) + "\n"), sha, branch: rama }),
      });
      if (res.status === 409 || res.status === 422) throw new ErrorConflicto(await this.leerUno(post.id));
      if (!res.ok) throw new Error(`GitHub respondió ${res.status} al guardar (¿el token tiene permiso de escritura?)`);
      return (await res.json()).content.sha;
    },
    async tokenInfo(cuenta) {
      try { const a = await leerArchivo(cuenta ? `data/${cuenta}/token-info.json` : "data/token-info.json"); return a ? JSON.parse(a.texto) : { vence: null }; } catch { return { vence: null }; }
    },
    // --- Panel maestro ---
    leerArchivo,
    escribirArchivos,
    leerSecretosActualizados,
    leerSecretosDeEntorno,
    limiteActual,
    // Métricas (fase 1): una lista de la carpeta y solo los archivos de los dos últimos meses más estado.json (pocas
    // peticiones, con la misma caché y el mismo manejo de límites). Carpeta ausente = sin recogida, no un error.
    async leerMetricas(cuenta, { frescos = false } = {}) {
      return recordar(`metricas|${cuenta}`, frescos, async () => {
        const dir = await pedir(`${api}/contents/data/${cuenta}/metricas?ref=${rama}`, { headers: cabeceras() });
        if (dir.status === 404) return { archivos: {}, estado: null };
        if (!dir.ok) throw new Error(`GitHub respondió ${dir.status} al leer data/${cuenta}/metricas`);
        const entradas = (await dir.json()).filter((e) => e.type === "file");
        // Por tipo y por meses de calendario contados desde hoy: la cuenta se archiva por mes de consulta (los dos últimos
        // meses) y las publicaciones por mes de publicación (los cuatro últimos cubren la ventana de 90 días de la recogida).
        const mesesDesdeHoy = (n) => { const d = new Date(ahora()); return Array.from({ length: n }, (_, i) => { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)); return x.toISOString().slice(0, 7); }); };
        const existentes = new Set(entradas.map((e) => e.name));
        const nombres = [...mesesDesdeHoy(2).map((m) => `cuenta-${m}.json`), ...mesesDesdeHoy(4).map((m) => `publicaciones-${m}.json`)].filter((n) => existentes.has(n));
        const archivos = {};
        for (const n of nombres) {
          const a = await leerArchivo(`data/${cuenta}/metricas/${n}`);
          if (a) { try { archivos[n] = JSON.parse(a.texto); } catch { /* archivo ilegible: se omite */ } }
        }
        const estado = entradas.some((e) => e.name === "estado.json") ? await leerJson(`data/${cuenta}/metricas/estado.json`) : null;
        return { archivos, estado };
      });
    },
    async escribirArchivo(ruta, texto, { sha = null, mensaje } = {}) {
      return subir(ruta, base64Utf8(texto), { sha, mensaje });
    },
    async escribirBinario(ruta, base64, { sha = null, mensaje } = {}) {
      return subir(ruta, base64, { sha, mensaje });
    },
    // Lista de cuentas leída en vivo del repositorio (config global + config de cada cuenta + estado de conexión).
    // La editorial se lee aparte, al abrir el formulario.
    // `frescos: true` vuelve a consultar los metadatos de secretos aunque estén guardados (p. ej. tras guardar un secreto).
    async listarCuentas({ frescos = false } = {}) {
      const g = await leerArchivo("config.json");
      if (!g) throw new Error("No se encontró config.json en el repositorio");
      const global = JSON.parse(g.texto);
      const cuentas = await Promise.all((global.cuentas || []).map(async (id) => {
        const dir = await pedir(`${api}/contents/cuentas/${id}?ref=${rama}`, { headers: cabeceras() });
        if (!dir.ok) return { id, config: null, sha: null, editorialSha: null, logo: false, conexion: null, tokenInfo: null, error: `GitHub respondió ${dir.status} al leer cuentas/${id}` };
        const entradas = await dir.json();
        const nombres = new Set(entradas.map((e) => e.name));
        const cfg = await leerArchivo(`cuentas/${id}/config.json`);
        const [conexionArchivo, tokenInfo, metricasEstado] = await Promise.all([leerArchivo(`data/${id}/conexion.json`).catch(() => null), leerJson(`data/${id}/token-info.json`), leerJson(`data/${id}/metricas/estado.json`)]);
        let conexion = null;
        try { conexion = conexionArchivo ? JSON.parse(conexionArchivo.texto) : null; } catch { conexion = null; }
        let config = null; let error = null;
        try { config = cfg ? JSON.parse(cfg.texto) : null; } catch (err) { error = `cuentas/${id}/config.json no es JSON válido (${err.message})`; }
        if (!cfg) error = `falta cuentas/${id}/config.json`;
        return { id, config, sha: cfg?.sha || null, editorialSha: entradas.find((e) => e.name === "editorial.md")?.sha || null, logo: nombres.has("logo.png"), conexion, conexionSha: conexionArchivo?.sha || null, tokenInfo, metricasEstado, error };
      }));
      // Workflows de Instagram: el panel deduce de su `env` qué nombres de secretos ya llegan a las corridas.
      const workflows = await Promise.all(WORKFLOWS_INSTAGRAM.map((r) => leerArchivo(r).catch(() => null)));
      // Fechas de actualización de los secretos de cada cuenta (si el token puede leerlas), según su origen.
      const deRepo = cuentas.filter((c) => c.config && c.config.instagram?.origen !== "entorno");
      const nombres = [...new Set(deRepo.flatMap((c) => { const n = nombresDe(c.id, c.config); return [n.tokenSecreto, n.usuarioIdSecreto]; }))];
      // Lecturas opcionales: si fallan (sin permiso, o límite de la API) no se afirma nada sobre los secretos y la lista
      // se devuelve igual. Con límite, pedir() deja de llamar a la API en el acto, así que no se gastan más peticiones.
      const sinMetadatos = { disponible: false, actualizados: null };
      const meta = nombres.length ? await leerSecretosActualizados(nombres, { frescos }).catch(() => sinMetadatos) : sinMetadatos;
      for (const c of cuentas) {
        if (!c.config) { c.secretosActualizados = null; continue; }
        const n = nombresDe(c.id, c.config);
        if (n.entorno) {
          const m = limiteActual() ? sinMetadatos : await leerSecretosDeEntorno(n.entorno, [n.tokenSecreto, n.usuarioIdSecreto], { frescos }).catch(() => sinMetadatos);
          c.secretosActualizados = m.disponible ? m.actualizados : null;
        } else {
          c.secretosActualizados = meta.disponible ? { [n.tokenSecreto]: meta.actualizados[n.tokenSecreto] ?? null, [n.usuarioIdSecreto]: meta.actualizados[n.usuarioIdSecreto] ?? null } : null;
        }
      }
      return { global, globalSha: g.sha, cuentas, secretosLegibles: meta.disponible, limite: limiteActual(), workflows: { archivos: WORKFLOWS_INSTAGRAM.filter((_, i) => workflows[i]), textos: workflows.filter(Boolean).map((a) => a.texto) } };
    },
    // Marca la cuenta como pendiente y lanza el workflow "Probar Instagram" (workflow_dispatch) para esa cuenta.
    async solicitarVerificacion(cuenta, ahoraIso = new Date().toISOString()) {
      const ruta = `data/${cuenta}/conexion.json`;
      const actual = await leerArchivo(ruta);
      await subir(ruta, base64Utf8(PENDIENTE(ahoraIso)), { sha: actual?.sha || null, mensaje: `panel: verificación solicitada para ${cuenta}` });
      const res = await pedir(`${api}/actions/workflows/probar-instagram.yml/dispatches`, {
        method: "POST", headers: cabeceras({ "content-type": "application/json" }),
        body: JSON.stringify({ ref: rama, inputs: { cuenta } }),
      });
      if (res.status === 403 || res.status === 404 || res.status === 401) {
        throw new Error(`El token del panel no puede lanzar workflows (GitHub respondió ${res.status}): necesita el permiso Actions (lectura y escritura) además de Contents. Mientras tanto, lánzalo a mano: Actions → Probar Instagram → Run workflow con cuenta = ${cuenta}.`);
      }
      if (!res.ok) throw new Error(`GitHub respondió ${res.status} al lanzar Probar Instagram`);
      return { ok: true, nota: "Probar Instagram está en marcha; el resultado aparece aquí en unos minutos." };
    },
  };
}
