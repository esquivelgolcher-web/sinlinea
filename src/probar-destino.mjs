// PROBAR DESTINO (multicanal): confirma que la credencial de una red nueva pertenece a la página de Facebook (F1) o al
// perfil de Threads (F2) configurados y registra el estado de conexión de esa red (data/<cuenta>/conexion-<red>.json).
// No publica nada y nunca imprime valores de secretos.
// Uso: node src/probar-destino.mjs --cuenta <id> --red facebook|threads --por-cuenta
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cargarConfiguracion } from "./lib/config.mjs";
import { ocultarSecretos, origenDeSecretos, nombreEntorno, leerSecretosDeRed } from "./lib/secretos.mjs";
import { REDES_CONEXION, SECRETOS_RED, IDENTIFICADOR_RED, identificadorDe, conexionDe } from "./lib/conexiones.mjs";
import { NOMBRES_RED } from "./lib/destinos.mjs";
import { crearClienteFacebook } from "./lib/facebook.mjs";
import { crearClienteThreads } from "./lib/threads.mjs";

// Cómo se llama lo que identifica cada red y cómo se presenta lo que devuelve la API (sin valores de secretos).
const SUJETO = Object.freeze({ facebook: "la página", threads: "el perfil" });
const etiquetaDe = (red, perfil) => (red === "threads" ? `al perfil @${perfil.username || "?"}` : `a la página "${perfil.nombre || "?"}"`);
const identidadDe = (red, perfil) => ({ id: perfil.id || null, nombre: red === "threads" ? (perfil.username ? `@${perfil.username}` : null) : (perfil.nombre || null) });

// Cliente de la red con el secreto de esa red (solo ese) y el identificador declarado.
export function clienteDeRed(config, red, secretos) {
  if (red === "facebook") return crearClienteFacebook({ token: secretos.token, paginaId: identificadorDe(config, red), apiVersion: config.instagram.apiVersion });
  if (red === "threads") return crearClienteThreads({ token: secretos.token, usuarioId: identificadorDe(config, red) });
  throw new Error(`Red sin cliente: ${red}`);
}

export const rutaConexionRed = (config, red) => path.join(config.rutas?.datos || `data/${config.cuenta}`, `conexion-${red}.json`);

// Estado de conexión de una red que lee el panel maestro. Nunca lleva valores de secretos.
export function escribirConexionRed(raiz, config, red, { estado, identidad = null, detalle = null, ahora = new Date() }) {
  if (!raiz) return;
  const ruta = path.join(raiz, rutaConexionRed(config, red));
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  const datos = {
    red, estado, identidad, comprobado: ahora.toISOString(), detalle: detalle ? ocultarSecretos(detalle) : null,
    secretos: { nombres: [...SECRETOS_RED[red]], origen: "entorno", entorno: nombreEntorno(config.cuenta) },
  };
  fs.writeFileSync(ruta, JSON.stringify(datos, null, 2) + "\n");
}

export async function ejecutarPruebaDestino({ configuracion, cuenta, red, env = process.env, clienteDe, raiz = null, ahora = new Date(), porCuenta = false }) {
  const lineas = [];
  let ok = true;
  const error = (m) => { ok = false; lineas.push(`ERROR  ${m}`); };
  const bien = (m) => lineas.push(`OK     ${m}`);
  if (!REDES_CONEXION.includes(red)) { error(`red desconocida: ${red} (se admiten ${REDES_CONEXION.join(", ")})`); return { ok, lineas }; }
  const config = configuracion.cuentas.find((c) => c.cuenta === cuenta);
  if (!config) { error(`la cuenta "${cuenta}" no está declarada o su configuración es inválida`); return { ok, lineas }; }
  const nombre = NOMBRES_RED[red];
  const registrar = (estado, identidad, detalle) => escribirConexionRed(raiz, config, red, { estado, identidad, detalle, ahora });
  if (origenDeSecretos(config) !== "entorno") {
    const m = `las conexiones nuevas solo existen en modo Environment: cambia el origen de las credenciales de ${cuenta} a Environment ${nombreEntorno(cuenta)} antes de conectar ${nombre}`;
    error(`cuenta ${cuenta}: ${m}`);
    registrar("error", null, m);
    return { ok, lineas };
  }
  if (!porCuenta) {
    lineas.push(`AVISO  cuenta ${cuenta}: ${nombre} solo se prueba en el job por cuenta (workflow Probar destino). Se omite aquí`);
    return { ok, lineas };
  }
  lineas.push(`--- cuenta ${cuenta}: ${nombre} · Environment ${nombreEntorno(cuenta)} (${SECRETOS_RED[red].join(", ")})`);
  const identificador = identificadorDe(config, red);
  let secretos;
  try { secretos = leerSecretosDeRed(config, red, env); }
  catch (err) {
    error(`cuenta ${cuenta}: ${err.message}`);
    registrar("credenciales-pendientes", null, err.message);
    return { ok, lineas };
  }
  try {
    const cliente = await clienteDe(config, red, secretos);
    const perfil = await cliente.perfil();
    const clave = IDENTIFICADOR_RED[red];
    const etiqueta = etiquetaDe(red, perfil);
    const identidad = identidadDe(red, perfil);
    if (!identificador) {
      // El id no es una credencial: se muestra el que devuelve la API para que el operador lo guarde en el panel.
      const m = `falta el identificador de ${SUJETO[red]} en la configuración (conexiones.${red}.${clave}). La credencial ${SECRETOS_RED[red][0]} pertenece ${etiqueta} con id ${perfil.id || "(vacío)"}: guarda ese id en el formulario de la cuenta y repite la prueba`;
      error(`cuenta ${cuenta}: ${m}`);
      registrar("credenciales-pendientes", identidad, m);
      return { ok, lineas };
    }
    if (perfil.coincideId === false) {
      const m = `la credencial ${SECRETOS_RED[red][0]} pertenece ${etiqueta} (${perfil.id || "?"}); se esperaba ${SUJETO[red]} ${identificador}`;
      error(`cuenta ${cuenta}: ${m}`);
      registrar("error", identidad, m);
      return { ok, lineas };
    }
    if (red === "threads") {
      // Además del id, el nombre de usuario esperado (si se declaró): evita publicar en un perfil que no es el previsto.
      const esperado = String(conexionDe(config, red).perfil || "").replace(/^@/, "").toLowerCase();
      if (esperado && String(perfil.username || "").toLowerCase() !== esperado) {
        const m = `la credencial ${SECRETOS_RED[red][0]} pertenece ${etiqueta} (${perfil.id || "?"}); se esperaba @${esperado} (conexiones.threads.perfil)`;
        error(`cuenta ${cuenta}: ${m}`);
        registrar("error", identidad, m);
        return { ok, lineas };
      }
    }
    bien(`cuenta ${cuenta}: la credencial ${SECRETOS_RED[red][0]} pertenece ${etiqueta} (${perfil.id}), que coincide con conexiones.${red}.${clave}`);
    registrar("verificada", identidad, null);
    if (!conexionDe(config, red).publicar) lineas.push(`AVISO  cuenta ${cuenta}: la publicación en ${nombre} sigue apagada; enciéndela desde el panel cuando quieras`);
  } catch (err) {
    const tipo = err.tipo ? ` · type ${err.tipo}` : "";
    const m = `la API respondió con error: message "${ocultarSecretos(err.message)}" · code ${err.codigo ?? "-"} · error_subcode ${err.subcodigo ?? "-"}${tipo}`;
    error(`cuenta ${cuenta}: ${m}`);
    registrar("error", null, m);
  }
  return { ok, lineas };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? String(process.argv[i + 1] || "").trim() || null : null; };
  const cuenta = arg("--cuenta");
  const red = arg("--red") || "facebook";
  if (!cuenta) { console.error("Uso: node src/probar-destino.mjs --cuenta <id> --red facebook|threads --por-cuenta"); process.exit(1); }
  ejecutarPruebaDestino({ configuracion: cargarConfiguracion(), cuenta, red, clienteDe: clienteDeRed, raiz: process.cwd(), porCuenta: process.argv.includes("--por-cuenta") }).then((r) => {
    for (const l of r.lineas) console.log(l);
    if (!r.ok) { console.error(`La prueba de ${red} falló: no enciendas esa conexión hasta corregirlo.`); process.exit(1); }
    console.log(`Prueba de ${red} completa: la credencial corresponde ${red === "threads" ? "al perfil esperado" : "a la página esperada"}.`);
  }).catch((err) => { console.error(`Error en probar-destino: ${ocultarSecretos(err.message)}`); process.exit(1); });
}
