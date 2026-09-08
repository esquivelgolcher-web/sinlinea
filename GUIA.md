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
