// Panel de aprobación de Sin Línea. Sin framework. Todo texto va por textContent.
import { aprobar, descartar, quitarDeCola, reintentar, editarTexto, imagenDesactualizada, hashTexto, CATEGORIAS, VARIANTES } from "./lib/estados.mjs";
import { componerCaption, validarCaption, normalizarHashtags, LIMITES } from "./lib/caption.mjs";
import { validarTextos, LIMITES as LIMITES_TEXTO } from "./lib/texto.mjs";
import { siguienteFranjaLibre, franjasOcupadas, choca } from "./lib/franjas.mjs";
import { claveDia, isoDesdeClave, horaMinutoDeIso, ZONA_PANAMA } from "./lib/fechas.mjs";
import { crearAlmacenLocal, crearAlmacenGitHub, deducirRepo, ErrorConflicto } from "./almacen.mjs";

const configPanel = { franjas: ["07:00", "09:30", "12:00", "14:30", "17:00", "19:30"], zonaHoraria: ZONA_PANAMA, marca: {}, cuentas: [] };
async function cargarConfigPanel() {
  try {
    const r = await fetch("./config.json", { cache: "no-store" });
    if (r.ok) Object.assign(configPanel, await r.json());
  } catch { /* se usan los valores por defecto */ }
  if (!Array.isArray(configPanel.cuentas) || !configPanel.cuentas.length) {
    configPanel.cuentas = [{ id: "sinlinea", nombre: configPanel.marca.nombre || "Sin Línea", marca: configPanel.marca, franjas: configPanel.franjas, zonaHoraria: configPanel.zonaHoraria }];
  }
}
// --- Cuentas ----------------------------------------------------------------
const cuentaPrincipal = () => configPanel.cuentaPrincipal || configPanel.cuentas[0].id;
const cuentaDe = (post) => post.cuenta || cuentaPrincipal(); // los posts antiguos sin cuenta son de la principal
const configDeCuenta = (id) => configPanel.cuentas.find((c) => c.id === id) || configPanel.cuentas[0];
function elegirCuentaInicial() {
  let guardada = null;
  try { guardada = localStorage.getItem("sinlinea.cuenta"); } catch { /* sin almacenamiento */ }
  const existe = (id) => configPanel.cuentas.some((c) => c.id === id);
  estado.cuenta = existe(guardada) ? guardada : (existe(cuentaPrincipal()) ? cuentaPrincipal() : configPanel.cuentas[0].id);
}
function seleccionarCuenta(id) {
  estado.cuenta = id;
  try { localStorage.setItem("sinlinea.cuenta", id); } catch { /* sin almacenamiento */ }
  cargar();
}
const PESTANAS = [
  ["borrador", "Borradores"], ["programado", "Programados"], ["error", "Errores"], ["publicado", "Publicados"], ["descartado", "Descartados"],
];
const estado = { almacen: null, items: [], pestana: "borrador", borradores: new Map(), cuenta: null };
const $ = (id) => document.getElementById(id);
const ahoraIso = () => new Date().toISOString();
const urlSegura = (u) => (/^https?:\/\//i.test(String(u)) ? u : "#");

// Pistas sobre el estado de la ilustración de un post (usadas por el sondeo y la tarjeta).
export function generandoIlustracion(ilus) {
  return Boolean(ilus && ilus.usar && !ilus.ruta && !ilus.error);
}
export function regenerandoIlustracion(ilus) {
  return Boolean(ilus && ilus.usar && ilus.ruta && ilus.hashDescripcion !== hashTexto(ilus.descripcion));
}

function el(tag, props = {}, hijos = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) n.setAttribute(k, v);
  }
  for (const h of hijos) n.append(h);
  return n;
}

function avisar(mensaje, ms = 6000) {
  const a = $("aviso");
  a.textContent = mensaje; a.hidden = !mensaje;
  if (mensaje && ms) setTimeout(() => { if (a.textContent === mensaje) a.hidden = true; }, ms);
}

// --- Conexión ---------------------------------------------------------------
function configurarAlmacen() {
  const local = ["localhost", "127.0.0.1"].includes(location.hostname);
  if (local) { estado.almacen = crearAlmacenLocal(); $("boton-config").hidden = true; return; }
  const deducido = deducirRepo(location) || {};
  const owner = localStorage.getItem("sinlinea.owner") || deducido.owner || "";
  const repo = localStorage.getItem("sinlinea.repo") || deducido.repo || "";
  const token = localStorage.getItem("sinlinea.token") || "";
  $("campo-owner").value = owner; $("campo-repo").value = repo; $("campo-token").value = token;
  if (!owner || !repo) { $("config").hidden = false; avisar("Indica el usuario y el repositorio de GitHub.", 0); }
  estado.almacen = crearAlmacenGitHub({ token, owner, repo });
  if (!token) avisar("Sin token: el panel está en modo solo lectura. Pulsa Configurar.", 0);
}

$("boton-config").addEventListener("click", () => { $("config").hidden = !$("config").hidden; });
$("boton-guardar-config").addEventListener("click", () => {
  localStorage.setItem("sinlinea.owner", $("campo-owner").value.trim());
  localStorage.setItem("sinlinea.repo", $("campo-repo").value.trim());
  localStorage.setItem("sinlinea.token", $("campo-token").value.trim());
  location.reload();
});
$("boton-borrar-config").addEventListener("click", () => { localStorage.removeItem("sinlinea.token"); location.reload(); });

// --- Carga ------------------------------------------------------------------
async function cargar() {
  try {
    estado.items = await estado.almacen.listar();
    estado.items.sort((a, b) => b.post.creado.localeCompare(a.post.creado));
    const info = await estado.almacen.tokenInfo(estado.cuenta);
    mostrarToken(info);
    pintar();
  } catch (err) {
    $("lista").replaceChildren(el("p", { class: "vacio", text: `No se pudieron cargar los posts: ${err.message}` }));
  }
}

function mostrarToken(info) {
  const n = $("estado-token");
  if (!info?.vence) { n.hidden = false; n.textContent = "Token IG: sin fecha"; n.className = "estado-token alerta"; return; }
  const dias = Math.floor((Date.parse(info.vence) - Date.parse(claveDia(new Date(), ZONA_PANAMA))) / 86400000);
  n.hidden = false;
  n.textContent = `Token IG vence ${info.vence}`;
  n.className = "estado-token" + (dias < 7 ? " alerta" : "");
}

// --- Pintado ----------------------------------------------------------------
function pintar() {
  const selector = $("cuentas");
  if (configPanel.cuentas.length > 1) {
    selector.hidden = false;
    selector.replaceChildren(...configPanel.cuentas.map((c) => el("button", {
      type: "button", class: c.id === estado.cuenta ? "activa" : "", text: c.nombre, onclick: () => seleccionarCuenta(c.id),
    })));
  } else {
    selector.hidden = true;
  }
  const activa = configDeCuenta(estado.cuenta);
  const apagado = [];
  if (activa.automatico?.generar === false) apagado.push("la generación automática de borradores");
  if (activa.automatico?.publicar === false) apagado.push("la publicación automática en Instagram");
  const nota = $("nota-cuenta");
  if (apagado.length) {
    nota.hidden = false;
    nota.textContent = `En ${activa.nombre} está desactivada ${apagado.join(" y ")}. Los posts aprobados quedan en cola hasta activarla en cuentas/${activa.id}/config.json.`;
  } else {
    nota.hidden = true;
  }
  const deCuenta = estado.items.filter((x) => cuentaDe(x.post) === estado.cuenta);
  const conteo = Object.fromEntries(PESTANAS.map(([k]) => [k, deCuenta.filter((x) => x.post.estado === k).length]));
  $("pestanas").replaceChildren(...PESTANAS
    .filter(([k]) => k !== "error" || conteo.error > 0)
    .map(([k, nombre]) => el("button", {
      type: "button", class: k === estado.pestana ? "activa" : "", text: `${nombre} (${conteo[k]})`,
      onclick: () => { estado.pestana = k; pintar(); },
    })));
  const visibles = deCuenta.filter((x) => x.post.estado === estado.pestana);
  $("lista").replaceChildren(...(visibles.length ? visibles.map(tarjeta) : [el("p", { class: "vacio", text: "Nada por aquí." })]));
}

function urlImagen(post) {
  if (!post.imagen?.url) return null;
  const local = ["localhost", "127.0.0.1"].includes(location.hostname);
  const base = local ? `/img/${post.id}.jpg` : urlSegura(post.imagen.url);
  return `${base}?v=${post.imagen.hash}`;
}

function tarjeta({ post, sha }) {
  const soloLectura = estado.almacen.modo === "github" && !localStorage.getItem("sinlinea.token");
  const bloqueado = ["publicado", "descartado"].includes(post.estado) || soloLectura;
  const src = urlImagen(post);
  const campos = {};
  const campo = (etiqueta, nombre, tipo = "textarea") => {
    const n = el(tipo, { disabled: bloqueado ? "" : null });
    if (tipo === "select") {
      const lista = nombre === "categoria" ? CATEGORIAS : VARIANTES;
      n.replaceChildren(...lista.map((v) => el("option", { value: v, text: v })));
    }
    n.value = nombre === "hashtags" ? post.hashtags.join(" ") : post[nombre];
    campos[nombre] = n;
    return el("label", { text: etiqueta }, [n]);
  };
  const ilus = post.ilustracion || null;
  const campoEscena = el("textarea", { disabled: bloqueado ? "" : null });
  campoEscena.value = ilus ? ilus.descripcion : "";
  campos.escena = campoEscena;
  const casillaUsar = el("input", { type: "checkbox", disabled: bloqueado ? "" : null });
  casillaUsar.checked = Boolean(ilus && ilus.usar);
  campos.usar = casillaUsar;
  const contador = el("p", { class: "contador" });
  const actualizarContador = () => {
    const texto = componerCaption({ caption: campos.caption.value, medio: post.fuente.medio, hashtags: campos.hashtags.value.split(/\s+/) });
    const v = validarCaption(texto);
    const t = validarTextos({ titular: campos.titular.value, bajada: campos.bajada.value });
    contador.textContent = `Titular ${campos.titular.value.trim().length}/${LIMITES_TEXTO.titularMax} · Bajada ${campos.bajada.value.trim().length}/${LIMITES_TEXTO.bajadaMax} · Caption ${texto.length}/${LIMITES.caracteres} · ${normalizarHashtags(campos.hashtags.value.split(/\s+/)).length}/${LIMITES.hashtags} hashtags`;
    contador.className = "contador" + (v.ok && t.ok ? "" : " excede");
  };

  const cuerpo = el("div", { class: "cuerpo" }, [
    el("div", { class: "meta" }, [
      el("span", { class: "chip", text: post.categoria }),
      el("span", { class: `badge ${post.estado}`, text: post.estado }),
      el("a", { href: urlSegura(post.fuente.url), target: "_blank", rel: "noopener", text: post.fuente.medio }),
      post.programado ? el("span", { text: `Programado: ${claveDia(post.programado)} ${horaMinutoDeIso(post.programado)}` }) : "",
      imagenDesactualizada(post) && !["publicado", "descartado"].includes(post.estado) ? el("span", { class: "regenerando", text: "Regenerando imagen…" }) : "",
      generandoIlustracion(ilus) ? el("span", { class: "regenerando", text: ilus.descripcion.trim() ? "Generando ilustración…" : "Generando ilustración… (Claude redacta la escena)" }) : "",
      regenerandoIlustracion(ilus) ? el("span", { class: "regenerando", text: ilus.descripcion.trim() ? "Regenerando ilustración…" : "Regenerando ilustración… (Claude redacta la escena)" }) : "",
    ]),
    post.error ? el("p", { class: "error-texto", text: `Error (${post.error.paso}): ${post.error.mensaje}` }) : "",
    campo("Titular", "titular"),
    campo("Bajada", "bajada"),
    el("div", { class: "fila" }, [campo("Categoría", "categoria", "select"), campo("Variante", "variante", "select")]),
    campo("Caption", "caption"),
    campo("Hashtags (separados por espacio)", "hashtags", "input"),
    el("label", { text: "Escena de la ilustración (sin personas reales)" }, [campoEscena]),
    el("label", { class: "casilla" }, [casillaUsar, el("span", { text: " Usar ilustración generada con IA" })]),
    ilus && ilus.error ? el("p", { class: "error-texto", text: `La ilustración falló: ${ilus.error.mensaje}` }) : "",
    contador,
  ]);
  const cambios = () => {
    const escena = campos.escena.value.trim();
    const usar = campos.usar.checked; // sin escena, REGENERAR se la pide a Claude
    const reactivada = usar && !(post.ilustracion && post.ilustracion.usar);
    return {
      titular: campos.titular.value.trim(), bajada: campos.bajada.value.trim(), caption: campos.caption.value.trim(),
      hashtags: normalizarHashtags(campos.hashtags.value.split(/\s+/)), categoria: campos.categoria.value, variante: campos.variante.value,
      ilustracion: (escena || usar || post.ilustracion)
        ? { ...(post.ilustracion || { ruta: null, hashDescripcion: null, proveedor: null, modelo: null, generada: null, error: null }), descripcion: escena, usar, ...(reactivada ? { error: null } : {}) }
        : null,
    };
  };
  const hayCambios = () => {
    const c = cambios();
    return ["titular", "bajada", "caption", "categoria", "variante"].some((k) => c[k] !== post[k]) || c.hashtags.join(" ") !== post.hashtags.join(" ")
      || (c.ilustracion?.descripcion ?? "") !== (post.ilustracion?.descripcion ?? "") || Boolean(c.ilustracion?.usar) !== Boolean(post.ilustracion?.usar);
  };
  const captionValido = () => {
    const t = validarTextos({ titular: campos.titular.value, bajada: campos.bajada.value });
    const c = validarCaption(componerCaption({ caption: campos.caption.value, medio: post.fuente.medio, hashtags: campos.hashtags.value.split(/\s+/) }));
    return { ok: t.ok && c.ok, errores: [...t.errores, ...c.errores] };
  };

  const local = estado.borradores.get(post.id);
  if (local) for (const k of Object.keys(local)) {
    if (!campos[k]) continue;
    if (k === "usar") campos[k].checked = local[k];
    else campos[k].value = local[k];
  }
  const recordarBorrador = () => {
    if (hayCambios()) estado.borradores.set(post.id, {
      titular: campos.titular.value, bajada: campos.bajada.value, caption: campos.caption.value,
      hashtags: campos.hashtags.value, categoria: campos.categoria.value, variante: campos.variante.value,
      escena: campos.escena.value, usar: campos.usar.checked,
    });
    else estado.borradores.delete(post.id);
  };
  for (const n of Object.values(campos)) n.addEventListener("input", recordarBorrador);
  campos.categoria.addEventListener("change", recordarBorrador);
  campos.variante.addEventListener("change", recordarBorrador);
  campos.usar.addEventListener("change", recordarBorrador);

  campos.titular.addEventListener("input", actualizarContador);
  campos.bajada.addEventListener("input", actualizarContador);
  campos.caption.addEventListener("input", actualizarContador);
  campos.hashtags.addEventListener("input", actualizarContador);
  actualizarContador();

  const acciones = el("div", { class: "acciones" });
  // Aviso dentro de la tarjeta (el de arriba queda fuera de la vista en el celular).
  const avisoTarjeta = el("p", { class: "aviso aviso-tarjeta", hidden: "" });
  const avisarAqui = (mensaje) => { avisoTarjeta.textContent = mensaje; avisoTarjeta.hidden = false; avisar(mensaje); };
  for (const n of Object.values(campos)) n.addEventListener("input", () => { avisoTarjeta.hidden = true; });
  const conCambios = (p) => (hayCambios() ? editarTexto(p, cambios(), ahoraIso()) : p);
  const guardarSiCambio = (p) => {
    const v = captionValido(); if (!v.ok) { avisarAqui(v.errores.join(" ")); return null; }
    if (!hayCambios()) { avisarAqui("No hay cambios que guardar."); return null; }
    return conCambios(p);
  };
  const boton = (texto, clase, fn) => el("button", { type: "button", class: `boton ${clase}`, text: texto, onclick: () => ejecutar(post.id, sha, fn) });

  if (!bloqueado) {
    const aprobarConHora = async (p) => {
      const v = captionValido(); if (!v.ok) { avisarAqui(v.errores.join(" ")); return null; }
      const h = await pedirHora(p); return h ? aprobar(conCambios(p), h, ahoraIso()) : null;
    };
    const regenerarIlustracion = (p) => {
      const descripcion = campos.escena.value.trim();
      const v = captionValido(); if (!v.ok) { avisarAqui(v.errores.join(" ")); return null; }
      // Sin escena: se guarda usar=true con la escena vacía y REGENERAR se la pide a Claude.
      const base = p.ilustracion || { ruta: null, proveedor: null, modelo: null, generada: null };
      return editarTexto(conCambios(p), { ilustracion: { ...base, descripcion, usar: true, hashDescripcion: null, error: null } }, ahoraIso());
    };
    if (post.estado === "borrador") {
      acciones.append(boton("Aprobar", "primario", aprobarConHora));
      acciones.append(boton("Guardar cambios", "", guardarSiCambio));
      acciones.append(boton("Regenerar ilustración", "", regenerarIlustracion));
      acciones.append(boton("Descartar", "peligro", (p) => descartar(p, ahoraIso())));
    } else if (post.estado === "programado") {
      acciones.append(boton("Cambiar hora", "primario", aprobarConHora));
      acciones.append(boton("Guardar cambios", "", guardarSiCambio));
      acciones.append(boton("Regenerar ilustración", "", regenerarIlustracion));
      acciones.append(boton("Quitar de la cola", "peligro", (p) => quitarDeCola(p, ahoraIso())));
    } else if (post.estado === "error") {
      if (post.error?.paso === "instagram") acciones.append(boton("Reintentar", "primario", (p) => reintentar(conCambios(p), ahoraIso())));
      acciones.append(boton("Guardar cambios", "", guardarSiCambio));
      acciones.append(boton("Regenerar ilustración", "", regenerarIlustracion));
      acciones.append(boton("Descartar", "peligro", (p) => descartar(p, ahoraIso())));
    }
  }
  if (post.publicacion?.permalink) acciones.append(el("a", { class: "boton", href: urlSegura(post.publicacion.permalink), target: "_blank", rel: "noopener", text: "Ver en Instagram" }));
  cuerpo.append(acciones, avisoTarjeta);

  return el("article", { class: "tarjeta", "data-id": post.id }, [
    src ? el("img", { src, alt: "", loading: "lazy" }) : el("div", { class: "sin-imagen", text: post.error?.paso === "render" ? "La imagen falló; se reintenta sola" : "Imagen en proceso…" }),
    cuerpo,
  ]);
}

// --- Acciones ---------------------------------------------------------------
async function ejecutar(id, sha, fn) {
  const item = estado.items.find((x) => x.post.id === id);
  if (!item) return;
  const botones = document.querySelectorAll(`[data-id="${id}"] button`);
  botones.forEach((b) => { b.disabled = true; });
  try {
    let nuevo = await fn(item.post);
    if (nuevo === null) { botones.forEach((b) => { b.disabled = false; }); return; }
    try {
      item.sha = await estado.almacen.guardar(nuevo, item.sha);
    } catch (err) {
      if (!(err instanceof ErrorConflicto) || !err.actual) throw err;
      nuevo = await fn(err.actual.post);
      if (nuevo === null) { botones.forEach((b) => { b.disabled = false; }); return; }
      item.sha = await estado.almacen.guardar(nuevo, err.actual.sha);
      avisar("El post había cambiado; se aplicó tu acción sobre la versión nueva.");
    }
    item.post = nuevo;
    estado.borradores.delete(id);
    pintar();
  } catch (err) {
    avisar(`No se pudo guardar: ${err.message}`, 8000);
    botones.forEach((b) => { b.disabled = false; });
  }
}

function pedirHora(post) {
  // Franjas y horas ocupadas de la cuenta del post: dos cuentas pueden publicar a la misma hora.
  const cuenta = cuentaDe(post);
  const cfgCuenta = configDeCuenta(cuenta);
  const ocupadas = franjasOcupadas(estado.items.map((x) => x.post).filter((p) => p.id !== post.id && cuentaDe(p) === cuenta));
  let propuesta;
  try { propuesta = siguienteFranjaLibre({ franjas: cfgCuenta.franjas, ocupadas, ahora: new Date(), zonaHoraria: cfgCuenta.zonaHoraria || configPanel.zonaHoraria }); }
  catch { propuesta = isoDesdeClave(claveDia(new Date()), cfgCuenta.franjas[cfgCuenta.franjas.length - 1]); }
  const dialogo = $("dialogo-hora");
  $("hora-fecha").value = claveDia(propuesta); $("hora-hora").value = horaMinutoDeIso(propuesta); $("hora-nota").textContent = "";
  const revisar = () => {
    const iso = isoDesdeClave($("hora-fecha").value, $("hora-hora").value);
    if (Date.parse(iso) < Date.now()) $("hora-nota").textContent = "Esa hora ya pasó; se publicará en la próxima corrida.";
    else if (choca(iso, ocupadas)) $("hora-nota").textContent = "Ya hay otro post a esa hora.";
    else $("hora-nota").textContent = "";
  };
  $("hora-fecha").oninput = revisar; $("hora-hora").oninput = revisar;
  return new Promise((resolve) => {
    dialogo.onclose = () => {
      if (dialogo.returnValue !== "ok" || !$("hora-fecha").value || !$("hora-hora").value) return resolve(null);
      resolve(isoDesdeClave($("hora-fecha").value, $("hora-hora").value));
    };
    dialogo.showModal();
  });
}

// --- Arranque ---------------------------------------------------------------
configurarAlmacen();
cargarConfigPanel().then(() => { elegirCuentaInicial(); return cargar(); });
setInterval(() => {
  const hayRegenerando = estado.items.some((x) => ["borrador", "programado", "error"].includes(x.post.estado)
    && (imagenDesactualizada(x.post) || generandoIlustracion(x.post.ilustracion) || regenerandoIlustracion(x.post.ilustracion)));
  if (hayRegenerando && !document.querySelector("dialog[open]") && estado.borradores.size === 0) cargar();
}, 30000);
