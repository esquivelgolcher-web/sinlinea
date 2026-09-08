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

const TIPOS = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png",
  ".ttf": "font/ttf", ".svg": "image/svg+xml",
};

// Archivos que el panel maestro puede leer y escribir en local (misma lista que las rutas que edita en GitHub).
const RE_ARCHIVO_CUENTA = /^cuentas\/([a-z0-9][a-z0-9-]*)\/(config\.json|editorial\.md|logo\.png)$/;
const RE_CONEXION = /^data\/([a-z0-9][a-z0-9-]*)\/conexion\.json$/;
export function rutaPermitida(ruta) {
  return ruta === "config.json" || RE_ARCHIVO_CUENTA.test(ruta) || RE_CONEXION.test(ruta);
}

// Sha de blob de git (lo mismo que devuelve la API de contenidos de GitHub): sirve de bloqueo optimista en local.
export function shaDeBlob(contenido) {
  const buf = Buffer.isBuffer(contenido) ? contenido : Buffer.from(String(contenido), "utf8");
  return crypto.createHash("sha1").update(`blob ${buf.length}\0`).update(buf).digest("hex");
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

export function crearServidor({ raiz = process.cwd() } = {}) {
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
            tokenInfo: leerJsonSiExiste(path.join(raiz, "data", id, "token-info.json")),
            error,
          };
        });
        return responderJson(res, 200, { global, globalSha: shaDeBlob(textoGlobal), cuentas });
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
        fs.mkdirSync(path.dirname(absoluta), { recursive: true });
        fs.writeFileSync(absoluta, contenido);
        return responderJson(res, 200, { ok: true, sha: shaDeBlob(contenido) });
      }
      if (req.method === "POST" && p === "/api/verificar-conexion") {
        const cuenta = url.searchParams.get("cuenta") || "";
        const global = cargarGlobal(path.join(raiz, "config.json"));
        if (!global.cuentas.includes(cuenta)) return responderJson(res, 404, { error: `Cuenta desconocida: ${cuenta}` });
        const carpeta = path.join(raiz, "data", cuenta);
        fs.mkdirSync(carpeta, { recursive: true });
        fs.writeFileSync(path.join(carpeta, "conexion.json"), JSON.stringify({ estado: "pendiente", solicitada: new Date().toISOString() }, null, 2) + "\n");
        return responderJson(res, 200, { ok: true, nota: "En local se marca como pendiente; el workflow Probar Instagram solo corre en GitHub." });
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
