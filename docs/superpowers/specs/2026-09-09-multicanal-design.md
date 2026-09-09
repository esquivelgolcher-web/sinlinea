# Panel Maestro multicanal: Facebook, Threads y X — diseño (sin implementar)

Fecha: 2026-09-09. Estado: propuesta para revisión del operador. No se ha implementado nada, no se ha contratado ningún servicio y no se han tocado conexiones, pausas ni colas.

## 1. Resumen

Cada cuenta editorial podrá tener, además de Instagram, una conexión independiente con una página de Facebook, un perfil de Threads y, si su acceso y coste encajan, una cuenta de X. Una pieza (titular, bajada, caption, imagen) se aprueba una vez y se elige a qué destinos va; cada destino lleva su propio texto editable y su propio estado de publicación. Un fallo en una red no bloquea a las demás y un reintento nunca vuelve a publicar donde ya se publicó.

Fases propuestas: **F1 Facebook** (página), **F2 Threads**, **F3 X** (condicionada a confirmar acceso y coste). Métricas de las redes nuevas: fase posterior, fuera de este diseño.

## 2. Lo comprobado en la documentación oficial (2026-09-09)

Ninguna de las tres redes acepta el token de Instagram. Cada una tiene su propia credencial, su propio flujo de autorización y sus propios límites.

| | Facebook (página) | Threads | X |
|---|---|---|---|
| Documentación | Pages API, Graph API `POST /{page-id}/photos`, Facebook Login for Business, niveles de acceso | Threads API (`graph.threads.net`): posts, tokens, Threads Testers | X API v2: `POST /2/tweets`, media upload v2, OAuth 2.0 PKCE, precios pay-per-usage |
| Cuenta necesaria | Una página de Facebook administrada por el usuario. La app de Meta debe ser de tipo empresa (las dos apps actuales lo son: muestran "Facebook Login for Business") | Perfil de Threads (va ligado a la cuenta de Instagram). App con el caso de uso "Threads" y sus credenciales propias (Threads App ID / secret, distintas de las de Instagram) | Cuenta de X, cuenta de desarrollador y app con OAuth activado |
| Permisos | `pages_show_list`, `pages_manage_posts`, `pages_read_engagement` (token de página de alguien con la tarea CREATE_CONTENT) | `threads_basic` (siempre) y `threads_content_publish` (publicar) | Scopes `tweet.read`, `tweet.write`, `users.read` y `media.write` (subir imagen); `offline.access` si se quiere token renovable |
| Credencial | Token de página de larga duración: se obtiene desde un token de usuario de larga duración (`GET /{user-id}/accounts`). Meta: "no tienen fecha de caducidad" y solo se invalidan en ciertos casos (cambio de contraseña, pérdida del rol, etc.) | Token de usuario de Threads: corto (1 h) → largo (60 días) con `th_exchange_token`; se renueva con `th_refresh_token` cuando tiene más de 24 h | OAuth 2.0: token de acceso de 2 h; con `offline.access` se recibe un refresh token para renovarlo. (OAuth 1.0a de usuario, sin caducidad, sigue documentado para publicar; se confirmará al iniciar F3) |
| Revisión de la app | Acceso estándar: no requiere App Review ni verificación de empresa para usuarios con rol en la app (el administrador publicando en su propia página). Acceso avanzado solo si se sirviera a terceros | No requiere App Review para "Threads Testers" (se invitan en Roles y aceptan en la app de Threads). App Review solo para usuarios sin rol | No hay revisión, pero sí alta de desarrollador y compra de créditos |
| Formato de imagen | `.jpeg .png .gif .bmp .tiff`, máx. 4 MB. Se publica por URL pública (`url`) con `caption` | JPEG/PNG, máx. 8 MB, ancho 320–1440 px, sRGB. Por URL pública (`image_url`). Texto máx. 500 caracteres (los emojis cuentan como bytes UTF-8). Flujo en dos pasos: crear contenedor → publicar (recomiendan ~30 s de espera) | Imagen hasta 5 MB, subida **en binario** (no por URL) con los endpoints `POST /2/media/upload…`; luego `POST /2/tweets` con `media.media_ids`. Texto máx. 280 caracteres |
| Límites | 4800 llamadas × usuarios con interacción / 24 h por página (códigos 4, 17, 32, 613, 80001) | 250 publicaciones / 24 h por perfil | `POST /2/tweets`: 100 / 15 min por usuario, 10 000 / 24 h por app; media upload 500 / 15 min por usuario |
| Coste | 0 | 0 | **Pay-per-usage con créditos prepagados, sin niveles gratuitos**: publicación estándar 0,015 USD por petición; **publicación con URL 0,200 USD**; las lecturas (por ejemplo comprobar una publicación) también se cobran según tarifa. No hay cuota mínima mensual |
| Respuesta al publicar | `{ id (foto), post_id (publicación) }`; el enlace se lee después (`permalink_url`) | `{ id }` del hilo; `permalink` se lee después | `{ data: { id, text } }`; enlace `https://x.com/<usuario>/status/<id>` |

Notas de verificación:
- Facebook: la guía de "Posts" documenta `url` como único parámetro obligatorio; la referencia de `/photos` añade `caption`, `published` y `scheduled_publish_time`. No se usará la programación de Facebook: la hora la decide nuestro sistema para que todos los destinos compartan la misma lógica.
- Threads: la ventana de autorización es `https://threads.net/oauth/authorize` y el canje `POST https://graph.threads.net/oauth/access_token`; el canje a larga duración lleva el secret de la app y debe hacerse en servidor (nunca en el panel). El panel de la app de Meta ofrece a los Threads Testers un generador de token equivalente al de Instagram; si estuviera disponible, es la vía preferida (paso 4 de la guía de F2). Si no, el intercambio se hará en un workflow manual de GitHub (véase 6.2).
- X: la página de precios ya no muestra niveles Free/Basic/Pro, solo pago por uso con créditos. Antes de F3 hay que confirmar en la consola de desarrollador el precio vigente de `media upload` y de las lecturas, porque la documentación consultada no lo detalla.

## 3. Arquitectura sobre la actual

Se conserva todo lo que ya existe: pieza única en `posts/<id>.json`, imagen renderizada una sola vez (1080×1350 JPEG, válida para las cuatro redes), ilustración de Gemini una sola vez, cola por `programado`, job por cuenta con Environment `cuenta-<id>`, `estadoConexion` y guía de conexión en el panel.

### 3.1 Conexiones por plataforma en la cuenta

`cuentas/<id>/config.json` gana el bloque opcional `conexiones`:

```json
"conexiones": {
  "facebook": { "publicar": false, "pagina": "123456789012345" },
  "threads":  { "publicar": false, "usuario": "17841400000000000" },
  "x":        { "publicar": false, "usuario": "luiseskivelgolcher" }
}
```

- Instagram sigue en `instagram` (sin cambios). El interruptor de Instagram sigue siendo `automatico.publicar`.
- `automatico.publicar` pasa a ser el interruptor maestro de la cuenta; cada red nueva necesita además su `conexiones.<red>.publicar`. Toda conexión nueva nace `false`.
- Las conexiones nuevas solo existen en modo Environment: sus secretos viven en el Environment `cuenta-<id>` con nombres fijos. No hay modo "repositorio" para ellas (menos casos, menos riesgo).

| Red | Secretos en `cuenta-<id>` | Identificador público en config |
|---|---|---|
| Facebook | `FB_PAGE_TOKEN` | `pagina` (id numérico de la página) |
| Threads | `THREADS_ACCESS_TOKEN` | `usuario` (id numérico de Threads) |
| X | `X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_REFRESH_TOKEN` (OAuth 2.0 con `offline.access`) o los cuatro valores de OAuth 1.0a si se confirma esa vía | `usuario` (handle) |

- `src/lib/secretos.mjs`: `nombresDeSecretosDe(red)` y `leerSecretosDe(config, red, env)`; los patrones de ocultación se amplían (tokens `EAA…` ya están; se añaden los de Threads `TH…` y los de X).
- `src/lib/entornos.mjs` comprueba solo los secretos de las conexiones **encendidas** (más las de Instagram si `automatico.publicar`); una conexión apagada sin secretos no es un error.
- Estado de conexión por red: `data/<id>/conexion-<red>.json` con la misma forma que `conexion.json` (`verificada | error | credenciales-pendientes | pendiente`, `usuario`/nombre de página, `comprobado`, `detalle`, nunca valores). `estadoConexion` se parametriza por red; `requisitosPublicacion` exige identidad verificada de **cada** red que se quiera encender.
- Verificación: nuevo workflow manual `probar-destino.yml` (inputs `cuenta`, `red`) con el mismo esquema de job por Environment que `probar-instagram.yml`. Identidad: Facebook `GET /me` con el token de página debe devolver el id de `pagina`; Threads `GET /me?fields=id,username` debe coincidir con `usuario`; X `GET /2/users/me` debe devolver el handle (esta llamada es de pago: se hace solo al verificar, no en cada corrida).
- Renovación: Threads entra en `renovar-token.yml` (`th_refresh_token`, escribiendo al Environment con `GH_PAT` como hoy con Instagram). Facebook no necesita renovación. X: si se usa OAuth 2.0, el job renueva el token de acceso en cada corrida y guarda el refresh token nuevo en el Environment; con OAuth 1.0a no hay renovación.

### 3.2 Destinos en el post

Cada post gana el bloque opcional `destinos`, uno por red seleccionada:

```json
"destinos": {
  "instagram": { "texto": null, "estado": "publicado", "publicacion": { "id": "1792…", "permalink": "https://www.instagram.com/p/…", "fecha": "…" }, "error": null, "intento": null },
  "facebook":  { "texto": "Versión para Facebook…", "estado": "error", "publicacion": null, "error": { "mensaje": "…", "fecha": "…", "intentos": 2 }, "intento": null },
  "threads":   { "texto": null, "estado": "pendiente", "publicacion": null, "error": null, "intento": null }
}
```

- `texto: null` significa "usar la versión automática" (3.3). Al editarla en el panel se guarda el texto; "Restablecer" vuelve a `null`.
- Estados de destino: `pendiente` → `publicado` | `error` | `incierto` (4.2). Un destino puede estar `omitido` si su conexión se apagó después de aprobar la pieza.
- Compatibilidad: los posts actuales no tienen `destinos`. Al leerlos se deriva `destinos.instagram` de `publicacion`/`error`/`estado` (sin reescribir el archivo). Al escribir, `publicacion` y `error` del post siguen reflejando el destino Instagram, de modo que panel, métricas y archivo actuales no cambian. El validador acepta ambas formas.
- Estado del post (sin estados nuevos en `ESTADOS`): `programado` mientras algún destino esté `pendiente` o `incierto`; `publicado` cuando todos los destinos activos estén `publicado`; `error` cuando ya no quede nada pendiente y algún destino haya fallado (`error.paso = "destino"`, mensaje con la lista de redes). `reintentar` solo devuelve a `pendiente` los destinos en `error`; los publicados no se tocan.
- Selección de destinos: al aprobar (diálogo "Programar publicación") se marcan los destinos; por defecto, los que tengan conexión verificada y encendida. Solo se pueden marcar destinos cuya conexión esté encendida; el resto aparecen deshabilitados con el motivo. Cambiar la selección después de aprobar es posible mientras el destino no se haya publicado.

### 3.3 Texto por red sin duplicar generación

Claude sigue redactando una sola vez (titular, bajada, caption, hashtags, escena). La versión de cada red la produce un compositor determinista en `src/lib/versiones.mjs` (isomorfo, también en el panel) a partir de la pieza común:

| Red | Versión automática | Límite |
|---|---|---|
| Instagram | La actual (`componerCaption`: caption + fuente + hashtags) | 2200 caracteres, 30 hashtags (ya validado) |
| Facebook | Caption + línea de fuente ("Fuente: OCCRP") sin hashtags (o los 2 primeros) | 63 206 caracteres (holgado) |
| Threads | Caption recortado al límite + fuente; sin hashtags (Threads no los usa como Instagram) | 500 caracteres contando bytes UTF-8 |
| X | Titular + fuente, sin URL por defecto (una URL multiplica por 13 el coste de la publicación) | 280 caracteres |

El panel muestra cada versión con contador y permite editarla. La imagen es la misma para todas las redes; no se generan imágenes ni ilustraciones adicionales.

### 3.4 Publicación por destinos (`src/publicar.mjs`)

El job por cuenta (Environment) ya expone los secretos de la cuenta; se añaden a su bloque `env` los nombres fijos de las redes nuevas (vacíos si no existen). Por cada post listo:

1. Se comprueba una vez la imagen (existente: `imagenPublica`, hash actualizado) y, para X, se descarga el JPEG de Pages para subirlo en binario.
2. Se recorre cada destino `pendiente` o `incierto` de la selección, en orden fijo (instagram, facebook, threads, x). Cada destino tiene su cliente (`src/lib/facebook.mjs`, `src/lib/threads.mjs`, `src/lib/x.mjs`) con la misma interfaz que el de Instagram: `perfil()`, `cuota()` si existe, `publicarImagen({ imageUrl | imagenBinaria, texto })`, `buscarReciente({ texto, desde })` para reconciliar (4.2).
3. Antes de llamar a la red se escribe en el post `destinos.<red>.intento = { n, inicio, fase }` (el archivo se guarda en disco al instante; el paso "Guardar cambios" del workflow pasa a ejecutarse siempre, también si el proceso falló).
4. Resultado: `publicado` (con id, enlace y fecha), `error` (mensaje saneado, contador de intentos) o `incierto` (4.2). Un error en un destino no impide seguir con el siguiente ni con los demás posts. Se respeta la cuota de cada red (Instagram `content_publishing_limit`; Threads 250/24 h con su endpoint de cuota si lo expone; Facebook y X por códigos de límite).
5. Identidad: antes de publicar en una red se comprueba `perfil()` como hoy con Instagram (X: se omite la llamada de pago en cada corrida; se confía en la verificación manual y en el propio error de autenticación).

Secretos de una red nunca se usan para otra: cada cliente recibe únicamente los suyos.

## 4. Fallos, reintentos y respuestas inciertas

### 4.1 Reintentos sin duplicar

- Un destino `publicado` es definitivo: el reintento (manual desde el panel o automático en la siguiente corrida para `incierto`) solo actúa sobre destinos `pendiente`, `error` o `incierto`.
- Los errores de red o 5xx se reintentan dentro de la misma corrida como hoy (hasta 3, con espera creciente) **solo si la petición no llegó a enviarse o la red respondió con un error claro**. Un error tras enviar la petición de publicación pasa a `incierto`, nunca a reintento ciego.
- Límite de intentos por destino: 3 corridas; después el destino queda en `error` hasta que el operador pulse "Reintentar".

### 4.2 Respuestas inciertas (corte de conexión tras enviar)

Antes de cada intento se persiste `intento` con la hora y la fase (`subiendo` → `creando` → `publicando`). Si la corrida termina sin resultado claro (timeout después de enviar la publicación, proceso interrumpido), el destino queda `incierto`. En la siguiente corrida, antes de intentar nada, se **reconcilia**:

- Facebook: `GET /{page}/posts?fields=message,created_time,permalink_url` (últimas 10) y se busca una publicación con el mismo texto creada después de `intento.inicio`. Si existe, se adopta como `publicado`; si no, se vuelve a `pendiente`. Lectura gratuita.
- Threads: igual con `GET /me/threads?fields=id,text,timestamp,permalink`. Gratuita. Además, un contenedor creado y no publicado no aparece en el perfil: se vuelve a crear (el contenedor antiguo caduca solo).
- X: la lectura cuesta dinero. Se ofrece en el panel el botón "Comprobar en X" que hace **una** lectura (`GET /2/users/:id/tweets?max_results=5`) bajo demanda; si el operador prefiere no pagar, puede marcar el destino como "publicado manualmente" (con el enlace) o volver a "pendiente" tras mirar su perfil. La corrida automática no reintenta un destino `incierto` de X por su cuenta.
- Además, para Facebook y Threads, **antes de cualquier intento** se hace esa misma lectura barata: si ya existe una publicación idéntica reciente (por ejemplo tras una interrupción brusca del runner que no llegó a guardar el `intento`), se adopta y no se duplica.

Riesgo residual documentado: en X, si el runner muere después de enviar `POST /2/tweets` y antes de guardar el `intento`, la siguiente corrida podría duplicar. Mitigación: el guardado inmediato en disco más el paso de commit `always()`; X además rechaza publicaciones con texto idéntico reciente ("duplicate content"), lo que actúa de segunda barrera (comportamiento a confirmar en pruebas reales).

## 5. Panel

- **Tarjeta de post**: fila de destinos con chips (icono de red + estado: pendiente / publicado con enlace "Ver en …" / error con mensaje / incierto con acción). Desplegable "Versiones por red" con un área de texto por destino seleccionado, contador y "Restablecer a la versión automática". "Reintentar" muestra a qué destinos afectará.
- **Diálogo "Programar publicación"**: además de fecha y hora (hora de Panamá), las casillas de destino con el motivo cuando una red no está disponible ("Conexión apagada", "Identidad no verificada").
- **Tarjeta de cuenta**: una fila por red con estado de conexión, interruptor (activación segura: solo si la identidad está verificada y hay secretos), botón "Verificar" (lanza `probar-destino.yml`; con el token del panel sin permiso Actions se muestra la ruta manual como hoy) y guía desplegable con los pasos externos.
- **Formulario de cuenta**: sección "Conexiones" con, por red, casilla de interruptor (nace apagada), identificador público (id de página, id de Threads, handle de X) y los nombres fijos de los secretos con enlace al Environment. **Ningún valor de secreto entra ni se muestra en el panel.**
- **Vista general**: por cuenta, resumen "IG · FB · TH · X" con estado de cada conexión y último error por red.

## 6. Guías de conexión (pasos externos)

### 6.1 Facebook (F1)
1. Tener una página de Facebook y ser administrador de ella (Meta Business Suite → Páginas). Si la marca no tiene página, crearla.
2. En la app de Meta (tipo empresa, la misma de la cuenta): Casos de uso → añadir "Facebook Login for Business" si no está; crear una configuración con tipo de token "Usuario" y permisos `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`.
3. Obtener un token de usuario con esos permisos (Graph API Explorer, con la app y el usuario administrador), canjearlo por uno de larga duración (`GET /oauth/access_token?grant_type=fb_exchange_token…`, en servidor: se hará con un workflow manual `obtener-token-facebook.yml` que recibe el token corto como input de GitHub y guarda el de página en el Environment con `GH_PAT`, sin pasar por el panel) y con él pedir `GET /me/accounts` para el token de página y su id.
4. En GitHub: Environment `cuenta-<id>` → secreto `FB_PAGE_TOKEN` (lo escribe el workflow anterior o el operador a mano). En el panel: id de la página.
5. Verificar (Actions → Probar destino → cuenta + facebook) y encender el interruptor de Facebook de la cuenta.

### 6.2 Threads (F2)
1. En la app de Meta: Casos de uso → añadir "Threads API"; anotar el Threads App ID y el Threads App Secret (distintos de los de Instagram).
2. Roles → Threads Testers → invitar al perfil de Threads de la cuenta; aceptar la invitación en Threads (Configuración → Cuenta → Sitios web y aplicaciones).
3. Permisos: `threads_basic` y `threads_content_publish`.
4. Token: si el panel de la app ofrece "Generar token" para el tester, usarlo (token de larga duración, 60 días). Si no, autorizar en `https://threads.net/oauth/authorize?client_id=…&redirect_uri=<URL de Pages>/threads-oauth.html&scope=threads_basic,threads_content_publish&response_type=code`; la página estática muestra el `code`, que se introduce como input del workflow manual `obtener-token-threads.yml` (canje + larga duración en servidor; guarda `THREADS_ACCESS_TOKEN` en el Environment con `GH_PAT`). El secret de la app de Threads vive como secreto del Environment (`THREADS_APP_SECRET`) solo para ese workflow y la renovación.
5. En GitHub: Environment `cuenta-<id>` con `THREADS_ACCESS_TOKEN` (y `THREADS_APP_SECRET`). En el panel: id de usuario de Threads. Verificar y encender.

### 6.3 X (F3, condicionada)
1. Cuenta de desarrollador en developer.x.com (alta con la cuenta de X de la marca), app con "User authentication settings" (OAuth 2.0, tipo de app "Automated App or bot", callback `<URL de Pages>/x-oauth.html`, permisos de lectura y escritura).
2. Comprar créditos en la consola (pay-per-usage). Antes, confirmar el precio de media upload y de lecturas.
3. Autorizar con PKCE (`https://x.com/i/oauth2/authorize` con scopes `tweet.read tweet.write users.read media.write offline.access`), canjear en `https://api.x.com/2/oauth2/token` mediante el workflow manual `obtener-token-x.yml` (recibe el `code` y el `code_verifier` como inputs; guarda `X_REFRESH_TOKEN` en el Environment).
4. Environment `cuenta-<id>` con `X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_REFRESH_TOKEN`. En el panel: handle. Verificar (una lectura de pago) y encender.

## 7. Fases, cambios y criterios de aceptación

### F1 · Facebook (base multicanal incluida)
Cambios: modelo `destinos` + compatibilidad en `posts.mjs`/`estados.mjs`; `versiones.mjs`; `conexiones` en `config.mjs`; secretos por red en `secretos.mjs`/`entornos.mjs`; `facebook.mjs`; `publicar.mjs` por destinos con `intento` y reconciliación; `probar-destino.yml`, `obtener-token-facebook.yml`, ajuste de `publicar.yml` (env y `always()`); panel (chips, versiones, diálogo, tarjeta de cuenta, formulario, guía); docs (CONFIGURACION §9, ARCHITECTURE 2.4/2.6/2.7, GUIA).
Aceptación:
- Los posts existentes se leen, se muestran y se publican en Instagram exactamente como hoy (pruebas con los fixtures actuales sin `destinos`).
- Con clientes simulados: pieza con destinos Instagram + Facebook, fallo en Facebook → Instagram publicado, Facebook en error, post en `programado`/`error` según corresponda; "Reintentar" solo llama al cliente de Facebook; respuesta incierta → `incierto` → reconciliación adopta la publicación existente sin volver a publicar; interrupción antes de guardar `intento` → la lectura previa evita el duplicado.
- Aislamiento: el cliente de Facebook nunca recibe secretos de Instagram ni viceversa; una conexión apagada sin secretos no rompe la comprobación del Environment.
- Panel (e2e con API simulada): seleccionar destinos, editar y restablecer la versión de Facebook, ver estado y enlace por destino; conexión nueva nace apagada y no se puede encender sin identidad verificada.
- Real (cuando exista una página y su token): `probar-destino` verifica la página; una publicación real en la página de prueba con enlace guardado.

### F2 · Threads
Cambios: `threads.mjs` (contenedor → espera ~30 s → publicar; cuota), compositor de 500 bytes, `obtener-token-threads.yml` + página estática de OAuth (solo si no hay generador de token), renovación en `renovar-token.yml`, guía.
Aceptación: los mismos escenarios simulados que F1 para Threads; texto que excede 500 bytes se recorta y el panel lo avisa; renovación simulada escribe el token nuevo solo en el Environment; real: verificación + una publicación de prueba.

### F3 · X (solo si se confirma acceso y coste)
Condiciones previas: presupuesto aprobado por el operador con el precio vigente confirmado (publicación 0,015 USD, con URL 0,200 USD, más media upload y lecturas). Cambios: `x.mjs` (subida binaria, `POST /2/tweets`, OAuth 2.0 con refresh y rotación del refresh token en el Environment, o OAuth 1.0a si se confirma), compositor de 280 caracteres sin URL por defecto, "Comprobar en X" bajo demanda, guía.
Aceptación: escenarios simulados (incluida rotación de refresh token y el caso `incierto` con comprobación manual); coste estimado mostrado en el panel por publicación; real: verificación y una publicación de prueba con el gasto registrado.

## 8. Costes

| Concepto | F1 Facebook | F2 Threads | F3 X |
|---|---|---|---|
| API | 0 | 0 | 0,015 USD por publicación sin URL; 0,200 USD con URL; media upload y lecturas según tarifa vigente (a confirmar). 30 publicaciones/mes sin URL ≈ 0,45 USD; con URL ≈ 6 USD; más las comprobaciones que se pidan |
| Claude / Gemini | 0 adicional (versiones deterministas; una sola imagen e ilustración) | 0 adicional | 0 adicional |
| GitHub Actions | Segundos más por corrida dentro del mismo job por cuenta; una corrida manual por verificación u obtención de token | Igual | Igual |
| Desarrollo (orientativo) | 4–5 días | 2–3 días | 2–3 días + alta y créditos |

## 9. Limitaciones y riesgos

- **Dependencia de Meta**: el bloqueo de la cuenta de desarrollador quedó resuelto el 2026-09-09 a las 18:11 UTC; cualquier bloqueo futuro afectaría a Instagram, Facebook y Threads a la vez. Sigue pendiente regenerar el token de Instagram de Sin Línea (código 190). Las pruebas reales de F1/F2 dependen de tener una página de Facebook administrada y un perfil de Threads con la app en Roles; el diseño y las pruebas con clientes simulados no dependen de ello.
- Instagram sigue siendo la única red con modo "repositorio"; las nuevas son solo Environment. Una cuenta en modo repositorio que quiera Facebook deberá migrar antes a Environment (Sin Línea).
- Threads mide el límite en bytes UTF-8: los textos con emojis o acentos caben menos de 500 caracteres.
- X: sin nivel gratuito; cada URL en el texto multiplica el coste; la comprobación de publicaciones cuesta lecturas. Los tokens OAuth 2.0 duran 2 h y obligan a rotar el refresh token en cada corrida (escritura en el Environment con `GH_PAT`); si OAuth 1.0a sigue admitido para publicar, se preferirá por simplicidad.
- Reconciliación por texto: si dos piezas distintas tuvieran el mismo texto en la misma ventana, la reconciliación podría confundirlas; se limita a publicaciones posteriores a `intento.inicio` y de la misma cuenta.
- Programación por red (horas distintas por destino) queda fuera de este diseño; la pieza tiene una sola hora.
- Métricas de Facebook, Threads y X: fase posterior. La vista de métricas seguirá mostrando solo Instagram.

## 10. Qué no cambia ahora

No se implementa nada de lo anterior hasta que el operador apruebe el diseño. No se contratan servicios (X). No se tocan las conexiones, pausas ni colas actuales: Sin Línea sigue pausada con su cola; @luiseskivelgolcher sigue con generación y publicación encendidas en Instagram y métricas activas.
