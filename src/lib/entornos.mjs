// Comprobación del Environment de una cuenta por la API de GitHub, SOLO metadatos (la API nunca devuelve valores).
// Se ejecuta antes de contactar con Instagram: si al Environment exacto cuenta-<id> le falta IG_ACCESS_TOKEN o
// IG_USER_ID, o no hay permiso para comprobarlo, el job de esa cuenta falla con un mensaje claro y no usa credenciales
// de ningún otro origen. Permiso requerido (documentación oficial de la API REST): "Environments" (lectura) en el token.
export const NOMBRES_ENTORNO = Object.freeze(["IG_ACCESS_TOKEN", "IG_USER_ID"]);
const API = "https://api.github.com";

export async function comprobarEntorno({ repo, entorno, nombres = NOMBRES_ENTORNO, token = "", fetchImpl = (...a) => fetch(...a) } = {}) {
  const donde = `Settings → Environments → ${entorno} → Environment secrets`;
  if (!token) {
    return { ok: false, permiso: false, presentes: [], faltan: [...nombres], motivo: `no se pudo comprobar el Environment ${entorno}: falta GH_PAT (token fino con permiso Environments: lectura). Sin esa comprobación no se contacta con Instagram.` };
  }
  const presentes = [];
  const faltan = [];
  for (const nombre of nombres) {
    let res;
    try {
      res = await fetchImpl(`${API}/repos/${repo}/environments/${entorno}/secrets/${nombre}`, {
        headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      return { ok: false, permiso: null, presentes, faltan: [...nombres], motivo: `no se pudo consultar la API de GitHub para el Environment ${entorno} (${err.message}); no se contacta con Instagram.` };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, permiso: false, presentes, faltan: [...nombres], motivo: `sin permiso para leer los metadatos de los secretos del Environment ${entorno} (GitHub respondió ${res.status}): GH_PAT necesita el permiso Environments: lectura. Sin esa comprobación no se contacta con Instagram.` };
    }
    if (res.status === 404) { faltan.push(nombre); continue; }
    if (!res.ok) {
      return { ok: false, permiso: null, presentes, faltan: [...nombres], motivo: `no se pudo consultar el Environment ${entorno} (GitHub respondió ${res.status}); no se contacta con Instagram.` };
    }
    presentes.push(nombre);
  }
  if (faltan.length === nombres.length) {
    return { ok: false, permiso: true, presentes, faltan, motivo: `el Environment ${entorno} no existe o está sin secretos: faltan ${faltan.join(" y ")}. Créalo en ${donde} con esos dos secretos. No se usa ningún secreto del repositorio en su lugar.` };
  }
  if (faltan.length) {
    return { ok: false, permiso: true, presentes, faltan, motivo: `al Environment ${entorno} le falta ${faltan.join(" y ")}. Añádelo en ${donde}. Aunque exista un secreto de repositorio con ese nombre, no se usa: cada cuenta solo usa su origen.` };
  }
  return { ok: true, permiso: true, presentes, faltan: [], motivo: `Environment ${entorno} completo (${nombres.join(", ")})` };
}
