// Acceso a los posts: modo local (serve.mjs) o GitHub (API de contenidos).
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

export function crearAlmacenLocal() {
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
  };
}

export function crearAlmacenGitHub({ token, owner, repo, rama = "main" }) {
  const api = `https://api.github.com/repos/${owner}/${repo}`;
  const cabeceras = (extra = {}) => ({
    Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra,
  });
  async function leerArchivo(ruta) {
    const res = await fetch(`${api}/contents/${ruta}?ref=${rama}`, { headers: cabeceras() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub respondió ${res.status} al leer ${ruta}`);
    const j = await res.json();
    return { texto: desdeBase64Utf8(j.content), sha: j.sha };
  }
  return {
    modo: "github",
    async listar() {
      const res = await fetch(`${api}/contents/posts?ref=${rama}`, { headers: cabeceras() });
      if (!res.ok) throw new Error(`GitHub respondió ${res.status} al listar posts (¿token válido?)`);
      const entradas = (await res.json()).filter((e) => e.type === "file" && e.name.endsWith(".json"));
      return Promise.all(entradas.map(async (e) => {
        const r = await fetch(`${api}/contents/posts/${e.name}?ref=${rama}`, { headers: cabeceras({ Accept: "application/vnd.github.raw+json" }) });
        if (!r.ok) throw new Error(`GitHub respondió ${r.status} al leer ${e.name}`);
        return { post: await r.json(), sha: e.sha };
      }));
    },
    async leerUno(id) {
      const a = await leerArchivo(`posts/${id}.json`);
      return a ? { post: JSON.parse(a.texto), sha: a.sha } : null;
    },
    async guardar(post, sha) {
      const res = await fetch(`${api}/contents/posts/${post.id}.json`, {
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
  };
}
