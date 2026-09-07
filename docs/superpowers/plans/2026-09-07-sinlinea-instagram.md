# Sin Línea · Publicación automática en Instagram — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el repositorio `sinlinea`: un pipeline en GitHub Actions que convierte noticias de Panamá en posts de Instagram con la marca Sin Línea, un panel estático en GitHub Pages para aprobarlos desde el celular, y un publicador que los sube a Instagram a la hora programada.

**Architecture:** Cuatro workflows de GitHub Actions (generar, regenerar, publicar, renovar-token) ejecutan scripts Node ESM sobre archivos JSON versionados en el repo (un archivo por post). Las imágenes se renderizan desde una plantilla HTML con Playwright y se sirven desde GitHub Pages, que también aloja el panel. El panel escribe en el repo con la API REST de GitHub; los módulos de estado, caption, franjas y fechas son isomorfos (mismo código en Node y en el navegador).

**Tech Stack:** Node 20+ (ESM, `node:test`), `@anthropic-ai/sdk` ^0.124.0 + `zod` ^4.5.4 (salida estructurada), `playwright` ^1.63.0 (Chromium) + `sharp` ^0.35.4 (JPEG), GitHub Actions + Pages, Instagram API with Instagram Login (`graph.instagram.com`), `yaml` ^2.9.0 (solo dev, para validar workflows).

**Spec:** `docs/superpowers/specs/2026-09-07-sinlinea-instagram-design.md` — el plan argumenta desde la especificación; quien ejecute una tarea debe leer ambos.

## Global Constraints

- Node `>=20`, módulos ESM (`"type": "module"`, archivos `.mjs`). Sin frameworks ni bundlers; el panel es HTML + CSS + JS plano.
- Todo texto visible (panel, logs, docs, mensajes de error) en español. Nombres de funciones y variables en español, salvo APIs externas.
- Zona horaria `America/Panama` (UTC−5 fijo, sin horario de verano). Los cron de Actions están en UTC.
- Imagen: JPEG, 1080×1350 px, calidad 88, progresivo, < 1 MB. Solo JPEG (Instagram no acepta PNG).
- Caption compuesto: máximo 2 200 caracteres, máximo 30 hashtags, máximo 20 menciones.
- Estados de post: `borrador | programado | publicado | descartado | error`. Nunca se borra un archivo de `posts/`; solo cambia el estado o se mueve a `posts/archivo/AAAA-MM/`.
- Variantes: `negro | amarillo | rojo`. Categorías: `POLÍTICA, ECONOMÍA, SOCIEDAD, SEGURIDAD, SALUD, EDUCACIÓN, DEPORTES, CULTURA, INTERNACIONAL, ÚLTIMA HORA`.
- Modelo por defecto `claude-opus-5`, pensamiento adaptativo, `output_config.effort` desde config, salida estructurada con `client.messages.parse` + `zodOutputFormat`. Nunca `budget_tokens`, nunca prefill.
- Secretos solo en GitHub Secrets (`ANTHROPIC_API_KEY`, `IG_ACCESS_TOKEN`, `IG_USER_ID`, `GH_PAT`). Ningún secreto en `config.json`, en el código ni en los logs.
- Los scripts de orquestación exportan una función `ejecutarX(deps)` con dependencias inyectables (fetch, cliente de Claude, render, reloj, log) y un `main()` que las conecta; los tests usan dobles, nunca la red.
- `--dry-run` en generar y publicar: no escribe en `posts/`, `public/`, `data/` ni llama a Instagram; escribe en `temp/`.
- Commits pequeños y frecuentes, mensajes en español con prefijo `feat:`, `fix:`, `test:`, `docs:`, `chore:`.

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `package.json`, `.gitignore`, `config.json`, `prompts/editorial.md`, `data/seen.json`, `data/token-info.json` | Andamiaje y configuración editable |
| `src/lib/util.mjs` | Limpieza de texto, entidades HTML, escape, slug, sha1 |
| `src/lib/fechas.mjs` (isomorfo) | Partes de fecha en zona horaria, claves de día/minuto, fecha corta, ISO con offset |
| `src/lib/config.mjs` | Carga y validación de `config.json` |
| `src/lib/rss.mjs` | `fetchText` con timeout/reintentos y parser RSS/Atom |
| `src/lib/portada.mjs` | Extrae enlaces de artículos de una portada HTML |
| `src/lib/articulo.mjs` | Extrae título, descripción, fecha y párrafos de un artículo; texto para Claude |
| `src/lib/fuentes.mjs` | Convierte fuentes `rss` y `portada` en candidatos uniformes |
| `src/lib/seen.mjs` | Registro de URLs vistas con purga |
| `src/lib/caption.mjs` (isomorfo) | Composición y límites del caption |
| `src/lib/estados.mjs` (isomorfo) | Constantes, transiciones de estado inmutables, `hashImagen` |
| `src/lib/posts.mjs` | Lectura/escritura/validación de `posts/*.json`, creación, variante, cupo, archivo |
| `src/lib/franjas.mjs` (isomorfo) | Siguiente franja libre |
| `src/lib/redactor.mjs` | Prompt + llamada a Claude con esquema Zod + validación de la selección |
| `templates/post.html`, `src/lib/render.mjs`, `assets/fonts/` | Plantilla 1080×1350 y render a JPEG |
| `src/lib/instagram.mjs` | Cliente de la API de Instagram con `fetch` inyectable |
| `src/generar.mjs`, `src/regenerar.mjs`, `src/publicar.mjs`, `src/renovar-token.mjs` | Orquestadores |
| `src/build.mjs`, `src/serve.mjs` | Construcción de `dist/` y previsualización local |
| `panel/index.html`, `panel/styles.css`, `panel/app.js`, `panel/almacen.mjs` | Panel de aprobación |
| `.github/workflows/*.yml` | Automatización |
| `README.md`, `GUIA.md`, `docs/CONFIGURACION.md` | Documentación y guía paso a paso |
| `tests/*.test.mjs`, `tests/fixtures/*` | Pruebas unitarias; `tests/render.integration.mjs` y `tests/panel.e2e.mjs` se ejecutan aparte |

Todas las rutas son relativas a la raíz del repositorio `C:\Users\esqui\Downloads\sinlinea`. Los comandos se ejecutan desde esa raíz.

---

### Task 1: Andamiaje del proyecto

**Files:**
- Create: `package.json`, `.gitignore`, `config.json`, `prompts/editorial.md`, `data/seen.json`, `data/token-info.json`, `posts/.gitkeep`, `posts/archivo/.gitkeep`, `public/img/.gitkeep`, `assets/fonts/.gitkeep`, `temp/.gitkeep`
- Test: `tests/andamiaje.test.mjs`

**Interfaces:**
- Produces: `config.json` con la forma exacta de la especificación §5.4 (la usan `config.mjs` y todos los orquestadores). `prompts/editorial.md` (lo lee `redactor.mjs`). `data/seen.json` `{ "urls": {} }`. `data/token-info.json` `{ "vence": null }`.

- [ ] **Step 1: Crear `package.json`**

```json
{
  "name": "sinlinea",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "Sistema de publicación automática en Instagram para Sin Línea (noticias de Panamá).",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "node --test",
    "test:render": "node --test tests/render.integration.mjs",
    "test:e2e": "node --test tests/panel.e2e.mjs",
    "generar": "node src/generar.mjs",
    "regenerar": "node src/regenerar.mjs",
    "publicar": "node src/publicar.mjs",
    "renovar-token": "node src/renovar-token.mjs",
    "build": "node src/build.mjs",
    "preview": "node src/serve.mjs"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.124.0",
    "playwright": "^1.63.0",
    "sharp": "^0.35.4",
    "zod": "^4.5.4"
  },
  "devDependencies": {
    "yaml": "^2.9.0"
  }
}
```

- [ ] **Step 2: Crear `.gitignore`**

```
node_modules/
dist/
temp/*
!temp/.gitkeep
.env
*.log
.DS_Store
Thumbs.db
```

- [ ] **Step 3: Crear `config.json`**

```json
{
  "marca": {
    "nombre": "Sin Línea",
    "usuario": "@sinlinea",
    "lema": "Nuestra línea es el Pueblo"
  },
  "zonaHoraria": "America/Panama",
  "pages": { "baseUrl": "https://CAMBIAR.github.io/sinlinea" },
  "fuentes": [
    {
      "nombre": "La Prensa",
      "tipo": "rss",
      "url": "https://www.prensa.com/arc/outboundfeeds/rss/?outputType=xml",
      "excluirSecciones": ["opinion", "status-k"]
    },
    {
      "nombre": "La Estrella de Panamá",
      "tipo": "portada",
      "url": "https://www.laestrella.com.pa/",
      "patronArticulo": "^/[a-z-]+(?:/[a-z-]+)*/[a-z0-9-]+-[A-Z]{2}\\d{6,}$",
      "excluirSecciones": ["opinion", "tag", "autor"]
    }
  ],
  "generar": {
    "maxPorCorrida": 2,
    "maxBorradoresPorDia": 12,
    "candidatosMax": 40,
    "diasSinRepetir": 3,
    "maxHorasAntiguedad": 48
  },
  "claude": { "modelo": "claude-opus-5", "esfuerzo": "medium" },
  "franjas": ["07:00", "09:30", "12:00", "14:30", "17:00", "19:30"],
  "instagram": { "apiVersion": "v23.0" },
  "archivarDespuesDeDias": 7
}
```

- [ ] **Step 4: Crear `prompts/editorial.md`**

```markdown
# Línea editorial de Sin Línea

Sin Línea es un medio digital panameño. Nuestro lema: **Nuestra línea es el Pueblo**.

## Tono
- Directo, claro y cercano a la gente. Español de Panamá, sin regionalismos de otros países.
- Sin sensacionalismo. Sin opinión que no esté respaldada por hechos del artículo.
- Hablamos de lo que le afecta a la ciudadanía: costo de vida, servicios públicos,
  seguridad, salud, educación, empleo, decisiones del Gobierno y la Asamblea.

## Qué elegir
- Prioriza noticias de impacto general sobre notas de nicho o farándula.
- Prefiere hechos concretos (una decisión, una cifra, un anuncio) sobre análisis largos.
- No repitas un tema que ya se cubrió en los últimos días, salvo que haya un hecho nuevo.

## Cómo escribir
- **Titular**: máximo 12 palabras, con sujeto y verbo concretos. Sin signos de exclamación.
  Sin mayúsculas sostenidas (la plantilla ya lo pone en mayúsculas).
- **Bajada**: una o dos frases (máximo 30 palabras) que respondan qué, quién y dónde.
- **Caption**: 3 a 5 líneas. Explica por qué importa para la gente. Termina con una
  pregunta o frase corta que invite a comentar. No incluyas la fuente ni hashtags:
  el sistema los agrega.
- **Hashtags**: entre 4 y 8, siempre #Panamá y #SinLínea, más 2 a 6 del tema.
- Nunca inventes datos, nombres, cifras o declaraciones que no estén en el texto.
```

- [ ] **Step 5: Crear archivos de datos y marcadores de carpeta**

`data/seen.json`:
```json
{ "urls": {} }
```

`data/token-info.json`:
```json
{ "vence": null }
```

Crear archivos vacíos `posts/.gitkeep`, `posts/archivo/.gitkeep`, `public/img/.gitkeep`, `assets/fonts/.gitkeep`, `temp/.gitkeep`.

- [ ] **Step 6: Escribir el test de andamiaje**

`tests/andamiaje.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("package.json es ESM y define los scripts principales", () => {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.equal(pkg.type, "module");
  for (const s of ["test", "generar", "regenerar", "publicar", "build", "preview"]) {
    assert.ok(pkg.scripts[s], `falta el script ${s}`);
  }
});

test("config.json y los archivos de datos son JSON válido", () => {
  for (const f of ["config.json", "data/seen.json", "data/token-info.json"]) {
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(f, "utf8")), f);
  }
});
```

- [ ] **Step 7: Instalar dependencias y correr los tests**

Run: `npm install` y luego `npm test`
Expected: instalación sin errores; `npm test` muestra `# pass 2`.

Si `sharp` falla al instalar en Windows, ejecutar `npm install --include=optional sharp` y reintentar.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: andamiaje del proyecto (package.json, config, línea editorial, datos)"
```

---

### Task 2: Utilidades de texto (`src/lib/util.mjs`)

**Files:**
- Create: `src/lib/util.mjs`
- Test: `tests/util.test.mjs`

**Interfaces:**
- Produces: `decodeEntities(str)`, `stripCdata(str)`, `stripTags(str)`, `cleanText(str)`, `escapeHtml(str)`, `sha1short(str, len = 12)`, `slugify(str, max = 40)`. Todas reciben y devuelven `string`.

- [ ] **Step 1: Escribir los tests**

`tests/util.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeEntities, stripCdata, cleanText, escapeHtml, sha1short, slugify } from "../src/lib/util.mjs";

test("decodeEntities convierte entidades con nombre, decimales y hex", () => {
  assert.equal(decodeEntities("Panam&aacute; &amp; &#241; &#x00BF;"), "Panamá & ñ ¿");
});

test("stripCdata y cleanText dejan texto plano sin HTML ni espacios dobles", () => {
  assert.equal(stripCdata("<![CDATA[hola]]>"), "hola");
  assert.equal(cleanText("<![CDATA[<p>Hola   <b>mundo</b>&nbsp;</p>]]>"), "Hola mundo");
  assert.equal(cleanText("&lt;p&gt;doble escape&lt;/p&gt;"), "doble escape");
});

test("escapeHtml escapa los cinco caracteres peligrosos", () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
});

test("sha1short es estable y respeta la longitud", () => {
  assert.equal(sha1short("hola"), sha1short("hola"));
  assert.equal(sha1short("hola", 6).length, 6);
});

test("slugify quita tildes, símbolos y limita el largo", () => {
  assert.equal(slugify("La Estrella de Panamá"), "la-estrella-de-panama");
  assert.equal(slugify("¡Hola!  Mundo -- 2026"), "hola-mundo-2026");
  assert.equal(slugify("a".repeat(100), 10), "aaaaaaaaaa");
  assert.equal(slugify("   "), "x");
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --test tests/util.test.mjs`
Expected: FAIL — `Cannot find module '.../src/lib/util.mjs'`.

- [ ] **Step 3: Implementar `src/lib/util.mjs`**

```js
// Utilidades de texto: entidades HTML, limpieza, escape, slug, hash corto.
import { createHash } from "node:crypto";

const ENTIDADES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  ntilde: "ñ", Ntilde: "Ñ", uuml: "ü", Uuml: "Ü",
  iquest: "¿", iexcl: "¡", ordf: "ª", ordm: "º", deg: "°",
  laquo: "«", raquo: "»", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’",
  ndash: "–", mdash: "—", hellip: "…", middot: "·", bull: "•",
  euro: "€", copy: "©", reg: "®", trade: "™",
};

function puntoDeCodigo(cp) {
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return "";
  try { return String.fromCodePoint(cp); } catch { return ""; }
}

export function decodeEntities(str = "") {
  return String(str)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => puntoDeCodigo(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => puntoDeCodigo(parseInt(d, 10)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (m, n) =>
      Object.prototype.hasOwnProperty.call(ENTIDADES, n) ? ENTIDADES[n] : m);
}

export function stripCdata(str = "") {
  return String(str).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

export function stripTags(str = "") {
  return String(str).replace(/<[^>]*>/g, " ");
}

// De un fragmento con CDATA, HTML y entidades (posiblemente doblemente
// escapadas) a texto plano de una sola línea.
export function cleanText(str = "") {
  let s = stripCdata(String(str));
  s = decodeEntities(s);
  s = stripTags(s);
  s = decodeEntities(s);
  return s.replace(/\s+/g, " ").trim();
}

export function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function sha1short(str, len = 12) {
  return createHash("sha1").update(String(str)).digest("hex").slice(0, len);
}

export function slugify(str, max = 40) {
  const s = String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
  return s || "x";
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --test tests/util.test.mjs`
Expected: `# pass 5`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/util.mjs tests/util.test.mjs
git commit -m "feat: utilidades de texto (entidades, limpieza, escape, slug)"
```

---

### Task 3: Fechas en zona horaria (`src/lib/fechas.mjs`, isomorfo)

**Files:**
- Create: `src/lib/fechas.mjs`
- Test: `tests/fechas.test.mjs`

**Interfaces:**
- Produces (todas puras, solo `Intl`, sin imports de Node, para poder usarlas en el panel):
  - `ZONA_PANAMA = "America/Panama"`, `OFFSET_PANAMA = "-05:00"`
  - `partesZona(date, zona) → { year, month, day, hour, minute }` (números)
  - `claveDia(date, zona) → "AAAA-MM-DD"`
  - `claveMinuto(date, zona) → "AAAA-MM-DD-HHMM"`
  - `fechaCorta(date, zona) → "7 sep 2026"`
  - `isoDesdeClave(claveDia, "HH:MM", offset = OFFSET_PANAMA) → "AAAA-MM-DDTHH:MM:00-05:00"`
  - `sumarDias(claveDia, n) → claveDia`
  - `horaMinutoDeIso(iso, zona) → "HH:MM"` (hora local de un ISO cualquiera)

- [ ] **Step 1: Escribir los tests**

`tests/fechas.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  partesZona, claveDia, claveMinuto, fechaCorta, isoDesdeClave, sumarDias, horaMinutoDeIso,
} from "../src/lib/fechas.mjs";

const instante = new Date("2026-09-07T19:20:31Z"); // 14:20 en Panamá

test("partesZona devuelve la hora de Panamá", () => {
  assert.deepEqual(partesZona(instante), { year: 2026, month: 9, day: 7, hour: 14, minute: 20 });
});

test("claveDia y claveMinuto cruzan la medianoche correctamente", () => {
  assert.equal(claveDia(instante), "2026-09-07");
  assert.equal(claveMinuto(instante), "2026-09-07-1420");
  assert.equal(claveDia(new Date("2026-09-08T03:30:00Z")), "2026-09-07"); // 22:30 del 7
  assert.equal(claveMinuto(new Date("2026-09-08T05:00:00Z")), "2026-09-08-0000");
});

test("fechaCorta usa abreviaturas en español sin punto", () => {
  assert.equal(fechaCorta(instante), "7 sep 2026");
  assert.equal(fechaCorta(new Date("2026-01-15T12:00:00Z")), "15 ene 2026");
});

test("isoDesdeClave produce un ISO con offset de Panamá", () => {
  const iso = isoDesdeClave("2026-09-07", "17:00");
  assert.equal(iso, "2026-09-07T17:00:00-05:00");
  assert.equal(new Date(iso).toISOString(), "2026-09-07T22:00:00.000Z");
});

test("sumarDias cruza meses y años", () => {
  assert.equal(sumarDias("2026-12-31", 1), "2027-01-01");
  assert.equal(sumarDias("2026-03-01", -1), "2026-02-28");
});

test("horaMinutoDeIso convierte a hora local", () => {
  assert.equal(horaMinutoDeIso("2026-09-07T22:00:00.000Z"), "17:00");
  assert.equal(horaMinutoDeIso("2026-09-07T07:00:00-05:00"), "07:00");
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --test tests/fechas.test.mjs`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar `src/lib/fechas.mjs`**

```js
// Fechas en zona horaria. Módulo isomorfo: solo usa Intl, sin imports de Node.
export const ZONA_PANAMA = "America/Panama";
export const OFFSET_PANAMA = "-05:00"; // Panamá no usa horario de verano.

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function aFecha(v) {
  if (v instanceof Date) return v;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new Error(`Fecha inválida: ${v}`);
  return d;
}

const pad2 = (n) => String(n).padStart(2, "0");

export function partesZona(date, zona = ZONA_PANAMA) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(aFecha(date)).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day),
    hour: Number(p.hour === "24" ? "0" : p.hour), minute: Number(p.minute),
  };
}

export function claveDia(date, zona = ZONA_PANAMA) {
  const p = partesZona(date, zona);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

export function claveMinuto(date, zona = ZONA_PANAMA) {
  const p = partesZona(date, zona);
  return `${claveDia(date, zona)}-${pad2(p.hour)}${pad2(p.minute)}`;
}

export function fechaCorta(date, zona = ZONA_PANAMA) {
  const p = partesZona(date, zona);
  return `${p.day} ${MESES_CORTOS[p.month - 1]} ${p.year}`;
}

export function isoDesdeClave(clave, hhmm, offset = OFFSET_PANAMA) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clave)) throw new Error(`Clave de día inválida: ${clave}`);
  if (!/^\d{2}:\d{2}$/.test(hhmm)) throw new Error(`Hora inválida: ${hhmm}`);
  return `${clave}T${hhmm}:00${offset}`;
}

export function sumarDias(clave, n) {
  const [y, m, d] = clave.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + n * 86400000;
  const r = new Date(t);
  return `${r.getUTCFullYear()}-${pad2(r.getUTCMonth() + 1)}-${pad2(r.getUTCDate())}`;
}

export function horaMinutoDeIso(iso, zona = ZONA_PANAMA) {
  const p = partesZona(iso, zona);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --test tests/fechas.test.mjs`
Expected: `# pass 6`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fechas.mjs tests/fechas.test.mjs
git commit -m "feat: utilidades de fecha en zona horaria de Panamá"
```

---

### Task 4: Carga y validación de configuración (`src/lib/config.mjs`)

**Files:**
- Create: `src/lib/config.mjs`
- Test: `tests/config.test.mjs`

**Interfaces:**
- Consumes: `config.json` (Task 1).
- Produces: `validarConfig(cfg) → cfg` (lanza `Error` con mensaje en español que nombra la clave), `cargarConfig(ruta = "config.json") → cfg`, `ESFUERZOS = ["low","medium","high","xhigh","max"]`.

- [ ] **Step 1: Escribir los tests**

`tests/config.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { cargarConfig, validarConfig } from "../src/lib/config.mjs";

test("config.json del repo es válido", () => {
  const cfg = cargarConfig("config.json");
  assert.equal(cfg.zonaHoraria, "America/Panama");
  assert.equal(cfg.fuentes.length, 2);
});

function base() {
  return structuredClone(cargarConfig("config.json"));
}

test("rechaza una franja mal formada", () => {
  const cfg = base();
  cfg.franjas.push("25:00");
  assert.throws(() => validarConfig(cfg), /franjas/);
});

test("rechaza un tipo de fuente desconocido y una portada sin patrón", () => {
  const cfg = base();
  cfg.fuentes[0].tipo = "twitter";
  assert.throws(() => validarConfig(cfg), /fuentes\[0\]\.tipo/);
  const cfg2 = base();
  delete cfg2.fuentes[1].patronArticulo;
  assert.throws(() => validarConfig(cfg2), /patronArticulo/);
});

test("rechaza un esfuerzo inválido y una apiVersion mal formada", () => {
  const cfg = base();
  cfg.claude.esfuerzo = "ultra";
  assert.throws(() => validarConfig(cfg), /esfuerzo/);
  const cfg2 = base();
  cfg2.instagram.apiVersion = "23";
  assert.throws(() => validarConfig(cfg2), /apiVersion/);
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --test tests/config.test.mjs`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar `src/lib/config.mjs`**

```js
// Carga y valida config.json. Falla temprano con un mensaje claro.
import fs from "node:fs";

export const ESFUERZOS = ["low", "medium", "high", "xhigh", "max"];
const TIPOS_FUENTE = ["rss", "portada"];

function exigir(cond, mensaje) {
  if (!cond) throw new Error(`config.json: ${mensaje}`);
}

export function validarConfig(cfg) {
  exigir(cfg && typeof cfg === "object", "debe ser un objeto");
  exigir(typeof cfg.marca?.nombre === "string" && cfg.marca.nombre, "marca.nombre es obligatorio");
  exigir(typeof cfg.marca?.usuario === "string" && cfg.marca.usuario.startsWith("@"), "marca.usuario debe empezar con @");
  exigir(typeof cfg.marca?.lema === "string", "marca.lema es obligatorio");
  exigir(typeof cfg.zonaHoraria === "string", "zonaHoraria es obligatoria");
  exigir(/^https:\/\/[^/]+/.test(cfg.pages?.baseUrl || ""), "pages.baseUrl debe ser una URL https");

  exigir(Array.isArray(cfg.fuentes) && cfg.fuentes.length > 0, "fuentes debe tener al menos una fuente");
  cfg.fuentes.forEach((f, i) => {
    exigir(typeof f.nombre === "string" && f.nombre, `fuentes[${i}].nombre es obligatorio`);
    exigir(TIPOS_FUENTE.includes(f.tipo), `fuentes[${i}].tipo debe ser rss o portada`);
    exigir(/^https?:\/\//.test(f.url || ""), `fuentes[${i}].url debe ser una URL`);
    if (f.tipo === "portada") {
      exigir(typeof f.patronArticulo === "string", `fuentes[${i}].patronArticulo es obligatorio para portada`);
      try { new RegExp(f.patronArticulo); } catch { exigir(false, `fuentes[${i}].patronArticulo no es una expresión regular válida`); }
    }
    if (f.excluirSecciones !== undefined) {
      exigir(Array.isArray(f.excluirSecciones), `fuentes[${i}].excluirSecciones debe ser una lista`);
    }
  });

  const g = cfg.generar || {};
  for (const k of ["maxPorCorrida", "maxBorradoresPorDia", "candidatosMax", "diasSinRepetir", "maxHorasAntiguedad"]) {
    exigir(Number.isInteger(g[k]) && g[k] > 0, `generar.${k} debe ser un entero positivo`);
  }
  exigir(typeof cfg.claude?.modelo === "string" && cfg.claude.modelo, "claude.modelo es obligatorio");
  exigir(ESFUERZOS.includes(cfg.claude?.esfuerzo), `claude.esfuerzo debe ser uno de ${ESFUERZOS.join(", ")}`);

  exigir(Array.isArray(cfg.franjas) && cfg.franjas.length > 0, "franjas debe tener al menos una hora");
  const vistas = new Set();
  for (const h of cfg.franjas) {
    exigir(/^([01]\d|2[0-3]):[0-5]\d$/.test(h), `franjas: "${h}" no tiene formato HH:MM`);
    exigir(!vistas.has(h), `franjas: "${h}" está repetida`);
    vistas.add(h);
  }
  exigir(/^v\d+\.\d+$/.test(cfg.instagram?.apiVersion || ""), "instagram.apiVersion debe tener la forma vNN.N");
  exigir(Number.isInteger(cfg.archivarDespuesDeDias) && cfg.archivarDespuesDeDias > 0, "archivarDespuesDeDias debe ser un entero positivo");
  return cfg;
}

export function cargarConfig(ruta = "config.json") {
  const cfg = JSON.parse(fs.readFileSync(ruta, "utf8"));
  return validarConfig(cfg);
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --test tests/config.test.mjs`
Expected: `# pass 4`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/config.mjs tests/config.test.mjs
git commit -m "feat: carga y validación de config.json"
```

---

### Task 5: Descarga y parser RSS (`src/lib/rss.mjs`)

**Files:**
- Create: `src/lib/rss.mjs`, `tests/fixtures/laprensa.xml`
- Test: `tests/rss.test.mjs`

**Interfaces:**
- Consumes: `cleanText`, `decodeEntities`, `stripCdata` de `util.mjs`.
- Produces:
  - `fetchText(url, { timeoutMs = 20000, retries = 1, accept, fetchImpl = fetch }) → Promise<string>`; lanza `Error("HTTP <código> en <url>")` tras agotar reintentos.
  - `parseFeed(xml) → Array<{ title, link, guid, pubDate, description, contenido, image }>` donde `contenido` es el HTML crudo de `content:encoded` (sin CDATA) o `""`.

- [ ] **Step 1: Crear la fixture `tests/fixtures/laprensa.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/" version="2.0">
<channel>
<title>La Prensa</title>
<item>
<title><![CDATA[Bomberos piden más fondos: $22.3 millones quedarían sin cubrir en 2027]]></title>
<link>https://www.prensa.com/sociedad/bomberos-piden-mas-fondos/</link>
<guid isPermaLink="true">https://www.prensa.com/sociedad/bomberos-piden-mas-fondos/</guid>
<pubDate>Mon, 07 Sep 2026 13:10:00 +0000</pubDate>
<description><![CDATA[El Cuerpo de Bomberos advirtió que su presupuesto no alcanza.]]></description>
<content:encoded><![CDATA[<p>El Cuerpo de Bomberos de Panamá advirtió este lunes que el presupuesto asignado para 2027 deja sin cubrir $22.3 millones en inversión.</p><p>La institución pidió a la Asamblea Nacional revisar la partida durante las vistas presupuestarias.</p><p>Foto: LP</p>]]></content:encoded>
<media:content url="https://www.prensa.com/resizer/foto.jpg" medium="image" width="1200"/>
</item>
<item>
<title><![CDATA[Juan Rulfo y el oficio de escribir]]></title>
<link>https://www.prensa.com/status-k/juan-rulfo-y-el-oficio-de-escribir/</link>
<pubDate>Sun, 06 Sep 2026 01:45:00 +0000</pubDate>
<description>Un ensayo sobre el autor mexicano.</description>
</item>
</channel>
</rss>
```

- [ ] **Step 2: Escribir los tests**

`tests/rss.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseFeed, fetchText } from "../src/lib/rss.mjs";

const xml = fs.readFileSync("tests/fixtures/laprensa.xml", "utf8");

test("parseFeed extrae título, enlace, fecha, descripción y content:encoded", () => {
  const items = parseFeed(xml);
  assert.equal(items.length, 2);
  const [a, b] = items;
  assert.equal(a.title, "Bomberos piden más fondos: $22.3 millones quedarían sin cubrir en 2027");
  assert.equal(a.link, "https://www.prensa.com/sociedad/bomberos-piden-mas-fondos/");
  assert.equal(a.pubDate, "Mon, 07 Sep 2026 13:10:00 +0000");
  assert.equal(a.description, "El Cuerpo de Bomberos advirtió que su presupuesto no alcanza.");
  assert.match(a.contenido, /^<p>El Cuerpo de Bomberos/);
  assert.equal(a.image, "https://www.prensa.com/resizer/foto.jpg");
  assert.equal(b.contenido, "");
  assert.equal(b.guid, b.link);
});

test("fetchText reintenta tras un 5xx y devuelve el texto", async () => {
  let llamadas = 0;
  const fetchImpl = async () => {
    llamadas += 1;
    if (llamadas === 1) return new Response("caído", { status: 503 });
    return new Response("<rss/>", { status: 200 });
  };
  const texto = await fetchText("https://ejemplo.test/feed", { fetchImpl, retries: 1 });
  assert.equal(texto, "<rss/>");
  assert.equal(llamadas, 2);
});

test("fetchText lanza un error con el código HTTP al agotar reintentos", async () => {
  const fetchImpl = async () => new Response("no", { status: 404 });
  await assert.rejects(
    () => fetchText("https://ejemplo.test/x", { fetchImpl, retries: 0 }),
    /HTTP 404 en https:\/\/ejemplo\.test\/x/
  );
});
```

- [ ] **Step 3: Correr el test para verificar que falla**

Run: `node --test tests/rss.test.mjs`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 4: Implementar `src/lib/rss.mjs`**

```js
// Descarga con timeout y reintentos, y parser RSS/Atom sin dependencias.
// Portado de Que Hay Panamá; añade `contenido` (content:encoded crudo).
import { cleanText, decodeEntities, stripCdata } from "./util.mjs";

const UA = "Mozilla/5.0 (compatible; SinLineaBot/1.0; +https://www.instagram.com/sinlinea)";

export async function fetchText(url, { timeoutMs = 20000, retries = 1, accept, fetchImpl = fetch } = {}) {
  let ultimo;
  for (let intento = 0; intento <= retries; intento++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        signal: ctrl.signal,
        redirect: "follow",
        headers: {
          "User-Agent": UA,
          Accept: accept || "application/rss+xml, application/xml, text/xml, text/html, */*",
          "Accept-Language": "es-PA,es;q=0.9",
        },
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
      return await res.text();
    } catch (err) {
      clearTimeout(timer);
      ultimo = err;
      if (intento < retries) await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw ultimo;
}

function primeraEtiqueta(bloque, nombre) {
  const re = new RegExp(`<(?:[\\w-]+:)?${nombre}(\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${nombre}>`, "i");
  const m = bloque.match(re);
  return m ? m[2] : "";
}

function etiquetasSimples(bloque, nombre) {
  return bloque.match(new RegExp(`<(?:[\\w-]+:)?${nombre}\\b[^>]*?>`, "gi")) || [];
}

function atributo(tag, attr) {
  const m = tag.match(new RegExp(`\\b${attr}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return m ? (m[2] ?? m[3] ?? "") : "";
}

function extraerImagen(bloque) {
  const medios = [...etiquetasSimples(bloque, "media:content"), ...etiquetasSimples(bloque, "media:thumbnail")];
  let mejor = "", mejorAncho = -1;
  for (const tag of medios) {
    const url = decodeEntities(atributo(tag, "url"));
    if (!url) continue;
    const tipo = atributo(tag, "medium") || atributo(tag, "type");
    if (tipo && !/image/i.test(tipo)) continue;
    const w = Number(atributo(tag, "width")) || 0;
    if (w > mejorAncho) { mejor = url; mejorAncho = w; }
  }
  if (mejor) return mejor;
  const enc = etiquetasSimples(bloque, "enclosure").find((t) => /image/i.test(atributo(t, "type")));
  return enc ? decodeEntities(atributo(enc, "url")) : "";
}

export function parseFeed(xml) {
  const texto = String(xml || "");
  const esAtom = /<feed[\s>]/i.test(texto) && !/<rss[\s>]/i.test(texto);
  const bloques = texto.match(esAtom ? /<entry\b[\s\S]*?<\/entry>/gi : /<item\b[\s\S]*?<\/item>/gi) || [];
  const items = [];
  for (const b of bloques) {
    const title = cleanText(primeraEtiqueta(b, "title"));
    if (!title) continue;
    let link = "";
    if (esAtom) {
      const links = etiquetasSimples(b, "link");
      const alt = links.find((t) => /rel\s*=\s*["']?alternate/i.test(t)) || links[0];
      link = alt ? decodeEntities(atributo(alt, "href")) : "";
    } else {
      link = cleanText(primeraEtiqueta(b, "link"));
    }
    const guid = cleanText(primeraEtiqueta(b, "guid") || primeraEtiqueta(b, "id"));
    if (!link && /^https?:\/\//i.test(guid)) link = guid;
    if (!link) continue;
    const pubDate = cleanText(
      primeraEtiqueta(b, "pubDate") || primeraEtiqueta(b, "published") || primeraEtiqueta(b, "updated") || ""
    );
    const description = cleanText(primeraEtiqueta(b, "description") || primeraEtiqueta(b, "summary"));
    const contenido = stripCdata(primeraEtiqueta(b, "encoded")).trim();
    items.push({ title, link, guid: guid || link, pubDate, description, contenido, image: extraerImagen(b) });
  }
  return items;
}
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `node --test tests/rss.test.mjs`
Expected: `# pass 3`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/rss.mjs tests/rss.test.mjs tests/fixtures/laprensa.xml
git commit -m "feat: descarga con reintentos y parser RSS con content:encoded"
```

---

### Task 6: Enlaces de artículos desde una portada (`src/lib/portada.mjs`)

**Files:**
- Create: `src/lib/portada.mjs`, `tests/fixtures/laestrella-portada.html`
- Test: `tests/portada.test.mjs`

**Interfaces:**
- Produces: `extraerEnlacesPortada(html, { baseUrl, patronArticulo, excluirSecciones = [] }) → string[]` (URLs absolutas, mismo host que `baseUrl`, sin query ni hash, únicas, en orden de aparición). `seccionDeUrl(url) → string` (primer segmento de ruta, `""` si no hay).

- [ ] **Step 1: Crear la fixture `tests/fixtures/laestrella-portada.html`**

```html
<!doctype html><html lang="es-PA"><body>
<a href="/economia/panama-toma-distancia-del-impuesto-minimo-global-PE25472058">Impuesto</a>
<a href="https://www.laestrella.com.pa/panama/nacional/piscina-de-albrook-AE25479955?utm=x#top">Albrook</a>
<a href="/panama/politica/salida-del-parlacen-LE25479615">Parlacen</a>
<a href="/economia/panama-toma-distancia-del-impuesto-minimo-global-PE25472058">Repetido</a>
<a href="/opinion/columna-de-hoy-OE25479000">Opinión</a>
<a href="/tag/economia">Tag</a>
<a href="/autor/-/meta/jose-arcia">Autor</a>
<a href="/base-portlet/webrsrc/ctxvar/foto.png">Imagen</a>
<a href="https://otro-sitio.com/panama/x-AA12345678">Externo</a>
<a href="/economia">Sección</a>
</body></html>
```

- [ ] **Step 2: Escribir los tests**

`tests/portada.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { extraerEnlacesPortada, seccionDeUrl } from "../src/lib/portada.mjs";

const html = fs.readFileSync("tests/fixtures/laestrella-portada.html", "utf8");
const opciones = {
  baseUrl: "https://www.laestrella.com.pa/",
  patronArticulo: "^/[a-z-]+(?:/[a-z-]+)*/[a-z0-9-]+-[A-Z]{2}\\d{6,}$",
  excluirSecciones: ["opinion", "tag", "autor"],
};

test("extrae solo artículos del mismo host, sin repetidos, query ni hash", () => {
  assert.deepEqual(extraerEnlacesPortada(html, opciones), [
    "https://www.laestrella.com.pa/economia/panama-toma-distancia-del-impuesto-minimo-global-PE25472058",
    "https://www.laestrella.com.pa/panama/nacional/piscina-de-albrook-AE25479955",
    "https://www.laestrella.com.pa/panama/politica/salida-del-parlacen-LE25479615",
  ]);
});

test("sin exclusiones incluye la columna de opinión", () => {
  const urls = extraerEnlacesPortada(html, { ...opciones, excluirSecciones: [] });
  assert.ok(urls.some((u) => u.includes("/opinion/")));
});

test("seccionDeUrl devuelve el primer segmento", () => {
  assert.equal(seccionDeUrl("https://www.prensa.com/sociedad/x/"), "sociedad");
  assert.equal(seccionDeUrl("https://www.prensa.com/"), "");
});
```

- [ ] **Step 3: Correr el test para verificar que falla**

Run: `node --test tests/portada.test.mjs`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 4: Implementar `src/lib/portada.mjs`**

```js
// Extrae los enlaces de artículos de la portada HTML de un medio.
import { decodeEntities } from "./util.mjs";

export function seccionDeUrl(url) {
  try {
    const seg = new URL(url).pathname.split("/").filter(Boolean);
    return seg[0] || "";
  } catch {
    return "";
  }
}

export function extraerEnlacesPortada(html, { baseUrl, patronArticulo, excluirSecciones = [] }) {
  const base = new URL(baseUrl);
  const patron = new RegExp(patronArticulo);
  const excluidas = new Set(excluirSecciones);
  const vistos = new Set();
  const salida = [];
  const re = /href\s*=\s*"([^"]+)"/gi;
  let m;
  while ((m = re.exec(String(html || "")))) {
    let u;
    try { u = new URL(decodeEntities(m[1]), base); } catch { continue; }
    if (u.host !== base.host) continue;
    if (!patron.test(u.pathname)) continue;
    const seccion = u.pathname.split("/").filter(Boolean)[0] || "";
    if (excluidas.has(seccion)) continue;
    const limpio = `${u.origin}${u.pathname}`;
    if (vistos.has(limpio)) continue;
    vistos.add(limpio);
    salida.push(limpio);
  }
  return salida;
}
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `node --test tests/portada.test.mjs`
Expected: `# pass 3`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/portada.mjs tests/portada.test.mjs tests/fixtures/laestrella-portada.html
git commit -m "feat: extracción de enlaces de artículos desde una portada"
```

---

### Task 7: Extracción de artículos (`src/lib/articulo.mjs`)

**Files:**
- Create: `src/lib/articulo.mjs`, `tests/fixtures/laestrella-articulo.html`
- Test: `tests/articulo.test.mjs`

**Interfaces:**
- Consumes: `cleanText`, `decodeEntities` de `util.mjs`; `fetchText` de `rss.mjs`.
- Produces:
  - `parrafosDesdeHtml(html, { minCaracteres = 40 }) → string[]` (texto limpio de cada `<p>`; si existen `<p class="p_N">` usa solo esos).
  - `extraerArticulo(html) → { titulo, descripcion, fecha, parrafos }` (`fecha` ISO o `""`).
  - `textoParaClaude(parrafos, max = 1500) → string` (párrafos completos unidos con `\n\n` hasta `max` caracteres; si el primero ya excede, se recorta).
  - `descargarArticulo(url, { fetchText, timeoutMs = 15000 }) → Promise<articulo>`.

- [ ] **Step 1: Crear la fixture `tests/fixtures/laestrella-articulo.html`**

```html
<!doctype html><html lang="es-PA"><head>
<title>Panamá toma distancia del impuesto mínimo global | La Estrella</title>
<meta content="Panamá toma distancia en la aplicación del impuesto mínimo global" property="og:title">
<meta property="og:description" content="El país, que hace seis años respaldó la iniciativa, ahora opta por esperar.">
<meta property="article:published_time" content="2026-09-07T00:00:00-05:00">
</head><body>
<nav><p>Menú principal de navegación del sitio con muchas palabras para que supere el mínimo</p></nav>
<article>
<p class="p_1">Panamá pasó de respaldar la adopción del impuesto mínimo global a frenar su implementación.</p>
<p class="p_2">Seis años después de sumarse a los más de 130 países que apoyaron la iniciativa, el Gobierno opta por esperar.</p>
<p class="p_3">Corto.</p>
</article>
</body></html>
```

- [ ] **Step 2: Escribir los tests**

`tests/articulo.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { extraerArticulo, parrafosDesdeHtml, textoParaClaude, descargarArticulo } from "../src/lib/articulo.mjs";

const html = fs.readFileSync("tests/fixtures/laestrella-articulo.html", "utf8");

test("extraerArticulo lee og:title (en cualquier orden de atributos), descripción, fecha y párrafos p_N", () => {
  const a = extraerArticulo(html);
  assert.equal(a.titulo, "Panamá toma distancia en la aplicación del impuesto mínimo global");
  assert.equal(a.descripcion, "El país, que hace seis años respaldó la iniciativa, ahora opta por esperar.");
  assert.equal(a.fecha, "2026-09-07T00:00:00-05:00");
  assert.equal(a.parrafos.length, 2); // p_3 es demasiado corto; el <p> del nav no es p_N
  assert.match(a.parrafos[0], /^Panamá pasó/);
});

test("parrafosDesdeHtml sin clases p_N usa todos los <p> largos", () => {
  const p = parrafosDesdeHtml("<p>Uno muy largo que supera los cuarenta caracteres sin problema.</p><p>Foto: LP</p>");
  assert.deepEqual(p, ["Uno muy largo que supera los cuarenta caracteres sin problema."]);
});

test("extraerArticulo sin metadatos devuelve cadenas vacías, no lanza", () => {
  assert.deepEqual(extraerArticulo("<html><body><p>Solo un párrafo que es suficientemente largo para contar.</p></body></html>"),
    { titulo: "", descripcion: "", fecha: "", parrafos: ["Solo un párrafo que es suficientemente largo para contar."] });
});

test("textoParaClaude une párrafos completos hasta el máximo", () => {
  const parrafos = ["a".repeat(600), "b".repeat(600), "c".repeat(600)];
  const t = textoParaClaude(parrafos, 1500);
  assert.equal(t, parrafos[0] + "\n\n" + parrafos[1]);
  assert.equal(textoParaClaude(["x".repeat(2000)], 100).length, 100);
});

test("descargarArticulo usa el fetchText inyectado", async () => {
  const a = await descargarArticulo("https://ejemplo.test/a", { fetchText: async () => html });
  assert.equal(a.parrafos.length, 2);
});
```

- [ ] **Step 3: Correr el test para verificar que falla**

Run: `node --test tests/articulo.test.mjs`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 4: Implementar `src/lib/articulo.mjs`**

```js
// Extrae título, descripción, fecha y párrafos de una página de artículo.
import { cleanText, decodeEntities } from "./util.mjs";

// <meta property="og:title" content="..."> con atributos en cualquier orden.
function meta(html, attr, valor) {
  const v = valor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const a = html.match(new RegExp(`<meta[^>]*\\b${attr}\\s*=\\s*["']${v}["'][^>]*\\bcontent\\s*=\\s*["']([^"']*)["']`, "i"));
  if (a) return decodeEntities(a[1]).trim();
  const b = html.match(new RegExp(`<meta[^>]*\\bcontent\\s*=\\s*["']([^"']*)["'][^>]*\\b${attr}\\s*=\\s*["']${v}["']`, "i"));
  return b ? decodeEntities(b[1]).trim() : "";
}

export function parrafosDesdeHtml(html, { minCaracteres = 40 } = {}) {
  const texto = String(html || "");
  const conClase = [...texto.matchAll(/<p\b[^>]*class\s*=\s*["']p_\d+["'][^>]*>([\s\S]*?)<\/p>/gi)];
  const todos = conClase.length ? conClase : [...texto.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)];
  return todos
    .map((m) => cleanText(m[1]))
    .filter((p) => p.length >= minCaracteres);
}

export function extraerArticulo(html) {
  const h = String(html || "");
  const tituloTag = h.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const titulo = meta(h, "property", "og:title") || (tituloTag ? cleanText(tituloTag[1]) : "");
  const descripcion = meta(h, "property", "og:description") || meta(h, "name", "description");
  let fecha = meta(h, "property", "article:published_time");
  if (!fecha) {
    const ld = h.match(/"datePublished"\s*:\s*"([^"]+)"/);
    fecha = ld ? ld[1] : "";
  }
  return { titulo, descripcion, fecha, parrafos: parrafosDesdeHtml(h) };
}

export function textoParaClaude(parrafos, max = 1500) {
  const salida = [];
  let largo = 0;
  for (const p of parrafos) {
    const extra = (salida.length ? 2 : 0) + p.length;
    if (largo + extra > max) break;
    salida.push(p);
    largo += extra;
  }
  if (!salida.length && parrafos.length) return parrafos[0].slice(0, max);
  return salida.join("\n\n");
}

export async function descargarArticulo(url, { fetchText, timeoutMs = 15000 }) {
  const html = await fetchText(url, { timeoutMs, retries: 0, accept: "text/html,application/xhtml+xml" });
  return extraerArticulo(html);
}
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `node --test tests/articulo.test.mjs`
Expected: `# pass 5`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/articulo.mjs tests/articulo.test.mjs tests/fixtures/laestrella-articulo.html
git commit -m "feat: extracción de título, descripción, fecha y párrafos de artículos"
```

---

### Task 8: Fuentes → candidatos uniformes (`src/lib/fuentes.mjs`)

**Files:**
- Create: `src/lib/fuentes.mjs`
- Test: `tests/fuentes.test.mjs`

**Interfaces:**
- Consumes: `parseFeed` (rss.mjs), `extraerEnlacesPortada`, `seccionDeUrl` (portada.mjs), `parrafosDesdeHtml`, `textoParaClaude`, `descargarArticulo` (articulo.mjs).
- Produces:
  - Tipo `Candidato = { url, medio, seccion, titulo, descripcion, fecha (ISO), texto, origen: "rss" | "portada" }`.
  - `candidatosDesdeRss(items, fuente, { ahora, maxHoras }) → Candidato[]` (descarta secciones excluidas, ítems más viejos que `maxHoras` y sin URL http).
  - `candidatosDesdePortada(urls, fuente) → Candidato[]` (con `titulo/descripcion/fecha/texto` vacíos y `origen: "portada"`).
  - `completarCandidato(cand, articulo, { ahora }) → Candidato` (rellena desde `extraerArticulo`; si no hay fecha usa `ahora`).
  - `recolectar(config, { fetchText, ahora, log, filtrar = () => true, concurrencia = 4 }) → Promise<Candidato[]>` — descarga cada fuente, aplica `filtrar(url)` ANTES de descargar artículos de portada, descarga artículos en paralelo limitado, descarta los que fallan o son viejos, ordena por fecha descendente y recorta a `config.generar.candidatosMax`.

- [ ] **Step 1: Escribir los tests**

`tests/fuentes.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseFeed } from "../src/lib/rss.mjs";
import { candidatosDesdeRss, candidatosDesdePortada, completarCandidato, recolectar } from "../src/lib/fuentes.mjs";
import { cargarConfig } from "../src/lib/config.mjs";

const ahora = new Date("2026-09-07T20:00:00Z");
const xml = fs.readFileSync("tests/fixtures/laprensa.xml", "utf8");
const portadaHtml = fs.readFileSync("tests/fixtures/laestrella-portada.html", "utf8");
const articuloHtml = fs.readFileSync("tests/fixtures/laestrella-articulo.html", "utf8");
const cfg = cargarConfig("config.json");

test("candidatosDesdeRss excluye secciones y convierte content:encoded en texto", () => {
  const c = candidatosDesdeRss(parseFeed(xml), cfg.fuentes[0], { ahora, maxHoras: 48 });
  assert.equal(c.length, 1); // status-k excluido
  assert.equal(c[0].medio, "La Prensa");
  assert.equal(c[0].seccion, "sociedad");
  assert.equal(c[0].fecha, "2026-09-07T13:10:00.000Z");
  assert.match(c[0].texto, /^El Cuerpo de Bomberos de Panamá/);
  assert.ok(!c[0].texto.includes("Foto: LP"));
  assert.equal(c[0].origen, "rss");
});

test("candidatosDesdeRss descarta ítems más viejos que maxHoras", () => {
  const c = candidatosDesdeRss(parseFeed(xml), cfg.fuentes[0], { ahora: new Date("2026-09-12T00:00:00Z"), maxHoras: 48 });
  assert.equal(c.length, 0);
});

test("completarCandidato rellena desde el artículo", () => {
  const [cand] = candidatosDesdePortada(["https://www.laestrella.com.pa/economia/x-PE25472058"], cfg.fuentes[1]);
  assert.equal(cand.origen, "portada");
  assert.equal(cand.titulo, "");
  const lleno = completarCandidato(cand, {
    titulo: "T", descripcion: "D", fecha: "2026-09-07T00:00:00-05:00", parrafos: ["p".repeat(50)],
  }, { ahora });
  assert.equal(lleno.titulo, "T");
  assert.equal(lleno.fecha, "2026-09-07T05:00:00.000Z");
  assert.equal(lleno.texto, "p".repeat(50));
});

test("recolectar sigue si una fuente falla, respeta filtrar y completa las portadas", async () => {
  const llamadas = [];
  const fetchText = async (url) => {
    llamadas.push(url);
    if (url.includes("prensa.com")) throw new Error("HTTP 503 en feed");
    if (url === "https://www.laestrella.com.pa/") return portadaHtml;
    return articuloHtml;
  };
  const avisos = [];
  const log = { warn: (m) => avisos.push(m), info: () => {} };
  const filtrar = (url) => !url.includes("parlacen");
  const c = await recolectar(cfg, { fetchText, ahora, log, filtrar });
  assert.equal(c.length, 2);
  assert.ok(c.every((x) => x.medio === "La Estrella de Panamá" && x.titulo && x.texto));
  assert.ok(!llamadas.some((u) => u.includes("parlacen")), "no debe descargar lo filtrado");
  assert.ok(avisos.some((m) => /La Prensa/.test(m)));
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --test tests/fuentes.test.mjs`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar `src/lib/fuentes.mjs`**

```js
// Convierte cada fuente configurada (rss | portada) en candidatos uniformes.
import { parseFeed } from "./rss.mjs";
import { extraerEnlacesPortada, seccionDeUrl } from "./portada.mjs";
import { parrafosDesdeHtml, textoParaClaude, descargarArticulo } from "./articulo.mjs";

function fechaIso(valor, ahora) {
  const d = new Date(valor || "");
  return Number.isNaN(d.getTime()) ? ahora.toISOString() : d.toISOString();
}

function esReciente(iso, ahora, maxHoras) {
  return ahora.getTime() - new Date(iso).getTime() <= maxHoras * 3600000;
}

export function candidatosDesdeRss(items, fuente, { ahora, maxHoras }) {
  const excluidas = new Set(fuente.excluirSecciones || []);
  const salida = [];
  for (const it of items) {
    if (!/^https?:\/\//i.test(it.link)) continue;
    const seccion = seccionDeUrl(it.link);
    if (excluidas.has(seccion)) continue;
    const fecha = fechaIso(it.pubDate, ahora);
    if (!esReciente(fecha, ahora, maxHoras)) continue;
    const parrafos = parrafosDesdeHtml(it.contenido || "");
    const texto = parrafos.length ? textoParaClaude(parrafos) : it.description;
    salida.push({
      url: it.link, medio: fuente.nombre, seccion, titulo: it.title,
      descripcion: it.description, fecha, texto, origen: "rss",
    });
  }
  return salida;
}

export function candidatosDesdePortada(urls, fuente) {
  return urls.map((url) => ({
    url, medio: fuente.nombre, seccion: seccionDeUrl(url),
    titulo: "", descripcion: "", fecha: "", texto: "", origen: "portada",
  }));
}

export function completarCandidato(cand, articulo, { ahora }) {
  return {
    ...cand,
    titulo: articulo.titulo || cand.titulo,
    descripcion: articulo.descripcion || cand.descripcion,
    fecha: fechaIso(articulo.fecha, ahora),
    texto: textoParaClaude(articulo.parrafos) || articulo.descripcion || "",
  };
}

async function enParalelo(items, n, fn) {
  const resultados = new Array(items.length);
  let i = 0;
  async function trabajador() {
    while (i < items.length) {
      const idx = i++;
      resultados[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, trabajador));
  return resultados;
}

export async function recolectar(config, { fetchText, ahora = new Date(), log = console, filtrar = () => true, concurrencia = 4 }) {
  const maxHoras = config.generar.maxHorasAntiguedad;
  let candidatos = [];
  for (const fuente of config.fuentes) {
    let cuerpo;
    try {
      cuerpo = await fetchText(fuente.url, { timeoutMs: 20000, retries: 1 });
    } catch (err) {
      log.warn(`Fuente "${fuente.nombre}" no disponible: ${err.message}`);
      continue;
    }
    if (fuente.tipo === "rss") {
      candidatos.push(...candidatosDesdeRss(parseFeed(cuerpo), fuente, { ahora, maxHoras }).filter((c) => filtrar(c.url)));
    } else {
      const urls = extraerEnlacesPortada(cuerpo, {
        baseUrl: fuente.url, patronArticulo: fuente.patronArticulo, excluirSecciones: fuente.excluirSecciones || [],
      }).filter(filtrar);
      const pendientes = candidatosDesdePortada(urls, fuente);
      const completos = await enParalelo(pendientes, concurrencia, async (cand) => {
        try {
          const art = await descargarArticulo(cand.url, { fetchText });
          if (!art.titulo && !art.parrafos.length) throw new Error("sin título ni párrafos");
          return completarCandidato(cand, art, { ahora });
        } catch (err) {
          log.warn(`Artículo omitido ${cand.url}: ${err.message}`);
          return null;
        }
      });
      candidatos.push(...completos.filter((c) => c && esReciente(c.fecha, ahora, maxHoras)));
    }
  }
  candidatos.sort((a, b) => b.fecha.localeCompare(a.fecha));
  return candidatos.slice(0, config.generar.candidatosMax);
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --test tests/fuentes.test.mjs`
Expected: `# pass 4`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fuentes.mjs tests/fuentes.test.mjs
git commit -m "feat: recolección de candidatos desde RSS y portadas"
```

---

### Task 9: Registro de URLs vistas (`src/lib/seen.mjs`)

**Files:**
- Create: `src/lib/seen.mjs`
- Test: `tests/seen.test.mjs`

**Interfaces:**
- Consumes: `sumarDias` (fechas.mjs).
- Produces: `cargarVistas(ruta) → { urls: {} }` (objeto vacío si el archivo no existe), `guardarVistas(ruta, vistas)` (JSON con sangría de 2 y salto final), `estaVista(vistas, url) → boolean`, `marcarVistas(vistas, urls, claveDiaHoy) → vistas` (nuevo objeto), `purgarVistas(vistas, claveDiaHoy, dias = 30) → vistas` (nuevo objeto).

- [ ] **Step 1: Escribir los tests**

`tests/seen.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cargarVistas, guardarVistas, estaVista, marcarVistas, purgarVistas } from "../src/lib/seen.mjs";

test("cargarVistas devuelve vacío si no existe y guarda/lee ida y vuelta", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seen-"));
  const ruta = path.join(dir, "seen.json");
  assert.deepEqual(cargarVistas(ruta), { urls: {} });
  const v = marcarVistas({ urls: {} }, ["https://a.test/1"], "2026-09-07");
  guardarVistas(ruta, v);
  assert.deepEqual(cargarVistas(ruta), { urls: { "https://a.test/1": "2026-09-07" } });
  assert.ok(fs.readFileSync(ruta, "utf8").endsWith("}\n"));
});

test("marcarVistas no muta y estaVista consulta", () => {
  const v0 = { urls: {} };
  const v1 = marcarVistas(v0, ["https://a.test/1", "https://a.test/2"], "2026-09-07");
  assert.deepEqual(v0, { urls: {} });
  assert.ok(estaVista(v1, "https://a.test/2"));
  assert.ok(!estaVista(v1, "https://a.test/3"));
});

test("purgarVistas elimina las de más de 30 días", () => {
  const v = { urls: { vieja: "2026-08-01", reciente: "2026-09-01" } };
  assert.deepEqual(purgarVistas(v, "2026-09-07"), { urls: { reciente: "2026-09-01" } });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --test tests/seen.test.mjs`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar `src/lib/seen.mjs`**

```js
// Registro de URLs ya evaluadas para no volver a procesarlas.
import fs from "node:fs";
import { sumarDias } from "./fechas.mjs";

export function cargarVistas(ruta) {
  if (!fs.existsSync(ruta)) return { urls: {} };
  const datos = JSON.parse(fs.readFileSync(ruta, "utf8"));
  return { urls: datos.urls || {} };
}

export function guardarVistas(ruta, vistas) {
  fs.writeFileSync(ruta, JSON.stringify(vistas, null, 2) + "\n");
}

export function estaVista(vistas, url) {
  return Object.prototype.hasOwnProperty.call(vistas.urls, url);
}

export function marcarVistas(vistas, urls, claveDiaHoy) {
  const nuevas = { ...vistas.urls };
  for (const u of urls) nuevas[u] = claveDiaHoy;
  return { urls: nuevas };
}

export function purgarVistas(vistas, claveDiaHoy, dias = 30) {
  const limite = sumarDias(claveDiaHoy, -dias);
  const urls = {};
  for (const [u, dia] of Object.entries(vistas.urls)) {
    if (dia >= limite) urls[u] = dia;
  }
  return { urls };
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --test tests/seen.test.mjs`
Expected: `# pass 3`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/seen.mjs tests/seen.test.mjs
git commit -m "feat: registro de URLs vistas con purga a 30 días"
```

---

### Task 10: Composición y límites del caption (`src/lib/caption.mjs`, isomorfo)

**Files:**
- Create: `src/lib/caption.mjs`
- Test: `tests/caption.test.mjs`

**Interfaces:**
- Produces (sin imports de Node):
  - `LIMITES = { caracteres: 2200, hashtags: 30, menciones: 20 }`
  - `normalizarHashtags(lista) → string[]` (con `#`, sin espacios, únicos, sin vacíos)
  - `componerCaption({ caption, medio, hashtags }) → string` con la forma exacta `<caption>\n\nFuente: <medio>\n\n<hashtags>`; si no hay hashtags se omite el último bloque.
  - `contarHashtags(texto)`, `contarMenciones(texto)`
  - `validarCaption(texto) → { ok: boolean, errores: string[] }`
  - `recortarCaption({ caption, medio, hashtags }) → { caption, hashtags, recortado: boolean }` que garantiza que `componerCaption` del resultado pasa `validarCaption`.

- [ ] **Step 1: Escribir los tests**

`tests/caption.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { componerCaption, validarCaption, recortarCaption, normalizarHashtags, contarHashtags, LIMITES } from "../src/lib/caption.mjs";

test("componerCaption sigue el formato caption / fuente / hashtags", () => {
  const t = componerCaption({ caption: "Hola.  ", medio: "La Prensa", hashtags: ["#Panamá", "#SinLínea"] });
  assert.equal(t, "Hola.\n\nFuente: La Prensa\n\n#Panamá #SinLínea");
  assert.equal(componerCaption({ caption: "Hola.", medio: "La Prensa", hashtags: [] }), "Hola.\n\nFuente: La Prensa");
});

test("normalizarHashtags agrega #, quita espacios y duplicados", () => {
  assert.deepEqual(normalizarHashtags(["Panamá", "#Panamá", " #Sin Línea ", "", "#x"]), ["#Panamá", "#SinLínea", "#x"]);
});

test("validarCaption detecta exceso de caracteres, hashtags, menciones y líneas vacías", () => {
  assert.deepEqual(validarCaption("Bien.\n\nFuente: X"), { ok: true, errores: [] });
  const largo = validarCaption("a".repeat(LIMITES.caracteres + 1));
  assert.equal(largo.ok, false);
  assert.match(largo.errores[0], /2200/);
  const muchos = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ");
  assert.match(validarCaption(muchos).errores[0], /hashtags/);
  const menciones = Array.from({ length: 21 }, (_, i) => `@u${i}`).join(" ");
  assert.match(validarCaption(menciones).errores[0], /menciones/);
  assert.match(validarCaption("a\n\n\nb").errores[0], /vac/);
});

test("recortarCaption elimina párrafos finales y limita hashtags", () => {
  const caption = ["p1 ".repeat(300).trim(), "p2 ".repeat(300).trim(), "p3 ".repeat(300).trim()].join("\n\n");
  const hashtags = Array.from({ length: 40 }, (_, i) => `#t${i}`);
  const r = recortarCaption({ caption, medio: "La Prensa", hashtags });
  assert.equal(r.recortado, true);
  assert.equal(r.hashtags.length, LIMITES.hashtags);
  assert.ok(r.caption.startsWith("p1 p1"));
  assert.ok(!r.caption.includes("p3"));
  assert.equal(validarCaption(componerCaption({ ...r, medio: "La Prensa" })).ok, true);
  const sin = recortarCaption({ caption: "corto", medio: "X", hashtags: ["#a"] });
  assert.equal(sin.recortado, false);
});

test("contarHashtags cuenta tildes y guiones bajos", () => {
  assert.equal(contarHashtags("#Panamá #Sin_Línea texto #x"), 3);
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --test tests/caption.test.mjs`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar `src/lib/caption.mjs`**

```js
// Composición y límites del caption de Instagram. Módulo isomorfo (Node y navegador).
export const LIMITES = { caracteres: 2200, hashtags: 30, menciones: 20 };

export function normalizarHashtags(lista) {
  const salida = [];
  const vistos = new Set();
  for (const h of lista || []) {
    const limpio = "#" + String(h || "").replace(/\s+/g, "").replace(/^#+/, "");
    if (limpio === "#" || vistos.has(limpio)) continue;
    vistos.add(limpio);
    salida.push(limpio);
  }
  return salida;
}

export function componerCaption({ caption, medio, hashtags }) {
  const partes = [String(caption || "").trim(), `Fuente: ${medio}`];
  const tags = normalizarHashtags(hashtags);
  if (tags.length) partes.push(tags.join(" "));
  return partes.join("\n\n");
}

export function contarHashtags(texto) {
  return (String(texto).match(/#[\p{L}\p{N}_]+/gu) || []).length;
}

export function contarMenciones(texto) {
  return (String(texto).match(/@[\p{L}\p{N}_.]+/gu) || []).length;
}

export function validarCaption(texto) {
  const t = String(texto);
  const errores = [];
  if (t.length > LIMITES.caracteres) errores.push(`El caption tiene ${t.length} caracteres; el máximo es ${LIMITES.caracteres}.`);
  const h = contarHashtags(t);
  if (h > LIMITES.hashtags) errores.push(`Hay ${h} hashtags; el máximo es ${LIMITES.hashtags}.`);
  const m = contarMenciones(t);
  if (m > LIMITES.menciones) errores.push(`Hay ${m} menciones; el máximo es ${LIMITES.menciones}.`);
  if (/\n{3,}/.test(t)) errores.push("Hay líneas vacías de más (tres saltos seguidos).");
  return { ok: errores.length === 0, errores };
}

export function recortarCaption({ caption, medio, hashtags }) {
  let tags = normalizarHashtags(hashtags);
  let recortado = false;
  if (tags.length > LIMITES.hashtags) { tags = tags.slice(0, LIMITES.hashtags); recortado = true; }
  let parrafos = String(caption || "").replace(/\n{3,}/g, "\n\n").trim().split(/\n\n/);
  let texto = parrafos.join("\n\n");
  while (componerCaption({ caption: texto, medio, hashtags: tags }).length > LIMITES.caracteres) {
    recortado = true;
    if (parrafos.length > 1) {
      parrafos = parrafos.slice(0, -1);
      texto = parrafos.join("\n\n");
    } else {
      const sobrante = componerCaption({ caption: texto, medio, hashtags: tags }).length - LIMITES.caracteres;
      texto = texto.slice(0, Math.max(0, texto.length - sobrante - 1)).trimEnd() + "…";
    }
  }
  return { caption: texto, hashtags: tags, recortado };
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --test tests/caption.test.mjs`
Expected: `# pass 5`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/caption.mjs tests/caption.test.mjs
git commit -m "feat: composición y límites del caption de Instagram"
```

---

### Task 11: Estados, transiciones y hash de imagen (`src/lib/estados.mjs`, isomorfo)

**Files:**
- Create: `src/lib/estados.mjs`
- Test: `tests/estados.test.mjs`

**Interfaces:**
- Produces (sin imports de Node; todas las transiciones devuelven un objeto nuevo y lanzan `Error("Transición inválida: ...")` si no aplica):
  - `ESTADOS`, `VARIANTES`, `CATEGORIAS`, `CAMPOS_IMAGEN = ["titular","bajada","categoria","variante"]`
  - `hashImagen(post, version) → string` (16 hex, FNV-1a doble)
  - `imagenDesactualizada(post, version) → boolean` (`true` si no hay imagen o el hash no coincide; `version` por defecto `post.imagen?.version`)
  - `aprobar(post, isoHora, ahoraIso)` desde `borrador | programado` → `programado`
  - `descartar(post, ahoraIso)` desde `borrador | error` → `descartado`
  - `quitarDeCola(post, ahoraIso)` desde `programado` → `borrador` (`programado: null`)
  - `reintentar(post, ahoraIso)` desde `error` con `error.paso === "instagram"` → `programado` si tiene hora, si no `borrador`
  - `marcarPublicado(post, { idMedia, permalink }, ahoraIso)` desde `programado` → `publicado`
  - `marcarError(post, { paso, mensaje }, ahoraIso)` desde cualquier estado salvo `publicado | descartado` → `error`
  - `renderOk(post, imagen, ahoraIso)`: fija `imagen`; si estaba en `error` por `render`, vuelve a `programado` (si tiene hora) o `borrador`
  - `editarTexto(post, cambios, ahoraIso)` en `borrador | programado | error`; `cambios` solo admite `titular, bajada, caption, hashtags, categoria, variante`

- [ ] **Step 1: Escribir los tests**

`tests/estados.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hashImagen, imagenDesactualizada, aprobar, descartar, quitarDeCola, reintentar,
  marcarPublicado, marcarError, renderOk, editarTexto, CATEGORIAS, VARIANTES,
} from "../src/lib/estados.mjs";

const AHORA = "2026-09-07T20:00:00.000Z";
const base = () => ({
  id: "2026-09-07-1420-la-prensa-a1b2", estado: "borrador",
  fuente: { medio: "La Prensa", url: "https://p.test/a", titulo: "T", publicado: "2026-09-07T13:10:00.000Z" },
  categoria: "SOCIEDAD", titular: "Titular", bajada: "Bajada", caption: "Cap", hashtags: ["#Panamá"],
  variante: "negro", imagen: null, programado: null, publicacion: null, error: null,
  creado: "2026-09-07T19:20:31.000Z", actualizado: "2026-09-07T19:20:31.000Z",
});

test("hashImagen es estable, de 16 hex y cambia con cualquier campo o la versión", () => {
  const p = base();
  const h = hashImagen(p, 1);
  assert.match(h, /^[0-9a-f]{16}$/);
  assert.equal(h, hashImagen(base(), 1));
  assert.notEqual(h, hashImagen({ ...p, titular: "Otro" }, 1));
  assert.notEqual(h, hashImagen({ ...p, variante: "rojo" }, 1));
  assert.notEqual(h, hashImagen(p, 2));
});

test("imagenDesactualizada detecta ausencia y desfase", () => {
  const p = base();
  assert.equal(imagenDesactualizada(p), true);
  const con = { ...p, imagen: { ruta: "x", url: "y", hash: hashImagen(p, 1), version: 1, renderizada: AHORA } };
  assert.equal(imagenDesactualizada(con), false);
  assert.equal(imagenDesactualizada({ ...con, titular: "cambió" }), true);
  assert.equal(imagenDesactualizada(con, 2), true);
});

test("flujo feliz: aprobar → publicado, con actualizado nuevo", () => {
  const p = aprobar(base(), "2026-09-07T17:00:00-05:00", AHORA);
  assert.equal(p.estado, "programado");
  assert.equal(p.programado, "2026-09-07T17:00:00-05:00");
  assert.equal(p.actualizado, AHORA);
  const pub = marcarPublicado(p, { idMedia: "123", permalink: "https://www.instagram.com/p/x/" }, AHORA);
  assert.equal(pub.estado, "publicado");
  assert.deepEqual(pub.publicacion, { idMedia: "123", permalink: "https://www.instagram.com/p/x/", fecha: AHORA });
  assert.throws(() => marcarPublicado(base(), { idMedia: "1", permalink: "u" }, AHORA), /Transición inválida/);
});

test("descartar, quitarDeCola y reintentar", () => {
  assert.equal(descartar(base(), AHORA).estado, "descartado");
  const prog = aprobar(base(), "2026-09-07T17:00:00-05:00", AHORA);
  assert.throws(() => descartar(prog, AHORA), /Transición inválida/);
  const fuera = quitarDeCola(prog, AHORA);
  assert.equal(fuera.estado, "borrador");
  assert.equal(fuera.programado, null);
  const conError = marcarError(prog, { paso: "instagram", mensaje: "429" }, AHORA);
  assert.equal(conError.estado, "error");
  assert.equal(conError.error.paso, "instagram");
  assert.equal(reintentar(conError, AHORA).estado, "programado");
  const errRender = marcarError(base(), { paso: "render", mensaje: "x" }, AHORA);
  assert.throws(() => reintentar(errRender, AHORA), /Transición inválida/);
  assert.equal(descartar(errRender, AHORA).estado, "descartado");
});

test("renderOk fija la imagen y saca del error de render", () => {
  const errRender = marcarError(base(), { paso: "render", mensaje: "x" }, AHORA);
  const img = { ruta: "public/img/a.jpg", url: "https://x/img/a.jpg", hash: "h", version: 1, renderizada: AHORA };
  const ok = renderOk(errRender, img, AHORA);
  assert.equal(ok.estado, "borrador");
  assert.equal(ok.error, null);
  assert.deepEqual(ok.imagen, img);
  const progErr = marcarError(aprobar(base(), "2026-09-07T17:00:00-05:00", AHORA), { paso: "render", mensaje: "x" }, AHORA);
  assert.equal(renderOk(progErr, img, AHORA).estado, "programado");
});

test("editarTexto valida campos, categoría y variante", () => {
  const e = editarTexto(base(), { titular: "Nuevo", categoria: CATEGORIAS[0], variante: VARIANTES[2] }, AHORA);
  assert.equal(e.titular, "Nuevo");
  assert.equal(e.variante, "rojo");
  assert.throws(() => editarTexto(base(), { estado: "publicado" }, AHORA), /no editable/);
  assert.throws(() => editarTexto(base(), { categoria: "CHISMES" }, AHORA), /categor/i);
  const pub = marcarPublicado(aprobar(base(), "2026-09-07T17:00:00-05:00", AHORA), { idMedia: "1", permalink: "u" }, AHORA);
  assert.throws(() => editarTexto(pub, { titular: "x" }, AHORA), /Transición inválida/);
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --test tests/estados.test.mjs`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar `src/lib/estados.mjs`**

```js
// Estados de un post, transiciones inmutables y hash de la imagen.
// Módulo isomorfo: sin imports de Node, se usa también en el panel.
export const ESTADOS = ["borrador", "programado", "publicado", "descartado", "error"];
export const VARIANTES = ["negro", "amarillo", "rojo"];
export const CATEGORIAS = [
  "POLÍTICA", "ECONOMÍA", "SOCIEDAD", "SEGURIDAD", "SALUD",
  "EDUCACIÓN", "DEPORTES", "CULTURA", "INTERNACIONAL", "ÚLTIMA HORA",
];
export const CAMPOS_IMAGEN = ["titular", "bajada", "categoria", "variante"];
const CAMPOS_EDITABLES = ["titular", "bajada", "caption", "hashtags", "categoria", "variante"];

function fnv1a(texto, base) {
  let h = base >>> 0;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function hashImagen(post, version) {
  const texto = [...CAMPOS_IMAGEN.map((c) => String(post[c] ?? "")), String(version)].join("");
  return fnv1a(texto, 0x811c9dc5) + fnv1a(texto, 0x050c5d1f);
}

export function imagenDesactualizada(post, version = post.imagen?.version) {
  if (!post.imagen || !post.imagen.hash) return true;
  return post.imagen.hash !== hashImagen(post, version ?? 1);
}

function invalida(post, accion) {
  return new Error(`Transición inválida: ${post.estado} → ${accion}`);
}

function con(post, cambios, ahoraIso) {
  return { ...post, ...cambios, actualizado: ahoraIso };
}

export function aprobar(post, isoHora, ahoraIso) {
  if (!["borrador", "programado"].includes(post.estado)) throw invalida(post, "aprobar");
  if (Number.isNaN(Date.parse(isoHora))) throw new Error(`Hora inválida: ${isoHora}`);
  return con(post, { estado: "programado", programado: isoHora, error: null }, ahoraIso);
}

export function descartar(post, ahoraIso) {
  if (!["borrador", "error"].includes(post.estado)) throw invalida(post, "descartar");
  return con(post, { estado: "descartado", programado: null }, ahoraIso);
}

export function quitarDeCola(post, ahoraIso) {
  if (post.estado !== "programado") throw invalida(post, "quitarDeCola");
  return con(post, { estado: "borrador", programado: null }, ahoraIso);
}

export function reintentar(post, ahoraIso) {
  if (post.estado !== "error" || post.error?.paso !== "instagram") throw invalida(post, "reintentar");
  return con(post, { estado: post.programado ? "programado" : "borrador", error: null }, ahoraIso);
}

export function marcarPublicado(post, { idMedia, permalink }, ahoraIso) {
  if (post.estado !== "programado") throw invalida(post, "marcarPublicado");
  return con(post, { estado: "publicado", publicacion: { idMedia, permalink, fecha: ahoraIso }, error: null }, ahoraIso);
}

export function marcarError(post, { paso, mensaje }, ahoraIso) {
  if (["publicado", "descartado"].includes(post.estado)) throw invalida(post, "marcarError");
  if (!["render", "instagram"].includes(paso)) throw new Error(`Paso de error desconocido: ${paso}`);
  return con(post, { estado: "error", error: { paso, mensaje: String(mensaje), fecha: ahoraIso } }, ahoraIso);
}

export function renderOk(post, imagen, ahoraIso) {
  const cambios = { imagen };
  if (post.estado === "error" && post.error?.paso === "render") {
    cambios.estado = post.programado ? "programado" : "borrador";
    cambios.error = null;
  }
  return con(post, cambios, ahoraIso);
}

export function editarTexto(post, cambios, ahoraIso) {
  if (!["borrador", "programado", "error"].includes(post.estado)) throw invalida(post, "editarTexto");
  for (const k of Object.keys(cambios)) {
    if (!CAMPOS_EDITABLES.includes(k)) throw new Error(`Campo no editable: ${k}`);
  }
  if (cambios.categoria !== undefined && !CATEGORIAS.includes(cambios.categoria)) throw new Error(`Categoría inválida: ${cambios.categoria}`);
  if (cambios.variante !== undefined && !VARIANTES.includes(cambios.variante)) throw new Error(`Variante inválida: ${cambios.variante}`);
  if (cambios.hashtags !== undefined && !Array.isArray(cambios.hashtags)) throw new Error("hashtags debe ser una lista");
  return con(post, cambios, ahoraIso);
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --test tests/estados.test.mjs`
Expected: `# pass 6`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/estados.mjs tests/estados.test.mjs
git commit -m "feat: estados de post, transiciones inmutables y hash de imagen"
```

---

### Task 12: Lectura, escritura y creación de posts (`src/lib/posts.mjs`)

**Files:**
- Create: `src/lib/posts.mjs`
- Test: `tests/posts.test.mjs`

**Interfaces:**
- Consumes: `ESTADOS, VARIANTES, CATEGORIAS` (estados.mjs); `claveDia, claveMinuto` (fechas.mjs); `slugify, sha1short` (util.mjs); `normalizarHashtags` (caption.mjs).
- Produces:
  - `validarPost(post) → post` (lanza `Error("Post inválido: ...")`)
  - `leerPosts(dir = "posts") → post[]` (solo `*.json` directos, ordenados por `creado` descendente)
  - `escribirPost(dir, post)` (valida y escribe `dir/<id>.json`, JSON con sangría 2 y salto final)
  - `rutaImagen(id) → "public/img/<id>.jpg"`, `urlImagen(baseUrl, id) → "<baseUrl>/img/<id>.jpg"`
  - `nuevoId({ medio, url, ahora, zona }) → "AAAA-MM-DD-HHMM-<slug medio>-<4 hex>"`
  - `crearPost({ candidato, redaccion, variante, ahora, zona }) → post` en `borrador`, `imagen: null`
  - `siguienteVariante(posts) → "negro" | "amarillo" | "rojo"`
  - `creadosHoy(posts, claveDiaHoy, zona) → number`
  - `archivar(dir, { ahora, dias, zona }) → string[]` (ids movidos a `dir/archivo/AAAA-MM/`)

- [ ] **Step 1: Escribir los tests**

`tests/posts.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  validarPost, leerPosts, escribirPost, nuevoId, crearPost, siguienteVariante, creadosHoy, archivar, rutaImagen, urlImagen,
} from "../src/lib/posts.mjs";

const ahora = new Date("2026-09-07T19:20:31Z");
const candidato = {
  url: "https://www.prensa.com/sociedad/bomberos/", medio: "La Prensa", seccion: "sociedad",
  titulo: "Bomberos piden más fondos", descripcion: "d", fecha: "2026-09-07T13:10:00.000Z", texto: "t", origen: "rss",
};
const redaccion = {
  categoria: "SOCIEDAD", titular: "Bomberos piden $22 millones más", bajada: "La partida de 2027 no cubre la inversión.",
  caption: "Los bomberos advierten...", hashtags: ["Panamá", "#SinLínea", "#Bomberos"], relevancia: 0.9, motivo: "impacto",
};

test("nuevoId sigue el formato AAAA-MM-DD-HHMM-medio-hex", () => {
  const id = nuevoId({ medio: "La Prensa", url: candidato.url, ahora });
  assert.match(id, /^2026-09-07-1420-la-prensa-[0-9a-f]{4}$/);
  assert.equal(id, nuevoId({ medio: "La Prensa", url: candidato.url, ahora }));
});

test("crearPost produce un borrador válido con hashtags normalizados", () => {
  const p = crearPost({ candidato, redaccion, variante: "amarillo", ahora });
  validarPost(p);
  assert.equal(p.estado, "borrador");
  assert.equal(p.imagen, null);
  assert.deepEqual(p.hashtags, ["#Panamá", "#SinLínea", "#Bomberos"]);
  assert.equal(p.fuente.url, candidato.url);
  assert.equal(p.creado, ahora.toISOString());
  assert.equal(rutaImagen(p.id), `public/img/${p.id}.jpg`);
  assert.equal(urlImagen("https://u.github.io/sinlinea/", p.id), `https://u.github.io/sinlinea/img/${p.id}.jpg`);
});

test("validarPost rechaza estado, categoría y variante inválidos", () => {
  const p = crearPost({ candidato, redaccion, variante: "negro", ahora });
  assert.throws(() => validarPost({ ...p, estado: "listo" }), /Post inválido.*estado/);
  assert.throws(() => validarPost({ ...p, categoria: "X" }), /categoria/);
  assert.throws(() => validarPost({ ...p, variante: "azul" }), /variante/);
  assert.throws(() => validarPost({ ...p, id: "malo" }), /id/);
});

test("escribirPost y leerPosts ida y vuelta, ordenados por creado desc, ignorando archivo/", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "posts-"));
  const a = crearPost({ candidato, redaccion, variante: "negro", ahora: new Date("2026-09-07T10:00:00Z") });
  const b = crearPost({ candidato: { ...candidato, url: "https://www.prensa.com/otra/" }, redaccion, variante: "rojo", ahora });
  escribirPost(dir, a);
  escribirPost(dir, b);
  fs.mkdirSync(path.join(dir, "archivo", "2026-08"), { recursive: true });
  fs.writeFileSync(path.join(dir, "archivo", "2026-08", "viejo.json"), "{}");
  const posts = leerPosts(dir);
  assert.deepEqual(posts.map((p) => p.id), [b.id, a.id]);
  assert.ok(fs.readFileSync(path.join(dir, `${a.id}.json`), "utf8").endsWith("}\n"));
});

test("siguienteVariante rota a partir del post más reciente", () => {
  assert.equal(siguienteVariante([]), "negro");
  const a = crearPost({ candidato, redaccion, variante: "negro", ahora: new Date("2026-09-07T10:00:00Z") });
  const b = crearPost({ candidato: { ...candidato, url: "https://www.prensa.com/u2/" }, redaccion, variante: "amarillo", ahora });
  assert.equal(siguienteVariante([a, b]), "rojo");
  assert.equal(siguienteVariante([b, a]), "rojo");
  assert.equal(siguienteVariante([{ ...b, variante: "rojo" }]), "negro");
});

test("creadosHoy cuenta por día de Panamá", () => {
  const a = crearPost({ candidato, redaccion, variante: "negro", ahora: new Date("2026-09-08T03:00:00Z") }); // 22:00 del 7
  const b = crearPost({ candidato: { ...candidato, url: "https://www.prensa.com/u2/" }, redaccion, variante: "negro", ahora: new Date("2026-09-08T12:00:00Z") });
  assert.equal(creadosHoy([a, b], "2026-09-07"), 1);
  assert.equal(creadosHoy([a, b], "2026-09-08"), 1);
});

test("archivar mueve publicados y descartados viejos", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "posts-"));
  const viejo = { ...crearPost({ candidato, redaccion, variante: "negro", ahora: new Date("2026-08-20T10:00:00Z") }), estado: "descartado", actualizado: "2026-08-20T10:00:00.000Z" };
  const reciente = { ...crearPost({ candidato: { ...candidato, url: "https://www.prensa.com/u2/" }, redaccion, variante: "negro", ahora }), estado: "descartado", actualizado: ahora.toISOString() };
  const borradorViejo = crearPost({ candidato: { ...candidato, url: "https://www.prensa.com/u3/" }, redaccion, variante: "negro", ahora: new Date("2026-08-20T10:00:00Z") });
  for (const p of [viejo, reciente, borradorViejo]) escribirPost(dir, p);
  const movidos = archivar(dir, { ahora, dias: 7 });
  assert.deepEqual(movidos, [viejo.id]);
  assert.ok(fs.existsSync(path.join(dir, "archivo", "2026-08", `${viejo.id}.json`)));
  assert.equal(leerPosts(dir).length, 2);
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --test tests/posts.test.mjs`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar `src/lib/posts.mjs`**

```js
// Posts como archivos JSON: validación, lectura, escritura, creación y archivo.
import fs from "node:fs";
import path from "node:path";
import { ESTADOS, VARIANTES, CATEGORIAS } from "./estados.mjs";
import { claveDia, claveMinuto, ZONA_PANAMA } from "./fechas.mjs";
import { slugify, sha1short } from "./util.mjs";
import { normalizarHashtags } from "./caption.mjs";

const RE_ID = /^\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9-]+-[0-9a-f]{4}$/;

function exigir(cond, msg) {
  if (!cond) throw new Error(`Post inválido: ${msg}`);
}

export function validarPost(post) {
  exigir(post && typeof post === "object", "no es un objeto");
  exigir(RE_ID.test(post.id || ""), `id "${post.id}" no tiene el formato esperado`);
  exigir(ESTADOS.includes(post.estado), `estado "${post.estado}" desconocido`);
  exigir(post.fuente && typeof post.fuente.medio === "string" && /^https?:\/\//.test(post.fuente.url || ""), "fuente.medio y fuente.url son obligatorios");
  exigir(CATEGORIAS.includes(post.categoria), `categoria "${post.categoria}" no permitida`);
  exigir(VARIANTES.includes(post.variante), `variante "${post.variante}" no permitida`);
  for (const k of ["titular", "bajada", "caption"]) exigir(typeof post[k] === "string" && post[k].trim(), `${k} es obligatorio`);
  exigir(Array.isArray(post.hashtags), "hashtags debe ser una lista");
  exigir(post.imagen === null || (post.imagen && typeof post.imagen.hash === "string"), "imagen debe ser null o tener hash");
  exigir(post.programado === null || !Number.isNaN(Date.parse(post.programado)), "programado debe ser null o una fecha ISO");
  for (const k of ["creado", "actualizado"]) exigir(!Number.isNaN(Date.parse(post[k])), `${k} debe ser una fecha ISO`);
  return post;
}

export function rutaImagen(id) {
  return `public/img/${id}.jpg`;
}

export function urlImagen(baseUrl, id) {
  return `${String(baseUrl).replace(/\/+$/, "")}/img/${id}.jpg`;
}

export function nuevoId({ medio, url, ahora, zona = ZONA_PANAMA }) {
  return `${claveMinuto(ahora, zona)}-${slugify(medio, 12)}-${sha1short(url, 4)}`;
}

export function crearPost({ candidato, redaccion, variante, ahora, zona = ZONA_PANAMA }) {
  const iso = ahora.toISOString();
  return validarPost({
    id: nuevoId({ medio: candidato.medio, url: candidato.url, ahora, zona }),
    estado: "borrador",
    fuente: { medio: candidato.medio, url: candidato.url, titulo: candidato.titulo, publicado: candidato.fecha },
    categoria: redaccion.categoria,
    titular: redaccion.titular.trim(),
    bajada: redaccion.bajada.trim(),
    caption: redaccion.caption.trim(),
    hashtags: normalizarHashtags(redaccion.hashtags),
    variante,
    imagen: null,
    programado: null,
    publicacion: null,
    error: null,
    creado: iso,
    actualizado: iso,
  });
}

export function leerPosts(dir = "posts") {
  if (!fs.existsSync(dir)) return [];
  const posts = fs.readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => validarPost(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))));
  posts.sort((a, b) => b.creado.localeCompare(a.creado));
  return posts;
}

export function escribirPost(dir, post) {
  validarPost(post);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${post.id}.json`), JSON.stringify(post, null, 2) + "\n");
}

export function siguienteVariante(posts) {
  if (!posts.length) return VARIANTES[0];
  const ultimo = [...posts].sort((a, b) => b.creado.localeCompare(a.creado))[0];
  const i = VARIANTES.indexOf(ultimo.variante);
  return VARIANTES[(i + 1) % VARIANTES.length];
}

export function creadosHoy(posts, claveDiaHoy, zona = ZONA_PANAMA) {
  return posts.filter((p) => claveDia(p.creado, zona) === claveDiaHoy).length;
}

export function archivar(dir, { ahora, dias, zona = ZONA_PANAMA }) {
  const limite = ahora.getTime() - dias * 86400000;
  const movidos = [];
  for (const p of leerPosts(dir)) {
    if (!["publicado", "descartado"].includes(p.estado)) continue;
    if (new Date(p.actualizado).getTime() > limite) continue;
    const mes = claveDia(p.actualizado, zona).slice(0, 7);
    const destino = path.join(dir, "archivo", mes);
    fs.mkdirSync(destino, { recursive: true });
    fs.renameSync(path.join(dir, `${p.id}.json`), path.join(destino, `${p.id}.json`));
    movidos.push(p.id);
  }
  return movidos;
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --test tests/posts.test.mjs`
Expected: `# pass 7`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/posts.mjs tests/posts.test.mjs
git commit -m "feat: modelo de post en archivos JSON (validación, creación, archivo)"
```

---

### Task 13: Franjas horarias (`src/lib/franjas.mjs`, isomorfo)

**Files:**
- Create: `src/lib/franjas.mjs`
- Test: `tests/franjas.test.mjs`

**Interfaces:**
- Consumes: `claveDia, isoDesdeClave, sumarDias` (fechas.mjs).
- Produces (sin imports de Node):
  - `franjasOcupadas(posts) → string[]` (los `programado` de posts en estado `programado`)
  - `choca(iso, ocupadas) → boolean` (mismo instante)
  - `siguienteFranjaLibre({ franjas, ocupadas = [], ahora, zonaHoraria, margenMin = 15, maxDias = 14 }) → string` ISO con offset; lanza `Error` si no hay franja libre en `maxDias`.

- [ ] **Step 1: Escribir los tests**

`tests/franjas.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { siguienteFranjaLibre, franjasOcupadas, choca } from "../src/lib/franjas.mjs";

const franjas = ["07:00", "09:30", "12:00", "14:30", "17:00", "19:30"];
const zonaHoraria = "America/Panama";

test("propone la primera franja al menos 15 min después de ahora", () => {
  const ahora = new Date("2026-09-07T19:20:00Z"); // 14:20 → 14:30 está a 10 min, no vale
  assert.equal(siguienteFranjaLibre({ franjas, ahora, zonaHoraria }), "2026-09-07T17:00:00-05:00");
  const temprano = new Date("2026-09-07T19:10:00Z"); // 14:10 → 14:30 sí vale (20 min)
  assert.equal(siguienteFranjaLibre({ franjas, ahora: temprano, zonaHoraria }), "2026-09-07T14:30:00-05:00");
});

test("salta franjas ocupadas y cruza al día siguiente", () => {
  const ahora = new Date("2026-09-07T19:20:00Z");
  const ocupadas = ["2026-09-07T17:00:00-05:00", "2026-09-07T22:00:00.000Z"]; // 17:00 dos formas
  assert.equal(siguienteFranjaLibre({ franjas, ocupadas, ahora, zonaHoraria }), "2026-09-07T19:30:00-05:00");
  const noche = new Date("2026-09-08T04:00:00Z"); // 23:00 del 7
  assert.equal(siguienteFranjaLibre({ franjas, ahora: noche, zonaHoraria }), "2026-09-08T07:00:00-05:00");
});

test("lanza si todo está ocupado durante maxDias", () => {
  const ahora = new Date("2026-09-07T00:00:00Z");
  const ocupadas = [];
  for (let d = 0; d < 3; d++) for (const h of franjas) ocupadas.push(`2026-09-0${7 + d}T${h}:00-05:00`);
  assert.throws(() => siguienteFranjaLibre({ franjas, ocupadas, ahora, zonaHoraria, maxDias: 2 }), /No hay franjas libres/);
});

test("franjasOcupadas y choca", () => {
  const posts = [
    { estado: "programado", programado: "2026-09-07T17:00:00-05:00" },
    { estado: "borrador", programado: null },
    { estado: "publicado", programado: "2026-09-06T17:00:00-05:00" },
  ];
  assert.deepEqual(franjasOcupadas(posts), ["2026-09-07T17:00:00-05:00"]);
  assert.equal(choca("2026-09-07T22:00:00Z", franjasOcupadas(posts)), true);
  assert.equal(choca("2026-09-07T19:30:00-05:00", franjasOcupadas(posts)), false);
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --test tests/franjas.test.mjs`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar `src/lib/franjas.mjs`**

```js
// Cálculo de la siguiente franja horaria libre. Módulo isomorfo.
import { claveDia, isoDesdeClave, sumarDias } from "./fechas.mjs";

export function franjasOcupadas(posts) {
  return posts.filter((p) => p.estado === "programado" && p.programado).map((p) => p.programado);
}

export function choca(iso, ocupadas) {
  const t = Date.parse(iso);
  return ocupadas.some((o) => Date.parse(o) === t);
}

export function siguienteFranjaLibre({ franjas, ocupadas = [], ahora, zonaHoraria, margenMin = 15, maxDias = 14 }) {
  const minimo = ahora.getTime() + margenMin * 60000;
  const ocupadasMs = new Set(ocupadas.map((o) => Date.parse(o)));
  const horas = [...franjas].sort();
  let dia = claveDia(ahora, zonaHoraria);
  for (let d = 0; d <= maxDias; d++) {
    for (const h of horas) {
      const iso = isoDesdeClave(dia, h);
      const t = Date.parse(iso);
      if (t >= minimo && !ocupadasMs.has(t)) return iso;
    }
    dia = sumarDias(dia, 1);
  }
  throw new Error(`No hay franjas libres en los próximos ${maxDias} días`);
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --test tests/franjas.test.mjs`
Expected: `# pass 4`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/franjas.mjs tests/franjas.test.mjs
git commit -m "feat: cálculo de la siguiente franja horaria libre"
```

---

### Task 14: Redacción con Claude (`src/lib/redactor.mjs`)

**Files:**
- Create: `src/lib/redactor.mjs`
- Test: `tests/redactor.test.mjs`

**Interfaces:**
- Consumes: `CATEGORIAS` (estados.mjs); `Candidato` (Task 8); `@anthropic-ai/sdk` (`client.messages.parse`) y `zodOutputFormat` de `@anthropic-ai/sdk/helpers/zod`.
- Produces:
  - `EsquemaRedaccion` (Zod) con la forma exacta de la especificación §7.
  - `construirSystem(editorialMd) → string` (editorial + reglas fijas).
  - `construirUsuario({ candidatos, recientes, max }) → string`.
  - `validarSeleccion(salida, candidatos, max) → Array<{ candidato, categoria, titular, bajada, caption, hashtags, relevancia, motivo }>` (descarta índices fuera de rango o repetidos, ordena por relevancia desc, recorta a `max`).
  - `redactar({ client, config, editorialMd, candidatos, recientes, max }) → Promise<{ seleccion, descartados, uso }>`; lanza `Error` si Claude rechaza (`stop_reason === "refusal"`) o si `parsed_output` es `null`.

- [ ] **Step 1: Escribir los tests**

`tests/redactor.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { construirSystem, construirUsuario, validarSeleccion, redactar, EsquemaRedaccion } from "../src/lib/redactor.mjs";
import { cargarConfig } from "../src/lib/config.mjs";

const cfg = cargarConfig("config.json");
const candidatos = [
  { url: "https://p.test/1", medio: "La Prensa", seccion: "sociedad", titulo: "Bomberos piden fondos", descripcion: "d1", fecha: "2026-09-07T13:10:00.000Z", texto: "Texto uno.", origen: "rss" },
  { url: "https://e.test/2", medio: "La Estrella de Panamá", seccion: "economia", titulo: "Impuesto mínimo global", descripcion: "d2", fecha: "2026-09-07T05:00:00.000Z", texto: "Texto dos.", origen: "portada" },
];
const salida = {
  seleccion: [
    { indiceCandidato: 1, categoria: "ECONOMÍA", titular: "T2", bajada: "B2", caption: "C2", hashtags: ["#Panamá"], relevancia: 0.6, motivo: "m" },
    { indiceCandidato: 0, categoria: "SOCIEDAD", titular: "T1", bajada: "B1", caption: "C1", hashtags: ["#Panamá"], relevancia: 0.9, motivo: "m" },
    { indiceCandidato: 0, categoria: "SOCIEDAD", titular: "dup", bajada: "b", caption: "c", hashtags: [], relevancia: 0.1, motivo: "m" },
    { indiceCandidato: 7, categoria: "SALUD", titular: "fuera", bajada: "b", caption: "c", hashtags: [], relevancia: 0.5, motivo: "m" },
  ],
  descartados: [],
};

test("EsquemaRedaccion acepta la salida esperada y rechaza categorías desconocidas", () => {
  assert.ok(EsquemaRedaccion.safeParse(salida).success);
  const mala = structuredClone(salida);
  mala.seleccion[0].categoria = "CHISMES";
  assert.equal(EsquemaRedaccion.safeParse(mala).success, false);
});

test("construirSystem incluye la línea editorial y las categorías; construirUsuario lista candidatos y recientes", () => {
  const sys = construirSystem("# Mi línea\nTexto editorial.");
  assert.match(sys, /Texto editorial\./);
  assert.match(sys, /ÚLTIMA HORA/);
  assert.match(sys, /No inventes/i);
  const usr = construirUsuario({ candidatos, recientes: ["Tema ya cubierto"], max: 2 });
  assert.match(usr, /\[0\] La Prensa/);
  assert.match(usr, /Impuesto mínimo global/);
  assert.match(usr, /Tema ya cubierto/);
  assert.match(usr, /hasta 2/);
});

test("validarSeleccion descarta índices repetidos o fuera de rango, ordena por relevancia y recorta", () => {
  const sel = validarSeleccion(salida, candidatos, 2);
  assert.deepEqual(sel.map((s) => s.titular), ["T1", "T2"]);
  assert.equal(sel[0].candidato.url, "https://p.test/1");
  assert.equal(validarSeleccion(salida, candidatos, 1).length, 1);
});

test("redactar llama a messages.parse con modelo, esfuerzo, formato y caché, y devuelve la selección", async () => {
  let params;
  const client = { messages: { parse: async (p) => { params = p; return { parsed_output: salida, stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } }; } } };
  const r = await redactar({ client, config: cfg, editorialMd: "Editorial.", candidatos, recientes: [], max: 2 });
  assert.equal(params.model, "claude-opus-5");
  assert.equal(params.output_config.effort, "medium");
  assert.ok(params.output_config.format, "debe enviar output_config.format");
  assert.deepEqual(params.thinking, { type: "adaptive" });
  assert.equal(params.system[0].cache_control.type, "ephemeral");
  assert.match(params.messages[0].content, /Bomberos piden fondos/);
  assert.equal(r.seleccion.length, 2);
  assert.equal(r.uso.input_tokens, 10);
});

test("redactar lanza si Claude rechaza o no devuelve salida válida", async () => {
  const rechazo = { messages: { parse: async () => ({ parsed_output: null, stop_reason: "refusal", stop_details: { explanation: "no" } }) } };
  await assert.rejects(() => redactar({ client: rechazo, config: cfg, editorialMd: "", candidatos, recientes: [], max: 1 }), /rechazó/);
  const vacio = { messages: { parse: async () => ({ parsed_output: null, stop_reason: "end_turn" }) } };
  await assert.rejects(() => redactar({ client: vacio, config: cfg, editorialMd: "", candidatos, recientes: [], max: 1 }), /salida válida/);
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --test tests/redactor.test.mjs`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar `src/lib/redactor.mjs`**

```js
// Selección y redacción de posts con Claude (salida estructurada con Zod).
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { CATEGORIAS } from "./estados.mjs";

export const EsquemaRedaccion = z.object({
  seleccion: z.array(z.object({
    indiceCandidato: z.number().int(),
    categoria: z.enum(CATEGORIAS),
    titular: z.string(),
    bajada: z.string(),
    caption: z.string(),
    hashtags: z.array(z.string()),
    relevancia: z.number(),
    motivo: z.string(),
  })),
  descartados: z.array(z.object({ indiceCandidato: z.number().int(), motivo: z.string() })),
});

const REGLAS_FIJAS = `
## Reglas que no se negocian
- No inventes datos, nombres, cifras ni declaraciones: usa solo lo que dice el texto del candidato.
- Escribe en español de Panamá.
- Una noticia por post. No repitas temas que aparezcan en la lista de "publicado recientemente",
  salvo que el candidato aporte un hecho nuevo y lo digas en el motivo.
- Prefiere noticias de interés general e impacto para la ciudadanía.
- Categorías permitidas (usa exactamente una de estas): ${CATEGORIAS.join(", ")}.
- "indiceCandidato" es el número entre corchetes de la lista de candidatos.
- "relevancia" va de 0 a 1. Devuelve primero los más relevantes.
- Si ningún candidato vale la pena, devuelve "seleccion" vacía y explica en "descartados".
`;

export function construirSystem(editorialMd) {
  return `${String(editorialMd || "").trim()}\n${REGLAS_FIJAS}`.trim();
}

export function construirUsuario({ candidatos, recientes, max }) {
  const lista = candidatos.map((c, i) =>
    `[${i}] ${c.medio} · ${c.seccion || "sin sección"} · ${c.fecha}\nTítulo: ${c.titulo}\nDescripción: ${c.descripcion || "(sin descripción)"}\nTexto: ${c.texto || "(texto no disponible)"}`
  ).join("\n\n");
  const rec = recientes.length ? recientes.map((t) => `- ${t}`).join("\n") : "- (ninguno)";
  return `Elige hasta ${max} noticias de la lista de candidatos y redacta el post de cada una.

## Publicado recientemente (no repetir)
${rec}

## Candidatos
${lista}`;
}

export function validarSeleccion(salida, candidatos, max) {
  const vistos = new Set();
  const validos = [];
  for (const s of salida.seleccion || []) {
    const i = s.indiceCandidato;
    if (!Number.isInteger(i) || i < 0 || i >= candidatos.length || vistos.has(i)) continue;
    vistos.add(i);
    validos.push({ ...s, candidato: candidatos[i] });
  }
  validos.sort((a, b) => b.relevancia - a.relevancia);
  return validos.slice(0, max);
}

export async function redactar({ client, config, editorialMd, candidatos, recientes, max }) {
  const res = await client.messages.parse({
    model: config.claude.modelo,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: config.claude.esfuerzo, format: zodOutputFormat(EsquemaRedaccion) },
    system: [{ type: "text", text: construirSystem(editorialMd), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: construirUsuario({ candidatos, recientes, max }) }],
  });
  if (res.stop_reason === "refusal") {
    throw new Error(`Claude rechazó la solicitud: ${res.stop_details?.explanation || "sin explicación"}`);
  }
  if (!res.parsed_output) throw new Error("Claude no devolvió una salida válida según el esquema");
  return {
    seleccion: validarSeleccion(res.parsed_output, candidatos, max),
    descartados: res.parsed_output.descartados || [],
    uso: res.usage,
  };
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --test tests/redactor.test.mjs`
Expected: `# pass 5`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/redactor.mjs tests/redactor.test.mjs
git commit -m "feat: selección y redacción de posts con Claude (salida estructurada)"
```

---

### Task 15: Plantilla de imagen y render a JPEG (`templates/post.html`, `src/lib/render.mjs`)

**Files:**
- Create: `templates/post.html`, `src/lib/render.mjs`, `assets/fonts/Anton-Regular.ttf`, `assets/fonts/Inter-Variable.ttf`, `assets/fonts/LICENCIA.txt`, `tests/fixtures/post-ejemplo.json`
- Test: `tests/render.test.mjs` (unitario, sin navegador), `tests/render.integration.mjs` (con Chromium)

**Interfaces:**
- Consumes: `hashImagen` (estados.mjs), `rutaImagen, urlImagen` (posts.mjs), `fechaCorta` (fechas.mjs).
- Produces:
  - `versionPlantilla(html) → number` (lee `data-version` del `<html>`).
  - `datosDeRender(post, config, { logoUrl }) → { titular, bajada, categoria, variante, medio, fecha, usuario, lema, logoUrl }`.
  - `construirHtml(post, config, { plantilla, baseHref, logoUrl }) → string` (reemplaza `__BASE__` y el JSON de `<script id="datos">`).
  - `abrirNavegador() → Promise<Browser>` (Chromium de Playwright).
  - `renderizarPost(post, { config, navegador, raiz = process.cwd(), destino = rutaImagen(post.id) }) → Promise<{ ruta, url, hash, version, renderizada }>`.
- La plantilla marca `<body data-listo="1">` cuando terminó de ajustar el titular; el render espera esa marca.

- [ ] **Step 1: Descargar las fuentes (licencia OFL) y documentarlas**

```bash
curl -L -o assets/fonts/Anton-Regular.ttf "https://github.com/google/fonts/raw/main/ofl/anton/Anton-Regular.ttf"
curl -L -o assets/fonts/Inter-Variable.ttf "https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf"
```

`assets/fonts/LICENCIA.txt`:
```
Anton (Vernon Adams) e Inter (Rasmus Andersson) se distribuyen bajo la
SIL Open Font License 1.1. Descargadas de https://github.com/google/fonts (carpeta ofl/).
```

Verificar: `ls -la assets/fonts` muestra Anton ≈ 170 KB e Inter ≈ 876 KB.

- [ ] **Step 2: Crear la fixture `tests/fixtures/post-ejemplo.json`**

```json
{
  "id": "2026-09-07-1420-la-prensa-a1b2",
  "estado": "borrador",
  "fuente": { "medio": "La Prensa", "url": "https://www.prensa.com/sociedad/bomberos-piden-mas-fondos/", "titulo": "Bomberos piden más fondos", "publicado": "2026-09-07T13:10:00.000Z" },
  "categoria": "SOCIEDAD",
  "titular": "Bomberos advierten que $22 millones quedarían sin cubrir en 2027",
  "bajada": "El Cuerpo de Bomberos pidió a la Asamblea revisar la partida de inversión durante las vistas presupuestarias.",
  "caption": "Los bomberos dicen que el presupuesto de 2027 no alcanza para equipos ni estaciones.\n\n¿Crees que la Asamblea debe corregir la partida?",
  "hashtags": ["#Panamá", "#SinLínea", "#Bomberos", "#Presupuesto2027"],
  "variante": "negro",
  "imagen": null,
  "programado": null,
  "publicacion": null,
  "error": null,
  "creado": "2026-09-07T19:20:31.000Z",
  "actualizado": "2026-09-07T19:20:31.000Z"
}
```

- [ ] **Step 3: Crear `templates/post.html`**

```html
<!doctype html>
<html lang="es" data-version="1">
<head>
<meta charset="utf-8">
<base href="__BASE__">
<title>Sin Línea · post</title>
<style>
  @font-face { font-family: "Anton"; src: url("assets/fonts/Anton-Regular.ttf") format("truetype"); font-display: block; }
  @font-face { font-family: "Inter"; src: url("assets/fonts/Inter-Variable.ttf") format("truetype"); font-weight: 100 900; font-display: block; }
  :root { --amarillo: #FFD400; --rojo: #E30613; --negro: #111111; --blanco: #FFFFFF; }
  html, body { margin: 0; padding: 0; }
  body { width: 1080px; height: 1350px; overflow: hidden; font-family: "Inter", Arial, sans-serif; -webkit-font-smoothing: antialiased; }
  .post { position: relative; width: 1080px; height: 1350px; box-sizing: border-box; padding: 72px 72px 88px;
          display: flex; flex-direction: column; background: var(--fondo); color: var(--texto); }
  .post[data-variante="negro"]    { --fondo: var(--negro);    --texto: var(--blanco); --titular: var(--amarillo); --chip-fondo: var(--rojo);  --chip-texto: var(--blanco);   --barra: var(--rojo);  --barra-texto: var(--blanco); }
  .post[data-variante="amarillo"] { --fondo: var(--amarillo); --texto: var(--negro);  --titular: var(--negro);    --chip-fondo: var(--rojo);  --chip-texto: var(--blanco);   --barra: var(--rojo);  --barra-texto: var(--blanco); }
  .post[data-variante="rojo"]     { --fondo: var(--rojo);     --texto: var(--blanco); --titular: var(--blanco);   --chip-fondo: var(--negro); --chip-texto: var(--amarillo); --barra: var(--negro); --barra-texto: var(--amarillo); }
  .cabecera { display: flex; justify-content: space-between; align-items: flex-start; height: 160px; }
  .logo { width: 160px; height: 160px; border-radius: 50%; object-fit: cover; display: block; }
  .logo-fallback { width: 160px; height: 160px; border-radius: 50%; box-sizing: border-box; background: var(--amarillo); color: var(--negro);
                   display: flex; align-items: center; justify-content: center; font-family: "Anton", Impact, sans-serif; font-size: 34px; line-height: 1;
                   text-align: center; border: 6px solid var(--negro); }
  .chip { font-weight: 700; font-size: 28px; letter-spacing: 0.12em; text-transform: uppercase; background: var(--chip-fondo); color: var(--chip-texto); padding: 14px 22px; margin-top: 8px; }
  .cuerpo { flex: 1; min-height: 0; display: flex; flex-direction: column; justify-content: center; gap: 36px; padding: 40px 0; }
  .titular { margin: 0; font-family: "Anton", Impact, sans-serif; font-weight: 400; text-transform: uppercase; line-height: 0.95; color: var(--titular);
             font-size: 104px; max-height: 620px; overflow: hidden; overflow-wrap: break-word; }
  .bajada { margin: 0; font-size: 36px; line-height: 1.3; opacity: 0.85; max-height: 150px; overflow: hidden; }
  .pie { height: 130px; display: flex; justify-content: space-between; align-items: center; font-size: 26px; font-weight: 600;
         border-top: 2px solid color-mix(in srgb, var(--texto) 30%, transparent); }
  .barra { position: absolute; left: 0; right: 0; bottom: 0; height: 88px; background: var(--barra); color: var(--barra-texto);
           display: flex; align-items: center; justify-content: center; font-family: "Anton", Impact, sans-serif; font-size: 36px; letter-spacing: 0.06em; text-transform: uppercase; }
</style>
</head>
<body>
<div class="post" id="post" data-variante="negro">
  <header class="cabecera">
    <div id="logo"></div>
    <div class="chip" id="categoria"></div>
  </header>
  <main class="cuerpo">
    <h1 class="titular" id="titular"></h1>
    <p class="bajada" id="bajada"></p>
  </main>
  <footer class="pie">
    <span id="fuente"></span>
    <span id="usuario"></span>
  </footer>
  <div class="barra" id="lema"></div>
</div>
<script id="datos" type="application/json">{}</script>
<script>
(async function () {
  const d = JSON.parse(document.getElementById("datos").textContent || "{}");
  const $ = (id) => document.getElementById(id);
  $("post").dataset.variante = d.variante || "negro";
  $("categoria").textContent = d.categoria || "";
  $("titular").textContent = d.titular || "";
  $("bajada").textContent = d.bajada || "";
  $("fuente").textContent = "Fuente: " + (d.medio || "") + " · " + (d.fecha || "");
  $("usuario").textContent = d.usuario || "";
  $("lema").textContent = d.lema || "";
  if (d.logoUrl) {
    const img = new Image();
    img.className = "logo";
    img.alt = "";
    img.src = d.logoUrl;
    $("logo").replaceWith(img);
    await img.decode().catch(() => {});
  } else {
    $("logo").className = "logo-fallback";
    $("logo").innerHTML = "SIN<br>LÍNEA";
  }
  await document.fonts.ready;
  const t = $("titular");
  let size = 104;
  const cabe = () => t.scrollHeight <= 620 && t.scrollWidth <= t.clientWidth + 1;
  t.style.fontSize = size + "px";
  while (!cabe() && size > 64) { size -= 4; t.style.fontSize = size + "px"; }
  document.body.dataset.listo = "1";
})();
</script>
</body>
</html>
```

- [ ] **Step 4: Escribir el test unitario `tests/render.test.mjs`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { versionPlantilla, datosDeRender, construirHtml } from "../src/lib/render.mjs";
import { cargarConfig } from "../src/lib/config.mjs";

const cfg = cargarConfig("config.json");
const post = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));
const plantilla = fs.readFileSync("templates/post.html", "utf8");

test("versionPlantilla lee data-version", () => {
  assert.equal(versionPlantilla('<html lang="es" data-version="7">'), 7);
  assert.equal(versionPlantilla(plantilla), 1);
});

test("datosDeRender arma los textos de la imagen", () => {
  const d = datosDeRender(post, cfg, { logoUrl: null });
  assert.equal(d.titular, post.titular);
  assert.equal(d.fecha, "7 sep 2026");
  assert.equal(d.usuario, "@sinlinea");
  assert.equal(d.lema, "Nuestra línea es el Pueblo");
  assert.equal(d.variante, "negro");
  assert.equal(d.logoUrl, null);
});

test("construirHtml inyecta base y datos JSON escapando </", () => {
  const html = construirHtml({ ...post, titular: "Cierra </script> raro" }, cfg, { plantilla, baseHref: "file:///C:/x/", logoUrl: "assets/logo.png" });
  assert.match(html, /<base href="file:\/\/\/C:\/x\/">/);
  assert.ok(!html.includes("__BASE__"));
  const m = html.match(/<script id="datos" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(m);
  assert.ok(m[1].includes("<\\/script>"), "debe escapar </ dentro del JSON");
  assert.equal(JSON.parse(m[1]).logoUrl, "assets/logo.png");
});
```

- [ ] **Step 5: Correr el test unitario para verificar que falla**

Run: `node --test tests/render.test.mjs`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 6: Implementar `src/lib/render.mjs`**

```js
// Render de un post a JPEG 1080x1350 con Playwright (Chromium) + sharp.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { chromium } from "playwright";
import { hashImagen } from "./estados.mjs";
import { rutaImagen, urlImagen } from "./posts.mjs";
import { fechaCorta } from "./fechas.mjs";

export const RUTA_PLANTILLA = "templates/post.html";
export const RUTA_LOGO = "assets/logo.png";

export function versionPlantilla(html) {
  const m = String(html).match(/<html[^>]*\bdata-version="(\d+)"/);
  if (!m) throw new Error("La plantilla no declara data-version en <html>");
  return Number(m[1]);
}

export function datosDeRender(post, config, { logoUrl }) {
  return {
    titular: post.titular,
    bajada: post.bajada,
    categoria: post.categoria,
    variante: post.variante,
    medio: post.fuente.medio,
    fecha: fechaCorta(post.creado, config.zonaHoraria),
    usuario: config.marca.usuario,
    lema: config.marca.lema,
    logoUrl,
  };
}

export function construirHtml(post, config, { plantilla, baseHref, logoUrl }) {
  const json = JSON.stringify(datosDeRender(post, config, { logoUrl })).replace(/<\//g, "<\\/");
  return plantilla
    .replace("__BASE__", baseHref)
    .replace(/<script id="datos" type="application\/json">[\s\S]*?<\/script>/, `<script id="datos" type="application/json">${json}</script>`);
}

export async function abrirNavegador() {
  return chromium.launch();
}

export async function renderizarPost(post, { config, navegador, raiz = process.cwd(), destino = rutaImagen(post.id) }) {
  const plantilla = fs.readFileSync(path.join(raiz, RUTA_PLANTILLA), "utf8");
  const version = versionPlantilla(plantilla);
  const logoUrl = fs.existsSync(path.join(raiz, RUTA_LOGO)) ? RUTA_LOGO : null;
  const baseHref = pathToFileURL(path.resolve(raiz) + path.sep).href;
  const html = construirHtml(post, config, { plantilla, baseHref, logoUrl });

  const dirTemp = path.join(raiz, "temp", "render");
  fs.mkdirSync(dirTemp, { recursive: true });
  const rutaHtml = path.join(dirTemp, `${post.id}.html`);
  fs.writeFileSync(rutaHtml, html);

  const page = await navegador.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  try {
    await page.goto(pathToFileURL(rutaHtml).href, { waitUntil: "load" });
    await page.waitForSelector('body[data-listo="1"]', { timeout: 15000 });
    const png = await page.screenshot({ type: "png", fullPage: false });
    const rutaSalida = path.join(raiz, destino);
    fs.mkdirSync(path.dirname(rutaSalida), { recursive: true });
    await sharp(png).jpeg({ quality: 88, progressive: true, mozjpeg: true }).toFile(rutaSalida);
  } finally {
    await page.close();
  }
  return {
    ruta: destino,
    url: urlImagen(config.pages.baseUrl, post.id),
    hash: hashImagen(post, version),
    version,
    renderizada: new Date().toISOString(),
  };
}
```

- [ ] **Step 7: Correr el test unitario para verificar que pasa**

Run: `node --test tests/render.test.mjs`
Expected: `# pass 3`.

- [ ] **Step 8: Instalar Chromium y escribir el test de integración `tests/render.integration.mjs`**

Run: `npx playwright install chromium`

```js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { abrirNavegador, renderizarPost } from "../src/lib/render.mjs";
import { cargarConfig } from "../src/lib/config.mjs";

const cfg = cargarConfig("config.json");
const base = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));
let navegador;
before(async () => { navegador = await abrirNavegador(); });
after(async () => { await navegador?.close(); });

for (const variante of ["negro", "amarillo", "rojo"]) {
  test(`renderiza la variante ${variante} como JPEG 1080x1350 menor a 1 MB`, async () => {
    const post = { ...base, variante };
    const destino = path.join("temp", "test-render", `${variante}.jpg`);
    const img = await renderizarPost(post, { config: cfg, navegador, destino });
    const meta = await sharp(img.ruta).metadata();
    assert.equal(meta.format, "jpeg");
    assert.equal(meta.width, 1080);
    assert.equal(meta.height, 1350);
    assert.ok(fs.statSync(img.ruta).size < 1024 * 1024);
    assert.equal(img.version, 1);
    assert.match(img.hash, /^[0-9a-f]{16}$/);
  });
}

test("un titular muy largo se reduce pero no desborda (no lanza)", async () => {
  const post = { ...base, titular: "Un titular exageradamente largo que obliga a la plantilla a reducir el tamaño de la letra varias veces hasta que quepa bien" };
  const img = await renderizarPost(post, { config: cfg, navegador, destino: path.join("temp", "test-render", "largo.jpg") });
  assert.ok(fs.existsSync(img.ruta));
});
```

- [ ] **Step 9: Correr el test de integración y revisar las imágenes**

Run: `npm run test:render`
Expected: `# pass 4`. Abrir `temp/test-render/negro.jpg`, `amarillo.jpg`, `rojo.jpg` y confirmar visualmente: logo (o círculo de reserva) arriba a la izquierda, chip de categoría a la derecha, titular grande en Anton, bajada, pie con fuente y usuario, barra roja con el lema abajo. Ajustar tamaños en `templates/post.html` si algo se corta; volver a correr.

- [ ] **Step 10: Commit**

```bash
git add templates/post.html src/lib/render.mjs assets/fonts tests/render.test.mjs tests/render.integration.mjs tests/fixtures/post-ejemplo.json
git commit -m "feat: plantilla 1080x1350 con tres variantes y render a JPEG con Playwright"
```

---

### Task 16: Cliente de la API de Instagram (`src/lib/instagram.mjs`)

**Files:**
- Create: `src/lib/instagram.mjs`
- Test: `tests/instagram.test.mjs`

**Interfaces:**
- Produces: `crearClienteInstagram({ token, usuarioId, apiVersion, fetchImpl = fetch, dormir, reintentos = 3 })` que devuelve:
  - `crearContenedor({ imageUrl, caption }) → Promise<string>` (`creation_id`)
  - `esperarContenedor(creationId, { intentos = 24, esperaMs = 5000 }) → Promise<void>` (resuelve en `FINISHED`; lanza en `ERROR | EXPIRED` o al agotar intentos)
  - `publicar(creationId) → Promise<string>` (`media_id`)
  - `permalink(mediaId) → Promise<string>`
  - `cuota() → Promise<{ usados, limite }>`
  - `refrescarToken() → Promise<{ token, expiraEnSegundos }>`
  - `imagenPublica(url) → Promise<boolean>`
  - `publicarImagen({ imageUrl, caption }) → Promise<{ idMedia, permalink }>` (encadena los cuatro pasos)
- Errores: red y 5xx se reintentan `reintentos` veces con espera exponencial (1 s, 2 s, 4 s); 4xx lanza `Error` cuyo `message` es el `error.message` de la API y con propiedad `codigo`.

- [ ] **Step 1: Escribir los tests**

`tests/instagram.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearClienteInstagram } from "../src/lib/instagram.mjs";

function fetchFalso(respuestas) {
  const llamadas = [];
  const impl = async (url, opciones = {}) => {
    llamadas.push({ url: String(url), metodo: opciones.method || "GET", body: opciones.body ? String(opciones.body) : "" });
    const r = respuestas.shift();
    if (!r) throw new Error(`respuesta no prevista para ${url}`);
    if (r.error) throw r.error;
    return new Response(JSON.stringify(r.json ?? {}), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  };
  return { impl, llamadas };
}

const opciones = { token: "TOKEN", usuarioId: "1789", apiVersion: "v23.0", dormir: async () => {} };

test("publicarImagen encadena contenedor, espera, publicación y permalink", async () => {
  const { impl, llamadas } = fetchFalso([
    { json: { id: "c1" } },
    { json: { status_code: "IN_PROGRESS" } },
    { json: { status_code: "FINISHED" } },
    { json: { id: "m1" } },
    { json: { permalink: "https://www.instagram.com/p/abc/" } },
  ]);
  const ig = crearClienteInstagram({ ...opciones, fetchImpl: impl });
  const r = await ig.publicarImagen({ imageUrl: "https://x/img/a.jpg", caption: "Hola" });
  assert.deepEqual(r, { idMedia: "m1", permalink: "https://www.instagram.com/p/abc/" });
  assert.equal(llamadas[0].url, "https://graph.instagram.com/v23.0/1789/media");
  assert.equal(llamadas[0].metodo, "POST");
  assert.match(llamadas[0].body, /image_url=https%3A%2F%2Fx%2Fimg%2Fa\.jpg/);
  assert.match(llamadas[0].body, /caption=Hola/);
  assert.match(llamadas[1].url, /\/v23\.0\/c1\?fields=status_code/);
  assert.equal(llamadas[3].url, "https://graph.instagram.com/v23.0/1789/media_publish");
  assert.match(llamadas[3].body, /creation_id=c1/);
  assert.ok(llamadas.every((l) => !l.url.includes("TOKEN") || l.url.includes("access_token=TOKEN")));
});

test("esperarContenedor lanza en ERROR y al agotar intentos", async () => {
  const a = fetchFalso([{ json: { status_code: "ERROR", status: "Media ID is not available" } }]);
  const ig = crearClienteInstagram({ ...opciones, fetchImpl: a.impl });
  await assert.rejects(() => ig.esperarContenedor("c1"), /ERROR/);
  const b = fetchFalso([{ json: { status_code: "IN_PROGRESS" } }, { json: { status_code: "IN_PROGRESS" } }]);
  const ig2 = crearClienteInstagram({ ...opciones, fetchImpl: b.impl });
  await assert.rejects(() => ig2.esperarContenedor("c1", { intentos: 2 }), /no terminó/);
});

test("un 4xx lanza el mensaje de la API sin reintentar; un 5xx se reintenta", async () => {
  const a = fetchFalso([{ status: 400, json: { error: { message: "Invalid parameter", code: 100 } } }]);
  const ig = crearClienteInstagram({ ...opciones, fetchImpl: a.impl });
  await assert.rejects(() => ig.crearContenedor({ imageUrl: "u", caption: "c" }), (e) => e.message === "Invalid parameter" && e.codigo === 100);
  assert.equal(a.llamadas.length, 1);
  const b = fetchFalso([{ status: 503, json: {} }, { error: new Error("red") }, { json: { id: "c9" } }]);
  const ig2 = crearClienteInstagram({ ...opciones, fetchImpl: b.impl });
  assert.equal(await ig2.crearContenedor({ imageUrl: "u", caption: "c" }), "c9");
  assert.equal(b.llamadas.length, 3);
});

test("cuota, refrescarToken e imagenPublica", async () => {
  const { impl, llamadas } = fetchFalso([
    { json: { data: [{ quota_usage: 3, config: { quota_total: 100 } }] } },
    { json: { access_token: "NUEVO", token_type: "bearer", expires_in: 5184000 } },
    { status: 200, json: {} },
    { status: 404, json: {} },
  ]);
  const ig = crearClienteInstagram({ ...opciones, fetchImpl: impl });
  assert.deepEqual(await ig.cuota(), { usados: 3, limite: 100 });
  assert.match(llamadas[0].url, /content_publishing_limit\?fields=quota_usage%2Cconfig/);
  assert.deepEqual(await ig.refrescarToken(), { token: "NUEVO", expiraEnSegundos: 5184000 });
  assert.match(llamadas[1].url, /^https:\/\/graph\.instagram\.com\/refresh_access_token\?grant_type=ig_refresh_token&access_token=TOKEN$/);
  assert.equal(await ig.imagenPublica("https://x/img/a.jpg"), true);
  assert.equal(llamadas[2].metodo, "HEAD");
  assert.equal(await ig.imagenPublica("https://x/img/b.jpg"), false);
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --test tests/instagram.test.mjs`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar `src/lib/instagram.mjs`**

```js
// Cliente mínimo de la Instagram API with Instagram Login (graph.instagram.com).
const HOST = "https://graph.instagram.com";

function errorDeApi(json, status) {
  const e = new Error(json?.error?.message || `HTTP ${status}`);
  e.codigo = json?.error?.code ?? status;
  e.status = status;
  return e;
}

export function crearClienteInstagram({
  token, usuarioId, apiVersion, fetchImpl = fetch,
  dormir = (ms) => new Promise((r) => setTimeout(r, ms)), reintentos = 3,
}) {
  const base = `${HOST}/${apiVersion}`;

  async function llamar(metodo, url, params = {}) {
    const datos = new URLSearchParams({ ...params, access_token: token });
    let ultimo;
    for (let intento = 0; intento <= reintentos; intento++) {
      try {
        const res = metodo === "GET"
          ? await fetchImpl(`${url}?${datos}`)
          : await fetchImpl(url, { method: metodo, headers: { "content-type": "application/x-www-form-urlencoded" }, body: datos.toString() });
        const json = await res.json().catch(() => ({}));
        if (res.ok) return json;
        if (res.status >= 500) { ultimo = errorDeApi(json, res.status); }
        else throw errorDeApi(json, res.status);
      } catch (err) {
        if (err.status && err.status < 500) throw err;
        ultimo = err;
      }
      if (intento < reintentos) await dormir(1000 * 2 ** intento);
    }
    throw ultimo;
  }

  async function crearContenedor({ imageUrl, caption }) {
    const r = await llamar("POST", `${base}/${usuarioId}/media`, { image_url: imageUrl, caption });
    if (!r.id) throw new Error("La API no devolvió el id del contenedor");
    return r.id;
  }

  async function esperarContenedor(creationId, { intentos = 24, esperaMs = 5000 } = {}) {
    for (let i = 0; i < intentos; i++) {
      const r = await llamar("GET", `${base}/${creationId}`, { fields: "status_code,status" });
      if (r.status_code === "FINISHED") return;
      if (r.status_code === "ERROR" || r.status_code === "EXPIRED") {
        throw new Error(`El contenedor terminó en ${r.status_code}: ${r.status || "sin detalle"}`);
      }
      await dormir(esperaMs);
    }
    throw new Error(`El contenedor ${creationId} no terminó de procesarse a tiempo`);
  }

  async function publicar(creationId) {
    const r = await llamar("POST", `${base}/${usuarioId}/media_publish`, { creation_id: creationId });
    if (!r.id) throw new Error("La API no devolvió el id del post publicado");
    return r.id;
  }

  async function permalink(mediaId) {
    const r = await llamar("GET", `${base}/${mediaId}`, { fields: "permalink" });
    return r.permalink || "";
  }

  async function cuota() {
    const r = await llamar("GET", `${base}/${usuarioId}/content_publishing_limit`, { fields: "quota_usage,config" });
    const d = r.data?.[0] || {};
    return { usados: d.quota_usage ?? 0, limite: d.config?.quota_total ?? 100 };
  }

  async function refrescarToken() {
    const res = await fetchImpl(`${HOST}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.access_token) throw errorDeApi(json, res.status);
    return { token: json.access_token, expiraEnSegundos: json.expires_in };
  }

  async function imagenPublica(url) {
    try {
      const res = await fetchImpl(url, { method: "HEAD" });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async function publicarImagen({ imageUrl, caption }) {
    const creationId = await crearContenedor({ imageUrl, caption });
    await esperarContenedor(creationId);
    const idMedia = await publicar(creationId);
    return { idMedia, permalink: await permalink(idMedia) };
  }

  return { crearContenedor, esperarContenedor, publicar, permalink, cuota, refrescarToken, imagenPublica, publicarImagen };
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --test tests/instagram.test.mjs`
Expected: `# pass 4`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/instagram.mjs tests/instagram.test.mjs
git commit -m "feat: cliente de la API de Instagram con reintentos y fetch inyectable"
```

---

### Task 17: Orquestador GENERAR (`src/generar.mjs`)

**Files:**
- Create: `src/generar.mjs`
- Test: `tests/generar.test.mjs`

**Interfaces:**
- Consumes: `cargarConfig`, `fetchText`, `recolectar`, `cargarVistas/guardarVistas/estaVista/marcarVistas/purgarVistas`, `leerPosts/escribirPost/crearPost/siguienteVariante/creadosHoy/archivar`, `redactar`, `recortarCaption`, `marcarError/renderOk`, `abrirNavegador/renderizarPost`, `claveDia`.
- Produces: `ejecutarGenerar({ config, raiz = process.cwd(), ahora = new Date(), fetchText, client, render, log = console, dryRun = false }) → Promise<{ creados: post[], motivo: "ok" | "cupo" | "sin-candidatos" }>` donde `render(post, { config, raiz, destino }) → Promise<imagen>`; y `main()` que conecta las dependencias reales. Con `dryRun` escribe en `temp/dry-run/` y no toca `data/seen.json` ni `posts/`.

- [ ] **Step 1: Escribir los tests**

`tests/generar.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ejecutarGenerar } from "../src/generar.mjs";
import { cargarConfig } from "../src/lib/config.mjs";
import { leerPosts } from "../src/lib/posts.mjs";
import { cargarVistas } from "../src/lib/seen.mjs";

const xml = fs.readFileSync("tests/fixtures/laprensa.xml", "utf8");
const portada = fs.readFileSync("tests/fixtures/laestrella-portada.html", "utf8");
const articulo = fs.readFileSync("tests/fixtures/laestrella-articulo.html", "utf8");
const ahora = new Date("2026-09-07T19:20:31Z");

function raizTemporal() {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "sinlinea-"));
  fs.mkdirSync(path.join(raiz, "posts"), { recursive: true });
  fs.mkdirSync(path.join(raiz, "data"), { recursive: true });
  fs.mkdirSync(path.join(raiz, "prompts"), { recursive: true });
  fs.copyFileSync("config.json", path.join(raiz, "config.json"));
  fs.copyFileSync("prompts/editorial.md", path.join(raiz, "prompts/editorial.md"));
  fs.writeFileSync(path.join(raiz, "data/seen.json"), '{ "urls": {} }\n');
  return raiz;
}

const fetchText = async (url) => {
  if (url.includes("prensa.com/arc")) return xml;
  if (url === "https://www.laestrella.com.pa/") return portada;
  return articulo;
};

function clientFalso(indices) {
  return { messages: { parse: async (p) => ({
    stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 },
    parsed_output: { descartados: [], seleccion: indices.map((i, k) => ({
      indiceCandidato: i, categoria: "SOCIEDAD", titular: `Titular ${k}`, bajada: "Bajada", caption: "Caption", hashtags: ["#Panamá"], relevancia: 1 - k / 10, motivo: "m",
    })) },
  }) } };
}

const renderOkFalso = async (post) => ({ ruta: `public/img/${post.id}.jpg`, url: `https://x/img/${post.id}.jpg`, hash: "0".repeat(16), version: 1, renderizada: ahora.toISOString() });
const log = { info: () => {}, warn: () => {} };

test("crea borradores, marca todas las URLs candidatas como vistas y rota variantes", async () => {
  const raiz = raizTemporal();
  const config = cargarConfig(path.join(raiz, "config.json"));
  const r = await ejecutarGenerar({ config, raiz, ahora, fetchText, client: clientFalso([0, 1]), render: renderOkFalso, log });
  assert.equal(r.motivo, "ok");
  assert.equal(r.creados.length, 2);
  const posts = leerPosts(path.join(raiz, "posts"));
  assert.equal(posts.length, 2);
  assert.deepEqual(posts.map((p) => p.variante).sort(), ["amarillo", "negro"]);
  assert.ok(posts.every((p) => p.estado === "borrador" && p.imagen?.hash));
  const vistas = cargarVistas(path.join(raiz, "data/seen.json"));
  assert.ok(Object.keys(vistas.urls).length >= 3, "marca elegidos y no elegidos");
  const otra = await ejecutarGenerar({ config, raiz, ahora, fetchText, client: clientFalso([0]), render: renderOkFalso, log });
  assert.equal(otra.motivo, "sin-candidatos");
});

test("respeta el cupo diario y no llama a Claude si está agotado", async () => {
  const raiz = raizTemporal();
  const config = cargarConfig(path.join(raiz, "config.json"));
  config.generar.maxBorradoresPorDia = 1;
  let llamadas = 0;
  const client = { messages: { parse: async (p) => { llamadas++; return clientFalso([0, 1]).messages.parse(p); } } };
  const r = await ejecutarGenerar({ config, raiz, ahora, fetchText, client, render: renderOkFalso, log });
  assert.equal(r.creados.length, 1);
  const r2 = await ejecutarGenerar({ config, raiz, ahora, fetchText, client, render: renderOkFalso, log });
  assert.equal(r2.motivo, "cupo");
  assert.equal(llamadas, 1);
});

test("si el render falla el post queda en error de render", async () => {
  const raiz = raizTemporal();
  const config = cargarConfig(path.join(raiz, "config.json"));
  const render = async () => { throw new Error("chromium caído"); };
  const r = await ejecutarGenerar({ config, raiz, ahora, fetchText, client: clientFalso([0]), render, log });
  assert.equal(r.creados[0].estado, "error");
  assert.equal(r.creados[0].error.paso, "render");
  assert.match(r.creados[0].error.mensaje, /chromium/);
});

test("dry-run escribe en temp/ y no toca posts ni seen", async () => {
  const raiz = raizTemporal();
  const config = cargarConfig(path.join(raiz, "config.json"));
  const r = await ejecutarGenerar({ config, raiz, ahora, fetchText, client: clientFalso([0]), render: renderOkFalso, log, dryRun: true });
  assert.equal(r.creados.length, 1);
  assert.equal(leerPosts(path.join(raiz, "posts")).length, 0);
  assert.equal(leerPosts(path.join(raiz, "temp/dry-run/posts")).length, 1);
  assert.deepEqual(cargarVistas(path.join(raiz, "data/seen.json")), { urls: {} });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --test tests/generar.test.mjs`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar `src/generar.mjs`**

```js
// GENERAR: feeds → candidatos → Claude → render → posts/<id>.json
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { cargarConfig } from "./lib/config.mjs";
import { fetchText as fetchTextReal } from "./lib/rss.mjs";
import { recolectar } from "./lib/fuentes.mjs";
import { cargarVistas, guardarVistas, estaVista, marcarVistas, purgarVistas } from "./lib/seen.mjs";
import { leerPosts, escribirPost, crearPost, siguienteVariante, creadosHoy, archivar } from "./lib/posts.mjs";
import { redactar } from "./lib/redactor.mjs";
import { recortarCaption } from "./lib/caption.mjs";
import { marcarError, renderOk } from "./lib/estados.mjs";
import { abrirNavegador, renderizarPost } from "./lib/render.mjs";
import { claveDia } from "./lib/fechas.mjs";

export async function ejecutarGenerar({ config, raiz = process.cwd(), ahora = new Date(), fetchText, client, render, log = console, dryRun = false }) {
  const zona = config.zonaHoraria;
  const hoy = claveDia(ahora, zona);
  const iso = ahora.toISOString();
  const dirReal = path.join(raiz, "posts");
  const dirSalida = dryRun ? path.join(raiz, "temp", "dry-run", "posts") : dirReal;
  const rutaVistas = path.join(raiz, "data", "seen.json");

  const posts = leerPosts(dirReal);
  let vistas = purgarVistas(cargarVistas(rutaVistas), hoy);

  const cupo = config.generar.maxBorradoresPorDia - creadosHoy(posts, hoy, zona);
  if (cupo <= 0) {
    log.info(`Cupo diario agotado (${config.generar.maxBorradoresPorDia}); no se llama a Claude.`);
    return { creados: [], motivo: "cupo" };
  }

  const urlsEnPosts = new Set(posts.map((p) => p.fuente.url));
  const candidatos = await recolectar(config, {
    fetchText, ahora, log, filtrar: (u) => !estaVista(vistas, u) && !urlsEnPosts.has(u),
  });
  if (!candidatos.length) {
    log.info("Sin candidatos nuevos.");
    return { creados: [], motivo: "sin-candidatos" };
  }

  const limite = ahora.getTime() - config.generar.diasSinRepetir * 86400000;
  const recientes = posts
    .filter((p) => p.estado !== "descartado" && new Date(p.creado).getTime() >= limite)
    .map((p) => p.titular);
  const editorialMd = fs.readFileSync(path.join(raiz, "prompts", "editorial.md"), "utf8");
  const max = Math.min(config.generar.maxPorCorrida, cupo);

  const { seleccion, uso } = await redactar({ client, config, editorialMd, candidatos, recientes, max });
  log.info(`Claude eligió ${seleccion.length} de ${candidatos.length} candidatos (tokens: ${uso?.input_tokens ?? "?"} entrada, ${uso?.output_tokens ?? "?"} salida).`);

  const creados = [];
  const existentes = [...posts];
  for (const s of seleccion) {
    const r = recortarCaption({ caption: s.caption, medio: s.candidato.medio, hashtags: s.hashtags });
    if (r.recortado) log.warn(`Caption recortado para "${s.titular}".`);
    let post = crearPost({
      candidato: s.candidato,
      redaccion: { ...s, caption: r.caption, hashtags: r.hashtags },
      variante: siguienteVariante(existentes),
      ahora, zona,
    });
    try {
      const imagen = await render(post, {
        config, raiz, destino: dryRun ? path.join("temp", "dry-run", "img", `${post.id}.jpg`) : undefined,
      });
      post = renderOk(post, imagen, iso);
    } catch (err) {
      log.warn(`Render falló para ${post.id}: ${err.message}`);
      post = marcarError(post, { paso: "render", mensaje: err.message }, iso);
    }
    escribirPost(dirSalida, post);
    existentes.push(post);
    creados.push(post);
    log.info(`Borrador ${post.id} (${post.variante}): ${post.titular}`);
  }

  if (!dryRun) {
    vistas = marcarVistas(vistas, candidatos.map((c) => c.url), hoy);
    guardarVistas(rutaVistas, vistas);
    const movidos = archivar(dirReal, { ahora, dias: config.archivarDespuesDeDias, zona });
    if (movidos.length) log.info(`Archivados ${movidos.length} posts antiguos.`);
  }
  return { creados, motivo: "ok" };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const config = cargarConfig();
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Falta la variable de entorno ANTHROPIC_API_KEY");
  const client = new Anthropic();
  const navegador = await abrirNavegador();
  try {
    const r = await ejecutarGenerar({
      config, fetchText: fetchTextReal, client, dryRun,
      render: (post, o) => renderizarPost(post, { ...o, navegador }),
    });
    console.log(`Listo: ${r.creados.length} borradores nuevos (${r.motivo})${dryRun ? " [dry-run]" : ""}.`);
  } finally {
    await navegador.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(`Error en generar: ${err.message}`); process.exit(1); });
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --test tests/generar.test.mjs`
Expected: `# pass 4`.

- [ ] **Step 5: Probar el dry-run real (sin Claude)**

Run: `node src/generar.mjs --dry-run`
Expected: falla con `Falta la variable de entorno ANTHROPIC_API_KEY` (correcto: el dry-run real necesita la clave; se prueba de verdad en la configuración manual, docs/CONFIGURACION.md).

- [ ] **Step 6: Commit**

```bash
git add src/generar.mjs tests/generar.test.mjs
git commit -m "feat: orquestador GENERAR con cupo diario, vistas y dry-run"
```

---

### Task 18: Orquestador REGENERAR (`src/regenerar.mjs`)

**Files:**
- Create: `src/regenerar.mjs`
- Test: `tests/regenerar.test.mjs`

**Interfaces:**
- Consumes: `leerPosts/escribirPost`, `imagenDesactualizada/renderOk/marcarError`, `versionPlantilla/RUTA_PLANTILLA/abrirNavegador/renderizarPost`, `cargarConfig`.
- Produces: `ejecutarRegenerar({ config, raiz, ahora, render, log, version }) → Promise<{ renderizados: string[], fallidos: string[] }>`; `main()`.

- [ ] **Step 1: Escribir los tests**

`tests/regenerar.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ejecutarRegenerar } from "../src/regenerar.mjs";
import { cargarConfig } from "../src/lib/config.mjs";
import { leerPosts, escribirPost } from "../src/lib/posts.mjs";
import { hashImagen, marcarError, aprobar } from "../src/lib/estados.mjs";

const cfg = cargarConfig("config.json");
const base = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));
const ahora = new Date("2026-09-07T21:00:00Z");
const imagenDe = (p, version = 1) => ({ ruta: `public/img/${p.id}.jpg`, url: `https://x/img/${p.id}.jpg`, hash: hashImagen(p, version), version, renderizada: ahora.toISOString() });
const log = { info: () => {}, warn: () => {} };

function dirCon(posts) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "regen-"));
  for (const p of posts) escribirPost(path.join(raiz, "posts"), p);
  return raiz;
}

test("re-renderiza solo los desactualizados, los sin imagen y los errores de render", async () => {
  const alDia = { ...base, id: base.id.slice(0, -4) + "0001", imagen: imagenDe({ ...base, id: base.id.slice(0, -4) + "0001" }) };
  const editado = { ...base, id: base.id.slice(0, -4) + "0002", titular: "Cambiado", imagen: imagenDe(base) };
  const sinImagen = { ...base, id: base.id.slice(0, -4) + "0003", imagen: null };
  const errRender = marcarError({ ...base, id: base.id.slice(0, -4) + "0004", imagen: imagenDe(base) }, { paso: "render", mensaje: "x" }, ahora.toISOString());
  const publicado = { ...base, id: base.id.slice(0, -4) + "0005", estado: "publicado", titular: "Otro", imagen: imagenDe(base), publicacion: { idMedia: "1", permalink: "u", fecha: ahora.toISOString() } };
  const raiz = dirCon([alDia, editado, sinImagen, errRender, publicado]);
  const renderizados = [];
  const render = async (p) => { renderizados.push(p.id); return imagenDe(p); };
  const r = await ejecutarRegenerar({ config: cfg, raiz, ahora, render, log, version: 1 });
  assert.deepEqual(r.renderizados.sort(), [editado.id, sinImagen.id, errRender.id].sort());
  assert.deepEqual(r.fallidos, []);
  const posts = Object.fromEntries(leerPosts(path.join(raiz, "posts")).map((p) => [p.id, p]));
  assert.equal(posts[errRender.id].estado, "borrador");
  assert.equal(posts[editado.id].imagen.hash, hashImagen(editado, 1));
});

test("una versión nueva de plantilla re-renderiza todos los activos", async () => {
  const p = { ...base, imagen: imagenDe(base, 1) };
  const raiz = dirCon([p]);
  const r = await ejecutarRegenerar({ config: cfg, raiz, ahora, render: async (x) => imagenDe(x, 2), log, version: 2 });
  assert.deepEqual(r.renderizados, [p.id]);
  assert.equal(leerPosts(path.join(raiz, "posts"))[0].imagen.version, 2);
});

test("si el render falla, el post programado queda en error y conserva su hora", async () => {
  const prog = aprobar({ ...base, imagen: null }, "2026-09-07T17:00:00-05:00", ahora.toISOString());
  const raiz = dirCon([prog]);
  const r = await ejecutarRegenerar({ config: cfg, raiz, ahora, render: async () => { throw new Error("falló"); }, log, version: 1 });
  assert.deepEqual(r.fallidos, [prog.id]);
  const p = leerPosts(path.join(raiz, "posts"))[0];
  assert.equal(p.estado, "error");
  assert.equal(p.programado, "2026-09-07T17:00:00-05:00");
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --test tests/regenerar.test.mjs`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar `src/regenerar.mjs`**

```js
// REGENERAR: vuelve a renderizar imágenes desactualizadas o fallidas.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cargarConfig } from "./lib/config.mjs";
import { leerPosts, escribirPost } from "./lib/posts.mjs";
import { imagenDesactualizada, renderOk, marcarError } from "./lib/estados.mjs";
import { versionPlantilla, RUTA_PLANTILLA, abrirNavegador, renderizarPost } from "./lib/render.mjs";

export async function ejecutarRegenerar({ config, raiz = process.cwd(), ahora = new Date(), render, log = console, version }) {
  const dir = path.join(raiz, "posts");
  const iso = ahora.toISOString();
  const actual = version ?? versionPlantilla(fs.readFileSync(path.join(raiz, RUTA_PLANTILLA), "utf8"));
  const activos = leerPosts(dir).filter((p) => ["borrador", "programado", "error"].includes(p.estado));
  const pendientes = activos.filter((p) => imagenDesactualizada(p, actual) || (p.estado === "error" && p.error?.paso === "render"));
  const resultado = { renderizados: [], fallidos: [] };
  if (!pendientes.length) { log.info("Ninguna imagen que regenerar."); return resultado; }
  for (const p of pendientes) {
    try {
      const imagen = await render(p, { config, raiz });
      escribirPost(dir, renderOk(p, imagen, iso));
      resultado.renderizados.push(p.id);
      log.info(`Imagen regenerada: ${p.id}`);
    } catch (err) {
      escribirPost(dir, marcarError(p, { paso: "render", mensaje: err.message }, iso));
      resultado.fallidos.push(p.id);
      log.warn(`Render falló para ${p.id}: ${err.message}`);
    }
  }
  return resultado;
}

async function main() {
  const config = cargarConfig();
  const navegador = await abrirNavegador();
  try {
    const r = await ejecutarRegenerar({ config, render: (post, o) => renderizarPost(post, { ...o, navegador }) });
    console.log(`Listo: ${r.renderizados.length} regeneradas, ${r.fallidos.length} fallidas.`);
  } finally {
    await navegador.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(`Error en regenerar: ${err.message}`); process.exit(1); });
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --test tests/regenerar.test.mjs`
Expected: `# pass 3`.

- [ ] **Step 5: Commit**

```bash
git add src/regenerar.mjs tests/regenerar.test.mjs
git commit -m "feat: orquestador REGENERAR por hash de imagen y versión de plantilla"
```

---

### Task 19: Orquestador PUBLICAR (`src/publicar.mjs`)

**Files:**
- Create: `src/publicar.mjs`
- Test: `tests/publicar.test.mjs`

**Interfaces:**
- Consumes: `leerPosts/escribirPost`, `marcarPublicado/marcarError/imagenDesactualizada`, `componerCaption/validarCaption`, `crearClienteInstagram`, `cargarConfig`, `claveDia`.
- Produces: `ejecutarPublicar({ config, raiz, ahora, ig, log, dryRun }) → Promise<{ publicados: string[], errores: string[], pospuestos: string[] }>`; `leerTokenInfo(raiz) → { vence: string | null }`; `main()`.
- Campo adicional en el post: `esperasImagen` (número de corridas en que la imagen aún no estaba pública; al llegar a 3 pasa a `error` de `render`).

- [ ] **Step 1: Escribir los tests**

`tests/publicar.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ejecutarPublicar } from "../src/publicar.mjs";
import { cargarConfig } from "../src/lib/config.mjs";
import { leerPosts, escribirPost } from "../src/lib/posts.mjs";
import { hashImagen, aprobar } from "../src/lib/estados.mjs";

const cfg = { ...cargarConfig("config.json"), pages: { baseUrl: "https://u.github.io/sinlinea" } };
const base = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));
const ahora = new Date("2026-09-07T22:10:00Z"); // 17:10 Panamá
const log = { info: () => {}, warn: () => {} };
const conImagen = (p) => ({ ...p, imagen: { ruta: `public/img/${p.id}.jpg`, url: `https://u.github.io/sinlinea/img/${p.id}.jpg`, hash: hashImagen(p, 1), version: 1, renderizada: "2026-09-07T20:00:00.000Z" } });

function raizCon(posts, tokenInfo = { vence: "2026-11-01" }) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "pub-"));
  fs.mkdirSync(path.join(raiz, "data"), { recursive: true });
  fs.writeFileSync(path.join(raiz, "data/token-info.json"), JSON.stringify(tokenInfo));
  for (const p of posts) escribirPost(path.join(raiz, "posts"), p);
  return raiz;
}

function igFalso({ cuota = { usados: 0, limite: 100 }, publica = true, fallo = null } = {}) {
  const llamadas = [];
  return {
    llamadas,
    cuota: async () => cuota,
    imagenPublica: async (u) => { llamadas.push(["head", u]); return publica; },
    publicarImagen: async ({ imageUrl, caption }) => {
      llamadas.push(["publicar", imageUrl, caption]);
      if (fallo) throw fallo;
      return { idMedia: "m1", permalink: "https://www.instagram.com/p/x/" };
    },
  };
}

test("publica los programados con hora cumplida, en orden, y guarda permalink", async () => {
  const a = conImagen(aprobar({ ...base, id: base.id.slice(0, -4) + "000a" }, "2026-09-07T17:00:00-05:00", "2026-09-07T20:00:00.000Z"));
  const b = conImagen(aprobar({ ...base, id: base.id.slice(0, -4) + "000b" }, "2026-09-07T14:30:00-05:00", "2026-09-07T20:00:00.000Z"));
  const futuro = conImagen(aprobar({ ...base, id: base.id.slice(0, -4) + "000c" }, "2026-09-07T19:30:00-05:00", "2026-09-07T20:00:00.000Z"));
  const raiz = raizCon([a, b, futuro]);
  const ig = igFalso();
  const r = await ejecutarPublicar({ config: cfg, raiz, ahora, ig, log });
  assert.deepEqual(r.publicados, [b.id, a.id]);
  assert.deepEqual(r.errores, []);
  const posts = Object.fromEntries(leerPosts(path.join(raiz, "posts")).map((p) => [p.id, p]));
  assert.equal(posts[a.id].estado, "publicado");
  assert.equal(posts[a.id].publicacion.permalink, "https://www.instagram.com/p/x/");
  assert.equal(posts[futuro.id].estado, "programado");
  const caption = ig.llamadas.find((l) => l[0] === "publicar")[2];
  assert.match(caption, /Fuente: La Prensa/);
  assert.match(caption, /#SinLínea/);
});

test("imagen no pública: pospone hasta 3 veces y luego error de render", async () => {
  const a = conImagen(aprobar({ ...base }, "2026-09-07T17:00:00-05:00", "2026-09-07T20:00:00.000Z"));
  const raiz = raizCon([a]);
  for (let i = 1; i <= 2; i++) {
    const r = await ejecutarPublicar({ config: cfg, raiz, ahora, ig: igFalso({ publica: false }), log });
    assert.deepEqual(r.pospuestos, [a.id]);
    assert.equal(leerPosts(path.join(raiz, "posts"))[0].esperasImagen, i);
  }
  const r3 = await ejecutarPublicar({ config: cfg, raiz, ahora, ig: igFalso({ publica: false }), log });
  assert.deepEqual(r3.errores, [a.id]);
  assert.equal(leerPosts(path.join(raiz, "posts"))[0].error.paso, "render");
});

test("error de la API deja el post en error de instagram con el mensaje", async () => {
  const a = conImagen(aprobar({ ...base }, "2026-09-07T17:00:00-05:00", "2026-09-07T20:00:00.000Z"));
  const raiz = raizCon([a]);
  const r = await ejecutarPublicar({ config: cfg, raiz, ahora, ig: igFalso({ fallo: new Error("Media posted before business account conversion") }), log });
  assert.deepEqual(r.errores, [a.id]);
  const p = leerPosts(path.join(raiz, "posts"))[0];
  assert.equal(p.estado, "error");
  assert.equal(p.error.paso, "instagram");
  assert.match(p.error.mensaje, /business account/);
});

test("sin cuota no publica; dry-run no publica; baseUrl sin configurar lanza; token por vencer avisa", async () => {
  const a = conImagen(aprobar({ ...base }, "2026-09-07T17:00:00-05:00", "2026-09-07T20:00:00.000Z"));
  let raiz = raizCon([a]);
  const r = await ejecutarPublicar({ config: cfg, raiz, ahora, ig: igFalso({ cuota: { usados: 100, limite: 100 } }), log });
  assert.deepEqual(r.pospuestos, [a.id]);
  raiz = raizCon([a]);
  const ig = igFalso();
  const r2 = await ejecutarPublicar({ config: cfg, raiz, ahora, ig, log, dryRun: true });
  assert.deepEqual(r2.publicados, []);
  assert.ok(!ig.llamadas.some((l) => l[0] === "publicar"));
  await assert.rejects(() => ejecutarPublicar({ config: cargarConfig("config.json"), raiz, ahora, ig, log }), /CAMBIAR/);
  raiz = raizCon([a], { vence: "2026-09-10" });
  const avisos = [];
  await ejecutarPublicar({ config: cfg, raiz, ahora, ig: igFalso(), log: { info: () => {}, warn: (m) => avisos.push(m) } });
  assert.ok(avisos.some((m) => /token.*vence/i.test(m)));
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --test tests/publicar.test.mjs`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar `src/publicar.mjs`**

```js
// PUBLICAR: posts programados con hora cumplida → Instagram.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cargarConfig } from "./lib/config.mjs";
import { leerPosts, escribirPost } from "./lib/posts.mjs";
import { marcarPublicado, marcarError, imagenDesactualizada } from "./lib/estados.mjs";
import { componerCaption, validarCaption } from "./lib/caption.mjs";
import { crearClienteInstagram } from "./lib/instagram.mjs";
import { claveDia } from "./lib/fechas.mjs";

const MAX_ESPERAS_IMAGEN = 3;

export function leerTokenInfo(raiz) {
  const ruta = path.join(raiz, "data", "token-info.json");
  if (!fs.existsSync(ruta)) return { vence: null };
  try { return JSON.parse(fs.readFileSync(ruta, "utf8")); } catch { return { vence: null }; }
}

function avisarToken(raiz, ahora, config, log) {
  const info = leerTokenInfo(raiz);
  if (!info.vence) { log.warn("data/token-info.json no tiene fecha de vencimiento del token de Instagram."); return; }
  const dias = Math.floor((Date.parse(info.vence) - Date.parse(claveDia(ahora, config.zonaHoraria))) / 86400000);
  if (dias < 7) log.warn(`El token de Instagram vence en ${dias} días (${info.vence}); revisa renovar-token.yml.`);
}

export async function ejecutarPublicar({ config, raiz = process.cwd(), ahora = new Date(), ig, log = console, dryRun = false }) {
  if (/CAMBIAR/.test(config.pages.baseUrl)) throw new Error("config.json: pages.baseUrl todavía tiene el valor CAMBIAR");
  const dir = path.join(raiz, "posts");
  const iso = ahora.toISOString();
  const resumen = { publicados: [], errores: [], pospuestos: [] };
  const listos = leerPosts(dir)
    .filter((p) => p.estado === "programado" && Date.parse(p.programado) <= ahora.getTime())
    .sort((a, b) => Date.parse(a.programado) - Date.parse(b.programado));
  avisarToken(raiz, ahora, config, log);
  if (!listos.length) { log.info("Nada que publicar."); return resumen; }

  const q = await ig.cuota();
  let disponibles = q.limite - q.usados;
  for (const p of listos) {
    if (disponibles <= 0) { log.warn(`Cuota de Instagram agotada (${q.usados}/${q.limite}); ${p.id} espera.`); resumen.pospuestos.push(p.id); continue; }
    if (!p.imagen?.url || imagenDesactualizada(p)) {
      log.warn(`${p.id}: la imagen no está lista (falta o está desactualizada); se espera al re-render.`);
      resumen.pospuestos.push(p.id);
      continue;
    }
    if (!(await ig.imagenPublica(p.imagen.url))) {
      const esperas = (p.esperasImagen || 0) + 1;
      if (esperas >= MAX_ESPERAS_IMAGEN) {
        escribirPost(dir, marcarError(p, { paso: "render", mensaje: `La imagen ${p.imagen.url} no está disponible públicamente tras ${esperas} intentos` }, iso));
        resumen.errores.push(p.id);
      } else {
        escribirPost(dir, { ...p, esperasImagen: esperas, actualizado: iso });
        resumen.pospuestos.push(p.id);
      }
      log.warn(`${p.id}: imagen aún no pública (intento ${esperas}/${MAX_ESPERAS_IMAGEN}).`);
      continue;
    }
    const caption = componerCaption({ caption: p.caption, medio: p.fuente.medio, hashtags: p.hashtags });
    const v = validarCaption(caption);
    if (!v.ok) {
      escribirPost(dir, marcarError(p, { paso: "instagram", mensaje: v.errores.join(" ") }, iso));
      resumen.errores.push(p.id);
      continue;
    }
    if (dryRun) { log.info(`[dry-run] Publicaría ${p.id}: ${p.titular}`); continue; }
    try {
      const r = await ig.publicarImagen({ imageUrl: p.imagen.url, caption });
      escribirPost(dir, marcarPublicado(p, r, iso));
      resumen.publicados.push(p.id);
      disponibles -= 1;
      log.info(`Publicado ${p.id}: ${r.permalink}`);
    } catch (err) {
      escribirPost(dir, marcarError(p, { paso: "instagram", mensaje: err.message }, iso));
      resumen.errores.push(p.id);
      log.warn(`Instagram rechazó ${p.id}: ${err.message}`);
    }
  }
  return resumen;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const config = cargarConfig();
  let ig;
  if (dryRun && !process.env.IG_ACCESS_TOKEN) {
    ig = { cuota: async () => ({ usados: 0, limite: 100 }), imagenPublica: async () => true, publicarImagen: async () => { throw new Error("no aplica en dry-run"); } };
  } else {
    for (const k of ["IG_ACCESS_TOKEN", "IG_USER_ID"]) if (!process.env[k]) throw new Error(`Falta la variable de entorno ${k}`);
    ig = crearClienteInstagram({ token: process.env.IG_ACCESS_TOKEN, usuarioId: process.env.IG_USER_ID, apiVersion: config.instagram.apiVersion });
  }
  const r = await ejecutarPublicar({ config, ig, dryRun });
  console.log(`Listo: ${r.publicados.length} publicados, ${r.errores.length} con error, ${r.pospuestos.length} pospuestos${dryRun ? " [dry-run]" : ""}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(`Error en publicar: ${err.message}`); process.exit(1); });
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --test tests/publicar.test.mjs`
Expected: `# pass 4`.

- [ ] **Step 5: Commit**

```bash
git add src/publicar.mjs tests/publicar.test.mjs
git commit -m "feat: orquestador PUBLICAR con cuota, verificación de imagen y aviso de token"
```

---

### Task 20: Renovación del token (`src/renovar-token.mjs`)

**Files:**
- Create: `src/renovar-token.mjs`
- Test: `tests/renovar-token.test.mjs`

**Interfaces:**
- Consumes: `crearClienteInstagram().refrescarToken`, `claveDia`, `cargarConfig`.
- Produces: `ejecutarRenovar({ raiz, ahora, ig, log, zona }) → Promise<{ vence }>`: escribe `data/token-info.json` `{ "vence": "AAAA-MM-DD", "renovado": "AAAA-MM-DD" }` y `temp/nuevo-token.txt` con el token nuevo (para que el workflow lo suba como secreto); `main()` imprime `::add-mask::<token>` antes de cualquier otro log.

- [ ] **Step 1: Escribir los tests**

`tests/renovar-token.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ejecutarRenovar } from "../src/renovar-token.mjs";

test("escribe token-info.json con la fecha de vencimiento y el token en temp/", async () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "tok-"));
  fs.mkdirSync(path.join(raiz, "data"));
  const ig = { refrescarToken: async () => ({ token: "NUEVO123", expiraEnSegundos: 60 * 86400 }) };
  const r = await ejecutarRenovar({ raiz, ahora: new Date("2026-09-07T15:00:00Z"), ig, log: { info: () => {} } });
  assert.equal(r.vence, "2026-11-06");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(raiz, "data/token-info.json"), "utf8")), { vence: "2026-11-06", renovado: "2026-09-07" });
  assert.equal(fs.readFileSync(path.join(raiz, "temp/nuevo-token.txt"), "utf8"), "NUEVO123");
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --test tests/renovar-token.test.mjs`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar `src/renovar-token.mjs`**

```js
// Renueva el token de larga duración de Instagram y registra su vencimiento.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cargarConfig } from "./lib/config.mjs";
import { crearClienteInstagram } from "./lib/instagram.mjs";
import { claveDia, ZONA_PANAMA } from "./lib/fechas.mjs";

export async function ejecutarRenovar({ raiz = process.cwd(), ahora = new Date(), ig, log = console, zona = ZONA_PANAMA }) {
  const { token, expiraEnSegundos } = await ig.refrescarToken();
  const vence = claveDia(new Date(ahora.getTime() + expiraEnSegundos * 1000), zona);
  const info = { vence, renovado: claveDia(ahora, zona) };
  fs.writeFileSync(path.join(raiz, "data", "token-info.json"), JSON.stringify(info, null, 2) + "\n");
  fs.mkdirSync(path.join(raiz, "temp"), { recursive: true });
  fs.writeFileSync(path.join(raiz, "temp", "nuevo-token.txt"), token);
  log.info(`Token de Instagram renovado; vence el ${vence}.`);
  return { vence };
}

async function main() {
  const config = cargarConfig();
  if (!process.env.IG_ACCESS_TOKEN) throw new Error("Falta la variable de entorno IG_ACCESS_TOKEN");
  const ig = crearClienteInstagram({ token: process.env.IG_ACCESS_TOKEN, usuarioId: process.env.IG_USER_ID || "", apiVersion: config.instagram.apiVersion });
  const original = ig.refrescarToken;
  ig.refrescarToken = async () => { const r = await original(); console.log(`::add-mask::${r.token}`); return r; };
  await ejecutarRenovar({ ig });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(`Error al renovar el token: ${err.message}`); process.exit(1); });
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --test tests/renovar-token.test.mjs`
Expected: `# pass 1`.

- [ ] **Step 5: Commit**

```bash
git add src/renovar-token.mjs tests/renovar-token.test.mjs
git commit -m "feat: renovación del token de Instagram con registro de vencimiento"
```

---

### Task 21: Construcción de `dist/` y servidor de previsualización (`src/build.mjs`, `src/serve.mjs`)

**Files:**
- Create: `src/build.mjs`, `src/serve.mjs`
- Test: `tests/build.test.mjs`, `tests/serve.test.mjs`

**Interfaces:**
- Consumes: `construirHtml` (render.mjs), `leerPosts/escribirPost/validarPost` (posts.mjs), `cargarConfig`.
- Produces:
  - `construirDist({ raiz = process.cwd(), destino = "dist" }) → string` (ruta de `dist/`). Copia `public/*` a la raíz de `dist/` (así las imágenes quedan en `/img/`), `panel/*` a `dist/panel/`, los módulos isomorfos `estados.mjs, caption.mjs, franjas.mjs, fechas.mjs` a `dist/panel/lib/`, y escribe `dist/index.html` (redirección a `panel/`) y `dist/.nojekyll`. Omite archivos que empiezan por `.`.
  - `crearServidor({ raiz = process.cwd() }) → http.Server` con rutas: `GET /` (índice), `GET /vista/<variante>` (plantilla con el post de ejemplo), `GET /assets/*`, `GET /img/*` (desde `public/img`), `GET /panel/` y `GET /panel/*`, `GET /panel/lib/*` (desde `src/lib`), `GET /api/posts`, `PUT /api/posts/<id>`, `GET /api/token-info`. Puerto `process.env.PORT || 4173`.

- [ ] **Step 1: Escribir los tests**

`tests/build.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { construirDist } from "../src/build.mjs";

test("construirDist copia imágenes, panel, módulos isomorfos e índice", () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "dist-"));
  fs.mkdirSync(path.join(raiz, "public/img"), { recursive: true });
  fs.writeFileSync(path.join(raiz, "public/img/a.jpg"), "jpg");
  fs.writeFileSync(path.join(raiz, "public/img/.gitkeep"), "");
  fs.mkdirSync(path.join(raiz, "panel"), { recursive: true });
  fs.writeFileSync(path.join(raiz, "panel/index.html"), "<p>panel</p>");
  fs.mkdirSync(path.join(raiz, "src/lib"), { recursive: true });
  for (const f of ["estados.mjs", "caption.mjs", "franjas.mjs", "fechas.mjs"]) fs.copyFileSync(`src/lib/${f}`, path.join(raiz, "src/lib", f));
  const dist = construirDist({ raiz });
  assert.ok(fs.existsSync(path.join(dist, "img/a.jpg")));
  assert.ok(!fs.existsSync(path.join(dist, "img/.gitkeep")));
  assert.ok(fs.existsSync(path.join(dist, "panel/index.html")));
  assert.ok(fs.existsSync(path.join(dist, "panel/lib/estados.mjs")));
  assert.ok(fs.existsSync(path.join(dist, ".nojekyll")));
  assert.match(fs.readFileSync(path.join(dist, "index.html"), "utf8"), /url=panel\//);
});
```

`tests/serve.test.mjs`:
```js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { crearServidor } from "../src/serve.mjs";

let servidor, base, raiz;
before(async () => {
  raiz = fs.mkdtempSync(path.join(os.tmpdir(), "serve-"));
  for (const d of ["posts", "data", "templates", "panel", "src/lib", "public/img", "assets/fonts", "tests/fixtures"]) fs.mkdirSync(path.join(raiz, d), { recursive: true });
  fs.copyFileSync("config.json", path.join(raiz, "config.json"));
  fs.copyFileSync("templates/post.html", path.join(raiz, "templates/post.html"));
  fs.copyFileSync("tests/fixtures/post-ejemplo.json", path.join(raiz, "tests/fixtures/post-ejemplo.json"));
  fs.copyFileSync("tests/fixtures/post-ejemplo.json", path.join(raiz, "posts/2026-09-07-1420-la-prensa-a1b2.json"));
  fs.writeFileSync(path.join(raiz, "data/token-info.json"), '{ "vence": "2026-11-01" }');
  fs.writeFileSync(path.join(raiz, "panel/index.html"), "<p>panel</p>");
  fs.copyFileSync("src/lib/estados.mjs", path.join(raiz, "src/lib/estados.mjs"));
  servidor = crearServidor({ raiz });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
after(() => servidor.close());

test("sirve la vista de la plantilla con la variante pedida", async () => {
  const html = await (await fetch(`${base}/vista/rojo`)).text();
  assert.match(html, /<base href="\/">/);
  assert.match(html, /"variante":"rojo"/);
});

test("api de posts: lista, actualiza y rechaza inválidos; token-info", async () => {
  const lista = await (await fetch(`${base}/api/posts`)).json();
  assert.equal(lista.length, 1);
  const post = { ...lista[0], estado: "descartado" };
  const ok = await fetch(`${base}/api/posts/${post.id}`, { method: "PUT", body: JSON.stringify(post), headers: { "content-type": "application/json" } });
  assert.equal(ok.status, 200);
  assert.equal(JSON.parse(fs.readFileSync(path.join(raiz, `posts/${post.id}.json`), "utf8")).estado, "descartado");
  const malo = await fetch(`${base}/api/posts/${post.id}`, { method: "PUT", body: JSON.stringify({ ...post, estado: "x" }), headers: { "content-type": "application/json" } });
  assert.equal(malo.status, 400);
  assert.deepEqual(await (await fetch(`${base}/api/token-info`)).json(), { vence: "2026-11-01" });
});

test("sirve el panel, sus módulos desde src/lib y bloquea rutas fuera de la raíz", async () => {
  assert.match(await (await fetch(`${base}/panel/`)).text(), /panel/);
  const js = await fetch(`${base}/panel/lib/estados.mjs`);
  assert.equal(js.status, 200);
  assert.match(js.headers.get("content-type"), /javascript/);
  assert.equal((await fetch(`${base}/assets/../config.json`)).status, 404);
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `node --test tests/build.test.mjs tests/serve.test.mjs`
Expected: FAIL — módulos no encontrados.

- [ ] **Step 3: Implementar `src/build.mjs`**

```js
// Construye dist/ para GitHub Pages: imágenes públicas + panel + módulos isomorfos.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const MODULOS_ISOMORFOS = ["estados.mjs", "caption.mjs", "franjas.mjs", "fechas.mjs"];

function copiarDir(origen, destino) {
  if (!fs.existsSync(origen)) return;
  fs.mkdirSync(destino, { recursive: true });
  for (const entrada of fs.readdirSync(origen, { withFileTypes: true })) {
    if (entrada.name.startsWith(".")) continue;
    const o = path.join(origen, entrada.name);
    const d = path.join(destino, entrada.name);
    if (entrada.isDirectory()) copiarDir(o, d);
    else fs.copyFileSync(o, d);
  }
}

export function construirDist({ raiz = process.cwd(), destino = "dist" } = {}) {
  const dist = path.join(raiz, destino);
  fs.rmSync(dist, { recursive: true, force: true });
  fs.mkdirSync(dist, { recursive: true });
  copiarDir(path.join(raiz, "public"), dist);
  copiarDir(path.join(raiz, "panel"), path.join(dist, "panel"));
  fs.mkdirSync(path.join(dist, "panel", "lib"), { recursive: true });
  for (const f of MODULOS_ISOMORFOS) fs.copyFileSync(path.join(raiz, "src", "lib", f), path.join(dist, "panel", "lib", f));
  fs.writeFileSync(path.join(dist, "index.html"), '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=panel/"><title>Sin Línea</title><a href="panel/">Panel</a>\n');
  fs.writeFileSync(path.join(dist, ".nojekyll"), "");
  return dist;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dist = construirDist();
  console.log(`dist/ construido en ${dist}`);
}
```

- [ ] **Step 4: Implementar `src/serve.mjs`**

```js
// Servidor local de previsualización: plantilla, panel (modo local) y API de posts.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cargarConfig } from "./lib/config.mjs";
import { leerPosts, escribirPost, validarPost } from "./lib/posts.mjs";
import { construirHtml, RUTA_PLANTILLA, RUTA_LOGO } from "./lib/render.mjs";
import { VARIANTES } from "./lib/estados.mjs";

const TIPOS = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png",
  ".ttf": "font/ttf", ".svg": "image/svg+xml",
};

function responder(res, codigo, cuerpo, tipo = "text/plain; charset=utf-8") {
  res.writeHead(codigo, { "content-type": tipo, "cache-control": "no-store" });
  res.end(cuerpo);
}

function servirArchivo(res, base, relativo) {
  const ruta = path.resolve(base, relativo);
  if (!ruta.startsWith(path.resolve(base) + path.sep) && ruta !== path.resolve(base)) return responder(res, 404, "No encontrado");
  if (!fs.existsSync(ruta) || fs.statSync(ruta).isDirectory()) return responder(res, 404, "No encontrado");
  responder(res, 200, fs.readFileSync(ruta), TIPOS[path.extname(ruta)] || "application/octet-stream");
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let datos = "";
    req.on("data", (c) => { datos += c; });
    req.on("end", () => resolve(datos));
    req.on("error", reject);
  });
}

export function crearServidor({ raiz = process.cwd() } = {}) {
  const config = cargarConfig(path.join(raiz, "config.json"));
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const p = decodeURIComponent(url.pathname);
    try {
      if (req.method === "GET" && p === "/") {
        const enlaces = VARIANTES.map((v) => `<li><a href="/vista/${v}">Plantilla · ${v}</a></li>`).join("");
        return responder(res, 200, `<!doctype html><meta charset="utf-8"><title>Sin Línea · previsualización</title><h1>Sin Línea</h1><ul>${enlaces}<li><a href="/panel/">Panel (modo local)</a></li></ul>`, TIPOS[".html"]);
      }
      if (req.method === "GET" && p.startsWith("/vista/")) {
        const variante = p.slice("/vista/".length);
        if (!VARIANTES.includes(variante)) return responder(res, 404, "Variante desconocida");
        const ejemplo = JSON.parse(fs.readFileSync(path.join(raiz, "tests", "fixtures", "post-ejemplo.json"), "utf8"));
        const plantilla = fs.readFileSync(path.join(raiz, RUTA_PLANTILLA), "utf8");
        const logoUrl = fs.existsSync(path.join(raiz, RUTA_LOGO)) ? RUTA_LOGO : null;
        return responder(res, 200, construirHtml({ ...ejemplo, variante }, config, { plantilla, baseHref: "/", logoUrl }), TIPOS[".html"]);
      }
      if (req.method === "GET" && p.startsWith("/assets/")) return servirArchivo(res, path.join(raiz, "assets"), p.slice("/assets/".length));
      if (req.method === "GET" && p.startsWith("/img/")) return servirArchivo(res, path.join(raiz, "public", "img"), p.slice("/img/".length));
      if (req.method === "GET" && p.startsWith("/panel/lib/")) return servirArchivo(res, path.join(raiz, "src", "lib"), p.slice("/panel/lib/".length));
      if (req.method === "GET" && (p === "/panel" || p === "/panel/")) return servirArchivo(res, path.join(raiz, "panel"), "index.html");
      if (req.method === "GET" && p.startsWith("/panel/")) return servirArchivo(res, path.join(raiz, "panel"), p.slice("/panel/".length));
      if (req.method === "GET" && p === "/api/posts") return responder(res, 200, JSON.stringify(leerPosts(path.join(raiz, "posts"))), TIPOS[".json"]);
      if (req.method === "GET" && p === "/api/token-info") return servirArchivo(res, path.join(raiz, "data"), "token-info.json");
      if (req.method === "PUT" && p.startsWith("/api/posts/")) {
        const id = p.slice("/api/posts/".length);
        let post;
        try { post = validarPost(JSON.parse(await leerCuerpo(req))); } catch (err) { return responder(res, 400, JSON.stringify({ error: err.message }), TIPOS[".json"]); }
        if (post.id !== id) return responder(res, 400, JSON.stringify({ error: "El id no coincide" }), TIPOS[".json"]);
        escribirPost(path.join(raiz, "posts"), post);
        return responder(res, 200, JSON.stringify({ ok: true }), TIPOS[".json"]);
      }
      return responder(res, 404, "No encontrado");
    } catch (err) {
      return responder(res, 500, `Error: ${err.message}`);
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const puerto = Number(process.env.PORT) || 4173;
  crearServidor().listen(puerto, () => console.log(`Previsualización en http://localhost:${puerto}/`));
}
```

- [ ] **Step 5: Correr los tests para verificar que pasan**

Run: `node --test tests/build.test.mjs tests/serve.test.mjs`
Expected: `# pass 4`. (El test de `serve` para `/panel/` pasa con el `index.html` mínimo del test; el panel real llega en la Task 22.)

- [ ] **Step 6: Commit**

```bash
git add src/build.mjs src/serve.mjs tests/build.test.mjs tests/serve.test.mjs
git commit -m "feat: construcción de dist/ y servidor local de previsualización"
```

---

### Task 22: Panel de aprobación (`panel/`)

**Files:**
- Create: `panel/index.html`, `panel/styles.css`, `panel/almacen.mjs`, `panel/app.js`
- Test: `tests/almacen.test.mjs` (unitario, funciones puras), `tests/panel.e2e.mjs` (Playwright contra `serve.mjs`)

**Interfaces:**
- Consumes (vía `./lib/*.mjs`, servidos por `serve.mjs` en local y copiados por `build.mjs` en Pages): `estados.mjs` (`aprobar, descartar, quitarDeCola, reintentar, editarTexto, imagenDesactualizada, CATEGORIAS, VARIANTES`), `caption.mjs` (`componerCaption, validarCaption, normalizarHashtags, LIMITES`), `franjas.mjs` (`siguienteFranjaLibre, franjasOcupadas, choca`), `fechas.mjs` (`claveDia, isoDesdeClave, horaMinutoDeIso, partesZona`).
- Produces (`panel/almacen.mjs`):
  - `base64Utf8(texto) → string`, `desdeBase64Utf8(b64) → string`
  - `deducirRepo(location) → { owner, repo } | null` (de `<owner>.github.io/<repo>/panel/`)
  - `crearAlmacenLocal() → { modo: "local", listar(), guardar(post), tokenInfo() }`
  - `crearAlmacenGitHub({ token, owner, repo, rama = "main" }) → { modo: "github", listar(), leerUno(id), guardar(post, sha), tokenInfo() }`; `listar()` devuelve `[{ post, sha }]`; `guardar` devuelve el `sha` nuevo o lanza `ErrorConflicto` (con `.actual = { post, sha }`) en 409/422.
- El panel guarda `sinlinea.token`, `sinlinea.owner`, `sinlinea.repo` en `localStorage`.

- [ ] **Step 1: Escribir el test unitario `tests/almacen.test.mjs`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { base64Utf8, desdeBase64Utf8, deducirRepo } from "../panel/almacen.mjs";

test("base64 ida y vuelta con tildes y ñ", () => {
  const t = '{"titular":"Panamá ñ ¿qué?"}';
  assert.equal(desdeBase64Utf8(base64Utf8(t)), t);
});

test("deducirRepo lee owner y repo de la URL de Pages", () => {
  assert.deepEqual(deducirRepo({ hostname: "luis.github.io", pathname: "/sinlinea/panel/" }), { owner: "luis", repo: "sinlinea" });
  assert.equal(deducirRepo({ hostname: "localhost", pathname: "/panel/" }), null);
  assert.equal(deducirRepo({ hostname: "www.sinlinea.news", pathname: "/panel/" }), null);
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --test tests/almacen.test.mjs`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar `panel/almacen.mjs`**

```js
// Acceso a los posts: modo local (serve.mjs) o GitHub (API de contenidos).
export function base64Utf8(texto) {
  const bytes = new TextEncoder().encode(texto);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function desdeBase64Utf8(b64) {
  const bin = atob(String(b64).replace(/\n/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function deducirRepo(loc) {
  const m = String(loc.hostname).match(/^([^.]+)\.github\.io$/);
  if (!m) return null;
  const repo = String(loc.pathname).split("/").filter(Boolean)[0];
  return repo ? { owner: m[1], repo } : null;
}

export class ErrorConflicto extends Error {
  constructor(actual) { super("El post cambió en el repositorio; se recargó la versión nueva."); this.actual = actual; }
}

export function crearAlmacenLocal() {
  return {
    modo: "local",
    async listar() {
      const posts = await (await fetch("/api/posts")).json();
      return posts.map((post) => ({ post, sha: null }));
    },
    async leerUno(id) {
      const todos = await this.listar();
      return todos.find((x) => x.post.id === id) || null;
    },
    async guardar(post) {
      const res = await fetch(`/api/posts/${post.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(post) });
      if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
      return null;
    },
    async tokenInfo() {
      try { return await (await fetch("/api/token-info")).json(); } catch { return { vence: null }; }
    },
  };
}

export function crearAlmacenGitHub({ token, owner, repo, rama = "main" }) {
  const api = `https://api.github.com/repos/${owner}/${repo}`;
  const cabeceras = (extra = {}) => ({
    Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra,
  });
  async function leerArchivo(ruta) {
    const res = await fetch(`${api}/contents/${ruta}?ref=${rama}`, { headers: cabeceras() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub respondió ${res.status} al leer ${ruta}`);
    const j = await res.json();
    return { texto: desdeBase64Utf8(j.content), sha: j.sha };
  }
  return {
    modo: "github",
    async listar() {
      const res = await fetch(`${api}/contents/posts?ref=${rama}`, { headers: cabeceras() });
      if (!res.ok) throw new Error(`GitHub respondió ${res.status} al listar posts (¿token válido?)`);
      const entradas = (await res.json()).filter((e) => e.type === "file" && e.name.endsWith(".json"));
      return Promise.all(entradas.map(async (e) => {
        const r = await fetch(`${api}/contents/posts/${e.name}?ref=${rama}`, { headers: cabeceras({ Accept: "application/vnd.github.raw+json" }) });
        if (!r.ok) throw new Error(`GitHub respondió ${r.status} al leer ${e.name}`);
        return { post: await r.json(), sha: e.sha };
      }));
    },
    async leerUno(id) {
      const a = await leerArchivo(`posts/${id}.json`);
      return a ? { post: JSON.parse(a.texto), sha: a.sha } : null;
    },
    async guardar(post, sha) {
      const res = await fetch(`${api}/contents/posts/${post.id}.json`, {
        method: "PUT", headers: cabeceras({ "content-type": "application/json" }),
        body: JSON.stringify({ message: `panel: ${post.estado} ${post.id}`, content: base64Utf8(JSON.stringify(post, null, 2) + "\n"), sha, branch: rama }),
      });
      if (res.status === 409 || res.status === 422) throw new ErrorConflicto(await this.leerUno(post.id));
      if (!res.ok) throw new Error(`GitHub respondió ${res.status} al guardar (¿el token tiene permiso de escritura?)`);
      return (await res.json()).content.sha;
    },
    async tokenInfo() {
      try { const a = await leerArchivo("data/token-info.json"); return a ? JSON.parse(a.texto) : { vence: null }; } catch { return { vence: null }; }
    },
  };
}
```

- [ ] **Step 4: Correr el test unitario para verificar que pasa**

Run: `node --test tests/almacen.test.mjs`
Expected: `# pass 2`.

- [ ] **Step 5: Crear `panel/index.html`**

```html
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Sin Línea · Panel</title>
<link rel="stylesheet" href="styles.css">
</head>
<body>
<header class="cabecera">
  <div class="marca"><span class="marca-sin">SIN</span><span class="marca-linea">LÍNEA</span> <span class="marca-sub">panel</span></div>
  <div class="estado-token" id="estado-token" hidden></div>
  <button class="boton-texto" id="boton-config" type="button">Configurar</button>
</header>

<section class="config" id="config" hidden>
  <h2>Conexión con GitHub</h2>
  <p>Pega un token fino de GitHub limitado al repositorio del panel, con permiso <strong>Contents: lectura y escritura</strong>. Se guarda solo en este navegador.</p>
  <label>Usuario u organización <input id="campo-owner" autocomplete="off"></label>
  <label>Repositorio <input id="campo-repo" autocomplete="off"></label>
  <label>Token <input id="campo-token" type="password" autocomplete="off"></label>
  <div class="acciones">
    <button class="boton primario" id="boton-guardar-config" type="button">Guardar y conectar</button>
    <button class="boton" id="boton-borrar-config" type="button">Borrar token</button>
  </div>
</section>

<nav class="pestanas" id="pestanas"></nav>
<p class="aviso" id="aviso" hidden></p>
<main class="lista" id="lista"><p class="vacio">Cargando…</p></main>

<dialog id="dialogo-hora">
  <form method="dialog">
    <h3>Programar publicación</h3>
    <label>Fecha <input type="date" id="hora-fecha" required></label>
    <label>Hora <input type="time" id="hora-hora" required step="300"></label>
    <p class="nota" id="hora-nota"></p>
    <div class="acciones">
      <button class="boton" value="cancelar" type="submit">Cancelar</button>
      <button class="boton primario" value="ok" type="submit" id="hora-confirmar">Confirmar</button>
    </div>
  </form>
</dialog>

<script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 6: Crear `panel/styles.css`**

```css
:root { --amarillo: #FFD400; --rojo: #E30613; --negro: #111111; --gris: #f3f3f1; --gris-2: #d9d9d4; --texto: #1b1b1b; --ok: #1a7f37; --alerta: #b54708; }
* { box-sizing: border-box; }
html { color-scheme: light; }
body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: var(--gris); color: var(--texto); }
.cabecera { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: var(--amarillo); border-bottom: 4px solid var(--rojo); }
.marca { font-weight: 900; letter-spacing: -0.02em; font-size: 22px; flex: 1; }
.marca-sin { color: var(--rojo); } .marca-linea { color: var(--negro); } .marca-sub { font-weight: 500; font-size: 14px; opacity: 0.7; }
.estado-token { font-size: 12px; padding: 4px 8px; border-radius: 999px; background: #fff; }
.estado-token.alerta { background: var(--rojo); color: #fff; }
.boton-texto { background: none; border: 0; font: inherit; text-decoration: underline; cursor: pointer; }
.config { margin: 12px; padding: 14px; background: #fff; border-radius: 12px; }
.config label { display: block; margin: 10px 0; font-size: 14px; }
.config input { display: block; width: 100%; margin-top: 4px; padding: 10px; font-size: 16px; border: 1px solid var(--gris-2); border-radius: 8px; }
.pestanas { display: flex; gap: 6px; padding: 10px 12px; overflow-x: auto; }
.pestanas button { flex: 0 0 auto; padding: 8px 12px; border-radius: 999px; border: 1px solid var(--gris-2); background: #fff; font: inherit; font-size: 14px; }
.pestanas button.activa { background: var(--negro); color: var(--amarillo); border-color: var(--negro); }
.aviso { margin: 0 12px 8px; padding: 10px; border-radius: 8px; background: #fff3cd; color: var(--alerta); font-size: 14px; }
.lista { display: grid; gap: 14px; padding: 0 12px 40px; max-width: 720px; margin: 0 auto; }
.vacio { text-align: center; opacity: 0.6; padding: 40px 0; }
.tarjeta { background: #fff; border-radius: 14px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.tarjeta img { display: block; width: 100%; aspect-ratio: 4 / 5; object-fit: cover; background: #ddd; }
.sin-imagen { aspect-ratio: 4 / 5; display: grid; place-items: center; background: #e9e9e6; color: #666; font-size: 14px; }
.tarjeta .cuerpo { padding: 12px 14px 14px; display: grid; gap: 10px; }
.meta { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 13px; }
.chip { background: var(--rojo); color: #fff; padding: 3px 8px; font-weight: 700; letter-spacing: 0.06em; font-size: 12px; }
.badge { padding: 3px 8px; border-radius: 999px; background: var(--gris); font-size: 12px; }
.badge.programado { background: #dbeafe; } .badge.publicado { background: #dcfce7; } .badge.error { background: #fee2e2; } .badge.descartado { background: #eee; }
.regenerando { color: var(--alerta); font-size: 12px; }
.tarjeta label { display: block; font-size: 12px; color: #555; }
.tarjeta textarea, .tarjeta input, .tarjeta select { display: block; width: 100%; margin-top: 3px; padding: 8px; font: inherit; font-size: 15px; border: 1px solid var(--gris-2); border-radius: 8px; }
.tarjeta textarea { resize: vertical; min-height: 44px; }
.fila { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.contador { font-size: 12px; color: #666; text-align: right; }
.contador.excede { color: var(--rojo); font-weight: 700; }
.error-texto { background: #fee2e2; color: #991b1b; padding: 8px; border-radius: 8px; font-size: 13px; }
.acciones { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
.boton { padding: 10px 14px; border-radius: 10px; border: 1px solid var(--gris-2); background: #fff; font: inherit; font-size: 15px; cursor: pointer; }
.boton.primario { background: var(--negro); color: var(--amarillo); border-color: var(--negro); }
.boton.peligro { color: var(--rojo); border-color: var(--rojo); }
.boton:disabled { opacity: 0.5; cursor: default; }
dialog { border: 0; border-radius: 14px; padding: 18px; width: min(92vw, 380px); }
dialog label { display: block; margin: 10px 0; font-size: 14px; }
dialog input { display: block; width: 100%; margin-top: 4px; padding: 10px; font-size: 16px; border: 1px solid var(--gris-2); border-radius: 8px; }
.nota { font-size: 13px; color: var(--alerta); min-height: 1.2em; }
a { color: inherit; }
```

- [ ] **Step 7: Crear `panel/app.js`**

```js
// Panel de aprobación de Sin Línea. Sin framework. Todo texto va por textContent.
import { aprobar, descartar, quitarDeCola, reintentar, editarTexto, imagenDesactualizada, CATEGORIAS, VARIANTES } from "./lib/estados.mjs";
import { componerCaption, validarCaption, normalizarHashtags, LIMITES } from "./lib/caption.mjs";
import { siguienteFranjaLibre, franjasOcupadas, choca } from "./lib/franjas.mjs";
import { claveDia, isoDesdeClave, horaMinutoDeIso, ZONA_PANAMA } from "./lib/fechas.mjs";
import { crearAlmacenLocal, crearAlmacenGitHub, deducirRepo, ErrorConflicto } from "./almacen.mjs";

const FRANJAS = ["07:00", "09:30", "12:00", "14:30", "17:00", "19:30"];
const PESTANAS = [
  ["borrador", "Borradores"], ["programado", "Programados"], ["error", "Errores"], ["publicado", "Publicados"], ["descartado", "Descartados"],
];
const estado = { almacen: null, items: [], pestana: "borrador" };
const $ = (id) => document.getElementById(id);
const ahoraIso = () => new Date().toISOString();

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
    const info = await estado.almacen.tokenInfo();
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
  const conteo = Object.fromEntries(PESTANAS.map(([k]) => [k, estado.items.filter((x) => x.post.estado === k).length]));
  $("pestanas").replaceChildren(...PESTANAS
    .filter(([k]) => k !== "error" || conteo.error > 0)
    .map(([k, nombre]) => el("button", {
      type: "button", class: k === estado.pestana ? "activa" : "", text: `${nombre} (${conteo[k]})`,
      onclick: () => { estado.pestana = k; pintar(); },
    })));
  const visibles = estado.items.filter((x) => x.post.estado === estado.pestana);
  $("lista").replaceChildren(...(visibles.length ? visibles.map(tarjeta) : [el("p", { class: "vacio", text: "Nada por aquí." })]));
}

function urlImagen(post) {
  if (!post.imagen?.url) return null;
  const local = ["localhost", "127.0.0.1"].includes(location.hostname);
  const base = local ? `/img/${post.id}.jpg` : post.imagen.url;
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
  const contador = el("p", { class: "contador" });
  const actualizarContador = () => {
    const texto = componerCaption({ caption: campos.caption.value, medio: post.fuente.medio, hashtags: campos.hashtags.value.split(/\s+/) });
    const v = validarCaption(texto);
    contador.textContent = `${texto.length}/${LIMITES.caracteres} caracteres · ${normalizarHashtags(campos.hashtags.value.split(/\s+/)).length}/${LIMITES.hashtags} hashtags`;
    contador.className = "contador" + (v.ok ? "" : " excede");
  };

  const cuerpo = el("div", { class: "cuerpo" }, [
    el("div", { class: "meta" }, [
      el("span", { class: "chip", text: post.categoria }),
      el("span", { class: `badge ${post.estado}`, text: post.estado }),
      el("a", { href: post.fuente.url, target: "_blank", rel: "noopener", text: post.fuente.medio }),
      post.programado ? el("span", { text: `Programado: ${claveDia(post.programado)} ${horaMinutoDeIso(post.programado)}` }) : "",
      imagenDesactualizada(post) && !bloqueado ? el("span", { class: "regenerando", text: "Regenerando imagen…" }) : "",
    ]),
    post.error ? el("p", { class: "error-texto", text: `Error (${post.error.paso}): ${post.error.mensaje}` }) : "",
    campo("Titular", "titular"),
    campo("Bajada", "bajada"),
    el("div", { class: "fila" }, [campo("Categoría", "categoria", "select"), campo("Variante", "variante", "select")]),
    campo("Caption", "caption"),
    campo("Hashtags (separados por espacio)", "hashtags", "input"),
    contador,
  ]);
  campos.caption.addEventListener("input", actualizarContador);
  campos.hashtags.addEventListener("input", actualizarContador);
  actualizarContador();

  const acciones = el("div", { class: "acciones" });
  const cambios = () => ({
    titular: campos.titular.value.trim(), bajada: campos.bajada.value.trim(), caption: campos.caption.value.trim(),
    hashtags: normalizarHashtags(campos.hashtags.value.split(/\s+/)), categoria: campos.categoria.value, variante: campos.variante.value,
  });
  const hayCambios = () => {
    const c = cambios();
    return ["titular", "bajada", "caption", "categoria", "variante"].some((k) => c[k] !== post[k]) || c.hashtags.join(" ") !== post.hashtags.join(" ");
  };
  const conCambios = (p) => (hayCambios() ? editarTexto(p, cambios(), ahoraIso()) : p);
  const boton = (texto, clase, fn) => el("button", { type: "button", class: `boton ${clase}`, text: texto, onclick: () => ejecutar(post.id, sha, fn) });

  if (!bloqueado) {
    const aprobarConHora = async (p) => { const h = await pedirHora(p); return h ? aprobar(conCambios(p), h, ahoraIso()) : null; };
    if (post.estado === "borrador") {
      acciones.append(boton("Aprobar", "primario", aprobarConHora));
      acciones.append(boton("Guardar cambios", "", (p) => conCambios(p)));
      acciones.append(boton("Descartar", "peligro", (p) => descartar(p, ahoraIso())));
    } else if (post.estado === "programado") {
      acciones.append(boton("Cambiar hora", "primario", aprobarConHora));
      acciones.append(boton("Guardar cambios", "", (p) => conCambios(p)));
      acciones.append(boton("Quitar de la cola", "peligro", (p) => quitarDeCola(p, ahoraIso())));
    } else if (post.estado === "error") {
      if (post.error?.paso === "instagram") acciones.append(boton("Reintentar", "primario", (p) => reintentar(conCambios(p), ahoraIso())));
      acciones.append(boton("Guardar cambios", "", (p) => conCambios(p)));
      acciones.append(boton("Descartar", "peligro", (p) => descartar(p, ahoraIso())));
    }
  }
  if (post.publicacion?.permalink) acciones.append(el("a", { class: "boton", href: post.publicacion.permalink, target: "_blank", rel: "noopener", text: "Ver en Instagram" }));
  cuerpo.append(acciones);

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
    if (nuevo === null) return;
    try {
      item.sha = await estado.almacen.guardar(nuevo, item.sha);
    } catch (err) {
      if (!(err instanceof ErrorConflicto) || !err.actual) throw err;
      nuevo = await fn(err.actual.post);
      if (nuevo === null) return;
      item.sha = await estado.almacen.guardar(nuevo, err.actual.sha);
      avisar("El post había cambiado; se aplicó tu acción sobre la versión nueva.");
    }
    item.post = nuevo;
    pintar();
  } catch (err) {
    avisar(`No se pudo guardar: ${err.message}`, 8000);
    botones.forEach((b) => { b.disabled = false; });
  }
}

function pedirHora(post) {
  const ocupadas = franjasOcupadas(estado.items.map((x) => x.post).filter((p) => p.id !== post.id));
  let propuesta;
  try { propuesta = siguienteFranjaLibre({ franjas: FRANJAS, ocupadas, ahora: new Date(), zonaHoraria: ZONA_PANAMA }); }
  catch { propuesta = isoDesdeClave(claveDia(new Date()), "19:30"); }
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
cargar();
setInterval(() => {
  const hayRegenerando = estado.items.some((x) => ["borrador", "programado", "error"].includes(x.post.estado) && imagenDesactualizada(x.post));
  if (hayRegenerando && !document.querySelector("dialog[open]")) cargar();
}, 30000);
```

`pedirHora` devuelve `null` si la persona cancela el diálogo; `ejecutar` interpreta un resultado `null` de `fn` como "no hacer nada" (por eso `aprobarConHora` devuelve `null` en ese caso).

- [ ] **Step 8: Escribir el test de extremo a extremo `tests/panel.e2e.mjs`**

```js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { crearServidor } from "../src/serve.mjs";

let servidor, base, raiz, navegador;
before(async () => {
  raiz = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-"));
  for (const d of ["posts", "data", "templates", "panel", "src/lib", "public/img", "assets", "tests/fixtures"]) fs.mkdirSync(path.join(raiz, d), { recursive: true });
  fs.copyFileSync("config.json", path.join(raiz, "config.json"));
  fs.copyFileSync("templates/post.html", path.join(raiz, "templates/post.html"));
  fs.copyFileSync("tests/fixtures/post-ejemplo.json", path.join(raiz, "tests/fixtures/post-ejemplo.json"));
  fs.copyFileSync("tests/fixtures/post-ejemplo.json", path.join(raiz, "posts/2026-09-07-1420-la-prensa-a1b2.json"));
  fs.writeFileSync(path.join(raiz, "data/token-info.json"), '{ "vence": "2026-11-01" }');
  for (const f of fs.readdirSync("panel")) fs.copyFileSync(path.join("panel", f), path.join(raiz, "panel", f));
  for (const f of fs.readdirSync("src/lib")) fs.copyFileSync(path.join("src/lib", f), path.join(raiz, "src/lib", f));
  servidor = crearServidor({ raiz });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${servidor.address().port}`;
  navegador = await chromium.launch();
});
after(async () => { await navegador?.close(); servidor?.close(); });

test("el panel muestra el borrador, permite editar el titular y aprobar con la hora propuesta", async () => {
  const page = await navegador.newPage({ viewport: { width: 400, height: 800 } });
  await page.goto(`${base}/panel/`);
  await page.waitForSelector(".tarjeta");
  assert.match(await page.textContent("#pestanas"), /Borradores \(1\)/);
  await page.fill(".tarjeta textarea >> nth=0", "Titular editado desde el panel");
  await page.click("text=Aprobar");
  await page.waitForSelector("dialog[open]");
  await page.click("#hora-confirmar");
  await page.waitForSelector("text=Programados (1)");
  const guardado = JSON.parse(fs.readFileSync(path.join(raiz, "posts/2026-09-07-1420-la-prensa-a1b2.json"), "utf8"));
  assert.equal(guardado.estado, "programado");
  assert.equal(guardado.titular, "Titular editado desde el panel");
  assert.match(guardado.programado, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00-05:00$/);
  await page.click("text=Programados (1)");
  await page.waitForSelector(".badge.programado");
  await page.click("text=Quitar de la cola");
  await page.waitForSelector("text=Borradores (1)");
  await page.click("text=Borradores (1)");
  await page.waitForSelector(".badge.borrador");
  assert.equal(JSON.parse(fs.readFileSync(path.join(raiz, "posts/2026-09-07-1420-la-prensa-a1b2.json"), "utf8")).estado, "borrador");
  await page.close();
});
```

- [ ] **Step 9: Correr el e2e y revisar el panel a mano**

Run: `npm run test:e2e`
Expected: `# pass 1`.

Luego `npm run preview`, abrir `http://localhost:4173/panel/` en el navegador (y en el celular, con la IP de la PC, si se quiere), comprobar: pestañas con contadores, tarjeta con imagen (o "Imagen en proceso…"), campos editables, contador de caracteres, diálogo de hora con la franja propuesta, botones según estado. Ajustar `styles.css` si algo se ve mal en 375 px de ancho.

- [ ] **Step 10: Commit**

```bash
git add panel tests/almacen.test.mjs tests/panel.e2e.mjs
git commit -m "feat: panel de aprobación móvil (modo local y GitHub)"
```

---

### Task 23: Workflows de GitHub Actions

**Files:**
- Create: `.github/workflows/generar.yml`, `.github/workflows/regenerar.yml`, `.github/workflows/publicar.yml`, `.github/workflows/renovar-token.yml`
- Test: `tests/workflows.test.mjs`

**Interfaces:**
- Consumes: los scripts `src/generar.mjs`, `src/regenerar.mjs`, `src/publicar.mjs`, `src/renovar-token.mjs`, `src/build.mjs`; los secretos `ANTHROPIC_API_KEY`, `IG_ACCESS_TOKEN`, `IG_USER_ID`, `GH_PAT`.
- Produces: los cuatro workflows de la especificación §12, todos con `concurrency.group: sinlinea`. Los commits de bot usan `GITHUB_TOKEN` (no disparan otros workflows).

- [ ] **Step 1: Escribir el test `tests/workflows.test.mjs`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parse } from "yaml";

const leer = (n) => fs.readFileSync(`.github/workflows/${n}.yml`, "utf8");
const wf = (n) => parse(leer(n));

test("los cuatro workflows comparten el grupo de concurrencia sinlinea", () => {
  for (const n of ["generar", "regenerar", "publicar", "renovar-token"]) {
    assert.equal(wf(n).concurrency.group, "sinlinea", n);
    assert.equal(wf(n).concurrency["cancel-in-progress"], false, n);
  }
});

test("disparadores y secretos de cada workflow", () => {
  const g = wf("generar");
  assert.equal(g.on.schedule[0].cron, "20 */3 * * *");
  assert.ok(g.on.push["paths-ignore"].includes("posts/**"));
  assert.match(leer("generar"), /secrets\.ANTHROPIC_API_KEY/);
  const r = wf("regenerar");
  assert.ok(r.on.push.paths.includes("posts/**"));
  const p = wf("publicar");
  assert.equal(p.on.schedule[0].cron, "*/30 * * * *");
  assert.match(leer("publicar"), /secrets\.IG_ACCESS_TOKEN/);
  assert.match(leer("publicar"), /secrets\.IG_USER_ID/);
  const t = wf("renovar-token");
  assert.equal(t.on.schedule[0].cron, "0 14 * * 1");
  assert.match(leer("renovar-token"), /secrets\.GH_PAT/);
  assert.match(leer("renovar-token"), /gh secret set IG_ACCESS_TOKEN/);
});

test("generar y regenerar despliegan Pages; publicar y renovar solo escriben en el repo", () => {
  for (const n of ["generar", "regenerar"]) {
    assert.match(leer(n), /actions\/deploy-pages@v4/, n);
    assert.equal(wf(n).permissions.pages, "write", n);
  }
  for (const n of ["publicar", "renovar-token"]) {
    assert.ok(!leer(n).includes("deploy-pages"), n);
    assert.equal(wf(n).permissions.contents, "write", n);
  }
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --test tests/workflows.test.mjs`
Expected: FAIL — `ENOENT .github/workflows/generar.yml`.

- [ ] **Step 3: Crear `.github/workflows/generar.yml`**

```yaml
name: Generar borradores

# Cada 3 horas, a mano desde "Actions", y al subir cambios de código.
on:
  schedule:
    - cron: "20 */3 * * *"
  workflow_dispatch:
  push:
    branches: [main]
    paths-ignore:
      - "posts/**"
      - "data/**"
      - "public/img/**"
      - "README.md"
      - "GUIA.md"
      - "docs/**"

permissions:
  contents: write
  pages: write
  id-token: write

concurrency:
  group: sinlinea
  cancel-in-progress: false

jobs:
  generar:
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

      - name: Caché de Chromium
        id: cache-chromium
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('package-lock.json') }}

      - name: Instalar Chromium
        if: steps.cache-chromium.outputs.cache-hit != 'true'
        run: npx playwright install chromium

      - name: Instalar dependencias del sistema para Chromium
        run: npx playwright install-deps chromium

      - name: Generar borradores
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: node src/generar.mjs

      - name: Guardar cambios en el repositorio
        run: |
          git config user.name "sinlinea-bot"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add posts public/img data
          if git diff --cached --quiet; then
            echo "Sin cambios."
          else
            git commit -m "generar: $(date -u '+%Y-%m-%d %H:%M UTC')"
            for i in 1 2 3; do git pull --rebase && git push && break || sleep 5; done
          fi

      - name: Construir el sitio
        run: node src/build.mjs

      - name: Configurar GitHub Pages
        uses: actions/configure-pages@v5
        with:
          enablement: true

      - name: Empaquetar para GitHub Pages
        uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  desplegar:
    needs: generar
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    permissions:
      pages: write
      id-token: write
    steps:
      - name: Publicar en GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 4: Crear `.github/workflows/regenerar.yml`**

```yaml
name: Regenerar imágenes

# Corre cuando el panel guarda cambios en posts/ (o cambia la plantilla).
on:
  push:
    branches: [main]
    paths:
      - "posts/**"
      - "templates/**"
  workflow_dispatch:

permissions:
  contents: write
  pages: write
  id-token: write

concurrency:
  group: sinlinea
  cancel-in-progress: false

jobs:
  regenerar:
    runs-on: ubuntu-latest
    outputs:
      hubo: ${{ steps.guardar.outputs.hubo }}
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

      - name: Caché de Chromium
        id: cache-chromium
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('package-lock.json') }}

      - name: Instalar Chromium
        if: steps.cache-chromium.outputs.cache-hit != 'true'
        run: npx playwright install chromium

      - name: Instalar dependencias del sistema para Chromium
        run: npx playwright install-deps chromium

      - name: Regenerar imágenes desactualizadas
        run: node src/regenerar.mjs

      - name: Guardar cambios en el repositorio
        id: guardar
        run: |
          git config user.name "sinlinea-bot"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add posts public/img
          if git diff --cached --quiet; then
            echo "Sin cambios."
            echo "hubo=false" >> "$GITHUB_OUTPUT"
          else
            git commit -m "regenerar: $(date -u '+%Y-%m-%d %H:%M UTC')"
            for i in 1 2 3; do git pull --rebase && git push && break || sleep 5; done
            echo "hubo=true" >> "$GITHUB_OUTPUT"
          fi

      - name: Construir el sitio
        if: steps.guardar.outputs.hubo == 'true' || github.event_name == 'workflow_dispatch'
        run: node src/build.mjs

      - name: Configurar GitHub Pages
        if: steps.guardar.outputs.hubo == 'true' || github.event_name == 'workflow_dispatch'
        uses: actions/configure-pages@v5
        with:
          enablement: true

      - name: Empaquetar para GitHub Pages
        if: steps.guardar.outputs.hubo == 'true' || github.event_name == 'workflow_dispatch'
        uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  desplegar:
    needs: regenerar
    if: needs.regenerar.outputs.hubo == 'true' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    permissions:
      pages: write
      id-token: write
    steps:
      - name: Publicar en GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 5: Crear `.github/workflows/publicar.yml`**

```yaml
name: Publicar en Instagram

# Cada 30 minutos revisa los posts programados cuya hora ya llegó.
on:
  schedule:
    - cron: "*/30 * * * *"
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: sinlinea
  cancel-in-progress: false

jobs:
  publicar:
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

      - name: Publicar los programados
        env:
          IG_ACCESS_TOKEN: ${{ secrets.IG_ACCESS_TOKEN }}
          IG_USER_ID: ${{ secrets.IG_USER_ID }}
        run: node src/publicar.mjs

      - name: Guardar cambios en el repositorio
        run: |
          git config user.name "sinlinea-bot"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add posts
          if git diff --cached --quiet; then
            echo "Sin cambios."
          else
            git commit -m "publicar: $(date -u '+%Y-%m-%d %H:%M UTC')"
            for i in 1 2 3; do git pull --rebase && git push && break || sleep 5; done
          fi
```

- [ ] **Step 6: Crear `.github/workflows/renovar-token.yml`**

```yaml
name: Renovar token de Instagram

# Cada lunes a las 9:00 de Panamá (14:00 UTC). El token dura 60 días.
on:
  schedule:
    - cron: "0 14 * * 1"
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: sinlinea
  cancel-in-progress: false

jobs:
  renovar:
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

      - name: Pedir un token nuevo
        env:
          IG_ACCESS_TOKEN: ${{ secrets.IG_ACCESS_TOKEN }}
          IG_USER_ID: ${{ secrets.IG_USER_ID }}
        run: node src/renovar-token.mjs

      - name: Actualizar el secreto IG_ACCESS_TOKEN
        env:
          GH_TOKEN: ${{ secrets.GH_PAT }}
        run: |
          gh secret set IG_ACCESS_TOKEN --repo "$GITHUB_REPOSITORY" < temp/nuevo-token.txt
          rm -f temp/nuevo-token.txt

      - name: Guardar la fecha de vencimiento
        run: |
          git config user.name "sinlinea-bot"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add data/token-info.json
          if git diff --cached --quiet; then
            echo "Sin cambios."
          else
            git commit -m "token: renovado $(date -u '+%Y-%m-%d')"
            for i in 1 2 3; do git pull --rebase && git push && break || sleep 5; done
          fi
```

- [ ] **Step 7: Correr el test para verificar que pasa**

Run: `node --test tests/workflows.test.mjs`
Expected: `# pass 3`.

- [ ] **Step 8: Correr toda la suite unitaria**

Run: `npm test`
Expected: todos los tests en verde (`# fail 0`).

- [ ] **Step 9: Commit**

```bash
git add .github/workflows tests/workflows.test.mjs
git commit -m "feat: workflows de generar, regenerar, publicar y renovar token"
```

---

### Task 24: Documentación y guía de configuración paso a paso

**Files:**
- Create: `README.md`, `GUIA.md`, `docs/CONFIGURACION.md`

**Interfaces:**
- Consumes: todo lo anterior. `docs/CONFIGURACION.md` es la guía que se seguirá junto con la persona usuaria (especificación §14).

- [ ] **Step 1: Crear `README.md`**

```markdown
# Sin Línea · Publicación automática en Instagram

Convierte noticias de Panamá (La Prensa y La Estrella) en posts de Instagram con la
marca Sin Línea, los deja listos para aprobar desde el celular y publica los
aprobados a la hora programada. Todo corre en GitHub Actions y GitHub Pages.

- Diseño: `docs/superpowers/specs/2026-09-07-sinlinea-instagram-design.md`
- Guía de uso diario: `GUIA.md`
- Configuración inicial (GitHub, Meta, tokens): `docs/CONFIGURACION.md`

## Comandos

```bash
npm install                  # dependencias
npx playwright install chromium
npm test                     # tests unitarios
npm run test:render          # render real de la plantilla (necesita Chromium)
npm run test:e2e             # panel en modo local con Playwright
npm run preview              # http://localhost:4173 (plantilla y panel local)
npm run generar -- --dry-run # simula una corrida (necesita ANTHROPIC_API_KEY)
npm run publicar -- --dry-run
```

## Estructura

```
config.json            fuentes, franjas, límites, modelo, marca
prompts/editorial.md   línea editorial (editable sin tocar código)
templates/post.html    plantilla 1080×1350 (data-version controla el re-render)
src/                   generar, regenerar, publicar, renovar-token, build, serve + lib/
panel/                 panel de aprobación (estático)
posts/                 un JSON por post; posts/archivo/ para los antiguos
public/img/            imágenes JPEG servidas por Pages en /img/
data/seen.json         URLs ya evaluadas · data/token-info.json vencimiento del token
.github/workflows/     generar (3 h), regenerar (push a posts/), publicar (30 min), renovar-token (lunes)
```
```

- [ ] **Step 2: Crear `GUIA.md`**

```markdown
# Guía de uso diario — Sin Línea

## Qué pasa solo
- **Cada 3 horas** el sistema lee La Prensa y La Estrella, elige hasta 2 noticias
  nuevas (máximo 12 al día), redacta titular, bajada y caption con Claude y genera
  la imagen. Aparecen como **Borradores** en el panel.
- **Cada 30 minutos** revisa los **Programados** y publica en Instagram los que ya
  tienen la hora cumplida. El panel muestra el enlace al post en **Publicados**.
- **Cada lunes** renueva el token de Instagram. La fecha de vencimiento se ve en la
  cabecera del panel; si está en rojo, revisa `docs/CONFIGURACION.md` (sección 8).

## El panel
Abre `https://<tu-usuario>.github.io/sinlinea/panel/` en el celular. La primera vez
pulsa **Configurar** y pega el token de GitHub (ver `docs/CONFIGURACION.md`, paso 6).

En cada tarjeta puedes:
- Editar titular, bajada, categoría, variante de color, caption y hashtags.
  Si cambias algo que afecta a la imagen, verás "Regenerando imagen…" durante 1 a 3
  minutos hasta que se vuelva a dibujar.
- **Aprobar**: propone la siguiente franja libre (7:00, 9:30, 12:00, 14:30, 17:00,
  19:30); puedes cambiarla. El post pasa a **Programados**.
- **Descartar**: el post no se publica (queda en Descartados).
- **Quitar de la cola**: vuelve a Borradores un post programado.
- **Reintentar**: en un post con error de Instagram, lo vuelve a poner en cola.

## Si algo sale mal
- Un post en **Errores** muestra el mensaje exacto. Los errores de imagen se
  reintentan solos; los de Instagram requieren pulsar Reintentar (o Descartar).
- Si no aparecen borradores nuevos: en GitHub → Actions → "Generar borradores",
  revisa la última corrida. "Cupo diario agotado" o "Sin candidatos nuevos" es
  normal; un error rojo suele ser la clave de Claude o un feed caído.
- Si nada se publica: Actions → "Publicar en Instagram". Un 190 suele ser token
  vencido; revisa `docs/CONFIGURACION.md` sección 8.

## Ajustes sin tocar código
- `config.json`: franjas, máximos por corrida y por día, modelo de Claude
  (`claude-opus-5` o `claude-sonnet-5` para gastar menos), fuentes.
- `prompts/editorial.md`: tono, qué elegir, cómo escribir.
- `templates/post.html`: diseño. Al cambiarla, sube `data-version` en `<html>` para
  que se regeneren las imágenes de los posts activos.
```

- [ ] **Step 3: Crear `docs/CONFIGURACION.md`**

```markdown
# Configuración inicial, paso a paso

Sigue los pasos en orden. Cada uno se hace una sola vez.

## 1. El logo
Guarda el logo oficial (círculo amarillo con SIN LÍNEA) como `assets/logo.png`,
mínimo 512×512 px. Si no está, la plantilla dibuja un círculo de reserva con el
nombre; funciona, pero conviene poner el real antes del primer post.
Comprueba con `npm run preview` → `http://localhost:4173/vista/negro`.

## 2. Repositorio en GitHub
1. En github.com → **New repository** → nombre `sinlinea`, **Public**, sin README.
2. En la carpeta del proyecto:
   ```bash
   git remote add origin https://github.com/<tu-usuario>/sinlinea.git
   git push -u origin main
   ```
3. En el repo → **Settings → Pages → Source: GitHub Actions**.
4. Edita `config.json`: `pages.baseUrl` = `https://<tu-usuario>.github.io/sinlinea`
   y `marca.usuario` = tu usuario de Instagram (con @). Haz commit y push.

## 3. Clave de Claude
1. Entra en https://console.anthropic.com → **API Keys → Create Key**.
2. En el repo → **Settings → Secrets and variables → Actions → New repository secret**:
   nombre `ANTHROPIC_API_KEY`, valor la clave.
3. Costo esperado: 7 a 10 USD al mes con `claude-opus-5`; 3 a 4 con `claude-sonnet-5`.

## 4. App de Meta e Instagram
Requisito: la cuenta de Instagram debe ser **profesional** (Empresa o Creador).
No hace falta página de Facebook.

1. Entra en https://developers.facebook.com con tu cuenta de Facebook →
   **My Apps → Create App**. Cuando pregunte el caso de uso, elige la opción que
   mencione Instagram (o "Other" → tipo "Business"). Ponle nombre `Sin Línea`.
2. En el panel de la app → **Add product → Instagram → Set up** →
   **API setup with Instagram login**.
3. En "Generate access tokens" pulsa **Add account** e inicia sesión con la cuenta
   de Sin Línea. Si no aparece, ve a **App roles → Roles → Add people →
   Instagram Tester**, escribe el usuario de Sin Línea, y acepta la invitación desde
   la app de Instagram: **Configuración → Sitios web y permisos → Apps y sitios
   web → Invitaciones de tester**.
4. Junto a la cuenta pulsa **Generate token**, autoriza los permisos
   `instagram_business_basic` e `instagram_business_content_publish`, y copia el
   token (es de larga duración: 60 días).
5. Obtén el id de usuario abriendo en el navegador (sustituye TOKEN):
   `https://graph.instagram.com/v23.0/me?fields=user_id,username&access_token=TOKEN`
   Copia el valor de `user_id`.
6. Crea los secretos `IG_ACCESS_TOKEN` (el token) e `IG_USER_ID` (el user_id).
7. Escribe en `data/token-info.json` la fecha de hoy más 60 días:
   `{ "vence": "AAAA-MM-DD" }`. Commit y push.

La app puede quedarse en modo desarrollo: publicar en tu propia cuenta (tester)
no requiere revisión de Meta.

## 5. Token para renovar el secreto (GH_PAT)
1. github.com → tu avatar → **Settings → Developer settings → Personal access
   tokens → Fine-grained tokens → Generate new token**.
2. Nombre `sinlinea-actions`, vencimiento 1 año, **Repository access: Only select
   repositories → sinlinea**, **Permissions → Repository → Secrets: Read and write**.
3. Guárdalo como secreto del repo con nombre `GH_PAT`.

## 6. Token para el panel (celular)
1. Igual que arriba, nombre `sinlinea-panel`, solo el repo `sinlinea`,
   **Permissions → Repository → Contents: Read and write**.
2. En el celular abre `https://<tu-usuario>.github.io/sinlinea/panel/` →
   **Configurar** → pega el token → **Guardar y conectar**. Queda guardado solo en ese
   navegador. Repite en cada dispositivo desde el que quieras aprobar.

## 7. Primera corrida
1. GitHub → **Actions → Generar borradores → Run workflow**. Tarda 3 a 5 minutos.
2. Abre el panel: deben aparecer 1 o 2 borradores con imagen.
3. Aprueba uno con una hora dentro de los próximos 30 a 40 minutos.
4. Espera a la corrida de **Publicar en Instagram** (cada media hora) o lánzala a
   mano desde Actions. El post debe aparecer en Instagram y en la pestaña
   Publicados con su enlace.

## 8. Si el token de Instagram vence
Los tokens de larga duración se renuevan solos cada lunes mientras sean válidos. Si
la cabecera del panel está en rojo o "Publicar" falla con un error 190, repite el
paso 4 (puntos 4, 6 y 7) para generar un token nuevo.

## 9. Renovaciones anuales
Los tokens finos de GitHub vencen como máximo al año: repite los pasos 5 y 6 cuando
GitHub te avise por correo.
```

- [ ] **Step 4: Verificar los enlaces y comandos de la documentación**

Run: `npm test` y `npm run preview` (abrir `http://localhost:4173/` y confirmar que los enlaces de la guía existen).
Expected: tests en verde; la previsualización muestra la plantilla en tres variantes y el panel.

- [ ] **Step 5: Commit**

```bash
git add README.md GUIA.md docs/CONFIGURACION.md
git commit -m "docs: README, guía de uso diario y configuración paso a paso"
```

---

## Verificación final del plan

Después de la Task 24, ejecutar en orden y anotar el resultado en el mensaje final a la persona usuaria:

1. `npm test` → `# fail 0`.
2. `npm run test:render` → 4 renders correctos; revisar las tres imágenes a ojo.
3. `npm run test:e2e` → 1 test en verde.
4. `npm run preview` → abrir la plantilla y el panel.
5. `git log --oneline` → un commit por tarea.

Luego seguir `docs/CONFIGURACION.md` con la persona usuaria (repositorio, claves, app de Meta, primera corrida y primer post real).
