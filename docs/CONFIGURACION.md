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
   repositories → sinlinea**, **Permissions → Repository → Secrets: Read and write**.
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
6. **Secretos.** Repo → Settings → Secrets and variables → Actions → New repository
   secret: `IG_ACCESSTOKEN_LUISESKIVELGOLCHER` (el token) e
   `IG_USER_ID_LUISESKIVELGOLCHER` (el id numérico). Los workflows ya exponen esos
   nombres. Hecho el 2026-09-08: ambos secretos creados por el operador.
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

Si una cuenta tiene la configuración rota o le falta un secreto, esa cuenta se
omite con un aviso en el registro y las demás siguen funcionando.

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
