# Sin Línea · Ilustraciones generadas con IA en los posts — Diseño

Fecha: 2026-09-08
Estado: aprobado en conversación (proveedor Gemini API, nivel gratuito; rótulo
"Ilustración generada con IA"; sin personas reales; respaldo tipográfico).
Amplía la especificación v1 (`2026-09-07-sinlinea-instagram-design.md`).

## 1. Objetivo

Que cada post lleve, cuando sea posible, una imagen ilustrativa relacionada con
la noticia como fondo del diseño actual, generada automáticamente con la API
de Gemini a partir de una descripción de escena que redacta Claude. Si la
generación falla o se desactiva, el post conserva el diseño tipográfico de hoy.

## 2. Decisiones

| Tema | Decisión |
|---|---|
| Proveedor | Gemini API (clave de Google AI Studio), endpoint `interactions`, modelo por defecto `gemini-3.1-flash-lite-image`, tamaño `1K`, relación `4:5` |
| Costo | Nivel gratuito; si se agota, el post sale sin ilustración (nunca bloquea) |
| Ética | Rótulo fijo "Ilustración generada con IA" en la imagen; la descripción prohíbe personas reales, rostros reconocibles, texto y logotipos |
| Control | En el panel: editar la descripción, activar/desactivar la ilustración, regenerarla |
| Respaldo | Sin ilustración (o desactivada) se usa la plantilla tipográfica con sus tres variantes |

## 3. Modelo de datos

Campo nuevo en `posts/<id>.json` (opcional; los posts antiguos no lo tienen y
se comportan como `usar: false`):

```json
"ilustracion": {
  "descripcion": "Fachada de la Asamblea Nacional de Panamá al atardecer, cielo nublado, sin personas",
  "usar": true,
  "ruta": "public/ilus/2026-09-08-0306-la-prensa-2d58.jpg",
  "hashDescripcion": "a1b2c3d4e5f60718",
  "proveedor": "gemini",
  "modelo": "gemini-3.1-flash-lite-image",
  "generada": "2026-09-08T08:06:40.000Z",
  "error": null
}
```

- `descripcion`: la escena en español, sin estilo (el estilo fijo vive en
  `config.json`). Editable desde el panel.
- `usar`: si `true` y existe `ruta`, la imagen se usa como fondo.
- `hashDescripcion`: `hashTexto(descripcion)` en el momento de generar; si la
  descripción actual difiere, REGENERAR vuelve a pedir la imagen.
- `ruta`: `public/ilus/<id>.jpg` (1080×1350, JPEG). Se versiona en el repo como
  las imágenes finales.
- `error`: `null` o `{ mensaje, fecha }` del último intento fallido.

`hashImagen(post, version)` (estados.mjs) incorpora la ilustración: al texto
que se hashea se añade `post.ilustracion?.usar ? post.ilustracion.hashDescripcion : ""`.
Así, activar/desactivar o regenerar la ilustración vuelve a renderizar el post.

`validarPost` acepta `ilustracion` ausente, `null`, o un objeto con
`descripcion` (string), `usar` (boolean), `ruta` (string o null),
`hashDescripcion` (string o null), `error` (null u objeto con `mensaje` y `fecha`).

## 4. Configuración (`config.json`)

```json
"ilustraciones": {
  "activo": true,
  "proveedor": "gemini",
  "modelo": "gemini-3.1-flash-lite-image",
  "tamano": "1K",
  "estilo": "Fotografía editorial realista de prensa, luz natural, colores sobrios, composición limpia con espacio libre en la mitad inferior. Sin personas identificables ni rostros, sin texto, sin logotipos, sin marcas de agua.",
  "rotulo": "Ilustración generada con IA",
  "timeoutMs": 60000,
  "maxPorCorrida": 4
}
```

`validarConfig` exige `activo` booleano, `proveedor` = `gemini`, `modelo` y
`estilo` cadenas no vacías, `tamano` en `512px | 1K | 2K`, y `maxPorCorrida`
entero positivo (tope de llamadas a Gemini que REGENERAR hace en una misma
corrida; ver §7).

## 5. Redacción (redactor.mjs)

El esquema de salida de Claude gana `escena` (string) por post seleccionado:
una descripción visual de 15 a 40 palabras, en español, que represente el tema
de forma concreta (lugar, objeto, situación) sin personas reales ni rostros,
sin texto ni logotipos, sin violencia gráfica. Las reglas fijas del prompt lo
indican; el estilo no va en la escena.

## 6. Cliente de Gemini (`src/lib/ilustrador.mjs`)

- `crearIlustrador({ apiKey, config, fetchImpl = fetch })` → `{ generar(descripcion) }`.
- `generar(descripcion)`: `POST https://generativelanguage.googleapis.com/v1beta/interactions`
  con cabecera `x-goog-api-key`, cuerpo
  `{ model, input: [{ type: "text", text: estilo + "\n\nEscena: " + descripcion }], response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: "4:5", image_size: tamano } }`.
- Respuesta: se busca la imagen en `output_image.data` (base64), en
  `interaction.output_image.data`, o recorriendo `steps[].content[]` con
  `type === "image"`. Devuelve un `Buffer`. Si no hay imagen, lanza
  `Error("Gemini no devolvió imagen: " + texto)` con el `output_text` si existe.
- Errores HTTP: 429 y 5xx → un reintento tras 5 s; luego lanza. 4xx → lanza
  con el mensaje de la API. Timeout `config.ilustraciones.timeoutMs`.
- `guardarIlustracion(buffer, ruta)`: `sharp` → `resize(1080, 1350, { fit: "cover" })` → JPEG calidad 85.
- Nunca se registra la clave en logs.

## 7. Flujos

**GENERAR** (por cada post nuevo, antes del render): si `config.ilustraciones.activo`
y hay `GEMINI_API_KEY`, `ilustracion = { descripcion: escena, usar: true, ... }`;
se llama a `generar`; éxito → `ruta`, `hashDescripcion`, `generada`; fallo →
`usar: false`, `error: { mensaje, fecha }` y aviso en el log. Sin clave o con
`activo: false` → `usar: false` sin llamar. Luego el render normal.

**REGENERAR**: además de las reglas actuales, un post activo cuya
`ilustracion.usar` sea `true` y cuyo `hashDescripcion` no coincida con
`hashTexto(descripcion)` (o cuya `ruta` sea `null` sin `error` reciente de menos
de 1 h) vuelve a pedir la ilustración y después se re-renderiza. Un post con
`usar: false` nunca llama a Gemini.

**PUBLICAR**: sin cambios.

## 8. Plantilla (`templates/post.html`, versión 5)

- Nuevo dato `ilustracionUrl` (ruta relativa a la raíz o `null`).
- Con ilustración: capa `.fondo` con la imagen a pantalla completa
  (`object-fit: cover`), encima un degradado (transparente arriba → negro 85 %
  abajo desde el 40 % de la altura), titular en amarillo, bajada en blanco,
  chip y logo como en la variante `negro`, barra inferior roja. La variante de
  color se ignora mientras haya ilustración (se conserva en el JSON para el
  respaldo).
- Rótulo `config.ilustraciones.rotulo` en Inter 22 px, blanco al 80 %, en la
  esquina inferior derecha justo encima de la franja del pie.
- Sin ilustración: idéntica a la versión 4.
- `versionPlantilla` = 5 → todos los posts activos se re-renderizan una vez.

## 9. Panel

En cada tarjeta, debajo de la bajada: campo **Escena de la ilustración**
(textarea), casilla **Usar ilustración**, y botón **Regenerar ilustración**
(guarda la descripción actual y borra `hashDescripcion` para forzar la
regeneración). Si `ilustracion.error` existe, se muestra el mensaje. La imagen
de la tarjeta sigue siendo el render final, así que el efecto se ve tras la
corrida de REGENERAR ("Regenerando imagen…").

`editarTexto` admite `ilustracion` como campo editable (objeto completo).

## 10. Workflows y secretos

- Secreto nuevo `GEMINI_API_KEY`, pasado a `generar.yml` y `regenerar.yml`.
- `public/ilus/` se añade a los `git add` de ambos workflows.
- Nuevo workflow manual `probar-gemini.yml`: llama a `node src/probar-gemini.mjs`,
  que genera una imagen de prueba con la descripción fija "Vista del Canal de
  Panamá desde Miraflores al amanecer" y escribe `temp/prueba-gemini.jpg`
  (artefacto de la corrida). Sirve para verificar clave, modelo y formato de
  respuesta sin gastar una corrida completa.

## 11. Pruebas

- `ilustrador.mjs` con `fetch` simulado: éxito (base64 → Buffer), formato
  alternativo (`steps`), sin imagen (lanza con texto), 429 con reintento, 4xx.
- `estados.mjs`: `hashImagen` cambia al activar/desactivar o cambiar la
  ilustración; `hashTexto` estable.
- `posts.mjs`: `validarPost` acepta/rechaza formas de `ilustracion`.
- `redactor.mjs`: esquema con `escena`.
- `generar.mjs`: con ilustrador falso, éxito y fallo (respaldo).
- `regenerar.mjs`: regenera la ilustración cuando cambia la descripción; no
  llama con `usar: false`.
- `render.integration.mjs`: render con una ilustración de prueba generada
  localmente con `sharp` (degradado) y comprobación del rótulo.
- `panel.e2e.mjs`: editar la escena y desactivar la ilustración guarda el post.

## 12. Fuera de alcance

Elegir entre varias imágenes, edición de la imagen, uso de fotos reales de los
medios, otros proveedores (OpenRouter queda previsto: mismo contrato
`generar(descripcion) → Buffer`).
