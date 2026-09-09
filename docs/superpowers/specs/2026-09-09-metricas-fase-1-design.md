# Métricas del Panel Maestro · fase 1 (recogida diaria y vista por cuenta) — diseño

Fecha: 2026-09-09. Estado: **propuesta, sin implementar**. Sustituye a la "Fase 3 ·
Recogida y almacenamiento de métricas" de ROADMAP.md (M3b) y adelanta la vista
mínima que allí se dejaba para la fase 4. Las recomendaciones editoriales
(fase 5) quedan para cuando haya datos reales acumulados.

Reglas que este diseño respeta en todo momento: no activa automatizaciones, no
publica, no cambia credenciales ni borra secretos; nunca escribe ni imprime
valores de secretos; un dato ausente se guarda como `null` y se muestra como
"no disponible", nunca como 0.

---

## 1. Qué se puede consultar con la Instagram API with Instagram Login

Fuente: documentación oficial de Meta consultada el 2026-09-09 (referencias al
final). La API que usa el sistema es `graph.instagram.com` con tokens de
Instagram Login (§2.4 de ARCHITECTURE.md), versión `v23.0` en `config.json`.

### 1.1 Dos niveles de permiso

| Permiso | Ya lo tienen los tokens actuales | Qué da para métricas |
|---|---|---|
| `instagram_business_basic` | Sí (es el permiso con el que se publica y se verifica la identidad) | Campos del perfil (`followers_count`, `follows_count`, `media_count`) y la lista de publicaciones con `like_count`, `comments_count`, `timestamp`, `permalink`, `media_type` |
| `instagram_business_manage_insights` | **No** (no está en los permisos del caso de uso de las apps de Meta ni en los tokens generados) | Estadísticas de cuenta (`/insights` del usuario) y de cada publicación (`/insights` del medio): alcance, vistas, interacciones, guardados, compartidos… |

Notas de la documentación:
- La referencia de insights de cuenta y de medio exige `instagram_business_basic`
  + `instagram_business_manage_insights` para Instagram Login. La página de
  visión general de Instagram Login solo lista cuatro permisos (basic,
  content_publish, manage_comments, manage_messages); el de insights existe y
  aparece en la referencia de permisos, pero conviene **confirmar en el panel
  de la app de Meta** (Use cases → Customize → Permissions and features) que se
  puede añadir. Si no apareciera, la fase 1 funciona igualmente con el nivel
  básico (§1.2) y las estadísticas quedan "no disponibles".
- Con la app en modo desarrollo, los permisos funcionan para las cuentas con
  rol en la app (administrador y Instagram Testers) **sin App Review**. Es el
  caso de @sinlinea.pa (app "sinlinea") y de @luiseskivelgolcher (app "sin
  linea test"). App Review solo haría falta para cuentas de terceros.
- Un token lleva los permisos que se concedieron al generarlo. Para usar el
  nivel de estadísticas hay que **regenerar el token** de cada cuenta después
  de añadir el permiso a la app, y guardarlo en el Environment `cuenta-<id>`
  (lo pega el operador; el asistente solo pone nombres). Sin Línea tiene que
  regenerar su token de todos modos (código 190): conviene hacerlo ya con el
  permiso de estadísticas y directamente en `cuenta-sinlinea`.
- Solo cuentas profesionales (empresa o creador). Las dos cuentas del sistema
  lo son (la API de publicación ya lo exige).

### 1.2 Métricas de cuenta

**Con el nivel básico (campos del perfil, `GET /me?fields=…`):**

| Campo | Significado | Historial |
|---|---|---|
| `followers_count` | Total de seguidores en el momento de la consulta | Ninguno: solo el valor de hoy. La serie se construye guardándolo cada día |
| `follows_count` | Total de cuentas seguidas | Ídem |
| `media_count` | Total de publicaciones de la cuenta | Ídem |

**Con `instagram_business_manage_insights` (`GET /{ig-user-id}/insights`,
`period=day`, `metric_type=total_value`, `since`/`until` en UNIX):**

| Métrica | Significado (texto de Meta, resumido) | Requisitos |
|---|---|---|
| `reach` | Cuentas únicas que vieron contenido al menos una vez (estimada) | — |
| `views` | Veces que el contenido se reprodujo o mostró (sustituye a `impressions`, retirada en v22.0 y para todas las versiones el 21-04-2025) | Meta la marca "en desarrollo" |
| `accounts_engaged` | Cuentas que interactuaron (estimada) | — |
| `total_interactions` | Suma de interacciones en posts, historias, reels y vídeos | — |
| `likes`, `comments`, `shares`, `saves`, `reposts`, `replies` | Interacciones por tipo en el día | — |
| `follows_and_unfollows` | Cuentas que empezaron y dejaron de seguir | **≥ 100 seguidores** |
| `profile_links_taps` | Toques en botones de contacto | — |
| `follower_demographics`, `engaged_audience_demographics` | Distribución por país, ciudad, edad y género (`timeframe`, devuelve los 45 primeros) | ≥ 100 seguidores / ≥ 100 interacciones. **Fuera de la fase 1** |
| `follower_count`, `online_followers`, `profile_views`, `website_clicks` | Seguidores nuevos por día, seguidores conectados, visitas al perfil, clics en el sitio web | Documentadas en detalle solo para la API con Facebook Login; en la referencia de Instagram Login `follower_count` y `online_followers` aparecen únicamente en la nota de "≥ 100 seguidores" y `online_followers` "solo para los últimos 30 días". **Por confirmar en la prueba real (§5); mientras tanto, "no disponible"** |

Historial y límites que fija Meta:
- "User Metrics data is stored for up to 90 days": las estadísticas de cuenta
  **solo se pueden pedir hacia atrás 90 días**. Antes de eso no hay datos; por
  eso la recogida es diaria y acumulativa.
- Sin `since`/`until` la API devuelve las últimas 24 horas.
- "Data used to calculate metrics may be delayed up to 48 hours": el valor de
  un día puede cambiar durante dos días. La recogida repite los tres últimos
  días y sobrescribe (§3.3).
- "If insights data you are requesting does not exist or is currently
  unavailable the API will return an empty data set instead of 0": la API ya
  distingue ausencia de cero; el sistema conserva esa distinción.
- Cuentas con menos de 100 seguidores: varias métricas no existen. La cuenta
  personal está probablemente en ese caso; se mostrarán como "no disponibles",
  con el motivo.

### 1.3 Métricas de publicaciones

**Lista de publicaciones (`GET /{ig-user-id}/media`, nivel básico):** devuelve
los medios de la cuenta profesional **con independencia de cómo se publicaron**
(desde el sistema por la API o directamente desde la app de Instagram), hasta
"a maximum of 10K of the most recently created media", con paginación por
cursor y filtros `since`/`until`. Historias excluidas (endpoint aparte, solo 24
h; fuera de la fase 1). Campos útiles por medio: `id`, `media_type` (IMAGE,
VIDEO, CAROUSEL_ALBUM), `timestamp`, `permalink`, `caption`, `like_count`,
`comments_count`, `is_shared_to_feed`. Reserva: `like_count` "is omitted if the
media owner has hidden like counts" cuando se consulta indirectamente; y
`media_product_type` (FEED/REELS) no está en la lista de campos de Instagram
Login, así que el tipo se deriva de `media_type` + `is_shared_to_feed` si la
API no lo devuelve (por confirmar en §5).

Cómo se distingue el origen: el sistema guarda `publicacion.idMedia` en cada
post publicado (`posts/*.json`, p. ej. `18143614624563114`); si un medio de la
lista coincide, su origen es "sistema" (y se enlaza con el post: categoría,
franja, fuente, variante); si no, su origen es "instagram" (publicado a mano).
Así se cubre el contenido publicado directamente desde Instagram.

**Estadísticas por publicación (`GET /{ig-media-id}/insights`, con permiso de
insights):** son **totales acumulados desde la publicación** ("All metrics
return lifetime data; period parameter cannot override this"), sin serie
temporal por parte de Meta. La evolución diaria de cada post sale de restar dos
instantáneas consecutivas del sistema.

| Tipo | Métricas (Instagram Login) |
|---|---|
| Foto y carrusel | `reach`, `views`, `likes`, `comments`, `saved`, `shares`, `reposts`, `total_interactions`, `profile_visits`, `profile_activity`, `follows` |
| Reel | las anteriores + `ig_reels_avg_watch_time`, `ig_reels_video_view_total_time`, `reels_skip_rate` |
| Historias | `views`, `reach`, `replies`, `navigation`, `shares`, `profile_visits`, `follows` (solo 24 h; error código 10 si hay menos de 5 espectadores). **Fuera de la fase 1** |

Límites: "Metrics data is stored for up to 2 years"; "Insights data is not
available for any media within an Instagram Media album" (los hijos de un
carrusel no tienen estadísticas; el carrusel sí); `impressions` retirada para
medios creados desde el 2-07-2024 (el sistema no la pide); una combinación de
métrica y tipo no soportada devuelve error, que se registra como "no
disponible" con motivo, no como cero; retraso de hasta 48 h también aquí.

### 1.4 Límites de la API y coste de las llamadas

- Límite de caso de uso de Instagram (no mensajería): "Calls within 24 hours =
  4800 × Number of Impressions", donde las impresiones son las veces que
  contenido de la cuenta entró en pantalla en las últimas 24 h. Para cuentas
  pequeñas el cupo puede ser bajo; la documentación no fija un mínimo. La API
  informa del consumo en la cabecera `X-Business-Use-Case-Usage`
  (`call_count`, `total_cputime`, `total_time` en % y
  `estimated_time_to_regain_access` en minutos) y, al superarlo, responde con
  el error **80002**. Regla de Meta: "When the limit is reached, stop making
  API calls".
- Por eso la recogida tiene un **tope de llamadas por corrida**
  (`metricas.maxLlamadas`, por defecto 150), prioriza lo más reciente, se
  detiene al primer error de límite (códigos 4, 17, 32, 613, 80002) y deja el
  resto para el día siguiente marcando la entrada como incompleta.
- Llamadas estimadas por cuenta y día: 1 (perfil) + 3 (insights de cuenta,
  tres días) + 1-2 (lista de medios, 50 por página) + 1 por publicación en
  ventana (§3.2). Sin Línea con ~2 publicaciones/día y ventana de 90 días:
  ≈ 60-180 llamadas/día; la cuenta personal, ≈ 10. Muy por debajo del cupo
  salvo en cuentas casi sin impresiones (ahí el tope y la reanudación al día
  siguiente lo cubren).
- Token: sigue siendo el de 60 días con renovación semanal (RENOVAR TOKEN);
  la recogida no lo renueva ni lo toca.

---

## 2. Decisiones de diseño

1. **Interruptor propio.** Cada cuenta lleva `metricas.recoger` (booleano,
   por defecto `false`) en `cuentas/<id>/config.json`, **independiente de
   `automatico.generar` y `automatico.publicar`**: se puede medir una cuenta
   con las dos apagadas. Solo se omiten las cuentas archivadas (como en el
   resto de flujos). La verificación (Verificar) informa su estado.
2. **Recogida diaria por cuenta con aislamiento de credenciales.** Workflow
   `metricas.yml` con la misma estructura de fase 2: job `cuentas` (matriz por
   origen, comprobación del Environment por la API con `GH_PAT`), job
   `metricas-entorno` (`environment: cuenta-<id>`, solo `IG_ACCESS_TOKEN` e
   `IG_USER_ID` de ese Environment) y job `metricas-repositorio` (secretos con
   el nombre declarado). `max-parallel: 1`, `fail-fast: false`,
   `timeout-minutes: 10`. Solo lecturas en Instagram; el único escrito es
   `data/<id>/metricas/`.
3. **Almacenamiento independiente, por cuenta y por mes.** Nunca en `posts/`
   ni en `seen.json`; archivos JSON pequeños, idempotentes (repetir el día
   sobrescribe, no duplica), sin tokens. Ver §3.
4. **Ausente ≠ cero.** Toda métrica que la API no devuelve, no soporta, no
   permite (permiso, < 100 seguidores) o no llegó a pedirse (tope de llamadas)
   se guarda como `null` con su motivo en `faltantes` y se muestra como "no
   disponible" con ese motivo. La API tampoco devuelve ceros por ausencia
   (devuelve conjunto vacío), y el sistema no los inventa.
5. **Vista mínima y honesta.** Una vista "Métricas" por cuenta en el panel,
   con la evolución de la cuenta y el rendimiento de las publicaciones, que
   indica la fecha de la última recogida, el retraso de 48 h y el nivel de
   permiso vigente. Sin comparativas entre cuentas ni informes con Claude
   (fase siguiente).
6. **Nada de Claude ni Gemini.** Coste en dinero: 0 $. Solo llamadas a
   Instagram y minutos de Actions (gratuitos: el repositorio es público).

---

## 3. Datos

### 3.1 Configuración de cuenta

```json
"metricas": {
  "recoger": false,
  "ventanaDias": 90,
  "maxLlamadas": 150
}
```

`validarCuenta` acepta el bloque (opcional; valores por defecto arriba);
`CLAVES_DE_CUENTA` incluye `metricas`. `automatico` no cambia.

### 3.2 Qué se recoge en cada corrida (por cuenta)

1. **Perfil** (nivel básico): `followers_count`, `follows_count`, `media_count`
   → instantánea del día de la corrida.
2. **Estadísticas de cuenta** (si hay permiso): `reach`, `views`,
   `accounts_engaged`, `total_interactions`, `likes`, `comments`, `shares`,
   `saves`, `reposts`, `replies`, `follows_and_unfollows`, `profile_links_taps`,
   más `follower_count`, `profile_views`, `website_clicks` si la API las
   acepta; `period=day` para los días D-3, D-2 y D-1 (sobrescribe: corrige el
   retraso de 48 h). Cada métrica que falle se anota individualmente.
3. **Publicaciones**: lista de medios con `timestamp` dentro de la ventana
   (`ventanaDias`, por defecto 90) **más** todos los medios de `posts/` con
   `publicacion.idMedia` aunque sean más antiguos (así un post del sistema
   nunca deja de seguirse hasta que pase la ventana). Por cada uno: campos
   básicos (`like_count`, `comments_count`) y, con permiso, sus insights
   acumulados. Orden: más recientes primero; al alcanzar `maxLlamadas` se
   detiene y marca `incompleto`.

### 3.3 Archivos (`data/<id>/metricas/`)

`cuenta-AAAA-MM.json` (un archivo por mes de calendario):

```json
{
  "version": 1,
  "cuenta": "sinlinea",
  "dias": {
    "2026-09-10": {
      "recogido": "2026-09-10T05:31:02Z",
      "perfil": { "seguidores": 128, "seguidos": 10, "publicaciones": 14 },
      "estadisticas": {
        "alcance": 950, "vistas": 1800, "cuentasInteractuando": 25, "interacciones": 40,
        "meGusta": 30, "comentarios": 2, "compartidos": 4, "guardados": 4, "reposts": 0,
        "respuestas": null, "seguidoresNuevos": null, "visitasPerfil": null, "clicsSitioWeb": null
      },
      "faltantes": {
        "respuestas": "conjunto-vacio",
        "seguidoresNuevos": "menos-de-100-seguidores",
        "visitasPerfil": "metrica-no-soportada",
        "clicsSitioWeb": "metrica-no-soportada"
      },
      "permiso": "basico+insights",
      "completo": true
    }
  }
}
```

- `perfil` es la instantánea tomada en la corrida del día D (estado real al
  amanecer de D en Panamá). `estadisticas` son las métricas **del día D** según
  Meta (se rellenan y corrigen en las corridas de D+1, D+2 y D+3).
- `permiso`: `basico` (sin insights) o `basico+insights`. Sin permiso, todo
  `estadisticas` es `null` y `faltantes` lleva `sin-permiso-insights` en cada
  clave, para que el panel lo diga tal cual.
- Motivos normalizados: `sin-permiso-insights`, `menos-de-100-seguidores`,
  `metrica-no-soportada`, `conjunto-vacio`, `retraso-api` (todavía sin dato
  para ese día), `limite-llamadas`, `error-api:<código>`, `no-solicitado`.

`publicaciones-AAAA-MM.json` (un archivo por **mes de publicación** del
medio):

```json
{
  "version": 1,
  "cuenta": "sinlinea",
  "publicaciones": {
    "18143614624563114": {
      "fecha": "2026-09-08T08:07:03Z",
      "permalink": "https://www.instagram.com/p/DdBOCwplncC/",
      "tipo": "IMAGE",
      "origen": "sistema",
      "post": "2026-09-07-1336-la-prensa-4fe9",
      "categoria": "SEGURIDAD",
      "franja": "14:30",
      "titulo": "Primeras 90 letras del caption",
      "serie": {
        "2026-09-10": {
          "meGusta": 12, "comentarios": 1, "alcance": 400, "vistas": 620,
          "guardados": 3, "compartidos": 2, "interacciones": 18,
          "visitasPerfil": null, "seguimientos": null
        }
      },
      "faltantes": { "visitasPerfil": "conjunto-vacio", "seguimientos": "conjunto-vacio" },
      "ultimaRecogida": "2026-09-10T05:31:40Z"
    }
  }
}
```

- `origen`: `sistema` (coincide con `publicacion.idMedia` de un post) o
  `instagram` (publicado a mano; `post`, `categoria` y `franja` van a `null`,
  no se inventan).
- `serie`: una entrada por día de recogida con los **totales acumulados** que
  devolvió la API ese día. El rendimiento diario (Δ) lo calcula el panel a
  partir de dos entradas consecutivas; si falta un día, la Δ es "no
  disponible".
- Tamaño: ≈ 250 bytes por publicación y día. Sin Línea con 60 publicaciones
  en ventana ≈ 15 KB/día ≈ 0,5 MB/mes; la cuenta personal, una fracción.
  Aceptable durante años; si crece, se compacta por mes (fuera de fase 1).

### 3.4 Lo que NO se guarda

Valores de tokens o ids de secretos, respuestas completas de la API, datos
demográficos, historias, comentarios individuales ni nada de cuentas ajenas.

---

## 4. Implementación (pequeña)

| Archivo | Cambio |
|---|---|
| `src/lib/instagram.mjs` | Cuatro lecturas nuevas en el cliente: `perfilResumen()` (`fields=followers_count,follows_count,media_count`), `listarMedios({ desde, hasta, limite })` con paginación, `insightsCuenta({ metricas, desde, hasta })` y `insightsMedio(id, { metricas })`. Cada una devuelve `{ valores, faltantes }` y traduce los errores de la API a motivos (permiso → `sin-permiso-insights`; código 10/100 con "not supported" → `metrica-no-soportada`; límite → lanza `ErrorLimite`). Sin escrituras. |
| `src/lib/metricas.mjs` (isomorfo, en `MODULOS_ISOMORFOS`) | Funciones puras: `normalizarDia`, `unirDia` (merge idempotente), `motivo`, `seriesDeCuenta(archivos)`, `rendimientoDePublicaciones(archivos, posts)` (Δ diarias, último valor, "no disponible"), `textoValor(v, motivo)` → nunca "0" para `null`. |
| `src/metricas.mjs` | Orquestador: `node src/metricas.mjs --cuenta <id> --por-cuenta [--dia AAAA-MM-DD] [--sin-guardar]`. Lee la configuración, respeta `metricas.recoger` (motivo `metricas-desactivadas`), obtiene las credenciales con `secretos.mjs` (mismo aislamiento que PUBLICAR: en modo Environment solo con `--por-cuenta`), recoge (§3.2), escribe `data/<id>/metricas/` y resume por consola (nombres y estados; con `--sin-guardar` solo informa qué métricas están disponibles: es la "prueba de métricas"). Sale con 0 si recogió algo; 1 solo si no pudo ni leer el perfil (token inválido, permiso básico ausente). |
| `.github/workflows/metricas.yml` | Cron diario `30 5 * * *` (00:30 Panamá) y `workflow_dispatch` con `cuenta` (opcional) y `guardar` (true/false). Jobs `cuentas` → `metricas-entorno` → `metricas-repositorio` como en fase 2, `timeout-minutes: 10`, mismo grupo de concurrencia `sinlinea` (evita carreras con los commits de PUBLICAR). Commit `metricas (<cuenta>): AAAA-MM-DD` con `git add "data/$CUENTA/metricas"` y `pull --rebase` con reintentos. Nunca `git add posts`. |
| `src/verificar.mjs` | Línea por cuenta: "métricas: recogida apagada/encendida; última recogida AAAA-MM-DD; permiso básico/insights". |
| `src/serve.mjs` | `GET /api/metricas?cuenta=<id>` devuelve los archivos de `data/<id>/metricas/` (lista blanca de rutas, como `/api/archivo`). |
| `panel/almacen.mjs` | `leerMetricas(id)`: en GitHub, lista `data/<id>/metricas` y lee los archivos del mes actual y el anterior (2-4 lecturas, con la caché y el manejo de límites ya existentes); en local, `/api/metricas`. |
| `panel/app.js`, `index.html`, `styles.css` | Vista "Métricas" (botón en la cabecera del panel de la cuenta): bloque de estado (última recogida, permiso, aviso de 48 h, interruptor mostrado como texto, sin cambiarlo desde la vista en fase 1), gráfico de evolución en SVG puro (seguidores; alcance y vistas si existen) con huecos donde no hay dato, y tabla de publicaciones de la ventana: fecha, origen, categoría (o "—"), me gusta, comentarios, alcance, vistas, guardados, compartidos, interacciones; cada `null` → "no disponible" con el motivo en el título. Orden por fecha; filtro origen sistema/instagram. |
| `panel/app.js` (formulario de cuenta) | Casilla "Recoger métricas a diario" que escribe `metricas.recoger`, separada visualmente de generación y publicación y con la nota de que no depende de ellas. |
| `docs/CONFIGURACION.md` §8, `ARCHITECTURE.md` 2.8, `ROADMAP.md` | Permiso, pasos del operador, archivos, límites. |

Orden de tareas (cada una con su prueba antes del código, commits pequeños):
1. Cliente: lecturas y traducción de errores (`tests/instagram-lecturas.test.mjs`, fetch simulado).
2. `lib/metricas.mjs`: normalización, merge idempotente y "no disponible" (`tests/metricas-lib.test.mjs`).
3. Orquestador (`tests/metricas.test.mjs`, cliente falso).
4. Workflow y verificación (`tests/workflows.test.mjs`, `tests/verificar.test.mjs`).
5. Servidor local y almacén (`tests/serve-metricas.test.mjs`, `tests/almacen.test.mjs`).
6. Vista del panel (`tests/panel-metricas.e2e.mjs`).
7. Documentación y prueba real con `--sin-guardar` (§5).

Estimación: 2-3 días de trabajo con el flujo actual (pruebas, revisión,
despliegue), más el tiempo del operador para el permiso y los tokens.

---

## 5. Pasos del operador (antes de encender nada)

1. En cada app de Meta (la de @sinlinea.pa y la de @luiseskivelgolcher):
   Use cases → Customize → Permissions and features → añadir
   `instagram_business_manage_insights`. Si no aparece, anotar y seguir: la
   fase 1 funciona con el nivel básico.
2. Regenerar el token de la cuenta (API setup with Instagram login → Generate
   token) y guardarlo en el Environment `cuenta-<id>` como `IG_ACCESS_TOKEN`
   (el operador lo pega). Para Sin Línea, es el mismo paso de su migración
   pendiente (§6d de CONFIGURACION.md).
3. Probar Instagram para esa cuenta (identidad e id, como siempre).
4. **Prueba de métricas**: Actions → Métricas → Run workflow con `cuenta` y
   `guardar = false`. El registro muestra, sin valores de secretos, qué
   métricas devuelve la API para esa cuenta y cuáles quedan "no disponibles" y
   por qué. Con eso se decide encender `metricas.recoger` en el panel.

Nada de esto activa la generación ni la publicación, ni toca los secretos
antiguos.

---

## 6. Pruebas de aislamiento

Con cliente falso y datos simulados, sin llamadas reales a Instagram:

1. **Interruptores separados**: con `automatico.generar = false` y
   `automatico.publicar = false` y `metricas.recoger = true`, la recogida se
   ejecuta y escribe; con `metricas.recoger = false` se omite con motivo
   `metricas-desactivadas`; una cuenta archivada se omite.
2. **Solo lectura**: el cliente falso falla la prueba si se invoca cualquier
   método de escritura (`crearContenedor`, `publicar`, `refrescarToken`); tras
   la corrida, `posts/` y `data/<id>/seen.json` son idénticos byte a byte.
3. **Credenciales de una sola cuenta**: el orquestador usa `secretos.mjs` con
   `--por-cuenta`; en modo Environment sin `--por-cuenta` se omite (como
   PUBLICAR); el YAML pasa la prueba de estructura de `tests/workflows.test.mjs`
   (dos nombres de secretos por job, `GH_PAT` solo en `cuentas`, sin nombres
   de cuentas, `git add` limitado a `data/$CUENTA/metricas`).
4. **Ausente ≠ cero**: sin permiso de insights, `estadisticas` y las insights
   de cada publicación son `null` con motivo `sin-permiso-insights` y el
   perfil y la lista de medios sí se guardan; un conjunto vacío de la API se
   guarda como `null`/`conjunto-vacio`; `textoValor(null)` nunca devuelve "0";
   la vista muestra "no disponible" (e2e) y nunca "0" donde el archivo tiene
   `null`.
5. **Idempotencia**: dos corridas el mismo día dejan una sola entrada por día
   y por publicación, con los valores de la segunda.
6. **Límite de la API**: al recibir un error de límite (80002, 4, 17, 32, 613)
   la corrida se detiene, guarda lo obtenido, marca `completo: false` con
   `limite-llamadas` en lo no pedido y termina con código 0 y aviso; al día
   siguiente continúa. `maxLlamadas` se respeta.
7. **Publicaciones externas**: un medio de la API que no coincide con ningún
   `publicacion.idMedia` se guarda con `origen: "instagram"` y sin categoría
   inventada; uno que coincide enlaza el post y su categoría y franja.
8. **Un fallo por cuenta no cancela a la otra** (`fail-fast: false`) y no
   afecta a PUBLICAR (workflow aparte, mismo grupo de concurrencia, sin
   `cancel-in-progress`).

---

## 7. Criterios de aceptación

1. Con Sin Línea pausada y la cuenta personal apagada, activar
   `metricas.recoger` en una cuenta y lanzar Métricas con `guardar = true`
   crea `data/<id>/metricas/cuenta-AAAA-MM.json` y
   `publicaciones-AAAA-MM.json` solo para esa cuenta, en un commit que no toca
   `posts/`; no se publica nada y ninguna automatización cambia.
2. Sin el permiso de insights, la corrida termina bien con perfil y lista de
   publicaciones (me gusta y comentarios), y el panel muestra "no disponible ·
   el token no tiene instagram_business_manage_insights" en las columnas de
   estadísticas.
3. Con el permiso, alcance, vistas e interacciones aparecen para la cuenta y
   para cada publicación; las publicadas directamente desde Instagram aparecen
   con origen "instagram".
4. Repetir la corrida el mismo día no duplica ni altera el número de entradas.
5. Ante un límite o un error de la API no aparece ningún cero ficticio: la
   entrada del día queda marcada incompleta con su motivo y la corrida
   siguiente la completa.
6. En los registros de Actions solo aparecen `IG_ACCESS_TOKEN` e `IG_USER_ID`
   por job de cuenta; ningún valor.
7. Una corrida dura menos de 5 minutos y hace como máximo `maxLlamadas`
   llamadas a Instagram; el repositorio crece menos de 1 MB al mes por cuenta.
8. Las suites actuales siguen en verde y las nuevas cubren §6.

---

## 8. Fuera de la fase 1 (explícito)

Historias, demografía, comparativa entre cuentas, informes semanales con
Claude, recomendaciones y experimentos (fases siguientes del ROADMAP), y
cualquier acción automática a partir de las métricas.

---

## Referencias (documentación de Meta consultada el 2026-09-09)

- Insights de cuenta (Instagram Login): https://developers.facebook.com/docs/instagram-platform/api-reference/instagram-user/insights/
- Insights de publicación: https://developers.facebook.com/documentation/instagram-platform/reference/instagram-media/insights
- Visión general de insights (límites, 90 días, conjunto vacío en vez de 0): https://developers.facebook.com/docs/instagram-platform/insights/
- Objeto IG Media (campos): https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/
- Edge `/media` del usuario (10K, since/until): https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media/
- Objeto IG User (`followers_count`, `media_count`): https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/
- Cambios v22.0 (`impressions` → `views`): https://developers.facebook.com/docs/graph-api/changelog/version22.0/
- Permisos (`instagram_business_manage_insights`): https://developers.facebook.com/docs/permissions/
- Límites de la API y tokens: https://developers.facebook.com/docs/instagram-platform/overview/ y https://developers.facebook.com/docs/graph-api/overview/rate-limiting/
- Instagram API with Instagram Login (alcance y permisos): https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/
