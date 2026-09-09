// Ayudante de pruebas: arma una raíz temporal con la configuración global y las cuentas.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const CUENTA_PRINCIPAL = "sinlinea";

function copiarDir(origen, destino, { omitir = [] } = {}) {
  fs.mkdirSync(destino, { recursive: true });
  for (const e of fs.readdirSync(origen, { withFileTypes: true })) {
    if (omitir.includes(e.name)) continue;
    const o = path.join(origen, e.name);
    const d = path.join(destino, e.name);
    if (e.isDirectory()) copiarDir(o, d);
    else fs.copyFileSync(o, d);
  }
}

// Crea <raiz> con config.json y cuentas/. `cuentas` es la lista de ids a activar:
// "sinlinea" se copia del repo; cualquier otro id se copia de tests/fixtures/cuentas/<id>.
// `global` permite sobreescribir claves del config.json global (p. ej. pages.baseUrl).
export function raizConCuentas({ cuentas = [CUENTA_PRINCIPAL], global = {}, prefijo = "sl-" } = {}) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), prefijo));
  const g = { ...JSON.parse(fs.readFileSync("config.json", "utf8")), ...global, cuentas };
  fs.writeFileSync(path.join(raiz, "config.json"), JSON.stringify(g, null, 2) + "\n");
  for (const id of cuentas) {
    const origen = fs.existsSync(path.join("cuentas", id)) ? path.join("cuentas", id) : path.join("tests", "fixtures", "cuentas", id);
    copiarDir(origen, path.join(raiz, "cuentas", id), { omitir: ["logo.png"] });
    if (id === CUENTA_PRINCIPAL) {
      // Las pruebas ejercitan los flujos completos: la cuenta principal va siempre con la automatización
      // encendida, aunque en producción esté pausada temporalmente.
      const rutaCfg = path.join(raiz, "cuentas", id, "config.json");
      const cfg = JSON.parse(fs.readFileSync(rutaCfg, "utf8"));
      cfg.automatico = { generar: true, publicar: true };
      fs.writeFileSync(rutaCfg, JSON.stringify(cfg, null, 2) + "\n");
    }
    // Las cuentas reales pueden migrar a modo Environment; las pruebas ejercitan el modo repositorio (nombres declarados)
    // salvo que una prueba fije otro origen explícitamente.
    const rutaIg = path.join(raiz, "cuentas", id, "config.json");
    const cfgIg = JSON.parse(fs.readFileSync(rutaIg, "utf8"));
    if (cfgIg.instagram?.origen === "entorno") { delete cfgIg.instagram.origen; fs.writeFileSync(rutaIg, JSON.stringify(cfgIg, null, 2) + "\n"); }
    if (fs.existsSync(path.join(origen, "logo.png"))) fs.writeFileSync(path.join(raiz, "cuentas", id, "logo.png"), Buffer.from([0x89])); // marcador: solo se comprueba que exista
    fs.mkdirSync(path.join(raiz, "data", id), { recursive: true });
  }
  for (const d of ["posts", "public/img", "public/ilus", "temp"]) fs.mkdirSync(path.join(raiz, d), { recursive: true });
  return raiz;
}
