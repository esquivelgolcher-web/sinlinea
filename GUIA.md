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

En cada tarjeta puedes:
- Editar titular, bajada, categoría, variante de color, caption y hashtags.
  Si cambias algo que afecta a la imagen, verás "Regenerando imagen…" durante 1 a 3
  minutos hasta que se vuelva a dibujar.
- **Aprobar**: propone la siguiente franja libre (7:00, 9:30, 12:00, 14:30, 17:00,
  19:30); puedes cambiarla. El post pasa a **Programados**.
- **Descartar**: el post no se publica (queda en Descartados).
- **Quitar de la cola**: vuelve a Borradores un post programado.
- **Reintentar**: en un post con error de Instagram, lo vuelve a poner en cola.

## Si algo sale mal
- Un post en **Errores** muestra el mensaje exacto. Los errores de imagen se
  reintentan solos; los de Instagram requieren pulsar Reintentar (o Descartar).
- Si no aparecen borradores nuevos: en GitHub → Actions → "Generar borradores",
  revisa la última corrida. "Cupo diario agotado" o "Sin candidatos nuevos" es
  normal; un error rojo suele ser la clave de Claude o un feed caído.
- Si nada se publica: Actions → "Publicar en Instagram". Un 190 suele ser token
  vencido; revisa `docs/CONFIGURACION.md` sección 8.

## Ajustes sin tocar código
- `config.json`: franjas, máximos por corrida y por día, modelo de Claude
  (`claude-opus-5` o `claude-sonnet-5` para gastar menos), fuentes.
- `prompts/editorial.md`: tono, qué elegir, cómo escribir.
- `templates/post.html`: diseño. Al cambiarla, sube `data-version` en `<html>` para
  que se regeneren las imágenes de los posts activos.
