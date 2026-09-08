# Ilustraciones generadas con IA — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir a cada post una ilustración de fondo generada con la API de Gemini a partir de una escena que redacta Claude, con rótulo "Ilustración generada con IA", control desde el panel y respaldo tipográfico cuando falle o se desactive.

**Architecture:** Un módulo nuevo `src/lib/ilustrador.mjs` (cliente REST de Gemini con `fetch` inyectable + guardado con `sharp`) que GENERAR y REGENERAR llaman antes del render; el post gana el campo `ilustracion`; `hashImagen` incorpora la ilustración para que activar, desactivar o cambiar la escena re-renderice; la plantilla v5 pinta la imagen de fondo con degradado y rótulo; el panel edita escena/uso y fuerza regeneración.

**Tech Stack:** Node 20+ ESM, `sharp`, `zod` (esquema de Claude), Gemini API `POST /v1beta/interactions` (modelo `gemini-3.1-flash-lite-image`, `aspect_ratio: "4:5"`), Playwright para el render, node:test.

**Spec:** `docs/superpowers/specs/2026-09-08-ilustraciones-design.md` (amplía `docs/superpowers/specs/2026-09-07-sinlinea-instagram-design.md`).

## Global Constraints

- Todo texto visible y nombres en español; código ESM `.mjs`; sin nuevas dependencias npm.
- La clave `GEMINI_API_KEY` solo viaja en la cabecera `x-goog-api-key`; nunca en logs, URLs ni archivos.
- Ningún flujo se bloquea por la ilustración: cualquier fallo deja `ilustracion.usar = false` con `error` y el post sigue con la plantilla tipográfica.
- Rótulo obligatorio cuando hay ilustración: `config.ilustraciones.rotulo` = "Ilustración generada con IA".
- La escena nunca describe personas reales, rostros, texto ni logotipos (regla en el prompt de Claude).
- Los módulos isomorfos (`estados.mjs`, `caption.mjs`, `franjas.mjs`, `fechas.mjs`) siguen sin imports de Node.
- `data-version` de la plantilla pasa a `5`; `tests/render.test.mjs` y `tests/render.integration.mjs` se actualizan.
- Cada commit termina con `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; los commits que no deban disparar GENERAR llevan `[skip ci]` (los de código sí deben dispararlo al final, para desplegar el panel).
- Todas las suites deben pasar: `npm test`, `npm run test:render`, `npm run test:e2e`.

## Mapa de archivos

| Archivo | Cambio |
|---|---|
| `config.json`, `src/lib/config.mjs` | bloque `ilustraciones` + validación |
| `src/lib/estados.mjs` | `hashTexto`, `hashImagen` con ilustración, `necesitaIlustracion`, `ilustracion` editable |
| `src/lib/posts.mjs` | `validarPost` acepta `ilustracion`, `rutaIlustracion`, `crearPost` con `escena` |
| `src/lib/redactor.mjs` | campo `escena` en el esquema y reglas |
| `src/lib/ilustrador.mjs` (nuevo) | cliente Gemini + `guardarIlustracion` |
| `src/probar-gemini.mjs` (nuevo), `.github/workflows/probar-gemini.yml` (nuevo) | prueba manual de la clave |
| `templates/post.html`, `src/lib/render.mjs`, `src/serve.mjs` | capa de fondo, rótulo, `ilustracionUrl`, vista de prueba |
| `src/generar.mjs`, `src/regenerar.mjs`, `.github/workflows/generar.yml`, `.github/workflows/regenerar.yml` | generación/regeneración, secreto y `git add public/ilus` |
| `panel/app.js`, `panel/styles.css` | escena, casilla usar, botón regenerar |
| `GUIA.md`, `docs/CONFIGURACION.md`, `README.md` | documentación |
| `tests/*.test.mjs`, `tests/render.integration.mjs`, `tests/panel.e2e.mjs`, `tests/fixtures/ilustracion-ejemplo.jpg` | pruebas |

---

### Task 1: Modelo de datos y configuración

**Files:**
- Modify: `config.json`, `src/lib/config.mjs`, `src/lib/estados.mjs`, `src/lib/posts.mjs`
- Test: `tests/config.test.mjs`, `tests/estados.test.mjs`, `tests/posts.test.mjs`

**Interfaces:**
- Produces: `hashTexto(texto) → 16 hex`; `hashImagen(post, version)` ahora depende de `post.ilustracion` (`usar && ruta` → incluye `hashDescripcion`); `necesitaIlustracion(post, ahora: Date) → boolean`; `editarTexto` acepta `ilustracion` (objeto con `descripcion` string y `usar` boolean); `validarPost` acepta `ilustracion` ausente/`null`/objeto; `rutaIlustracion(id) → "public/ilus/<id>.jpg"`; `crearPost({ candidato, redaccion, ... })` crea `ilustracion` cuando `redaccion.escena` es una cadena no vacía; `config.ilustraciones` validada.

- [ ] **Step 1: Añadir el bloque a `config.json`** (después de `"instagram"`):

```json
  "ilustraciones": {
    "activo": true,
    "proveedor": "gemini",
    "modelo": "gemini-3.1-flash-lite-image",
    "tamano": "1K",
    "estilo": "Fotografía editorial realista de prensa, luz natural, colores sobrios, composición limpia con espacio libre en la mitad inferior. Sin personas identificables ni rostros, sin texto, sin logotipos, sin marcas de agua.",
    "rotulo": "Ilustración generada con IA",
    "timeoutMs": 60000
  },
```

- [ ] **Step 2: Tests de config** — añadir a `tests/config.test.mjs`:

```js
test("valida el bloque ilustraciones", () => {
  const cfg = base();
  assert.equal(cfg.ilustraciones.proveedor, "gemini");
  cfg.ilustraciones.tamano = "8K";
  assert.throws(() => validarConfig(cfg), /ilustraciones\.tamano/);
  const cfg2 = base();
  cfg2.ilustraciones.activo = "si";
  assert.throws(() => validarConfig(cfg2), /ilustraciones\.activo/);
});
```

- [ ] **Step 3: Validación en `src/lib/config.mjs`** (antes del `return cfg`):

```js
  const il = cfg.ilustraciones;
  exigir(il && typeof il === "object", "ilustraciones es obligatorio");
  exigir(typeof il.activo === "boolean", "ilustraciones.activo debe ser true o false");
  exigir(il.proveedor === "gemini", "ilustraciones.proveedor debe ser gemini");
  for (const k of ["modelo", "estilo", "rotulo"]) exigir(typeof il[k] === "string" && il[k].trim(), `ilustraciones.${k} es obligatorio`);
  exigir(["512px", "1K", "2K"].includes(il.tamano), "ilustraciones.tamano debe ser 512px, 1K o 2K");
  exigir(Number.isInteger(il.timeoutMs) && il.timeoutMs > 0, "ilustraciones.timeoutMs debe ser un entero positivo");
```

- [ ] **Step 4: Tests de estados** — añadir a `tests/estados.test.mjs`:

```js
import { hashTexto, necesitaIlustracion } from "../src/lib/estados.mjs";

test("hashTexto es estable y hashImagen cambia con la ilustración usada", () => {
  assert.equal(hashTexto("hola"), hashTexto("hola"));
  assert.match(hashTexto("hola"), /^[0-9a-f]{16}$/);
  const p = base();
  const sin = hashImagen(p, 1);
  const conIlus = { ...p, ilustracion: { descripcion: "Canal", usar: true, ruta: "public/ilus/x.jpg", hashDescripcion: hashTexto("Canal"), error: null } };
  assert.notEqual(hashImagen(conIlus, 1), sin);
  assert.equal(hashImagen({ ...conIlus, ilustracion: { ...conIlus.ilustracion, usar: false } }, 1), sin);
  assert.equal(hashImagen({ ...conIlus, ilustracion: { ...conIlus.ilustracion, ruta: null } }, 1), sin);
  assert.notEqual(hashImagen({ ...conIlus, ilustracion: { ...conIlus.ilustracion, hashDescripcion: hashTexto("Asamblea") } }, 1), hashImagen(conIlus, 1));
});

test("necesitaIlustracion: solo con usar=true y escena cambiada o sin imagen (salvo error reciente)", () => {
  const ahora = new Date("2026-09-08T12:00:00Z");
  const ok = { descripcion: "Canal", usar: true, ruta: "public/ilus/x.jpg", hashDescripcion: hashTexto("Canal"), error: null };
  assert.equal(necesitaIlustracion({ ilustracion: ok }, ahora), false);
  assert.equal(necesitaIlustracion({ ilustracion: { ...ok, descripcion: "Asamblea" } }, ahora), true);
  assert.equal(necesitaIlustracion({ ilustracion: { ...ok, ruta: null, hashDescripcion: null } }, ahora), true);
  assert.equal(necesitaIlustracion({ ilustracion: { ...ok, ruta: null, hashDescripcion: null, error: { mensaje: "x", fecha: "2026-09-08T11:30:00Z" } } }, ahora), false);
  assert.equal(necesitaIlustracion({ ilustracion: { ...ok, ruta: null, hashDescripcion: null, error: { mensaje: "x", fecha: "2026-09-08T09:00:00Z" } } }, ahora), true);
  assert.equal(necesitaIlustracion({ ilustracion: { ...ok, usar: false, descripcion: "Otra" } }, ahora), false);
  assert.equal(necesitaIlustracion({ ilustracion: null }, ahora), false);
  assert.equal(necesitaIlustracion({}, ahora), false);
});

test("editarTexto acepta ilustracion válida y rechaza inválida", () => {
  const p = base();
  const e = editarTexto(p, { ilustracion: { descripcion: "Canal", usar: true, ruta: null, hashDescripcion: null, error: null } }, AHORA);
  assert.equal(e.ilustracion.usar, true);
  assert.throws(() => editarTexto(p, { ilustracion: { descripcion: 5, usar: true } }, AHORA), /ilustracion/);
});
```

- [ ] **Step 5: Implementar en `src/lib/estados.mjs`**

Añadir `"ilustracion"` a `CAMPOS_EDITABLES`. Añadir tras `fnv1a`:

```js
export function hashTexto(texto) {
  const t = String(texto ?? "");
  return fnv1a(t, 0x811c9dc5) + fnv1a(t, 0x050c5d1f);
}
```

Reemplazar `hashImagen`:

```js
export function hashImagen(post, version) {
  const il = post.ilustracion;
  const ilus = il && il.usar && il.ruta ? String(il.hashDescripcion || "") : "";
  const texto = [...CAMPOS_IMAGEN.map((c) => String(post[c] ?? "")), ilus, String(version)].join("SEPARADOR");
  return fnv1a(texto, 0x811c9dc5) + fnv1a(texto, 0x050c5d1f);
}
```

`SEPARADOR` es el mismo separador NUL que el archivo ya usa en `join` (la secuencia de escape de seis caracteres, escrita tal cual en el código fuente; no la cambies por un espacio ni por un byte crudo). Lo más simple: conserva el `join` literal actual e inserta `ilus` en la lista.

Añadir:

```js
const HORA_MS = 3600000;

// ¿Hay que pedir (o volver a pedir) la ilustración a Gemini?
export function necesitaIlustracion(post, ahora) {
  const il = post.ilustracion;
  if (!il || !il.usar) return false;
  if (il.ruta && il.hashDescripcion === hashTexto(il.descripcion)) return false;
  if (il.hashDescripcion && il.hashDescripcion !== hashTexto(il.descripcion)) return true;
  if (il.error && ahora.getTime() - Date.parse(il.error.fecha) < HORA_MS) return false;
  return true;
}
```

En `editarTexto`, antes del `return`:

```js
  if (cambios.ilustracion !== undefined && cambios.ilustracion !== null) {
    const il = cambios.ilustracion;
    if (!il || typeof il !== "object" || typeof il.descripcion !== "string" || typeof il.usar !== "boolean") {
      throw new Error("ilustracion debe tener descripcion (texto) y usar (true/false)");
    }
  }
```

- [ ] **Step 6: Tests de posts** — añadir a `tests/posts.test.mjs`:

```js
test("crearPost crea ilustracion cuando hay escena; validarPost la comprueba", () => {
  const con = crearPost({ candidato, redaccion: { ...redaccion, escena: "Estación de bomberos en Panamá al atardecer" }, variante: "negro", ahora });
  assert.deepEqual(con.ilustracion, { descripcion: "Estación de bomberos en Panamá al atardecer", usar: false, ruta: null, hashDescripcion: null, proveedor: null, modelo: null, generada: null, error: null });
  const sin = crearPost({ candidato, redaccion, variante: "negro", ahora });
  assert.equal(sin.ilustracion, null);
  assert.equal(rutaIlustracion(con.id), `public/ilus/${con.id}.jpg`);
  assert.throws(() => validarPost({ ...con, ilustracion: { descripcion: "x" } }), /ilustracion/);
  assert.throws(() => validarPost({ ...con, ilustracion: { ...con.ilustracion, error: { mensaje: 1 } } }), /ilustracion/);
  validarPost({ ...con, ilustracion: { ...con.ilustracion, usar: true, ruta: "public/ilus/a.jpg", hashDescripcion: "0123456789abcdef", error: null } });
  validarPost({ ...con, ilustracion: undefined });
});
```

Importar `rutaIlustracion` en la cabecera del test.

- [ ] **Step 7: Implementar en `src/lib/posts.mjs`**

Exportar:

```js
export function rutaIlustracion(id) {
  return `public/ilus/${id}.jpg`;
}
```

En `validarPost`, antes del `return post`:

```js
  if (post.ilustracion !== undefined && post.ilustracion !== null) {
    const il = post.ilustracion;
    exigir(
      il && typeof il === "object" && typeof il.descripcion === "string" && typeof il.usar === "boolean"
        && (il.ruta === null || typeof il.ruta === "string") && (il.hashDescripcion === null || typeof il.hashDescripcion === "string")
        && (il.error === null || (il.error && typeof il.error.mensaje === "string" && !Number.isNaN(Date.parse(il.error.fecha)))),
      "ilustracion debe tener descripcion, usar, ruta, hashDescripcion y error válidos"
    );
  }
```

En `crearPost`, añadir el campo tras `imagen: null`:

```js
    ilustracion: typeof redaccion.escena === "string" && redaccion.escena.trim()
      ? { descripcion: redaccion.escena.trim(), usar: false, ruta: null, hashDescripcion: null, proveedor: null, modelo: null, generada: null, error: null }
      : null,
```

- [ ] **Step 8: Correr y commitear**

Run: `node --test tests/config.test.mjs tests/estados.test.mjs tests/posts.test.mjs` → todos en verde; luego `npm test`.

```bash
git add config.json src/lib/config.mjs src/lib/estados.mjs src/lib/posts.mjs tests/config.test.mjs tests/estados.test.mjs tests/posts.test.mjs
git commit -m "feat: modelo de ilustración en el post, hash con ilustración y configuración de Gemini [skip ci]"
```

---

### Task 2: Escena en la redacción de Claude y cliente de Gemini

**Files:**
- Modify: `src/lib/redactor.mjs`, `tests/redactor.test.mjs`
- Create: `src/lib/ilustrador.mjs`, `tests/ilustrador.test.mjs`, `src/probar-gemini.mjs`, `.github/workflows/probar-gemini.yml`

**Interfaces:**
- Produces: `EsquemaRedaccion.seleccion[].escena: string`; `crearIlustrador({ apiKey, config, fetchImpl = fetch, dormir }) → { generar(descripcion) → Promise<Buffer> }`; `extraerImagenBase64(json) → string | null`; `textoDeRespuesta(json) → string`; `guardarIlustracion(buffer, rutaAbsoluta) → Promise<void>` (JPEG 1080×1350 `cover`, calidad 85).

- [ ] **Step 1: Redactor** — en `src/lib/redactor.mjs`, añadir `escena: z.string(),` al objeto de `seleccion` (tras `motivo`), y a `REGLAS_FIJAS` estas líneas:

```
- "escena": describe en 15 a 40 palabras, en español, una imagen concreta que represente la noticia
  (un lugar, un objeto, una situación): por ejemplo "Fachada de la Asamblea Nacional de Panamá al
  atardecer". Nunca personas reales ni rostros reconocibles, nunca texto ni logotipos, nunca violencia
  gráfica ni sangre. No incluyas el estilo fotográfico: se añade aparte.
```

En `tests/redactor.test.mjs`, añadir `escena: "Estación de bomberos"` a cada elemento de `salida.seleccion`, y un test:

```js
test("el esquema exige escena y las reglas la describen", () => {
  const sin = structuredClone(salida);
  delete sin.seleccion[0].escena;
  assert.equal(EsquemaRedaccion.safeParse(sin).success, false);
  assert.match(construirSystem(""), /"escena"/);
  assert.match(construirSystem(""), /Nunca personas reales/);
});
```

Run: `node --test tests/redactor.test.mjs`.

- [ ] **Step 2: Test del ilustrador** — `tests/ilustrador.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { crearIlustrador, extraerImagenBase64, textoDeRespuesta, guardarIlustracion } from "../src/lib/ilustrador.mjs";
import { cargarConfig } from "../src/lib/config.mjs";

const cfg = cargarConfig("config.json");
const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function fetchFalso(respuestas) {
  const llamadas = [];
  const impl = async (url, opciones) => {
    llamadas.push({ url, cabeceras: opciones.headers, cuerpo: JSON.parse(opciones.body) });
    const r = respuestas.shift();
    if (r.error) throw r.error;
    return new Response(JSON.stringify(r.json ?? {}), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  };
  return { impl, llamadas };
}
const dormir = async () => {};

test("extraerImagenBase64 entiende los tres formatos de respuesta", () => {
  assert.equal(extraerImagenBase64({ output_image: { data: "AAA" } }), "AAA");
  assert.equal(extraerImagenBase64({ interaction: { output_image: { data: "BBB" } } }), "BBB");
  assert.equal(extraerImagenBase64({ steps: [{ type: "model_output", content: [{ type: "text", text: "hola" }, { type: "image", data: "CCC" }] }] }), "CCC");
  assert.equal(extraerImagenBase64({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "DDD" } }] } }] }), "DDD");
  assert.equal(extraerImagenBase64({ output_text: "no" }), null);
  assert.equal(textoDeRespuesta({ output_text: "motivo" }), "motivo");
});

test("generar envía el estilo + escena con la clave en cabecera y devuelve un Buffer", async () => {
  const { impl, llamadas } = fetchFalso([{ json: { output_image: { data: pixel } } }]);
  const il = crearIlustrador({ apiKey: "CLAVE", config: cfg, fetchImpl: impl, dormir });
  const buf = await il.generar("Canal de Panamá al amanecer");
  assert.ok(Buffer.isBuffer(buf) && buf.length > 10);
  assert.equal(llamadas[0].url, "https://generativelanguage.googleapis.com/v1beta/interactions");
  assert.equal(llamadas[0].cabeceras["x-goog-api-key"], "CLAVE");
  assert.equal(llamadas[0].cuerpo.model, cfg.ilustraciones.modelo);
  assert.match(llamadas[0].cuerpo.input[0].text, /Fotografía editorial/);
  assert.match(llamadas[0].cuerpo.input[0].text, /Escena: Canal de Panamá al amanecer$/);
  assert.deepEqual(llamadas[0].cuerpo.response_format, { type: "image", mime_type: "image/jpeg", aspect_ratio: "4:5", image_size: cfg.ilustraciones.tamano });
  assert.ok(!JSON.stringify(llamadas[0].url).includes("CLAVE"));
});

test("generar reintenta una vez ante 429 o error de red, y lanza ante 4xx o sin imagen", async () => {
  const a = fetchFalso([{ status: 429, json: { error: { message: "quota" } } }, { json: { output_image: { data: pixel } } }]);
  const il = crearIlustrador({ apiKey: "K", config: cfg, fetchImpl: a.impl, dormir });
  assert.ok(await il.generar("x"));
  assert.equal(a.llamadas.length, 2);
  const b = fetchFalso([{ error: new Error("red") }, { error: new Error("red") }]);
  await assert.rejects(() => crearIlustrador({ apiKey: "K", config: cfg, fetchImpl: b.impl, dormir }).generar("x"), /red/);
  const c = fetchFalso([{ status: 400, json: { error: { message: "Invalid model" } } }]);
  await assert.rejects(() => crearIlustrador({ apiKey: "K", config: cfg, fetchImpl: c.impl, dormir }).generar("x"), /400.*Invalid model/);
  assert.equal(c.llamadas.length, 1);
  const d = fetchFalso([{ json: { output_text: "No puedo generar esa imagen" } }]);
  await assert.rejects(() => crearIlustrador({ apiKey: "K", config: cfg, fetchImpl: d.impl, dormir }).generar("x"), /no devolvió imagen.*No puedo/);
});

test("guardarIlustracion escribe un JPEG 1080x1350", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ilus-"));
  const entrada = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#336699" } }).png().toBuffer();
  const ruta = path.join(dir, "sub", "a.jpg");
  await guardarIlustracion(entrada, ruta);
  const m = await sharp(ruta).metadata();
  assert.equal(m.format, "jpeg");
  assert.equal(m.width, 1080);
  assert.equal(m.height, 1350);
});
```

Run: `node --test tests/ilustrador.test.mjs` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar `src/lib/ilustrador.mjs`**

```js
// Cliente mínimo de la Gemini API para generar la ilustración de un post.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

export const ENDPOINT_GEMINI = "https://generativelanguage.googleapis.com/v1beta/interactions";

export function extraerImagenBase64(json) {
  const directo = json?.output_image?.data || json?.interaction?.output_image?.data;
  if (directo) return directo;
  for (const paso of json?.steps || json?.interaction?.steps || []) {
    for (const bloque of paso?.content || []) {
      if (bloque?.type === "image" && (bloque.data || bloque.image?.data)) return bloque.data || bloque.image.data;
    }
  }
  for (const parte of json?.candidates?.[0]?.content?.parts || []) {
    if (parte?.inlineData?.data) return parte.inlineData.data;
  }
  return null;
}

export function textoDeRespuesta(json) {
  if (json?.output_text) return String(json.output_text);
  if (json?.interaction?.output_text) return String(json.interaction.output_text);
  const partes = json?.candidates?.[0]?.content?.parts || [];
  return partes.filter((p) => p?.text).map((p) => p.text).join(" ").trim();
}

export function crearIlustrador({ apiKey, config, fetchImpl = fetch, dormir = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const c = config.ilustraciones;
  if (!apiKey) throw new Error("Falta la clave de Gemini");

  async function generar(descripcion) {
    const cuerpo = {
      model: c.modelo,
      input: [{ type: "text", text: `${c.estilo}\n\nEscena: ${descripcion}` }],
      response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: "4:5", image_size: c.tamano },
    };
    let ultimo;
    for (let intento = 0; intento < 2; intento++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), c.timeoutMs);
      let res, json;
      try {
        res = await fetchImpl(ENDPOINT_GEMINI, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify(cuerpo),
          signal: ctrl.signal,
        });
        json = await res.json().catch(() => ({}));
      } catch (err) {
        ultimo = err.name === "AbortError" ? new Error("Gemini: tiempo de espera agotado") : err;
        if (intento === 0) { await dormir(5000); continue; }
        throw ultimo;
      } finally {
        clearTimeout(timer);
      }
      if (res.ok) {
        const b64 = extraerImagenBase64(json);
        if (!b64) throw new Error(`Gemini no devolvió imagen: ${textoDeRespuesta(json) || "sin detalle"}`);
        return Buffer.from(b64, "base64");
      }
      const mensaje = `Gemini respondió ${res.status}: ${json?.error?.message || "error"}`;
      if (res.status === 429 || res.status >= 500) {
        ultimo = new Error(mensaje);
        if (intento === 0) { await dormir(5000); continue; }
        throw ultimo;
      }
      throw new Error(mensaje);
    }
    throw ultimo;
  }

  return { generar };
}

export async function guardarIlustracion(buffer, rutaAbsoluta) {
  fs.mkdirSync(path.dirname(rutaAbsoluta), { recursive: true });
  await sharp(buffer).resize(1080, 1350, { fit: "cover" }).jpeg({ quality: 85, progressive: true, mozjpeg: true }).toFile(rutaAbsoluta);
}
```

Run: `node --test tests/ilustrador.test.mjs` → `# pass 4`.

- [ ] **Step 4: Prueba manual de la clave** — `src/probar-gemini.mjs`:

```js
// Genera una ilustración de prueba con Gemini para verificar clave, modelo y formato de respuesta.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cargarConfig } from "./lib/config.mjs";
import { crearIlustrador, guardarIlustracion } from "./lib/ilustrador.mjs";

export async function ejecutarPrueba({ config, apiKey, raiz = process.cwd(), log = console }) {
  const il = crearIlustrador({ apiKey, config });
  const inicio = Date.now();
  const buf = await il.generar("Vista del Canal de Panamá desde las esclusas de Miraflores al amanecer, sin personas");
  const destino = path.join(raiz, "temp", "prueba-gemini.jpg");
  await guardarIlustracion(buf, destino);
  log.info(`Ilustración de prueba generada en ${Math.round((Date.now() - inicio) / 1000)} s: ${destino} (${buf.length} bytes recibidos)`);
  return destino;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.GEMINI_API_KEY) { console.error("Falta la variable de entorno GEMINI_API_KEY"); process.exit(1); }
  ejecutarPrueba({ config: cargarConfig(), apiKey: process.env.GEMINI_API_KEY })
    .catch((err) => { console.error(`La prueba de Gemini falló: ${err.message}`); process.exit(1); });
}
```

`.github/workflows/probar-gemini.yml`:

```yaml
name: Probar Gemini

# Manual: genera una ilustración de prueba y la deja como artefacto de la corrida.
on:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  probar:
    runs-on: ubuntu-latest
    steps:
      - name: Descargar el repositorio
        uses: actions/checkout@v4
      - name: Preparar Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm
      - name: Instalar dependencias
        run: npm ci
      - name: Generar ilustración de prueba
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
        run: node src/probar-gemini.mjs
      - name: Guardar la imagen como artefacto
        uses: actions/upload-artifact@v4
        with:
          name: prueba-gemini
          path: temp/prueba-gemini.jpg
```

Añadir a `tests/workflows.test.mjs`:

```js
test("probar-gemini es manual, solo lee y usa el secreto GEMINI_API_KEY", () => {
  const w = wf("probar-gemini");
  assert.ok(w.on.workflow_dispatch !== undefined);
  assert.equal(w.permissions.contents, "read");
  assert.match(leer("probar-gemini"), /secrets\.GEMINI_API_KEY/);
});
```

- [ ] **Step 5: Correr y commitear**

Run: `npm test` → verde.

```bash
git add src/lib/redactor.mjs tests/redactor.test.mjs src/lib/ilustrador.mjs tests/ilustrador.test.mjs src/probar-gemini.mjs .github/workflows/probar-gemini.yml tests/workflows.test.mjs
git commit -m "feat: escena por post en la redacción y cliente de Gemini para ilustraciones [skip ci]"
```

---

### Task 3: Plantilla v5 con ilustración de fondo y render

**Files:**
- Modify: `templates/post.html`, `src/lib/render.mjs`, `src/serve.mjs`, `tests/render.test.mjs`, `tests/render.integration.mjs`, `tests/serve.test.mjs`
- Create: `tests/fixtures/ilustracion-ejemplo.jpg` (generada con sharp, ver Step 1)

**Interfaces:**
- Produces: `datosDeRender(post, config, { logoUrl, ilustracionUrl })` añade `ilustracionUrl` y `rotulo`; `construirHtml(post, config, { plantilla, baseHref, logoUrl, ilustracionUrl })`; `renderizarPost` usa `post.ilustracion.ruta` cuando `usar` es `true` y el archivo existe; `serve.mjs` sirve `GET /tests/fixtures/*` y acepta `/vista/<variante>?ilustracion=1`.

- [ ] **Step 1: Fixture** — crear la imagen de ejemplo una sola vez:

```bash
node -e "import('sharp').then(async ({default: sharp}) => { const svg = Buffer.from('<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1080\" height=\"1350\"><defs><linearGradient id=\"g\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#1d3557\"/><stop offset=\"1\" stop-color=\"#e63946\"/></linearGradient></defs><rect width=\"1080\" height=\"1350\" fill=\"url(#g)\"/><circle cx=\"540\" cy=\"420\" r=\"260\" fill=\"#f1faee\" opacity=\"0.6\"/></svg>'); await sharp(svg).jpeg({ quality: 80 }).toFile('tests/fixtures/ilustracion-ejemplo.jpg'); console.log('ok'); })"
```

- [ ] **Step 2: Plantilla** — en `templates/post.html`:
  - `<html lang="es" data-version="5">`.
  - CSS, añadir tras la regla `.post[data-variante="rojo"]`:

```css
  .fondo { position: absolute; inset: 0; display: none; }
  .fondo img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .fondo::after { content: ""; position: absolute; inset: 0;
    background: linear-gradient(to bottom, rgba(0,0,0,0.20) 0%, rgba(0,0,0,0.35) 35%, rgba(0,0,0,0.88) 68%, rgba(0,0,0,0.96) 100%); }
  .post.con-ilustracion { --fondo: var(--negro); --texto: var(--blanco); --titular: var(--amarillo); --chip-fondo: var(--rojo); --chip-texto: var(--blanco); --barra: var(--rojo); --barra-texto: var(--blanco); }
  .post.con-ilustracion .fondo { display: block; }
  .post.con-ilustracion .cabecera, .post.con-ilustracion .cuerpo, .post.con-ilustracion .pie, .post.con-ilustracion .barra { position: relative; z-index: 1; }
  .post.con-ilustracion .barra { position: absolute; }
  .post.con-ilustracion .bajada { opacity: 0.95; }
  .rotulo { display: none; position: absolute; right: 72px; bottom: 226px; z-index: 1; font-size: 22px; letter-spacing: 0.02em; color: rgba(255,255,255,0.8); }
  .post.con-ilustracion .rotulo { display: block; }
```

  - HTML: como primer hijo de `<div class="post" ...>` insertar `<div class="fondo" id="fondo"></div>`, y antes de `<div class="barra" id="lema"></div>` insertar `<div class="rotulo" id="rotulo"></div>`.
  - Script: después de la asignación de `lema`, añadir:

```js
  if (d.ilustracionUrl) {
    const fondo = new Image();
    fondo.alt = "";
    fondo.src = d.ilustracionUrl;
    $("fondo").replaceChildren(fondo);
    $("post").classList.add("con-ilustracion");
    $("rotulo").textContent = d.rotulo || "";
    await fondo.decode().catch(() => {});
  }
```

- [ ] **Step 3: render.mjs** — `datosDeRender(post, config, { logoUrl, ilustracionUrl = null })` devuelve además `ilustracionUrl` y `rotulo: config.ilustraciones.rotulo`. `construirHtml(post, config, { plantilla, baseHref, logoUrl, ilustracionUrl = null })` pasa `ilustracionUrl`. En `renderizarPost`, antes de `construirHtml`:

```js
  const il = post.ilustracion;
  const ilustracionUrl = il && il.usar && il.ruta && fs.existsSync(path.join(raiz, il.ruta)) ? il.ruta.replace(/\\/g, "/") : null;
```

y pasarlo a `construirHtml`. Documentar en el comentario del módulo que las rutas son relativas a la raíz del repo.

- [ ] **Step 4: serve.mjs** — en la ruta `/vista/<variante>`, leer `url.searchParams.get("ilustracion") === "1"` y pasar `ilustracionUrl: "tests/fixtures/ilustracion-ejemplo.jpg"` cuando esté. Añadir `GET /tests/fixtures/*` → `servirArchivo(res, path.join(raiz, "tests", "fixtures"), ...)`. En el índice `/`, añadir enlace `<li><a href="/vista/negro?ilustracion=1">Plantilla · con ilustración</a></li>`.

- [ ] **Step 5: Tests**
  - `tests/render.test.mjs`: versión `5`; test nuevo:

```js
test("construirHtml incluye la ilustración y el rótulo solo cuando se pasa ilustracionUrl", () => {
  const con = construirHtml(post, cfg, { plantilla, baseHref: "/", logoUrl: null, ilustracionUrl: "public/ilus/x.jpg" });
  const m = con.match(/<script id="datos" type="application\/json">([\s\S]*?)<\/script>/);
  const datos = JSON.parse(m[1]);
  assert.equal(datos.ilustracionUrl, "public/ilus/x.jpg");
  assert.equal(datos.rotulo, "Ilustración generada con IA");
  const sin = construirHtml(post, cfg, { plantilla, baseHref: "/", logoUrl: null });
  assert.equal(JSON.parse(sin.match(/<script id="datos" type="application\/json">([\s\S]*?)<\/script>/)[1]).ilustracionUrl, null);
});
```

  - `tests/render.integration.mjs`: versión `5`; test nuevo:

```js
test("renderiza con ilustración de fondo cuando usar=true y el archivo existe", async () => {
  const post = { ...base, ilustracion: { descripcion: "Canal", usar: true, ruta: "tests/fixtures/ilustracion-ejemplo.jpg", hashDescripcion: "0000000000000000", proveedor: "gemini", modelo: "x", generada: base.creado, error: null } };
  const img = await renderizarPost(post, { config: cfg, navegador, destino: path.join("temp", "test-render", "ilustracion.jpg") });
  const meta = await sharp(img.ruta).metadata();
  assert.equal(meta.width, 1080);
  const stats = await sharp(img.ruta).stats();
  assert.ok(stats.channels[2].mean > 25, "el fondo debe tener el azul de la fixture, no negro puro");
  assert.notEqual(img.hash, (await renderizarPost({ ...post, ilustracion: { ...post.ilustracion, usar: false } }, { config: cfg, navegador, destino: path.join("temp", "test-render", "sin-ilustracion.jpg") })).hash);
});
```

  - `tests/serve.test.mjs`: añadir `assert.match(await (await fetch(`${base}/vista/negro?ilustracion=1`)).text(), /"ilustracionUrl":"tests\/fixtures\/ilustracion-ejemplo.jpg"/);` y comprobar que `/tests/fixtures/ilustracion-ejemplo.jpg` responde 200 (copiar la fixture al raiz temporal en `before`).

- [ ] **Step 6: Correr, mirar y commitear**

Run: `npm test`, `npm run test:render`; abrir `temp/test-render/ilustracion.jpg` con la herramienta Read y confirmar: imagen de fondo visible arriba, degradado, titular amarillo legible, rótulo "Ilustración generada con IA" sobre la línea del pie, barra roja abajo.

```bash
git add templates/post.html src/lib/render.mjs src/serve.mjs tests/render.test.mjs tests/render.integration.mjs tests/serve.test.mjs tests/fixtures/ilustracion-ejemplo.jpg
git commit -m "feat: plantilla v5 con ilustración de fondo, degradado y rótulo [skip ci]"
```

---

### Task 4: GENERAR y REGENERAR piden la ilustración; workflows

**Files:**
- Modify: `src/generar.mjs`, `src/regenerar.mjs`, `tests/generar.test.mjs`, `tests/regenerar.test.mjs`, `.github/workflows/generar.yml`, `.github/workflows/regenerar.yml`, `tests/workflows.test.mjs`

**Interfaces:**
- `ejecutarGenerar({ ..., ilustrador = null })`: si hay `ilustrador` y el post tiene `ilustracion`, llama `ilustrador.generar(descripcion)` → `guardarIlustracion` en `rutaIlustracion(id)` (en dry-run `temp/dry-run/ilus/<id>.jpg`) → `usar: true, ruta, hashDescripcion: hashTexto(descripcion), proveedor, modelo, generada`; fallo → `usar: false, error`.
- `ejecutarRegenerar({ ..., ilustrador = null })`: primero, para cada post activo con `necesitaIlustracion(p, ahora)` y `ilustrador`, genera y guarda (éxito → campos como arriba; fallo → `error`, `usar` se mantiene); después la lógica de render existente (el hash cambia y re-renderiza).
- `main()` de ambos: `ilustrador = config.ilustraciones.activo && process.env.GEMINI_API_KEY ? crearIlustrador({ apiKey, config }) : null`, con `log.info("Sin GEMINI_API_KEY: los posts saldrán sin ilustración.")` cuando falte.

- [ ] **Step 1: Tests de generar** — en `tests/generar.test.mjs`, `clientFalso` añade `escena: "Estación de bomberos de Panamá"` a cada selección; tests nuevos:

```js
const ilustradorFalso = () => ({ llamadas: [], async generar(d) { this.llamadas.push(d); return Buffer.from("ffd8ffd9", "hex"); } });

test("con ilustrador, el post nace con ilustración usada y archivo guardado", async () => {
  const raiz = raizTemporal();
  const config = cargarConfig(path.join(raiz, "config.json"));
  const guardadas = [];
  const guardar = async (buf, ruta) => { guardadas.push(ruta); fs.mkdirSync(path.dirname(ruta), { recursive: true }); fs.writeFileSync(ruta, buf); };
  const il = ilustradorFalso();
  const r = await ejecutarGenerar({ config, raiz, ahora, fetchText, client: clientFalso([0]), render: renderOkFalso, log, ilustrador: il, guardar });
  const p = r.creados[0];
  assert.equal(il.llamadas[0], "Estación de bomberos de Panamá");
  assert.equal(p.ilustracion.usar, true);
  assert.equal(p.ilustracion.ruta, `public/ilus/${p.id}.jpg`);
  assert.equal(p.ilustracion.proveedor, "gemini");
  assert.ok(fs.existsSync(path.join(raiz, p.ilustracion.ruta)));
});

test("si la ilustración falla, el post sale con usar=false y error, y sin ilustrador no se llama", async () => {
  const raiz = raizTemporal();
  const config = cargarConfig(path.join(raiz, "config.json"));
  const il = { async generar() { throw new Error("Gemini respondió 429: quota"); } };
  const r = await ejecutarGenerar({ config, raiz, ahora, fetchText, client: clientFalso([0]), render: renderOkFalso, log, ilustrador: il });
  assert.equal(r.creados[0].ilustracion.usar, false);
  assert.match(r.creados[0].ilustracion.error.mensaje, /429/);
  assert.equal(r.creados[0].estado, "borrador");
  const raiz2 = raizTemporal();
  const r2 = await ejecutarGenerar({ config: cargarConfig(path.join(raiz2, "config.json")), raiz: raiz2, ahora, fetchText, client: clientFalso([0]), render: renderOkFalso, log });
  assert.equal(r2.creados[0].ilustracion.usar, false);
  assert.equal(r2.creados[0].ilustracion.error, null);
});
```

  (`ejecutarGenerar` acepta `guardar = guardarIlustracion` inyectable para no depender de `sharp` con bytes falsos.)

- [ ] **Step 2: generar.mjs** — importar `crearIlustrador, guardarIlustracion` de `./lib/ilustrador.mjs`, `rutaIlustracion` de `./lib/posts.mjs`, `hashTexto` de `./lib/estados.mjs`. Firma: `ejecutarGenerar({ ..., ilustrador = null, guardar = guardarIlustracion })`. Tras `crearPost` y antes del render:

```js
    if (ilustrador && post.ilustracion) {
      const ruta = dryRun ? path.join("temp", "dry-run", "ilus", `${post.id}.jpg`) : rutaIlustracion(post.id);
      try {
        const buf = await ilustrador.generar(post.ilustracion.descripcion);
        await guardar(buf, path.join(raiz, ruta));
        post = { ...post, ilustracion: { ...post.ilustracion, usar: true, ruta, hashDescripcion: hashTexto(post.ilustracion.descripcion), proveedor: config.ilustraciones.proveedor, modelo: config.ilustraciones.modelo, generada: iso, error: null } };
        log.info(`Ilustración generada para ${post.id}.`);
      } catch (err) {
        log.warn(`Ilustración falló para ${post.id}: ${err.message}`);
        post = { ...post, ilustracion: { ...post.ilustracion, usar: false, error: { mensaje: err.message, fecha: iso } } };
      }
    }
```

  `main()`: crear `ilustrador` como se indica en Interfaces y pasarlo.

- [ ] **Step 3: Tests de regenerar** — en `tests/regenerar.test.mjs`:

```js
test("regenera la ilustración cuando cambió la escena y no llama con usar=false", async () => {
  const conIlus = { ...base, imagen: imagenDe(base), ilustracion: { descripcion: "Nueva escena", usar: true, ruta: "public/ilus/a.jpg", hashDescripcion: "0000000000000000", proveedor: "gemini", modelo: "m", generada: ahora.toISOString(), error: null } };
  const apagada = { ...base, id: base.id.slice(0, -4) + "0009", imagen: imagenDe({ ...base, id: base.id.slice(0, -4) + "0009" }), ilustracion: { descripcion: "Otra", usar: false, ruta: null, hashDescripcion: null, proveedor: null, modelo: null, generada: null, error: null } };
  const raiz = dirCon([conIlus, apagada]);
  const llamadas = [];
  const ilustrador = { async generar(d) { llamadas.push(d); return Buffer.from("00", "hex"); } };
  const guardadas = [];
  const guardar = async (buf, ruta) => { guardadas.push(ruta); };
  const r = await ejecutarRegenerar({ config: cfg, raiz, ahora, render: async (x) => imagenDe(x), log, version: 1, ilustrador, guardar });
  assert.deepEqual(llamadas, ["Nueva escena"]);
  assert.ok(guardadas[0].endsWith(path.join("public", "ilus", `${conIlus.id}.jpg`)));
  assert.deepEqual(r.renderizados, [conIlus.id]);
  const posts = Object.fromEntries(leerPosts(path.join(raiz, "posts")).map((p) => [p.id, p]));
  assert.equal(posts[conIlus.id].ilustracion.hashDescripcion, hashTexto("Nueva escena"));
});
```

  Importar `hashTexto` de `../src/lib/estados.mjs` en el test.

- [ ] **Step 4: regenerar.mjs** — importar `necesitaIlustracion, hashTexto`, `rutaIlustracion`, `crearIlustrador, guardarIlustracion`. Firma `ejecutarRegenerar({ ..., ilustrador = null, guardar = guardarIlustracion })`. Antes de calcular `pendientes`, pasada de ilustraciones:

```js
  const activos = leerPosts(dir).filter((p) => ["borrador", "programado", "error"].includes(p.estado));
  if (ilustrador) {
    for (const p of activos) {
      if (!necesitaIlustracion(p, ahora)) continue;
      const ruta = rutaIlustracion(p.id);
      let nuevo;
      try {
        const buf = await ilustrador.generar(p.ilustracion.descripcion);
        await guardar(buf, path.join(raiz, ruta));
        nuevo = { ...p, ilustracion: { ...p.ilustracion, ruta, hashDescripcion: hashTexto(p.ilustracion.descripcion), proveedor: config.ilustraciones.proveedor, modelo: config.ilustraciones.modelo, generada: iso, error: null }, actualizado: iso };
        log.info(`Ilustración regenerada: ${p.id}`);
      } catch (err) {
        nuevo = { ...p, ilustracion: { ...p.ilustracion, error: { mensaje: err.message, fecha: iso } }, actualizado: iso };
        log.warn(`Ilustración falló para ${p.id}: ${err.message}`);
      }
      escribirPost(dir, nuevo);
    }
  }
  const vigentes = leerPosts(dir).filter((p) => ["borrador", "programado", "error"].includes(p.estado));
  const pendientes = vigentes.filter(...)  // la lógica actual, sobre `vigentes`
```

  `main()`: crear `ilustrador` como en generar.

- [ ] **Step 5: Workflows** — en `generar.yml` y `regenerar.yml`, añadir `GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}` al bloque `env` del paso que ejecuta el script (en regenerar, crear el bloque `env`), y cambiar `git add posts public/img data` / `git add posts public/img` por `git add posts public/img public/ilus data` / `git add posts public/img public/ilus`. Test en `tests/workflows.test.mjs`:

```js
test("generar y regenerar reciben GEMINI_API_KEY y guardan public/ilus", () => {
  for (const n of ["generar", "regenerar"]) {
    assert.match(leer(n), /secrets\.GEMINI_API_KEY/, n);
    assert.match(leer(n), /git add posts public\/img public\/ilus/, n);
  }
});
```

  Crear `public/ilus/.gitkeep`.

- [ ] **Step 6: Correr y commitear**

Run: `npm test` → verde.

```bash
git add src/generar.mjs src/regenerar.mjs tests/generar.test.mjs tests/regenerar.test.mjs .github/workflows/generar.yml .github/workflows/regenerar.yml tests/workflows.test.mjs public/ilus/.gitkeep
git commit -m "feat: GENERAR y REGENERAR piden la ilustración a Gemini; workflows con GEMINI_API_KEY [skip ci]"
```

---

### Task 5: Panel: escena, casilla "Usar ilustración" y regenerar; documentación

**Files:**
- Modify: `panel/app.js`, `panel/styles.css`, `tests/panel.e2e.mjs`, `GUIA.md`, `docs/CONFIGURACION.md`, `README.md`

**Interfaces:**
- Tarjeta: `textarea` "Escena de la ilustración" (`campos.escena`), `checkbox` "Usar ilustración" (`campos.usar`), botón **Regenerar ilustración**. `cambios()` incluye `ilustracion` cuando hay escena o ya existía; `hayCambios()` compara `descripcion` y `usar`. El botón Regenerar guarda `{ ...ilustracion, descripcion, usar: true, hashDescripcion: null, error: null }`.

- [ ] **Step 1: app.js** — en `tarjeta()`, tras el campo de hashtags y antes del contador, añadir:

```js
  const ilus = post.ilustracion || null;
  const campoEscena = el("textarea", { disabled: bloqueado ? "" : null });
  campoEscena.value = ilus ? ilus.descripcion : "";
  campos.escena = campoEscena;
  const casillaUsar = el("input", { type: "checkbox", disabled: bloqueado ? "" : null });
  casillaUsar.checked = Boolean(ilus && ilus.usar);
  campos.usar = casillaUsar;
  cuerpo.append(
    el("label", { text: "Escena de la ilustración (sin personas reales)" }, [campoEscena]),
    el("label", { class: "casilla" }, [casillaUsar, el("span", { text: " Usar ilustración generada con IA" })]),
    ilus && ilus.error ? el("p", { class: "error-texto", text: `La ilustración falló: ${ilus.error.mensaje}` }) : "",
  );
```

  (`casillaUsar` debe entrar en `recordarBorrador` con `change`; `el()` ya soporta `type` como atributo.)

  `cambios()` añade:

```js
    ilustracion: (campos.escena.value.trim() || post.ilustracion)
      ? { ...(post.ilustracion || { ruta: null, hashDescripcion: null, proveedor: null, modelo: null, generada: null, error: null }), descripcion: campos.escena.value.trim(), usar: campos.usar.checked }
      : null,
```

  `hayCambios()` añade la comparación: `|| (c.ilustracion?.descripcion ?? "") !== (post.ilustracion?.descripcion ?? "") || Boolean(c.ilustracion?.usar) !== Boolean(post.ilustracion?.usar)`.

  Botón (en los tres estados editables, junto a "Guardar cambios"):

```js
      const regenerarIlustracion = (p) => {
        const descripcion = campos.escena.value.trim();
        if (!descripcion) { avisar("Escribe una escena antes de regenerar."); return null; }
        const base = p.ilustracion || { ruta: null, proveedor: null, modelo: null, generada: null };
        return editarTexto(conCambios(p), { ilustracion: { ...base, descripcion, usar: true, hashDescripcion: null, error: null } }, ahoraIso());
      };
      acciones.append(boton("Regenerar ilustración", "", regenerarIlustracion));
```

  El indicador "Regenerando imagen…" ya cubre el caso (el hash cambia cuando `usar` o la ilustración cambian). Cuando `usar` es `true` pero `ruta` es `null` y no hay error, mostrar además `el("span", { class: "regenerando", text: "Generando ilustración…" })` en `meta`.

  Al guardar un draft: `recordarBorrador` guarda también `escena` y `usar` (string y boolean) y los restaura.

- [ ] **Step 2: styles.css** — añadir `.casilla { display: flex; align-items: center; gap: 8px; font-size: 14px; } .casilla input { width: 20px; height: 20px; margin: 0; }`.

- [ ] **Step 3: e2e** — en `tests/panel.e2e.mjs`, test nuevo (después de los existentes):

```js
test("la escena y la casilla de ilustración se guardan en el post", async () => {
  const page = await navegador.newPage({ viewport: { width: 400, height: 800 } });
  await page.goto(`${base}/panel/`);
  await page.waitForSelector(".tarjeta");
  await page.fill(".tarjeta textarea >> nth=3", "Edificio de la Asamblea Nacional al atardecer");
  await page.check(".tarjeta input[type=checkbox]");
  await page.click("text=Guardar cambios");
  await page.waitForSelector("text=Generando ilustración…");
  const guardado = JSON.parse(fs.readFileSync(path.join(raiz, "posts/2026-09-07-1420-la-prensa-a1b2.json"), "utf8"));
  assert.equal(guardado.ilustracion.descripcion, "Edificio de la Asamblea Nacional al atardecer");
  assert.equal(guardado.ilustracion.usar, true);
  await page.close();
});
```

  (El orden de los `textarea` en la tarjeta es: titular, bajada, caption, escena → `nth=3`.)

- [ ] **Step 4: Docs**
  - `GUIA.md`: sección "Ilustraciones": qué son, el rótulo, cómo editar la escena, la casilla, el botón Regenerar, qué pasa si Gemini falla (el post sale sin ilustración), y que el nivel gratuito de Gemini puede agotarse.
  - `docs/CONFIGURACION.md`: sección nueva "10. Ilustraciones con Gemini": crear la clave en https://aistudio.google.com/apikey, guardarla como secreto `GEMINI_API_KEY`, ejecutar el workflow **Probar Gemini** desde Actions y descargar el artefacto `prueba-gemini` para ver la imagen.
  - `README.md`: añadir `src/lib/ilustrador.mjs`, `public/ilus/` y el workflow `probar-gemini` a la estructura.

- [ ] **Step 5: Correr todo y commitear (este commit SÍ dispara GENERAR para desplegar el panel)**

Run: `npm test`, `npm run test:render`, `npm run test:e2e` → verde.

```bash
git add panel/app.js panel/styles.css tests/panel.e2e.mjs GUIA.md docs/CONFIGURACION.md README.md
git commit -m "feat: escena, uso y regeneración de la ilustración desde el panel; documentación"
```

---

## Verificación final

1. `npm test`, `npm run test:render`, `npm run test:e2e` en verde.
2. Ver `temp/test-render/ilustracion.jpg`.
3. Con el secreto `GEMINI_API_KEY` creado por la persona usuaria: ejecutar **Probar Gemini** en Actions y revisar el artefacto; después una corrida manual de **Generar borradores** y comprobar en el panel un borrador con ilustración y rótulo.
