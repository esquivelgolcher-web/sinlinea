// Servidor local de previsualización: plantilla, panel (modo local) y API de posts.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cargarConfig } from "./lib/config.mjs";
import { leerPosts, escribirPost, validarPost } from "./lib/posts.mjs";
import { construirHtml, RUTA_PLANTILLA, RUTA_LOGO } from "./lib/render.mjs";
import { VARIANTES } from "./lib/estados.mjs";

const TIPOS = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png",
  ".ttf": "font/ttf", ".svg": "image/svg+xml",
};

function responder(res, codigo, cuerpo, tipo = "text/plain; charset=utf-8") {
  res.writeHead(codigo, { "content-type": tipo, "cache-control": "no-store" });
  res.end(cuerpo);
}

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

export function crearServidor({ raiz = process.cwd() } = {}) {
  const config = cargarConfig(path.join(raiz, "config.json"));
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
        return responder(res, 200, `<!doctype html><meta charset="utf-8"><title>Sin Línea · previsualización</title><h1>Sin Línea</h1><ul>${enlaces}<li><a href="/panel/">Panel (modo local)</a></li></ul>`, TIPOS[".html"]);
      }
      if (req.method === "GET" && p.startsWith("/vista/")) {
        const variante = p.slice("/vista/".length);
        if (!VARIANTES.includes(variante)) return responder(res, 404, "Variante desconocida");
        const ejemplo = JSON.parse(fs.readFileSync(path.join(raiz, "tests", "fixtures", "post-ejemplo.json"), "utf8"));
        const plantilla = fs.readFileSync(path.join(raiz, RUTA_PLANTILLA), "utf8");
        const logoUrl = fs.existsSync(path.join(raiz, RUTA_LOGO)) ? RUTA_LOGO : null;
        return responder(res, 200, construirHtml({ ...ejemplo, variante }, config, { plantilla, baseHref: "/", logoUrl }), TIPOS[".html"]);
      }
      if (req.method === "GET" && p.startsWith("/assets/")) return servirArchivo(res, path.join(raiz, "assets"), p.slice("/assets/".length));
      if (req.method === "GET" && p.startsWith("/img/")) return servirArchivo(res, path.join(raiz, "public", "img"), p.slice("/img/".length));
      if (req.method === "GET" && p.startsWith("/panel/lib/")) return servirArchivo(res, path.join(raiz, "src", "lib"), p.slice("/panel/lib/".length));
      if (req.method === "GET" && (p === "/panel" || p === "/panel/")) return servirArchivo(res, path.join(raiz, "panel"), "index.html");
      if (req.method === "GET" && p.startsWith("/panel/")) return servirArchivo(res, path.join(raiz, "panel"), p.slice("/panel/".length));
      if (req.method === "GET" && p === "/api/posts") return responder(res, 200, JSON.stringify(leerPosts(path.join(raiz, "posts"))), TIPOS[".json"]);
      if (req.method === "GET" && p === "/api/token-info") return servirArchivo(res, path.join(raiz, "data"), "token-info.json");
      if (req.method === "PUT" && p.startsWith("/api/posts/")) {
        const id = p.slice("/api/posts/".length);
        let post;
        try { post = validarPost(JSON.parse(await leerCuerpo(req))); } catch (err) { return responder(res, 400, JSON.stringify({ error: err.message }), TIPOS[".json"]); }
        if (post.id !== id) return responder(res, 400, JSON.stringify({ error: "El id no coincide" }), TIPOS[".json"]);
        escribirPost(path.join(raiz, "posts"), post);
        return responder(res, 200, JSON.stringify({ ok: true }), TIPOS[".json"]);
      }
      return responder(res, 404, "No encontrado");
    } catch (err) {
      return responder(res, 500, `Error: ${err.message}`);
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const puerto = Number(process.env.PORT) || 4173;
  crearServidor().listen(puerto, () => console.log(`Previsualización en http://localhost:${puerto}/`));
}
