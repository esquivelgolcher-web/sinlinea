# Hoja de ruta: de Sin Línea a un panel multi-cuenta para medios

Complementa [ARCHITECTURE.md](ARCHITECTURE.md). Cada hito es pequeño, deja el
sistema funcionando al terminar y se construye con pruebas primero. Ningún hito
reescribe componentes que ya funcionan.

Decisiones tomadas (2026-09-08): en los hitos M1 a M5 hay **un operador** (o un
equipo de confianza) que gestiona varias cuentas desde el mismo panel y el mismo
repositorio; que cada medio entre con su propio usuario es el hito M6 (futuro).
Las claves de Claude y Gemini se comparten entre cuentas. El idioma es
configurable por cuenta (`idioma`, `es-PA` por defecto).

## Estado y cómo retomar

- **M0 hecho** (commit local `9453f62`).
- **M1 desplegado en producción** (2026-09-08, push `854b623`, rebasado sobre
  los commits del bot): GENERAR con el código nuevo creó 2 borradores con id
  `…-sinlinea-…`, el panel nuevo quedó desplegado (selector oculto con una
  cuenta) y el workflow "Verificar configuración y secretos" dio todo OK salvo
  `GH_PAT` (opcional). Suites: 203 unitarias, 12 de render, 8 del panel. Para
  retomar en otra sesión: `git log --oneline -8` en `main`, leer esta sección y
  la de M2, y ejecutar `npm test`.
- **Pendiente del operador**: crear `GH_PAT`, activar `renovar-token.yml` y
  lanzarlo una vez (el token de Instagram vence el 2026-11-07).
- **M2 desplegado** (push `d59641e`, 2026-09-08): segunda cuenta
  `luiseskivelgolcher` (@luiseskivelgolcher, nombre visible "Luis Esquivel
  Golcher") con configuración propia, automatización apagada
  (`automatico.generar/publicar = false`), colores por cuenta en la plantilla,
  secretos por cuenta en los workflows, verificación de identidad contra la API
  antes de publicar y workflow manual "Probar Instagram" (identidad y caducidad
  real del token o "desconocida"). Línea editorial acordada en
  `cuentas/luiseskivelgolcher/editorial.md`. El panel muestra ambas cuentas.
  **Cuenta conectada y verificada el 2026-09-08**: Probar Instagram confirmó
  que la credencial es de @luiseskivelgolcher y que el id numérico coincide; la
  caducidad quedó registrada como desconocida en
  `data/luiseskivelgolcher/token-info.json`. Automatizaciones siguen apagadas.
  Pendiente del operador: definir fuentes y encender `automatico.publicar`
  cuando decida publicar. Logo definido el 2026-09-08 (ver abajo).
- **Incidente 2026-09-08**: el token de Instagram de Sin Línea quedó
  invalidado por Meta (cambio de contraseña o sesión revocada). Publicación
  automática de `sinlinea` **pausada** (`automatico.publicar = false`) con la
  cola conservada (6 programados). Dos intentos de guardar un token nuevo
  fallaron ("Cannot parse access token": el valor guardado no tiene forma de
  token). **Conexión aplazada al 2026-09-09**; hasta entonces no se hacen más
  intentos de autenticación. Al retomar: generar el token en Meta (API setup
  with Instagram login → sinlinea.pa → Generate token, copiar con el botón),
  pegarlo en el secreto `IG_ACCESS_TOKEN`, ejecutar "Probar Instagram" para
  `sinlinea`, decidir qué posts reprogramar y reactivar `automatico.publicar`.
- **Rótulo de IA retirado (2026-09-08)**: `ilustraciones.rotulo` pasa a ser
  opcional y queda vacío en ambas cuentas; plantilla v8 (los posts activos se
  vuelven a dibujar sin el rótulo). Reversible poniendo un texto en `rotulo`.
  Nota: Instagram puede añadir su propia etiqueta de IA por la marca de agua
  invisible de las imágenes de Gemini.
- **Vista previa editorial de la cuenta personal (2026-09-08)**: nuevo
  `npm run borrador -- --cuenta <id> --entrada <archivo.json>` (`src/borrador.mjs`)
  crea borradores manuales sin Claude ni credenciales de Instagram y los dibuja
  en local. **Cambio de alcance**: el ajedrez sale de `luiseskivelgolcher` (se
  desarrollará en una cuenta independiente, todavía no creada; no se implementan
  diagramas ni funciones de ajedrez). El borrador del mate del pastor quedó
  archivado sin borrar en `posts/archivo/2026-09/` (estado descartado; sus
  imágenes se conservan). La cuenta se centra en investigaciones y periodismo,
  transparencia y herramientas de investigación, y actualidad de Panamá y del
  mundo con contexto y análisis (línea editorial en
  `cuentas/luiseskivelgolcher/editorial.md`). Quedan dos borradores sin aprobar
  ni programar: registros públicos de Panamá y la noticia internacional del 8 de
  septiembre; sus escenas se rehicieron con la composición de la guía
  (protagonista en el tercio superior derecho, zona del titular despejada).
  Ilustraciones activas con estilo neutro provisional; generación y publicación
  siguen apagadas. Pendiente: revisar ambos en el panel, definir fuentes y la
  conexión de Instagram.
- **Ajustes al borrador "Cómo investigar una empresa en Panamá" (2026-09-08,
  noche)**: categoría nueva `INVESTIGACIÓN` en `CATEGORIAS` (estados.mjs;
  disponible para todas las cuentas y en el redactor), bajada nueva, rótulo
  "Ilustración generada con IA" restituido solo en la cuenta personal
  (`ilustraciones.rotulo`), y reencuadre manual de la ilustración existente sin
  llamar a Gemini (recorte 900x1125 alineado arriba/derecha y reescalado a
  1080x1350 con sharp: los documentos ganan tamaño y el titular no los tapa).
  El original queda en el historial de git. LEG sigue como marcador provisional
  hasta que el operador entregue su logo.
- **Ajuste del logo LEG (2026-09-08, noche)**: a petición del operador el
  cuadro pasa a negro (`oscuro` vuelve a `#161616`; `logo.png` regenerado con
  `npm run logo`) y el logo se dibuja más pequeño: nuevo campo opcional
  `marca.logoTamano` (120 px por defecto, 90 en esta cuenta), plantilla v10; el
  tamaño entra en el sello visual y REGENERAR redibuja los posts activos.
- **Borrador para revisión (2026-09-08, noche)**: el borrador de registros
  públicos pasó a titularse "Cómo investigar una empresa en Panamá", con caption
  revisado (método, advertencia de que un registro no prueba una irregularidad)
  y fuentes oficiales verificadas ese día (Registro Público, PanamaCompra y
  Gaceta Oficial responden). Sigue en estado borrador, sin aprobar ni programar;
  el ajedrez queda fuera de la cuenta.
- **Secreto del token de la cuenta personal (2026-09-08, noche)**: el operador
  guardó el token como `IG_ACCESSTOKEN_LUISESKIVELGOLCHER` (sin guion bajo entre
  ACCESS y TOKEN). En vez de pedir un tercer pegado, `instagram.tokenSecreto` y
  los cuatro workflows pasaron a ese nombre; el id numérico conserva
  `IG_USER_ID_LUISESKIVELGOLCHER`. Reversible creando el secreto con el nombre de
  la convención y deshaciendo el cambio.
- **Logo LEG de la cuenta personal (2026-09-08)**: a partir de la referencia del
  operador (cuadrado con las iniciales "LEG" en tipografía condensada, versión
  oscura marrón/crema y versión clara blanco/negro). Nuevo comando
  `npm run logo -- --cuenta <id>` (`src/logo.mjs`, dibuja las iniciales con la
  Anton de la plantilla y las centra por su tinta real) que generó
  `cuentas/luiseskivelgolcher/logo.png` (primero marrón `#3B2B1F`, desde esa misma noche negro `#161616`; letras `#E9E4DA`) y
  `logo-claro.png` (blanco, letras `#111111`; no lo usa la plantilla). Nuevo
  campo opcional `marca.logoForma` (`circulo` por defecto, `cuadrado` para esta
  cuenta) para que la plantilla no recorte el logo en círculo; plantilla v9 y el
  campo entra en el sello visual, así que REGENERAR redibuja los posts activos.
  El `oscuro` de la paleta pasó de `#161616` al marrón del logo para que el
  fondo tipográfico y el logo compartan color; el resto de la paleta sigue igual.
- **Panel maestro, fase 1 (2026-09-08, noche) — hecho en local, SIN push**:
  commits `4a5f0f1` (núcleo: `src/lib/cuenta.mjs`, `archivada`, `editorial`,
  `conexion.json`), `0989a3d` (persistencia con sha en local y GitHub),
  `45a4340` + `8cb52ae` (interfaz y pruebas) y el de documentación. Vista
  "Todas las cuentas" (tarjetas con identidad, estados de generación y
  publicación por separado, estado de conexión, contadores, nombres exactos de
  secretos), alta y edición desde el formulario, archivar/reactivar, "Verificar
  identidad" con el flujo existente. Suites: 260 unitarias, 18 de render + 1 de
  logo, 14 de panel (5 nuevas: vista, alta con validación, edición con
  conflicto, archivar/reactivar con las pausas intactas, verificación en móvil).
  Se añadieron `data/sinlinea/conexion.json` (error: code 190, token mal
  guardado) y `data/luiseskivelgolcher/conexion.json` (verificada) a partir de
  las corridas reales de ese día. **Pendiente para desplegar**: revisión del
  operador de la vista previa, push (dispara GENERAR: solo borradores; las
  pausas no cambian) y, en GitHub, dar al token del panel el permiso *Actions:
  lectura y escritura* si se quiere lanzar la verificación desde el panel.
  **Dependencia**: la verificación de una cuenta nueva falla con "falta el
  secreto" hasta la fase 2 (secretos por entorno), ver M3b.
- **Panel maestro, fase 1, segunda iteración (2026-09-09) — en local, SIN
  push**: commits `08b822b` (estados de conexión con fecha, invalidación por
  cambio de usuario o secretos, "Conexión pendiente de configuración"),
  `7b3f79f` (escritura atómica con la API de git y `/api/archivos`), `37c5e93`
  (alta y edición atómicas desde el panel, fecha de la última comprobación,
  nombres de secretos editables, reactivar deja todo apagado y conserva la cola
  sin publicarla) y el de documentación. Criterios cubiertos: alta atómica; el
  cambio de usuario o de secretos invalida la verificación; fecha de la última
  verificación siempre visible con aviso de que no garantiza nada; archivar
  apaga ambas automatizaciones y reactivar las mantiene apagadas; la cola se
  conserva y no se publica al reactivar; "sin verificar" en vez de afirmar
  credenciales pendientes; "Conexión pendiente de configuración" para cuentas
  cuyos secretos no llegan a los workflows. Suites: 270 unitarias, 18 de render
  + 1 de logo, 15 de panel.
- **Sin Línea sigue pausada** (`automatico.publicar = false`, 10 programados
  en cola) y **@luiseskivelgolcher con generación y publicación apagadas**
  (contenido: investigación y actualidad con contexto; sin ajedrez ni vida
  personal). Sin publicaciones ni nuevos intentos de autenticación de Sin Línea.

Estimaciones en días de trabajo de una persona con el flujo actual (pruebas,
revisión y despliegue incluidos).

---

## M0 · Preparación (0,5 día)

**Objetivo.** Dejar el terreno listo sin cambiar comportamiento.

**Alcance.**
- Este documento y ARCHITECTURE.md revisados y aprobados.
- Decidir el id de la cuenta actual (`sinlinea`) y la convención de nombres de
  secretos por cuenta (`IG_ACCESS_TOKEN_<ID>` / `IG_USER_ID_<ID>` en mayúsculas,
  con la cuenta actual apuntando a los nombres que ya existen).
- Crear el secreto `GH_PAT` pendiente y activar `renovar-token.yml` (deuda
  actual, independiente del multi-cuenta).

**Criterios de aceptación.** Documentos aprobados; renovación de token en
verde en una corrida manual.

**Pruebas.** Las actuales (157 unitarias, 12 de render, 6 de panel) en verde.

**Estado (2026-09-08).** Hecho: documentos aprobados; convención de secretos
por cuenta en `src/lib/secretos.mjs` y validada en `config.json`; filtro de
tokens en logs y posts; `renovar-token.yml` comprueba `GH_PAT` antes de pedir
un token; `npm run verificar` y el workflow manual "Verificar configuración y
secretos". Pendiente del operador: crear `GH_PAT`, activar `renovar-token.yml`
y lanzarlo una vez.

---

## M1 · Soporte multi-cuenta y selector de cuenta (2-3 días)

**Objetivo.** Que el sistema entienda "cuentas" y el panel permita elegir una,
manteniendo intacto el flujo actual de generación, aprobación y publicación.
Al terminar solo existe la cuenta `sinlinea` y se comporta igual que hoy.

**Alcance.**
1. Carpeta `cuentas/sinlinea/` con `config.json` (marca, fuentes, franjas,
   cupos de generación, `ilustraciones.estilo` y `rotulo`, `instagram:
   { tokenSecreto: "IG_ACCESS_TOKEN", usuarioIdSecreto: "IG_USER_ID" }`),
   `editorial.md` y `logo.png`. Los archivos actuales (`prompts/editorial.md`,
   `assets/logo.png`) se mueven, no se duplican.
2. `config.json` global conserva solo lo compartido y añade `cuentas:
   ["sinlinea"]`.
3. `lib/config.mjs`: `cargarConfig()` devuelve `{ global, cuentas }` y
   `configDeCuenta(global, cuenta)` produce un objeto con la forma actual
   (validado con las mismas reglas de hoy). Las funciones existentes de
   validación se reutilizan sobre el resultado.
4. `lib/posts.mjs`: campo opcional `cuenta` en `validarPost`; `leerPosts`
   completa `cuenta: "sinlinea"` en memoria cuando falta (sin reescribir
   archivos); `nuevoId` incluye la cuenta (`fecha-hora-cuenta-medio-hash`)
   solo para posts nuevos; `crearPost` recibe `cuenta`.
5. `data/<cuenta>/seen.json` y `data/<cuenta>/token-info.json` (los dos
   archivos actuales se mueven en el mismo commit).
6. Orquestadores: bucle `for (const cuenta of cuentas)` que llama al cuerpo
   actual con `configDeCuenta` y con el token/usuario leídos de las variables
   de entorno que nombra la cuenta. Un solo arranque de Chromium por corrida.
   Cupos y memoria de URLs por cuenta. PUBLICAR crea un cliente de Instagram
   por cuenta. RENOVAR TOKEN renueva el de cada cuenta.
7. `build.mjs` y `serve.mjs`: `panel/config.json` pasa a incluir `cuentas:
   [{ id, nombre, marca, franjas }]` y la zona horaria.
8. Panel: chips de cuenta arriba de las pestañas (ocultos si hay una sola
   cuenta), filtro de tarjetas por `cuenta`, selección recordada en
   `localStorage`, franjas y marca de la cuenta activa en el diálogo de
   aprobación. Los contadores de las pestañas cuentan solo la cuenta activa.
9. Workflows: sin cambios de lógica; el paso de `git add` incluye `data` y
   `cuentas` (ya incluye `data`). Los secretos existentes no cambian.
10. Documentación: `docs/CONFIGURACION.md` explica cómo añadir una cuenta;
    README y GUIA actualizados.

**Fuera de alcance.** Segunda cuenta real, plantilla por cuenta, colores,
métricas, permisos.

**Criterios de aceptación.**
- Con la única cuenta `sinlinea`, una corrida completa (GENERAR → panel →
  REGENERAR → PUBLICAR) produce los mismos archivos y estados que hoy, salvo
  el nuevo formato de id y el campo `cuenta` en los posts nuevos.
- Los 11 posts existentes se muestran y editan en el panel sin migración.
- Con dos cuentas configuradas en pruebas, cada una usa sus fuentes, su cupo
  diario, su memoria de URLs, su token y su línea editorial; los posts de una
  no aparecen en la pestaña de la otra.
- Falta de un secreto de una cuenta: esa cuenta se salta con un aviso en el
  registro y las demás siguen (ninguna cuenta bloquea a otra).
- El panel con una sola cuenta se ve igual que hoy (sin selector).

**Pruebas.**
- Unitarias nuevas: `config.test.mjs` (`configDeCuenta` reproduce la forma
  actual; error claro si falta `cuentas/<id>/config.json`); `posts.test.mjs`
  (`cuenta` opcional, `leerPosts` completa la cuenta por defecto, `nuevoId`
  con cuenta); `generar.test.mjs` (dos cuentas: candidatos, cupos y `seen`
  separados; una cuenta sin secreto no detiene la corrida);
  `publicar.test.mjs` (cliente y token por cuenta); `renovar-token.test.mjs`
  (renueva por cuenta); `build.test.mjs` y `serve.test.mjs` (`panel/config.json`
  con `cuentas`).
- Panel (e2e): con dos cuentas en `posts/`, el selector filtra las tarjetas y
  el diálogo de aprobación ofrece las franjas de la cuenta activa; con una sola
  cuenta no se muestra el selector.
- Render: sin cambios (12 en verde).
- Todas las suites actuales en verde antes y después.

**Riesgos.** Mover `prompts/editorial.md`, `assets/logo.png` y `data/*.json`
en el mismo commit que el código que los lee (hacerlo en un solo commit y
verificar con `npm run generar -- --dry-run` en local antes de publicar).

**Estado (2026-09-08): hecho.** Implementado tal como se describe, con estas
precisiones:
- `cargarConfig()` sigue existiendo y devuelve la configuración efectiva de la
  cuenta principal (compatibilidad para herramientas y pruebas de un solo flujo);
  los orquestadores usan `cargarConfiguracion()` → `{ global, cuentas, errores }`.
- La configuración efectiva añade `cuenta`, `cuentaPrincipal`, `nombre`,
  `idioma` y `rutas { carpeta, editorial, logo, datos }`.
- Los flujos exponen `generarCuentas`, `regenerarCuentas`, `publicarCuentas` y
  `renovarCuentas`; las dependencias que dependen de la cuenta se crean con
  fábricas (`ilustradorDe`, `acortarDe`, `redactarEscenaDe`, `igDe`).
- Segunda cuenta de prueba sin credenciales: `tests/fixtures/cuentas/prueba/`,
  usada por `tests/ayuda/cuentas.mjs` (`raizConCuentas`).
- Probado: una aprobación publica solo en la cuenta del post; un fallo (Claude,
  Gemini, secretos ausentes o configuración inválida) en una cuenta no bloquea a
  las demás; el panel con una sola cuenta no muestra selector.
- El workflow de renovación guarda un secreto por cada archivo
  `temp/nuevo-token-<SECRETO>.txt` (ya multi-cuenta).

**Pendientes que deja M1 (para M2).**
- Los workflows solo exponen `IG_ACCESS_TOKEN` e `IG_USER_ID`; una segunda
  cuenta real necesita sus nombres en el `env` de `publicar.yml`,
  `renovar-token.yml` y `verificar.yml`.
- Colores de las variantes por cuenta en la plantilla (hoy solo cambian logo,
  usuario y lema).
- `src/serve.mjs` previsualiza la plantilla con la cuenta principal.
- Los posts antiguos no reciben el campo `cuenta` (no hay migración): el panel
  en modo GitHub guarda el archivo tal cual y solo el servidor local lo
  completa en memoria. Siguen perteneciendo a la cuenta principal.
- Quedan textos solo en español bajo un `idioma` configurable: nombres de mes en
  la imagen (`lib/fechas.mjs`), "Fuente:" en el caption (`lib/caption.mjs`) y las
  categorías. Resolver cuando exista una cuenta en otro idioma.
- `archivar()` corre una vez por cuenta sobre todos los posts (idempotente;
  hacerlo una sola vez por corrida en M4).
- Posts con una cuenta no declarada quedan fuera de todos los flujos y del
  panel: `npm run verificar` los avisa.

---

## M2 · Segunda cuenta real de extremo a extremo (2 días)

**Objetivo.** Dar de alta un segundo medio y publicar su primer post.

**Alcance.**
- Marca por cuenta en la imagen: colores de las tres variantes, logo, lema y
  usuario como variables de la plantilla (la plantilla ya recibe `logoUrl`,
  `usuario` y `lema` como datos; faltan los colores como variables CSS).
- Nombres de secretos por cuenta en los workflows (`IG_ACCESS_TOKEN_<ID>`).
- Guía paso a paso para el alta: app de Meta, cuenta probadora, token,
  secretos, carpeta `cuentas/<id>/`.
- Renovación del token por cuenta con `GH_PAT`.

**Criterios de aceptación.** Un post de la segunda cuenta publicado desde el
panel con su marca; la cuenta `sinlinea` sin cambios visibles; un fallo de
token en una cuenta no afecta a la otra.

**Estado (2026-09-08).** Hecho en código y probado sin publicar: colores por
cuenta (`marca.colores`, variables CSS; iniciales cuando no hay logo;
`imagen.estilo` para re-dibujar si cambia la paleta), `automatico` por cuenta,
secretos de la cuenta nueva en `publicar.yml`, `renovar-token.yml`,
`verificar.yml` y `probar-instagram.yml`, comprobación de identidad (`/me`:
usuario e id numérico) en PUBLICAR y en el workflow manual "Probar Instagram",
nota en el panel cuando la automatización está apagada. Falta lo que solo el
operador puede hacer: cuenta profesional, probadora en la app de Meta, token,
`user_id`, secretos, prueba de identidad, y definir editorial/fuentes/logo/
colores antes de encender `automatico`. Los posts de esta cuenta, mientras
esté apagada, se crean solo a mano (no hay generación) y no se publican.

**Pruebas.** `render.integration.mjs` con dos marcas (colores y logo
distintos en el JPEG); `workflows.test.mjs` verifica que los secretos por
cuenta se exponen; e2e del panel con dos cuentas reales en fixtures.

---

## M3 · Configuración editorial completa por cuenta (2 días)

**Objetivo.** Que cada medio tenga su propio comportamiento sin tocar código.

**Alcance.**
- Por cuenta: fuentes (RSS y portadas propias), categorías permitidas,
  franjas, cupos, estilo y rótulo de ilustración, idioma/zona horaria,
  hashtags fijos, menciones, texto alternativo de la imagen.
- Registro por cuenta en cada corrida: tokens de Claude, llamadas a Gemini,
  posts creados y publicados, para estimar el costo por medio.
- Validación de la configuración de cada cuenta con mensajes claros.

**Criterios de aceptación.** Cambiar una fuente o una franja de una cuenta no
afecta a las demás; el registro de la corrida muestra el costo estimado por
cuenta.

**Pruebas.** `config.test.mjs` (validación por cuenta); `fuentes.test.mjs`
(fuentes por cuenta); `generar.test.mjs` (resumen de costo por cuenta);
`redactor.test.mjs` (categorías y hashtags por cuenta).

---

## M3b · Panel maestro (fase 1 hecha; fases 2-5 pendientes)

**Objetivo.** Administrar y añadir cuentas desde la interfaz, y sentar la base
de las métricas por cuenta, sin backend ni servicios de pago mientras el
repositorio y GitHub Actions basten.

**Fase 1 (hecha, 2026-09-08).** Vista "Todas las cuentas", alta, edición,
archivo y verificación de identidad desde el panel; estado de conexión en
`data/<id>/conexion.json`; persistencia con bloqueo por sha y conservación de
lo escrito ante errores. Detalle en ARCHITECTURE.md 2.3b.

**Fase 2 · Secretos por cuenta sin tocar workflows (1-2 días). Siguiente.**

*Objetivo.* Que dar de alta una cuenta desde el panel baste para verificarla y
publicar, sin editar código ni workflows por cada cuenta, y que cada job reciba
únicamente las credenciales de su cuenta.

*Diseño.*
1. **Un entorno de GitHub por cuenta**: `cuenta-<id>` (p. ej. `cuenta-sinlinea`,
   `cuenta-luiseskivelgolcher`) con dos secretos de entorno de nombre fijo,
   `IG_ACCESS_TOKEN` e `IG_USER_ID`. El nombre del entorno se deriva del id, así
   que la configuración de la cuenta ya no necesita `instagram.tokenSecreto` ni
   `usuarioIdSecreto` (se conservan como opcionales para compatibilidad y para
   el modo de transición).
2. **Un job por cuenta** en PUBLICAR, RENOVAR TOKEN, Probar Instagram y
   Verificar: un job previo `cuentas` lee `config.json` y emite la matriz
   (`cuentas` activas no archivadas, o la del input `cuenta`); el job de trabajo
   lleva `strategy.matrix.cuenta`, `max-parallel: 1` (los commits del bot
   siguen siendo secuenciales) y `environment: cuenta-${{ matrix.cuenta }}`, y
   expone solo `IG_ACCESS_TOKEN` e `IG_USER_ID` de ese entorno. Los
   orquestadores aceptan `--cuenta <id>` para procesar una sola cuenta con los
   nombres fijos; el resumen y las anotaciones `::error::` no cambian.
   GENERAR y REGENERAR no llevan secretos de Instagram y siguen como están
   (claves de Claude y Gemini compartidas, secretos de repositorio).
3. **Estado de conexión**: `secretosExpuestos` deja de leer el `env` y pasa a
   comprobar, con la API de GitHub, que el entorno `cuenta-<id>` existe y tiene
   los dos secretos (`GET /repos/{o}/{r}/environments/{nombre}/secrets`, solo
   nombres); el panel muestra el nombre del entorno y los pasos para crearlo.
   "Conexión pendiente de configuración" pasa a significar "falta el entorno o
   alguno de sus dos secretos".
4. **Documentación**: `docs/CONFIGURACION.md` §6b/§6c pasan de "secretos de
   repositorio con sufijo" a "entorno por cuenta con dos secretos".

*Migración de las dos cuentas existentes (sin perder las pausas).*
1. Crear en GitHub los entornos `cuenta-sinlinea` y `cuenta-luiseskivelgolcher`
   y copiar en cada uno el token y el id numérico como `IG_ACCESS_TOKEN` e
   `IG_USER_ID` (los pega el operador; el panel y el asistente solo indican
   nombres). Para Sin Línea, el token nuevo cuando se regenere en Meta; hasta
   entonces su entorno queda sin token y la cuenta sigue pausada.
2. Desplegar los workflows por cuenta con un **modo de transición**: si el
   entorno no tiene `IG_ACCESS_TOKEN`, el job usa el secreto de repositorio con
   el nombre declarado en la configuración de la cuenta (`IG_ACCESS_TOKEN`,
   `IG_ACCESSTOKEN_LUISESKIVELGOLCHER`…). Así nada deja de funcionar durante el
   cambio.
3. Ejecutar Probar Instagram para cada cuenta desde el panel y comprobar que
   `conexion.json` queda como verificada con los secretos del entorno.
4. Borrar los secretos de repositorio con sufijo y, después, el modo de
   transición. `automatico.generar/publicar` no se tocan en ningún paso: Sin
   Línea sigue con la publicación pausada y su cola intacta, y
   @luiseskivelgolcher con todo apagado, hasta que el operador los encienda.
5. Marcha atrás: volver a los workflows anteriores es un `git revert`; los
   secretos de repositorio siguen existiendo hasta el paso 4.

*Criterio de aceptación.* Dar de alta una cuenta desde el panel, crear su
entorno con los dos secretos en GitHub y verificar su identidad desde el panel
sin tocar código ni workflows; una cuenta sin entorno aparece como "Conexión
pendiente de configuración"; los jobs de una cuenta no ven las credenciales de
otra (comprobable en los logs: solo dos nombres de secretos por job).

*Pruebas.* Unitarias de la matriz (`cuentas` activas, `--cuenta`), del modo de
transición y del nuevo `secretosExpuestos`; e2e del panel con el entorno
simulado; despliegue controlado con Sin Línea pausada.

**Fase 3 · Recogida y almacenamiento de métricas (2 días).** Un workflow diario
consulta la API de Instagram (insights de cuenta y de cada publicación propia:
alcance, impresiones, me gusta, comentarios, guardados, seguidores) y guarda
series por cuenta y por publicación en `data/<id>/metricas/AAAA-MM.json`
(append, sin tokens). Sin panel todavía; solo datos verificables.

**Fase 4 · Dashboard comparativo e informes semanales (2-3 días).** Vista de
métricas en el panel (por cuenta y comparativa: alcance, crecimiento, mejores
categorías y franjas), e informe semanal en `data/<id>/informes/` redactado
por Claude a partir de los datos guardados, con enlace desde la tarjeta de la
cuenta. Nada se muestra si no hay datos reales.

**Fase 5 · Experimentos y recomendaciones (2-3 días).** Propuestas basadas en
métricas (cambiar una franja, probar una categoría, ajustar el tono) que se
presentan como experimentos con hipótesis, duración y métrica objetivo; se
aplican solo con aprobación en el panel y quedan registrados con su
configuración anterior para revertirlos con un clic.

**Pruebas.** Fase 1: `cuenta.test.mjs`, `maestro.test.mjs`,
`serve-cuentas.test.mjs`, `almacen.test.mjs`, `panel-maestro.e2e.mjs`. Fases
siguientes: por fase, con datos simulados y sin llamadas reales a Instagram.

---

## M4 · Operación a escala (2-3 días)

**Objetivo.** Que el sistema aguante varias cuentas durante meses sin
intervención.

**Alcance.**
- Panel: la vista "Todas las cuentas" (hecha en M3b fase 1) suma fecha del
  último post por cuenta, avisos de token por vencer y de errores de corrida.
- Límite de tiempo por corrida y reparto justo entre cuentas (una cuenta con
  muchas noticias no deja sin turno a otra).
- Limpieza: borrar imágenes finales de posts archivados hace más de N días y
  documentar cómo compactar el historial del repositorio.
- Alertas (correo o Telegram) cuando una corrida falla o un token vence.

**Criterios de aceptación.** Con 4 cuentas simuladas, cada corrida termina en
menos de 10 minutos y el repositorio no crece más de un tamaño acordado por
mes; una corrida fallida produce un aviso.

**Pruebas.** `regenerar.test.mjs` y `generar.test.mjs` con reparto entre
cuentas; `posts.test.mjs` (limpieza de imágenes archivadas); e2e de la vista
global del panel.

---

## M5 · Crecimiento por cuenta (según prioridad, 2-4 días cada uno)

Funciones que aumentan alcance y se activan por cuenta, en el orden que decida
el operador:
- Respuestas y moderación de comentarios y mensajes con Claude y aprobación en
  el panel (solo en publicaciones propias: la API no permite actuar en cuentas
  ajenas).
- Carruseles diarios y Reels con el titular animado.
- Aprobación por Telegram y modo "Última hora".
- Métricas de alcance por post y por categoría; ajuste automático de franjas.
- Publicación cruzada en Threads y Facebook.

Cada una lleva su propio diseño corto, criterios de aceptación y pruebas antes
de construirse.

---

## M6 · Multi-inquilino: cada medio con su usuario (5-8 días)

**Objetivo.** Que un medio entre al panel con su propia cuenta de usuario y
solo vea y edite lo suyo.

**Alcance.**
- Servicio propio (Node) que ejecuta los mismos orquestadores con un
  programador de tareas, guarda posts e imágenes fuera del repositorio y
  sirve el panel con inicio de sesión y roles (administrador, editor, lector)
  por cuenta.
- Tercer almacén en el panel (`crearAlmacenServidor`) con la misma interfaz
  que los dos actuales.
- Secretos por cuenta en el servidor (no en GitHub).
- Migración de datos desde el repositorio.

**Criterios de aceptación.** Un editor de la cuenta B no puede leer ni
escribir posts de la cuenta A; los flujos de generación, aprobación y
publicación funcionan igual que en GitHub; el panel actual sigue funcionando
como alternativa mientras dure la migración.

**Pruebas.** Pruebas de autorización por rol y cuenta; las suites actuales
corriendo contra el nuevo almacén; e2e de inicio de sesión.

---

## Decisiones pendientes (para tomar en M0)

1. ¿Operador único con varias cuentas (M1-M5 bastan) o cada medio con su
   usuario desde el principio (M6 sube de prioridad y cambia el hosting)?
2. ¿Las cuentas comparten las claves de Claude y Gemini (más simple, costo
   estimado por registro) o cada una tiene las suyas (costo exacto, más
   secretos)?
3. Nombre del id de la cuenta actual: `sinlinea` (propuesto).
4. ¿Idioma único (español de Panamá) o el redactor debe admitir otros países
   e idiomas por cuenta (afecta a `editorial.md`, categorías y zona horaria)?
