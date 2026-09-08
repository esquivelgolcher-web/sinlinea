// Cliente mínimo de la Gemini API para generar la ilustración de un post.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

export const ENDPOINT_GEMINI = "https://generativelanguage.googleapis.com/v1beta/interactions";

export function extraerImagenBase64(json) {
  const directo = json?.output_image?.data || json?.interaction?.output_image?.data;
  if (directo) return directo;
  for (const paso of json?.steps || json?.interaction?.steps || []) {
    for (const bloque of paso?.content || []) {
      if (bloque?.type === "image" && (bloque.data || bloque.image?.data)) return bloque.data || bloque.image.data;
    }
  }
  for (const parte of json?.candidates?.[0]?.content?.parts || []) {
    if (parte?.inlineData?.data) return parte.inlineData.data;
  }
  return null;
}

export function textoDeRespuesta(json) {
  if (json?.output_text) return String(json.output_text);
  if (json?.interaction?.output_text) return String(json.interaction.output_text);
  const partes = json?.candidates?.[0]?.content?.parts || [];
  return partes.filter((p) => p?.text).map((p) => p.text).join(" ").trim();
}

// Oculta claves de Gemini que se hayan colado en un mensaje de error de la API y lo acota.
export function sanearMensaje(m) {
  return String(m).replace(/AIza[0-9A-Za-z_-]{35}/g, "[clave]").slice(0, 300);
}

export function crearIlustrador({ apiKey, config, fetchImpl = fetch, dormir = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const c = config.ilustraciones;
  if (!apiKey) throw new Error("Falta la clave de Gemini");

  async function generar(descripcion) {
    const cuerpo = {
      model: c.modelo,
      input: [{ type: "text", text: `${c.estilo}\n\nEscena: ${descripcion.slice(0, 400)}\n\nRecuerda: sin personas identificables ni rostros, sin texto, sin logotipos.` }],
      response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: "4:5", image_size: c.tamano },
    };
    let ultimo;
    for (let intento = 0; intento < 2; intento++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), c.timeoutMs);
      let res, json;
      try {
        res = await fetchImpl(ENDPOINT_GEMINI, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify(cuerpo),
          signal: ctrl.signal,
        });
        json = await res.json().catch(() => ({}));
      } catch (err) {
        ultimo = err.name === "AbortError" ? new Error("Gemini: tiempo de espera agotado") : err;
        if (intento === 0) { await dormir(5000); continue; }
        throw ultimo;
      } finally {
        clearTimeout(timer);
      }
      if (res.ok) {
        const b64 = extraerImagenBase64(json);
        if (!b64) throw new Error(sanearMensaje(`Gemini no devolvió imagen: ${textoDeRespuesta(json) || "sin detalle"}`));
        return Buffer.from(b64, "base64");
      }
      const mensaje = sanearMensaje(`Gemini respondió ${res.status}: ${json?.error?.message || "error"}`);
      if (res.status === 429 || res.status >= 500) {
        ultimo = new Error(mensaje);
        if (intento === 0) { await dormir(5000); continue; }
        throw ultimo;
      }
      throw new Error(mensaje);
    }
  }

  return { generar };
}

export async function guardarIlustracion(buffer, rutaAbsoluta) {
  fs.mkdirSync(path.dirname(rutaAbsoluta), { recursive: true });
  await sharp(buffer).resize(1080, 1350, { fit: "cover" }).jpeg({ quality: 85, progressive: true, mozjpeg: true }).toFile(rutaAbsoluta);
}
