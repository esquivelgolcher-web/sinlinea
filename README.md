# Sin Línea · Publicación automática en Instagram

Convierte noticias de Panamá (La Prensa y La Estrella) en posts de Instagram con la
marca Sin Línea, los deja listos para aprobar desde el celular y publica los
aprobados a la hora programada. Todo corre en GitHub Actions y GitHub Pages.

- Diseño: `docs/superpowers/specs/2026-09-07-sinlinea-instagram-design.md`
- Guía de uso diario: `GUIA.md`
- Configuración inicial (GitHub, Meta, tokens): `docs/CONFIGURACION.md`

## Comandos

```bash
npm install                  # dependencias
npx playwright install chromium
npm test                     # tests unitarios
npm run test:render          # render real de la plantilla (necesita Chromium)
npm run test:e2e             # panel en modo local con Playwright
npm run preview              # http://localhost:4173 (plantilla y panel local)
npm run generar -- --dry-run # simula una corrida (necesita ANTHROPIC_API_KEY)
npm run publicar -- --dry-run
```

## Estructura

```
config.json            fuentes, franjas, límites, modelo, marca
prompts/editorial.md   línea editorial (editable sin tocar código)
templates/post.html    plantilla 1080×1350 (data-version controla el re-render)
src/                   generar, regenerar, publicar, renovar-token, build, serve + lib/
src/lib/ilustrador.mjs generación de ilustraciones con Gemini
panel/                 panel de aprobación (estático)
posts/                 un JSON por post; posts/archivo/ para los antiguos
public/img/            imágenes JPEG servidas por Pages en /img/
public/ilus/           ilustraciones generadas con Gemini, una por post
data/seen.json         URLs ya evaluadas · data/token-info.json vencimiento del token
.github/workflows/     generar (3 h), regenerar (push a posts/), publicar (30 min), renovar-token (lunes), probar-gemini (manual)
```
