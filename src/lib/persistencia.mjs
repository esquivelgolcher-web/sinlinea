// Persistencia remota del estado de una entrega (multicanal, F1). El publicador guarda y SUBE el registro del intento
// antes de enviar nada a una red; si no puede subirlo, no publica (diseño §3.4). Todo pasa por git: pull --rebase,
// commit y push del archivo del post. Los commits del bot (GITHUB_TOKEN) no disparan otros workflows.
import { execFileSync } from "node:child_process";

// Sin remoto (pruebas locales, dry-run): todo "sale bien" sin hacer nada.
export function persistenciaLocal() {
  return { local: true, sincronizar: async () => ({ ok: true }), guardar: async () => ({ ok: true, sinCambios: true }), descartarLocal: async () => {} };
}

const RE_CONFLICTO = /^(UU|AA|DU|UD|AU|UA|DD) /;

export function crearPersistenciaGit({ raiz = process.cwd(), ejecutar = null, log = console, reintentos = 3 } = {}) {
  const git = ejecutar || ((args) => execFileSync("git", args, { cwd: raiz, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  const intentar = (args) => {
    try { return { ok: true, salida: String(git(args) ?? "") }; }
    catch (err) { return { ok: false, salida: `${err.stdout || ""}${err.stderr || err.message || ""}` }; }
  };
  const archivosEnConflicto = () => (intentar(["status", "--porcelain"]).salida || "").split(/\r?\n/).filter((l) => RE_CONFLICTO.test(l)).map((l) => l.slice(3).trim());

  // Trae los cambios del remoto (el panel escribe posts y configuración en cualquier momento). Si el rebase entra en
  // conflicto se aborta y se informa: la entrega afectada no se envía y los cambios del operador se conservan.
  async function sincronizar() {
    // --autostash: un archivo escrito y aún no confirmado (p. ej. esperasImagen) no impide traer el remoto.
    const r = intentar(["pull", "--rebase", "--autostash", "--quiet"]);
    if (r.ok) return { ok: true };
    const archivos = archivosEnConflicto();
    const conflicto = archivos.length > 0 || /conflict/i.test(r.salida);
    if (conflicto) intentar(["rebase", "--abort"]);
    log.warn(`Sincronización con el remoto fallida${conflicto ? ` (conflicto en ${archivos.join(", ") || "archivos"})` : ""}: ${r.salida.trim().slice(0, 300)}`);
    return { ok: false, conflicto, archivos, motivo: r.salida.trim().slice(0, 300) };
  }

  // Commit + push de las rutas indicadas. Ante un push rechazado se vuelve a sincronizar y se reintenta.
  async function guardar(rutas, mensaje) {
    const add = intentar(["add", "--", ...rutas]);
    if (!add.ok) return { ok: false, motivo: add.salida.trim() };
    if (intentar(["diff", "--cached", "--quiet"]).ok) return { ok: true, sinCambios: true };
    const commit = intentar(["commit", "--quiet", "-m", mensaje]);
    if (!commit.ok) return { ok: false, motivo: commit.salida.trim() };
    let ultimo = "";
    for (let i = 0; i < reintentos; i++) {
      const push = intentar(["push", "--quiet"]);
      if (push.ok) return { ok: true };
      ultimo = push.salida.trim();
      const s = await sincronizar();
      if (!s.ok) return { ok: false, conflicto: s.conflicto, motivo: s.motivo };
    }
    return { ok: false, motivo: `push rechazado tras ${reintentos} intentos: ${ultimo.slice(0, 200)}` };
  }

  // Deja la copia local exactamente como el remoto (descarta una reserva que no se pudo subir).
  async function descartarLocal() {
    const r = intentar(["reset", "--hard", "@{u}"]);
    if (!r.ok) log.warn(`No se pudo descartar el cambio local: ${r.salida.trim().slice(0, 200)}`);
  }

  return { local: false, sincronizar, guardar, descartarLocal };
}
