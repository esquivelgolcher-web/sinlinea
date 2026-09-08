// VERIFICAR: comprueba configuración, archivos y secretos sin revelar ningún valor.
// Uso: npm run verificar  (o el workflow manual "Verificar configuración y secretos").
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cargarConfig } from "./lib/config.mjs";
import { secretosRequeridos, verificarSecretos } from "./lib/secretos.mjs";
import { leerTokenInfo } from "./publicar.mjs";
import { claveDia } from "./lib/fechas.mjs";

const ARCHIVOS = [
  ["prompts/editorial.md", "línea editorial"],
  ["templates/post.html", "plantilla del post"],
  ["assets/logo.png", "logo de la marca"],
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

  let config;
  try {
    config = cargarConfig(path.join(raiz, "config.json"));
    bien("config.json válido");
  } catch (err) {
    error(/^config\.json/.test(err.message) ? err.message : `config.json: ${err.message}`);
    return { ok, lineas, faltantes };
  }
  if (/CAMBIAR/.test(config.pages.baseUrl)) error("pages.baseUrl todavía tiene el valor CAMBIAR");
  else bien(`pages.baseUrl = ${config.pages.baseUrl}`);

  for (const [ruta, descripcion] of ARCHIVOS) {
    if (fs.existsSync(path.join(raiz, ruta))) bien(`${ruta} (${descripcion})`);
    else error(`falta ${ruta} (${descripcion})`);
  }

  const requeridos = secretosRequeridos(config);
  const r = verificarSecretos(env, requeridos);
  for (const s of requeridos) {
    if (r.presentes.includes(s.nombre)) bien(`${s.nombre}: OK (${s.uso})`);
    else if (s.obligatorio) error(`${s.nombre}: FALTA (${s.uso})`);
    else aviso(`${s.nombre}: falta (opcional: ${s.uso})`);
  }
  faltantes.push(...r.faltantes);

  const info = leerTokenInfo(raiz);
  if (!info.vence) {
    aviso("data/token-info.json no tiene la fecha de vencimiento del token de Instagram");
  } else {
    const dias = Math.floor((Date.parse(info.vence) - Date.parse(claveDia(ahora, config.zonaHoraria))) / 86400000);
    if (Number.isNaN(dias)) error(`data/token-info.json: la fecha "${info.vence}" no es válida`);
    else if (dias < 0) error(`el token de Instagram venció el ${info.vence}; genera uno nuevo y actualiza el secreto`);
    else if (dias < 14) aviso(`el token de Instagram vence en ${dias} días (${info.vence}); confirma que GH_PAT existe y renovar-token.yml está activo`);
    else bien(`el token de Instagram vence el ${info.vence} (en ${dias} días)`);
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
