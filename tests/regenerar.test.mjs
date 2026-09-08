import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ejecutarRegenerar, regenerarCuentas } from "../src/regenerar.mjs";
import { cargarConfiguracion } from "../src/lib/config.mjs";
import { raizConCuentas } from "./ayuda/cuentas.mjs";
import { cargarConfig } from "../src/lib/config.mjs";
import { leerPosts, escribirPost, urlImagen } from "../src/lib/posts.mjs";
import { hashImagen, marcarError, aprobar, hashTexto } from "../src/lib/estados.mjs";

const cfg = cargarConfig("config.json");
const base = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));
const ahora = new Date("2026-09-07T21:00:00Z");
const imagenDe = (p, version = 1) => ({ ruta: `public/img/${p.id}.jpg`, url: urlImagen(cfg.pages.baseUrl, p.id), hash: hashImagen(p, version), version, renderizada: ahora.toISOString() });
const log = { info: () => {}, warn: () => {} };

function dirCon(posts) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "regen-"));
  for (const p of posts) escribirPost(path.join(raiz, "posts"), p);
  return raiz;
}

test("re-renderiza solo los desactualizados, los sin imagen y los errores de render", async () => {
  const alDia = { ...base, id: base.id.slice(0, -4) + "0001", imagen: imagenDe({ ...base, id: base.id.slice(0, -4) + "0001" }) };
  const editado = { ...base, id: base.id.slice(0, -4) + "0002", titular: "Cambiado", imagen: imagenDe(base) };
  const sinImagen = { ...base, id: base.id.slice(0, -4) + "0003", imagen: null };
  const errRender = marcarError({ ...base, id: base.id.slice(0, -4) + "0004", imagen: imagenDe(base) }, { paso: "render", mensaje: "x" }, ahora.toISOString());
  const publicado = { ...base, id: base.id.slice(0, -4) + "0005", estado: "publicado", titular: "Otro", imagen: imagenDe(base), publicacion: { idMedia: "1", permalink: "u", fecha: ahora.toISOString() } };
  const raiz = dirCon([alDia, editado, sinImagen, errRender, publicado]);
  const renderizados = [];
  const render = async (p) => { renderizados.push(p.id); return imagenDe(p); };
  const r = await ejecutarRegenerar({ config: cfg, raiz, ahora, render, log, version: 1 });
  assert.deepEqual(r.renderizados.sort(), [editado.id, sinImagen.id, errRender.id].sort());
  assert.deepEqual(r.fallidos, []);
  const posts = Object.fromEntries(leerPosts(path.join(raiz, "posts")).map((p) => [p.id, p]));
  assert.equal(posts[errRender.id].estado, "borrador");
  assert.equal(posts[editado.id].imagen.hash, hashImagen(editado, 1));
});

test("una versión nueva de plantilla re-renderiza todos los activos", async () => {
  const p = { ...base, imagen: imagenDe(base, 1) };
  const raiz = dirCon([p]);
  const r = await ejecutarRegenerar({ config: cfg, raiz, ahora, render: async (x) => imagenDe(x, 2), log, version: 2 });
  assert.deepEqual(r.renderizados, [p.id]);
  assert.equal(leerPosts(path.join(raiz, "posts"))[0].imagen.version, 2);
});

test("si el render falla, el post programado queda en error y conserva su hora", async () => {
  const prog = aprobar({ ...base, imagen: null }, "2026-09-07T17:00:00-05:00", ahora.toISOString());
  const raiz = dirCon([prog]);
  const r = await ejecutarRegenerar({ config: cfg, raiz, ahora, render: async () => { throw new Error("falló"); }, log, version: 1 });
  assert.deepEqual(r.fallidos, [prog.id]);
  const p = leerPosts(path.join(raiz, "posts"))[0];
  assert.equal(p.estado, "error");
  assert.equal(p.programado, "2026-09-07T17:00:00-05:00");
});

test("una imagen con URL de otro baseUrl se vuelve a renderizar", async () => {
  const p = { ...base, imagen: { ...imagenDe(base), url: "https://CAMBIAR.github.io/sinlinea/img/x.jpg" } };
  const raiz = dirCon([p]);
  const cfgReal = { ...cfg, pages: { baseUrl: "https://prueba.github.io/sinlinea" } };
  const r = await ejecutarRegenerar({ config: cfgReal, raiz, ahora, render: async (x) => ({ ...imagenDe(x), url: `https://prueba.github.io/sinlinea/img/${x.id}.jpg` }), log, version: 1 });
  assert.deepEqual(r.renderizados, [p.id]);
});

test("Regenerar ilustración con la misma escena vuelve a renderizar (C1)", async () => {
  const descripcion = "Canal de Panamá desde Miraflores";
  const hashDesc = hashTexto(descripcion);
  const ilustracionBase = { descripcion, usar: true, ruta: `public/ilus/${base.id}.jpg`, hashDescripcion: null, proveedor: "gemini", modelo: "m", generada: ahora.toISOString(), error: null };
  // El hash de la imagen ya está al día para la descripción actual (hashDescripcion == hashDesc);
  // en el post real hashDescripcion se puso en null (p. ej. al pulsar "Regenerar ilustración").
  const imagenAlDia = imagenDe({ ...base, ilustracion: { ...ilustracionBase, hashDescripcion: hashDesc } }, 1);
  const post = { ...base, ilustracion: ilustracionBase, imagen: imagenAlDia };
  const raiz = dirCon([post]);
  const ilustrador = { async generar() { return Buffer.from("00", "hex"); } };
  const guardar = async () => {};
  const r = await ejecutarRegenerar({ config: cfg, raiz, ahora, render: async (x) => imagenDe(x, 1), log, version: 1, ilustrador, guardar });
  assert.deepEqual(r.renderizados, [post.id]);
  const guardado = leerPosts(path.join(raiz, "posts"))[0];
  assert.equal(guardado.ilustracion.hashDescripcion, hashTexto(descripcion));
});

test("(I1) al tercer fallo consecutivo la ilustración se desactiva (usar=false)", async () => {
  const conFallosPrevios = {
    ...base,
    ilustracion: { descripcion: "Escena", usar: true, ruta: null, hashDescripcion: null, proveedor: null, modelo: null, generada: null, error: { mensaje: "previo", fecha: "2026-09-06T00:00:00.000Z", intentos: 2 } },
  };
  const raiz = dirCon([conFallosPrevios]);
  const ilustrador = { async generar() { throw new Error("Gemini respondió 500: caído"); } };
  await ejecutarRegenerar({ config: cfg, raiz, ahora, render: async (x) => imagenDe(x), log, version: 1, ilustrador, guardar: async () => {} });
  const guardado = leerPosts(path.join(raiz, "posts"))[0];
  assert.equal(guardado.ilustracion.error.intentos, 3);
  assert.equal(guardado.ilustracion.usar, false);
});

test("(M5) REGENERAR no supera ilustraciones.maxPorCorrida llamadas a Gemini por corrida", async () => {
  const posts = Array.from({ length: 6 }, (_, i) => ({
    ...base, id: base.id.slice(0, -4) + String(1000 + i),
    ilustracion: { descripcion: `Escena ${i}`, usar: true, ruta: null, hashDescripcion: null, proveedor: null, modelo: null, generada: null, error: null },
  }));
  const raiz = dirCon(posts);
  const llamadas = [];
  const ilustrador = { async generar(d) { llamadas.push(d); return Buffer.from("00", "hex"); } };
  const cfgConTope = { ...cfg, ilustraciones: { ...cfg.ilustraciones, maxPorCorrida: 4 } };
  await ejecutarRegenerar({ config: cfgConTope, raiz, ahora, render: async (x) => imagenDe(x), log, version: 1, ilustrador, guardar: async () => {} });
  assert.equal(llamadas.length, 4);
});

test("regenera la ilustración cuando cambió la escena y no llama con usar=false", async () => {
  const conIlus = { ...base, imagen: imagenDe(base), ilustracion: { descripcion: "Nueva escena", usar: true, ruta: "public/ilus/a.jpg", hashDescripcion: "0000000000000000", proveedor: "gemini", modelo: "m", generada: ahora.toISOString(), error: null } };
  const apagada = { ...base, id: base.id.slice(0, -4) + "0009", imagen: imagenDe({ ...base, id: base.id.slice(0, -4) + "0009" }), ilustracion: { descripcion: "Otra", usar: false, ruta: null, hashDescripcion: null, proveedor: null, modelo: null, generada: null, error: null } };
  const raiz = dirCon([conIlus, apagada]);
  const llamadas = [];
  const ilustrador = { async generar(d) { llamadas.push(d); return Buffer.from("00", "hex"); } };
  const guardadas = [];
  const guardar = async (buf, ruta) => { guardadas.push(ruta); };
  const r = await ejecutarRegenerar({ config: cfg, raiz, ahora, render: async (x) => imagenDe(x), log, version: 1, ilustrador, guardar });
  assert.deepEqual(llamadas, ["Nueva escena"]);
  assert.ok(guardadas[0].endsWith(path.join("public", "ilus", `${conIlus.id}.jpg`)));
  assert.deepEqual(r.renderizados, [conIlus.id]);
  const posts = Object.fromEntries(leerPosts(path.join(raiz, "posts")).map((p) => [p.id, p]));
  assert.equal(posts[conIlus.id].ilustracion.hashDescripcion, hashTexto("Nueva escena"));
});

test("(D1) si el ilustrador lanza, el post conserva usar y el render de los pendientes no se bloquea", async () => {
  const conIlusQueFalla = {
    ...base,
    ilustracion: { descripcion: "Escena que falla", usar: true, ruta: null, hashDescripcion: null, proveedor: null, modelo: null, generada: null, error: null },
  };
  const otroPendiente = { ...base, id: base.id.slice(0, -4) + "0010", imagen: null };
  const raiz = dirCon([conIlusQueFalla, otroPendiente]);
  const ilustrador = { async generar() { throw new Error("Gemini respondió 500: caído"); } };
  const renderizados = [];
  const render = async (p) => { renderizados.push(p.id); return imagenDe(p); };
  const r = await ejecutarRegenerar({ config: cfg, raiz, ahora, render, log, version: 1, ilustrador, guardar: async () => {} });
  const posts = Object.fromEntries(leerPosts(path.join(raiz, "posts")).map((p) => [p.id, p]));
  const falladoPost = posts[conIlusQueFalla.id];
  assert.equal(falladoPost.ilustracion.usar, true, "con menos de 3 intentos, usar se conserva");
  assert.match(falladoPost.ilustracion.error.mensaje, /500/);
  assert.ok(!Number.isNaN(Date.parse(falladoPost.ilustracion.error.fecha)));
  assert.equal(falladoPost.ilustracion.error.intentos, 1);
  assert.ok(renderizados.includes(otroPendiente.id), "el render del otro post pendiente se ejecuta igual");
  assert.deepEqual(r.renderizados.sort(), [conIlusQueFalla.id, otroPendiente.id].sort());
});

test("si el render avisa que el titular no cabe, REGENERAR acorta con Claude, guarda el titular nuevo y renderiza", async () => {
  const largo = { ...base, id: base.id.slice(0, -4) + "0301", titular: "Titular que no cabe", imagen: null };
  const raiz = dirCon([largo]);
  const render = async (p) => {
    if (p.titular === "Titular que no cabe") throw Object.assign(new Error("El titular no cabe en 3 líneas"), { code: "TEXTO_NO_CABE", campo: "titular" });
    return imagenDe(p);
  };
  const r = await ejecutarRegenerar({ config: cfg, raiz, ahora, render, log, version: 1, acortar: async () => ({ titular: "Titular corto", bajada: "Bajada corta" }) });
  assert.deepEqual(r.renderizados, [largo.id]);
  const guardado = leerPosts(path.join(raiz, "posts"))[0];
  assert.equal(guardado.titular, "Titular corto");
  assert.equal(guardado.estado, "borrador");
  assert.equal(guardado.imagen.hash, hashImagen(guardado, 1));
  const sin = await ejecutarRegenerar({ config: cfg, raiz: dirCon([largo]), ahora, render, log, version: 1 });
  assert.deepEqual(sin.fallidos, [largo.id]);
});

test("si el render sigue fallando tras acortar, REGENERAR guarda el post en error pero con el texto ya acortado", async () => {
  const largo = { ...base, id: base.id.slice(0, -4) + "0302", titular: "T".repeat(70), bajada: "B".repeat(130), imagen: null };
  const raiz = dirCon([largo]);
  const render = async () => { throw Object.assign(new Error("La bajada no cabe en 2 líneas"), { code: "TEXTO_NO_CABE", campo: "bajada" }); };
  const r = await ejecutarRegenerar({ config: cfg, raiz, ahora, render, log, version: 1, acortar: async () => ({ titular: "Titular corto", bajada: "Bajada corta" }) });
  assert.deepEqual(r.fallidos, [largo.id]);
  const guardado = leerPosts(path.join(raiz, "posts"))[0];
  assert.equal(guardado.estado, "error");
  assert.equal(guardado.titular, "Titular corto");
  assert.equal(guardado.bajada, "Bajada corta");
});

const sinEscena = (sufijo, extra = {}) => ({ ...base, id: base.id.slice(0, -4) + sufijo, imagen: null,
  ilustracion: { descripcion: "", usar: true, ruta: null, hashDescripcion: null, proveedor: null, modelo: null, generada: null, error: null, ...extra } });

test("un post con usar=true y escena vacía recibe la escena de Claude, la ilustración de Gemini y el render", async () => {
  const p = sinEscena("0401");
  const raiz = dirCon([p]);
  const ilustrador = { llamadas: [], async generar(d) { this.llamadas.push(d); return Buffer.from("ffd8ffd9", "hex"); } };
  const escenas = [];
  const redactarEscena = async (a) => { escenas.push(a); return "Vehículos oficiales frente a un edificio público"; };
  const r = await ejecutarRegenerar({ config: cfg, raiz, ahora, render: async (q) => imagenDe(q), log, version: 1, ilustrador, guardar: async () => {}, redactarEscena });
  assert.deepEqual(escenas.map((a) => a.titular), [p.titular]);
  assert.deepEqual(ilustrador.llamadas, ["Vehículos oficiales frente a un edificio público"]);
  const guardado = leerPosts(path.join(raiz, "posts"))[0];
  assert.equal(guardado.ilustracion.descripcion, "Vehículos oficiales frente a un edificio público");
  assert.equal(guardado.ilustracion.hashDescripcion, hashTexto(guardado.ilustracion.descripcion));
  assert.ok(guardado.ilustracion.ruta);
  assert.deepEqual(r.renderizados, [p.id]);
});

test("sin redactarEscena (sin clave de Claude) un post con escena vacía no llama a Gemini y queda igual", async () => {
  const p = sinEscena("0402");
  const raiz = dirCon([p]);
  const ilustrador = { llamadas: [], async generar(d) { this.llamadas.push(d); return Buffer.from("ffd8ffd9", "hex"); } };
  await ejecutarRegenerar({ config: cfg, raiz, ahora, render: async (q) => imagenDe(q), log, version: 1, ilustrador, guardar: async () => {} });
  assert.deepEqual(ilustrador.llamadas, []);
  assert.equal(leerPosts(path.join(raiz, "posts"))[0].ilustracion.descripcion, "");
});

test("si Claude no logra redactar la escena, se anota el error con intentos y se respeta el enfriamiento de 1 h", async () => {
  const p = sinEscena("0403");
  const raiz = dirCon([p]);
  const ilustrador = { llamadas: [], async generar(d) { this.llamadas.push(d); return Buffer.from("ffd8ffd9", "hex"); } };
  let pedidas = 0;
  const redactarEscena = async () => { pedidas++; throw new Error("Claude no disponible"); };
  await ejecutarRegenerar({ config: cfg, raiz, ahora, render: async (q) => imagenDe(q), log, version: 1, ilustrador, guardar: async () => {}, redactarEscena });
  const guardado = leerPosts(path.join(raiz, "posts"))[0];
  assert.equal(pedidas, 1);
  assert.deepEqual(ilustrador.llamadas, []);
  assert.equal(guardado.ilustracion.usar, true);
  assert.match(guardado.ilustracion.error.mensaje, /Claude no disponible/);
  assert.equal(guardado.ilustracion.error.intentos, 1);
  await ejecutarRegenerar({ config: cfg, raiz, ahora: new Date(ahora.getTime() + 10 * 60000), render: async (q) => imagenDe(q), log, version: 1, ilustrador, guardar: async () => {}, redactarEscena });
  assert.equal(pedidas, 1, "dentro de la hora no se vuelve a pedir");
  const tercero = sinEscena("0404", { error: { mensaje: "x", fecha: new Date(ahora.getTime() - 2 * 3600000).toISOString(), intentos: 2 } });
  const raiz2 = dirCon([tercero]);
  await ejecutarRegenerar({ config: cfg, raiz: raiz2, ahora, render: async (q) => imagenDe(q), log, version: 1, ilustrador, guardar: async () => {}, redactarEscena });
  assert.equal(leerPosts(path.join(raiz2, "posts"))[0].ilustracion.usar, false, "al tercer fallo se desactiva");
});

test("la redacción de escenas respeta ilustraciones.maxPorCorrida por corrida", async () => {
  const posts = ["0501", "0502", "0503", "0504", "0505", "0506"].map((s) => sinEscena(s));
  const raiz = dirCon(posts);
  const ilustrador = { llamadas: [], async generar(d) { this.llamadas.push(d); return Buffer.from("ffd8ffd9", "hex"); } };
  let pedidas = 0;
  const redactarEscena = async () => { pedidas++; return `Escena ${pedidas}`; };
  const config = { ...cfg, ilustraciones: { ...cfg.ilustraciones, maxPorCorrida: 4 } };
  await ejecutarRegenerar({ config, raiz, ahora, render: async (q) => imagenDe(q), log, version: 1, ilustrador, guardar: async () => {}, redactarEscena });
  assert.equal(pedidas, 4, "solo 4 escenas por corrida");
  assert.equal(ilustrador.llamadas.length, 4);
  assert.equal(leerPosts(path.join(raiz, "posts")).filter((p) => p.ilustracion.descripcion === "").length, 2, "las otras dos esperan a la siguiente hora");
});

test("(M1) REGENERAR solo toca los posts de su cuenta; los antiguos sin cuenta pertenecen a la principal", async () => {
  const mio = { ...base, id: base.id.slice(0, -4) + "0601", imagen: null };
  const ajeno = { ...base, id: base.id.slice(0, -4) + "0602", cuenta: "prueba", imagen: null };
  const raiz = dirCon([mio, ajeno]);
  const renderizados = [];
  const r = await ejecutarRegenerar({ config: cfg, raiz, ahora, render: async (p) => { renderizados.push(p.id); return imagenDe(p); }, log, version: 1 });
  assert.deepEqual(r.renderizados, [mio.id]);
  assert.deepEqual(renderizados, [mio.id]);
});

test("(M1) regenerarCuentas procesa todas las cuentas y un fallo en una no bloquea a las demás", async () => {
  const raiz = raizConCuentas({ cuentas: ["sinlinea", "prueba"], prefijo: "regen-" });
  const configuracion = cargarConfiguracion(raiz);
  const p1 = { ...base, id: base.id.slice(0, -4) + "0611", cuenta: "sinlinea", imagen: null };
  const p2 = { ...base, id: base.id.slice(0, -4) + "0612", cuenta: "prueba", imagen: null };
  const { escribirPost } = await import("../src/lib/posts.mjs");
  for (const p of [p1, p2]) escribirPost(path.join(raiz, "posts"), p);
  const r = await regenerarCuentas({
    configuracion, raiz, ahora, log, version: 1,
    render: async (p) => imagenDe(p),
    ilustradorDe: (config) => { if (config.cuenta === "sinlinea") throw new Error("Gemini mal configurado para sinlinea"); return null; },
  });
  assert.match(r.resultados.sinlinea.error, /Gemini mal configurado/);
  assert.deepEqual(r.resultados.prueba.renderizados, [p2.id]);
});

test("(despliegue) el error de una cuenta en regenerarCuentas se guarda sin tokens ni claves", async () => {
  const raiz = raizConCuentas({ cuentas: ["sinlinea"], prefijo: "regen-sec-" });
  const configuracion = cargarConfiguracion(raiz);
  const token = "IGAAR" + "x".repeat(60);
  const r = await regenerarCuentas({ configuracion, raiz, ahora, log, version: 1, render: async (p) => imagenDe(p), ilustradorDe: () => { throw new Error(`token ${token} inválido`); } });
  assert.equal(r.resultados.sinlinea.error.includes(token), false);
  assert.match(r.resultados.sinlinea.error, /\[secreto\]/);
});

test("(M2) REGENERAR vuelve a dibujar un post cuyo imagen.estilo no coincide con los colores/logo actuales de la cuenta; sin estilo guardado no lo toca", async () => {
  const conEstilo = { ...base, id: base.id.slice(0, -4) + "0901", imagen: { ...imagenDe({ ...base, id: base.id.slice(0, -4) + "0901" }), estilo: "0000000000000000" } };
  const sinEstilo = { ...base, id: base.id.slice(0, -4) + "0902", imagen: imagenDe({ ...base, id: base.id.slice(0, -4) + "0902" }) };
  const raiz = dirCon([conEstilo, sinEstilo]);
  const r = await ejecutarRegenerar({ config: cfg, raiz, ahora, render: async (p) => ({ ...imagenDe(p), estilo: "1111111111111111" }), log, version: 1, estiloActual: "1111111111111111" });
  assert.deepEqual(r.renderizados, [conEstilo.id]);
  const posts = Object.fromEntries(leerPosts(path.join(raiz, "posts")).map((p) => [p.id, p]));
  assert.equal(posts[conEstilo.id].imagen.estilo, "1111111111111111");
  assert.equal(posts[sinEstilo.id].imagen.estilo, undefined);
});
