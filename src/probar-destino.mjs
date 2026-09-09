// PROBAR DESTINO (multicanal, F1): confirma que la credencial de una red nueva (Facebook) pertenece a la página
// configurada y registra el estado de conexión de esa red (data/<cuenta>/conexion-<red>.json). No publica nada y
// nunca imprime valores de secretos.
// Uso: node src/probar-destino.mjs --cuenta <id> --red facebook --por-cuenta
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cargarConfiguracion } from "./lib/config.mjs";
import { ocultarSecretos, origenDeSecretos, nombreEntorno, leerSecretosDeRed } from "./lib/secretos.mjs";
import { REDES_CONEXION, SECRETOS_RED, identificadorDe, conexionDe } from "./lib/conexiones.mjs";
import { NOMBRES_RED } from "./lib/destinos.mjs";
import { crearClienteFacebook } from "./lib/facebook.mjs";

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
  if (!REDES_CONEXION.includes(red)) { error(`red desconocida: ${red} (F1 admite ${REDES_CONEXION.join(", ")})`); return { ok, lineas }; }
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
  if (!identificador) {
    const m = `falta el identificador de la página en la configuración (conexiones.${red}.pagina); guárdalo desde el panel y repite la prueba`;
    error(`cuenta ${cuenta}: ${m}`);
    registrar("credenciales-pendientes", null, m);
    return { ok, lineas };
  }
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
    if (perfil.coincideId === false) {
      const m = `la credencial ${SECRETOS_RED[red][0]} pertenece a la página "${perfil.nombre || "?"}" (${perfil.id || "?"}); se esperaba la página ${identificador}`;
      error(`cuenta ${cuenta}: ${m}`);
      registrar("error", { id: perfil.id || null, nombre: perfil.nombre || null }, m);
      return { ok, lineas };
    }
    bien(`cuenta ${cuenta}: la credencial ${SECRETOS_RED[red][0]} pertenece a la página "${perfil.nombre}" (${perfil.id}), que coincide con conexiones.${red}.pagina`);
    registrar("verificada", { id: perfil.id, nombre: perfil.nombre }, null);
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
  if (!cuenta) { console.error("Uso: node src/probar-destino.mjs --cuenta <id> --red facebook --por-cuenta"); process.exit(1); }
  const clienteDe = (config, r, secretos) => crearClienteFacebook({ token: secretos.token, paginaId: identificadorDe(config, r), apiVersion: config.instagram.apiVersion });
  ejecutarPruebaDestino({ configuracion: cargarConfiguracion(), cuenta, red, clienteDe, raiz: process.cwd(), porCuenta: process.argv.includes("--por-cuenta") }).then((r) => {
    for (const l of r.lineas) console.log(l);
    if (!r.ok) { console.error(`La prueba de ${red} falló: no enciendas esa conexión hasta corregirlo.`); process.exit(1); }
    console.log(`Prueba de ${red} completa: la credencial corresponde a la página esperada.`);
  }).catch((err) => { console.error(`Error en probar-destino: ${ocultarSecretos(err.message)}`); process.exit(1); });
}
