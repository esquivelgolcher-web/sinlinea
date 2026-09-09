# Fase 2 del panel maestro: credenciales aisladas por cuenta con GitHub Environments

Fecha: 2026-09-09. Estado: **plan aprobado para revisión; no se ha migrado
ninguna credencial**. Complementa ARCHITECTURE.md (2.3b y 2.7) y ROADMAP.md
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

### 2.2 Un job por cuenta en los workflows de Instagram

Afecta a PUBLICAR, RENOVAR TOKEN, Probar Instagram y Verificar. GENERAR y
REGENERAR no usan credenciales de Instagram y no cambian.

```yaml
jobs:
  cuentas:                       # lee config.json y decide qué cuentas procesar
    runs-on: ubuntu-latest
    outputs:
      lista: ${{ steps.lista.outputs.lista }}
    steps:
      - uses: actions/checkout@v4
      - id: lista
        run: node src/cuentas-activas.mjs --salida lista   # JSON: ids no archivados, o el input `cuenta`
  publicar:
    needs: cuentas
    if: ${{ needs.cuentas.outputs.lista != '[]' }}
    strategy:
      matrix:
        cuenta: ${{ fromJSON(needs.cuentas.outputs.lista) }}
      max-parallel: 1            # los commits del bot siguen siendo secuenciales
      fail-fast: false           # una cuenta con error no cancela a las demás
    environment: cuenta-${{ matrix.cuenta }}
    env:
      IG_ACCESS_TOKEN: ${{ secrets.IG_ACCESS_TOKEN }}   # los del ENTORNO de esa cuenta
      IG_USER_ID: ${{ secrets.IG_USER_ID }}
    steps:
      - run: node src/publicar.mjs --cuenta "${{ matrix.cuenta }}"
```

- El job solo ve los dos secretos de su entorno (más los de repositorio que
  el `env` exponga explícitamente, que en estos workflows son ninguno de
  Instagram). Los logs muestran, como mucho, dos nombres por job.
- Los orquestadores aceptan `--cuenta <id>`: procesan una sola cuenta y leen
  los nombres fijos `IG_ACCESS_TOKEN` / `IG_USER_ID`. Sin `--cuenta` se
  comportan como hoy (compatibilidad con local y pruebas).
- `src/cuentas-activas.mjs` (nuevo, 20 líneas): imprime la lista de cuentas no
  archivadas; con `--cuenta x` devuelve `["x"]` si existe.
- La política de salida no cambia: rojo solo si fallan todas; `::error::` por
  cuenta se conserva (cada job anota la suya).
- Concurrencia: el grupo `sinlinea` se mantiene a nivel de workflow; el
  `max-parallel: 1` evita que dos jobs empujen a la vez.

### 2.3 Panel

- `estadoConexion` deja de leer el `env` de los workflows. Pasa a comprobar,
  con la API de GitHub, que el entorno `cuenta-<id>` existe y tiene los dos
  secretos: `GET /repos/{o}/{r}/environments/cuenta-<id>/secrets` (solo
  nombres y fechas). "Conexión pendiente de configuración" pasa a significar
  "falta el entorno o alguno de sus dos secretos", y la tarjeta enumera qué
  falta con el nombre exacto.
- La detección de "secreto actualizado después de la comprobación" (fase 1)
  se conserva, leyendo `updated_at` del secreto de entorno.
- Nuevo en la tarjeta: interruptores **"Generación automática"** y
  **"Publicación automática"** con confirmación, que escriben `automatico` en
  `cuentas/<id>/config.json` con sha. Publicar solo se puede encender si el
  estado es *identidad verificada* y no antigua; si no, el interruptor explica
  qué falta. Así "habilitar expresamente" se hace desde el panel y queda
  registrado en un commit.
- El formulario de alta muestra el nombre del entorno a crear y los dos
  nombres fijos, y enlaza a la página de entornos del repositorio.

### 2.4 Modo de transición (solo durante la migración)

Mientras convivan cuentas migradas y sin migrar, el job usa el secreto de
entorno si existe y, si no, el secreto de repositorio con el nombre declarado
en la configuración de la cuenta:

```yaml
    env:
      IG_ACCESS_TOKEN: ${{ secrets.IG_ACCESS_TOKEN }}
      IG_USER_ID: ${{ secrets.IG_USER_ID }}
      # transición: nombres históricos como respaldo (se retiran en el paso 6 de la migración)
      IG_ACCESS_TOKEN_RESPALDO: ${{ secrets[matrix.tokenSecreto] }}
      IG_USER_ID_RESPALDO: ${{ secrets[matrix.usuarioIdSecreto] }}
```

`cuentas-activas.mjs` emite, además del id, los nombres declarados de cada
cuenta (`matrix.include`), y los orquestadores usan el respaldo solo cuando el
secreto de entorno está vacío, registrando en el resumen "credenciales de
repositorio (transición)". El respaldo desaparece al terminar la migración.

## 3. Quién hace qué

| Paso | Desde el panel | En GitHub (operador) | Permisos necesarios |
|---|---|---|---|
| Crear la cuenta (editorial, fuentes, logo, horarios) | Sí: "Añadir cuenta" (escritura atómica) | — | Token del panel: Contents lectura/escritura |
| Crear el entorno `cuenta-<id>` | No (el panel muestra el nombre y el enlace) | Settings → Environments → New environment | Ser administrador del repositorio |
| Guardar `IG_ACCESS_TOKEN` e `IG_USER_ID` en el entorno | No: el panel nunca toca valores | Environment → Add secret (pegar el token y el id) | Administrador del repositorio |
| Ver si el entorno y sus secretos existen, y cuándo se actualizaron | Sí (nombres y fechas, nunca valores) | — | Token del panel: Secrets lectura (+ Environments lectura) |
| Verificar identidad | Sí: lanza Probar Instagram para esa cuenta | O a mano: Actions → Probar Instagram → Run workflow | Token del panel: Actions lectura/escritura |
| Encender generación o publicación | Sí: interruptores con confirmación (publicar exige identidad verificada) | — | Token del panel: Contents lectura/escritura |
| Renovar el token de Instagram cada lunes | Automático (RENOVAR TOKEN escribe el secreto del entorno) | Crear `GH_PAT` una vez | `GH_PAT`: Secrets lectura/escritura y Environments lectura |
| Archivar / reactivar | Sí | — | Contents lectura/escritura |

Regla que no cambia: **ningún valor de secreto pasa por el panel, por el chat
ni por archivos del repositorio**. El panel y el asistente solo manejan
nombres, fechas y estados.

## 4. Migración de las dos cuentas existentes

Objetivo: cero interrupciones y **sin tocar `automatico`**. Sin Línea sigue con
la publicación pausada y sus programados en cola; @luiseskivelgolcher sigue con
todo apagado. Orden:

1. **Código primero, sin efecto**: desplegar `cuentas-activas.mjs`, `--cuenta`
   en los orquestadores y los workflows por cuenta **con el modo de
   transición**. Al no existir entornos, cada job usa el respaldo (los
   secretos de repositorio actuales): el comportamiento es idéntico al de hoy.
   Comprobación: Probar Instagram para `luiseskivelgolcher` desde el panel
   sigue dando "identidad verificada" y anota "credenciales de repositorio
   (transición)".
2. **Entorno de @luiseskivelgolcher**: crear `cuenta-luiseskivelgolcher` y
   copiar en él `IG_ACCESS_TOKEN` (el valor que hoy vive en
   `IG_ACCESSTOKEN_LUISESKIVELGOLCHER`) e `IG_USER_ID` (el de
   `IG_USER_ID_LUISESKIVELGOLCHER`). Los pega el operador desde su gestor de
   contraseñas o regenerando el token en Meta; el asistente no los ve.
   Verificar desde el panel: la tarjeta debe decir "identidad verificada" y
   "credenciales del entorno".
3. **Entorno de Sin Línea**: crear `cuenta-sinlinea` con `IG_USER_ID`
   (17841458054414779) y, **cuando se regenere el token en Meta**,
   `IG_ACCESS_TOKEN`. Hasta entonces el job usa el respaldo, que sigue roto
   (code 190), y la cuenta sigue pausada: nada cambia respecto a hoy. Al
   pegar el token nuevo en el entorno, verificar desde el panel; solo después
   el operador decide reprogramar y encender la publicación.
4. **Comprobación de aislamiento**: en el log de un job de PUBLICAR de una
   cuenta no aparecen los nombres de secretos de la otra; `verificar` lo
   informa por cuenta.
5. **Ventana de convivencia**: al menos una semana con ambos mecanismos, para
   ver una renovación de token (lunes) escribiendo en el entorno.
6. **Retirada**: borrar los secretos de repositorio con sufijo
   (`IG_ACCESSTOKEN_LUISESKIVELGOLCHER`, `IG_USER_ID_LUISESKIVELGOLCHER`) y los
   históricos de Sin Línea, quitar el modo de transición de los workflows y
   la referencia a `tokenSecreto`/`usuarioIdSecreto` de las dos
   configuraciones. Un solo commit, con `verificar` en verde antes y después.

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
