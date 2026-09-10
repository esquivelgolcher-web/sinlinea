// Formatos editoriales del perfil (post, carrusel, reel) y vocabulario de trazabilidad. Módulo isomorfo (Node y panel).
// El publicador actual solo entrega imágenes sueltas: carrusel y reel se redactan y renderizan para revisión, pero no
// se programan hasta que exista su adaptador de publicación (ver docs/CONFIGURACION.md §14).
export const FORMATOS = ["post", "carrusel", "reel"];
export const NOMBRES_FORMATO = Object.freeze({ post: "Post", carrusel: "Carrusel", reel: "Reel" });
// El carrusel se publica como contenedores hijos + contenedor CAROUSEL (Instagram, Threads) o varias fotos adjuntas (Facebook).
// El reel sigue sin adaptador (no hay producción de vídeo).
export const FORMATOS_PUBLICABLES = ["post", "carrusel"];
export const formatoDe = (post) => post?.formato || "post";
export const esPublicable = (formato) => FORMATOS_PUBLICABLES.includes(formato || "post");

// Tipos de afirmación: cada una lleva su fuente; una denuncia sin fuente es una alerta, nunca un hecho.
export const TIPOS_AFIRMACION = ["hecho", "denuncia", "hipotesis", "opinion"];
// Alcance de acceso al contenido de una fuente: lo que de verdad se recuperó, nunca lo que se supone.
export const ALCANCES = ["completo", "parcial", "fragmento", "titular"];
// Alertas de revisión que el redactor o el validador dejan en la pieza.
export const ALERTAS = ["fuente-unica", "acceso-parcial", "acusacion-sin-fuente", "hecho-antiguo", "evidencia-insuficiente", "solo-pista", "formato-no-publicable"];
export const DESCRIPCION_ALERTA = Object.freeze({
  "fuente-unica": "Solo hay una fuente: contrasta antes de publicar o ajusta la certeza del texto.",
  "acceso-parcial": "No se recuperó el artículo completo: el texto se apoya en un fragmento.",
  "acusacion-sin-fuente": "Hay una denuncia o acusación sin fuente enlazada.",
  "hecho-antiguo": "El hecho tiene más de 30 días: el texto debe decir la fecha y no presentarlo como reciente.",
  "evidencia-insuficiente": "La evidencia disponible es débil (puntuación de evidencia baja).",
  "solo-pista": "La fuente principal solo aporta titular o fragmento: sirve como pista, no como base de una pieza.",
  "formato-no-publicable": "El reel no tiene todavía adaptador de publicación: se revisa aquí, no se programa.",
});
export const ESTADOS_REVISION = ["pendiente", "revisado"];
