# Fase 2 del panel maestro: credenciales aisladas por cuenta con GitHub Environments

Fecha: 2026-09-09. Estado: **código implementado en local (sin push); no se
ha migrado ninguna credencial**. Diferencias respecto al plan, decididas al
implementar: el origen es explícito por cuenta (`instagram.origen`, sin
detección automática); no hay modo de transición con fallback (cada cuenta usa
solo su origen y falla claro si le faltan secretos); el job `cuentas` comprueba
por la API de GitHub (solo metadatos, con `GH_PAT`) que el Environment exacto
tiene sus dos secretos y el job de la cuenta falla antes de Instagram si no,
porque GitHub aplicaría el secreto de repositorio del mismo nombre; permisos
comprobados en la documentación oficial: secretos de Environment → permiso
*Environments* (read/write), secretos de repositorio → *Secrets*. Complementa ARCHITECTURE.md (2.3b y 2.7) y ROADMAP.md
(M3b).

## 1. Objetivo

Que dar de alta una cuenta desde el panel baste para verificar su identidad y,
cuando el operador lo decida, publicar, **sin editar código ni workflows por
cada cuenta**, y que cada job de GitHub Actions reciba **únicamente** las
credenciales de la cuenta que procesa.

Hoy (fase 1) los workflows exponen cada secreto de Instagram con su nombre
escrito en el `env` (`IG_ACCESS_TOKEN`, `IG_ACCESSTOKEN_LUISESKIVELGOLCHER`…).
Una cuenta nueva aparece en el panel como "Conexión pendiente de configuración"
hasta que alguien edite cuatro workflows. Eso es lo que esta fase elimina.

## 2. Diseño

### 2.1 Un entorno por cuenta

- Por cada cuenta `<id>` existe un **entorno** de GitHub llamado `cuenta-<id>`
  (`cuenta-sinlinea`, `cuenta-luiseskivelgolcher`, `cuenta-nuevo-medio`…).
- Cada entorno tiene exactamente dos **secretos de entorno** con nombre fijo:
  `IG_ACCESS_TOKEN` (token de acceso) e `IG_USER_ID` (id numérico).
- El nombre del entorno se deriva del id de la cuenta; la configuración de la
  cuenta deja de necesitar `instagram.tokenSecreto` y `usuarioIdSecreto`. Se
  conservan como opcionales solo para el **modo de transición** (2.4).
- Las claves compartidas (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GH_PAT`)
  siguen siendo secretos de repositorio.

### 2.2 Origen explícito por cuenta

`cuentas/<id>/config.json` → `instagram.origen`:

- `repositorio` (**modo actual**, valor por defecto): secretos de repositorio con
  el nombre que declara la cuenta (`tokenSecreto` / `usuarioIdSecreto`, o
  `IG_ACCESS_TOKEN` / `IG_USER_ID` si no declara ninguno).
- `entorno` (**Environment**): secretos `IG_ACCESS_TOKEN` e `IG_USER_ID` del
  Environment `cuenta-<id>`.

No hay fallback entre orígenes ni detección automática: cada cuenta usa solo
su origen y, si le faltan secretos, su job falla nombrando el entorno o el
secreto. `lib/secretos.mjs` lo hace explícito (`origenDeSecretos`,
`nombreEntorno`, `describirCredenciales`) y el modo se anota en cada registro,
en el resumen de la corrida y en `data/<id>/conexion.json` (`secretos.origen`).

### 2.3 Un job por cuenta en los workflows de Instagram (implementado)

PUBLICAR, RENOVAR TOKEN, Probar Instagram y Verificar tienen la misma forma;
GENERAR y REGENERAR no usan credenciales de Instagram y no cambian.

```yaml
jobs:
  cuentas:                          # lee config.json; sin nombres de cuenta en el YAML
    outputs:
      entorno: ${{ steps.lista.outputs.entorno }}          # [{cuenta, entorno}]
      repositorio: ${{ steps.lista.outputs.repositorio }}  # [{cuenta, tokenSecreto, usuarioIdSecreto}]
    steps:
      - env: { GH_TOKEN: ${{ secrets.GH_PAT }} }           # solo aquí; comprueba los Environments por la API (metadatos)
        run: node src/cuentas-activas.mjs --comprobar-entornos >> "$GITHUB_OUTPUT"
  publicar-entorno:
    needs: cuentas
    if: ${{ needs.cuentas.outputs.entorno != '[]' }}
    strategy: { fail-fast: false, max-parallel: 1, matrix: { include: ${{ fromJSON(needs.cuentas.outputs.entorno) }} } }
    environment: ${{ matrix.entorno }}
    env:
      IG_ACCESS_TOKEN: ${{ secrets.IG_ACCESS_TOKEN }}     # del Environment de la cuenta
      IG_USER_ID: ${{ secrets.IG_USER_ID }}
    steps:
      - run: '[ "$COMPLETO" = true ] || exit 1'            # matrix.completo: el Environment tiene ambos secretos
      - run: node src/publicar.mjs --cuenta "$CUENTA" --por-cuenta
  publicar-repositorio:
    needs: [cuentas, publicar-entorno]
    if: ${{ always() && needs.cuentas.result == 'success' && needs.cuentas.outputs.repositorio != '[]' }}
    strategy: { fail-fast: false, max-parallel: 1, matrix: { include: ${{ fromJSON(needs.cuentas.outputs.repositorio) }} } }
    env:
      IG_ACCESS_TOKEN: ${{ secrets[matrix.tokenSecreto] }}   # solo el secreto declarado por esta cuenta
      IG_USER_ID: ${{ secrets[matrix.usuarioIdSecreto] }}
    steps:
      - run: node src/publicar.mjs --cuenta "$CUENTA" --por-cuenta
```

- Cada job expone **solo** dos credenciales, con los nombres fijos, y el
  orquestador las lee con `--por-cuenta`. En los logs de un job aparecen como
  mucho dos nombres de secretos.
- `fail-fast: false`: un fallo de una cuenta no cancela a las demás.
  `max-parallel: 1` y el job de modo actual espera al de entorno
  (`always()`): los commits del bot se hacen de uno en uno y el bucle
  `pull --rebase` sigue como red de seguridad. Un post solo lo procesa el job
  de su cuenta, así que no hay publicaciones duplicadas entre jobs.
- **Guardia contra el fallback de GitHub**: cuando un job con `environment:`
  pide `secrets.IG_ACCESS_TOKEN` y el entorno no lo define, GitHub aplica el
  secreto de repositorio con ese nombre. Por eso el job `cuentas` consulta la
  API (`GET /repos/{o}/{r}/environments/cuenta-<id>/secrets/<nombre>`, solo
  metadatos, con `GH_PAT`) y anota en la matriz si el Environment exacto tiene
  `IG_ACCESS_TOKEN` e `IG_USER_ID`; el job de la cuenta falla antes de tocar
  Instagram si falta alguno o si no hubo permiso para comprobarlo (mensaje con
  el nombre del entorno, del secreto y del permiso). No se comparan valores ni
  huellas: un token idéntico en el repositorio y en el Environment es válido.
  `GH_PAT` solo entra en el job `cuentas`; el job de cada cuenta recibe
  únicamente sus dos secretos.
- Sin `--por-cuenta` (ejecución conjunta en local o `npm run publicar`), las
  cuentas en modo Environment se omiten con motivo explícito
  (`entorno-requiere-job-por-cuenta`) y su cola se conserva; las de modo actual
  funcionan como siempre.
- La verificación de identidad (usuario e id numérico) no cambia y PUBLICAR la
  repite antes de publicar. Cuando el entorno tiene token pero no `IG_USER_ID`,
  GitHub aplicaría el id de repositorio: la comparación del id numérico lo
  detecta y no se publica.

### 2.4 Panel (implementado)

- Selector "Origen de las credenciales" en el formulario de alta y edición. En
  modo Environment se ocultan los nombres propios y la nota explica el entorno
  `cuenta-<id>`, sus dos secretos y que no hay fallback.
- La tarjeta muestra "Credenciales de Instagram: modo actual: secretos del
  repositorio A / B" o "Environment cuenta-<id> (IG_ACCESS_TOKEN, IG_USER_ID)".
- `estadoConexion` en modo Environment: si la API dice que faltan el entorno o
  alguno de sus secretos → "Conexión pendiente de configuración" con la
  instrucción exacta; si no se puede consultar (token del panel sin permiso
  *Environments: lectura*) lo dice en vez de afirmar nada. Cambiar el origen
  invalida la verificación anterior en la misma escritura atómica.
- No se implementaron interruptores de automatización en el panel:
  `automatico` se sigue habilitando expresamente en `config.json` (queda como
  mejora posterior).

## 3. Quién hace qué

| Paso | Desde el panel | En GitHub (operador) | Permisos necesarios |
|---|---|---|---|
| Crear la cuenta (editorial, fuentes, logo, horarios) y elegir su origen de credenciales | Sí: "Añadir cuenta" (escritura atómica) | — | Token del panel: Contents lectura/escritura |
| Crear el entorno `cuenta-<id>` | No (el panel muestra el nombre y el enlace) | Settings → Environments → New environment | Ser administrador del repositorio |
| Guardar `IG_ACCESS_TOKEN` e `IG_USER_ID` en el entorno | No: el panel nunca toca valores | Environment → Add secret (pegar el token y el id) | Administrador del repositorio |
| Ver si el entorno y sus secretos existen, y cuándo se actualizaron | Sí (nombres y fechas, nunca valores) | — | Token del panel: Environments lectura (modo Environment) y Secrets lectura (modo actual) |
| Verificar identidad | Sí: lanza Probar Instagram para esa cuenta | O a mano: Actions → Probar Instagram → Run workflow | Token del panel: Actions lectura/escritura |
| Encender generación o publicación | Todavía no desde el panel: `automatico` en `cuentas/<id>/config.json` (mejora posterior: interruptores con confirmación que exijan identidad verificada) | — | Contents lectura/escritura (commit) |
| Renovar el token de Instagram cada lunes | Automático (RENOVAR TOKEN escribe el secreto donde vive: Environment o repositorio) | Crear `GH_PAT` una vez | `GH_PAT`: Environments lectura/escritura (secretos de Environment) y Secrets lectura/escritura (secretos de repositorio), según la documentación oficial |
| Archivar / reactivar | Sí | — | Contents lectura/escritura |

Regla que no cambia: **ningún valor de secreto pasa por el panel, por el chat
ni por archivos del repositorio**. El panel y el asistente solo manejan
nombres, fechas y estados.

## 4. Migración de las dos cuentas existentes

Los pasos exactos, con marcha atrás, están en docs/CONFIGURACION.md §6d.
Resumen: (1) desplegar el código con ambas cuentas en modo actual y comprobar
con Probar Instagram que nada cambió; (2) crear `cuenta-luiseskivelgolcher`
con `IG_ACCESS_TOKEN` e `IG_USER_ID` (los pega el operador); (3) en el panel,
Editar → Origen = Environment → Guardar (la verificación anterior queda
invalidada); (4) Verificar identidad: el job `probar-entorno` debe pasar la
comprobación de origen y verificar usuario e id; (5) comprobar en el registro
de PUBLICAR que el job de la cuenta solo ve dos secretos (sin publicar:
`automatico.publicar` sigue en `false`); (6) tras una renovación semanal
correcta, borrar los secretos de repositorio con sufijo. Sin Línea se migra
después, con un token **nuevo** directo al Environment `cuenta-sinlinea`.
`automatico` no se toca en ningún paso y las colas se conservan.

## 5. Recuperación ante fallos

| Fallo | Cómo se ve | Qué hacer |
|---|---|---|
| El entorno no existe o está mal escrito | GitHub crea un entorno vacío al referenciarlo; el job corre sin secretos; Probar Instagram escribe "credenciales pendientes: falta IG_ACCESS_TOKEN" y el panel lo muestra con el nombre del entorno esperado | Crear el entorno con el nombre exacto `cuenta-<id>` y sus dos secretos; borrar el vacío si sobra |
| Token pegado incompleto o con espacios | Error de conexión con `code 190` y fecha; el panel muestra el mensaje de la API | Regenerar el token en Meta, copiar con el botón de copiar, actualizar el secreto; el panel pasará a "secreto actualizado después de la comprobación: verificar de nuevo" |
| Secreto correcto pero en el entorno equivocado | La verificación de la cuenta A dice que la credencial pertenece a @B | Mover el secreto al entorno correcto; la identidad se compara siempre por usuario e id numérico, así que nunca se publica en la cuenta equivocada |
| Fallo a mitad de la migración (paso 2 o 3) | El respaldo sigue activo: los jobs usan los secretos de repositorio como hoy | No hay nada que deshacer; repetir el paso |
| Workflows nuevos rotos (sintaxis, matriz vacía) | El workflow falla en el job `cuentas` o no arranca; el resumen de Actions lo muestra | `git revert` de los commits de la fase 2 (los secretos de repositorio siguen intactos hasta el paso 6); pruebas unitarias de la matriz antes de desplegar |
| Renovación semanal no puede escribir en el entorno | RENOVAR TOKEN falla con "GH_PAT sin permiso" y no toca el token vigente | Dar a `GH_PAT` Secrets lectura/escritura y Environments lectura; lanzar el workflow a mano |
| Dos cuentas publicando a la vez pisan el push del bot | No ocurre: `max-parallel: 1`; si un push falla, el bucle `pull --rebase` reintenta tres veces | Nada |
| Se borra un secreto de entorno por error | Probar Instagram lo detecta en la siguiente verificación; el panel muestra "no existe en GitHub" | Volver a pegarlo; verificar |

En todos los casos `automatico` no se modifica automáticamente: una cuenta
solo pasa a publicar cuando el operador la enciende con la identidad
verificada.

## 6. Criterios de aceptación

1. Dar de alta una cuenta desde el panel, crear su entorno con dos secretos en
   GitHub y verificar su identidad desde el panel, sin tocar código ni
   workflows.
2. Una cuenta sin entorno (o con un secreto de menos) aparece como "Conexión
   pendiente de configuración" con el nombre exacto de lo que falta.
3. En los logs de un job de PUBLICAR solo aparecen dos nombres de secretos, los
   de su cuenta.
4. Las dos cuentas actuales pasan al nuevo mecanismo sin cambiar `automatico`
   ni perder programados; `verificar` en verde antes y después.
5. Encender la publicación desde el panel exige identidad verificada y queda
   registrado en un commit.

## 7. Pruebas

- Unitarias: `cuentas-activas.mjs` (lista, `--cuenta`, cuentas archivadas
  fuera, `matrix.include` con nombres de respaldo), orquestadores con
  `--cuenta` y nombres fijos, modo de transición (entorno vacío → respaldo;
  ambos vacíos → error claro), `estadoConexion` con el entorno simulado
  (falta entorno, falta un secreto, secreto actualizado después).
- e2e del panel: alta → tarjeta "pendiente de configuración" con el nombre del
  entorno; interruptores con confirmación y bloqueo de publicar sin identidad
  verificada.
- Despliegue controlado: paso 1 de la migración con Probar Instagram para
  `luiseskivelgolcher`; nada más hasta que el operador cree los entornos.

## 8. Estimación y orden de commits

1. `cuentas-activas.mjs` + `--cuenta` en orquestadores + pruebas (0,5 día).
2. Workflows por cuenta con modo de transición + pruebas de la matriz (0,5 día).
3. Panel: estado por entorno, interruptores de automatización, formulario (0,5 día).
4. Documentación (CONFIGURACION §6b/§6c, ARCHITECTURE, ROADMAP) y despliegue
   del paso 1 de la migración (0,25 día).

Total: 1,5-2 días de trabajo. La migración en sí (pasos 2-6) la marca el
operador; el asistente no pega ni mueve credenciales.
