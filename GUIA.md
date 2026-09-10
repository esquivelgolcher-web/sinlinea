# Guía de uso diario — Sin Línea

## Qué pasa solo
- **Cada 3 horas** el sistema lee La Prensa y La Estrella, elige hasta 2 noticias
  nuevas (máximo 12 al día), redacta titular, bajada y caption con Claude y genera
  la imagen. Aparecen como **Borradores** en el panel.
- **Cada 30 minutos** revisa los **Programados** y publica en Instagram los que ya
  tienen la hora cumplida. El panel muestra el enlace al post en **Publicados**.
- **Cada hora** revisa si alguna imagen falló o quedó desactualizada y la vuelve a generar.
- **Cada lunes** renueva el token de Instagram. La fecha de vencimiento se ve en la
  cabecera del panel; si está en rojo, revisa `docs/CONFIGURACION.md` (sección 8).

## El panel
Abre `https://<tu-usuario>.github.io/sinlinea/panel/` en el celular. La primera vez
pulsa **Configurar** y pega el token de GitHub (ver `docs/CONFIGURACION.md`, paso 6).

Si hay más de una cuenta configurada, arriba de las pestañas aparecen sus nombres:
toca uno para ver y aprobar solo los posts de esa cuenta. El panel recuerda la
última cuenta elegida en ese dispositivo. Al aprobar, las franjas horarias son las
de la cuenta del post, y dos cuentas pueden publicar a la misma hora. Cada
aprobación publica en la cuenta de Instagram de ese post, nunca en otra. Antes
de publicar, el sistema confirma con la API que la credencial pertenece a esa
cuenta; si no coincide, no publica y lo avisa. Si una cuenta muestra la nota
"está desactivada…", sus posts aprobados quedan en cola hasta que se active.

En cada tarjeta puedes:
- Editar titular, bajada, categoría, variante de color, caption y hashtags.
  El titular admite hasta 65 caracteres (lo ideal son 40 a 55) y la bajada hasta 110;
  el contador de cada tarjeta lo muestra y el panel no guarda si te pasas. En la imagen
  el titular ocupa como máximo 3 líneas y la bajada 2: si un texto pasa del límite o no
  cabe ni reduciendo la letra (70 px el titular, 30 px la bajada), el sistema le pide a
  Claude una versión más corta de titular y bajada y vuelve a dibujar el post; si aun así
  no cabe, el post queda en error con el texto ya acortado para que lo ajustes a mano.
  Si cambias algo que afecta a la imagen, verás "Regenerando imagen…" durante 1 a 3
  minutos hasta que se vuelva a dibujar.
- **Aprobar**: propone la siguiente franja libre (7:00, 9:30, 12:00, 14:30, 17:00,
  19:30); puedes cambiarla. El post pasa a **Programados**.
- **Descartar**: el post no se publica (queda en Descartados).
- **Quitar de la cola**: vuelve a Borradores un post programado.
- **Reintentar**: en un post con error de Instagram, lo vuelve a poner en cola.

## Gestionar cuentas desde el panel (Panel Maestro)

Pulsa **Cuentas** en la cabecera. Cada tarjeta muestra la conexión con
Instagram, si la generación y la publicación están activas, los borradores y
programados, el último borrador generado, la última publicación, la última
recogida de métricas y el último error, con botones para abrir su panel de
posts y sus métricas.

Todo esto se hace enteramente desde el panel:

- **Añadir cuenta**: nombre, usuario de Instagram, identificador, idioma,
  línea editorial (temas, tono y el texto completo de `editorial.md`),
  fuentes, horarios, colores, logo, ilustraciones y origen de las
  credenciales. Nada se hereda de otra cuenta; la nueva nace con generación,
  publicación y métricas apagadas y en modo Environment `cuenta-<id>`.
- **Editar** cualquiera de esos datos, con las tres casillas de
  automatizaciones (independientes entre sí y explicadas en el formulario).
- **Encender o pausar** la generación y la publicación desde la tarjeta.
  Encender la generación exige `editorial.md` con contenido y al menos una
  fuente; encender la publicación exige la identidad verificada del usuario
  configurado y, si hay programados vencidos, decidir antes si se mantienen
  (saldrán en la próxima corrida) o vuelven a borradores.
- **Nuevo borrador** en el panel de posts: tu propio titular, bajada, caption,
  hashtags y fuente; la imagen se dibuja en la siguiente corrida de REGENERAR
  y lo apruebas y programas como cualquier otro. No usa Claude.
- **Aprobar, programar, quitar de la cola, descartar**, y **archivar** o
  **reactivar** una cuenta (siempre reactivada con todo apagado y su cola
  intacta).
- **Verificar identidad**: lanza el workflow Probar Instagram y muestra el
  resultado (usuario e id numérico) en la tarjeta.

Lo que sigue necesitando Meta o GitHub (la tarjeta lo guía con los nombres
exactos y enlaces; los valores de los secretos nunca pasan por el panel):

- En **Meta for Developers**: añadir la cuenta como Instagram Tester en la
  app y pulsar Generate token para obtener su token.
- En **GitHub**: crear el Environment `cuenta-<id>` y pegar en él los
  secretos `IG_ACCESS_TOKEN` e `IG_USER_ID` (o, en modo actual, los dos
  secretos de repositorio con el nombre que declara la cuenta). Hace falta
  ser administrador del repositorio. `GH_PAT` debe existir una vez.

## Paso a paso: añadir y operar una cuenta

Panel: https://esquivelgolcher-web.github.io/sinlinea/panel/ (en cada
navegador o celular hay que pegar una vez el token del panel en **Configurar**;
sin token, GitHub solo permite 60 consultas por hora y el panel queda en solo
lectura).

1. **Crear la cuenta.** Cabecera → **Cuentas** → **Añadir cuenta**. Rellena
   Nombre visible, Usuario de Instagram (con @), Identificador (se sugiere a
   partir del usuario; puedes cambiarlo antes de guardar; después no cambia) e
   Idioma. Pulsa **Guardar**. La cuenta aparece como tarjeta, en modo
   Environment `cuenta-<id>`, con generación, publicación y métricas apagadas.
2. **Editorial y marca.** En la tarjeta → **Editar**. Línea editorial: Temas
   (uno por línea), Tono y el texto completo de `editorial.md` (se redacta
   solo a partir de temas y tono hasta que lo edites). Fuentes → **Añadir
   fuente** (nombre, RSS o Portada, URL). Horarios: zona horaria y horas de
   publicación. Identidad visual: logo PNG, forma y tamaño del logo, colores,
   ilustraciones con IA y su estilo, rótulo sobre la imagen (vacío = sin
   rótulo). **Guardar**.
3. **Conectar credenciales (Meta y GitHub, con la guía de la tarjeta).** En la
   tarjeta, despliega **Guía de conexión**: muestra el Environment exacto, los
   dos secretos y los enlaces.
   - En **Meta for Developers**: abre la app de Instagram → Use cases → API
     setup with Instagram login → añade la cuenta como Instagram Tester
     (pestaña Roles) → **Generate token** en su fila → copia el token (se
     muestra una sola vez).
   - En **GitHub** (enlace "Crear Environment"): Settings → Environments →
     New environment → nombre exacto `cuenta-<id>` → Configure environment →
     Add environment secret: `IG_ACCESS_TOKEN` (pega el token) y `IG_USER_ID`
     (id numérico de la cuenta profesional; si no lo sabes, Probar Instagram
     lo indica en su registro). Los valores nunca pasan por el panel.
4. **Verificar identidad.** En la tarjeta → **Verificar identidad**. Si el
   token del panel tiene el permiso Actions (lectura y escritura), lanza el
   workflow Probar Instagram; si no, el aviso te lo dice y lo lanzas a mano en
   GitHub: Actions → **Probar Instagram** → Run workflow → cuenta = `<id>`.
   En unos minutos la tarjeta muestra "Identidad verificada (@usuario)".
5. **Preparar un borrador.** Tarjeta → **Abrir panel** → **Nuevo borrador**:
   categoría, titular, bajada, caption, hashtags, medio, URL y fecha de la
   noticia, escena opcional → **Crear borrador**. La imagen se dibuja en la
   siguiente corrida de REGENERAR (cada hora). O deja que Claude redacte:
   tarjeta → **Encender generación** (exige `editorial.md` con contenido y
   una fuente).
6. **Aprobar y programar.** En el panel de la cuenta, pestaña **Borradores**:
   edita titular, bajada, caption o escena si hace falta → **Aprobar** →
   elige fecha y hora → el post pasa a **Programados**. **Quitar de la cola**
   lo devuelve a borradores; **Descartar** lo retira.
7. **Publicar.** Nada sale hasta que en la tarjeta pulses **Encender
   publicación** (exige identidad verificada; si hay programados vencidos te
   pregunta si se mantienen o vuelven a borradores). **Pausar publicación**
   deja la cola en espera.
8. **Métricas.** Tarjeta → **Editar** → casilla "Recoger métricas a diario"
   → Guardar. Se ven en tarjeta → **Métricas** (o botón Métricas del panel de
   la cuenta). Lo que Instagram no devuelve aparece como "No disponible".
9. **Archivar / Reactivar.** Tarjeta → **Archivar** (apaga todo, conserva
   posts e historial) y **Reactivar** (vuelve apagada).

## Ilustraciones
Cada post puede llevar una ilustración generada con IA (Gemini) en vez de la
variante de color de fondo. Es opcional y se controla desde la propia tarjeta:
- **Escena de la ilustración**: describe en un par de frases qué dibujar (sin
  personas reales, solo escenas, objetos o lugares). El redactor ya propone una
  escena al crear el borrador; puedes editarla libremente.
- **Usar ilustración generada con IA**: la casilla que activa o desactiva el uso
  de la ilustración en el post final. Si la desmarcas, el post vuelve a usar el
  fondo de color de la variante.
- **Regenerar ilustración**: guarda la escena actual, activa la casilla y fuerza
  una nueva generación aunque el texto no haya cambiado. Útil si el resultado no
  te convenció. Si la escena está vacía (borradores antiguos), Claude la redacta
  a partir del titular y la bajada en la siguiente pasada y después Gemini
  genera la imagen; verás "Generando ilustración… (Claude redacta la escena)".

Al guardar un cambio de escena o de casilla verás "Generando ilustración…" en la
tarjeta durante uno o dos minutos, hasta que la imagen final se vuelva a dibujar.
Si Gemini falla (clave inválida, contenido rechazado, error de red), el post se
publica igual pero sin ilustración, usando el fondo de color de la variante como
respaldo; el mensaje de error se muestra debajo de la casilla. Ten en cuenta que
el nivel gratuito de Gemini tiene un cupo diario limitado y puede agotarse; en ese
caso espera al día siguiente o pasa a un plan de pago en Google AI Studio.
Tras 3 fallos seguidos para el mismo post, la ilustración se desactiva sola (la
casilla "Usar" queda destildada) para no seguir gastando cuota en algo que no
funciona; el post sigue publicándose con el respaldo tipográfico. Para
reactivarla, vuelve a marcar "Usar ilustración generada con IA" o pulsa
"Regenerar ilustración"; cualquiera de las dos cuenta como un intento nuevo.
- El rótulo "Ilustración generada con IA" se controla por cuenta con
  `ilustraciones.rotulo`: Sin Línea no lo lleva (decisión del 2026-09-08) y la
  cuenta personal sí. Al cambiarlo, los posts activos se vuelven a dibujar solos.

## Si algo sale mal
- Un post en **Errores** muestra el mensaje exacto. Los errores de imagen se
  reintentan solos; los de Instagram requieren pulsar Reintentar (o Descartar).
- Si no aparecen borradores nuevos: en GitHub → Actions → "Generar borradores",
  revisa la última corrida. "Cupo diario agotado" o "Sin candidatos nuevos" es
  normal; un error rojo suele ser la clave de Claude o un feed caído.
- Si nada se publica: Actions → "Publicar en Instagram". Un 190 suele ser token
  vencido; revisa `docs/CONFIGURACION.md` sección 8.

## Ajustes sin tocar código
- `cuentas/<id>/config.json`: franjas, máximos por corrida y por día, fuentes, marca, estilo de ilustración e idioma de cada cuenta
- `config.json`: modelo de Claude, Gemini y la lista de cuentas (compartido)
  (`claude-sonnet-5` por defecto; `claude-opus-5` para máxima calidad a más del doble de costo), fuentes.
- `cuentas/<id>/editorial.md`: tono, qué elegir, cómo escribir (una por cuenta).
- `templates/post.html`: diseño. Al cambiarla, sube `data-version` en `<html>` para
  que se regeneren las imágenes de los posts activos.

## Publicar también en Facebook (multicanal, fase 1)

Cada cuenta puede conectar una página de Facebook. Es independiente de Instagram: tiene su propio botón, su propia verificación y nace apagada.

**Conectar la página (una vez):**
1. Cuentas → Editar → «Página de Facebook»: escribe el id numérico de la página y Guardar. El interruptor de Facebook sigue apagado.
2. En las herramientas de Meta obtén el token de página (Explorador de la API Graph → Depurador de tokens → `me/accounts`; la guía de la tarjeta lo explica paso a paso) y pégalo en GitHub → Settings → Environments → `cuenta-<id>` → `FB_PAGE_TOKEN`. Nunca lo pegues en el panel.
3. Pulsa **Verificar Facebook** en la tarjeta (o Actions → Probar destino → Run workflow con la cuenta y `facebook`). En unos minutos la tarjeta dirá «Facebook: página «…» verificada».
4. Pulsa **Encender Facebook**. Si algo falta, el panel lo dice y no enciende nada.

**Aprobar una pieza para varias redes:** en Borradores pulsa Aprobar. En el diálogo, además de la fecha y la hora, verás una casilla por red (Instagram y Facebook) y el texto que saldrá en cada una. Revísalo: el de Facebook va sin hashtags. Si un texto pasa del límite, no se recorta solo: edítalo antes de confirmar.

**Después de aprobar:** en Programados cada pieza muestra una etiqueta por red (pendiente, en espera, publicado con enlace, error, incierto, omitido) y un desplegable «Versiones por red» para cambiar el texto aprobado a mano. «Omitir en Facebook» quita esa red de esa pieza (no se puede omitir la última). Si editas el caption o se regenera la imagen después de aprobar, la tarjeta lo avisa; nada cambia hasta que pulses «Guardar versión» o «Aprobar imagen actual».

**Si una red falla o queda incierta:** con error, la pieza va a Errores; «Reintentar» solo vuelve a intentar la red fallida. Con «incierto» (hubo un corte tras enviar), el sistema busca evidencia en la siguiente corrida y, si no la encuentra, tú decides con el botón «Decidir Facebook»: pega el enlace si ves la publicación en la página, o «volver a pendiente» si no está.

**Pausar todo / Reanudar todo:** en la tarjeta de la cuenta detiene todas las redes a la vez sin cambiar los interruptores. **Pausar Facebook** deja sus entregas en espera; no las omite.

**Pasos que se hacen fuera del panel:** obtener el token de página (Meta), guardarlo en el Environment (GitHub) y, si el token del panel no tiene permiso Actions, lanzar Probar destino desde Actions.

**La imagen que sale es la que aprobaste:** al aprobar se guarda la huella del archivo de imagen. Si después se regenera (por una ilustración nueva o un cambio de plantilla), la pieza queda en espera y verás «Aprobar imagen actual» en Versiones por red; hasta que lo pulses no se publica.

**Estado:** la publicación en Facebook está validada con una pieza real (10 de septiembre de 2026). La reconciliación de resultados inciertos sigue probada solo con simulaciones.

## Publicar también en Threads (multicanal, fase 2)

Cada cuenta puede conectar su perfil de Threads (el que va unido a su Instagram). Es independiente de Instagram y de Facebook: botón, verificación e interruptor propios, apagado al principio.

**Conectar el perfil (una vez):**
1. En la app de Meta añade el caso de uso «Access the Threads API», invita al perfil como *Threads Tester* y acepta la invitación desde Threads (Configuración → Cuenta → Permisos de sitios web). La guía de la tarjeta lo explica paso a paso.
2. En la misma app, «User Token Generator» → *Generate Token*: copia el token y pégalo en GitHub → Settings → Environments → `cuenta-<id>` → `THREADS_ACCESS_TOKEN`. Nunca lo pegues en el panel.
3. Pulsa **Verificar Threads** en la tarjeta (o Actions → Probar destino → Run workflow con la cuenta y `threads`). Si aún no has guardado el id del perfil, el resultado te lo dice: Cuentas → Editar → «Perfil de Threads», escribe el id numérico (y, si quieres, tu nombre de usuario) y verifica de nuevo. En unos minutos la tarjeta dirá «Threads: perfil «@…» verificado».
4. Pulsa **Encender Threads**. Si algo falta, el panel lo dice y no enciende nada.

**Al aprobar una pieza:** aparece la casilla de Threads con su texto. Threads admite 500 caracteres y cuenta cada emoji por sus bytes (un emoji suele valer 4): el contador lo muestra y, si te pasas, el panel no aprueba hasta que lo edites. Nada se recorta solo. Si el caption no cabe, la propuesta es más corta: titular, bajada y «Según <medio> (<fecha>)».

**Después:** las mismas etiquetas por red, «Omitir en Threads», «Decidir Threads» si un envío queda incierto y «Reintentar» si falla. **Pausar Threads** deja sus entregas en espera; no las omite.

**El token:** dura 60 días y el workflow «Renovar token» lo refresca cada lunes junto con el de Instagram (la primera renovación puede avisar si el token tiene menos de un día; la siguiente ya funciona).

**Estado:** Threads está probado solo con simulaciones. La primera publicación real será una pieza que apruebes expresamente.
