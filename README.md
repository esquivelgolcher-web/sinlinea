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
npm run verificar            # configuración, archivos y secretos (solo nombres, nunca valores)
```

## Estructura

```
config.json            configuración global: Pages, modelo de Claude, Gemini, lista de cuentas
cuentas/<id>/          una carpeta por cuenta: config.json (marca, fuentes, franjas, cupos,
                       estilo de ilustración, nombres de secretos), editorial.md y logo.png
templates/post.html    plantilla 1080×1350 (data-version controla el re-render)
src/                   generar, regenerar, publicar, renovar-token, build, serve + lib/
src/lib/ilustrador.mjs generación de ilustraciones con Gemini
panel/                 panel de aprobación (estático)
posts/                 un JSON por post; posts/archivo/ para los antiguos
public/img/            imágenes JPEG servidas por Pages en /img/
public/ilus/           ilustraciones generadas con Gemini, una por post
data/<id>/             por cuenta: seen.json (URLs ya evaluadas) y token-info.json (vencimiento del token)
.github/workflows/     generar (3 h), regenerar (cada hora y al hacer push a posts/), publicar (30 min), renovar-token (lunes), probar-gemini (manual), verificar (manual), probar-instagram (manual)
```
