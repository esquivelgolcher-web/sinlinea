# Panel Maestro multicanal: Facebook, Threads y X — diseño (sin implementar)

Fecha: 2026-09-09. Revisión 2 (correcciones del operador del mismo día). Estado: dirección aprobada; pendiente de aprobar esta revisión antes de planificar F1. No se ha implementado nada, no se ha contratado ningún servicio y no se han tocado conexiones, pausas ni colas.

## 1. Resumen

Cada cuenta editorial podrá tener, además de Instagram, una conexión independiente con una página de Facebook, un perfil de Threads y, si su acceso y coste encajan, una cuenta de X. Una pieza (titular, bajada, caption, imagen) se aprueba una vez y se elige a qué destinos va; cada destino lleva su propio texto aprobado y su propio estado. Un fallo en una red no bloquea a las demás; un reintento nunca vuelve a publicar donde ya se publicó; un resultado incierto se conserva hasta tener evidencia o una decisión manual.

Fases: **F1 Facebook** (página) con la base multicanal, **F2 Threads**, **F3 X** solo tras confirmar acceso y presupuesto. Métricas de las redes nuevas: fase posterior.

## 2. Lo comprobado en la documentación oficial (2026-09-09)

Ninguna de las tres redes acepta el token de Instagram. Cada una tiene su propia credencial, su propio flujo de autorización y sus propios límites. Los enlaces están en la sección 11.

| | Facebook (página) | Threads | X |
|---|---|---|---|
| Cuenta necesaria | Página de Facebook administrada por el usuario. App de Meta de tipo empresa (las dos apps actuales lo son) | Perfil de Threads (ligado a la cuenta de Instagram). App con el caso de uso "Threads" y credenciales propias (Threads App ID / secret) | Cuenta de X, cuenta de desarrollador y app con OAuth 2.0 activado |
| Permisos | `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`; token de página de alguien con la tarea CREATE_CONTENT [FB-photos] | `threads_basic`, `threads_content_publish` [TH-start] | Scopes `tweet.read`, `tweet.write`, `users.read` (publicar) [X-post], `media.write` (subir imagen), `offline.access` (refresh token) [X-oauth] |
| Credencial | Token de página de larga duración obtenido desde un token de usuario de larga duración (`GET /{user-id}/accounts`); "no tienen fecha de caducidad" salvo invalidación (cambio de contraseña, pérdida del rol…) [FB-tokens] | Token de usuario de Threads: corto (1 h) → largo (60 días) con `th_exchange_token`; renovable con `th_refresh_token` cuando tiene más de 24 h [TH-tokens] | Token de acceso de 2 h; con `offline.access`, refresh token para renovar [X-oauth] |
| Revisión de la app | Acceso estándar: sin App Review ni verificación de empresa para usuarios con rol en la app; las apps de empresa "reciben automáticamente la aprobación de acceso estándar para todos los permisos" [FB-access] | Sin App Review para Threads Testers (Roles → invitar; aceptar en Threads) [TH-start] | Sin revisión; alta de desarrollador y compra de créditos |
| Imagen | `.jpeg .bmp .png .gif .tiff`, máximo 4 MB; por URL pública (`url`) con `caption` [FB-photos] | JPEG y PNG, máximo 8 MB, relación de aspecto hasta 10:1, ancho 320–1440 px; por URL pública (`image_url`) [TH-posts] | Hasta 5 MB, subida en binario (`POST /2/media/upload…`), luego `POST /2/tweets` con `media.media_ids` [X-media] |
| Texto | Sin límite práctico para este uso | "Text posts are limited to 500 characters"; "emojis are counted as the number of UTF-8 bytes". Las letras, incluidos acentos, cuentan como un carácter; solo los emojis cuentan por bytes [TH-posts] | 280 caracteres |
| Flujo | Una llamada: `POST /{page-id}/photos` → `{ id, post_id }` [FB-photos] | Dos pasos: crear contenedor → publicar; recomiendan esperar ~30 s; el contenedor caduca a las 24 h; estados `IN_PROGRESS, FINISHED, PUBLISHED, ERROR, EXPIRED` legibles con `GET /{container-id}?fields=status,error_message` [TH-posts] [TH-trouble] | Subida de media (`initialize/append/finalize` o simple) → `POST /2/tweets` → `{ data: { id, text } }` [X-media] [X-post] |
| Límites | 4800 llamadas × usuarios con interacción / 24 h por página; códigos 4, 17, 32, 613, 80001 [FB-rate] | 250 publicaciones / 24 h por perfil; cuota legible en `threads_publishing_limit` (`quota_usage`, `config`) [TH-posts] [TH-trouble] | `POST /2/tweets`: 100 / 15 min por usuario, 10 000 / 24 h por app; media upload 500 / 15 min por usuario [X-rate] |
| Coste | 0 | 0 | Pago por uso con créditos prepagados, sin niveles gratuitos: crear publicación 0,015 USD; con URL 0,200 USD; lectura de publicaciones 0,005 USD por publicación (0,001 USD si es de la propia cuenta, "owned reads"); lectura de usuario 0,010 USD; "Media Metadata" 0,005 USD. La subida de media no aparece con precio propio en la tabla: se confirmará en la consola antes de F3 [X-price] |

Instagram (ya en producción, se mantiene): contenedor con estados `IN_PROGRESS, FINISHED, PUBLISHED, ERROR, EXPIRED`, caduca a las 24 h, cuota `content_publishing_limit` de 100 publicaciones / 24 h [IG-publish].

## 3. Arquitectura sobre la actual

Se conserva lo existente: pieza única en `posts/<id>.json`, imagen renderizada una vez (1080×1350 JPEG, válida para las cuatro redes), ilustración de Gemini una vez, cola por `programado`, job por cuenta con Environment `cuenta-<id>`, `estadoConexion` y guía de conexión en el panel.

### 3.1 Conexiones e interruptores independientes

`cuentas/<id>/config.json` gana el bloque opcional `conexiones`:

```json
"conexiones": {
  "facebook": { "publicar": false, "pagina": "123456789012345" },
  "threads":  { "publicar": false, "usuario": "17841400000000000" },
  "x":        { "publicar": false, "usuario": "luiseskivelgolcher" }
},
"automatico": { "generar": true, "publicar": true, "pausa": false }
```

- `automatico.publicar` **sigue significando lo mismo que hoy: el interruptor de Instagram**. No es maestro. Con Instagram apagado, desconectado o en error, los demás destinos publican con normalidad.
- Cada red tiene su interruptor `conexiones.<red>.publicar`, que nace `false`.
- `automatico.pausa` (opcional, `false` por defecto) es la **pausa general explícita** de la cuenta: con `true`, ninguna entrega sale, en ninguna red, y los interruptores por destino conservan su valor. Es lo que usa el panel para "Pausar todo" y "Reanudar todo".
- Una cuenta entra en la corrida de PUBLICAR si no está en pausa general y tiene **algún** destino encendido (Instagram o cualquier red). `cuentas-activas` lo calcula así.
- Las conexiones nuevas solo existen en modo Environment: sus secretos viven en `cuenta-<id>` con nombres fijos. Instagram conserva sus dos modos.

| Red | Secretos en `cuenta-<id>` | Identificador público en config |
|---|---|---|
| Facebook | `FB_PAGE_TOKEN` | `pagina` (id numérico) |
| Threads | `THREADS_ACCESS_TOKEN`; `THREADS_APP_SECRET` solo si hace falta el canje/renovación por workflow | `usuario` (id numérico de Threads) |
| X (F3) | `X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_REFRESH_TOKEN` | `usuario` (handle) |

- `secretos.mjs`: `nombresDeSecretosDe(red)`, `leerSecretosDe(config, red, env)`; patrones de ocultación ampliados (tokens `EAA…`, `TH…`, X). Un cliente solo recibe los secretos de su red.
- `entornos.mjs` comprueba únicamente los secretos de las conexiones **encendidas** (y los de Instagram si `automatico.publicar`). Una conexión apagada sin secretos no es error.
- Estado de conexión por red en `data/<id>/conexion-<red>.json` (misma forma que `conexion.json`: `verificada | error | credenciales-pendientes | pendiente`, identidad, fecha, detalle; nunca valores). `estadoConexion` y `requisitosPublicacion` se parametrizan por red: encender un destino exige identidad verificada **de esa red**.
- Verificación: workflow manual `probar-destino.yml` (inputs `cuenta`, `red`; ambos son nombres, no secretos). Identidad: Facebook `GET /me` con el token de página debe devolver el id de `pagina`; Threads `GET /me?fields=id,username` debe coincidir con `usuario`; X `GET /2/users/me` (lectura de pago; solo al verificar).
- Renovación: Threads entra en `renovar-token.yml` (`th_refresh_token`, escribiendo al Environment con `GH_PAT` como hoy con Instagram). Facebook no necesita renovación. X (F3): renovación en cada corrida con rotación del refresh token en el Environment.

### 3.2 Destinos en el post: pausar no es omitir

Cada post gana el bloque opcional `destinos`, uno por red seleccionada al aprobar:

```json
"destinos": {
  "instagram": { "texto": "…", "aprobado": { "fecha": "…", "hashPieza": "…" }, "estado": "publicado",
                 "publicacion": { "id": "1792…", "permalink": "https://www.instagram.com/p/…", "fecha": "…" }, "error": null, "intento": null, "omitido": null },
  "facebook":  { "texto": "…", "aprobado": { "…": "…" }, "estado": "error", "publicacion": null,
                 "error": { "mensaje": "…", "fecha": "…", "intentos": 2 }, "intento": null, "omitido": null },
  "threads":   { "texto": "…", "aprobado": { "…": "…" }, "estado": "pendiente", "publicacion": null, "error": null,
                 "intento": { "n": 1, "fase": "contenedor", "inicio": "…", "contenedorId": "1802…", "actualizado": "…" }, "omitido": null }
}
```

- Estados de destino: `pendiente`, `publicado`, `error`, `incierto`, `omitido`. No existe un estado "pausado": **apagar un destino o activar la pausa general conserva la entrega en `pendiente`** y el panel la muestra como "en espera (conexión apagada / pausa general)". Al reanudar, sale en la siguiente corrida sin intervención.
- **Omitir es una acción explícita del operador** ("Omitir en Facebook"): el destino pasa a `omitido` con fecha y autor, y ya no se publica. No se puede omitir el último destino que quede; para eso está "Quitar de la cola".
- `publicacion` guarda el id de la red (y `idPublicacion` cuando la red devuelve dos, como `post_id` en Facebook), el enlace y la fecha. `error` guarda mensaje saneado, fecha e intentos. `intento` guarda el registro persistente de cada intento (3.4).
- Estado general de la pieza, sin perder información: `destinos` conserva todo; el estado del post (enum actual, sin valores nuevos) se deriva:
  - `programado` mientras algún destino no omitido esté `pendiente` (en espera o no) o `incierto`;
  - `publicado` cuando todos los destinos no omitidos estén `publicado`;
  - `error` cuando no quede nada pendiente ni incierto y algún destino esté en `error` (`error.paso = "destino"`, mensaje con las redes afectadas).
  El panel calcula además un resumen por pieza ("IG publicado · FB error · TH en espera") a partir de `destinos`.
- Compatibilidad: los posts actuales no tienen `destinos`; al leerlos se deriva `destinos.instagram` de `publicacion`, `error` y `estado` sin reescribir el archivo. Al escribir, `publicacion` y `error` del post siguen reflejando el destino Instagram, así panel, métricas y archivo actuales no cambian. `reintentar` solo devuelve a `pendiente` los destinos en `error`; los publicados y los omitidos no se tocan.

### 3.3 Versiones por red: texto aprobado, sin recortes automáticos

Claude redacta una sola vez. `src/lib/versiones.mjs` (isomorfo) **propone** la versión de cada red a partir de la pieza común; el operador la revisa y la aprueba.

| Red | Propuesta | Límite |
|---|---|---|
| Instagram | La actual (`componerCaption`: caption + fuente + hashtags) | 2200 caracteres, 30 hashtags |
| Facebook | Caption + línea de fuente ("Fuente: OCCRP"), sin hashtags | Holgado |
| Threads | Caption completo + fuente si cabe; si no cabe, titular + "Según <medio> (<fecha>)" + bajada | 500 caracteres; emojis por bytes UTF-8 |
| X (F3) | Titular + "Según <medio>", sin URL por defecto (una URL multiplica por 13 el coste) | 280 caracteres |

- **Nunca se recorta automáticamente.** Cada propuesta devuelve `{ texto, limite, longitud, excede }`. Si `excede`, ese destino no puede aprobarse hasta que el operador edite la versión; el panel la muestra con contador. Las propuestas alternativas para redes cortas se construyen con campos completos (titular, bajada, atribución), nunca cortando frases, para no perder "Según…", "presunto" ni la fecha.
- **Aprobación por destino**: al aprobar la pieza se guarda en `destinos.<red>.texto` la versión revisada (nunca `null`) y en `aprobado` la fecha y `hashPieza` (hash de titular, bajada, caption, hashtags y fuente en ese momento). Se publica exactamente ese texto.
- Si después cambia la pieza común, `hashPieza` deja de coincidir: el panel avisa "La pieza cambió después de aprobar esta versión" y ofrece "Actualizar versión" (explícito, destino a destino). Nada cambia en silencio; lo programado sigue con su texto aprobado.
- La imagen es la misma para todas las redes; no se generan imágenes ni ilustraciones adicionales.

### 3.4 Publicación por destinos con registro persistente previo

El job por cuenta expone en `env` los nombres fijos de todas las redes (vacíos si no existen). Todos los workflows comparten el grupo de concurrencia `sinlinea` (sin cancelación), así que dos corridas del bot nunca escriben a la vez; el panel sí puede escribir en cualquier momento, y por eso cada paso persistente empieza con `git pull --rebase`.

Por cada post listo y cada destino seleccionado que esté `pendiente` (con conexión encendida y sin pausa general), en orden fijo instagram → facebook → threads → x:

1. **Reserva persistida antes de enviar.** `git pull --rebase`; se relee el post y se comprueba que sigue elegible (programado, destino seleccionado y pendiente, texto aprobado, conexión encendida, sin pausa). Se escribe `intento = { n, fase: "reservado", inicio, actualizado }`, se hace commit y **push**. Si el push falla por avance remoto, se repite `pull --rebase` + push hasta 3 veces. Si sigue fallando, o si el rebase entra en conflicto en ese archivo (el operador lo editó a la vez), se aborta el rebase, se descarta la reserva y **no se publica** ese destino en esta corrida; el post queda como estaba y se anota en el registro. Sin reserva remota confirmada no hay envío.
2. **Pasos intermedios también persistidos**, porque son la evidencia para reconciliar: Instagram y Threads guardan `contenedorId` (`fase: "contenedor"`, commit + push) antes de publicar el contenedor; X guardará `mediaId` (`fase: "media"`) antes de crear la publicación; Facebook, al ser una sola llamada, pasa de "reservado" a `fase: "enviando"` (commit + push) justo antes de llamar.
3. **Envío** con el cliente de la red (`facebook.mjs`, `threads.mjs`, `x.mjs`; misma interfaz que el de Instagram: `perfil()`, `cuota()` si existe, `publicarImagen(...)`, `contenedorEstado(id)` y `listarRecientes({ desde })` para reconciliar).
4. **Resultado persistido de inmediato** (commit + push): `publicado` con id, enlace y fecha; `error` con mensaje saneado e intentos; o `incierto` (sección 4). Si el push del resultado falla y no se recupera, el archivo queda con `intento` en fase "enviando"/"contenedor"/"media" y la siguiente corrida lo trata como `incierto`.

Coste operativo: dos o tres commits del bot por destino; con el volumen actual es asumible y los commits del bot (GITHUB_TOKEN) no disparan otros workflows. Cuota de cada red respetada (Instagram `content_publishing_limit`; Threads `threads_publishing_limit`; Facebook y X por códigos de límite). Identidad comprobada por red antes de publicar, salvo X en cada corrida (lectura de pago; se confía en la verificación manual y en el error de autenticación).

## 4. Fallos, reintentos e inciertos con evidencia

### 4.1 Reintentos sin duplicar
- Un destino `publicado` u `omitido` es definitivo. El reintento (manual o automático) solo toca `pendiente`, `error` e `incierto`.
- Dentro de la misma corrida se reintenta (hasta 3, espera creciente) **solo si la petición no llegó a enviarse** o la red devolvió un error inequívoco antes de crear nada. Cualquier duda después de enviar pasa a `incierto`, nunca a reintento ciego.
- Límite: 3 corridas con `error` por destino; después espera al botón "Reintentar".

### 4.2 Resultados inciertos: se conservan hasta tener evidencia o decisión

Un destino queda `incierto` cuando hay reserva o pasos intermedios persistidos y no hay resultado (timeout tras enviar, proceso interrumpido, push del resultado no recuperado). **La ausencia de la publicación en un listado no demuestra que no se publicó**: sin evidencia, el destino sigue `incierto`.

Evidencia aceptada, por red:
- **Instagram y Threads con `contenedorId` guardado**: `GET /{contenedorId}?fields=status(_code),error_message`. `PUBLISHED` → publicado (se localiza el medio publicado desde `inicio` y se guarda id y enlace). `ERROR` o `EXPIRED` → evidencia de que no se publicó: vuelve a `pendiente` para un intento nuevo. `FINISHED` → contenedor válido sin publicar: se publica **ese** contenedor, sin crear otro. `IN_PROGRESS` → sigue `incierto` hasta la siguiente corrida.
- **Instagram y Threads sin `contenedorId`** (interrupción antes de persistirlo): listado de medios de la cuenta desde `inicio`; coincidencia exacta del texto aprobado → publicado con su id. Sin coincidencia → sigue `incierto` y pide decisión manual.
- **Facebook**: `GET /{page}/posts?fields=id,message,created_time,permalink_url&since=<inicio>`; coincidencia exacta del texto aprobado creada después de `inicio` → publicado. Sin coincidencia → sigue `incierto` y pide decisión manual.
- **X (F3)**: sin reconciliación automática (las lecturas se cobran). Botón "Comprobar en X": una lectura `GET /2/users/:id/tweets?start_time=<inicio>&max_results=5` (0,001–0,005 USD por publicación leída); coincidencia → publicado; sin coincidencia → sigue `incierto`.

Decisiones manuales en el panel para un destino `incierto`: "Marcar como publicado" (con enlace o id que el operador ve en la red), "Volver a pendiente" (el operador confirma que no está publicado) u "Omitir". Las coincidencias de texto solo se usan como evidencia complementaria; con id de contenedor o de publicación se usa el id.

Además, en Instagram, Threads y Facebook, antes de crear nada nuevo para un destino `pendiente` que tenga un `intento` anterior, se ejecuta la misma reconciliación: si aparece una publicación idéntica posterior a ese intento, se adopta y no se duplica.

## 5. Panel

- **Tarjeta de post**: fila de destinos con chips (red + estado: pendiente / en espera con motivo / publicado con "Ver en …" / error con mensaje / incierto con acciones / omitido). Desplegable "Versiones por red": un área de texto por destino con contador, aviso "excede el límite", "Proponer de nuevo" (vuelve a la propuesta automática, sin guardar hasta aprobar) y, si la pieza cambió tras la aprobación, el aviso con "Actualizar versión". "Reintentar" indica a qué destinos afecta. "Omitir en <red>" por destino.
- **Diálogo "Programar publicación"**: fecha y hora (hora de Panamá), casillas de destino (deshabilitadas con motivo: conexión apagada, identidad no verificada, versión que excede el límite) y las versiones a aprobar. Aprobar guarda las versiones revisadas.
- **Tarjeta de cuenta**: una fila por red con estado de conexión, interruptor (activación segura por red), "Verificar" (lanza `probar-destino.yml`; sin permiso Actions en el token del panel se muestra la ruta manual) y guía desplegable. Control "Pausa general" separado de los interruptores.
- **Formulario de cuenta**: sección "Conexiones" con, por red, interruptor (nace apagado), identificador público y los nombres fijos de los secretos con enlace al Environment. **Ningún valor de secreto entra ni se muestra en el panel.**
- **Vista general**: resumen por cuenta "IG · FB · TH · X" con estado de cada conexión, pausa general y último error por red.

## 6. Credenciales protegidas y guías de conexión

Principio: los valores de tokens, códigos OAuth y verificadores **solo se escriben en formularios de secretos de GitHub** (Environment `cuenta-<id>`), tecleados por el operador. Nunca son inputs de workflows, nunca van en URLs compartidas, registros ni archivos del repositorio o de Pages. Los workflows no imprimen valores; GitHub enmascara los secretos en los registros y cualquier valor derivado se registra con `::add-mask::`.

### 6.1 Facebook (F1): todo en herramientas de Meta y en el formulario de GitHub
1. Tener una página de Facebook y ser su administrador (Meta Business Suite → Páginas); crearla si no existe.
2. En la app de Meta (tipo empresa): Casos de uso → "Facebook Login for Business" → configuración con tipo de token "Usuario" y permisos `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`.
3. En el Explorador de la API Graph (herramienta oficial, sesión del administrador): elegir la app, marcar esos permisos y generar el token de usuario; en la Herramienta de tokens de acceso (depurador) pulsar "Extender token" para obtener el de larga duración; con él, en el Explorador, `GET /me/accounts` devuelve el token de página, que no caduca. El token de página se copia desde la herramienta de Meta.
4. GitHub → Settings → Environments → `cuenta-<id>` → Add secret → `FB_PAGE_TOKEN` (pegar). En el panel: id de la página.
5. Actions → "Probar destino" → cuenta + facebook. Con identidad verificada, encender el interruptor de Facebook en el panel.

No hay workflow de obtención de token para Facebook: no hace falta.

### 6.2 Threads (F2)
1. En la app de Meta: Casos de uso → "Threads API"; anotar el Threads App ID.
2. Roles → Threads Testers → invitar al perfil de Threads de la cuenta; aceptar en Threads (Configuración → Cuenta → Sitios web y aplicaciones).
3. Permisos `threads_basic` y `threads_content_publish`.
4. Token, vía preferida: el generador de tokens para testers del panel de la app (token de larga duración) → pegar en `THREADS_ACCESS_TOKEN` del Environment. Sin pasos intermedios.
5. Vía alternativa, solo si el generador no está disponible: el operador abre la ventana de autorización (`https://threads.net/oauth/authorize` con `client_id`, `redirect_uri` = página estática del proyecto en Pages, `scope`, `response_type=code`, `state`). La página estática muestra el código en pantalla; no lo guarda, no lo envía a ningún sitio, no carga recursos externos y usa `Referrer-Policy: no-referrer`. El operador pega el código en un **secreto temporal** del Environment (`THREADS_OAUTH_CODE`) y `THREADS_APP_SECRET` como secreto del Environment. El workflow manual `obtener-token-threads.yml` (sin inputs) lee ambos del Environment, canjea en servidor (`graph.threads.net/oauth/access_token` y `th_exchange_token`), guarda `THREADS_ACCESS_TOKEN` en el Environment con `GH_PAT` y **borra el secreto temporal** por API. El código es de un solo uso, caduca en 1 h y no sirve sin el secret de la app.
6. En el panel: id de usuario de Threads. Verificar y encender. Renovación cada 60 días por `renovar-token.yml`.

### 6.3 X (F3, fuera de la implementación hasta confirmar acceso y presupuesto)
1. Cuenta de desarrollador en developer.x.com, app con OAuth 2.0 ("Automated App or bot"), callback = página estática del proyecto, permisos de lectura y escritura. Compra de créditos y confirmación del precio de media upload y lecturas.
2. PKCE sin exponer el verificador: el workflow `preparar-autorizacion-x.yml` genera `code_verifier` y `state`, guarda el verificador como **secreto temporal** del Environment (`X_CODE_VERIFIER`, vía `GH_PAT`) y muestra únicamente la URL de autorización (contiene `client_id`, `code_challenge` y `state`, que son públicos).
3. El operador autoriza; la página estática muestra el código; el operador lo pega en el secreto temporal `X_OAUTH_CODE`. El workflow `obtener-token-x.yml` (sin inputs) lee código, verificador y `X_CLIENT_SECRET` del Environment, canjea en `api.x.com/2/oauth2/token`, guarda `X_REFRESH_TOKEN` y borra los dos temporales.
4. En el panel: handle. Verificar (una lectura de pago) y encender.

## 7. Fases, cambios y criterios de aceptación

### F1 · Facebook y base multicanal
Cambios: `destinos` con compatibilidad en `posts.mjs` y `estados.mjs` (derivación de Instagram, estado general, `omitido`, reintento por destino); `versiones.mjs` (propuestas, límites, `excede`, `hashPieza`); `conexiones` y `automatico.pausa` en `config.mjs`; secretos por red en `secretos.mjs` y `entornos.mjs`; `facebook.mjs`; `publicar.mjs` por destinos con reserva persistida, pasos intermedios, resultado inmediato y reconciliación; `cuentas-activas` por "algún destino encendido"; `probar-destino.yml` y ajuste de `publicar.yml` (env de todas las redes); panel (chips, versiones, diálogo, omitir, decisiones de incierto, tarjeta y formulario de cuenta, pausa general, guía); docs (CONFIGURACION §9, ARCHITECTURE 2.4/2.6/2.7, GUIA).

Aceptación (todo con clientes simulados y un repositorio git simulado; sin cuentas ni publicaciones reales):
- Compatibilidad: los posts existentes se leen, se muestran y se publican en Instagram como hoy; sus archivos no se reescriben al leer.
- Interruptores: con `automatico.publicar=false` e Instagram desconectado, una pieza con destino Facebook se publica en Facebook; con `automatico.pausa=true` no sale nada y los interruptores no cambian.
- Reserva: el cliente simulado de Facebook registra que **antes** de cada envío existía un commit remoto con `intento.fase="reservado"`; si el push de la reserva falla (rechazo simulado 3 veces) o el rebase entra en conflicto, no se llama al cliente y el post queda intacto.
- Independencia: Instagram + Facebook con fallo en Facebook → Instagram publicado, Facebook en error, pieza en `programado`/`error` según reglas; "Reintentar" solo llama al cliente de Facebook.
- Inciertos: timeout tras enviar → `incierto`; con evidencia (publicación idéntica posterior al intento) → publicado sin volver a publicar; sin evidencia → sigue `incierto` tras varias corridas; "Volver a pendiente" y "Marcar como publicado" solo desde la decisión manual. Instagram: contenedor `FINISHED` se publica sin crear otro; `ERROR`/`EXPIRED` vuelve a pendiente.
- Pausar y omitir: apagar Facebook deja el destino `pendiente` y en espera; al encender, sale; "Omitir" lo marca `omitido` y no se puede omitir el último destino.
- Versiones: el texto aprobado se conserva aunque cambie el caption común; el panel avisa y solo "Actualizar versión" lo cambia; una propuesta que excede el límite bloquea la aprobación de ese destino y no se recorta.
- Aislamiento: el cliente de Facebook nunca recibe secretos de Instagram ni viceversa; una conexión apagada sin secretos no rompe la comprobación del Environment.
- Panel (e2e con API simulada): seleccionar destinos, revisar y aprobar versiones, ver estado y enlace por destino, omitir, decidir un incierto, pausa general; conexión nueva nace apagada y no se enciende sin identidad verificada.
- Real, cuando exista página y token (dependencia del operador): `probar-destino` verifica la página; una publicación real de prueba en la página con enlace guardado. Hasta entonces, F1 se da por cerrada con las pruebas simuladas.

### F2 · Threads
Cambios: `threads.mjs` (contenedor → espera ~30 s → publicar; estado de contenedor; cuota), propuesta de 500 caracteres con emojis por bytes, generador de token o `obtener-token-threads.yml` con secretos temporales, renovación en `renovar-token.yml`, guía.
Aceptación: los escenarios de F1 aplicados a Threads; contenedor `FINISHED` se publica sin recrear; texto que excede bloquea la aprobación; renovación simulada escribe el token nuevo solo en el Environment y borra temporales; real: verificación y una publicación de prueba.

### F3 · X (solo si se confirma acceso y presupuesto)
Condición: presupuesto aprobado por el operador con precios confirmados en la consola. Cambios: `x.mjs` (subida binaria, `POST /2/tweets`, refresh y rotación en el Environment), propuesta de 280 caracteres sin URL, "Comprobar en X" de pago bajo demanda, workflows PKCE con secretos temporales, guía.
Aceptación: escenarios simulados incluida la rotación del refresh token y el incierto con decisión manual; coste estimado visible por publicación; real: verificación y una publicación de prueba con el gasto registrado.

## 8. Costes

| Concepto | F1 Facebook | F2 Threads | F3 X |
|---|---|---|---|
| API | 0 [FB-photos] | 0 [TH-start] | 0,015 USD por publicación sin URL; 0,200 USD con URL; lecturas 0,001–0,005 USD por publicación; usuario 0,010 USD; media upload por confirmar [X-price]. 30 publicaciones/mes sin URL ≈ 0,45 USD; con URL ≈ 6 USD; más comprobaciones |
| Claude / Gemini | 0 adicional (propuestas deterministas; una imagen e ilustración) | 0 adicional | 0 adicional |
| GitHub Actions | Segundos más por corrida en el mismo job por cuenta; 2–3 commits del bot por destino | Igual | Igual |
| Desarrollo (orientativo) | 5–6 días | 2–3 días | 2–3 días + alta y créditos |

## 9. Limitaciones y riesgos

- **Dependencia de Meta**: el bloqueo de la cuenta de desarrollador quedó resuelto el 2026-09-09 a las 18:11 UTC; un bloqueo futuro afectaría a Instagram, Facebook y Threads a la vez. Sigue pendiente regenerar el token de Instagram de Sin Línea (código 190). Las pruebas reales de F1/F2 dependen de una página de Facebook administrada y de un perfil de Threads como tester; el diseño y las pruebas simuladas no.
- Las redes nuevas solo existen en modo Environment; una cuenta en modo repositorio (Sin Línea) debe migrar antes de conectar Facebook.
- Threads cuenta los emojis por bytes UTF-8 (el resto de caracteres, uno a uno) [TH-posts].
- X: sin nivel gratuito; cada URL en el texto multiplica el coste; comprobar publicaciones cuesta lecturas; tokens de 2 h con rotación del refresh token en cada corrida. Queda **fuera de la implementación** hasta confirmar acceso y presupuesto.
- Reconciliación por texto: solo como evidencia complementaria, limitada a publicaciones posteriores al intento y de la misma cuenta; con ids se usan los ids. Dos piezas con texto idéntico en la misma ventana serían indistinguibles por texto: el panel muestra el enlace para que el operador lo confirme.
- Programación por red (horas distintas por destino) queda fuera; la pieza tiene una sola hora.
- Métricas de Facebook, Threads y X: fase posterior; la vista de métricas seguirá mostrando solo Instagram.

## 10. Qué no cambia ahora

No se implementa nada de lo anterior hasta que el operador apruebe esta revisión. No se contratan servicios. No se tocan las conexiones, pausas ni colas actuales: Sin Línea sigue pausada con su cola; @luiseskivelgolcher sigue con generación y publicación encendidas en Instagram y métricas activas. Durante F1 no se publicará contenido real.

## 11. Enlaces oficiales consultados (2026-09-09)

- [FB-photos] Referencia `POST /{page-id}/photos` (parámetros, permisos, formatos, 4 MB): https://developers.facebook.com/docs/graph-api/reference/page/photos/
- [FB-posts] Guía de publicaciones de página: https://developers.facebook.com/docs/pages-api/posts
- [FB-tokens] Tokens de larga duración (usuario 60 días; página sin caducidad): https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived
- [FB-login] Facebook Login for Business: https://developers.facebook.com/docs/facebook-login/facebook-login-for-business
- [FB-access] Acceso estándar y avanzado: https://developers.facebook.com/docs/graph-api/overview/access-levels/
- [FB-rate] Límites de llamadas (páginas: 4800 × usuarios con interacción / 24 h): https://developers.facebook.com/docs/graph-api/overview/rate-limiting
- [TH-start] Requisitos, permisos y Threads Testers: https://developers.facebook.com/docs/threads/get-started
- [TH-auth] Ventana de autorización y canje del código: https://developers.facebook.com/docs/threads/get-started/get-access-tokens-and-permissions
- [TH-tokens] Tokens de larga duración y renovación: https://developers.facebook.com/docs/threads/get-started/long-lived-tokens
- [TH-posts] Publicaciones (500 caracteres, emojis por bytes UTF-8, imagen 8 MB / 320–1440 px / 10:1, 250 por 24 h, espera de ~30 s): https://developers.facebook.com/docs/threads/posts
- [TH-trouble] Estados del contenedor, caducidad a las 24 h y `threads_publishing_limit`: https://developers.facebook.com/docs/threads/troubleshooting
- [IG-publish] Publicación de contenido de Instagram (estados del contenedor, `content_publishing_limit`): https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing
- [X-price] Precios pago por uso: https://docs.x.com/x-api/getting-started/pricing
- [X-post] Crear publicación `POST /2/tweets` (scopes, media): https://docs.x.com/x-api/posts/creation-of-a-post
- [X-media] Subida de media: https://docs.x.com/x-api/media/quickstart/media-upload-chunked
- [X-rate] Límites de llamadas: https://docs.x.com/x-api/fundamentals/rate-limits
- [X-oauth] OAuth 2.0 con PKCE (2 h, `offline.access`, scopes): https://docs.x.com/resources/fundamentals/authentication/oauth-2-0/authorization-code
- [X-timeline] Publicaciones de un usuario (`start_time`, `max_results` 5–100): https://docs.x.com/x-api/posts/user-posts-timeline-by-user-id
