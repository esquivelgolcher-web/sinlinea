import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  REDES, ESTADOS_DESTINO, destinosDe, aprobarDestinos, omitirDestino, reintentarDestinos, reservarDestino, avanzarIntento,
  marcarDestinoPublicado, marcarDestinoError, marcarDestinoIncierto, decidirIncierto, estadoGeneral, sincronizarLegado,
  hashPieza, piezaCambiada, imagenCambiada, resumenDestinos, actualizarVersion, aprobarImagenActual,
} from "../src/lib/destinos.mjs";
import { validarPost } from "../src/lib/posts.mjs";
import { aprobar, hashImagen } from "../src/lib/estados.mjs";

const base = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));
const iso = "2026-09-10T12:00:00.000Z";
const conImagen = (p) => ({ ...p, imagen: { ruta: `public/img/${p.id}.jpg`, url: `https://u.github.io/sinlinea/img/${p.id}.jpg`, hash: hashImagen(p, 1), version: 1, renderizada: iso } });
const versiones = { instagram: "Texto IG\n\nFuente: La Prensa", facebook: "Texto FB\n\nFuente: La Prensa" };
const aprobado = () => aprobarDestinos(conImagen(base), "2026-09-10T13:00:00-05:00", { versiones }, iso);

test("(destinos) F1 opera con instagram y facebook; los estados de destino son los cinco del diseño", () => {
  assert.deepEqual(REDES, ["instagram", "facebook"]);
  assert.deepEqual(ESTADOS_DESTINO, ["pendiente", "publicado", "error", "incierto", "omitido"]);
});

test("(destinos) un post antiguo sin `destinos` se lee como destino Instagram derivado de publicacion/error/estado, sin reescribirlo", () => {
  assert.deepEqual(destinosDe(base), {}, "un borrador no tiene destinos todavía");
  const programado = aprobar(base, "2026-09-10T13:00:00-05:00", iso);
  const d = destinosDe(programado);
  assert.equal(d.instagram.estado, "pendiente");
  assert.equal(d.instagram.texto, null, "sin versión aprobada: se compone al publicar, como hasta ahora");
  const publicado = { ...programado, estado: "publicado", publicacion: { idMedia: "m1", permalink: "https://www.instagram.com/p/x/", fecha: iso } };
  assert.deepEqual(destinosDe(publicado).instagram.publicacion, { id: "m1", idPublicacion: null, permalink: "https://www.instagram.com/p/x/", fecha: iso });
  const conError = { ...programado, estado: "error", error: { paso: "instagram", mensaje: "rechazado", fecha: iso } };
  assert.equal(destinosDe(conError).instagram.estado, "error");
  assert.equal(destinosDe(conError).instagram.error.mensaje, "rechazado");
  assert.equal(programado.destinos, undefined, "derivar no modifica el post");
});

test("(destinos) aprobar guarda por destino el texto revisado y el hash de la pieza y de la imagen aprobadas; el post queda programado", () => {
  const p = aprobado();
  assert.equal(p.estado, "programado");
  assert.equal(p.programado, "2026-09-10T13:00:00-05:00");
  assert.deepEqual(Object.keys(p.destinos), ["instagram", "facebook"]);
  assert.equal(p.destinos.facebook.texto, versiones.facebook);
  assert.equal(p.destinos.facebook.estado, "pendiente");
  assert.equal(p.destinos.facebook.aprobado.hashPieza, hashPieza(p));
  assert.equal(p.destinos.facebook.aprobado.imagenHash, p.imagen.hash);
  assert.equal(p.destinos.facebook.aprobado.fecha, iso);
  assert.doesNotThrow(() => validarPost(p));
  assert.throws(() => aprobarDestinos(base, "2026-09-10T13:00:00-05:00", { versiones: {} }, iso), /al menos un destino/);
  assert.throws(() => aprobarDestinos(base, "2026-09-10T13:00:00-05:00", { versiones: { tiktok: "x" } }, iso), /tiktok/);
});

test("(destinos) volver a aprobar conserva los destinos publicados u omitidos y quita los pendientes que ya no se seleccionan", () => {
  let p = aprobado();
  p = marcarDestinoPublicado(p, "instagram", { id: "m1", permalink: "https://www.instagram.com/p/x/" }, iso);
  const otra = aprobarDestinos(p, "2026-09-11T13:00:00-05:00", { versiones: { facebook: "Nuevo texto FB" } }, iso);
  assert.equal(otra.destinos.instagram.estado, "publicado", "lo publicado no se toca");
  assert.equal(otra.destinos.facebook.texto, "Nuevo texto FB");
  const sinFb = aprobarDestinos(p, "2026-09-11T13:00:00-05:00", { versiones: { instagram: "x" } }, iso);
  assert.equal(sinFb.destinos.facebook, undefined, "un pendiente que se deselecciona antes de salir se quita");
  assert.equal(sinFb.destinos.instagram.estado, "publicado");
  assert.equal(sinFb.destinos.instagram.publicacion.id, "m1");
});

test("(destinos) omitir es explícito, deja fecha y autor, y nunca puede vaciar la pieza", () => {
  const p = omitirDestino(aprobado(), "facebook", iso, { por: "operador" });
  assert.equal(p.destinos.facebook.estado, "omitido");
  assert.deepEqual(p.destinos.facebook.omitido, { fecha: iso, por: "operador" });
  assert.equal(p.estado, "programado", "instagram sigue pendiente");
  assert.throws(() => omitirDestino(p, "instagram", iso), /último destino/);
  assert.throws(() => omitirDestino(marcarDestinoPublicado(aprobado(), "facebook", { id: "f1", permalink: "https://www.facebook.com/1" }, iso), "facebook", iso), /publicado/);
});

test("(destinos) el estado general se deriva sin perder información: pendiente manda, luego error, y publicado solo si todo salió", () => {
  let p = aprobado();
  p = marcarDestinoPublicado(p, "instagram", { id: "m1", permalink: "https://www.instagram.com/p/x/" }, iso);
  assert.equal(p.estado, "programado", "facebook sigue pendiente");
  assert.deepEqual(p.publicacion, { idMedia: "m1", permalink: "https://www.instagram.com/p/x/", fecha: iso }, "publicacion refleja Instagram para el panel y las métricas actuales");
  assert.deepEqual(resumenDestinos(p.destinos), { publicados: 1, pendientes: 1, errores: 0, inciertos: 0, omitidos: 0 });
  const conFallo = marcarDestinoError(p, "facebook", { mensaje: "(#200) sin permiso" }, iso);
  assert.equal(conFallo.estado, "error");
  assert.equal(conFallo.error.paso, "destino");
  assert.match(conFallo.error.mensaje, /Facebook/);
  assert.equal(conFallo.destinos.facebook.error.intentos, 1);
  assert.equal(conFallo.destinos.instagram.estado, "publicado");
  assert.doesNotThrow(() => validarPost(conFallo));
  const todo = marcarDestinoPublicado(p, "facebook", { id: "ph1", idPublicacion: "123_456", permalink: "https://www.facebook.com/123/posts/456" }, iso);
  assert.equal(todo.estado, "publicado");
  assert.equal(todo.destinos.facebook.publicacion.idPublicacion, "123_456");
  assert.equal(estadoGeneral({ instagram: { estado: "omitido" }, facebook: { estado: "publicado" } }), "publicado");
  assert.equal(estadoGeneral({ instagram: { estado: "incierto" }, facebook: { estado: "error" } }), "programado", "incierto cuenta como pendiente");
});

test("(destinos) reintentar solo toca los destinos en error; publicados, omitidos e inciertos no cambian", () => {
  let p = aprobado();
  p = marcarDestinoPublicado(p, "instagram", { id: "m1", permalink: "https://www.instagram.com/p/x/" }, iso);
  p = marcarDestinoError(p, "facebook", { mensaje: "fallo" }, iso);
  const r = reintentarDestinos(p, iso);
  assert.equal(r.estado, "programado");
  assert.equal(r.error, null);
  assert.equal(r.destinos.facebook.estado, "pendiente");
  assert.equal(r.destinos.facebook.error, null);
  assert.equal(r.destinos.facebook.intentosPrevios, 1, "se recuerda cuántas veces falló");
  assert.equal(r.destinos.instagram.estado, "publicado");
  assert.throws(() => reintentarDestinos(aprobado(), iso), /nada que reintentar/);
});

test("(destinos) la reserva y los pasos intermedios quedan en `intento` con ids; un incierto conserva el intento; volver a pendiente recuerda el último intento", () => {
  let p = reservarDestino(aprobado(), "facebook", { n: 1 }, iso);
  assert.deepEqual(p.destinos.facebook.intento, { n: 1, fase: "reservado", inicio: iso, actualizado: iso, contenedorId: null });
  p = avanzarIntento(p, "facebook", { fase: "contenedor", contenedorId: "ph1" }, "2026-09-10T12:00:05.000Z");
  assert.equal(p.destinos.facebook.intento.fase, "contenedor");
  assert.equal(p.destinos.facebook.intento.contenedorId, "ph1");
  assert.throws(() => avanzarIntento(p, "facebook", { fase: "volando" }, iso), /[Ff]ase/);
  const inc = marcarDestinoIncierto(p, "facebook", { motivo: "sin respuesta tras enviar" }, iso);
  assert.equal(inc.destinos.facebook.estado, "incierto");
  assert.equal(inc.destinos.facebook.intento.contenedorId, "ph1", "la evidencia para reconciliar se conserva");
  assert.equal(inc.destinos.facebook.intento.incierto.motivo, "sin respuesta tras enviar");
  assert.equal(inc.estado, "programado");
  const pend = decidirIncierto(inc, "facebook", "pendiente", {}, iso);
  assert.equal(pend.destinos.facebook.estado, "pendiente");
  assert.equal(pend.destinos.facebook.intento, null);
  assert.equal(pend.destinos.facebook.ultimoIntento.contenedorId, "ph1");
  const pub = decidirIncierto(inc, "facebook", "publicado", { permalink: "https://www.facebook.com/123/posts/456" }, iso);
  assert.equal(pub.destinos.facebook.estado, "publicado");
  assert.equal(pub.destinos.facebook.publicacion.id, "manual");
  assert.equal(pub.destinos.facebook.publicacion.permalink, "https://www.facebook.com/123/posts/456");
  const om = decidirIncierto(inc, "facebook", "omitido", { por: "operador" }, iso);
  assert.equal(om.destinos.facebook.estado, "omitido");
  assert.throws(() => decidirIncierto(inc, "facebook", "otra", {}, iso), /[Dd]ecisión/);
  assert.throws(() => decidirIncierto(aprobado(), "facebook", "pendiente", {}, iso), /incierto/);
});

test("(destinos) cambiar la pieza común o regenerar la imagen después de aprobar no cambia lo aprobado; se detecta y se actualiza solo a petición", () => {
  const p = aprobado();
  assert.equal(piezaCambiada(p, "facebook"), false);
  assert.equal(imagenCambiada(p, "facebook"), false);
  const editado = { ...p, caption: "Otro caption" };
  assert.equal(piezaCambiada(editado, "facebook"), true);
  assert.equal(editado.destinos.facebook.texto, versiones.facebook, "el texto aprobado sigue intacto");
  const actualizado = actualizarVersion(editado, "facebook", "Versión nueva revisada", iso);
  assert.equal(actualizado.destinos.facebook.texto, "Versión nueva revisada");
  assert.equal(piezaCambiada(actualizado, "facebook"), false);
  const regenerada = { ...p, imagen: { ...p.imagen, hash: "otrohash", version: 2 } };
  assert.equal(imagenCambiada(regenerada, "facebook"), true);
  const aceptada = aprobarImagenActual(regenerada, iso);
  assert.equal(imagenCambiada(aceptada, "facebook"), false);
  assert.equal(imagenCambiada(aceptada, "instagram"), false);
  assert.throws(() => actualizarVersion(marcarDestinoPublicado(p, "facebook", { id: "f", permalink: "https://www.facebook.com/1" }, iso), "facebook", "x", iso), /publicado/);
});

test("(destinos) validarPost acepta destinos bien formados y rechaza estados, redes o intentos inválidos", () => {
  const p = aprobado();
  assert.doesNotThrow(() => validarPost(p));
  assert.throws(() => validarPost({ ...p, destinos: { ...p.destinos, facebook: { ...p.destinos.facebook, estado: "volando" } } }), /destinos\.facebook\.estado/);
  assert.throws(() => validarPost({ ...p, destinos: { ...p.destinos, tiktok: p.destinos.facebook } }), /tiktok/);
  assert.throws(() => validarPost({ ...p, destinos: { ...p.destinos, facebook: { ...p.destinos.facebook, intento: { fase: "x" } } } }), /intento/);
  assert.doesNotThrow(() => validarPost(sincronizarLegado(marcarDestinoError(p, "facebook", { mensaje: "f" }, iso))));
});
