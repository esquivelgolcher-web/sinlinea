// VERIFICAR: comprueba configuración, archivos y secretos sin revelar ningún valor.
// Uso: npm run verificar  (o el workflow manual "Verificar configuración y secretos").
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cargarConfiguracion } from "./lib/config.mjs";
import { secretosRequeridos, verificarSecretos } from "./lib/secretos.mjs";
import { leerTokenInfo } from "./publicar.mjs";
import { claveDia } from "./lib/fechas.mjs";
import { leerPosts } from "./lib/posts.mjs";

const ARCHIVOS_COMPARTIDOS = [
  ["templates/post.html", "plantilla del post"],
  ["assets/fonts/Anton-Regular.ttf", "fuente Anton"],
  ["assets/fonts/Inter-Variable.ttf", "fuente Inter"],
];

export function ejecutarVerificacion({ raiz = process.cwd(), env = process.env, ahora = new Date() } = {}) {
  const lineas = [];
  const faltantes = [];
  let ok = true;
  const error = (m) => { ok = false; lineas.push(`ERROR  ${m}`); };
  const aviso = (m) => lineas.push(`AVISO  ${m}`);
  const bien = (m) => lineas.push(`OK     ${m}`);

  let configuracion;
  try {
    configuracion = cargarConfiguracion(raiz);
    bien(`config.json válido (${configuracion.global.cuentas.length} cuenta(s) declarada(s))`);
  } catch (err) {
    error(/^config\.json/.test(err.message) ? err.message : `config.json: ${err.message}`);
    return { ok, lineas, faltantes };
  }
  const { global } = configuracion;
  for (const e of configuracion.errores) error(e.mensaje);
  if (/CAMBIAR/.test(global.pages.baseUrl)) error("pages.baseUrl todavía tiene el valor CAMBIAR");
  else bien(`pages.baseUrl = ${global.pages.baseUrl}`);

  for (const [ruta, descripcion] of ARCHIVOS_COMPARTIDOS) {
    if (fs.existsSync(path.join(raiz, ruta))) bien(`${ruta} (${descripcion})`);
    else error(`falta ${ruta} (${descripcion})`);
  }

  // Secretos compartidos por todas las cuentas: se informan una sola vez.
  const compartidos = [
    { nombre: "ANTHROPIC_API_KEY", obligatorio: true, uso: "Claude: redacción (GENERAR) y acortado de textos y escenas (REGENERAR)" },
    { nombre: "GEMINI_API_KEY", obligatorio: Boolean(global.ilustraciones.activo), uso: "Gemini: ilustraciones de los posts" },
    { nombre: "GH_PAT", obligatorio: false, uso: "renovación automática del token de Instagram (renovar-token.yml)" },
  ];
  const informar = (requeridos) => {
    const r = verificarSecretos(env, requeridos);
    for (const s of requeridos) {
      if (r.presentes.includes(s.nombre)) bien(`${s.nombre}: OK (${s.uso})`);
      else if (s.obligatorio) error(`${s.nombre}: FALTA (${s.uso})`);
      else aviso(`${s.nombre}: falta (opcional: ${s.uso})`);
    }
    faltantes.push(...r.faltantes);
  };
  informar(compartidos);

  for (const config of configuracion.cuentas) {
    lineas.push(`--- Cuenta ${config.cuenta} (${config.nombre}) · idioma ${config.idioma} · ${config.marca.usuario}`);
    if (config.automatico?.generar === false) aviso(`cuenta ${config.cuenta}: generación automática apagada (automatico.generar=false); Claude no redacta posts para ella`);
    if (config.automatico?.publicar === false) aviso(`cuenta ${config.cuenta}: publicación automática apagada (automatico.publicar=false); sus posts aprobados quedan en cola`);
    if (fs.existsSync(path.join(raiz, config.rutas.editorial))) bien(`${config.rutas.editorial} (línea editorial)`);
    else error(`falta ${config.rutas.editorial} (línea editorial)`);
    if (fs.existsSync(path.join(raiz, config.rutas.logo))) bien(`${config.rutas.logo} (logo de la marca)`);
    else aviso(`falta ${config.rutas.logo}: la imagen usará un círculo con las iniciales de la marca`);
    const propios = secretosRequeridos(config).filter((s) => !compartidos.some((c) => c.nombre === s.nombre));
    informar(propios);
    const info = leerTokenInfo(raiz, config.rutas.datos);
    if (!info.vence) {
      aviso(`${config.rutas.datos}/token-info.json: caducidad del token de Instagram desconocida (ejecuta "Probar Instagram" o la renovación para obtener la fecha real)`);
    } else {
      const dias = Math.floor((Date.parse(info.vence) - Date.parse(claveDia(ahora, config.zonaHoraria))) / 86400000);
      if (Number.isNaN(dias)) error(`${config.rutas.datos}/token-info.json: la fecha "${info.vence}" no es válida`);
      else if (dias < 0) error(`el token de Instagram de ${config.cuenta} venció el ${info.vence}; genera uno nuevo y actualiza el secreto`);
      else if (dias < 14) aviso(`el token de Instagram de ${config.cuenta} vence en ${dias} días (${info.vence}); confirma que GH_PAT existe y renovar-token.yml está activo`);
      else bien(`el token de Instagram de ${config.cuenta} vence el ${info.vence} (en ${dias} días)`);
    }
  }
  // Posts cuya cuenta no está declarada: ningún flujo los procesaría y el panel no los muestra.
  const huerfanos = leerPosts(path.join(raiz, "posts"), { cuentaPorDefecto: global.cuentas[0], log: { warn: () => {} } })
    .filter((p) => !global.cuentas.includes(p.cuenta));
  if (huerfanos.length) {
    const porCuenta = {};
    for (const p of huerfanos) porCuenta[p.cuenta] = (porCuenta[p.cuenta] || 0) + 1;
    aviso(`posts con cuenta no declarada en config.json: ${Object.entries(porCuenta).map(([c, n]) => `${c} (${n} post${n === 1 ? "" : "s"})`).join(", ")}; añade la cuenta o corrige el campo cuenta`);
  }
  return { ok, lineas, faltantes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = ejecutarVerificacion();
  for (const l of r.lineas) console.log(l);
  if (r.ok) {
    console.log("Verificación completa: todo lo obligatorio está presente.");
  } else {
    console.error(`Verificación con errores${r.faltantes.length ? ` (secretos que faltan: ${r.faltantes.join(", ")})` : ""}. Revisa docs/CONFIGURACION.md.`);
    process.exit(1);
  }
}
