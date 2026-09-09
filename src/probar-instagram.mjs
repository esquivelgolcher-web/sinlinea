// PROBAR INSTAGRAM: confirma que la credencial de una cuenta pertenece al usuario esperado
// (usuario y id numérico) y registra la caducidad real del token, o "desconocida" si la API no la
// informa. No publica nada y nunca imprime valores de secretos.
// Uso: node src/probar-instagram.mjs [--cuenta <id>]   (sin --cuenta prueba todas las que tengan secretos)
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cargarConfiguracion } from "./lib/config.mjs";
import { nombresDeSecretos, ocultarSecretos, origenDeSecretos, nombreEntorno, describirCredenciales } from "./lib/secretos.mjs";
import { crearClienteInstagram } from "./lib/instagram.mjs";
import { claveDia } from "./lib/fechas.mjs";

// Estado de conexión que lee el panel maestro (data/<cuenta>/conexion.json). Nunca lleva valores de secretos.
export function escribirConexion(raiz, config, { estado, usuario = null, detalle = null, ahora = new Date(), porCuenta = false }) {
  if (!raiz) return;
  const carpeta = path.join(raiz, config.rutas?.datos || `data/${config.cuenta}`);
  fs.mkdirSync(carpeta, { recursive: true });
  const origen = origenDeSecretos(config);
  const n = origen === "entorno" ? nombresDeSecretos(config) : nombresDeSecretos(config); // nombres que identifican el origen (no los del job)
  const secretos = { tokenSecreto: n.token, usuarioIdSecreto: n.usuarioId, origen, ...(origen === "entorno" ? { entorno: nombreEntorno(config.cuenta) } : {}) };
  void porCuenta;
  const datos = { estado, usuario, comprobado: ahora.toISOString(), detalle: detalle ? ocultarSecretos(detalle) : null, secretos };
  fs.writeFileSync(path.join(carpeta, "conexion.json"), JSON.stringify(datos, null, 2) + "\n");
}

export async function ejecutarPruebaInstagram({ configuracion, cuenta = null, env = process.env, igDe, raiz = null, ahora = new Date(), porCuenta = false }) {
  const lineas = [];
  let ok = true;
  const error = (m) => { ok = false; lineas.push(`ERROR  ${m}`); };
  const aviso = (m) => lineas.push(`AVISO  ${m}`);
  const bien = (m) => lineas.push(`OK     ${m}`);
  const valor = (k) => String(env[k] ?? "").trim();
  const conexion = (config, estado, usuario, detalle) => escribirConexion(raiz, config, { estado, usuario, detalle, ahora });

  let objetivo = configuracion.cuentas;
  if (cuenta) {
    objetivo = configuracion.cuentas.filter((c) => c.cuenta === cuenta);
    if (!objetivo.length) { error(`la cuenta "${cuenta}" no está declarada o su configuración es inválida`); return { ok, lineas }; }
  }
  for (const config of objetivo) {
    if (!porCuenta && origenDeSecretos(config) === "entorno") {
      aviso(`cuenta ${config.cuenta}: sus credenciales viven en el Environment ${nombreEntorno(config.cuenta)}; solo se prueban en el job por cuenta (workflow Probar Instagram). Se omite aquí`);
      continue;
    }
    const nombres = nombresDeSecretos(config, { porCuenta });
    const donde = origenDeSecretos(config) === "entorno" ? ` en el Environment ${nombreEntorno(config.cuenta)} (Settings → Environments)` : " (Settings → Secrets and variables → Actions)";
    lineas.push(`--- cuenta ${config.cuenta}: credenciales · ${describirCredenciales(config, { porCuenta })}`);
    const token = valor(nombres.token);
    const usuarioId = valor(nombres.usuarioId);
    if (!token) {
      if (cuenta) {
        error(`cuenta ${config.cuenta}: falta el secreto ${nombres.token}${donde}`);
        conexion(config, "credenciales-pendientes", null, `falta el secreto ${nombres.token}${donde}`);
      } else aviso(`cuenta ${config.cuenta}: sin secretos en el entorno (${nombres.token}, ${nombres.usuarioId}); se omite`);
      continue;
    }
    try {
      const ig = await igDe(config, { token, usuarioId });
      const perfil = await ig.perfil();
      const esperado = String(config.marca.usuario).replace(/^@/, "");
      const usuarioOk = String(perfil.username || "").toLowerCase() === esperado.toLowerCase();
      if (!usuarioOk) {
        const m = `la credencial ${nombres.token} pertenece a @${perfil.username || "?"}; se esperaba ${config.marca.usuario}`;
        error(`cuenta ${config.cuenta}: ${m}`);
        conexion(config, "error", null, m);
        continue;
      }
      if (!usuarioId) {
        // El id numérico no es una credencial: se muestra para que el operador lo guarde como secreto.
        const m = `la credencial pertenece a @${perfil.username}, pero falta el secreto ${nombres.usuarioId}. La API devuelve user_id = ${perfil.userId || "(vacío)"}: guárdalo como secreto ${nombres.usuarioId} y repite la prueba`;
        error(`cuenta ${config.cuenta}: ${m}`);
        conexion(config, "credenciales-pendientes", null, m);
        continue;
      }
      if (perfil.coincideId === false) {
        const m = perfil.userId ? `el id numérico no coincide: ${nombres.usuarioId} no es el user_id que devuelve la API para esa credencial` : `la API no devolvió user_id; no se pudo confirmar el id numérico (no actives la publicación)`;
        error(`cuenta ${config.cuenta}: ${m}`);
        conexion(config, "error", null, m);
        continue;
      }
      bien(`cuenta ${config.cuenta}: la credencial ${nombres.token} pertenece a @${perfil.username} (coincide con ${config.marca.usuario}); el id numérico coincide con ${nombres.usuarioId}`);
      conexion(config, "verificada", perfil.username, null);
      const v = typeof ig.vigencia === "function" ? await ig.vigencia() : { vence: null, origen: "desconocida" };
      if (v.vence) bien(`cuenta ${config.cuenta}: el token vence el ${v.vence} (${v.origen})`);
      else if (v.origen === "sin-caducidad") bien(`cuenta ${config.cuenta}: la API indica que el token no caduca`);
      else aviso(`cuenta ${config.cuenta}: caducidad desconocida: la API no informa la fecha de este token. Se registra como desconocida; la renovación (renovar-token.yml, con GH_PAT) devuelve un token nuevo con fecha real`);
      if (raiz) {
        const info = { vence: v.vence ?? null, comprobado: claveDia(ahora, config.zonaHoraria), origen: v.origen };
        const carpeta = path.join(raiz, config.rutas?.datos || "data");
        fs.mkdirSync(carpeta, { recursive: true });
        fs.writeFileSync(path.join(carpeta, "token-info.json"), JSON.stringify(info, null, 2) + "\n");
      }
    } catch (err) {
      // Diagnóstico sin credenciales: message, code y error_subcode tal como los devuelve la API.
      const tipo = err.tipo ? ` · type ${err.tipo}` : "";
      const m = `la API respondió con error: message "${ocultarSecretos(err.message)}" · code ${err.codigo ?? "-"} · error_subcode ${err.subcodigo ?? "-"}${tipo}`;
      error(`cuenta ${config.cuenta}: ${m}`);
      conexion(config, "error", null, m);
    }
  }
  return { ok, lineas };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf("--cuenta");
  const cuenta = i >= 0 ? String(process.argv[i + 1] || "").trim() || null : null;
  const porCuenta = process.argv.includes("--por-cuenta");
  const configuracion = cargarConfiguracion();
  const igDe = (config, { token, usuarioId }) => crearClienteInstagram({ token, usuarioId, apiVersion: config.instagram.apiVersion });
  ejecutarPruebaInstagram({ configuracion, cuenta, igDe, raiz: process.cwd(), porCuenta }).then((r) => {
    for (const l of r.lineas) console.log(l);
    if (!r.ok) { console.error("La prueba de Instagram falló: no actives la publicación de esa cuenta hasta corregirlo."); process.exit(1); }
    console.log("Prueba de Instagram completa: las credenciales presentes corresponden a los usuarios esperados.");
  }).catch((err) => { console.error(`Error en probar-instagram: ${ocultarSecretos(err.message)}`); process.exit(1); });
}
