# Sin Línea · Sistema de publicación automática en Instagram — Diseño v1

Fecha: 2026-09-07
Estado: aprobado. Plan de implementación en
`docs/superpowers/plans/2026-09-07-sinlinea-instagram.md`.

## 1. Objetivo

Construir un sistema que, a partir de las noticias de Panamá, genere posts de
Instagram con la marca Sin Línea (imagen JPEG + caption), los presente en un
panel accesible desde el celular para aprobación, y publique los aprobados en
la cuenta profesional de Instagram de Sin Línea a la hora programada, sin
servidores propios y con costo de alojamiento cero.

### Alcance de la v1

- Fuentes: el feed RSS de La Prensa (incluye el texto completo de cada
  artículo en `content:encoded`) y la **portada** de La Estrella de Panamá
  (no tiene RSS propio; los enlaces de Google Noticias no se pueden resolver de
  forma confiable, así que se extraen los enlaces reales de la portada y se
  descarga cada artículo, que expone `og:title`, `og:description`,
  `article:published_time` y párrafos `<p class="p_N">`).
- Formato: **post sencillo de una imagen** (1080×1350, 4:5).
- Flujo **semiautomático**: el sistema propone, la persona aprueba.
- Volumen: hasta 12 borradores al día, objetivo de 5 a 10 publicaciones diarias.
- Redacción con la API de Claude.
- Publicación con la API oficial "Instagram API with Instagram Login"
  (no requiere página de Facebook; la cuenta ya es profesional).

### Fuera de alcance (fase 2)

Carruseles, historias, reels, uso de la foto del artículo original,
notificaciones por WhatsApp/Telegram, varias cuentas, analítica de métricas.
El diseño deja el camino abierto para todo esto (ver §15).

## 2. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Origen del contenido | Noticias de Panamá (La Prensa, La Estrella) |
| Nivel de automatización | Semiautomático con aprobación humana |
| Cuenta de Instagram | Profesional, sin página de Facebook → API con Instagram Login |
| Formato v1 | Post sencillo de 1 imagen |
| Volumen | 5 a 10 al día |
| Aprobación | Desde el celular, panel web |
| Redacción | API de Claude, modelo `claude-sonnet-5` por defecto (decisión del 2026-09-07 por costo; `claude-opus-5` opcional) |
| Infraestructura | Opción A: todo en GitHub (Actions + Pages), costo cero |

## 3. Arquitectura

Un solo repositorio público `sinlinea` en GitHub, con tres procesos y un panel:

```
         cada 3 h                cada hora / push a posts/**           cada 30 min
 ┌──────────────────┐   commit    ┌──────────────────┐   commit   ┌──────────────────┐
 │ GENERAR          │───────────▶ │ REGENERAR        │ ─────────▶ │ PUBLICAR         │
 │ feeds → Claude   │             │ re-render de     │            │ programados con  │
 │ → render → posts │             │ imágenes editadas│            │ hora cumplida →  │
 │ → deploy Pages   │             │ → deploy Pages   │            │ Instagram API    │
 └──────────────────┘             └──────────────────┘            └──────────────────┘
          ▲                                ▲                              │
          │  lee posts/*.json              │ el panel guarda cambios      │ escribe estado
          │  y muestra public/img          │ con un token fino de GitHub  │ + permalink
          │                                │                              ▼
      ┌────────────────────────────────────────────────────────────────────────┐
      │ PANEL  (página estática en GitHub Pages, abierta desde el celular)     │
      └────────────────────────────────────────────────────────────────────────┘
```

- **Generar** lee los feeds, descarta lo ya visto, descarga el texto de los
  artículos nuevos, pide a Claude que seleccione y redacte, renderiza las
  imágenes, guarda un archivo JSON por post y hace commit + despliegue.
- **Regenerar** corre cuando el panel guarda cambios: si el titular, la bajada,
  la categoría o la variante cambiaron respecto a la imagen existente, vuelve a
  renderizar y despliega.
- **Publicar** toma los posts en estado `programado` cuya hora ya pasó y los
  publica en Instagram.
- **Panel** es HTML/JS estático; lee y escribe en el repo usando la API REST de
  GitHub con un token fino guardado en el navegador del celular.

Todos los flujos de trabajo de Actions (§12, incluido el de renovación del
token) comparten un mismo grupo de concurrencia para no pisarse al hacer push.

## 4. Estructura del repositorio

```
sinlinea/
  .github/workflows/
    generar.yml          cron 20 */3 * * *  + manual + push de código
    regenerar.yml        cron 40 * * * * + push paths posts/** + manual
    publicar.yml         cron */30 * * * *  + manual
    renovar-token.yml    cron semanal: refresca el token de Instagram
  config.json            fuentes, franjas, límites, modelo, marca, URL de Pages
  prompts/editorial.md   línea editorial y reglas de redacción (editable sin código)
  assets/
    logo.png             logo oficial (lo aporta la persona usuaria)
    fonts/               Anton + Inter (licencia OFL), auto-alojadas
  templates/post.html    plantilla 1080×1350 con las 3 variantes de color
  src/
    generar.mjs          orquestador de GENERAR
    regenerar.mjs        orquestador de REGENERAR
    publicar.mjs         orquestador de PUBLICAR
    serve.mjs            previsualización local de plantilla y panel
    lib/
      config.mjs         carga y valida config.json
      rss.mjs            descarga y parseo de RSS (portado de Que Hay Panamá)
      portada.mjs        extrae enlaces de artículos de una portada HTML
      articulo.mjs       extrae título, descripción, fecha y párrafos de un artículo
      fuentes.mjs        convierte cada fuente (rss | portada) en candidatos uniformes
      seen.mjs           registro de URLs ya procesadas
      redactor.mjs       llamada a Claude con salida estructurada
      render.mjs         Playwright → PNG → sharp → JPEG
      posts.mjs          lectura/escritura/validación de posts/*.json y transiciones
      franjas.mjs        cálculo de la siguiente franja libre en America/Panama
      instagram.mjs      cliente de la API (contenedor, estado, publicar, permalink, cuota, refresh)
      fechas.mjs         utilidades de zona horaria
  panel/
    index.html, app.js, styles.css
  posts/                 un JSON por post (activos)
  posts/archivo/AAAA-MM/ posts publicados o descartados con más de 7 días
  public/img/            imágenes JPEG (servidas por Pages en /img/)
  data/seen.json         URLs vistas (se purga a 30 días)
  tests/                 node:test + fixtures
  docs/superpowers/specs/  este documento
  package.json           scripts: generar, regenerar, publicar, preview, test
```

`dist/` se construye en cada despliegue copiando `public/` y `panel/`; no se
versiona.

## 5. Modelo de datos

### 5.1 `posts/<id>.json`

`id` = `AAAA-MM-DD-HHMM-<medio>-<4 hex>` (hora de Panamá, medio en slug).

```json
{
  "id": "2026-09-07-1420-prensa-a1b2",
  "estado": "borrador",
  "fuente": {
    "medio": "La Prensa",
    "url": "https://www.prensa.com/...",
    "titulo": "Título original del artículo",
    "publicado": "2026-09-07T13:10:00Z"
  },
  "categoria": "POLÍTICA",
  "titular": "Titular corto para la imagen",
  "bajada": "Dos líneas de contexto que amplían el titular.",
  "caption": "Texto del caption sin hashtags ni fuente.",
  "hashtags": ["#Panamá", "#SinLínea", "#Noticias"],
  "variante": "negro",
  "imagen": {
    "ruta": "public/img/2026-09-07-1420-prensa-a1b2.jpg",
    "url": "https://<usuario>.github.io/sinlinea/img/2026-09-07-1420-prensa-a1b2.jpg",
    "hash": "hash(titular|bajada|categoria|variante|version)",
    "version": 1,
    "renderizada": "2026-09-07T19:21:04Z"
  },
  "programado": null,
  "publicacion": null,
  "error": null,
  "creado": "2026-09-07T19:20:31Z",
  "actualizado": "2026-09-07T19:21:04Z"
}
```

- `estado` ∈ `borrador | programado | publicado | descartado | error`.
- `programado`: ISO 8601 con zona, p. ej. `"2026-09-07T17:00:00-05:00"`.
- `publicacion`: `{ "idMedia": "...", "permalink": "https://www.instagram.com/p/...", "fecha": "..." }`.
- `error`: `{ "paso": "render | instagram", "mensaje": "...", "fecha": "..." }`.
- `imagen.hash` permite a REGENERAR detectar imágenes desactualizadas sin que
  el panel tenga que marcar nada: si el hash calculado con los campos actuales
  no coincide, se vuelve a renderizar. `imagen.version` guarda la versión de
  la plantilla con la que se renderizó, así el panel puede recalcular el hash
  sin conocer la versión vigente; REGENERAR además compara con la versión
  actual de la plantilla. El hash es FNV-1a en JavaScript puro (mismo código
  en Node y en el navegador); no es criptográfico, solo detecta cambios.
- `variante` ∈ `negro | amarillo | rojo`.

### 5.2 Transiciones de estado

```
borrador ──aprobar(hora)──▶ programado ──publicar ok──▶ publicado
borrador ──descartar─────▶ descartado
programado ──publicar falla─▶ error(instagram) ──reintentar──▶ programado
programado ──quitar de la cola──▶ borrador
(cualquiera) ──render falla──▶ error(render) ──re-render ok──▶ borrador | programado
error ──descartar────────▶ descartado
```

- `reintentar` (botón del panel) aplica a `error.paso = instagram` y devuelve
  el post a `programado` conservando su hora.
- Tras un `error.paso = render`, REGENERAR vuelve a intentar el render en su
  siguiente corrida; si tiene éxito, el post queda en `programado` cuando el
  campo `programado` tiene valor y en `borrador` en caso contrario.

Ninguna transición borra archivos. Cambiar `titular`, `bajada`, `categoria` o
`variante` está permitido en `borrador`, `programado` y `error`; el `caption` y
los `hashtags` también.

### 5.3 `data/seen.json`

```json
{ "urls": { "https://www.prensa.com/...": "2026-09-07" } }
```

Se purgan entradas con más de 30 días.

### 5.4 `config.json`

```json
{
  "marca": { "nombre": "Sin Línea", "usuario": "@sinlinea", "lema": "Nuestra línea es el Pueblo" },
  "zonaHoraria": "America/Panama",
  "pages": { "baseUrl": "https://<usuario>.github.io/sinlinea" },
  "fuentes": [
    { "nombre": "La Prensa", "tipo": "rss",
      "url": "https://www.prensa.com/arc/outboundfeeds/rss/?outputType=xml",
      "excluirSecciones": ["opinion", "status-k"] },
    { "nombre": "La Estrella de Panamá", "tipo": "portada",
      "url": "https://www.laestrella.com.pa/",
      "patronArticulo": "^/[a-z-]+(?:/[a-z-]+)*/[a-z0-9-]+-[A-Z]{2}\\d{6,}$",
      "excluirSecciones": ["opinion", "tag", "autor"] }
  ],
  "generar": { "maxPorCorrida": 2, "maxBorradoresPorDia": 12, "candidatosMax": 40, "diasSinRepetir": 3 },
  "claude": { "modelo": "claude-sonnet-5", "esfuerzo": "medium" },
  "franjas": ["07:00", "09:30", "12:00", "14:30", "17:00", "19:30"],
  "instagram": { "apiVersion": "v23.0" },
  "archivarDespuesDeDias": 7
}
```

El `usuario` de Instagram real y la `baseUrl` se completan en la configuración
manual (§14).

## 6. GENERAR (cada 3 horas)

1. Cargar `config.json`, `data/seen.json` y todos los `posts/*.json` activos.
2. Descargar cada fuente (timeout 20 s; si una falla se registra y se sigue
   con las demás). Fuente `rss`: cada ítem aporta URL, título, descripción,
   fecha y texto (`content:encoded` convertido a párrafos). Fuente `portada`:
   se extraen los enlaces que cumplen `patronArticulo`; el título, la fecha y
   el texto se obtienen en el paso 5. Se descartan las URLs cuyo primer
   segmento de ruta esté en `excluirSecciones`.
3. Filtrar: URL no vista, publicada en las últimas 48 h (para `portada` este
   filtro se aplica tras el paso 5). Ordenar por fecha, quedarse con
   `candidatosMax`.
4. Comprobar el cupo: `maxBorradoresPorDia` menos posts creados hoy (hora de
   Panamá, en cualquier estado, incluidos descartados). Si el cupo es 0,
   terminar sin llamar a Claude.
5. Para cada candidato sin texto (los de `portada`) descargar el artículo
   (`articulo.mjs`): `og:title`, `og:description`, `article:published_time`,
   párrafos. El texto que se envía a Claude se recorta a los primeros
   párrafos hasta ~1 500 caracteres. Timeout 15 s, 4 descargas en paralelo;
   si falla, el candidato se descarta en esta corrida y no se marca como
   visto.
6. Llamar a Claude (`redactor.mjs`, §7) con los candidatos y los titulares de
   los posts de los últimos `diasSinRepetir` días (cualquier estado excepto
   descartado). Claude devuelve hasta `min(maxPorCorrida, cupo)` posts.
7. Para cada post devuelto: asignar `id`, `variante` (ciclo negro → amarillo
   → rojo → negro, partiendo de la variante del post con `creado` más
   reciente), validar límites (§10.3), renderizar imagen (§8), escribir
   `posts/<id>.json`.
8. Marcar como vistas **todas** las URLs candidatas (elegidas o no) para no
   volver a evaluarlas.
9. Archivar: mover a `posts/archivo/AAAA-MM/` los posts `publicado` o
   `descartado` con `actualizado` anterior a `archivarDespuesDeDias`.
10. Commit de `posts/`, `public/img/`, `data/seen.json`; construir `dist/`;
    desplegar Pages.

Con `--dry-run` se ejecuta todo hasta el paso 7 escribiendo en `temp/` en vez
de `posts/` y `public/`, y no se toca `seen.json`.

## 7. Redacción con Claude

- SDK oficial `@anthropic-ai/sdk`. Modelo desde `config.claude.modelo`
  (`claude-sonnet-5` por defecto), pensamiento adaptativo, `output_config.effort`
  desde `config.claude.esfuerzo`.
- **Salida estructurada** (`output_config.format` con JSON Schema) para no
  parsear texto libre. Esquema de salida:

```json
{
  "seleccion": [
    {
      "indiceCandidato": 3,
      "categoria": "POLÍTICA",
      "titular": "máx. 12 palabras",
      "bajada": "máx. 30 palabras",
      "caption": "3 a 5 líneas, sin hashtags ni fuente",
      "hashtags": ["#Panamá", "..."],
      "relevancia": 0.0,
      "motivo": "por qué se eligió (solo para el registro)"
    }
  ],
  "descartados": [{ "indiceCandidato": 1, "motivo": "duplicado de ..." }]
}
```

- El **prompt de sistema** = contenido de `prompts/editorial.md` + reglas
  fijas. Se marca con `cache_control`; con el tamaño actual del prompt el
  caché no aplica (está por debajo del mínimo), pero el marcador queda listo
  para cuando la línea editorial crezca. Reglas fijas que el código impone
  además de lo que diga el archivo:
  no inventar datos que no estén en el texto del artículo; español de Panamá;
  no repetir temas ya cubiertos en los últimos días; preferir noticias de
  interés general y de impacto para la ciudadanía; una noticia por post;
  categorías permitidas: POLÍTICA, ECONOMÍA, SOCIEDAD, SEGURIDAD, SALUD,
  EDUCACIÓN, DEPORTES, CULTURA, INTERNACIONAL, ÚLTIMA HORA.
- Contenido inicial de `prompts/editorial.md`: tono directo, claro y cercano al
  pueblo, sin sensacionalismo ni opinión no respaldada por hechos; el lema es
  "Nuestra línea es el Pueblo"; titular con verbo y sujeto concretos; bajada
  que responda qué, quién y dónde; caption que explique por qué importa y
  termine con una frase que invite a comentar. La persona usuaria puede
  reescribirlo por completo.
- Costo estimado (~8 corridas/día, ~5 000 tokens de entrada y ~600 de
  salida por corrida): entre 3 y 4 USD al mes con `claude-sonnet-5`; con `claude-opus-5`, entre 7
  y 10 USD.
- Si la API falla tras los reintentos del SDK, la corrida termina con error y
  **no se hace commit de nada**; `seen.json` no cambia, así los candidatos se
  reevalúan en la siguiente corrida.

## 8. Render de imagen

- Lienzo 1080×1350 px (4:5). Playwright + Chromium renderizan
  `templates/post.html` con los datos del post inyectados; captura PNG; `sharp`
  convierte a JPEG calidad 88, progresivo, sRGB, sin metadatos. Objetivo < 600 KB
  (límite de Instagram: 8 MB, solo JPEG, proporción entre 4:5 y 1.91:1).
- Paleta base tomada del logo (los valores exactos se muestrean del archivo
  `assets/logo.png` en la implementación): amarillo ≈ `#FFD400`, rojo ≈
  `#E30613`, negro `#111111`, blanco `#FFFFFF`.
- Variantes: `negro` (fondo negro, titular amarillo, chip rojo), `amarillo`
  (fondo amarillo, titular negro, chip rojo), `rojo` (fondo rojo, titular
  blanco, chip negro).
- Composición (márgenes de seguridad 72 px):
  - Logo circular 160 px arriba a la izquierda.
  - Chip de categoría arriba a la derecha: mayúsculas, 28 px, espaciado de
    letras, esquinas rectas.
  - Titular en `Anton` (condensada pesada, OFL), mayúsculas, interlineado 1.0,
    tamaño inicial 86 px que se reduce de 2 en 2 hasta caber en máximo 3 líneas
    (mínimo 70 px), sin cortar palabras. Si no cabe, el render lanza un error
    `TEXTO_NO_CABE` y GENERAR/REGENERAR piden a Claude un titular más corto
    (`acortarTextos`, una sola vez, devuelve titular y bajada) antes de marcar el post en error.
    Límites de texto (`src/lib/texto.mjs`): titular 40-55 caracteres ideal, máximo
    65; bajada máximo 110. El panel los valida antes de guardar (lineamientos del
    2026-09-08, plantilla v7).
  - Bajada en `Inter` de 34 a 30 px, máximo 2 líneas, opacidad 90 %.
  - Logo de 120 px arriba a la izquierda, categoría arriba a la derecha, márgenes
    laterales de 72 px, franja inferior de 70 px, pie (fecha y usuario) a 24 px.
    Con ilustración el texto se ancla a la mitad inferior (la mitad superior de
    la imagen queda visible, degradado de transparente en el centro a negro
    abajo); sin ilustración el texto se centra verticalmente.
  - Franja inferior de 130 px: a la izquierda la fecha ("7 sep 2026"; la fuente va solo en el caption, decisión del 2026-09-08),
    a la derecha el usuario de Instagram; debajo una barra con el lema
    "Nuestra línea es el Pueblo" (roja con texto blanco en las variantes negro
    y amarillo; negra con texto amarillo en la variante rojo, para que
    contraste).
- La plantilla lleva un número de `version` que forma parte de `imagen.hash`;
  cambiar la plantilla y subir la versión hace que REGENERAR vuelva a renderizar
  los posts activos.
- El aspecto se afina con renders reales en `npm run preview` antes del primer
  post; la composición anterior es el punto de partida, no un contrato fijo.

## 9. Panel de aprobación

- URL: `https://<usuario>.github.io/sinlinea/panel/`. HTML + CSS + JS sin
  framework ni build, móvil primero, funciona también en escritorio.
- **Primer uso**: pantalla para pegar un token fino de GitHub (solo repositorio
  `sinlinea`, permiso Contents: lectura y escritura). Se guarda en
  `localStorage`. Sin token el panel es de solo lectura y usa la API sin
  autenticar (60 peticiones por hora por dirección IP), suficiente para una
  consulta ocasional pero no para uso diario.
- Cabecera fija con el estado del token de Instagram ("vence el 5 nov") leído
  de `data/token-info.json` (§10.2), en rojo si faltan menos de 7 días.
- **Lectura**: lista `posts/` con la API de contenidos de GitHub y descarga cada
  JSON en paralelo (cabecera `application/vnd.github.raw+json`). Las imágenes se
  cargan desde Pages con `?v=<hash>` para evitar caché vieja.
- **Pestañas**: Borradores (por defecto), Programados, Publicados, Descartados,
  Errores (solo aparece si hay alguno). Contador en cada pestaña.
- **Tarjeta de post**: imagen, chip de categoría, medio y enlace al artículo,
  titular y bajada editables, caption y hashtags editables, selector de
  variante, contador de caracteres del caption (límite 2 200) y de hashtags
  (límite 30).
  - Botones en borrador: **Aprobar** (abre selector de hora con la siguiente
    franja libre propuesta), **Guardar cambios**, **Descartar**.
  - En programado: **Cambiar hora**, **Quitar de la cola**, **Guardar cambios**.
  - En error: mensaje del error, **Reintentar**, **Descartar**.
  - En publicado: enlace al post en Instagram.
- **Escritura**: `PUT /repos/{u}/sinlinea/contents/posts/<id>.json` con el
  `sha` actual (bloqueo optimista). Si GitHub responde conflicto, el panel
  recarga el archivo, reaplica los cambios de la persona sobre la versión nueva
  y reintenta una vez; si vuelve a fallar, muestra el error y conserva el texto
  editado en pantalla.
- Tras guardar un cambio que afecte a la imagen, la tarjeta muestra
  "Regenerando imagen…" hasta que `imagen.hash` coincida con los campos (el
  panel vuelve a leer el archivo cada 30 s mientras esté en ese estado).
- El repositorio es público (requisito de Pages en cuentas gratuitas), así que
  los borradores y las imágenes son visibles para quien conozca la URL. No
  contienen nada sensible: son resúmenes de noticias públicas. El token nunca
  sale del navegador del celular.

## 10. PUBLICAR (cada 30 minutos)

### 10.1 Flujo

1. Cargar posts con `estado = programado` y `programado <= ahora`.
2. Consultar la cuota: `GET /{IG_USER_ID}/content_publishing_limit`. Si no hay
   cupo, dejar los posts como están y terminar.
3. Para cada post, en orden de hora programada:
   a. `HEAD imagen.url` debe responder 200 (Pages desplegado). Si no, se
      registra en el campo `esperasImagen` del post y se intenta en la
      siguiente corrida; al tercer intento fallido pasa a `error` con paso
      `render`. Si la imagen falta o está desactualizada (hash distinto), el
      post se pospone sin contar intento, a la espera de REGENERAR.
   b. `POST /{IG_USER_ID}/media` con `image_url`, `caption` compuesto
      (§10.3) → `creation_id`.
   c. Sondear `GET /{creation_id}?fields=status_code` cada 5 s hasta
      `FINISHED` (máximo 2 min). `ERROR`/`EXPIRED` → estado `error` con el
      mensaje de la API.
   d. `POST /{IG_USER_ID}/media_publish` con `creation_id` → `media_id`.
   e. `GET /{media_id}?fields=permalink`.
   f. Guardar `estado = publicado`, `publicacion = {...}`.
4. Commit de los posts modificados (sin despliegue de Pages; el panel lee por
   API).

Base de la API: `https://graph.instagram.com/<apiVersion>/`. Las llamadas con
error de red o 5xx se reintentan 3 veces con espera exponencial; los 4xx no se
reintentan y pasan el post a `error`.

### 10.2 Token

- Se guarda en el secreto `IG_ACCESS_TOKEN` (token de larga duración, 60 días)
  junto con `IG_USER_ID`.
- `renovar-token.yml` corre cada lunes a las 9:00 de Panamá (14:00 UTC): `GET /refresh_access_token?grant_type=ig_refresh_token`
  y actualiza el secreto con `gh secret set` usando el secreto `GH_PAT` (token
  fino con permiso Secrets: lectura y escritura sobre el repositorio). El
  refresco solo es válido si el token tiene más de 24 h y no ha expirado.
- La respuesta del refresco incluye `expires_in`; `renovar-token.yml` guarda
  la fecha de vencimiento (solo la fecha, nunca el token) en
  `data/token-info.json` y hace commit. PUBLICAR lee ese archivo y, si faltan
  menos de 7 días, escribe una advertencia en el resumen de la corrida; el
  panel lo muestra en la cabecera (§9). La primera vez, la fecha se escribe a
  mano en la configuración manual (§14) como "hoy + 60 días".

### 10.3 Composición y límites del caption

```
<caption>

Fuente: <medio>

<hashtags separados por espacio>
```

Validaciones en código (aplican en GENERAR y al guardar desde el panel):
máximo 2 200 caracteres en total, máximo 30 hashtags, máximo 20 menciones,
sin líneas vacías triples. Si Claude excede un límite, se recorta el caption
por párrafos completos y se registra.

## 11. Franjas horarias

- `franjas.mjs` recibe la lista de posts `programado`, la hora actual y las
  franjas de `config.json`, y devuelve la primera franja (hoy o en días
  siguientes) que esté libre y sea posterior a `ahora + 15 min`. Una franja
  está ocupada si ya hay un post programado a esa hora exacta.
- Toda la lógica de fechas usa `Intl.DateTimeFormat` con `timeZone`
  `America/Panama` (UTC−5 sin horario de verano). Los cron de GitHub están en
  UTC; el código convierte.
- El panel permite escribir cualquier hora futura, con validación de que no
  choque con otra programada (aviso, no bloqueo).

## 12. Flujos de trabajo de GitHub Actions

| Workflow | Disparador | Hace | Secretos |
|---|---|---|---|
| `generar.yml` | cron `20 */3 * * *`, manual, push a `main` (ignora `posts/**`, `data/**`, `public/img/**`) | GENERAR + build `dist/` + deploy Pages | `ANTHROPIC_API_KEY` |
| `regenerar.yml` | cron `40 * * * *`, push con cambios en `posts/**`, manual | REGENERAR + deploy Pages si cambió algo | — |
| `publicar.yml` | cron `*/30 * * * *`, manual | PUBLICAR | `IG_ACCESS_TOKEN`, `IG_USER_ID` |
| `renovar-token.yml` | cron `0 14 * * 1` (lunes 9:00 Panamá), manual | refresca token y actualiza secreto | `IG_ACCESS_TOKEN`, `GH_PAT` |

- Los cuatro comparten `concurrency: { group: sinlinea, cancel-in-progress: false }`.
- Los commits de los workflows usan `GITHUB_TOKEN` (no disparan otros
  workflows, evitando bucles); los commits del panel usan el token fino de la
  persona (sí disparan `regenerar.yml`, que es lo deseado).
- Antes de hacer push, cada workflow hace `git pull --rebase` y reintenta el
  push hasta 3 veces.
- Playwright: instalar solo Chromium con caché de `~/.cache/ms-playwright` por
  versión para acortar la corrida.
- Node 20 en Actions (misma versión que Que Hay Panamá); localmente funciona
  con Node 20 o superior.

## 13. Manejo de errores y seguridad

- Feed caído: se registra y se continúa. Todos caídos: la corrida termina sin
  cambios.
- Artículo no descargable: se usa solo el feed; Claude recibe la nota
  "texto no disponible".
- Claude falla o devuelve JSON inválido según el esquema: la corrida aborta sin
  commit.
- Render falla para un post: el post se guarda igualmente con `estado = error`,
  `paso = render`, para que sea visible y reintentable desde el panel (el
  reintento lo hace REGENERAR).
- Instagram rechaza: `estado = error`, `paso = instagram`, mensaje literal de la
  API. Reintentar desde el panel vuelve a `programado`.
- Conflictos de escritura: rebase en workflows, bloqueo optimista con `sha` en
  el panel.
- Secretos solo en GitHub Secrets. El token del panel solo en el navegador.
  Ningún secreto en `config.json` ni en el código.
- El panel no acepta contenido de terceros ni ejecuta nada que venga de los
  JSON más allá de mostrar texto (escapado) e imágenes.

## 14. Configuración manual (guiada paso a paso al terminar el código)

1. Guardar el logo como `assets/logo.png` (fondo transparente o el círculo
   amarillo completo, mínimo 512×512).
2. Crear el repositorio público `sinlinea` en GitHub, subir el código, activar
   Pages con origen "GitHub Actions".
3. Crear una clave en console.anthropic.com → secreto `ANTHROPIC_API_KEY`.
4. En developers.facebook.com: crear una app, agregar el producto "Instagram"
   con "Instagram API with Instagram Login", en "Roles" agregar la cuenta
   @sinlinea como Instagram Tester, aceptar la invitación desde la app de
   Instagram (Configuración → Sitios web y apps → Invitaciones de tester),
   generar el token de acceso desde el panel de la app con los permisos
   `instagram_business_basic` e `instagram_business_content_publish`, obtener
   el `user_id` con `GET /me?fields=user_id,username`. Secretos
   `IG_ACCESS_TOKEN` e `IG_USER_ID`.
5. Crear dos tokens finos de GitHub limitados al repositorio `sinlinea`: uno
   para el celular (Contents: lectura y escritura) y otro como secreto `GH_PAT`
   (Secrets: lectura y escritura).
6. Completar `config.json`: `pages.baseUrl` y `marca.usuario`. Escribir en
   `data/token-info.json` la fecha de vencimiento del token (hoy + 60 días).
7. Ejecutar `generar.yml` a mano, abrir el panel, aprobar un post con hora
   cercana y verificar la primera publicación real.

## 15. Fase 2 (no se construye ahora, pero el diseño la permite)

- **Carrusel**: varias imágenes por post (`imagenes[]` en el JSON), contenedores
  hijos con `is_carousel_item=true` y un contenedor `media_type=CAROUSEL`.
  La plantilla v1 se escribe por bloques (cabecera, cuerpo, pie) para poder
  reutilizarlos en las láminas del carrusel.
- **Historias**: `media_type=STORIES` con una plantilla 1080×1920.
- **Foto del artículo**: variante `foto` con la imagen de la fuente y crédito,
  previa revisión de derechos de uso.
- **Avisos**: mensaje a Telegram/WhatsApp cuando GENERAR deja borradores nuevos.
- **Métricas**: leer insights de los posts publicados para retroalimentar la
  selección.
- **Migración a servidor propio** (Opción B): `redactor`, `render`, `instagram`
  y `franjas` se reutilizan sin cambios; solo cambian `posts.mjs` (estado en
  base de datos) y el panel (servido por la app).

## 16. Pruebas

- Unitarias con `node:test` (`npm test`): parseo de feeds con fixtures reales
  de La Prensa y Google Noticias; deduplicación por URL; purga de `seen`;
  `franjas.mjs` con casos de borde (medianoche, día lleno, franja ocupada);
  transiciones de estado válidas e inválidas; composición y límites del
  caption; `instagram.mjs` con `fetch` simulado (contenedor, sondeo, publicación,
  errores 4xx/5xx, cuota agotada); `redactor.mjs` con el SDK simulado (respuesta
  válida, inválida, índices fuera de rango); cálculo de `imagen.hash`.
- Integración local: `npm run preview` levanta un servidor con posts de ejemplo
  para ver la plantilla en las tres variantes y el panel en modo lectura;
  `npm run generar -- --dry-run` y `npm run publicar -- --dry-run`.
- Aceptación: primera corrida real en Actions, aprobación desde el celular y
  publicación real en @sinlinea.
