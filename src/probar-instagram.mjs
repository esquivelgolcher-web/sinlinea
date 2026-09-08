// PROBAR INSTAGRAM: confirma que la credencial de una cuenta pertenece al usuario esperado
// (usuario y id numérico) sin publicar nada ni revelar secretos.
// Uso: node src/probar-instagram.mjs [--cuenta <id>]   (sin --cuenta prueba todas las que tengan secretos)
import { pathToFileURL } from "node:url";
import { cargarConfiguracion } from "./lib/config.mjs";
import { leerSecretos, nombresDeSecretos, ocultarSecretos } from "./lib/secretos.mjs";
import { crearClienteInstagram } from "./lib/instagram.mjs";

export async function ejecutarPruebaInstagram({ configuracion, cuenta = null, env = process.env, igDe }) {
  const lineas = [];
  let ok = true;
  const error = (m) => { ok = false; lineas.push(`ERROR  ${m}`); };
  const aviso = (m) => lineas.push(`AVISO  ${m}`);
  const bien = (m) => lineas.push(`OK     ${m}`);

  let objetivo = configuracion.cuentas;
  if (cuenta) {
    objetivo = configuracion.cuentas.filter((c) => c.cuenta === cuenta);
    if (!objetivo.length) { error(`la cuenta "${cuenta}" no está declarada o su configuración es inválida`); return { ok, lineas }; }
  }
  for (const config of objetivo) {
    const nombres = nombresDeSecretos(config);
    let secretos;
    try {
      secretos = leerSecretos(config, env);
    } catch (err) {
      if (cuenta) error(`cuenta ${config.cuenta}: ${err.message}`);
      else aviso(`cuenta ${config.cuenta}: sin secretos en el entorno (${nombres.token}, ${nombres.usuarioId}); se omite`);
      continue;
    }
    try {
      const ig = await igDe(config, secretos);
      const perfil = await ig.perfil();
      const esperado = String(config.marca.usuario).replace(/^@/, "");
      const usuarioOk = String(perfil.username || "").toLowerCase() === esperado.toLowerCase();
      const idOk = perfil.coincideId !== false;
      if (usuarioOk && idOk) {
        bien(`cuenta ${config.cuenta}: la credencial ${nombres.token} pertenece a @${perfil.username} (coincide con ${config.marca.usuario}); el id numérico coincide con ${nombres.usuarioId}`);
      } else {
        if (!usuarioOk) error(`cuenta ${config.cuenta}: la credencial ${nombres.token} pertenece a @${perfil.username || "?"}; se esperaba ${config.marca.usuario}`);
        if (!idOk) error(`cuenta ${config.cuenta}: el id numérico no coincide: ${nombres.usuarioId} no es el user_id que devuelve la API para esa credencial`);
      }
    } catch (err) {
      error(`cuenta ${config.cuenta}: la API respondió con error (${ocultarSecretos(err.message)})`);
    }
  }
  return { ok, lineas };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf("--cuenta");
  const cuenta = i >= 0 ? String(process.argv[i + 1] || "").trim() || null : null;
  const configuracion = cargarConfiguracion();
  const igDe = (config, { token, usuarioId }) => crearClienteInstagram({ token, usuarioId, apiVersion: config.instagram.apiVersion });
  ejecutarPruebaInstagram({ configuracion, cuenta, igDe }).then((r) => {
    for (const l of r.lineas) console.log(l);
    if (!r.ok) { console.error("La prueba de Instagram falló: no actives la publicación de esa cuenta hasta corregirlo."); process.exit(1); }
    console.log("Prueba de Instagram completa: las credenciales presentes corresponden a los usuarios esperados.");
  }).catch((err) => { console.error(`Error en probar-instagram: ${ocultarSecretos(err.message)}`); process.exit(1); });
}
