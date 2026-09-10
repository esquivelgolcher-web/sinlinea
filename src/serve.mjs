// Servidor local de previsualización: plantilla, panel (modo local), API de posts y API de cuentas del panel maestro.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { cargarConfiguracion, cargarGlobal, resumenParaPanel, validarGlobal, validarCuenta } from "./lib/config.mjs";
import { leerPosts, escribirPost, validarPost, CUENTA_LEGADO } from "./lib/posts.mjs";
import { construirHtml, RUTA_PLANTILLA, RUTA_LOGO } from "./lib/render.mjs";
import { VARIANTES } from "./lib/estados.mjs";
import { secretosExpuestos, secretosExpuestosComunes, workflowsPorCuenta } from "./lib/cuenta.mjs";
import { REDES_CONEXION } from "./lib/conexiones.mjs";

// Workflows que exponen los secretos de Instagram: el panel deduce de ellos si una cuenta nueva ya puede verificarse.
export const WORKFLOWS_INSTAGRAM = [".github/workflows/publicar.yml", ".github/workflows/probar-instagram.yml"];
export function leerWorkflows(raiz) {
  const textos = WORKFLOWS_INSTAGRAM.map((r) => path.join(raiz, ...r.split("/"))).filter((r) => fs.existsSync(r)).map((r) => fs.readFileSync(r, "utf8"));
  const porCuenta = textos.length > 0 && workflowsPorCuenta(textos);
  return {
    archivos: WORKFLOWS_INSTAGRAM.filter((r) => fs.existsSync(path.join(raiz, ...r.split("/")))),
    porCuenta, // fase 2: un job por cuenta desde config.json; el env ya no limita qué cuentas llegan
    expuestos: porCuenta ? null : secretosExpuestosComunes(textos.map(secretosExpuestos)),
  };
}

const TIPOS = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png",
  ".ttf": "font/ttf", ".svg": "image/svg+xml",
};

// Archivos que el panel maestro puede leer y escribir en local (misma lista que las rutas que edita en GitHub).
const RE_ARCHIVO_CUENTA = /^cuentas\/([a-z0-9][a-z0-9-]*)\/(config\.json|editorial\.md|logo\.png)$/;
const RE_CONEXION = /^data\/([a-z0-9][a-z0-9-]*)\/conexion(-[a-z]+)?\.json$/; // conexion.json (Instagram) y conexion-<red>.json
export function rutaPermitida(ruta) {
  return ruta === "config.json" || RE_ARCHIVO_CUENTA.test(ruta) || RE_CONEXION.test(ruta);
}

// Sha de blob de git (lo mismo que devuelve la API de contenidos de GitHub): sirve de bloqueo optimista en local.
export function shaDeBlob(contenido) {
  const buf = Buffer.isBuffer(contenido) ? contenido : Buffer.from(String(contenido), "utf8");
  return crypto.createHash("sha1").update(`blob ${buf.length}\0`).update(buf).digest("hex");
}

// Diario de escritura del lote local. Garantía real en local: NO hay atomicidad del sistema de archivos, hay recuperación
// garantizada. El lote completo se escribe primero en el diario (temp/escritura-pendiente.json) y luego se aplica archivo
// a archivo (escritura en .tmp + renombrado, así nunca queda un archivo truncado). Si el proceso muere entre medias, la
// siguiente arrancada del servidor (o la siguiente petición de cuentas/lote) vuelve a aplicar el lote entero, que es
// idempotente, y borra el diario. En GitHub el lote es un único commit: ahí sí es atómico.
export const RUTA_DIARIO = "temp/escritura-pendiente.json";
const rutaAbsoluta = (raiz, ruta) => path.join(raiz, ...ruta.split("/"));
function escribirAtomico(absoluta, contenido) {
  fs.mkdirSync(path.dirname(absoluta), { recursive: true });
  const tmp = `${absoluta}.tmp`;
  fs.writeFileSync(tmp, contenido);
  fs.renameSync(tmp, absoluta);
}
export function aplicarLote(raiz, archivos) {
  for (const a of archivos) escribirAtomico(rutaAbsoluta(raiz, a.ruta), Buffer.from(a.base64, "base64"));
}
export function recuperarEscrituraPendiente(raiz, log = console) {
  const ruta = rutaAbsoluta(raiz, RUTA_DIARIO);
  if (!fs.existsSync(ruta)) return null;
  let diario;
  try {
    diario = JSON.parse(fs.readFileSync(ruta, "utf8"));
  } catch (err) {
    fs.renameSync(ruta, `${ruta}.corrupto`);
    const error = `El diario de escritura estaba corrupto (${err.message}); se apartó como ${RUTA_DIARIO}.corrupto y no se aplicó nada`;
    log.warn(error);
    return { aplicados: [], error };
  }
  const archivos = (Array.isArray(diario.archivos) ? diario.archivos : []).filter((a) => typeof a?.ruta === "string" && rutaPermitida(a.ruta) && typeof a.base64 === "string");
  aplicarLote(raiz, archivos);
  fs.rmSync(ruta, { force: true });
  log.warn(`Escritura interrumpida recuperada (${diario.mensaje || "sin mensaje"}): ${archivos.length} archivo(s) aplicados.`);
  return { aplicados: archivos.map((a) => a.ruta), mensaje: diario.mensaje || "" };
}

function responder(res, codigo, cuerpo, tipo = "text/plain; charset=utf-8") {
  res.writeHead(codigo, { "content-type": tipo, "cache-control": "no-store" });
  res.end(cuerpo);
}
const responderJson = (res, codigo, obj) => responder(res, codigo, JSON.stringify(obj), TIPOS[".json"]);

function servirArchivo(res, base, relativo) {
  const ruta = path.resolve(base, relativo);
  if (!ruta.startsWith(path.resolve(base) + path.sep) && ruta !== path.resolve(base)) return responder(res, 404, "No encontrado");
  if (!fs.existsSync(ruta) || fs.statSync(ruta).isDirectory()) return responder(res, 404, "No encontrado");
  responder(res, 200, fs.readFileSync(ruta), TIPOS[path.extname(ruta)] || "application/octet-stream");
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let datos = "";
    req.on("data", (c) => { datos += c; });
    req.on("end", () => resolve(datos));
    req.on("error", reject);
  });
}

const leerJsonSiExiste = (ruta) => { try { return fs.existsSync(ruta) ? JSON.parse(fs.readFileSync(ruta, "utf8")) : null; } catch { return null; } };

// Valida el contenido antes de escribirlo: el config global y el de cada cuenta deben ser JSON válidos y pasar las reglas.
function validarContenido(ruta, texto) {
  if (ruta === "config.json") validarGlobal(JSON.parse(texto));
  const m = ruta.match(RE_ARCHIVO_CUENTA);
  if (m && m[2] === "config.json") validarCuenta(JSON.parse(texto), m[1]);
  if (RE_CONEXION.test(ruta)) JSON.parse(texto);
}

export function crearServidor({ raiz = process.cwd(), log = console } = {}) {
  recuperarEscrituraPendiente(raiz, log); // un lote interrumpido se completa antes de atender a nadie
  const inicial = cargarConfiguracion(raiz);
  if (!inicial.cuentas.length) throw new Error(`Ninguna cuenta válida: ${inicial.errores.map((e) => e.mensaje).join("; ")}`);
  // Se relee en cada petición: el panel maestro puede dar de alta o archivar cuentas mientras el servidor corre.
  const configuracion = () => cargarConfiguracion(raiz);
  const principal = () => { try { return cargarGlobal(path.join(raiz, "config.json")).cuentas[0] || CUENTA_LEGADO; } catch { return CUENTA_LEGADO; } };
  const vistaPlantilla = () => { const c = configuracion(); return c.cuentas.find((x) => x.cuenta === principal()) || c.cuentas[0]; };

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    let p;
    try {
      p = decodeURIComponent(url.pathname);
    } catch {
      return responder(res, 400, "Ruta mal formada");
    }
    try {
      if (req.method === "GET" && p === "/") {
        const enlaces = VARIANTES.map((v) => `<li><a href="/vista/${v}">Plantilla · ${v}</a></li>`).join("");
        return responder(res, 200, `<!doctype html><meta charset="utf-8"><title>Sin Línea · previsualización</title><h1>Sin Línea</h1><ul>${enlaces}<li><a href="/vista/negro?ilustracion=1">Plantilla · con ilustración</a></li><li><a href="/panel/">Panel (modo local)</a></li></ul>`, TIPOS[".html"]);
      }
      if (req.method === "GET" && p.startsWith("/vista/")) {
        const variante = p.slice("/vista/".length);
        if (!VARIANTES.includes(variante)) return responder(res, 404, "Variante desconocida");
        const config = vistaPlantilla();
        const ejemplo = JSON.parse(fs.readFileSync(path.join(raiz, "tests", "fixtures", "post-ejemplo.json"), "utf8"));
        const plantilla = fs.readFileSync(path.join(raiz, RUTA_PLANTILLA), "utf8");
        const rutaLogo = config.rutas?.logo || RUTA_LOGO;
        const logoUrl = fs.existsSync(path.join(raiz, rutaLogo)) ? rutaLogo : null;
        const ilustracionUrl = url.searchParams.get("ilustracion") === "1" ? "tests/fixtures/ilustracion-ejemplo.jpg" : null;
        return responder(res, 200, construirHtml({ ...ejemplo, variante }, config, { plantilla, baseHref: "/", logoUrl, ilustracionUrl }), TIPOS[".html"]);
      }
      if (req.method === "GET" && p.startsWith("/assets/")) return servirArchivo(res, path.join(raiz, "assets"), p.slice("/assets/".length));
      if (req.method === "GET" && p.startsWith("/cuentas/")) {
        // Solo imágenes (logos): nunca config.json ni editorial.md de las cuentas por esta vía.
        if (![".png", ".jpg"].includes(path.extname(p))) return responder(res, 404, "No encontrado");
        return servirArchivo(res, path.join(raiz, "cuentas"), p.slice("/cuentas/".length));
      }
      if (req.method === "GET" && p.startsWith("/img/")) return servirArchivo(res, path.join(raiz, "public", "img"), p.slice("/img/".length));
      if (req.method === "GET" && p.startsWith("/tests/fixtures/")) return servirArchivo(res, path.join(raiz, "tests", "fixtures"), p.slice("/tests/fixtures/".length));
      if (req.method === "GET" && p === "/panel/config.json") {
        return responderJson(res, 200, resumenParaPanel(configuracion().cuentas));
      }
      if (req.method === "GET" && p.startsWith("/panel/lib/")) return servirArchivo(res, path.join(raiz, "src", "lib"), p.slice("/panel/lib/".length));
      if (req.method === "GET" && (p === "/panel" || p === "/panel/")) return servirArchivo(res, path.join(raiz, "panel"), "index.html");
      if (req.method === "GET" && p.startsWith("/panel/")) return servirArchivo(res, path.join(raiz, "panel"), p.slice("/panel/".length));
      if (req.method === "GET" && p === "/api/posts") return responderJson(res, 200, leerPosts(path.join(raiz, "posts"), { cuentaPorDefecto: principal() }));
      // Multicanal: huella (sha de blob git) de la imagen renderizada de un post, para vincular la imagen aprobada a un archivo.
      if (req.method === "GET" && p === "/api/imagen-sha") {
        const id = url.searchParams.get("id") || "";
        if (!/^[a-z0-9-]+$/.test(id)) return responderJson(res, 400, { error: "id inválido" });
        const rutaImg = path.join(raiz, "public", "img", `${id}.jpg`);
        if (!fs.existsSync(rutaImg)) return responderJson(res, 404, { error: "sin imagen", sha: null });
        return responderJson(res, 200, { sha: shaDeBlob(fs.readFileSync(rutaImg)) });
      }
      if (req.method === "GET" && p === "/api/token-info") {
        const cuenta = url.searchParams.get("cuenta") || principal();
        if (!configuracion().cuentas.some((c) => c.cuenta === cuenta)) return responder(res, 404, "Cuenta desconocida");
        return servirArchivo(res, path.join(raiz, "data", cuenta), "token-info.json");
      }
      if (req.method === "PUT" && p.startsWith("/api/posts/")) {
        const id = p.slice("/api/posts/".length);
        let post;
        try { post = validarPost(JSON.parse(await leerCuerpo(req))); } catch (err) { return responderJson(res, 400, { error: err.message }); }
        if (post.id !== id) return responderJson(res, 400, { error: "El id no coincide" });
        escribirPost(path.join(raiz, "posts"), post);
        return responderJson(res, 200, { ok: true });
      }

      // --- Panel maestro -------------------------------------------------------
      if (req.method === "GET" && p === "/api/cuentas") {
        recuperarEscrituraPendiente(raiz, log);
        const textoGlobal = fs.readFileSync(path.join(raiz, "config.json"), "utf8");
        const global = JSON.parse(textoGlobal);
        const cuentas = (global.cuentas || []).map((id) => {
          const carpeta = path.join(raiz, "cuentas", id);
          const rutaCfg = path.join(carpeta, "config.json");
          const rutaEd = path.join(carpeta, "editorial.md");
          const textoCfg = fs.existsSync(rutaCfg) ? fs.readFileSync(rutaCfg, "utf8") : null;
          const textoEd = fs.existsSync(rutaEd) ? fs.readFileSync(rutaEd, "utf8") : null;
          let config = null; let error = null;
          try { config = textoCfg ? JSON.parse(textoCfg) : null; } catch (err) { error = `cuentas/${id}/config.json no es JSON válido (${err.message})`; }
          if (!textoCfg) error = `falta cuentas/${id}/config.json`;
          return {
            id, config, sha: textoCfg ? shaDeBlob(textoCfg) : null,
            editorial: textoEd, editorialSha: textoEd ? shaDeBlob(textoEd) : null,
            logo: fs.existsSync(path.join(carpeta, "logo.png")),
            conexion: leerJsonSiExiste(path.join(raiz, "data", id, "conexion.json")),
            conexionSha: fs.existsSync(path.join(raiz, "data", id, "conexion.json")) ? shaDeBlob(fs.readFileSync(path.join(raiz, "data", id, "conexion.json"))) : null,
            tokenInfo: leerJsonSiExiste(path.join(raiz, "data", id, "token-info.json")),
            metricasEstado: leerJsonSiExiste(path.join(raiz, "data", id, "metricas", "estado.json")),
            // Multicanal (F1): estado de conexión de cada red nueva (data/<id>/conexion-<red>.json), con su sha.
            conexiones: Object.fromEntries(REDES_CONEXION.map((red) => {
              const ruta = path.join(raiz, "data", id, `conexion-${red}.json`);
              return [red, { conexion: leerJsonSiExiste(ruta), sha: fs.existsSync(ruta) ? shaDeBlob(fs.readFileSync(ruta)) : null }];
            })),
            secretosActualizados: null, // en local no hay GitHub: no se afirma nada sobre los secretos
            error,
          };
        });
        return responderJson(res, 200, { global, globalSha: shaDeBlob(textoGlobal), cuentas, workflows: leerWorkflows(raiz) });
      }
      // Métricas (fase 1): archivos mensuales y estado de data/<cuenta>/metricas para la vista del panel. Solo lectura.
      if (req.method === "GET" && p === "/api/metricas") {
        const cuenta = url.searchParams.get("cuenta") || "";
        if (!configuracion().cuentas.some((c) => c.cuenta === cuenta)) return responder(res, 404, "Cuenta desconocida");
        const carpeta = path.join(raiz, "data", cuenta, "metricas");
        const archivos = {};
        let estado = null;
        if (fs.existsSync(carpeta)) {
          for (const nombre of fs.readdirSync(carpeta)) {
            if (/^(cuenta|publicaciones)-\d{4}-\d{2}\.json$/.test(nombre)) archivos[nombre] = leerJsonSiExiste(path.join(carpeta, nombre));
          }
          estado = leerJsonSiExiste(path.join(carpeta, "estado.json"));
        }
        return responderJson(res, 200, { archivos, estado });
      }
      if ((req.method === "GET" || req.method === "PUT") && p === "/api/archivo") {
        const ruta = url.searchParams.get("ruta") || "";
        if (!rutaPermitida(ruta)) return responderJson(res, 403, { error: `Ruta no permitida: ${ruta}` });
        const absoluta = path.join(raiz, ...ruta.split("/"));
        const binario = ruta.endsWith(".png");
        const actual = () => {
          if (!fs.existsSync(absoluta)) return null;
          const buf = fs.readFileSync(absoluta);
          return { sha: shaDeBlob(buf), texto: binario ? null : buf.toString("utf8"), base64: binario ? buf.toString("base64") : undefined };
        };
        if (req.method === "GET") {
          const a = actual();
          return a ? responderJson(res, 200, a) : responderJson(res, 404, { error: `No existe ${ruta}` });
        }
        let cuerpo;
        try { cuerpo = JSON.parse(await leerCuerpo(req)); } catch { return responderJson(res, 400, { error: "Cuerpo JSON inválido" }); }
        const a = actual();
        // Bloqueo optimista: sin sha solo se puede crear; con sha debe coincidir con la versión actual.
        if (a && (!cuerpo.sha || cuerpo.sha !== a.sha)) return responderJson(res, 409, { error: `${ruta} cambió (o ya existe); vuelve a leerlo antes de guardar`, ...a });
        if (!a && cuerpo.sha) return responderJson(res, 409, { error: `${ruta} ya no existe`, sha: null, texto: null });
        let contenido;
        if (binario) {
          if (typeof cuerpo.base64 !== "string" || !cuerpo.base64) return responderJson(res, 400, { error: "Falta base64" });
          contenido = Buffer.from(cuerpo.base64, "base64");
        } else {
          if (typeof cuerpo.texto !== "string") return responderJson(res, 400, { error: "Falta texto" });
          try { validarContenido(ruta, cuerpo.texto); } catch (err) { return responderJson(res, 400, { error: err.message }); }
          contenido = Buffer.from(cuerpo.texto, "utf8");
        }
        escribirAtomico(absoluta, contenido);
        return responderJson(res, 200, { ok: true, sha: shaDeBlob(contenido) });
      }
      if (req.method === "PUT" && p === "/api/archivos") {
        // Lote: se valida y se comprueban todos los sha ANTES de escribir; si algo falla, no se toca ningún archivo.
        // Después, diario + aplicación + borrado del diario (ver RUTA_DIARIO).
        recuperarEscrituraPendiente(raiz, log);
        let cuerpo;
        try { cuerpo = JSON.parse(await leerCuerpo(req)); } catch { return responderJson(res, 400, { error: "Cuerpo JSON inválido" }); }
        const archivos = Array.isArray(cuerpo.archivos) ? cuerpo.archivos : null;
        if (!archivos || !archivos.length) return responderJson(res, 400, { error: "archivos debe ser una lista con al menos un archivo" });
        for (const a of archivos) if (typeof a?.ruta !== "string" || !rutaPermitida(a.ruta)) return responderJson(res, 403, { error: `Ruta no permitida: ${a?.ruta}` });
        const preparados = [];
        for (const a of archivos) {
          const absoluta = path.join(raiz, ...a.ruta.split("/"));
          const binario = a.ruta.endsWith(".png");
          const actual = fs.existsSync(absoluta) ? fs.readFileSync(absoluta) : null;
          const actualSha = actual ? shaDeBlob(actual) : null;
          if (a.sha !== undefined) {
            const version = { ruta: a.ruta, sha: actualSha, texto: actual && !binario ? actual.toString("utf8") : null };
            if (a.sha === null && actual) return responderJson(res, 409, { error: `${a.ruta} ya existe`, ...version });
            if (a.sha && a.sha !== actualSha) return responderJson(res, 409, { error: `${a.ruta} cambió (o ya no existe); vuelve a leerlo antes de guardar`, ...version });
          }
          let contenido;
          if (binario) {
            if (typeof a.base64 !== "string" || !a.base64) return responderJson(res, 400, { error: `Falta base64 en ${a.ruta}` });
            contenido = Buffer.from(a.base64, "base64");
          } else {
            if (typeof a.texto !== "string") return responderJson(res, 400, { error: `Falta texto en ${a.ruta}` });
            try { validarContenido(a.ruta, a.texto); } catch (err) { return responderJson(res, 400, { error: err.message }); }
            contenido = Buffer.from(a.texto, "utf8");
          }
          preparados.push({ ruta: a.ruta, absoluta, contenido });
        }
        const diario = { creado: new Date().toISOString(), mensaje: String(cuerpo.mensaje || ""), archivos: preparados.map((pr) => ({ ruta: pr.ruta, base64: pr.contenido.toString("base64") })) };
        escribirAtomico(rutaAbsoluta(raiz, RUTA_DIARIO), JSON.stringify(diario));
        aplicarLote(raiz, diario.archivos);
        fs.rmSync(rutaAbsoluta(raiz, RUTA_DIARIO), { force: true });
        const shas = Object.fromEntries(preparados.map((pr) => [pr.ruta, shaDeBlob(pr.contenido)]));
        return responderJson(res, 200, { ok: true, shas });
      }
      if (req.method === "POST" && p === "/api/verificar-conexion") {
        const cuenta = url.searchParams.get("cuenta") || "";
        const red = url.searchParams.get("red") || "instagram";
        const global = cargarGlobal(path.join(raiz, "config.json"));
        if (!global.cuentas.includes(cuenta)) return responderJson(res, 404, { error: `Cuenta desconocida: ${cuenta}` });
        if (red !== "instagram" && !REDES_CONEXION.includes(red)) return responderJson(res, 400, { error: `Red desconocida: ${red}` });
        const carpeta = path.join(raiz, "data", cuenta);
        fs.mkdirSync(carpeta, { recursive: true });
        const archivo = red === "instagram" ? "conexion.json" : `conexion-${red}.json`;
        fs.writeFileSync(path.join(carpeta, archivo), JSON.stringify({ ...(red === "instagram" ? {} : { red }), estado: "pendiente", solicitada: new Date().toISOString() }, null, 2) + "\n");
        return responderJson(res, 200, { ok: true, nota: `En local se marca como pendiente; el workflow ${red === "instagram" ? "Probar Instagram" : "Probar destino"} solo corre en GitHub.` });
      }
      return responder(res, 404, "No encontrado");
    } catch (err) {
      return responder(res, 500, `Error: ${err.message}`);
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const puerto = Number(process.env.PORT) || 4173;
  crearServidor().listen(puerto, "127.0.0.1", () => console.log(`Previsualización en http://localhost:${puerto}/`));
}
