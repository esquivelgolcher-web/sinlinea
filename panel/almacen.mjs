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
    async solicitarVerificacion(cuenta) {
      const { res, j } = await json(await fetch(`/api/verificar-conexion?cuenta=${encodeURIComponent(cuenta)}`, { method: "POST" }));
      if (!res.ok) throw new Error(j.error || `No se pudo solicitar la verificación (HTTP ${res.status})`);
      return { ok: true, nota: "En local se marca como pendiente; el workflow Probar Instagram solo corre en GitHub." };
    },
  };
}

export function crearAlmacenGitHub({ token, owner, repo, rama = "main", fetchImpl = (...a) => fetch(...a) }) {
  const api = `https://api.github.com/repos/${owner}/${repo}`;
  const cabeceras = (extra = {}) => ({
    Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra,
  });
  async function leerArchivo(ruta) {
    const res = await fetchImpl(`${api}/contents/${ruta}?ref=${rama}`, { headers: cabeceras() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub respondió ${res.status} al leer ${ruta}`);
    const j = await res.json();
    return { texto: desdeBase64Utf8(j.content), sha: j.sha };
  }
  async function leerJson(ruta) {
    try { const a = await leerArchivo(ruta); return a ? JSON.parse(a.texto) : null; } catch { return null; }
  }
  async function subir(ruta, contentBase64, { sha = null, mensaje }) {
    const res = await fetchImpl(`${api}/contents/${ruta}`, {
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
  return {
    modo: "github",
    async listar() {
      const res = await fetchImpl(`${api}/contents/posts?ref=${rama}`, { headers: cabeceras() });
      if (!res.ok) throw new Error(`GitHub respondió ${res.status} al listar posts (¿token válido?)`);
      const entradas = (await res.json()).filter((e) => e.type === "file" && e.name.endsWith(".json"));
      return Promise.all(entradas.map(async (e) => {
        const r = await fetchImpl(`${api}/contents/posts/${e.name}?ref=${rama}`, { headers: cabeceras({ Accept: "application/vnd.github.raw+json" }) });
        if (!r.ok) throw new Error(`GitHub respondió ${r.status} al leer ${e.name}`);
        return { post: await r.json(), sha: e.sha };
      }));
    },
    async leerUno(id) {
      const a = await leerArchivo(`posts/${id}.json`);
      return a ? { post: JSON.parse(a.texto), sha: a.sha } : null;
    },
    async guardar(post, sha) {
      const res = await fetchImpl(`${api}/contents/posts/${post.id}.json`, {
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
    async escribirArchivo(ruta, texto, { sha = null, mensaje } = {}) {
      return subir(ruta, base64Utf8(texto), { sha, mensaje });
    },
    async escribirBinario(ruta, base64, { sha = null, mensaje } = {}) {
      return subir(ruta, base64, { sha, mensaje });
    },
    // Lista de cuentas leída en vivo del repositorio (config global + config de cada cuenta + estado de conexión).
    // La editorial se lee aparte, al abrir el formulario.
    async listarCuentas() {
      const g = await leerArchivo("config.json");
      if (!g) throw new Error("No se encontró config.json en el repositorio");
      const global = JSON.parse(g.texto);
      const cuentas = await Promise.all((global.cuentas || []).map(async (id) => {
        const dir = await fetchImpl(`${api}/contents/cuentas/${id}?ref=${rama}`, { headers: cabeceras() });
        if (!dir.ok) return { id, config: null, sha: null, editorialSha: null, logo: false, conexion: null, tokenInfo: null, error: `GitHub respondió ${dir.status} al leer cuentas/${id}` };
        const entradas = await dir.json();
        const nombres = new Set(entradas.map((e) => e.name));
        const cfg = await leerArchivo(`cuentas/${id}/config.json`);
        const [conexionArchivo, tokenInfo] = await Promise.all([leerArchivo(`data/${id}/conexion.json`).catch(() => null), leerJson(`data/${id}/token-info.json`)]);
        let conexion = null;
        try { conexion = conexionArchivo ? JSON.parse(conexionArchivo.texto) : null; } catch { conexion = null; }
        let config = null; let error = null;
        try { config = cfg ? JSON.parse(cfg.texto) : null; } catch (err) { error = `cuentas/${id}/config.json no es JSON válido (${err.message})`; }
        if (!cfg) error = `falta cuentas/${id}/config.json`;
        return { id, config, sha: cfg?.sha || null, editorialSha: entradas.find((e) => e.name === "editorial.md")?.sha || null, logo: nombres.has("logo.png"), conexion, conexionSha: conexionArchivo?.sha || null, tokenInfo, error };
      }));
      // Workflows de Instagram: el panel deduce de su `env` qué nombres de secretos ya llegan a las corridas.
      const workflows = await Promise.all(WORKFLOWS_INSTAGRAM.map((r) => leerArchivo(r).catch(() => null)));
      return { global, globalSha: g.sha, cuentas, workflows: { archivos: WORKFLOWS_INSTAGRAM.filter((_, i) => workflows[i]), textos: workflows.filter(Boolean).map((a) => a.texto) } };
    },
    // Marca la cuenta como pendiente y lanza el workflow "Probar Instagram" (workflow_dispatch) para esa cuenta.
    async solicitarVerificacion(cuenta, ahoraIso = new Date().toISOString()) {
      const ruta = `data/${cuenta}/conexion.json`;
      const actual = await leerArchivo(ruta);
      await subir(ruta, base64Utf8(PENDIENTE(ahoraIso)), { sha: actual?.sha || null, mensaje: `panel: verificación solicitada para ${cuenta}` });
      const res = await fetchImpl(`${api}/actions/workflows/probar-instagram.yml/dispatches`, {
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
