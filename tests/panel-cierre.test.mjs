// Cierre del Panel Maestro: reglas puras (isomorfas) que usa el panel para gestionar cuentas de principio a fin.
// - activación segura: generación solo con requisitos editoriales; publicación solo con identidad verificada;
// - programados vencidos que saldrían al reactivar la publicación;
// - guía de conexión (nombres exactos, enlaces a GitHub, pasos en Meta; nunca valores);
// - actividad por cuenta (último borrador, última publicación, última recogida, último error);
// - borrador manual creado desde el panel, válido para posts.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { requisitosGeneracion, requisitosPublicacion, postsVencidos, guiaConexion, resumenActividad, borradorDesdeFormulario } from "../src/lib/cuenta.mjs";
import { validarPost } from "../src/lib/posts.mjs";

const config = {
  nombre: "Nuevo Medio", marca: { usuario: "@nuevomedio" }, zonaHoraria: "America/Panama", franjas: ["08:00"],
  fuentes: [{ nombre: "La Prensa", tipo: "rss", url: "https://www.prensa.com/feed" }], editorial: { temas: ["Economía"], tono: "Claro" },
  automatico: { generar: false, publicar: false }, instagram: { origen: "entorno" }, ilustraciones: { activo: false },
};
const editorial = "# Línea editorial\n\nCubrimos economía local con datos verificables y sin opiniones inventadas.";

test("(cierre) requisitosGeneracion: hace falta editorial.md con contenido y al menos una fuente; con todo, no hay requisitos pendientes", () => {
  assert.deepEqual(requisitosGeneracion({ config, editorialMd: editorial }), []);
  const sinFuentes = requisitosGeneracion({ config: { ...config, fuentes: [] }, editorialMd: editorial });
  assert.equal(sinFuentes.length, 1); assert.match(sinFuentes[0], /fuente/i);
  const sinEditorial = requisitosGeneracion({ config, editorialMd: "  " });
  assert.equal(sinEditorial.length, 1); assert.match(sinEditorial[0], /editorial\.md/);
  assert.equal(requisitosGeneracion({ config: { ...config, fuentes: [] }, editorialMd: "" }).length, 2);
  assert.match(requisitosGeneracion({ config: { ...config, archivada: true }, editorialMd: editorial })[0], /archivada/);
});

test("(cierre) requisitosPublicacion: exige identidad verificada para el usuario configurado; una verificación pendiente, en error o de otro usuario bloquea", () => {
  const ahora = new Date("2026-09-10T12:00:00Z");
  const verificada = { estado: "verificada", usuario: "nuevomedio", comprobado: "2026-09-09T11:40:13.236Z", secretos: { tokenSecreto: "IG_ACCESS_TOKEN", usuarioIdSecreto: "IG_USER_ID", origen: "entorno", entorno: "cuenta-nuevo-medio" } };
  assert.deepEqual(requisitosPublicacion({ config, id: "nuevo-medio", conexion: verificada, ahora }), []);
  assert.match(requisitosPublicacion({ config, id: "nuevo-medio", conexion: null, ahora })[0], /verificar/i);
  assert.match(requisitosPublicacion({ config, id: "nuevo-medio", conexion: { ...verificada, estado: "error", detalle: "code 190" }, ahora })[0], /error/i);
  assert.match(requisitosPublicacion({ config: { ...config, marca: { usuario: "@otro" } }, id: "nuevo-medio", conexion: verificada, ahora })[0], /usuario/i);
  assert.match(requisitosPublicacion({ config: { ...config, archivada: true }, id: "nuevo-medio", conexion: verificada, ahora })[0], /archivada/);
});

test("(cierre) postsVencidos: solo los programados de esa cuenta cuya hora ya pasó, ordenados; los de otras cuentas y los futuros no", () => {
  const ahora = "2026-09-10T15:00:00Z";
  const posts = [
    { id: "a", cuenta: "x", estado: "programado", programado: "2026-09-10T09:30:00-05:00" }, // 14:30Z: vencido
    { id: "b", cuenta: "x", estado: "programado", programado: "2026-09-09T12:00:00-05:00" }, // vencido, más antiguo
    { id: "c", cuenta: "x", estado: "programado", programado: "2026-09-10T13:00:00-05:00" }, // 18:00Z: futuro
    { id: "d", cuenta: "y", estado: "programado", programado: "2026-09-09T12:00:00-05:00" },
    { id: "e", cuenta: "x", estado: "borrador", programado: null },
  ];
  assert.deepEqual(postsVencidos(posts, "x", ahora).map((p) => p.id), ["b", "a"]);
  assert.deepEqual(postsVencidos(posts, "z", ahora), []);
});

test("(cierre) guiaConexion: nombres exactos del Environment y de los secretos, enlaces a GitHub y pasos en Meta; nunca valores", () => {
  const g = guiaConexion({ config, id: "nuevo-medio", owner: "esquivelgolcher-web", repo: "sinlinea" });
  assert.equal(g.origen, "entorno");
  assert.equal(g.entorno, "cuenta-nuevo-medio");
  assert.deepEqual(g.secretos, ["IG_ACCESS_TOKEN", "IG_USER_ID"]);
  assert.equal(g.enlaces.entornos, "https://github.com/esquivelgolcher-web/sinlinea/settings/environments");
  assert.equal(g.enlaces.nuevoEntorno, "https://github.com/esquivelgolcher-web/sinlinea/settings/environments/new");
  assert.equal(g.enlaces.probar, "https://github.com/esquivelgolcher-web/sinlinea/actions/workflows/probar-instagram.yml");
  assert.equal(g.enlaces.meta, "https://developers.facebook.com/apps/");
  assert.ok(g.pasos.some((p) => /Meta/.test(p) && /Generate token/.test(p)), "el paso de Meta nombra dónde se genera el token");
  assert.ok(g.pasos.some((p) => /cuenta-nuevo-medio/.test(p)), "el paso de GitHub nombra el Environment exacto");
  assert.ok(g.pasos.some((p) => /Verificar identidad/.test(p)));
  const r = guiaConexion({ config: { ...config, instagram: { tokenSecreto: "IG_ACCESS_TOKEN_NUEVO_MEDIO", usuarioIdSecreto: "IG_USER_ID_NUEVO_MEDIO" } }, id: "nuevo-medio", owner: "o", repo: "r" });
  assert.equal(r.origen, "repositorio"); assert.equal(r.entorno, null);
  assert.deepEqual(r.secretos, ["IG_ACCESS_TOKEN_NUEVO_MEDIO", "IG_USER_ID_NUEVO_MEDIO"]);
  assert.equal(r.enlaces.secretosRepositorio, "https://github.com/o/r/settings/secrets/actions/new");
  const sinRepo = guiaConexion({ config, id: "nuevo-medio", owner: null, repo: null });
  assert.equal(sinRepo.enlaces.entornos, null, "sin repositorio conocido no se inventan enlaces");
});

test("(cierre) resumenActividad: último borrador generado, última publicación, última recogida y último error, sin inventar fechas", () => {
  const posts = [
    { id: "p1", cuenta: "x", estado: "publicado", creado: "2026-09-07T13:36:00Z", publicacion: { fecha: "2026-09-08T08:07:03.535Z" } },
    { id: "p2", cuenta: "x", estado: "borrador", creado: "2026-09-09T12:38:00Z", publicacion: null },
    { id: "p3", cuenta: "x", estado: "error", creado: "2026-09-08T10:00:00Z", error: { paso: "publicar", mensaje: "code 190", cuando: "2026-09-08T11:05:00Z" } },
    { id: "p4", cuenta: "y", estado: "borrador", creado: "2026-09-09T20:00:00Z" },
  ];
  const r = resumenActividad({ posts, cuenta: "x", conexion: { estado: "error", comprobado: "2026-09-08T15:05:00Z", detalle: "code 190" }, metricasEstado: { ultimaCorrida: "2026-09-09T13:31:01.710Z", llamadas: 10 } });
  assert.equal(r.ultimoBorrador, "2026-09-09T12:38:00Z");
  assert.equal(r.ultimaPublicacion, "2026-09-08T08:07:03.535Z");
  assert.equal(r.ultimaRecogida, "2026-09-09T13:31:01.710Z");
  assert.equal(r.errores.length, 2);
  assert.match(r.errores[0].texto, /code 190/);
  const vacio = resumenActividad({ posts: [], cuenta: "z", conexion: null, metricasEstado: null });
  assert.deepEqual(vacio, { ultimoBorrador: null, ultimaPublicacion: null, ultimaRecogida: null, errores: [] });
});

test("(cierre) borradorDesdeFormulario crea un post válido para posts.mjs, con cuenta, variante, fuente y escena opcional, sin imagen (REGENERAR la dibuja)", () => {
  const ahora = new Date("2026-09-10T15:04:00Z");
  const entrada = { categoria: "ECONOMÍA", titular: "El Canal cierra un año récord", bajada: "Ingresos por encima de lo previsto", caption: "El Canal de Panamá cerró el año fiscal con ingresos récord.", hashtags: ["#Panamá", "Canal"], fuente: { medio: "La Prensa", url: "https://www.prensa.com/economia/canal", titulo: "Canal récord", publicado: "2026-09-10T12:00:00Z" }, escena: "Esclusas al amanecer" };
  const post = borradorDesdeFormulario(entrada, { cuenta: "nuevo-medio", zona: "America/Panama", ahora, variante: "amarillo", ilustracionesActivas: true, postsExistentes: [] });
  assert.doesNotThrow(() => validarPost(post));
  assert.equal(post.cuenta, "nuevo-medio");
  assert.equal(post.estado, "borrador");
  assert.match(post.id, /^2026-09-10-1004-nuevo-medio-la-prensa-[0-9a-f]{4}$/, "hora local de Panamá, cuenta y medio en el id");
  assert.equal(post.variante, "amarillo");
  assert.equal(post.imagen, null);
  assert.deepEqual(post.hashtags, ["#Panamá", "#Canal"]);
  assert.equal(post.ilustracion.descripcion, "Esclusas al amanecer");
  assert.equal(post.ilustracion.usar, true);
  const sinEscena = borradorDesdeFormulario({ ...entrada, escena: "" }, { cuenta: "nuevo-medio", zona: "America/Panama", ahora, ilustracionesActivas: false, postsExistentes: [post] });
  assert.equal(sinEscena.ilustracion, null);
  assert.notEqual(sinEscena.variante, "amarillo", "sin variante indicada, rota respecto a la última del mismo tipo");
  assert.throws(() => borradorDesdeFormulario({ ...entrada, categoria: "OTRA" }, { cuenta: "nuevo-medio", zona: "America/Panama", ahora }), /categor/i);
  assert.throws(() => borradorDesdeFormulario({ ...entrada, fuente: { medio: "", url: "x", publicado: "" } }, { cuenta: "nuevo-medio", zona: "America/Panama", ahora }), /fuente/i);
});
