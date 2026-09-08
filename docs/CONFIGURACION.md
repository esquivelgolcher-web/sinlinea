# Configuración inicial, paso a paso

Sigue los pasos en orden. Cada uno se hace una sola vez.

## 1. El logo
Guarda el logo oficial (círculo amarillo con SIN LÍNEA) como `assets/logo.png`,
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
5. Obtén el id de usuario abriendo en el navegador (sustituye TOKEN):
   `https://graph.instagram.com/v23.0/me?fields=user_id,username&access_token=TOKEN`
   Copia el valor de `user_id`.
6. Crea los secretos `IG_ACCESS_TOKEN` (el token) e `IG_USER_ID` (el user_id).
7. Escribe en `data/token-info.json` la fecha de hoy más 60 días:
   `{ "vence": "AAAA-MM-DD" }`. Commit y push.

La app puede quedarse en modo desarrollo: publicar en tu propia cuenta (tester)
no requiere revisión de Meta.

## 5. Token para renovar el secreto (GH_PAT)
1. github.com → tu avatar → **Settings → Developer settings → Personal access
   tokens → Fine-grained tokens → Generate new token**.
2. Nombre `sinlinea-actions`, vencimiento 1 año, **Repository access: Only select
   repositories → sinlinea**, **Permissions → Repository → Secrets: Read and write**.
3. Guárdalo como secreto del repo con nombre `GH_PAT`.

## 6. Token para el panel (celular)
1. Igual que arriba, nombre `sinlinea-panel`, solo el repo `sinlinea`,
   **Permissions → Repository → Contents: Read and write**.
2. En el celular abre `https://<tu-usuario>.github.io/sinlinea/panel/` →
   **Configurar** → pega el token → **Guardar y conectar**. Queda guardado solo en ese
   navegador. Repite en cada dispositivo desde el que quieras aprobar.

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
