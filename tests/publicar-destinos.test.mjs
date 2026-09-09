import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ejecutarPublicar, publicarCuentas } from "../src/publicar.mjs";
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
const piezaMulticanal = (sufijo = "00aa", redes = versiones) => aprobarDestinos(conImagen({ ...base, id: base.id.slice(0, -4) + sufijo }), "2026-09-10T14:00:00-05:00", { versiones: redes }, iso);

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
  const r4 = await ejecutarPublicar({ config: cfgFb, raiz: raiz4, ahora, ig: igFalso(), clientes: { facebook: fb4 }, persistencia: persistenciaSimulada(raiz4), log });
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
