# Arquitectura de Sin Línea

Estado documentado: 2026-09-08 (actualizado tras M1/M2 y la fase 1 del panel maestro).
Propósito: describir cómo funciona hoy el sistema (una sola cuenta), qué se
reutiliza tal cual, y cómo evoluciona hacia un panel multi-cuenta para medios
digitales sin reescribir lo que ya funciona. El plan por etapas está en
[ROADMAP.md](ROADMAP.md).

## 1. Qué es hoy

Un sistema semiautomático que lee noticias de Panamá, redacta posts con Claude,
genera una ilustración con Gemini, dibuja una imagen 1080×1350 y la publica en
Instagram tras la aprobación de una persona desde un panel web. Todo corre en
GitHub: Actions como cron, el repositorio como base de datos y GitHub Pages
como hosting del panel y de las imágenes. Costo de infraestructura: 0.

Cifras del código: 21 módulos en `src/` (≈1.900 líneas), panel de 3 archivos
(≈500 líneas), 1 plantilla HTML, 27 archivos de pruebas (157 unitarias, 12 de
render en Chromium, 6 de panel de extremo a extremo).

## 2. Flujos y componentes

```mermaid
flowchart LR
  subgraph Fuentes
    LP[La Prensa RSS]
    LE[La Estrella portada]
  end
  subgraph Actions[GitHub Actions]
    G[GENERAR cada 3 h]
    R[REGENERAR cada hora y al cambiar posts/]
    P[PUBLICAR cada 30 min]
    T[RENOVAR TOKEN lunes]
  end
  subgraph Repo[Repositorio = base de datos]
    POSTS[(posts/*.json)]
    IMG[(public/img, public/ilus)]
    DATA[(data/<cuenta>/seen.json, token-info.json)]
  end
  PANEL[Panel en GitHub Pages]
  IG[Instagram API]
  LP --> G
  LE --> G
  G -- Claude + Gemini + Chromium --> POSTS
  G --> IMG
  G --> DATA
  R -- Chromium, Gemini, Claude --> POSTS
  R --> IMG
  POSTS <-- API de contenidos + token --> PANEL
  P -- lee programados --> POSTS
  P -- URL pública de la imagen --> IG
  T --> DATA
```

### 2.1 GENERAR (`src/generar.mjs`)
1. Por cada cuenta activa (`generarCuentas`): lee su configuración efectiva y
   sus posts; calcula el cupo diario restante de esa cuenta.
2. Recolecta candidatos (`lib/fuentes.mjs` → `rss.mjs`, `portada.mjs`,
   `articulo.mjs`), filtrando URLs ya vistas (`lib/seen.mjs`) y ya usadas.
3. Claude (`lib/redactor.mjs`, salida estructurada con Zod) elige hasta
   `maxPorCorrida` noticias y redacta titular, bajada, caption, hashtags y
   escena de la ilustración, con la línea editorial de `cuentas/<id>/editorial.md`.
4. Por cada post: ilustración con Gemini (`lib/ilustrador.mjs`), render con
   Chromium + sharp (`lib/render.mjs` + `templates/post.html`) con acortado
   automático del texto si no cabe (`lib/texto.mjs`), y escritura de
   `posts/<id>.json` en estado `borrador`.
5. Marca las URLs como vistas, archiva posts antiguos y hace commit + push.

### 2.2 REGENERAR (`src/regenerar.mjs`)
Corrige lo que quedó desfasado: redacta escenas vacías (Claude), genera
ilustraciones pendientes (Gemini, máximo `maxPorCorrida` por corrida), y vuelve
a dibujar los posts cuyo `imagen.hash` no coincide con el texto actual, cuya
plantilla cambió de versión o cuyo render falló. Se dispara cada hora y en cada
push que toque `posts/` (es decir, tras cada edición desde el panel).

### 2.3 Panel (`panel/`)
Página estática sin framework. Lista los posts por estado (borrador,
programado, publicado, descartado), permite editar textos, escena e
ilustración, aprobar con una franja horaria, descartar, reintentar. Escribe
directamente en el repositorio con la API de contenidos de GitHub usando un
token de acceso fino guardado en `localStorage` (`panel/almacen.mjs`), con
bloqueo optimista por `sha` y un reintento en caso de conflicto. En local usa
`src/serve.mjs` (`/api/posts`). Comparte lógica con el servidor a través de
módulos isomorfos copiados a `dist/panel/lib/` por `src/build.mjs`.

### 2.3b Panel maestro (`panel/`, fase 1)

Misma página estática, tres vistas: **posts** (la de siempre, por cuenta),
**Todas las cuentas** y **formulario de cuenta**. El botón "Cuentas" de la
cabecera alterna entre la primera y la segunda; la elección se recuerda.

- **Datos en vivo.** La lista de cuentas se lee del repositorio en cada carga
  (`almacen.listarCuentas()`): `config.json` global, `cuentas/<id>/config.json`
  (con su `sha`), presencia de `logo.png`, `data/<id>/conexion.json` y
  `data/<id>/token-info.json`. `panel/config.json` (generado por `build.mjs`)
  queda solo como reserva si esa lectura falla. La editorial se lee al abrir el
  formulario.
- **Tarjeta por cuenta.** Logo (o iniciales con los colores de la marca),
  nombre, @, id, idioma; estado de generación y de publicación automáticas por
  separado; estado de conexión; contadores de borradores y programados (de los
  posts ya cargados); nombres exactos de los secretos de Instagram (nunca sus
  valores); acciones Abrir panel, Editar, Verificar identidad, Archivar o
  Reactivar.
- **Alta y edición.** `src/lib/cuenta.mjs` (isomorfo) reúne las reglas:
  validación del formulario con mensajes por campo (`erroresDeCuenta`),
  plantilla de `editorial.md` a partir de temas, tono e idioma
  (`plantillaEditorial`), conversión formulario ↔ `config.json`
  (`configDesdeFormulario`, `formularioDesdeConfig`), archivar/reactivar y el
  cálculo del estado de conexión (`estadoConexion`). `config.mjs` importa de
  ahí las constantes compartidas, así el servidor y el navegador validan igual.
  Una cuenta nueva se escribe en este orden: `cuentas/<id>/config.json`,
  `cuentas/<id>/editorial.md`, `cuentas/<id>/logo.png` (opcional) y, al final,
  su id en `cuentas` del `config.json` global. Empieza con `automatico.generar`
  y `automatico.publicar` en `false`, sin conexión verificada y con los nombres
  de secretos sugeridos `IG_ACCESS_TOKEN_<ID>` / `IG_USER_ID_<ID>`. Al editar,
  el id es de solo lectura y se conservan los campos que el formulario no toca
  (cupos, `automatico`, `archivada`, nombres de secretos ya declarados).
- **Archivar.** `archivada: true`, `archivadaEn` y automatizaciones apagadas
  (la validación lo exige). El id sigue en la lista global, los posts, imágenes
  e historial se conservan y el panel individual sigue mostrándolos con una
  nota. GENERAR, REGENERAR, PUBLICAR y RENOVAR TOKEN omiten la cuenta
  (`motivo: "archivada"`); `verificar` la informa como aviso. Reactivar la
  devuelve a la lista activa con las automatizaciones apagadas.
- **Persistencia.** El almacén de GitHub gana `leerArchivo`, `escribirArchivo`,
  `escribirBinario`, `escribirArchivos`, `listarCuentas` y `solicitarVerificacion`.
  Los cambios de un solo archivo (archivar, reactivar, marcar pendiente) van por
  la API de contenidos con bloqueo optimista por `sha`. El alta y la edición van
  por `escribirArchivos`, que usa la API de git (blobs → árbol → commit → ref
  con `force: false`): comprueba el `sha` de todos los archivos contra la punta
  de la rama, sube los blobs, crea un único commit y mueve la ref; si la rama
  avanzó entre medias (422), rehace todo sobre la punta nueva. Así un alta
  escribe `config.json`, `editorial.md`, el logo y la lista global **de forma
  atómica**: o entra todo o no entra nada, y nunca queda una cuenta a medias.
  Un conflicto se traduce en `ErrorConflictoArchivo` con la versión actual: el
  formulario avisa, conserva lo escrito, actualiza el `sha` y el siguiente
  Guardar escribe sobre la versión nueva; si lo que cambió fue la lista global,
  se rehace solo una vez. En local, `serve.mjs` expone lo mismo (`/api/cuentas`,
  `/api/archivo`, `/api/archivos` como lote todo-o-nada, `/api/verificar-conexion`)
  con una lista blanca de rutas (`config.json`,
  `cuentas/<id>/{config.json,editorial.md,logo.png}`, `data/<id>/conexion.json`),
  el sha de blob de git como versión y la misma validación (`validarGlobal`,
  `validarCuenta`) antes de escribir. **Garantía real en local**: no hay
  atomicidad del sistema de archivos; hay recuperación garantizada. El lote
  completo se escribe primero en un diario (`temp/escritura-pendiente.json`),
  luego se aplica archivo a archivo escribiendo en `.tmp` y renombrando (nunca
  queda un archivo truncado) y al final se borra el diario. Si el proceso muere
  entre medias, la siguiente arrancada de `serve.mjs` (o la siguiente petición
  de `/api/cuentas` o `/api/archivos`) vuelve a aplicar el lote entero, que es
  idempotente. Un diario ilegible se aparta como `.corrupto` y se avisa. Entre
  la interrupción y la recuperación el disco puede estar a medias; nunca lo
  está después. En GitHub el lote es un único commit: ahí sí es atómico.
- **Conexión con Instagram.** Seis estados, calculados en `estadoConexion` a
  partir de `data/<id>/conexion.json`, de la configuración de la cuenta y de los
  nombres de secretos que llegan a los workflows (leídos del `env` de
  `publicar.yml` y `probar-instagram.yml`). Nunca se deduce "conectada" de tener
  usuario o secretos:
  1. *Conexión sin verificar*: no hay verificación; **no se afirma** que falten
     credenciales, porque el panel no sabe si los secretos existen.
  2. *Conexión pendiente de configuración*: los nombres de secretos de la cuenta
     no llegan a los workflows (cuentas dadas de alta desde el panel hasta la
     fase 2). Tiene prioridad sobre cualquier verificación previa y el botón
     "Verificar identidad" queda deshabilitado.
  3. *Credenciales pendientes*: solo cuando Probar Instagram lo comprobó (falta
     un secreto, o falta el id numérico y la API indica cuál guardar), con fecha.
  4. *Pendiente de verificación*: solicitada desde el panel (con fecha), o
     invalidada porque cambió el usuario de Instagram o el nombre de los secretos
     (el panel escribe `{ estado: "pendiente", motivo: "cambio", anterior }` en la
     misma escritura atómica que la edición; además `estadoConexion` compara el
     `usuario` y los `secretos` guardados en la verificación con la configuración
     actual, así que un cambio hecho fuera del panel también la invalida), o
     un secreto se actualizó en GitHub **después** de la última comprobación
     (mismo nombre, valor nuevo: el panel lee la fecha `updated_at` de cada
     secreto con la API, solo nombres y fechas; requiere el permiso *Secrets:
     lectura* en el token del panel, y si no puede consultarlo la tarjeta lo
     dice en vez de dar la verificación por buena), o hay `token-info` sin
     identidad comprobada. Un secreto que la API dice que no existe se muestra
     como credencial pendiente comprobada.
  5. *Identidad verificada*: la prueba compara el usuario devuelto por la API
     con `marca.usuario` **y** el `user_id` con el secreto del id numérico
     (falla cerrado si la API no devuelve `user_id`); PUBLICAR repite la misma
     comprobación antes de publicar y no publica si algo no coincide. La
     tarjeta muestra usuario, fecha y hora UTC de la última comprobación
     y antigüedad; siempre acompañada del aviso de que un resultado pasado no
     garantiza que la conexión siga válida (más de 7 días se marca como antigua).
  6. *Error de conexión*: mensaje, `code` y `error_subcode` de la API, con fecha,
     sin credenciales.
  Probar Instagram guarda en `conexion.json` el estado, el usuario, la fecha y
  los nombres de secretos con los que verificó; el workflow lo confirma también
  cuando la prueba falla. "Verificar identidad" escribe el estado pendiente y
  lanza `probar-instagram.yml` por `workflow_dispatch` con el token del panel
  (permiso *Actions: lectura y escritura*; si falta, el panel lo explica y remite
  a lanzarlo a mano). Las tarjetas muestran "Última comprobación: fecha UTC".
- **Archivar y reactivar.** Archivar apaga generación y publicación y conserva
  la cola; reactivar deja **ambas apagadas** hasta que el operador las habilite
  expresamente, y la cola sigue sin publicarse (PUBLICAR la deja en espera). El
  panel lo recuerda al reactivar, con el número de programados en cola.

### 2.4 PUBLICAR (`src/publicar.mjs`)
Cada 30 minutos toma los posts `programado` cuya hora ya pasó y los publica con
`lib/instagram.mjs` (contenedor → sondeo → publicación → permalink), usando la
URL pública de la imagen en GitHub Pages. Avisa cuando el token está por vencer.

### 2.5 Módulos

| Módulo | Responsabilidad | Isomorfo | Depende de |
|---|---|---|---|
| `lib/config.mjs` | Carga y valida `config.json` (global) y `cuentas/<id>/config.json`; configuración efectiva por cuenta | no | `secretos.mjs` |
| `lib/secretos.mjs` | Nombres de secretos por cuenta, lectura desde el entorno, filtro de valores | no | — |
| `lib/rss.mjs`, `portada.mjs`, `articulo.mjs`, `fuentes.mjs` | Descarga y normaliza candidatos por fuente | no | `util.mjs` |
| `lib/seen.mjs` | URLs ya consideradas (`data/<cuenta>/seen.json`) | no | — |
| `lib/corrida.mjs` | Código de salida y anotaciones `::error::` de las corridas multi-cuenta | no | — |
| `lib/redactor.mjs` | Prompts y llamadas a Claude: selección/redacción, acortado de textos, escena | no | SDK Anthropic, `texto.mjs`, `estados.mjs` |
| `lib/caption.mjs` | Composición y límites del caption | **sí** | — |
| `lib/texto.mjs` | Límites titular/bajada, render con ajuste | **sí** | — |
| `lib/estados.mjs` | Estados, transiciones, hashes, `necesitaIlustracion`, `necesitaEscena` | **sí** | — |
| `lib/franjas.mjs`, `fechas.mjs` | Horarios y fechas en zona de Panamá | **sí** | — |
| `lib/posts.mjs` | Validación, ids, rutas, lectura/escritura, archivo | no | `estados.mjs` |
| `lib/ilustrador.mjs` | Cliente de Gemini (imágenes) y guardado JPEG | no | sharp |
| `lib/render.mjs` | Datos de plantilla, HTML, captura con Chromium | no | Playwright, sharp |
| `lib/instagram.mjs` | Cliente de la Instagram API (Instagram Login) | no | — |
| `generar/regenerar/publicar/renovar-token.mjs` | Orquestadores con dependencias inyectables | no | todo lo anterior |
| `build.mjs`, `serve.mjs` | Construcción de `dist/` y servidor local | no | — |
| `panel/app.js`, `almacen.mjs` | Interfaz y almacenes (local / GitHub) | navegador | módulos isomorfos |

Los módulos isomorfos no importan nada de Node y son la única lógica compartida
entre servidor y navegador.

### 2.6 Modelo de datos

Un archivo JSON por post en `posts/`:

```
id, estado (borrador | programado | publicado | descartado | error),
fuente { medio, url, titulo, fecha }, categoria, variante (negro | amarillo | rojo),
titular, bajada, caption, hashtags[], creado, actualizado, programado,
imagen { ruta, url, hash, version, renderizada } | null,
ilustracion { descripcion, usar, ruta, hashDescripcion, proveedor, modelo, generada, error } | null,
publicacion { idMedia, permalink, fecha } | null, error { paso, mensaje, fecha } | null
```

`imagen.hash` resume el texto visible, la variante, la ilustración usada y la
versión de la plantilla: si algo cambia, REGENERAR vuelve a dibujar. La
plantilla declara `data-version`; subirla re-dibuja todos los posts activos una
vez. Los posts publicados o descartados se mueven a `posts/archivo/<mes>/`
tras `archivarDespuesDeDias`.

### 2.7 Configuración y secretos

- `config.json` (global): zona horaria por defecto, `pages.baseUrl`, modelo y
  esfuerzo de Claude, versión de la API de Instagram, ilustraciones (activo,
  proveedor, modelo, tamaño, tiempo de espera, tope por corrida), días de
  archivo y la lista `cuentas` (la primera es la principal).
- `cuentas/<id>/config.json`: nombre, idioma, marca, fuentes, cupos, franjas,
  estilo y rótulo de ilustración, nombres de los secretos de Instagram.
  `cuentas/<id>/editorial.md` (system prompt) y `cuentas/<id>/logo.png`.
- `templates/post.html` y `assets/fonts/` (compartidos).
- Secretos del repositorio: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`,
  `IG_ACCESS_TOKEN`, `IG_USER_ID` (y `GH_PAT`, pendiente, para renovar el
  token de Instagram). El token del panel vive solo en el navegador.
- `lib/secretos.mjs` (M0): convención de nombres por cuenta
  (`IG_ACCESS_TOKEN_<ID>`), lectura de secretos por nombre desde el entorno,
  lista de secretos requeridos y filtro `ocultarSecretos` que tapa tokens y
  claves en todo mensaje que se registra o se guarda. `src/verificar.mjs`
  (`npm run verificar` y el workflow manual "Verificar configuración y
  secretos") informa qué falta sin mostrar valores.

- **Estado de conexión por cuenta**: `data/<id>/conexion.json`
  (`estado`, `usuario`, `comprobado`, `detalle`), escrito por Probar Instagram
  (verificada, error, credenciales pendientes) y por el panel (pendiente).
  Nunca contiene valores de secretos; `detalle` pasa por `ocultarSecretos`.
- **Origen de credenciales por cuenta (fase 2, implementada).**
  `cuentas/<id>/config.json` → `instagram.origen` vale `repositorio` (modo
  actual: secretos de repositorio con el nombre declarado) o `entorno`
  (Environment de GitHub `cuenta-<id>` con `IG_ACCESS_TOKEN` e `IG_USER_ID`).
  `lib/secretos.mjs` lo hace explícito: `origenDeSecretos`, `nombreEntorno`,
  `nombresDeSecretos(config, { porCuenta })`, `describirCredenciales` (texto
  que va a los registros y a `conexion.json`). Los workflows de Instagram
  (PUBLICAR, RENOVAR TOKEN, Probar Instagram, Verificar) tienen un job
  `cuentas` que lee `config.json` con `src/cuentas-activas.mjs` y emite dos
  matrices, y dos jobs por matriz: `*-entorno` (`environment:
  ${{ matrix.entorno }}`, secretos del Environment) y `*-repositorio`
  (`secrets[matrix.tokenSecreto]` / `secrets[matrix.usuarioIdSecreto]`). Cada
  job expone **solo** las dos credenciales de su cuenta con los nombres fijos y
  ejecuta el orquestador con `--cuenta <id> --por-cuenta`; `fail-fast: false`
  (un fallo no cancela a las demás), `max-parallel: 1` y el job de modo actual
  espera al de entorno (`always()`), así los commits del bot no se pisan y un
  post solo puede publicarlo el job de su cuenta. **Sin fallback entre
  orígenes**: en modo entorno, si faltan los secretos el orquestador falla
  nombrando el entorno; y como GitHub aplica el secreto de repositorio del mismo
  nombre cuando el entorno no lo define, `.github/scripts/comprobar-entorno.sh`
  compara la huella sha256 del `IG_ACCESS_TOKEN` recibido con la del secreto de
  repositorio (calculada en el job `cuentas`, sin entorno) y rechaza la corrida
  si coinciden. Sin `--por-cuenta` (ejecución conjunta, local), las cuentas en
  modo entorno se omiten con motivo explícito y su cola se conserva. Añadir una
  cuenta ya no requiere editar workflows. Permisos según la documentación
  oficial de la API REST: leer/escribir secretos de Environment exige el permiso
  de repositorio *Environments* (read/write); los de repositorio, *Secrets*.
  El panel lee metadatos de ambos (`leerSecretosActualizados`,
  `leerSecretosDeEntorno`) para los estados de conexión y muestra el modo de
  cada cuenta; el formulario permite elegirlo y cambiarlo invalida la
  verificación anterior.

### 2.8 Convenciones
Node 20+ ESM en español; dependencias inyectables en todos los orquestadores
(`fetchText`, `client`, `render`, `ilustrador`, `guardar`, `acortar`,
`redactarEscena`, `ig`); `node:test`; commits del bot con `[skip ci]` salvo el
último; grupo de concurrencia `sinlinea` para que las corridas no se pisen;
todo dato del panel se pinta con `textContent` (sin HTML inyectado).

## 3. Supuestos de "una sola cuenta" (estado tras M1)

Resueltos en M1: configuración por cuenta (`cuentas/<id>/`), línea editorial y
logo por cuenta, secretos por nombre, `data/<id>/` por cuenta, campo `cuenta` en
los posts nuevos (los antiguos se leen como de la cuenta principal), ids con
cuenta, selector en el panel, bucle por cuenta en los cuatro flujos con
aislamiento de fallos. Pendiente (M2): colores de la plantilla por cuenta y los
nombres de secretos de cuentas adicionales en el `env` de los workflows.

La tabla original, como referencia de lo que estaba acoplado:

| Supuesto | Dónde vive |
|---|---|
| Una marca (nombre, usuario, lema, logo, colores) | `config.json → marca`, `assets/logo.png`, variables CSS de la plantilla |
| Una línea editorial | `prompts/editorial.md` |
| Un conjunto de fuentes, franjas, cupos y estilo de ilustración | `config.json` |
| Un token y un usuario de Instagram | secretos `IG_ACCESS_TOKEN`, `IG_USER_ID`; `publicar.mjs`, `renovar-token.mjs` |
| Una memoria de URLs vistas y una fecha de vencimiento del token | `data/seen.json`, `data/token-info.json` |
| Posts, imágenes e ilustraciones en carpetas planas | `posts/`, `public/img/`, `public/ilus/`; `posts.mjs` (`rutaImagen`, `rutaIlustracion`, `leerPosts`, `archivar`) |
| Ids sin cuenta (`fecha-hora-medio-hash`) | `posts.mjs → nuevoId` |
| El panel no sabe de cuentas: lista todo, usa las franjas y la marca globales | `panel/app.js`, `panel/config.json` (generado por `build.mjs` y `serve.mjs`) |
| Un mismo grupo de concurrencia y un mismo `git add` de rutas | `.github/workflows/*.yml` |

Ninguno de estos supuestos está enredado con la lógica de negocio: los módulos
reciben `config`, rutas y clientes por parámetro. Eso es lo que hace viable
una migración gradual.

## 4. Qué se reutiliza tal cual

Sin cambios de código (solo reciben otra configuración o ruta):
`rss.mjs`, `portada.mjs`, `articulo.mjs`, `fuentes.mjs`, `redactor.mjs`,
`caption.mjs`, `texto.mjs`, `estados.mjs`, `franjas.mjs`, `fechas.mjs`,
`ilustrador.mjs`, `instagram.mjs`, `render.mjs` (ya recibe `logoUrl` y los
textos de marca como datos), `seen.mjs` (recibe la ruta), `util.mjs`,
`templates/post.html` (los colores y el logo entran como datos/variables),
`panel/almacen.mjs`, los workflows en su forma actual, y las 27 suites de
pruebas.

Con adaptación pequeña y localizada:
`config.mjs` (cargar varias cuentas y producir la "configuración efectiva"),
`posts.mjs` (campo `cuenta`, id con cuenta, rutas por cuenta para `data/`),
los cuatro orquestadores (un bucle por cuenta alrededor del cuerpo actual),
`build.mjs` y `serve.mjs` (exponer la lista de cuentas al panel),
`panel/app.js` (selector y filtro por cuenta).

Nada se reescribe: el cuerpo de cada flujo queda idéntico y se ejecuta una vez
por cuenta.

## 5. Arquitectura objetivo

### 5.1 Concepto central: la cuenta

Una **cuenta** es una marca en Instagram con su propia configuración editorial.
Vive en `cuentas/<id>/`:

```
cuentas/
  sinlinea/
    config.json      marca, fuentes, franjas, cupos, ilustraciones.estilo/rotulo,
                     instagram { usuarioIdSecreto, tokenSecreto }, zonaHoraria (opcional)
    editorial.md     línea editorial (antes prompts/editorial.md)
    logo.png         logo (antes assets/logo.png)
  otro-medio/
    ...
```

`config.json` en la raíz conserva lo **global**: `pages.baseUrl`, `claude`,
`instagram.apiVersion`, `ilustraciones` (proveedor, modelo, tamaño, tiempo de
espera, tope por corrida), `archivarDespuesDeDias`, zona horaria por defecto y
la lista de ids de cuentas activas.

`configDeCuenta(global, cuenta)` devuelve un objeto con **la misma forma que el
`config.json` de hoy**. Así todos los módulos siguen recibiendo exactamente lo
que reciben ahora, sin conocer la existencia de otras cuentas.

### 5.2 Capas

```mermaid
flowchart TB
  subgraph Infra[Infraestructura: Actions + Pages + secretos]
  end
  subgraph Orq[Orquestadores: generar, regenerar, publicar, renovar-token]
    direction LR
    LOOP[por cada cuenta activa → configDeCuenta + secretos de la cuenta → cuerpo actual]
  end
  subgraph Serv[Servicios: fuentes, redactor, ilustrador, render, instagram]
  end
  subgraph Nucleo[Núcleo isomorfo: estados, caption, texto, franjas, fechas]
  end
  subgraph Datos[Almacenamiento: posts.mjs, seen.mjs, repositorio]
  end
  PANEL[Panel: selector de cuenta + tarjetas actuales]
  Infra --> Orq --> Serv --> Nucleo
  Orq --> Datos
  PANEL --> Nucleo
  PANEL --> Datos
```

- **Núcleo isomorfo**: sin cambios. Es la garantía de que panel y servidor
  calculan lo mismo (hashes, estados, límites).
- **Servicios**: sin cambios; reciben la configuración efectiva de la cuenta.
- **Orquestadores**: el único cambio estructural es el bucle por cuenta y la
  resolución de secretos por cuenta. Los cupos (`maxBorradoresPorDia`,
  `maxPorCorrida`) se aplican por cuenta.
- **Almacenamiento**: cada post lleva `cuenta`; `data/<cuenta>/` guarda la
  memoria de URLs y la información del token; las imágenes siguen en carpetas
  planas porque el id ya las hace únicas.
- **Panel**: un selector de cuenta arriba (chips), filtro de tarjetas por
  `cuenta`, franjas y marca de la cuenta seleccionada al aprobar. El almacén
  no cambia (sigue escribiendo `posts/<id>.json`).
- **Infraestructura**: mismos workflows. Los secretos por cuenta se nombran en
  la configuración de la cuenta (`tokenSecreto: "IG_ACCESS_TOKEN_OTROMEDIO"`)
  y el workflow los expone como variables de entorno; la cuenta `sinlinea`
  apunta a los nombres actuales, así que no hay que tocar secretos existentes.

### 5.3 Reglas de diseño para la migración
1. La cuenta por defecto (`sinlinea`) debe comportarse igual que hoy: mismas
   corridas, mismos secretos, mismas rutas de imágenes.
2. Los posts existentes no se reescriben: `leerPosts` completa `cuenta:
   "sinlinea"` en memoria cuando falta. Solo los posts nuevos llevan el campo.
3. Cada cambio se prueba con las suites actuales (deben seguir en verde) más
   pruebas nuevas que ejerzan dos cuentas a la vez.
4. Ningún módulo de servicio recibe "la lista de cuentas": solo el orquestador
   la conoce.

### 5.4 Límites conocidos de la infraestructura actual

- **Un solo escritor con permisos totales**: el token del panel puede escribir
  en todo el repositorio. Sirve para un operador (o un equipo de confianza)
  que gestiona varias cuentas. No sirve para que cada medio entre y vea solo
  lo suyo: eso requiere un servicio con autenticación (ver ROADMAP, M6).
- **Minutos de Actions**: hoy ≈ 8 corridas de GENERAR, 24 de REGENERAR y 48
  de PUBLICAR al día (≈ 2-5 min cada una con Chromium). Con N cuentas el
  tiempo de GENERAR y REGENERAR crece casi linealmente; con 3-4 cuentas sigue
  dentro del plan gratuito si el repositorio es público. Mitigación: una sola
  corrida procesa todas las cuentas (un arranque de Chromium, no N).
- **Tamaño del repositorio**: cada post añade ≈ 250-650 KB (render +
  ilustración). El archivo borra la ilustración; la imagen final se conserva.
  Con varias cuentas conviene una limpieza periódica del historial o mover
  imágenes viejas fuera del repositorio (M4).
- **Cuotas de API**: Claude y Gemini se comparten entre cuentas con una sola
  clave; los costos por cuenta se estiman por el registro de las corridas
  (tokens y llamadas por cuenta, M3).

- **Secretos por cuenta en los workflows**: hoy cada nombre de secreto va
  escrito en el `env` de cuatro workflows; una cuenta dada de alta desde el
  panel no puede verificarse hasta que se añadan. Ver 2.7 (GitHub Environments)
  para el mecanismo que entrega a cada job solo sus credenciales.
- **Escrituras del panel maestro en el repositorio**: cada archivo guardado es
  un commit (alta = 3-4 commits) y cada push a `cuentas/**` dispara GENERAR (que
  solo crea borradores; las cuentas nuevas nacen apagadas). Es aceptable para
  un operador; con muchos altas al día convendría agrupar en un solo commit vía
  la API de git (árboles), sin cambiar el panel.

### 5.5 Camino a un servicio propio (cuando haga falta)

La arquitectura por capas permite sustituir solo la capa de infraestructura:
un servidor pequeño (Node) que ejecute los mismos orquestadores con un
programador de tareas, guarde los posts en una base de datos o en disco, sirva
el panel con inicio de sesión y roles por cuenta, y exponga las imágenes por
HTTPS. `serve.mjs` ya es el embrión de ese servidor y el panel ya tiene dos
almacenes intercambiables (`crearAlmacenLocal`, `crearAlmacenGitHub`): un
tercer almacén contra ese servidor es el único cambio en el panel.
