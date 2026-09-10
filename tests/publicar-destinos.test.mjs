import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ejecutarPublicar as ejecutarPublicarReal, publicarCuentas as publicarCuentasReal } from "../src/publicar.mjs";
// La imagen aprobada va vinculada a la huella del archivo servido: aquí la URL pública "sirve" siempre la huella aprobada.
const HUELLA = "huella-aprobada";
const huellaImagenDe = async () => ({ ok: true, sha: HUELLA });
const ejecutarPublicar = (args) => ejecutarPublicarReal({ huellaImagenDe, ...args });
const publicarCuentas = (args) => publicarCuentasReal({ huellaImagenDe, ...args });
import { cargarConfig, cargarConfiguracion } from "../src/lib/config.mjs";
import { leerPosts, escribirPost } from "../src/lib/posts.mjs";
import { hashImagen, aprobar } from "../src/lib/estados.mjs";
import { aprobarDestinos, reintentarDestinos, decidirIncierto, omitirDestino } from "../src/lib/destinos.mjs";
import { ErrorIncierto } from "../src/lib/incierto.mjs";
import { raizConCuentas } from "./ayuda/cuentas.mjs";

const base = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));
const ahora = new Date("2026-09-10T20:10:00Z");
const iso = "2026-09-10T19:00:00.000Z";
const log = { info: () => {}, warn: () => {}, error: () => {} };
const cfgBase = { ...cargarConfig("config.json"), pages: { baseUrl: "https://u.github.io/sinlinea" }, automatico: { generar: true, publicar: true } };
const cfgFb = { ...cfgBase, conexiones: { facebook: { publicar: true, pagina: "123" } } };
const conImagen = (p) => ({ ...p, imagen: { ruta: `public/img/${p.id}.jpg`, url: `https://u.github.io/sinlinea/img/${p.id}.jpg`, hash: hashImagen(p, 1), version: 1, renderizada: iso } });
const versiones = { instagram: "Texto IG\n\nFuente: La Prensa\n\n#SinLínea", facebook: "Texto FB\n\nFuente: La Prensa" };
const piezaMulticanal = (sufijo = "00aa", redes = versiones) => aprobarDestinos(conImagen({ ...base, id: base.id.slice(0, -4) + sufijo }), "2026-09-10T14:00:00-05:00", { versiones: redes, imagenSha: HUELLA }, iso);

function raizCon(posts) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "pubd-"));
  fs.mkdirSync(path.join(raiz, "data/sinlinea"), { recursive: true });
  fs.writeFileSync(path.join(raiz, "data/sinlinea/token-info.json"), JSON.stringify({ vence: "2026-11-01" }));
  for (const p of posts) escribirPost(path.join(raiz, "posts"), p);
  return raiz;
}
const leer = (raiz, id) => leerPosts(path.join(raiz, "posts")).find((p) => p.id === id);
const rutaDe = (id) => `posts/${id}.json`;

// Persistencia simulada: registra el orden de sincronizar/guardar con una instantánea del post en cada guardado.
function persistenciaSimulada(raiz, { fallarPush = 0, conflicto = false, alSincronizar = null } = {}) {
  const eventos = [];
  let fallos = fallarPush;
  const instantanea = (rutas) => rutas.map((r) => { try { return JSON.parse(fs.readFileSync(path.join(raiz, r), "utf8")); } catch { return null; } });
  const guardados = new Map(); // ruta → última instantánea confirmada (el "remoto")
  return {
    eventos, guardados,
    sincronizar: async () => { eventos.push(["sincronizar"]); if (alSincronizar) alSincronizar(); return conflicto ? { ok: false, conflicto: true, archivos: ["posts/x.json"] } : { ok: true }; },
    guardar: async (rutas, mensaje) => {
      const copia = instantanea(rutas);
      eventos.push(["guardar", rutas, mensaje, copia]);
      if (fallos > 0) { fallos--; return { ok: false, motivo: "push rechazado (simulado)" }; }
      rutas.forEach((r, i) => guardados.set(r, copia[i]));
      return { ok: true };
    },
    descartarLocal: async () => {
      eventos.push(["descartar"]);
      for (const [r, contenido] of guardados) fs.writeFileSync(path.join(raiz, r), JSON.stringify(contenido, null, 2) + "\n");
    },
  };
}
const guardadosDe = (p, id) => p.eventos.filter((e) => e[0] === "guardar" && e[1].includes(rutaDe(id))).map((e) => e[3][0]);

function igFalso({ fallo = null, estadoContenedor = "FINISHED", medio = null } = {}) {
  const llamadas = [];
  return {
    llamadas,
    perfil: async () => ({ username: "sinlinea.pa", userId: "1784" }),
    cuota: async () => ({ usados: 0, limite: 100 }),
    imagenPublica: async () => true,
    crearContenedor: async ({ imageUrl, caption }) => { llamadas.push(["crearContenedor", imageUrl, caption]); return "c1"; },
    esperarContenedor: async (id) => { llamadas.push(["esperar", id]); },
    publicar: async (id) => { llamadas.push(["publicar", id]); if (fallo) throw fallo; return "m1"; },
    permalink: async (id) => `https://www.instagram.com/p/${id}/`,
    estadoContenedor: async (id) => { llamadas.push(["estadoContenedor", id]); return { estado: estadoContenedor, detalle: "" }; },
    medioPorContenedor: async (id) => { llamadas.push(["medioPorContenedor", id]); return medio; },
  };
}

function fbFalso({ fallo = null, existe = true, publicacionPrevia = null, alPublicar = null } = {}) {
  const llamadas = [];
  return {
    llamadas,
    perfil: async () => ({ id: "123", nombre: "Página", coincideId: true }),
    imagenPublica: async () => true,
    crearContenedor: async ({ imageUrl }) => { llamadas.push(["crearContenedor", imageUrl]); return "ph1"; },
    publicarContenedor: async ({ contenedorId, texto }) => {
      llamadas.push(["publicarContenedor", contenedorId, texto]);
      if (alPublicar) alPublicar();
      if (fallo) throw fallo;
      return { id: contenedorId, idPublicacion: "123_456", permalink: "https://www.facebook.com/123/posts/456" };
    },
    existeContenedor: async (id) => { llamadas.push(["existeContenedor", id]); return existe; },
    publicacionConContenedor: async (id, { desde }) => { llamadas.push(["publicacionConContenedor", id, desde]); return publicacionPrevia; },
  };
}

test("(multicanal) una pieza con Instagram y Facebook sale en las dos redes con su texto aprobado; cada destino guarda id, enlace y fecha y la pieza queda publicada", async () => {
  const p = piezaMulticanal();
  const raiz = raizCon([p]);
  const ig = igFalso(); const fb = fbFalso();
  const persistencia = persistenciaSimulada(raiz);
  const r = await ejecutarPublicar({ config: cfgFb, raiz, ahora, ig, clientes: { facebook: fb }, persistencia, log });
  assert.deepEqual(r.publicados, [p.id]);
  assert.deepEqual(r.destinos?.[p.id], { instagram: "publicado", facebook: "publicado" });
  const guardado = leer(raiz, p.id);
  assert.equal(guardado.estado, "publicado");
  assert.equal(guardado.destinos.instagram.publicacion.id, "m1");
  assert.equal(guardado.destinos.facebook.publicacion.idPublicacion, "123_456");
  assert.equal(guardado.publicacion.permalink, "https://www.instagram.com/p/m1/", "publicacion refleja Instagram como siempre");
  assert.equal(ig.llamadas.find((l) => l[0] === "crearContenedor")[2], versiones.instagram, "se publica el texto aprobado, no uno recompuesto");
  assert.equal(fb.llamadas.find((l) => l[0] === "publicarContenedor")[2], versiones.facebook);
});

test("(multicanal) interruptores independientes: con Instagram apagado y sin cliente, Facebook publica; con pausa general no sale nada y los interruptores no cambian", async () => {
  const p = piezaMulticanal("00ab");
  const raiz = raizCon([p]);
  const fb = fbFalso();
  const soloFb = { ...cfgFb, automatico: { generar: false, publicar: false } };
  const r = await ejecutarPublicar({ config: soloFb, raiz, ahora, ig: null, clientes: { facebook: fb }, persistencia: persistenciaSimulada(raiz), log });
  assert.deepEqual(r.publicados, [], "la pieza no está completa: Instagram sigue en espera");
  assert.deepEqual(r.destinos[p.id], { instagram: "en-espera", facebook: "publicado" });
  const g = leer(raiz, p.id);
  assert.equal(g.destinos.facebook.estado, "publicado");
  assert.equal(g.destinos.instagram.estado, "pendiente", "apagar no es omitir: la entrega de Instagram se conserva");
  assert.equal(g.estado, "programado");
  const p2 = piezaMulticanal("00ac");
  const raiz2 = raizCon([p2]);
  const fb2 = fbFalso();
  const r2 = await ejecutarPublicar({ config: { ...cfgFb, automatico: { ...cfgFb.automatico, pausa: true } }, raiz: raiz2, ahora, ig: igFalso(), clientes: { facebook: fb2 }, persistencia: persistenciaSimulada(raiz2), log });
  assert.equal(r2.motivo, "pausa-general");
  assert.deepEqual(r2.pospuestos, [p2.id]);
  assert.equal(fb2.llamadas.length, 0);
  assert.equal(leer(raiz2, p2.id).estado, "programado");
});

test("(multicanal) reserva persistida antes de enviar: el remoto recibe el intento reservado y luego el id del contenedor y la fase «enviando» antes de la llamada que publica", async () => {
  const p = piezaMulticanal("00ad", { facebook: versiones.facebook });
  const raiz = raizCon([p]);
  const persistencia = persistenciaSimulada(raiz);
  let vistoAlPublicar = null;
  const fb = fbFalso({ alPublicar: () => { vistoAlPublicar = guardadosDe(persistencia, p.id).map((s) => s?.destinos?.facebook?.intento?.fase || null); } });
  await ejecutarPublicar({ config: cfgFb, raiz, ahora, ig: igFalso(), clientes: { facebook: fb }, persistencia, log });
  assert.deepEqual(vistoAlPublicar, ["reservado", "contenedor", "enviando"], "en el momento de publicar ya estaban guardadas (y subidas) la reserva, el contenedor y la fase enviando");
  assert.equal(persistencia.eventos[0][0], "sincronizar", "antes de reservar se sincroniza con el remoto");
  const ultimo = guardadosDe(persistencia, p.id).pop();
  assert.equal(ultimo.destinos.facebook.estado, "publicado", "el resultado también se persiste de inmediato");
  assert.equal(ultimo.destinos.facebook.intento, null);
});

test("(multicanal) si la reserva no se puede subir (push rechazado tres veces) o el rebase entra en conflicto, no se envía nada y el post queda como estaba", async () => {
  const p = piezaMulticanal("00ae", { facebook: versiones.facebook });
  const raiz = raizCon([p]);
  const persistencia = persistenciaSimulada(raiz, { fallarPush: 3 });
  await persistencia.guardar([rutaDe(p.id)], "estado inicial"); // el "remoto" conoce el post tal cual (consume un fallo simulado)
  const persistencia2 = persistenciaSimulada(raiz, { fallarPush: 1 });
  persistencia2.guardados.set(rutaDe(p.id), JSON.parse(JSON.stringify(p)));
  const fb = fbFalso();
  const r = await ejecutarPublicar({ config: cfgFb, raiz, ahora, ig: igFalso(), clientes: { facebook: fb }, persistencia: persistencia2, log });
  assert.equal(fb.llamadas.length, 0, "sin reserva remota confirmada no hay envío");
  assert.equal(r.motivo, "persistencia");
  assert.ok(persistencia2.eventos.some((e) => e[0] === "descartar"), "la reserva local se descarta");
  const g = leer(raiz, p.id);
  assert.equal(g.destinos.facebook.estado, "pendiente");
  assert.equal(g.destinos.facebook.intento, null, "el post queda como estaba");
  const raizC = raizCon([p]);
  const fbC = fbFalso();
  const rC = await ejecutarPublicar({ config: cfgFb, raiz: raizC, ahora, ig: igFalso(), clientes: { facebook: fbC }, persistencia: persistenciaSimulada(raizC, { conflicto: true }), log });
  assert.equal(fbC.llamadas.length, 0);
  assert.equal(rC.motivo, "persistencia");
  assert.equal(leer(raizC, p.id).destinos.facebook.intento, null);
});

test("(multicanal) tras sincronizar se relee y revalida: si el operador quitó la pieza de la cola, apagó la red o cambió la versión, no se envía", async () => {
  const p = piezaMulticanal("00af", { facebook: versiones.facebook });
  const raiz = raizCon([p]);
  const fb = fbFalso();
  const persistencia = persistenciaSimulada(raiz, { alSincronizar: () => escribirPost(path.join(raiz, "posts"), { ...p, estado: "borrador", programado: null, destinos: undefined }) });
  const r = await ejecutarPublicar({ config: cfgFb, raiz, ahora, ig: igFalso(), clientes: { facebook: fb }, persistencia, log });
  assert.equal(fb.llamadas.length, 0);
  assert.deepEqual(r.publicados, []);
  assert.equal(leer(raiz, p.id).estado, "borrador", "se conservan los cambios del operador");
  // Interruptor apagado desde el panel mientras corría: leerConfigActual devuelve la configuración recién sincronizada.
  const raiz2 = raizCon([p]);
  const fb2 = fbFalso();
  const r2 = await ejecutarPublicar({ config: cfgFb, raiz: raiz2, ahora, ig: igFalso(), clientes: { facebook: fb2 }, persistencia: persistenciaSimulada(raiz2), leerConfigActual: () => ({ ...cfgFb, conexiones: { facebook: { publicar: false, pagina: "123" } } }), log });
  assert.equal(fb2.llamadas.length, 0);
  assert.equal(r2.destinos[p.id].facebook, "en-espera");
});

test("(multicanal) un fallo claro en Facebook no bloquea Instagram: la pieza queda en error de destino y Reintentar solo vuelve a llamar a Facebook", async () => {
  const p = piezaMulticanal("00ba");
  const raiz = raizCon([p]);
  const ig = igFalso();
  const error = Object.assign(new Error("(#200) Permissions error"), { codigo: 200 });
  const fb = fbFalso({ fallo: error });
  const r = await ejecutarPublicar({ config: cfgFb, raiz, ahora, ig, clientes: { facebook: fb }, persistencia: persistenciaSimulada(raiz), log });
  assert.deepEqual(r.errores, [p.id]);
  let g = leer(raiz, p.id);
  assert.equal(g.estado, "error");
  assert.equal(g.error.paso, "destino");
  assert.match(g.error.mensaje, /Facebook: \(#200\)/);
  assert.equal(g.destinos.instagram.estado, "publicado");
  assert.equal(g.destinos.facebook.estado, "error");
  assert.equal(g.destinos.facebook.error.intentos, 1);
  escribirPost(path.join(raiz, "posts"), reintentarDestinos(g, iso));
  const ig2 = igFalso(); const fb2 = fbFalso();
  const r2 = await ejecutarPublicar({ config: cfgFb, raiz, ahora, ig: ig2, clientes: { facebook: fb2 }, persistencia: persistenciaSimulada(raiz), log });
  assert.equal(ig2.llamadas.filter((l) => l[0] === "publicar").length, 0, "Instagram no se vuelve a publicar");
  assert.equal(fb2.llamadas.filter((l) => l[0] === "publicarContenedor").length, 1);
  g = leer(raiz, p.id);
  assert.equal(g.estado, "publicado");
  assert.deepEqual(r2.publicados, [p.id]);
});

test("(multicanal) respuesta incierta en Facebook: el destino queda incierto con su contenedor; la siguiente corrida solo lo da por publicado con la evidencia de la foto adjunta y nunca vuelve a publicar", async () => {
  const p = piezaMulticanal("00bb", { facebook: versiones.facebook });
  const raiz = raizCon([p]);
  const fb = fbFalso({ fallo: new ErrorIncierto("sin respuesta de Facebook tras enviar la petición") });
  const r = await ejecutarPublicar({ config: cfgFb, raiz, ahora, ig: igFalso(), clientes: { facebook: fb }, persistencia: persistenciaSimulada(raiz), log });
  assert.deepEqual(r.inciertos, [p.id]);
  let g = leer(raiz, p.id);
  assert.equal(g.estado, "programado");
  assert.equal(g.destinos.facebook.estado, "incierto");
  assert.equal(g.destinos.facebook.intento.contenedorId, "ph1");
  assert.equal(g.destinos.facebook.intento.fase, "enviando");
  // Corrida siguiente sin evidencia: sigue incierto, no se publica.
  const fb2 = fbFalso({ publicacionPrevia: null, existe: true });
  const r2 = await ejecutarPublicar({ config: cfgFb, raiz, ahora, ig: igFalso(), clientes: { facebook: fb2 }, persistencia: persistenciaSimulada(raiz), log });
  assert.equal(fb2.llamadas.filter((l) => l[0] === "publicarContenedor").length, 0);
  assert.deepEqual(r2.inciertos, [p.id]);
  assert.equal(leer(raiz, p.id).destinos.facebook.estado, "incierto");
  // Corrida con evidencia: la publicación con la foto ph1 existe → publicado con su id y enlace, sin llamar a publicar.
  const fb3 = fbFalso({ publicacionPrevia: { id: "ph1", idPublicacion: "123_789", permalink: "https://www.facebook.com/123/posts/789" } });
  const r3 = await ejecutarPublicar({ config: cfgFb, raiz, ahora, ig: igFalso(), clientes: { facebook: fb3 }, persistencia: persistenciaSimulada(raiz), log });
  assert.equal(fb3.llamadas.filter((l) => l[0] === "publicarContenedor").length, 0);
  assert.equal(fb3.llamadas.filter((l) => l[0] === "crearContenedor").length, 0);
  g = leer(raiz, p.id);
  assert.equal(g.destinos.facebook.estado, "publicado");
  assert.equal(g.destinos.facebook.publicacion.idPublicacion, "123_789");
  assert.deepEqual(r3.publicados, [p.id]);
});

test("(multicanal) decisión manual «volver a pendiente» tras un incierto: la corrida reanuda con la misma foto si existe (sin subir otra) y comprueba antes la evidencia", async () => {
  const p = piezaMulticanal("00bc", { facebook: versiones.facebook });
  const raiz = raizCon([p]);
  await ejecutarPublicar({ config: cfgFb, raiz, ahora, ig: igFalso(), clientes: { facebook: fbFalso({ fallo: new ErrorIncierto("corte") }) }, persistencia: persistenciaSimulada(raiz), log });
  escribirPost(path.join(raiz, "posts"), decidirIncierto(leer(raiz, p.id), "facebook", "pendiente", {}, iso));
  const fb = fbFalso({ existe: true, publicacionPrevia: null });
  const r = await ejecutarPublicar({ config: cfgFb, raiz, ahora, ig: igFalso(), clientes: { facebook: fb }, persistencia: persistenciaSimulada(raiz), log });
  assert.equal(fb.llamadas.filter((l) => l[0] === "publicacionConContenedor").length, 1, "primero se busca la evidencia");
  assert.equal(fb.llamadas.filter((l) => l[0] === "crearContenedor").length, 0, "la foto ph1 sigue existiendo: no se sube otra");
  assert.deepEqual(fb.llamadas.find((l) => l[0] === "publicarContenedor").slice(0, 2), ["publicarContenedor", "ph1"]);
  assert.deepEqual(r.publicados, [p.id]);
  assert.equal(leer(raiz, p.id).destinos.facebook.estado, "publicado");
});

test("(multicanal) incierto en Instagram: contenedor FINISHED se publica sin crear otro; ERROR o EXPIRED vuelve a pendiente y crea uno nuevo; PUBLISHED sin enlace sigue incierto", async () => {
  const p = piezaMulticanal("00bd", { instagram: versiones.instagram });
  const raiz = raizCon([p]);
  await ejecutarPublicar({ config: cfgBase, raiz, ahora, ig: igFalso({ fallo: new ErrorIncierto("corte") }), persistencia: persistenciaSimulada(raiz), log });
  let g = leer(raiz, p.id);
  assert.equal(g.destinos.instagram.estado, "incierto");
  assert.equal(g.destinos.instagram.intento.contenedorId, "c1");
  const igFinished = igFalso({ estadoContenedor: "FINISHED" });
  const r = await ejecutarPublicar({ config: cfgBase, raiz, ahora, ig: igFinished, persistencia: persistenciaSimulada(raiz), log });
  assert.equal(igFinished.llamadas.filter((l) => l[0] === "crearContenedor").length, 0);
  assert.deepEqual(igFinished.llamadas.find((l) => l[0] === "publicar"), ["publicar", "c1"]);
  assert.deepEqual(r.publicados, [p.id]);
  const p2 = piezaMulticanal("00be", { instagram: versiones.instagram });
  const raiz2 = raizCon([p2]);
  await ejecutarPublicar({ config: cfgBase, raiz: raiz2, ahora, ig: igFalso({ fallo: new ErrorIncierto("corte") }), persistencia: persistenciaSimulada(raiz2), log });
  const igExpired = igFalso({ estadoContenedor: "EXPIRED" });
  await ejecutarPublicar({ config: cfgBase, raiz: raiz2, ahora, ig: igExpired, persistencia: persistenciaSimulada(raiz2), log });
  assert.equal(igExpired.llamadas.filter((l) => l[0] === "crearContenedor").length, 1, "contenedor caducado: uno nuevo");
  assert.equal(leer(raiz2, p2.id).destinos.instagram.estado, "publicado");
  const p3 = piezaMulticanal("00bf", { instagram: versiones.instagram });
  const raiz3 = raizCon([p3]);
  await ejecutarPublicar({ config: cfgBase, raiz: raiz3, ahora, ig: igFalso({ fallo: new ErrorIncierto("corte") }), persistencia: persistenciaSimulada(raiz3), log });
  const igPublished = igFalso({ estadoContenedor: "PUBLISHED", medio: null });
  const r3 = await ejecutarPublicar({ config: cfgBase, raiz: raiz3, ahora, ig: igPublished, persistencia: persistenciaSimulada(raiz3), log });
  assert.equal(igPublished.llamadas.filter((l) => l[0] === "publicar").length, 0);
  assert.deepEqual(r3.inciertos, [p3.id]);
  const g3 = leer(raiz3, p3.id);
  assert.equal(g3.destinos.instagram.estado, "incierto");
  assert.match(g3.destinos.instagram.intento.incierto.motivo, /PUBLISHED/);
});

test("(multicanal) apagar Facebook conserva su entrega en espera; un destino omitido no se publica; lo aprobado no cambia si la pieza o la imagen cambian después", async () => {
  const p = piezaMulticanal("00ca");
  const raiz = raizCon([p]);
  const fbOff = fbFalso();
  const r = await ejecutarPublicar({ config: { ...cfgFb, conexiones: { facebook: { publicar: false, pagina: "123" } } }, raiz, ahora, ig: igFalso(), clientes: { facebook: fbOff }, persistencia: persistenciaSimulada(raiz), log });
  assert.equal(fbOff.llamadas.length, 0);
  assert.deepEqual(r.destinos[p.id], { instagram: "publicado", facebook: "en-espera" });
  assert.equal(leer(raiz, p.id).destinos.facebook.estado, "pendiente");
  const p2 = omitirDestino(piezaMulticanal("00cb"), "facebook", iso);
  const raiz2 = raizCon([p2]);
  const fb2 = fbFalso();
  await ejecutarPublicar({ config: cfgFb, raiz: raiz2, ahora, ig: igFalso(), clientes: { facebook: fb2 }, persistencia: persistenciaSimulada(raiz2), log });
  assert.equal(fb2.llamadas.length, 0);
  assert.equal(leer(raiz2, p2.id).estado, "publicado", "con Facebook omitido la pieza está completa al publicar Instagram");
  // Pieza editada después de aprobar: se publica el texto aprobado. Imagen regenerada después de aprobar: el destino espera.
  const p3 = { ...piezaMulticanal("00cc", { facebook: versiones.facebook }), caption: "Caption editado después" };
  const raiz3 = raizCon([p3]);
  const fb3 = fbFalso();
  await ejecutarPublicar({ config: cfgFb, raiz: raiz3, ahora, ig: igFalso(), clientes: { facebook: fb3 }, persistencia: persistenciaSimulada(raiz3), log });
  assert.equal(fb3.llamadas.find((l) => l[0] === "publicarContenedor")[2], versiones.facebook);
  const p4base = piezaMulticanal("00cd", { facebook: versiones.facebook });
  const p4 = { ...p4base, imagen: { ...p4base.imagen, hash: hashImagen(p4base, 2), version: 2 } };
  const raiz4 = raizCon([p4]);
  const fb4 = fbFalso();
  // La URL pública ya sirve el archivo regenerado (otra huella): el destino espera aunque la receta cambie o no.
  const r4 = await ejecutarPublicar({ config: cfgFb, raiz: raiz4, ahora, ig: igFalso(), clientes: { facebook: fb4 }, persistencia: persistenciaSimulada(raiz4), huellaImagenDe: async () => ({ ok: true, sha: "huella-regenerada" }), log });
  assert.equal(fb4.llamadas.length, 0);
  assert.equal(r4.destinos[p4.id].facebook, "imagen-cambiada");
  assert.equal(leer(raiz4, p4.id).destinos.facebook.estado, "pendiente");
});

test("(multicanal) compatibilidad: un programado antiguo sin destinos se publica en Instagram como siempre y gana su destino Instagram al guardarse", async () => {
  const antiguo = conImagen(aprobar({ ...base, id: base.id.slice(0, -4) + "00da" }, "2026-09-10T14:00:00-05:00", iso));
  assert.equal(antiguo.destinos, undefined);
  const raiz = raizCon([antiguo]);
  const ig = igFalso();
  const r = await ejecutarPublicar({ config: cfgFb, raiz, ahora, ig, clientes: { facebook: fbFalso() }, persistencia: persistenciaSimulada(raiz), log });
  assert.deepEqual(r.publicados, [antiguo.id]);
  const g = leer(raiz, antiguo.id);
  assert.equal(g.estado, "publicado");
  assert.equal(g.publicacion.idMedia, "m1");
  assert.equal(g.destinos.instagram.estado, "publicado");
  assert.equal(g.destinos.facebook, undefined, "Facebook no se añade a una pieza aprobada antes del multicanal");
  assert.match(ig.llamadas.find((l) => l[0] === "crearContenedor")[2], /Fuente: La Prensa/);
});

test("(multicanal) aislamiento: el cliente de Facebook se crea solo con el secreto de Facebook y el de Instagram solo con los de Instagram; una conexión apagada sin secretos no rompe nada", async () => {
  const raiz = raizConCuentas({ cuentas: ["sinlinea", "prueba"], prefijo: "aisl-" });
  const rutaCfg = path.join(raiz, "cuentas/prueba/config.json");
  const cfg = JSON.parse(fs.readFileSync(rutaCfg, "utf8"));
  fs.writeFileSync(rutaCfg, JSON.stringify({ ...cfg, instagram: { origen: "entorno" }, automatico: { generar: false, publicar: true }, conexiones: { facebook: { publicar: true, pagina: "123" } } }, null, 2));
  for (const c of ["sinlinea", "prueba"]) fs.writeFileSync(path.join(raiz, "data", c, "token-info.json"), JSON.stringify({ vence: "2026-11-01" }));
  const recibidos = {};
  const env = { IG_ACCESS_TOKEN: "IGAA" + "x".repeat(30), IG_USER_ID: "9", FB_PAGE_TOKEN: "EAA" + "y".repeat(30) };
  const r = await publicarCuentas({
    configuracion: cargarConfiguracion(raiz), raiz, ahora, log, soloCuenta: "prueba", porCuenta: true, env,
    igDe: (config, secretos) => { recibidos.instagram = secretos; return igFalso(); },
    clientesDe: (config, red, secretos) => { recibidos[red] = secretos; return fbFalso(); },
    persistenciaDe: () => persistenciaSimulada(raiz),
  });
  assert.deepEqual(recibidos.instagram, { token: env.IG_ACCESS_TOKEN, usuarioId: "9" });
  assert.deepEqual(recibidos.facebook, { token: env.FB_PAGE_TOKEN }, "solo su secreto: ni IG_ACCESS_TOKEN ni IG_USER_ID");
  assert.equal(r.resultados.prueba.error, undefined);
  // Conexión de Facebook apagada y sin secreto: la cuenta publica en Instagram y no falla por el secreto ausente.
  fs.writeFileSync(rutaCfg, JSON.stringify({ ...cfg, instagram: { origen: "entorno" }, automatico: { generar: false, publicar: true }, conexiones: { facebook: { publicar: false, pagina: "123" } } }, null, 2));
  const r2 = await publicarCuentas({ configuracion: cargarConfiguracion(raiz), raiz, ahora, log, soloCuenta: "prueba", porCuenta: true, env: { IG_ACCESS_TOKEN: env.IG_ACCESS_TOKEN, IG_USER_ID: "9" }, igDe: () => igFalso(), clientesDe: () => { throw new Error("no debe crearse"); }, persistenciaDe: () => persistenciaSimulada(raiz) });
  assert.equal(r2.resultados.prueba.error, undefined);
});

// --- F2 · Threads ---------------------------------------------------------------------------------------------------
function thFalso({ fallo = null, estadoContenedor = "FINISHED", medio = null, cuota = { usados: 0, limite: 250 }, perfil = { id: "555", username: "prueba.diario", coincideId: true }, alPublicar = null } = {}) {
  const llamadas = [];
  return {
    llamadas,
    perfil: async () => perfil,
    cuota: async () => cuota,
    imagenPublica: async () => true,
    crearContenedor: async ({ imageUrl, texto }) => { llamadas.push(["crearContenedor", imageUrl, texto]); return "t1"; },
    esperarContenedor: async (id) => { llamadas.push(["esperar", id]); },
    publicarContenedor: async (id) => { llamadas.push(["publicarContenedor", id]); if (alPublicar) alPublicar(); if (fallo) throw fallo; return { idMedia: "tm1", permalink: "https://www.threads.net/@prueba.diario/post/tm1" }; },
    estadoContenedor: async (id) => { llamadas.push(["estadoContenedor", id]); return { estado: estadoContenedor, detalle: "" }; },
    medioPorContenedor: async (id) => { llamadas.push(["medioPorContenedor", id]); return medio; },
  };
}
const cfgTh = { ...cfgFb, conexiones: { ...cfgFb.conexiones, threads: { publicar: true, usuario: "555", perfil: "prueba.diario" } } };
const versiones3 = { ...versiones, threads: "Texto TH\n\nFuente: La Prensa" };
const tresClientes = (extra = {}) => ({ facebook: fbFalso(), threads: thFalso(), ...extra });

test("(F2) una pieza con Instagram, Facebook y Threads sale en las tres redes; Threads persiste el contenedor y la fase enviando antes de publicar con creation_id y guarda id y enlace", async () => {
  const p = piezaMulticanal("00d1", versiones3);
  const raiz = raizCon([p]);
  const th = thFalso();
  const pers = persistenciaSimulada(raiz);
  const r = await ejecutarPublicar({ config: cfgTh, raiz, ahora, ig: igFalso(), clientes: { facebook: fbFalso(), threads: th }, persistencia: pers, log });
  assert.deepEqual(r.publicados, [p.id]);
  assert.deepEqual(th.llamadas, [["crearContenedor", p.imagen.url, "Texto TH\n\nFuente: La Prensa"], ["esperar", "t1"], ["publicarContenedor", "t1"]]);
  const g = leer(raiz, p.id);
  assert.equal(g.estado, "publicado");
  assert.equal(g.destinos.threads.estado, "publicado");
  assert.equal(g.destinos.threads.publicacion.id, "tm1");
  assert.equal(g.destinos.threads.publicacion.permalink, "https://www.threads.net/@prueba.diario/post/tm1");
  assert.equal(g.destinos.threads.intento, null);
  const fases = guardadosDe(pers, p.id).map((s) => s?.destinos?.threads?.intento?.fase).filter(Boolean);
  assert.deepEqual(fases, ["reservado", "contenedor", "enviando"], "reserva, contenedor y enviando suben al remoto antes de la llamada que publica");
  assert.ok(guardadosDe(pers, p.id).some((s) => s?.destinos?.threads?.intento?.fase === "contenedor" && s.destinos.threads.intento.contenedorId === "t1"));
});

test("(F2) aislamiento: solo Threads encendido (Instagram y Facebook apagados) publica con su cliente creado solo con THREADS_ACCESS_TOKEN; Threads apagado no crea cliente ni exige su secreto", async () => {
  const raiz = raizConCuentas({ cuentas: ["sinlinea", "prueba"], prefijo: "aisl-th-" });
  const rutaCfg = path.join(raiz, "cuentas/prueba/config.json");
  const cfg = JSON.parse(fs.readFileSync(rutaCfg, "utf8"));
  const escribir = (conexiones, automatico = { generar: false, publicar: false }) => fs.writeFileSync(rutaCfg, JSON.stringify({ ...cfg, instagram: { origen: "entorno" }, automatico, conexiones }, null, 2));
  escribir({ facebook: { publicar: false, pagina: "123" }, threads: { publicar: true, usuario: "555" } });
  for (const c of ["sinlinea", "prueba"]) fs.writeFileSync(path.join(raiz, "data", c, "token-info.json"), JSON.stringify({ vence: "2026-11-01" }));
  const p = { ...piezaMulticanal("00d2", versiones3), cuenta: "prueba" };
  escribirPost(path.join(raiz, "posts"), p);
  const recibidos = {};
  const th = thFalso();
  const env = { THREADS_ACCESS_TOKEN: "TH" + "z".repeat(30), FB_PAGE_TOKEN: "EAA" + "y".repeat(30) };
  const r = await publicarCuentas({
    configuracion: cargarConfiguracion(raiz), raiz, ahora, log, soloCuenta: "prueba", porCuenta: true, env,
    igDe: () => { throw new Error("Instagram apagado: no debe crearse"); },
    clientesDe: (config, red, secretos) => { recibidos[red] = secretos; if (red !== "threads") throw new Error(`no debe crearse ${red}`); return th; },
    persistenciaDe: () => persistenciaSimulada(raiz),
  });
  assert.equal(r.resultados.prueba.error, undefined);
  assert.deepEqual(Object.keys(recibidos), ["threads"]);
  assert.deepEqual(recibidos.threads, { token: env.THREADS_ACCESS_TOKEN }, "solo su secreto: ni FB_PAGE_TOKEN ni los de Instagram");
  const g = leer(raiz, p.id);
  assert.equal(g.destinos.threads.estado, "publicado");
  assert.equal(g.destinos.instagram.estado, "pendiente", "apagado no es omitido: Instagram espera");
  assert.equal(g.destinos.facebook.estado, "pendiente");
  assert.equal(g.estado, "programado");
  // Threads apagado y sin secreto: la cuenta sigue publicando en las demás redes.
  escribir({ facebook: { publicar: false, pagina: "123" }, threads: { publicar: false, usuario: "555" } }, { generar: false, publicar: true });
  const r2 = await publicarCuentas({ configuracion: cargarConfiguracion(raiz), raiz, ahora, log, soloCuenta: "prueba", porCuenta: true, env: { IG_ACCESS_TOKEN: "IGAA" + "x".repeat(30), IG_USER_ID: "9" }, igDe: () => igFalso(), clientesDe: () => { throw new Error("no debe crearse"); }, persistenciaDe: () => persistenciaSimulada(raiz) });
  assert.equal(r2.resultados.prueba.error, undefined, "el secreto ausente de una red apagada no rompe la cuenta");
  assert.equal(leer(raiz, p.id).destinos.threads.estado, "publicado", "lo ya publicado en Threads no se toca");
});

test("(F2) fallos parciales: un error claro en Threads no bloquea Instagram ni Facebook; la pieza queda en error de destino y Reintentar solo vuelve a llamar a Threads", async () => {
  const p = piezaMulticanal("00d3", versiones3);
  const raiz = raizCon([p]);
  const ig = igFalso(); const fb = fbFalso();
  const r = await ejecutarPublicar({ config: cfgTh, raiz, ahora, ig, clientes: { facebook: fb, threads: thFalso({ fallo: Object.assign(new Error("(#100) Invalid parameter"), { codigo: 100 }) }) }, persistencia: persistenciaSimulada(raiz), log });
  assert.deepEqual(r.errores, [p.id]);
  let g = leer(raiz, p.id);
  assert.equal(g.estado, "error");
  assert.equal(g.error.paso, "destino");
  assert.equal(g.destinos.instagram.estado, "publicado");
  assert.equal(g.destinos.facebook.estado, "publicado");
  assert.equal(g.destinos.threads.estado, "error");
  assert.match(g.destinos.threads.error.mensaje, /Invalid parameter/);
  escribirPost(path.join(raiz, "posts"), reintentarDestinos(g, iso));
  const ig2 = igFalso(); const fb2 = fbFalso(); const th2 = thFalso();
  const r2 = await ejecutarPublicar({ config: cfgTh, raiz, ahora, ig: ig2, clientes: { facebook: fb2, threads: th2 }, persistencia: persistenciaSimulada(raiz), log });
  assert.deepEqual(r2.publicados, [p.id]);
  assert.deepEqual(ig2.llamadas, []);
  assert.deepEqual(fb2.llamadas, []);
  assert.equal(th2.llamadas.filter((l) => l[0] === "publicarContenedor").length, 1);
  g = leer(raiz, p.id);
  assert.equal(g.estado, "publicado");
  assert.equal(g.destinos.threads.publicacion.id, "tm1");
});

test("(F2) incierto en Threads: un corte tras enviar deja el destino incierto con su contenedor; PUBLISHED con enlace reconcilia sin volver a publicar; FINISHED reanuda con el mismo contenedor; EXPIRED crea otro; PUBLISHED sin enlace sigue incierto", async () => {
  const solo = { threads: versiones3.threads };
  const p = piezaMulticanal("00d4", solo);
  const raiz = raizCon([p]);
  const r0 = await ejecutarPublicar({ config: cfgTh, raiz, ahora, clientes: tresClientes({ threads: thFalso({ fallo: new ErrorIncierto("sin respuesta de Threads tras enviar la petición") }) }), persistencia: persistenciaSimulada(raiz), log });
  assert.deepEqual(r0.inciertos, [p.id]);
  let g = leer(raiz, p.id);
  assert.equal(g.destinos.threads.estado, "incierto");
  assert.equal(g.destinos.threads.intento.fase, "enviando");
  assert.equal(g.destinos.threads.intento.contenedorId, "t1");
  assert.match(g.destinos.threads.intento.incierto.motivo, /sin respuesta de Threads/);
  // Evidencia: el contenedor figura PUBLISHED y expone el permalink → publicado, sin llamar a publicar.
  const thPub = thFalso({ estadoContenedor: "PUBLISHED", medio: { idMedia: "t1", permalink: "https://www.threads.net/@prueba.diario/post/t1" } });
  const r1 = await ejecutarPublicar({ config: cfgTh, raiz, ahora, clientes: tresClientes({ threads: thPub }), persistencia: persistenciaSimulada(raiz), log });
  assert.deepEqual(r1.publicados, [p.id]);
  assert.equal(thPub.llamadas.filter((l) => l[0] === "publicarContenedor" || l[0] === "crearContenedor").length, 0, "nunca se vuelve a publicar");
  g = leer(raiz, p.id);
  assert.equal(g.destinos.threads.estado, "publicado");
  assert.equal(g.destinos.threads.publicacion.id, "t1");
  assert.equal(g.destinos.threads.publicacion.permalink, "https://www.threads.net/@prueba.diario/post/t1");
  // FINISHED: el contenedor existe y no se publicó → se publica ese mismo, sin crear otro.
  const p2 = piezaMulticanal("00d5", solo);
  const raiz2 = raizCon([p2]);
  await ejecutarPublicar({ config: cfgTh, raiz: raiz2, ahora, clientes: tresClientes({ threads: thFalso({ fallo: new ErrorIncierto("corte") }) }), persistencia: persistenciaSimulada(raiz2), log });
  const thFin = thFalso({ estadoContenedor: "FINISHED" });
  const r2 = await ejecutarPublicar({ config: cfgTh, raiz: raiz2, ahora, clientes: tresClientes({ threads: thFin }), persistencia: persistenciaSimulada(raiz2), log });
  assert.deepEqual(r2.publicados, [p2.id]);
  assert.equal(thFin.llamadas.filter((l) => l[0] === "crearContenedor").length, 0);
  assert.deepEqual(thFin.llamadas.find((l) => l[0] === "publicarContenedor"), ["publicarContenedor", "t1"]);
  // EXPIRED: vuelve a pendiente con evidencia y crea un contenedor nuevo.
  const p3 = piezaMulticanal("00d6", solo);
  const raiz3 = raizCon([p3]);
  await ejecutarPublicar({ config: cfgTh, raiz: raiz3, ahora, clientes: tresClientes({ threads: thFalso({ fallo: new ErrorIncierto("corte") }) }), persistencia: persistenciaSimulada(raiz3), log });
  const thExp = thFalso({ estadoContenedor: "EXPIRED" });
  await ejecutarPublicar({ config: cfgTh, raiz: raiz3, ahora, clientes: tresClientes({ threads: thExp }), persistencia: persistenciaSimulada(raiz3), log });
  assert.equal(thExp.llamadas.filter((l) => l[0] === "crearContenedor").length, 1);
  assert.equal(leer(raiz3, p3.id).destinos.threads.estado, "publicado");
  // PUBLISHED sin enlace: no se afirma nada; sigue incierto para decidir en el panel.
  const p4 = piezaMulticanal("00d7", solo);
  const raiz4 = raizCon([p4]);
  await ejecutarPublicar({ config: cfgTh, raiz: raiz4, ahora, clientes: tresClientes({ threads: thFalso({ fallo: new ErrorIncierto("corte") }) }), persistencia: persistenciaSimulada(raiz4), log });
  const thSin = thFalso({ estadoContenedor: "PUBLISHED", medio: null });
  const r4 = await ejecutarPublicar({ config: cfgTh, raiz: raiz4, ahora, clientes: tresClientes({ threads: thSin }), persistencia: persistenciaSimulada(raiz4), log });
  assert.deepEqual(r4.inciertos, [p4.id]);
  assert.equal(thSin.llamadas.filter((l) => l[0] === "publicarContenedor").length, 0);
  const g4 = leer(raiz4, p4.id);
  assert.equal(g4.destinos.threads.estado, "incierto");
  assert.match(g4.destinos.threads.intento.incierto.motivo, /PUBLISHED/);
});

test("(F2) límites: con la cuota de Threads agotada su entrega espera (Instagram y Facebook salen); una versión que excede 500 (emojis por bytes) queda en error de destino sin recortar y sin llamar a Threads", async () => {
  const p = piezaMulticanal("00d8", versiones3);
  const raiz = raizCon([p]);
  const th = thFalso({ cuota: { usados: 250, limite: 250 } });
  const r = await ejecutarPublicar({ config: cfgTh, raiz, ahora, ig: igFalso(), clientes: { facebook: fbFalso(), threads: th }, persistencia: persistenciaSimulada(raiz), log });
  assert.deepEqual(r.pospuestos, [p.id]);
  assert.equal(r.destinos[p.id].threads, "cuota");
  assert.equal(th.llamadas.filter((l) => l[0] === "crearContenedor").length, 0);
  const g = leer(raiz, p.id);
  assert.equal(g.destinos.instagram.estado, "publicado");
  assert.equal(g.destinos.facebook.estado, "publicado");
  assert.equal(g.destinos.threads.estado, "pendiente");
  assert.equal(g.estado, "programado");
  const larga = "a".repeat(497) + "😀";
  const p2 = piezaMulticanal("00d9", { threads: larga });
  const raiz2 = raizCon([p2]);
  const th2 = thFalso();
  const r2 = await ejecutarPublicar({ config: cfgTh, raiz: raiz2, ahora, clientes: tresClientes({ threads: th2 }), persistencia: persistenciaSimulada(raiz2), log });
  assert.deepEqual(r2.errores, [p2.id]);
  assert.deepEqual(th2.llamadas, []);
  const g2 = leer(raiz2, p2.id);
  assert.equal(g2.destinos.threads.estado, "error");
  assert.match(g2.destinos.threads.error.mensaje, /501 caracteres.*500/);
  assert.equal(g2.destinos.threads.texto, larga, "no se recorta");
});

test("(F2) identidad de Threads: si el id del perfil no coincide o el usuario esperado es otro, no se publica en Threads (las demás redes sí); sin perfil esperado basta el id", async () => {
  const p = piezaMulticanal("00da", versiones3);
  const raiz = raizCon([p]);
  const thOtroId = thFalso({ perfil: { id: "999", username: "prueba.diario", coincideId: false } });
  const r = await ejecutarPublicar({ config: cfgTh, raiz, ahora, ig: igFalso(), clientes: { facebook: fbFalso(), threads: thOtroId }, persistencia: persistenciaSimulada(raiz), log });
  assert.equal(r.destinos[p.id].threads, "identidad");
  assert.match(r.identidadRedes.threads, /999.*se esperaba el perfil 555/);
  assert.deepEqual(thOtroId.llamadas, []);
  assert.equal(leer(raiz, p.id).destinos.facebook.estado, "publicado");
  const p2 = piezaMulticanal("00db", { threads: versiones3.threads });
  const raiz2 = raizCon([p2]);
  const thOtroUsuario = thFalso({ perfil: { id: "555", username: "otra.persona", coincideId: true } });
  const r2 = await ejecutarPublicar({ config: cfgTh, raiz: raiz2, ahora, clientes: tresClientes({ threads: thOtroUsuario }), persistencia: persistenciaSimulada(raiz2), log });
  assert.equal(r2.destinos[p2.id].threads, "identidad");
  assert.match(r2.identidadRedes.threads, /@otra\.persona.*se esperaba @prueba\.diario/);
  const sinPerfil = { ...cfgTh, conexiones: { ...cfgTh.conexiones, threads: { publicar: true, usuario: "555" } } };
  const p3 = piezaMulticanal("00dc", { threads: versiones3.threads });
  const raiz3 = raizCon([p3]);
  const r3 = await ejecutarPublicar({ config: sinPerfil, raiz: raiz3, ahora, clientes: tresClientes({ threads: thFalso({ perfil: { id: "555", username: "cualquiera", coincideId: true } }) }), persistencia: persistenciaSimulada(raiz3), log });
  assert.deepEqual(r3.publicados, [p3.id]);
});
