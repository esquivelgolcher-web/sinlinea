// PUBLICAR: posts programados con hora cumplida → sus destinos (Instagram; F1: páginas de Facebook; F2: perfiles de Threads).
// Reglas (docs/superpowers/specs/2026-09-09-multicanal-design.md §3.4 y §4): cada destino se reserva y se SUBE al remoto
// antes de enviar; un fallo en una red no bloquea a las demás; un publicado nunca se repite; un incierto se conserva
// hasta reconciliar con evidencia (ids de contenedor) o decidirlo a mano; apagar una red no omite su entrega.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cargarConfiguracion, cargarGlobal, cargarCuenta, configDeCuenta } from "./lib/config.mjs";
import { leerPosts, escribirPost, CUENTA_LEGADO } from "./lib/posts.mjs";
import { marcarError, imagenDesactualizada } from "./lib/estados.mjs";
import { crearClienteInstagram } from "./lib/instagram.mjs";
import { crearClienteFacebook } from "./lib/facebook.mjs";
import { crearClienteThreads } from "./lib/threads.mjs";
import { esPublicable, formatoDe } from "./lib/formatos.mjs";
import { esCarrusel, imagenesDe, LIMITES_CARRUSEL } from "./lib/destinos.mjs";

const mismaLista = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
import { claveDia } from "./lib/fechas.mjs";
import { ocultarSecretos, leerSecretos, leerSecretosDeRed, nombresDeSecretos, origenDeSecretos, describirCredenciales } from "./lib/secretos.mjs";
import { todasFallaron, anotarFallos, resumirResultados } from "./lib/corrida.mjs";
import {
  REDES, NOMBRES_RED, destinosDe, reservarDestino, avanzarIntento, marcarDestinoPublicado, marcarDestinoError, marcarDestinoIncierto,
  decidirIncierto, marcarEspera,
} from "./lib/destinos.mjs";
import { descargarHuella } from "./lib/huella.mjs";
import { proponerVersion, medirVersion } from "./lib/versiones.mjs";
import { REDES_CONEXION, destinosEncendidos, pausaGeneral, identificadorDe, conexionDe } from "./lib/conexiones.mjs";
import { esIncierto } from "./lib/incierto.mjs";
import { persistenciaLocal, crearPersistenciaGit } from "./lib/persistencia.mjs";

const MAX_ESPERAS_IMAGEN = 3;

export function leerTokenInfo(raiz, rutaDatos = "data") {
  const ruta = path.join(raiz, rutaDatos, "token-info.json");
  if (!fs.existsSync(ruta)) return { vence: null };
  try { return JSON.parse(fs.readFileSync(ruta, "utf8")); } catch { return { vence: null }; }
}

function avisarToken(raiz, ahora, config, log) {
  const rutaDatos = config.rutas?.datos || "data";
  const info = leerTokenInfo(raiz, rutaDatos);
  if (!info.vence) { log.warn(`${rutaDatos}/token-info.json: caducidad del token de Instagram desconocida.`); return; }
  const dias = Math.floor((Date.parse(info.vence) - Date.parse(claveDia(ahora, config.zonaHoraria))) / 86400000);
  if (dias < 7) log.warn(`El token de Instagram vence en ${dias} días (${info.vence}); revisa renovar-token.yml.`);
}

// Configuración de la cuenta tal como está en disco AHORA (tras sincronizar): así se respeta un interruptor o una pausa
// que el operador cambió desde el panel mientras corría la publicación. Si no se puede leer, se usa la de la corrida.
function leerConfigDeDisco(raiz, config) {
  try {
    const global = cargarGlobal(path.join(raiz, "config.json"));
    return configDeCuenta(global, cargarCuenta(raiz, config.cuenta), config.cuenta);
  } catch {
    return config;
  }
}

// Reconciliación con evidencia de un intento anterior (destino incierto o vuelto a pendiente por el operador).
//   { resultado: "publicado", publicacion } · { resultado: "pendiente", reanudarCon } · { resultado: "incierto", motivo }
// Por construcción, la llamada que publica solo se hace con la fase "enviando" ya persistida: un intento en fase
// "reservado" o "contenedor" no llegó a enviar nada. Nunca se usa el texto como evidencia.
// `reanudarCon`: { contenedorId, hijos } con lo que se puede reutilizar sin duplicar (un carrusel guarda sus contenedores
// hijos —o fotos sin publicar en Facebook— además del contenedor padre).
export async function reconciliarDestino({ red, cliente, destino, intento }) {
  const cid = intento?.contenedorId || null;
  const hijos = Array.isArray(intento?.hijos) && intento.hijos.length ? intento.hijos : null;
  if (!intento || intento.fase === "reservado" || (!cid && !hijos)) return { resultado: "pendiente", reanudarCon: null };
  if (red === "facebook") {
    const ids = hijos || [cid];
    if (intento.fase === "enviando") {
      const pub = await cliente.publicacionConContenedor(hijos || cid, { desde: intento.inicio });
      if (pub) return { resultado: "publicado", publicacion: pub };
    }
    let existentes = 0;
    for (const id of ids) if (await cliente.existeContenedor(id)) existentes++;
    if (intento.fase === "enviando" && destino.estado === "incierto") {
      return { resultado: "incierto", motivo: `sin evidencia: no aparece ninguna publicación con ${ids.length > 1 ? "las fotos" : "la foto"} ${ids.join(", ")} en el muro de la página; comprueba la página y decide en el panel` };
    }
    return { resultado: "pendiente", reanudarCon: existentes === ids.length ? (hijos ? { hijos } : { contenedorId: cid }) : null };
  }
  if (red === "instagram" || red === "threads") {
    // Misma forma en Instagram y Threads: el contenedor conserva su estado y, publicado, el mismo id da el medio y su enlace.
    if (!cid) {
      // Solo hay hijos (se interrumpió antes de crear el carrusel): se reutilizan si siguen listos; si no, se crean otros.
      for (const h of hijos) { const e = await cliente.estadoContenedor(h); if (e.estado !== "FINISHED") return { resultado: "pendiente", reanudarCon: null }; }
      return { resultado: "pendiente", reanudarCon: { hijos } };
    }
    const e = await cliente.estadoContenedor(cid);
    if (e.estado === "PUBLISHED") {
      const medio = typeof cliente.medioPorContenedor === "function" ? await cliente.medioPorContenedor(cid) : null;
      if (medio) return { resultado: "publicado", publicacion: { id: medio.idMedia, permalink: medio.permalink } };
      return { resultado: "incierto", motivo: `${NOMBRES_RED[red]} confirma que el contenedor ${cid} se publicó (PUBLISHED) pero no expone el enlace: márcalo como publicado desde el panel con el enlace de la app` };
    }
    if (e.estado === "FINISHED") return { resultado: "pendiente", reanudarCon: { contenedorId: cid, hijos } };
    if (e.estado === "IN_PROGRESS") return { resultado: "incierto", motivo: `el contenedor ${cid} sigue en proceso (IN_PROGRESS); se vuelve a comprobar en la próxima corrida` };
    if (e.estado === "ERROR" || e.estado === "EXPIRED") return { resultado: "pendiente", reanudarCon: null };
    if (intento.fase === "enviando" && destino.estado === "incierto") return { resultado: "incierto", motivo: `estado del contenedor ${cid} desconocido (${e.detalle || "sin detalle"}); comprueba la cuenta y decide en el panel` };
    return { resultado: "pendiente", reanudarCon: null };
  }
  return { resultado: "incierto", motivo: `red ${red} sin reconciliación automática` };
}

export async function ejecutarPublicar({ config, raiz = process.cwd(), ahora = new Date(), ig = null, clientes = {}, persistencia = null, leerConfigActual = null, huellaImagenDe = null, log = console, dryRun = false }) {
  if (/CAMBIAR/.test(config.pages.baseUrl)) throw new Error("config.json: pages.baseUrl todavía tiene el valor CAMBIAR");
  const dir = path.join(raiz, "posts");
  const iso = ahora.toISOString();
  const cuenta = config.cuenta || CUENTA_LEGADO;
  const resumen = { publicados: [], errores: [], pospuestos: [], inciertos: [], destinos: {} };
  const persist = persistencia || persistenciaLocal();
  const todosClientes = { ...clientes, instagram: clientes.instagram ?? ig ?? null };
  const listos = leerPosts(dir, { cuentaPorDefecto: config.cuentaPrincipal || CUENTA_LEGADO })
    .filter((p) => p.cuenta === cuenta && p.estado === "programado" && Date.parse(p.programado) <= ahora.getTime())
    .sort((a, b) => Date.parse(a.programado) - Date.parse(b.programado));
  if (pausaGeneral(config)) {
    log.info(`Cuenta ${cuenta}: pausa general (automatico.pausa); ${listos.length} programado(s) quedan en cola en todas las redes.`);
    return { ...resumen, motivo: "pausa-general", pospuestos: listos.map((p) => p.id) };
  }
  const encendidos = destinosEncendidos(config);
  if (!encendidos.length) {
    log.info(`Cuenta ${cuenta}: publicación automática desactivada en todas las redes; ${listos.length} programado(s) quedan en cola.`);
    return { ...resumen, motivo: "publicar-desactivado", pospuestos: listos.map((p) => p.id) };
  }
  if (encendidos.includes("instagram")) avisarToken(raiz, ahora, config, log);
  if (!listos.length) { log.info("Nada que publicar."); return resumen; }

  // Identidad por red, una vez por corrida: la credencial debe pertenecer a la cuenta o página configurada.
  const identidad = {};
  async function identidadOk(red) {
    if (identidad[red] !== undefined) return identidad[red];
    const cliente = todosClientes[red];
    if (!cliente || typeof cliente.perfil !== "function") { identidad[red] = true; return true; }
    const perfil = await cliente.perfil();
    let ok = true; let detalle = "";
    if (red === "instagram") {
      const esperado = String(config.marca.usuario).replace(/^@/, "").toLowerCase();
      const usuario = String(perfil.username || "").toLowerCase();
      ok = usuario === esperado && perfil.coincideId !== false;
      detalle = `la credencial pertenece a @${perfil.username || "?"}${perfil.coincideId === false ? " (id numérico distinto al secreto)" : ""}; se esperaba ${config.marca.usuario}`;
      resumen.identidad = ok ? "ok" : detalle;
    } else if (red === "threads") {
      const cx = conexionDe(config, "threads");
      const esperado = String(cx.perfil || "").replace(/^@/, "").toLowerCase();
      const usuario = String(perfil.username || "").toLowerCase();
      ok = perfil.coincideId !== false && (!esperado || usuario === esperado);
      detalle = `la credencial pertenece al perfil @${perfil.username || "?"} (${perfil.id || "?"}); se esperaba ${perfil.coincideId === false ? `el perfil ${cx.usuario || "(sin id)"}` : `@${esperado}`}`;
      resumen.identidadRedes = { ...(resumen.identidadRedes || {}), [red]: ok ? "ok" : detalle };
    } else {
      ok = perfil.coincideId !== false;
      detalle = `la credencial pertenece a la página ${perfil.nombre || "?"} (${perfil.id || "?"}); se esperaba la página ${identificadorDe(config, red) || "(sin id)"}`;
      resumen.identidadRedes = { ...(resumen.identidadRedes || {}), [red]: ok ? "ok" : detalle };
    }
    if (!ok) log.warn(`Cuenta ${cuenta}: identidad de ${NOMBRES_RED[red]} no coincide (${detalle}); no se publica en ${NOMBRES_RED[red]}.`);
    identidad[red] = ok;
    return ok;
  }
  // Cuota de publicación por red (Instagram y Threads la exponen), una consulta por corrida; agotada, la entrega espera.
  const cuotas = {};
  async function hayCuota(red) {
    const cliente = todosClientes[red];
    if (!cliente || typeof cliente.cuota !== "function") return true;
    if (!cuotas[red]) { const q = await cliente.cuota(); cuotas[red] = { ...q, disponibles: q.limite - q.usados }; }
    return cuotas[red].disponibles > 0;
  }
  const clienteImagen = () => Object.values(todosClientes).find((c) => c && typeof c.imagenPublica === "function") || null;
  // Huella del archivo que se sirve en la URL pública (lo que van a leer las redes), una descarga por pieza y corrida.
  const huellaDe = huellaImagenDe || ((url) => descargarHuella(url));
  const huellas = new Map();
  const huellaServida = async (url) => { if (!huellas.has(url)) huellas.set(url, await huellaDe(url)); return huellas.get(url); };

  let abortar = null;
  for (const inicial of listos) {
    if (abortar) { resumen.pospuestos.push(inicial.id); continue; }
    let post = inicial;
    const ruta = `posts/${post.id}.json`;
    // Perfil editorial: el reel no tiene adaptador de publicación; se revisa en el panel y espera sin enviarse.
    if (!esPublicable(formatoDe(post))) {
      log.warn(`${post.id}: formato ${formatoDe(post)} sin adaptador de publicación; la pieza espera sin enviarse a ninguna red.`);
      resumen.destinos[post.id] = { formato: "no-publicable" };
      resumen.pospuestos.push(post.id);
      continue;
    }
    // Un carrusel se publica con sus diapositivas renderizadas (entre 2 y 10); sin ellas espera al render.
    if (formatoDe(post) === "carrusel" && !esCarrusel(post)) {
      log.warn(`${post.id}: el carrusel no tiene sus diapositivas renderizadas (entre ${LIMITES_CARRUSEL.min} y ${LIMITES_CARRUSEL.max}); la pieza espera.`);
      resumen.destinos[post.id] = { formato: "carrusel-sin-diapositivas" };
      resumen.pospuestos.push(post.id);
      continue;
    }
    const redes = REDES.filter((red) => ["pendiente", "incierto"].includes(destinosDe(post)[red]?.estado));
    if (!redes.length) { resumen.pospuestos.push(post.id); continue; }
    const estadoDestinos = {};
    resumen.destinos[post.id] = estadoDestinos;

    // La imagen (una para todas las redes) debe existir, estar al día y ser pública.
    if (!post.imagen?.url || imagenDesactualizada(post)) {
      log.warn(`${post.id}: la imagen no está lista (falta o está desactualizada); se espera al re-render.`);
      resumen.pospuestos.push(post.id);
      continue;
    }
    const ci = clienteImagen();
    // Todas las imágenes que se publican (la del post o cada diapositiva) deben ser públicas.
    let imagenNoPublica = null;
    if (ci) for (const img of imagenesDe(post)) { if (!(await ci.imagenPublica(img.url))) { imagenNoPublica = img.url; break; } }
    if (imagenNoPublica) {
      const esperas = (post.esperasImagen || 0) + 1;
      if (esperas >= MAX_ESPERAS_IMAGEN) {
        escribirPost(dir, marcarError(post, { paso: "render", mensaje: `La imagen ${imagenNoPublica} no está disponible públicamente tras ${esperas} intentos` }, iso));
        resumen.errores.push(post.id);
      } else {
        escribirPost(dir, { ...post, esperasImagen: esperas, actualizado: iso });
        resumen.pospuestos.push(post.id);
      }
      log.warn(`${post.id}: imagen aún no pública (intento ${esperas}/${MAX_ESPERAS_IMAGEN}).`);
      continue;
    }
    if (post.esperasImagen) post = { ...post, esperasImagen: 0 };

    const guardarPost = async (mensaje) => {
      escribirPost(dir, post);
      return persist.guardar([ruta], mensaje);
    };
    // Pasos intermedios (id de contenedor, fase enviando) también van al remoto: son la evidencia para reconciliar.
    const persistirIntermedio = async (red, fase) => {
      const g = await guardarPost(`intento (${cuenta}): ${post.id} → ${NOMBRES_RED[red]} ${fase}`);
      if (!g.ok) throw Object.assign(new Error(`no se pudo guardar el intento en el remoto (${g.motivo || "sin detalle"})`), { persistencia: true });
    };
    // Contenedores hijos de un carrusel (Instagram, Threads) o fotos sin publicar (Facebook): se crean en el orden de las
    // diapositivas y se suben al remoto antes de crear el contenedor padre, para reutilizarlos si la corrida se corta.
    async function crearHijos(red, cliente) {
      const hijos = [];
      for (const img of imagenesDe(post)) {
        hijos.push(red === "facebook" ? await cliente.crearContenedor({ imageUrl: img.url }) : await cliente.crearContenedorHijo({ imageUrl: img.url }));
      }
      post = avanzarIntento(post, red, { fase: "contenedor", hijos }, iso);
      await persistirIntermedio(red, "contenedor (hijos)");
      return hijos;
    }
    async function enviar(red, cliente, texto, reanudar) {
      const imageUrl = post.imagen.url;
      const carrusel = esCarrusel(post);
      let contenedorId = reanudar?.contenedorId || null;
      let hijos = reanudar?.hijos || null;
      if (red === "instagram") {
        if (!carrusel && typeof cliente.crearContenedor !== "function") {
          // Cliente antiguo de una sola llamada: fase enviando persistida y publicación directa.
          post = avanzarIntento(post, red, { fase: "enviando" }, iso);
          await persistirIntermedio(red, "enviando");
          const r = await cliente.publicarImagen({ imageUrl, caption: texto });
          return { id: r.idMedia, permalink: r.permalink };
        }
        if (!contenedorId) {
          if (carrusel) {
            if (!hijos) hijos = await crearHijos(red, cliente);
            for (const h of hijos) await cliente.esperarContenedor(h);
            contenedorId = await cliente.crearCarrusel({ hijos, caption: texto });
          } else {
            contenedorId = await cliente.crearContenedor({ imageUrl, caption: texto });
          }
          post = avanzarIntento(post, red, { fase: "contenedor", contenedorId, hijos }, iso);
          await persistirIntermedio(red, "contenedor");
          await cliente.esperarContenedor(contenedorId);
        }
        post = avanzarIntento(post, red, { fase: "enviando", contenedorId }, iso);
        await persistirIntermedio(red, "enviando");
        const idMedia = await cliente.publicar(contenedorId);
        return { id: String(idMedia), permalink: typeof cliente.permalink === "function" ? await cliente.permalink(idMedia) : "" };
      }
      if (red === "facebook") {
        if (carrusel) {
          if (!hijos) hijos = await crearHijos(red, cliente);
          post = avanzarIntento(post, red, { fase: "enviando", hijos }, iso);
          await persistirIntermedio(red, "enviando");
          return cliente.publicarContenedor({ hijos, texto });
        }
        if (!contenedorId) {
          contenedorId = await cliente.crearContenedor({ imageUrl });
          post = avanzarIntento(post, red, { fase: "contenedor", contenedorId }, iso);
          await persistirIntermedio(red, "contenedor");
        }
        post = avanzarIntento(post, red, { fase: "enviando", contenedorId }, iso);
        await persistirIntermedio(red, "enviando");
        return cliente.publicarContenedor({ contenedorId, texto });
      }
      if (red === "threads") {
        if (!contenedorId) {
          if (carrusel) {
            if (!hijos) hijos = await crearHijos(red, cliente);
            for (const h of hijos) await cliente.esperarContenedor(h);
            contenedorId = await cliente.crearCarrusel({ hijos, texto });
          } else {
            contenedorId = await cliente.crearContenedor({ imageUrl, texto });
          }
          post = avanzarIntento(post, red, { fase: "contenedor", contenedorId, hijos }, iso);
          await persistirIntermedio(red, "contenedor");
          await cliente.esperarContenedor(contenedorId);
        }
        post = avanzarIntento(post, red, { fase: "enviando", contenedorId }, iso);
        await persistirIntermedio(red, "enviando");
        const r = await cliente.publicarContenedor(contenedorId);
        return { id: String(r.idMedia), permalink: r.permalink || "" };
      }
      throw new Error(`Red sin cliente de publicación: ${red}`);
    }

    for (const red of redes) {
      let d = destinosDe(post)[red];
      if (!encendidos.includes(red)) { estadoDestinos[red] = "en-espera"; continue; }
      const cliente = todosClientes[red];
      if (!cliente) { estadoDestinos[red] = "sin-cliente"; log.warn(`${post.id}: ${NOMBRES_RED[red]} está encendido pero no hay cliente (faltan credenciales); la entrega espera.`); continue; }
      if (!(await identidadOk(red))) { estadoDestinos[red] = "identidad"; continue; }

      // Intento que dejó una corrida interrumpida sin registrar resultado (el remoto conserva la última fase subida):
      // en fase enviando pudo publicarse → incierto, y solo la evidencia decide; en fase contenedor se reutiliza lo creado.
      if (d.estado === "pendiente" && d.intento?.fase === "enviando") {
        post = marcarDestinoIncierto(post, red, { motivo: "la corrida anterior se interrumpió tras enviar sin registrar el resultado" }, iso);
        await guardarPost(`publicar (${cuenta}): ${post.id} ${NOMBRES_RED[red]} incierto tras una corrida interrumpida`);
        d = destinosDe(post)[red];
      }
      // Reconciliación de un intento anterior: incierto, interrumpido antes de enviar, o pendiente tras una decisión manual.
      let reanudarCon = null;
      const previo = d.estado === "incierto" ? d.intento : (d.intento || d.ultimoIntento || null);
      if (previo) {
        let r;
        try { r = await reconciliarDestino({ red, cliente, destino: d, intento: previo }); }
        catch (err) { estadoDestinos[red] = "incierto"; log.warn(`${post.id}: no se pudo reconciliar ${NOMBRES_RED[red]} (${ocultarSecretos(err.message)}); sigue incierto.`); continue; }
        if (r.resultado === "publicado") {
          post = marcarDestinoPublicado(post, red, r.publicacion, iso);
          await guardarPost(`publicar (${cuenta}): ${post.id} ${NOMBRES_RED[red]} reconciliado con evidencia`);
          estadoDestinos[red] = "publicado";
          log.info(`Reconciliado ${post.id} en ${NOMBRES_RED[red]}: ya estaba publicado (${r.publicacion.permalink || r.publicacion.idPublicacion || r.publicacion.id}).`);
          continue;
        }
        if (r.resultado === "incierto") {
          if (d.estado !== "incierto" || d.intento?.incierto?.motivo !== r.motivo) {
            post = marcarDestinoIncierto(post, red, { motivo: r.motivo }, iso);
            await guardarPost(`publicar (${cuenta}): ${post.id} ${NOMBRES_RED[red]} sigue incierto`);
          }
          estadoDestinos[red] = "incierto";
          log.warn(`${post.id}: ${NOMBRES_RED[red]} sigue incierto (${r.motivo}).`);
          continue;
        }
        if (d.estado === "incierto") {
          // Evidencia de que no salió: vuelve a pendiente (se recuerda el intento) y se persiste antes de reservar.
          post = decidirIncierto(post, red, "pendiente", {}, iso);
          await guardarPost(`publicar (${cuenta}): ${post.id} ${NOMBRES_RED[red]} vuelve a pendiente con evidencia`);
        }
        reanudarCon = r.reanudarCon;
      }

      const dPend = destinosDe(post)[red];
      const texto = dPend.texto ?? proponerVersion(post, red).texto;
      const medida = medirVersion(texto, red);
      if (medida.excede) {
        post = marcarDestinoError(post, red, { mensaje: medida.errores.join(" ") }, iso);
        await guardarPost(`publicar (${cuenta}): ${post.id} ${NOMBRES_RED[red]} error de versión`);
        estadoDestinos[red] = "error";
        continue;
      }
      // La imagen aprobada está vinculada a un archivo estable: se descarga la imagen de la URL pública y solo se envía si
      // su huella es la aprobada. Sin huella aprobada (se aprobó antes de que existiera el archivo) hay que aprobarla.
      if (dPend.aprobado) {
        let motivoEspera = null;
        // Carrusel: una huella aprobada por diapositiva, en su orden; post: la única imagen.
        const imagenes = imagenesDe(post);
        const esperadas = esCarrusel(post) ? (dPend.aprobado.imagenesSha || null) : [dPend.aprobado.imagenSha];
        if (!esperadas || esperadas.length !== imagenes.length || esperadas.some((s) => !s)) motivoEspera = "imagen-sin-aprobar";
        else {
          let noDescargable = null;
          for (let i = 0; i < imagenes.length && !motivoEspera && !noDescargable; i++) {
            const h = await huellaServida(imagenes[i].url);
            if (!h.ok) noDescargable = h;
            else if (h.sha !== esperadas[i]) motivoEspera = "imagen-cambiada";
          }
          if (noDescargable) {
            estadoDestinos[red] = "imagen-no-descargable";
            log.warn(`${post.id}: no se pudo descargar la imagen pública para comprobar que es la aprobada (${noDescargable.motivo || "sin detalle"}); ${NOMBRES_RED[red]} espera.`);
            continue;
          }
        }
        if (motivoEspera) {
          if (dPend.espera?.motivo !== motivoEspera) {
            post = marcarEspera(post, red, { motivo: motivoEspera }, iso);
            await guardarPost(`publicar (${cuenta}): ${post.id} ${NOMBRES_RED[red]} en espera (${motivoEspera})`);
          }
          estadoDestinos[red] = motivoEspera;
          log.warn(`${post.id}: ${motivoEspera === "imagen-cambiada" ? "la imagen servida ya no es la aprobada" : "la imagen no está aprobada"} para ${NOMBRES_RED[red]}; aprueba la imagen actual en el panel antes de publicar.`);
          continue;
        }
      }
      if (!(await hayCuota(red))) {
        estadoDestinos[red] = "cuota";
        log.warn(`Cuota de ${NOMBRES_RED[red]} agotada (${cuotas[red].usados}/${cuotas[red].limite}); ${post.id} espera.`);
        continue;
      }
      if (dryRun) { log.info(`[dry-run] Publicaría ${post.id} en ${NOMBRES_RED[red]}: ${post.titular}`); estadoDestinos[red] = "dry-run"; continue; }

      // RESERVA: sincronizar, releer y revalidar, escribir el intento y subirlo. Sin reserva remota no hay envío.
      const s = await persist.sincronizar();
      if (!s.ok) {
        abortar = s.conflicto ? `conflicto al sincronizar (${(s.archivos || []).join(", ") || "archivos"})` : `sincronización fallida (${s.motivo || "sin detalle"})`;
        estadoDestinos[red] = "persistencia";
        log.warn(`${post.id}: ${abortar}; no se publica en ${NOMBRES_RED[red]} ni en el resto de esta corrida. Los cambios del operador se conservan.`);
        break;
      }
      const releido = leerPosts(dir, { cuentaPorDefecto: config.cuentaPrincipal || CUENTA_LEGADO, log: { warn: () => {} } }).find((x) => x.id === post.id) || null;
      const configActual = leerConfigActual ? leerConfigActual() : leerConfigDeDisco(raiz, config);
      const dr = releido ? destinosDe(releido)[red] : null;
      const sigueListo = releido && releido.estado === "programado" && Date.parse(releido.programado) <= ahora.getTime()
        && dr && dr.estado === "pendiente" && (dr.texto ?? null) === (dPend.texto ?? null)
        && (dr.aprobado?.imagenHash ?? null) === (dPend.aprobado?.imagenHash ?? null) && (dr.aprobado?.imagenSha ?? null) === (dPend.aprobado?.imagenSha ?? null)
        && mismaLista(dr.aprobado?.imagenesSha, dPend.aprobado?.imagenesSha) && mismaLista(imagenesDe(releido).map((i) => i.url), imagenesDe(post).map((i) => i.url))
        && (releido.imagen?.hash ?? null) === (post.imagen?.hash ?? null) && (releido.imagen?.url ?? null) === (post.imagen?.url ?? null)
        && !pausaGeneral(configActual) && destinosEncendidos(configActual).includes(red);
      if (!sigueListo) {
        estadoDestinos[red] = "en-espera";
        log.info(`${post.id}: ${NOMBRES_RED[red]} ya no está listo tras sincronizar (el operador cambió la pieza, la versión, la imagen o los interruptores); no se envía.`);
        if (releido) post = { ...releido, esperasImagen: post.esperasImagen ?? releido.esperasImagen };
        continue;
      }
      post = inicial.esperasImagen ? { ...releido, esperasImagen: 0 } : releido;
      post = reservarDestino(post, red, { n: (dPend.intentosPrevios || 0) + 1 }, iso);
      const g = await guardarPost(`reserva (${cuenta}): ${post.id} → ${NOMBRES_RED[red]}`);
      if (!g.ok) {
        await persist.descartarLocal();
        abortar = `no se pudo subir la reserva (${g.motivo || "sin detalle"})`;
        estadoDestinos[red] = "persistencia";
        log.warn(`${post.id}: ${abortar}; no se publica en ${NOMBRES_RED[red]} ni en el resto de esta corrida.`);
        break;
      }

      // ENVÍO
      try {
        const publicado = await enviar(red, cliente, texto, typeof reanudarCon === "string" ? { contenedorId: reanudarCon } : reanudarCon);
        post = marcarDestinoPublicado(post, red, publicado, iso);
        estadoDestinos[red] = "publicado";
        if (cuotas[red]) cuotas[red].disponibles -= 1;
        log.info(`Publicado ${post.id} en ${NOMBRES_RED[red]}: ${publicado.permalink || publicado.idPublicacion || publicado.id}`);
      } catch (err) {
        if (err.persistencia) {
          abortar = err.message;
          estadoDestinos[red] = "persistencia";
          log.warn(`${post.id}: ${abortar}; se detiene la publicación de esta corrida sin enviar ${NOMBRES_RED[red]}.`);
          escribirPost(dir, post);
          break;
        }
        const mensaje = ocultarSecretos(err.message);
        if (esIncierto(err)) {
          post = marcarDestinoIncierto(post, red, { motivo: mensaje }, iso);
          estadoDestinos[red] = "incierto";
          log.warn(`${post.id}: resultado incierto en ${NOMBRES_RED[red]} (${mensaje}); se reconcilia en la próxima corrida o desde el panel.`);
        } else {
          post = marcarDestinoError(post, red, { mensaje }, iso);
          estadoDestinos[red] = "error";
          log.warn(`${NOMBRES_RED[red]} rechazó ${post.id}: ${mensaje}`);
        }
      }
      await guardarPost(`publicar (${cuenta}): ${post.id} ${NOMBRES_RED[red]} ${estadoDestinos[red]}`);
    }

    if (post.estado === "publicado") resumen.publicados.push(post.id);
    else if (post.estado === "error") resumen.errores.push(post.id);
    else if (Object.values(estadoDestinos).includes("incierto")) resumen.inciertos.push(post.id);
    else resumen.pospuestos.push(post.id);
    if (abortar) break;
  }
  if (abortar) resumen.motivo = "persistencia";
  return resumen;
}

// Ejecuta PUBLICAR para cada cuenta activa. `igDe(config, secretos)` crea el cliente de Instagram; `clientesDe(config, red,
// secretos)` el de cada red nueva, solo con los secretos de esa red; `persistenciaDe(config)` la persistencia remota.
// Un fallo en una cuenta se registra y no detiene a las demás. `soloCuenta`/`porCuenta`: job por cuenta de los workflows.
export async function publicarCuentas({ configuracion, raiz = process.cwd(), ahora = new Date(), log = console, dryRun = false, igDe, clientesDe = null, persistenciaDe = null, huellaImagenDe = null, soloCuenta = null, porCuenta = false, env = null }) {
  const resultados = {};
  for (const e of configuracion.errores || []) {
    if (soloCuenta && e.cuenta !== soloCuenta) continue;
    resultados[e.cuenta] = { error: e.mensaje };
    (log.error || log.warn)(`Cuenta ${e.cuenta}: configuración inválida, se omite (${e.mensaje}).`);
  }
  for (const config of configuracion.cuentas) {
    if (soloCuenta && config.cuenta !== soloCuenta) continue;
    if (config.archivada) { resultados[config.cuenta] = { publicados: [], errores: [], pospuestos: [], motivo: "archivada" }; log.info(`Cuenta ${config.cuenta}: archivada, se omite (su cola se conserva).`); continue; }
    if (!porCuenta && origenDeSecretos(config) === "entorno") {
      resultados[config.cuenta] = { publicados: [], errores: [], pospuestos: [], motivo: "entorno-requiere-job-por-cuenta" };
      log.warn(`Cuenta ${config.cuenta}: sus credenciales viven en el Environment cuenta-${config.cuenta}; solo se procesa en el job por cuenta (--cuenta ${config.cuenta} --por-cuenta). Se omite aquí y su cola se conserva.`);
      continue;
    }
    const credenciales = describirCredenciales(config, { porCuenta });
    log.info(`Cuenta ${config.cuenta}: credenciales · ${credenciales}`);
    try {
      const encendidos = pausaGeneral(config) ? [] : destinosEncendidos(config);
      let ig = null;
      const clientes = {};
      if (encendidos.includes("instagram")) {
        const secretos = env ? leerSecretos(config, env, { porCuenta }) : null;
        ig = await igDe(config, secretos);
      }
      for (const red of REDES_CONEXION) {
        if (!encendidos.includes(red) || !clientesDe) continue;
        const secretos = env ? leerSecretosDeRed(config, red, env) : null;
        clientes[red] = await clientesDe(config, red, secretos);
      }
      const persistencia = persistenciaDe ? persistenciaDe(config) : null;
      resultados[config.cuenta] = { ...(await ejecutarPublicar({ config, raiz, ahora, ig, clientes, persistencia, huellaImagenDe, log, dryRun })), credenciales };
    } catch (err) {
      const mensaje = ocultarSecretos(err.message);
      resultados[config.cuenta] = { error: mensaje };
      (log.error || log.warn)(`Cuenta ${config.cuenta}: falló PUBLICAR (${mensaje}); se continúa con las demás.`);
    }
  }
  return { resultados };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const porCuenta = process.argv.includes("--por-cuenta");
  const i = process.argv.indexOf("--cuenta");
  const soloCuenta = i >= 0 ? String(process.argv[i + 1] || "").trim() || null : null;
  const configuracion = cargarConfiguracion();
  const igDe = (config, secretos) => {
    if (dryRun && !process.env[nombresDeSecretos(config, { porCuenta }).token]) {
      return { cuota: async () => ({ usados: 0, limite: 100 }), imagenPublica: async () => true, publicarImagen: async () => { throw new Error("no aplica en dry-run"); } };
    }
    const { token, usuarioId } = secretos || leerSecretos(config, process.env, { porCuenta });
    return crearClienteInstagram({ token, usuarioId, apiVersion: config.instagram.apiVersion });
  };
  const clientesDe = (config, red, secretos) => {
    if (dryRun && !secretos) return { imagenPublica: async () => true };
    if (red === "facebook") return crearClienteFacebook({ token: secretos.token, paginaId: identificadorDe(config, "facebook"), apiVersion: config.instagram.apiVersion });
    if (red === "threads") return crearClienteThreads({ token: secretos.token, usuarioId: identificadorDe(config, "threads") });
    throw new Error(`Red sin cliente: ${red}`);
  };
  const persistenciaDe = () => (dryRun ? persistenciaLocal() : crearPersistenciaGit({ raiz: process.cwd(), log: console }));
  const r = await publicarCuentas({ configuracion, dryRun, igDe, clientesDe, persistenciaDe, soloCuenta, porCuenta, env: dryRun ? null : process.env });
  console.log(`Listo: ${resumirResultados(r.resultados, (x) => `${x.publicados.length} publicados, ${x.errores.length} con error, ${(x.inciertos || []).length} inciertos, ${x.pospuestos.length} pospuestos`)}${dryRun ? " [dry-run]" : ""}.`);
  anotarFallos(r.resultados, "PUBLICAR");
  if (todasFallaron(r.resultados)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(`Error en publicar: ${ocultarSecretos(err.message)}`); process.exit(1); });
}
