# Configuración inicial, paso a paso

Sigue los pasos en orden. Cada uno se hace una sola vez.

## 1. El logo
Guarda el logo oficial (círculo amarillo con SIN LÍNEA) como `cuentas/sinlinea/logo.png`,
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
   Es normal que las primeras corridas de "Generar borradores" salgan en rojo hasta completar los pasos 3 y 4.
3. En el repo → **Settings → Pages → Source: GitHub Actions**.
4. Edita `config.json`: `pages.baseUrl` = `https://<tu-usuario>.github.io/sinlinea`
   y `marca.usuario` = tu usuario de Instagram (con @). Haz commit y push.

## 3. Clave de Claude
1. Entra en https://console.anthropic.com → **API Keys → Create Key**.
2. En el repo → **Settings → Secrets and variables → Actions → New repository secret**:
   nombre `ANTHROPIC_API_KEY`, valor la clave.
   La usan GENERAR (redacción) y REGENERAR (solo para acortar titular y bajada cuando no
   quepan en la imagen; sin la clave, ese post queda en error para corregirlo en el panel).
3. Costo esperado: 3 a 4 USD al mes con `claude-sonnet-5` (el configurado); 7 a 10 con `claude-opus-5`.

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
5. Obtén el id numérico de la cuenta (el `@` no sirve como id): en el mismo panel de
   la app de Meta, junto a la cuenta añadida, aparece su **Instagram account ID**.
   Si no lo ves, sigue con el paso 6 solo con el token y ejecuta **Probar
   Instagram** (paso 7): el informe te dirá el `user_id` que devuelve la API para
   guardarlo como secreto. Nunca pegues el token en una URL del navegador ni en
   el chat.
6. Crea los secretos `IG_ACCESS_TOKEN` (el token) e `IG_USER_ID` (el id numérico).
7. Actions → **Probar Instagram** → Run workflow con `cuenta` = `sinlinea`. Comprueba
   que la credencial pertenece al usuario esperado y guarda en
   `data/sinlinea/token-info.json` la caducidad real si la API la informa; si no,
   queda como **desconocida** (no se asume "hoy + 60 días"). La renovación semanal
   (`renovar-token.yml`, necesita `GH_PAT`) devuelve un token nuevo con su fecha real.

La app puede quedarse en modo desarrollo: publicar en tu propia cuenta (tester)
no requiere revisión de Meta.

## 5. Token para renovar el secreto (GH_PAT)
1. github.com → tu avatar → **Settings → Developer settings → Personal access
   tokens → Fine-grained tokens → Generate new token**.
2. Nombre `sinlinea-actions`, vencimiento 1 año, **Repository access: Only select
   repositories → sinlinea**, **Permissions → Repository → Secrets: Read and write**
   (para secretos de repositorio, modo actual) **y Environments: Read and write**
   (para secretos de Environment, fase 2). Son permisos distintos: según la
   documentación oficial de la API REST, los secretos de entorno se leen y
   escriben con el permiso *Environments*, no con *Secrets*.
3. Guárdalo como secreto del repo con nombre `GH_PAT`.
4. `renovar-token.yml` comprueba que `GH_PAT` exista **antes** de pedir un token nuevo;
   si falta, la corrida falla con un mensaje claro y no se toca el token actual.
   Después de crearlo, activa el workflow en **Actions → Renovar token de Instagram →
   Enable workflow** y lánzalo una vez con **Run workflow** para comprobarlo.

## 6. Token para el panel (celular)
1. Igual que arriba, nombre `sinlinea-panel`, solo el repo `sinlinea`,
   **Permissions → Repository → Contents: Read and write**. Opcionales para el
   panel maestro: **Actions: Read and write** (lanzar "Verificar identidad"
   desde el panel) y **Secrets: Read** (el panel lee solo nombres y fechas de
   actualización de los secretos para avisar cuando un secreto cambió después
   de la última verificación; nunca valores).
2. En el celular abre `https://<tu-usuario>.github.io/sinlinea/panel/` →
   **Configurar** → pega el token → **Guardar y conectar**. Queda guardado solo en ese
   navegador. Repite en cada dispositivo desde el que quieras aprobar.
3. **Límites de la API de GitHub.** También con token hay un tope (5000
   peticiones por hora por usuario, más límites secundarios). El panel los
   gestiona solo: guarda en memoria los metadatos de secretos ya consultados
   (10 minutos; recargar la página los vuelve a pedir), no repite consultas al
   guardar, archivar o verificar, y si GitHub responde con un límite (403 con
   `x-ratelimit-remaining: 0` o 429) deja de consultar hasta la hora de
   reinicio y lo dice en pantalla ("GitHub limitó las consultas… se reanudan a
   las HH:MM"). Sin token el tope es de 60 peticiones por hora por IP, así que
   el panel en modo solo lectura se agota rápido: conecta el token.

## 6b. Variables y secretos: resumen y verificación

Todos los valores sensibles viven **solo** en *Settings → Secrets and variables →
Actions* del repositorio (y el token del panel, solo en el navegador). Nunca van en
`config.json`, en `posts/*.json`, en GitHub Pages ni en el código del panel. Los
mensajes de error que se guardan o se registran pasan por un filtro que tapa tokens y
claves (`src/lib/secretos.mjs`).

| Secreto | Obligatorio | Lo usan | Cómo se obtiene |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | sí | GENERAR (redacción), REGENERAR (acortar textos, redactar escenas) | §3 |
| `GEMINI_API_KEY` | sí, si `ilustraciones.activo` es `true` | GENERAR y REGENERAR (ilustraciones), Probar Gemini | §10 |
| `IG_ACCESS_TOKEN` | sí | PUBLICAR, RENOVAR TOKEN | §4 |
| `IG_USER_ID` | sí | PUBLICAR, RENOVAR TOKEN | §4 |
| `IG_ACCESSTOKEN_LUISESKIVELGOLCHER` | cuando se active la cuenta | PUBLICAR, RENOVAR TOKEN, Probar Instagram | §6c |
| `IG_USER_ID_LUISESKIVELGOLCHER` | cuando se active la cuenta | PUBLICAR, RENOVAR TOKEN, Probar Instagram | §6c |

Nota: el secreto del token de `luiseskivelgolcher` se llama
`IG_ACCESSTOKEN_LUISESKIVELGOLCHER` (sin guion bajo entre ACCESS y TOKEN) porque
así lo creó el operador el 2026-09-08; la configuración de la cuenta y los
workflows usan ese nombre. La convención para cuentas nuevas sigue siendo
`IG_ACCESS_TOKEN_<ID>`.
| `GH_PAT` | no (pero sin él el token de Instagram no se renueva solo) | RENOVAR TOKEN | §5 |

**Fase 2 (origen de credenciales por cuenta).** Cada cuenta declara en
`cuentas/<id>/config.json` → `instagram.origen` de dónde salen sus credenciales:

| `instagram.origen` | Dónde viven las credenciales | Nombres | Quién las lee |
|---|---|---|---|
| `repositorio` (modo actual, valor por defecto) | Settings → Secrets and variables → Actions | los declarados en `tokenSecreto` / `usuarioIdSecreto` (o `IG_ACCESS_TOKEN` / `IG_USER_ID`) | el job `*-repositorio` de cada workflow, que expone **solo** esos dos secretos con los nombres fijos `IG_ACCESS_TOKEN` / `IG_USER_ID` |
| `entorno` (Environment) | Settings → Environments → `cuenta-<id>` → Environment secrets | siempre `IG_ACCESS_TOKEN` e `IG_USER_ID` | el job `*-entorno` de cada workflow, que corre con `environment: cuenta-<id>` y solo ve esos dos secretos |

No hay fallback entre orígenes: si una cuenta en modo `entorno` no tiene sus dos
secretos en el Environment, su job falla con un mensaje que nombra el entorno y
el secreto que falta, y no se usa ninguna credencial de otro origen. Los
workflows construyen un job por cuenta a partir de `config.json`
(`src/cuentas-activas.mjs`): **añadir una cuenta no requiere editar los
workflows**. El panel muestra el modo de cada cuenta en su tarjeta y el
formulario permite elegirlo.

Los nombres de los secretos de Instagram se declaran en la configuración de cada
cuenta (`cuentas/<id>/config.json`); la versión de la API va en el `config.json` global:

```json
"instagram": { "tokenSecreto": "IG_ACCESS_TOKEN", "usuarioIdSecreto": "IG_USER_ID" }
```

**Convención para cuentas adicionales:**
cada cuenta declara sus propios nombres siguiendo el patrón `IG_ACCESS_TOKEN_<ID>` e
`IG_USER_ID_<ID>`, con `<ID>` el identificador de la cuenta en mayúsculas y solo con
letras, dígitos y guion bajo (por ejemplo, la cuenta `otro-medio` usa
`IG_ACCESS_TOKEN_OTRO_MEDIO`). La cuenta actual conserva `IG_ACCESS_TOKEN` e
`IG_USER_ID`. Un nombre inválido hace fallar la validación de `config.json`.

**Verificar que no falta nada.** Sin revelar ningún valor:
- En GitHub: **Actions → Verificar configuración y secretos → Run workflow**. El
  informe marca cada secreto como OK o FALTA, comprueba `config.json`, el logo, las
  fuentes tipográficas y la fecha de vencimiento del token de Instagram.
- En tu computadora: `npm run verificar` (los secretos que no tengas como variables de
  entorno aparecerán como FALTA; eso es normal en local).

## 6c. Cuentas: cómo funciona y cómo añadir otra

Desde el cierre del Panel Maestro (2026-09-09), **Añadir cuenta** en el panel
crea la cuenta en modo Environment (`instagram.origen: "entorno"`) con
generación, publicación y métricas apagadas, y su tarjeta muestra la guía de
conexión con el nombre exacto del Environment, los dos secretos y los enlaces
a GitHub y Meta. Los interruptores de la tarjeta aplican la activación segura
descrita en GUIA.md.

Cada cuenta de Instagram vive en `cuentas/<id>/` (id en minúsculas, dígitos y
guiones) con tres archivos:

- `config.json`: `nombre`, `idioma` (opcional, `es-PA` por defecto), `marca`
  (nombre, usuario con @, lema), `fuentes`, `generar` (cupos), `franjas`,
  `ilustraciones` (`estilo` y `rotulo`, este último opcional: vacío = sin rótulo en
  la imagen) e `instagram` con los **nombres** de sus
  secretos (`tokenSecreto`, `usuarioIdSecreto`). Nunca valores.
- `editorial.md`: la línea editorial que lee Claude.
- `logo.png`: el logo que va en la imagen.

`config.json` de la raíz declara la lista `cuentas` (la primera es la principal:
a ella pertenecen los posts anteriores al soporte multi-cuenta) y lo compartido
(Pages, Claude, Gemini, versión de la API). Los datos de cada cuenta van en
`data/<id>/` (`seen.json`, `token-info.json`); los posts siguen todos en
`posts/`, con el campo `cuenta` en los nuevos.

Cada cuenta tiene además:

- `automatico`: `{ "generar": true|false, "publicar": true|false }` (ambos `true`
  si no se indica). Con `generar: false` Claude no redacta posts para la cuenta;
  con `publicar: false` sus posts aprobados quedan en cola y no se publican.
  Sirve para dar de alta una cuenta y probarla antes de encenderla.
- `marca.colores`: `{ "principal", "acento", "oscuro", "claro" }` en `#RRGGBB`
  (la paleta de Sin Línea por defecto). Si cambian, REGENERAR vuelve a dibujar
  los posts activos de esa cuenta.
- `marca.logoForma`: `"circulo"` (por defecto) o `"cuadrado"`. Con `"cuadrado"` el
  logo no se recorta en círculo (así va el logo LEG de `luiseskivelgolcher`).
  Si cambia, REGENERAR vuelve a dibujar los posts activos de esa cuenta.
- `marca.logoTamano`: lado del logo en píxeles dentro de la imagen de 1080x1350
  (120 por defecto; entero entre 60 y 160; `luiseskivelgolcher` usa 90). Si
  cambia, REGENERAR vuelve a dibujar los posts activos de esa cuenta.
- Sin `logo.png`, la imagen muestra las iniciales de `marca.nombre` (en círculo o
  cuadrado según `marca.logoForma`, del tamaño de `marca.logoTamano`).
- `npm run logo -- --cuenta <id>` genera `cuentas/<id>/logo.png`: un cuadrado con
  las iniciales en la tipografía del titular (Anton), fondo `colores.oscuro` y
  letras `colores.principal`. Admite `--texto`, `--fondo`, `--letra`, `--tamano`
  (1024 por defecto) y `--salida`; por ejemplo, la versión clara para fondos
  blancos: `--fondo "#FFFFFF" --letra "#111111" --salida cuentas/<id>/logo-claro.png`
  (ese archivo no lo usa la plantilla; sirve para la foto de perfil o material
  impreso).

**Identidad antes de publicar.** PUBLICAR consulta `/me` con el token de cada
cuenta y solo publica si el usuario devuelto coincide con `marca.usuario` y el
`user_id` con el secreto de id numérico. Si no coinciden, no publica y lo anota
en el resumen de la corrida. El workflow manual **Probar Instagram** hace la misma
comprobación sin publicar (entrada `cuenta`, vacío = todas).

### Alta de una cuenta nueva (ejemplo: `luiseskivelgolcher`)

1. Carpeta `cuentas/luiseskivelgolcher/` con `config.json` (ya creada, con
   `automatico.generar` y `automatico.publicar` en `false`, colores propios,
   sin fuentes y con `instagram.tokenSecreto` = `IG_ACCESSTOKEN_LUISESKIVELGOLCHER`
   y `usuarioIdSecreto` = `IG_USER_ID_LUISESKIVELGOLCHER`), `editorial.md`
   y `logo.png` (LEG en cuadrado, generado con `npm run logo`). `data/luiseskivelgolcher/`
   con `seen.json` y `token-info.json`. El id está en `cuentas` del `config.json`
   global y el panel ya la muestra en el selector.
2. **Cuenta profesional.** En la app de Instagram: Configuración → Tipo de cuenta
   → Cambiar a cuenta profesional (Creador o Empresa). Sin esto la API no puede
   publicar ni identificar la cuenta.
3. **Probadora de la app de Meta.** En https://developers.facebook.com → app
   "Sin Línea" → App roles → Roles → Add people → Instagram Tester → usuario
   `luiseskivelgolcher`. Acepta la invitación desde Instagram: Configuración →
   Sitios web y permisos → Apps y sitios web → Invitaciones de tester.
4. **Token.** En la app → Instagram → API setup with Instagram login → Add
   account (inicia sesión con @luiseskivelgolcher) → Generate token, permisos
   `instagram_business_basic` e `instagram_business_content_publish`. Copia el
   token (larga duración, 60 días).
5. **Id numérico.** El `@` no sirve como id. En el panel de la app de Meta, junto a
   la cuenta añadida, aparece su **Instagram account ID**; cópialo. Si no lo ves,
   guarda primero solo el token (paso 6) y ejecuta **Probar Instagram** (paso 7):
   el informe indica el `user_id` que devuelve la API. Nunca pegues el token en una
   URL del navegador ni en el chat.
6. **Secretos.** Dos opciones, según `instagram.origen` de la cuenta:
   - *Modo actual* (`repositorio`): Repo → Settings → Secrets and variables →
     Actions → New repository secret, con los nombres que declara la cuenta
     (`luiseskivelgolcher` usa `IG_ACCESSTOKEN_LUISESKIVELGOLCHER` e
     `IG_USER_ID_LUISESKIVELGOLCHER`; hecho el 2026-09-08 por el operador).
   - *Environment* (`entorno`, fase 2): Repo → Settings → Environments → New
     environment con el nombre exacto `cuenta-<id>` (hace falta ser
     administrador del repositorio) → Environment secrets → Add secret dos veces:
     `IG_ACCESS_TOKEN` (el token) e `IG_USER_ID` (el id numérico). El panel
     muestra el nombre del entorno en el formulario y en la tarjeta.
   En ambos casos el valor lo pega el operador; ni el panel ni el asistente lo
   ven.
7. **Verificar identidad y caducidad.** Actions → **Probar Instagram** → Run
   workflow con `cuenta` = `luiseskivelgolcher`. Debe decir que la credencial
   pertenece a `@luiseskivelgolcher` y que el id numérico coincide. El workflow
   guarda en `data/luiseskivelgolcher/token-info.json` la caducidad real si la API
   la informa; si no, queda como **desconocida** hasta la primera renovación
   (`renovar-token.yml` devuelve un token nuevo con su fecha real). No se asume
   "hoy + 60 días". Hecho el 2026-09-08: la prueba confirmó que la credencial es de
   `@luiseskivelgolcher` y que el id numérico coincide; la API no informó caducidad,
   así que quedó registrada como desconocida.
8. **Encender.** Solo después de la prueba: define `editorial.md`, `fuentes`,
   `franjas`, colores y logo definitivos, y pon `automatico.publicar` (y cuando
   toque `automatico.generar`) en `true`. Mientras estén en `false`, la cuenta
   puede editarse y aprobar posts en el panel sin que nada salga a Instagram.
   Reactivar una cuenta archivada tampoco enciende nada.

Si una cuenta tiene la configuración rota o le falta un secreto, esa cuenta se
omite con un aviso en el registro y las demás siguen funcionando (cada cuenta
corre en su propio job; `fail-fast: false`).

### 6d. Migrar una cuenta del modo actual al Environment (fase 2)

Orden para `luiseskivelgolcher` (la primera en migrar); Sin Línea sigue igual
mientras tanto y **`automatico` no se toca en ningún paso**:

0. **Requisito previo**: el secreto `GH_PAT` (§5) con los permisos
   **Environments: Read and write** y **Secrets: Read and write**. Los jobs
   comprueban con él, por la API de GitHub y solo metadatos, que el Environment
   de cada cuenta tiene sus dos secretos antes de contactar con Instagram; sin
   `GH_PAT` o sin ese permiso, las cuentas en modo Environment fallan con un
   mensaje claro (las de modo actual no se ven afectadas).
1. Con el código de fase 2 desplegado y la cuenta todavía en modo actual,
   lanzar **Probar Instagram** con `cuenta` = `luiseskivelgolcher` y comprobar
   que sigue verificada ("credenciales · modo actual: secretos del repositorio
   IG_ACCESSTOKEN_LUISESKIVELGOLCHER / IG_USER_ID_LUISESKIVELGOLCHER").
2. En GitHub: Settings → Environments → New environment →
   `cuenta-luiseskivelgolcher`. En ese entorno, Add secret `IG_ACCESS_TOKEN`
   (el token de @luiseskivelgolcher, regenerado en Meta o copiado del gestor
   de contraseñas del operador) y Add secret `IG_USER_ID` (`17841401947366983`).
   El asistente no pega ni lee valores.
3. En el panel → Cuentas → Editar `Luis Esquivel Golcher` → Origen de las
   credenciales = Environment → Guardar. La tarjeta pasa a "Pendiente de
   verificación: el origen de las credenciales cambió" y muestra
   "Environment cuenta-luiseskivelgolcher (IG_ACCESS_TOKEN, IG_USER_ID)".
4. Pulsar **Verificar identidad** (o Actions → Probar Instagram con
   `cuenta` = `luiseskivelgolcher`). El job `probar-entorno` debe pasar
   "Comprobar que las credenciales vienen del Environment" y terminar en
   "identidad verificada"; `conexion.json` guarda `origen: "entorno"`.
5. Comprobar en el registro de PUBLICAR de esa cuenta (job "Publicar
   (Environment)") que solo aparecen `IG_ACCESS_TOKEN` e `IG_USER_ID` y la
   línea "credenciales · Environment cuenta-luiseskivelgolcher". Nada se
   publica: `automatico.publicar` sigue en `false`.
6. Tras al menos una renovación semanal correcta (RENOVAR TOKEN escribe el
   token nuevo en el Environment; requiere `GH_PAT` con Environments: Read and
   write), borrar los secretos de repositorio `IG_ACCESSTOKEN_LUISESKIVELGOLCHER`
   e `IG_USER_ID_LUISESKIVELGOLCHER`. Hasta entonces no se borra nada.

Marcha atrás en cualquier paso: en el panel, Origen de las credenciales =
Modo actual → Guardar; los secretos de repositorio siguen intactos hasta el
paso 6. La verificación anterior queda invalidada en ambos sentidos y hay que
verificar de nuevo.

Sin Línea se migra igual **después** de regenerar su token en Meta: el token
nuevo va al Environment `cuenta-sinlinea`. Un valor idéntico en el repositorio
y en el Environment es válido: la procedencia se comprueba por la API
(existencia de los dos secretos en el Environment exacto), no por el valor.

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

## 10. Ilustraciones con Gemini
Paso opcional: sin este secreto, los posts se publican igual, solo que sin
ilustración (con el fondo de color de la variante).

1. Entra en https://aistudio.google.com/apikey y crea una clave de API.
2. En el repo → **Settings → Secrets and variables → Actions → New repository
   secret**: nombre `GEMINI_API_KEY`, valor la clave.
3. Para comprobar que la clave, el modelo y el formato de respuesta funcionan sin
   gastar una corrida completa: GitHub → **Actions → Probar Gemini → Run
   workflow**. Al terminar, descarga el artefacto `prueba-gemini` de esa corrida
   para ver la imagen generada.
4. `config.json` → `ilustraciones.maxPorCorrida` (por defecto `4`) limita
   cuántas ilustraciones pide REGENERAR a Gemini en una misma corrida; los
   posts que se queden fuera esperan a la corrida de la siguiente hora (no se
   pierden, solo se posponen).
5. `ilustraciones.estilo` son las instrucciones fijas que se envían a Gemini con
   cada escena (lineamientos de imagen: fotoperiodismo realista, protagonista en el
   tercio superior derecho, zona del titular despejada, sin texto ni rostros reales).
   Edítalo en `cuentas/<id>/config.json` si cambian los lineamientos de esa cuenta;
   `ilustraciones.activo` puede fijarse por cuenta (apaga Gemini solo para ella) y, si
   no se indica, vale lo del `config.json` global.
6. `ilustraciones.activo` es el interruptor general: en `false` (o sin
   `GEMINI_API_KEY`), ningún post pide ilustración a Gemini y todos salen con
   el fondo de color de la variante, sin gastar cuota.
7. `npm run generar -- --dry-run` sí llama a Gemini y gasta cuota igual que una
   corrida normal (solo evita escribir en `posts/`, `data/<cuenta>/seen.json` y hacer
   commit); no lo uses para probar en bucle si la cuota es justa.

## 11. Métricas (fase 1): recogida diaria de solo lectura y vista en el panel

Qué es. Cada cuenta puede recoger a diario, en solo lectura, lo que la API de
Instagram devuelve sobre ella: totales del perfil (seguidores, seguidos,
publicaciones), métricas de cuenta por día (alcance, vistas, interacciones,
visitas al perfil…) y totales acumulados de cada publicación (me gusta,
comentarios, alcance, vistas, guardados, compartidos, métricas de reel). Se
guardan como instantáneas con la fecha exacta de consulta en
`data/<id>/metricas/` y se ven en el panel (botón **Métricas** del panel de la
cuenta). No usa Claude ni Gemini y nunca publica.

Interruptor. `metricas.recoger` en `cuentas/<id>/config.json` (casilla
"Recoger métricas a diario" en la ficha de la cuenta). Está **apagado por
defecto** y es **independiente** de `automatico.generar` y
`automatico.publicar`: se puede medir una cuenta con ambas apagadas. Límites
opcionales: `maxLlamadas` (150), `maxPaginas` (4 páginas de 50
publicaciones), `maxPublicaciones` (40 por corrida) y `ventanaDias` (90).

Permisos. Con `instagram_business_basic` (el permiso con el que ya se publica)
llegan el perfil y la lista de publicaciones con me gusta y comentarios. Las
estadísticas (alcance, vistas, guardados, compartidos…) requieren
`instagram_business_manage_insights`. Comprobado el 2026-09-09 con la sonda
real: el token de @luiseskivelgolcher ya lo tiene. Si un token no lo tiene, la
recogida sigue con lo básico y cada estadística aparece como "No disponible:
requiere permiso de estadísticas (instagram_business_manage_insights)".

Cómo probar sin guardar nada (sonda). Actions → **Verificar configuración y
secretos** → Run workflow → `sonda_metricas` = id de la cuenta. En el job de
esa cuenta aparece qué campos y métricas devuelve la API (nombres y valores;
nunca secretos). Las demás cuentas no contactan con Instagram.

Cómo funciona la recogida. El workflow **Métricas de Instagram** corre a las
00:30 de Panamá con un job por cuenta y las credenciales de su origen (igual
que PUBLICAR). Por corrida: 1 llamada al perfil, 3 a las métricas de cuenta
(los días D-3, D-2 y D-1, porque Instagram corrige los datos hasta 48 h) y
una por publicación de la ventana, dentro de `maxLlamadas`. Lo que no cabe
queda en `estado.json` como pendiente y se consulta al día siguiente
(primero las pendientes, luego las nunca consultadas, luego las de consulta
más antigua). Ante un error de límite de la API (códigos 4, 17, 32, 613,
80002) la corrida se detiene, guarda lo obtenido y continúa otro día. Solo se
hace `git add data/<cuenta>/metricas`; `posts/` no se toca.

Cómo se guardan los datos. `cuenta-AAAA-MM.json` (por mes de consulta) con
`consultas` (instantáneas del perfil con fecha de consulta, una por día) y
`porDia` (métricas por período bajo el día al que se refieren, con la fecha
en que se consultaron); `publicaciones-AAAA-MM.json` (por mes de publicación)
con los totales acumulados de cada publicación en cada consulta y su origen
(`sistema`, enlazada con el post y su categoría y franja, o `instagram`, si se
publicó a mano); `estado.json` (pendientes, métricas que la API rechaza por
tipo de publicación, última corrida). Un dato ausente es `null` con su motivo
y el panel lo muestra como "No disponible: …", nunca como 0. La diferencia
entre dos instantáneas es una **variación aproximada entre consultas**, no la
actividad exacta de un día, y así se etiqueta.

Coste. Sin coste monetario adicional mientras se mantenga dentro de las
cuotas: los minutos de Actions no se cobran en un repositorio público (unos 2
minutos por cuenta y día; en privado serían ~60 min/mes por cuenta, dentro de
los 2000 gratuitos) y la API de Instagram no cobra por llamada, pero limita
según las impresiones de las últimas 24 h (error 80002). Con `maxLlamadas`
150 y dos cuentas, el consumo diario queda muy por debajo de ese cupo salvo
en cuentas casi sin impresiones, donde la recogida se completa en varias
corridas.

## 12. Multicanal (F1): página de Facebook por cuenta

Cada cuenta editorial puede conectar, además de Instagram, **una página de Facebook**. La conexión es independiente: tiene su propio secreto, su propia verificación de identidad y su propio interruptor, que nace apagado. Instagram sigue mandando en `automatico.publicar`; Facebook en `conexiones.facebook.publicar`. Se puede publicar solo en Facebook con Instagram apagado. La **pausa general** (`automatico.pausa`) detiene todas las redes sin cambiar ningún interruptor.

Requisitos: la cuenta debe estar en modo Environment (`instagram.origen: "entorno"`); las redes nuevas no existen en modo repositorio. Las páginas se publican con la Graph API (`POST /{page-id}/photos` con `published=false` y luego `POST /{page-id}/feed` con la foto adjunta): la misma imagen JPEG que Instagram, texto propio por red.

### 12.1 Obtener el token de página (todo en herramientas de Meta y en GitHub; nada pasa por el panel)

1. Ten una página de Facebook y sé su administrador (Meta Business Suite → Páginas).
2. En Meta for Developers, en la app de tipo empresa de la cuenta: Casos de uso → «Facebook Login for Business» → configuración con tipo de token «Usuario» y permisos `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`.
3. Explorador de la API Graph (https://developers.facebook.com/tools/explorer/): elige la app, marca esos permisos y genera un token de usuario.
4. Depurador de tokens (https://developers.facebook.com/tools/debug/accesstoken/): pega el token y pulsa «Ampliar token de acceso» para obtener el de larga duración.
5. De vuelta en el Explorador, con el token ampliado, consulta `me/accounts`: cada página aparece con su `id` y su `access_token`. Ese token de página no caduca (Meta: solo se invalida si cambias la contraseña, pierdes el rol en la página, etc.).
6. GitHub → Settings → Environments → `cuenta-<id>` → Add environment secret → nombre `FB_PAGE_TOKEN`, valor el token de página. Aquí y en el panel solo se usa el nombre.

### 12.2 Declarar la página y verificar

- Panel → Cuentas → Editar → «Página de Facebook»: escribe el **id numérico** de la página y guarda (el interruptor queda apagado). En `cuentas/<id>/config.json` queda `"conexiones": { "facebook": { "publicar": false, "pagina": "<id>" } }`.
- Actions → **Probar destino** → Run workflow con `cuenta` y `red = facebook` (o el botón «Verificar Facebook» de la tarjeta, si el token del panel tiene permiso Actions). El job recibe solo `FB_PAGE_TOKEN` desde el Environment, llama a `GET /me` y guarda `data/<id>/conexion-facebook.json` (estado, id y nombre de la página, fecha; nunca valores).
- Con «Facebook: página «…» (id) verificada» en la tarjeta, pulsa **Encender Facebook**. Si la página del token no coincide con la declarada, el estado es error y no se puede encender.

### 12.3 Qué hace PUBLICAR con varias redes

- Al aprobar una pieza en el panel eliges sus destinos y revisas la versión de texto de cada red. Se publica exactamente ese texto; si luego editas el caption, el panel lo avisa y solo cambia lo aprobado cuando tú lo pides.
- La imagen aprobada queda vinculada a un archivo estable: al aprobar se guarda la huella (sha de blob git) del JPEG renderizado. Antes de enviar, el publicador descarga la imagen de la URL pública (la que van a leer las redes) y solo publica si su huella es la aprobada; si la imagen se regeneró o aún no se había aprobado, el destino queda en espera y el panel ofrece «Aprobar imagen actual».
- Cada destino se **reserva** antes de enviar: el publicador sincroniza con el remoto, relee el post y la configuración, escribe el intento y lo sube (commit + push). Sin reserva subida no hay envío. Los ids intermedios (foto de Facebook, contenedor de Instagram) también se suben antes de la llamada que publica.
- Un fallo en una red no bloquea a las demás. Un publicado nunca se repite. Apagar una red deja su entrega en espera (no la omite); omitir es una acción explícita.
- Un resultado incierto (corte tras enviar) se conserva hasta reconciliar con evidencia: en Facebook, una publicación del muro con la foto adjunta del intento; en Instagram, el estado del contenedor. Sin evidencia, el panel pide una decisión (marcar publicado con el enlace, volver a pendiente u omitir).
- Registros: `data/<id>/conexion-facebook.json` (conexión) y `destinos.facebook` dentro de cada `posts/<id>.json` (texto aprobado, estado, ids, enlace, intento).

### 12.4 Secretos y workflows

| Secreto | Dónde | Uso |
|---|---|---|
| `FB_PAGE_TOKEN` | Environment `cuenta-<id>` | PUBLICAR (job por cuenta) y Probar destino |

`publicar.yml` expone `FB_PAGE_TOKEN` solo en el job por Environment; el job de modo repositorio no conoce Facebook. Threads: §13. X queda para una fase posterior (diseño en `docs/superpowers/specs/2026-09-09-multicanal-design.md`).

**Estado de validación (2026-09-10):** la publicación en Facebook quedó validada con la API real el 2026-09-10 a las 09:17 UTC (primera pieza aprobada expresamente por el operador, corrida PUBLICAR 34459784427: reserva → foto sin publicar → publicación con la foto adjunta → enlace guardado, en cuatro commits del bot). La reconciliación de resultados inciertos sigue probada solo con simulaciones (no se ha producido ningún incierto real).

## 13. Multicanal (F2): perfil de Threads por cuenta

Cada cuenta puede conectar también **su perfil de Threads**. Misma base que Facebook (§12): secreto propio en el Environment de la cuenta, verificación de identidad propia e interruptor propio que nace apagado (`conexiones.threads.publicar`), independiente de Instagram y de Facebook. Se puede publicar solo en Threads. La pausa general (`automatico.pausa`) también lo detiene.

Requisitos: cuenta en modo Environment (`instagram.origen: "entorno"`). Threads se publica con la Threads API (`graph.threads.net/v1.0`): `POST /{id-de-perfil}/threads` con `media_type=IMAGE`, `image_url` y `text` crea un contenedor; se espera a que esté `FINISHED` (Meta recomienda unos 30 s; un contenedor vale 24 h) y `POST /{id-de-perfil}/threads_publish` lo publica. La misma imagen JPEG que Instagram (JPEG/PNG de hasta 8 MB, ancho 320–1440, relación de aspecto hasta 10:1) y un texto propio de **500 caracteres como máximo, con los emojis contados por sus bytes UTF-8** (la regla oficial). El id del perfil de Threads es numérico y **distinto del id de Instagram**.

### 13.1 Obtener el token (todo en la app de Meta y en GitHub; nada pasa por el panel)

1. Meta for Developers → la app de la cuenta → Casos de uso → Añadir caso de uso → **Access the Threads API** (permisos `threads_basic` y `threads_content_publish`). Meta crea un «Threads App ID» propio dentro de la app.
2. App roles → Roles → Add People → rol **Threads Tester**: invita al perfil de Threads de la cuenta. En Threads (Configuración → Cuenta → Permisos de sitios web / *Website permissions* → Invitaciones) acepta la invitación con la sesión de ese perfil.
3. Casos de uso → Access the Threads API → Customize → Settings → **User Token Generator**: junto al perfil aceptado pulsa *Generate Access Token*, confirma con la sesión de Threads y copia el token. El propio panel de Meta indica que son tokens de larga duración (60 días) y que solo se generan para perfiles de Threads públicos. Nota: en la web de Threads la invitación de probador solo muestra «Suprimir»; se acepta desde la app del teléfono (Configuración → Cuenta → Permisos de sitios web → Invitaciones).
4. GitHub → Settings → Environments → `cuenta-<id>` → Add environment secret → nombre `THREADS_ACCESS_TOKEN`, valor el token. Aquí y en el panel solo se usa el nombre.

Solo para tokens obtenidos por OAuth (no por el generador), que nacen de corta duración: la Threads API permite cambiarlos por uno de 60 días con `GET https://graph.threads.net/access_token?grant_type=th_exchange_token` y el *Threads App Secret* (App settings → Basic); el cliente `lib/threads.mjs` tiene `intercambiarToken` preparado, pero ese paso no está automatizado (exigiría otro secreto en el Environment). Con el token del generador basta con la renovación semanal.

### 13.2 Declarar el perfil y verificar

- Actions → **Probar destino** → Run workflow con `cuenta` y `red = threads` (o «Verificar Threads» en la tarjeta). El job recibe `THREADS_ACCESS_TOKEN` desde el Environment, llama a `GET /me?fields=id,username` y guarda `data/<id>/conexion-threads.json` (estado, id y @usuario, fecha; nunca valores). Si aún no está declarado el id del perfil, el resultado lo muestra para que lo guardes.
- Panel → Cuentas → Editar → «Perfil de Threads»: id numérico del perfil y, opcional, el nombre de usuario esperado. Queda `"conexiones": { "threads": { "publicar": false, "usuario": "<id>", "perfil": "<usuario>" } }`. Con el nombre de usuario declarado, la verificación (y cada corrida de PUBLICAR) exige que el token pertenezca a ese usuario además de al id.
- Con «Threads: perfil «@…» (id) verificado» en la tarjeta, pulsa **Encender Threads**. Facebook e Instagram no cambian.

### 13.3 Qué hace PUBLICAR en Threads

- Igual que en las demás redes: versión aprobada por destino (el contador del panel bloquea si excede 500 y nunca recorta), imagen vinculada a la huella del archivo servido, reserva subida al remoto antes de enviar. El id del contenedor y la fase «enviando» se suben antes de `threads_publish`.
- Recuperación tras una interrupción: en la siguiente corrida se consulta el estado del contenedor guardado. `PUBLISHED` con enlace → publicado (sin volver a publicar); `FINISHED` → se publica ese mismo contenedor; `ERROR`/`EXPIRED` → vuelve a pendiente y se crea otro; `PUBLISHED` sin enlace o estado desconocido → sigue incierto hasta la decisión en el panel. Nunca se decide por el texto.
- Cuota: `GET /{id}/threads_publishing_limit` (250 publicaciones por 24 h); agotada, la entrega de Threads espera sin afectar a las demás redes.
- Registros: `data/<id>/conexion-threads.json`, `data/<id>/token-info-threads.json` (vencimiento del token) y `destinos.threads` en cada `posts/<id>.json`.

### 13.4 Secretos y workflows

| Secreto | Dónde | Uso |
|---|---|---|
| `THREADS_ACCESS_TOKEN` | Environment `cuenta-<id>` | PUBLICAR (job por cuenta), Probar destino y Renovar token |

`publicar.yml` y `probar-destino.yml` reciben `THREADS_ACCESS_TOKEN` solo en el job por Environment. `renovar-token.yml` (cada lunes) refresca también el token de Threads de las cuentas con perfil declarado (`GET /refresh_access_token?grant_type=th_refresh_token`; el token debe tener al menos 24 h y no haber vencido: si acabas de guardarlo, la primera renovación avisa y la siguiente ya funciona) y lo guarda con `gh secret set THREADS_ACCESS_TOKEN --env cuenta-<id>`. Un fallo en Threads no afecta a la renovación de Instagram.

**Estado (2026-09-10):** la conexión real quedó verificada con la API de Threads (Probar destino 34480808061 desde la rama `multicanal-f2`: la credencial pertenece al perfil @luisegolcher, id 38207637362217152, que coincide con lo declarado; conexión apagada). La publicación en Threads quedó validada con la API real el 2026-09-10 a las 14:05 UTC (primera pieza aprobada expresamente por el operador, EFE Verifica 029a, solo Threads, corrida PUBLICAR 34486623046: reserva → contenedor → enviando → publicado en cuatro commits del bot; id 18114733286052177 y enlace guardados). La recuperación de contenedores y la reconciliación de inciertos siguen probadas solo con simulaciones (no se ha producido ningún incierto real).

## 14. Perfil editorial configurable (periodismo tecnológico de @luiseskivelgolcher)

Una cuenta puede declarar en `cuentas/<id>/config.json` un bloque `perfil` que cambia cómo GENERAR selecciona y redacta. Sin `perfil`, todo funciona como antes (Sin Línea no cambia). La voz y las reglas de atribución detalladas viven en `cuentas/<id>/editorial.md`, que es el system prompt de Claude; `perfil` lleva los datos que usa el código.

```json
"perfil": {
  "nombre": "periodismo-tecnologico",
  "temas": ["espionaje estatal y comercial", "Pegasus y otras herramientas de vigilancia", "…"],
  "idiomas": ["es", "en", "fr"],
  "referencias": ["WIRED: …", "AJ+: …", "HugoDécrypte: …"],
  "puntuacion": { "pesos": { "afinidad": 30, "interes": 25, "evidencia": 20, "actualidad": 15, "visual": 10 }, "minimo": 60 },
  "formatos": ["post", "carrusel", "reel"],
  "revision": { "alertas": ["fuente-unica", "acceso-parcial", "acusacion-sin-fuente", "hecho-antiguo", "evidencia-insuficiente"], "criterios": ["…"] }
}
```

- **Temas, voz y atribución.** `temas` guía la afinidad; la voz (directa, curiosa, crítica, rigurosa; términos explicados la primera vez; hecho/denuncia/hipótesis/opinión; nada de «descubrimos», «revelamos», «nadie te lo cuenta»…) y las reglas de atribución están en `editorial.md` y en las reglas fijas del perfil (`src/lib/redactor.mjs`).
- **Fuentes e idiomas.** Cada fuente admite `idioma` (xx o xx-XX), `prioridad` (1 = máxima) y `descargar` (por defecto, con perfil se descarga el artículo de cada ítem RSS para leer el texto completo; `false` para canales de vídeo). Por cada candidato se conservan medio, autor, URL y URL canónica, idioma, fechas de publicación y actualización, fecha de consulta, alcance real de acceso (`completo`, `parcial`, `fragmento` o `titular`), tamaño del texto recuperado y fuentes primarias enlazadas. No se eluden muros de pago: lo que no se pudo leer queda como fragmento y nunca es la base de una pieza.
- **Selección.** Los candidatos se agrupan por acontecimiento (URL canónica y títulos parecidos) para no duplicar; solo los grupos con texto completo o parcial llegan a Claude, que puntúa cada uno de 0 a 10 en afinidad, interés, evidencia y visual; la actualidad la calcula el sistema con la fecha de publicación. El total se pondera con `pesos` (deben sumar 100) y se descarta lo que no llega a `minimo`. Es una heurística editorial, no una predicción de alcance.
- **Producción.** Claude devuelve por pieza: formato, ángulo, atribución pública, fecha del hecho si es anterior a la publicación, afirmaciones con tipo y fuente, puntuación y alertas; y, según el formato, las diapositivas del carrusel o el guion del reel (narración, subtítulos, escenas, recursos). El validador añade alertas automáticas: fuente única, acceso parcial, denuncia sin fuente, hecho de más de 30 días, evidencia baja.
- **Formatos.** `post` se publica como siempre (imagen + texto por red). `carrusel` renderiza una imagen por diapositiva (`templates/carrusel.html` → `public/img/<id>-01.jpg`…) y `reel` guarda el guion. **Carrusel y reel no tienen adaptador de publicación**: el panel los muestra para revisión y no deja programarlos; el publicador tampoco los envía. Para publicar carruseles habría que añadir en `lib/instagram.mjs`/`threads.mjs`/`facebook.mjs` la creación de contenedores hijos y el contenedor `CAROUSEL` (o `attached_media` múltiple en Facebook); para reels, un flujo de vídeo que hoy no existe.
- **Diseño.** La imagen generada es solo fondo o ilustración (`ilustraciones.estilo` del perfil evita el hacker con capucha, el código verde y los candados; `ilustraciones.rotulo` marca «Ilustración generada con IA»); titulares, cifras, fuentes y marca los pone el renderizador. Prompt de imagen, datos editoriales, plantilla y texto de publicación viven separados (`ilustracion.descripcion`, campos del post, `templates/*.html`, `caption`/`destinos.<red>.texto`).
- **Frecuencia y coste.** Los mismos límites de siempre (`generar.maxPorCorrida`, `maxBorradoresPorDia`, `maxBorradoresPendientes`, `candidatosMax`, `maxHorasAntiguedad`). Para la primera corrida del perfil se dejaron 3 por corrida y 5 por día; después vuelven a 1 y 2.
- **Trazabilidad en cada `posts/<id>.json`:** `formato`, `fuentes[]` (principal y referencias, con todo lo anterior y `licenciaMedios` en null si no consta), `afirmaciones[]`, `angulo`, `atribucion`, `puntuacion`, `alertas[]`, `carrusel`/`reel`, `revision` (`pendiente` hasta que el operador la marque) e `ilustracion.procedencia`. Los campos desconocidos quedan vacíos o en null, nunca inventados. Los posts anteriores no tienen estos campos y siguen siendo válidos.

**Activar el perfil en otra cuenta:** añade el bloque `perfil` y las fuentes con idioma/prioridad, reescribe `editorial.md` con la voz y las reglas, y ajusta `ilustraciones.estilo`. Con `automatico.generar` encendido, la siguiente corrida de GENERAR usa el perfil. Para desactivarlo, borra el bloque `perfil`.

**Estado (2026-09-10):** implementado y probado con clientes simulados (agrupación y duplicados, artículo inaccesible sin resumen inventado, hecho antiguo con su fecha, denuncias atribuidas, render del carrusel real con Chromium, borradores sin publicar, fuentes conservadas hasta el post). Primeros borradores reales generados con la corrida de GENERAR indicada en el ROADMAP.
