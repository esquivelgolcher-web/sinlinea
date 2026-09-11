// Frases célebres (formato "frase"): banco propio sin repeticiones, extracción literal de textos reales, pieza válida y
// publicable como imagen única; la imagen cambia cuando cambia la frase.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FORMATOS, NOMBRES_FORMATO, esPublicable } from "../src/lib/formatos.mjs";
import { validarPost } from "../src/lib/posts.mjs";
import { hashImagen, editarTexto } from "../src/lib/estados.mjs";
import { esCarrusel, imagenesDe, validarCarruselPara } from "../src/lib/destinos.mjs";
import { normalizarTexto, frasesUsadas, elegirDelBanco, esLiteral, frasesCreadasHoy, crearPostFrase, captionDeFrase, MAX_FRASE } from "../src/lib/frases.mjs";
import { configDesdeFormulario, formularioDesdeConfig, erroresDeCuenta } from "../src/lib/cuenta.mjs";

const base = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));
const ahora = new Date("2026-09-11T16:00:00.000Z");
const config = { zonaHoraria: "America/New_York", idioma: "en", marca: { nombre: "Leo Pope", usuario: "@leopopexiv" }, pages: { baseUrl: "https://u.github.io/sinlinea" }, frases: { activo: true, porDia: 1, categoria: "CULTURA", hashtags: ["#PopeLeoXIV", "#Vatican"], banco: [] } };
const banco = [
  { texto: "Peace be with you all!", autor: "Pope Leo XIV", fuente: "First blessing from the loggia of St. Peter's", anio: 2025, url: "https://www.vatican.va/content/leo-xiv/en.html" },
  { texto: "Who am I to judge?", autor: "Pope Francis", fuente: "Press conference on the return flight from Rio de Janeiro", anio: 2013, url: null },
  { texto: "Be not afraid!", autor: "Saint John Paul II", fuente: "Homily at the inauguration of his pontificate", anio: 1978, url: null },
];

test("(frases) el formato frase existe, tiene nombre y se publica como imagen única en cualquier red", () => {
  assert.ok(FORMATOS.includes("frase"));
  assert.equal(NOMBRES_FORMATO.frase, "Frase");
  assert.equal(esPublicable("frase"), true);
  const p = crearPostFrase({ frase: banco[0], origen: "banco", config, ahora, zona: "America/New_York", cuenta: "leopopexiv", variante: "negro" });
  assert.equal(esCarrusel(p), false);
  assert.deepEqual(imagenesDe({ ...p, imagen: { ruta: "public/img/x.jpg", url: "https://u/x.jpg", hash: "h" } }).length, 1);
  for (const red of ["instagram", "facebook", "threads"]) assert.equal(validarCarruselPara(p, red).ok, true, red);
});

test("(frases) normalizar y literalidad: mayúsculas, espacios, comillas tipográficas y puntuación final no cuentan; una frase inventada no es literal", () => {
  assert.equal(normalizarTexto("  “Peace be   with you ALL!” "), "peace be with you all");
  const texto = "In his first words, the Pope said: “Peace be with you all! Dearest brothers and sisters…”. The crowd cheered.";
  assert.equal(esLiteral("Peace be with you all", texto), true);
  assert.equal(esLiteral("peace be with you all!", texto), true);
  assert.equal(esLiteral("Peace be with all of you", texto), false, "cambiar una palabra ya no es literal");
  assert.equal(esLiteral("", texto), false);
});

test("(frases) el banco no repite: una frase ya usada en cualquier pieza de la cuenta (aunque esté descartada) se salta; agotado el banco no hay frase", () => {
  const usada = crearPostFrase({ frase: banco[0], origen: "banco", config, ahora, zona: "America/New_York", cuenta: "leopopexiv", variante: "negro" });
  const descartada = { ...crearPostFrase({ frase: { ...banco[1], texto: "“Who am I to judge?”" }, origen: "banco", config, ahora, zona: "America/New_York", cuenta: "leopopexiv", variante: "negro" }), estado: "descartado" };
  const posts = [usada, descartada, base];
  assert.deepEqual([...frasesUsadas(posts)], ["peace be with you all", "who am i to judge"]);
  assert.equal(elegirDelBanco(banco, posts).texto, "Be not afraid!");
  assert.equal(elegirDelBanco(banco.slice(0, 2), posts), null);
  assert.equal(elegirDelBanco([], posts), null);
});

test("(frases) cupo diario propio: cuenta solo las piezas de formato frase creadas hoy en la zona de la cuenta", () => {
  const hoy = crearPostFrase({ frase: banco[0], origen: "banco", config, ahora, zona: "America/New_York", cuenta: "leopopexiv", variante: "negro" });
  const ayer = { ...crearPostFrase({ frase: banco[1], origen: "banco", config, ahora: new Date("2026-09-10T03:00:00.000Z"), zona: "America/New_York", cuenta: "leopopexiv", variante: "negro" }) }; // 23:00 del 9 en Nueva York
  assert.equal(frasesCreadasHoy([hoy, ayer, base], ahora, "America/New_York"), 1);
});

test("(frases) la pieza del banco: formato frase, sin ilustración, fuente con URL (la del documento o la de la Santa Sede), titular con el autor, caption con la frase y su atribución, hashtags de la cuenta", () => {
  const p = crearPostFrase({ frase: banco[1], origen: "banco", config, ahora, zona: "America/New_York", cuenta: "leopopexiv", variante: "amarillo" });
  validarPost(p);
  assert.equal(p.formato, "frase");
  assert.equal(p.estado, "borrador");
  assert.equal(p.cuenta, "leopopexiv");
  assert.equal(p.ilustracion, null, "una frase no lleva ilustración generada");
  assert.equal(p.imagen, null);
  assert.deepEqual(p.frase, { texto: "Who am I to judge?", autor: "Pope Francis", fuente: "Press conference on the return flight from Rio de Janeiro", anio: 2013, url: null, origen: "banco" });
  assert.equal(p.fuente.url, "https://www.vatican.va/", "sin URL propia, la fuente apunta a la Santa Sede");
  assert.equal(p.fuente.medio, "Vatican.va");
  assert.equal(p.titular, "Pope Francis");
  assert.equal(p.bajada, "Press conference on the return flight from Rio de Janeiro · 2013");
  assert.equal(p.categoria, "CULTURA");
  assert.equal(p.variante, "amarillo");
  assert.match(p.caption, /^“Who am I to judge\?”\n\n— Pope Francis, Press conference on the return flight from Rio de Janeiro \(2013\)/);
  assert.deepEqual(p.hashtags, ["#PopeLeoXIV", "#Vatican"]);
  assert.match(p.id, /^2026-09-11-1200-leopopexiv-vatican-va-[0-9a-f]{4}$/, "hora de Nueva York en el id");
  const conUrl = crearPostFrase({ frase: banco[0], origen: "banco", config, ahora, zona: "America/New_York", cuenta: "leopopexiv", variante: "negro" });
  assert.equal(conUrl.fuente.url, "https://www.vatican.va/content/leo-xiv/en.html");
  assert.equal(conUrl.fuente.publicado, "2025-01-01T00:00:00.000Z", "solo se conoce el año");
});

test("(frases) la pieza extraída de un texto real: fuente = el artículo, y el caption cita el medio y la fecha", () => {
  const articulo = { medio: "Vatican News", url: "https://www.vaticannews.va/en/pope/news/2026-09/angelus.html", titulo: "Pope at Angelus: peace is built every day", fecha: "2026-09-11T10:00:00.000Z" };
  const p = crearPostFrase({ frase: { texto: "Peace is built every day, in the small things.", autor: "Pope Leo XIV", fuente: "Angelus", anio: 2026, url: articulo.url }, origen: "texto", articulo, config, ahora, zona: "America/New_York", cuenta: "leopopexiv", variante: "negro" });
  validarPost(p);
  assert.equal(p.fuente.medio, "Vatican News");
  assert.equal(p.fuente.url, articulo.url);
  assert.equal(p.fuente.titulo, articulo.titulo);
  assert.equal(p.fuente.publicado, articulo.fecha);
  assert.equal(p.frase.origen, "texto");
  assert.match(p.caption, /Via Vatican News, 11 September 2026/);
  assert.equal(captionDeFrase({ texto: "A", autor: "B", fuente: "C", anio: null }, { hashtags: [] }), "“A”\n\n— B, C");
});

test("(frases) validación: frase.texto obligatorio y acotado, anio entero o null, origen banco|texto; la imagen cambia con la frase y el panel puede editarla", () => {
  const p = crearPostFrase({ frase: banco[0], origen: "banco", config, ahora, zona: "America/New_York", cuenta: "leopopexiv", variante: "negro" });
  assert.throws(() => validarPost({ ...p, frase: { ...p.frase, texto: "" } }), /frase/);
  assert.throws(() => validarPost({ ...p, frase: { ...p.frase, texto: "x".repeat(MAX_FRASE + 1) } }), /frase/);
  assert.throws(() => validarPost({ ...p, frase: { ...p.frase, anio: "2025" } }), /frase/);
  assert.throws(() => validarPost({ ...p, frase: { ...p.frase, origen: "memoria" } }), /frase/);
  assert.throws(() => crearPostFrase({ frase: { ...banco[0], texto: "x".repeat(MAX_FRASE + 1) }, origen: "banco", config, ahora, zona: "America/New_York", cuenta: "leopopexiv", variante: "negro" }), /frase/);
  const h1 = hashImagen(p, 1);
  assert.notEqual(hashImagen({ ...p, frase: { ...p.frase, texto: "Peace be with you." } }, 1), h1, "la huella de la imagen depende de la frase");
  assert.notEqual(hashImagen({ ...p, frase: { ...p.frase, autor: "Leo XIV" } }, 1), h1);
  const editada = editarTexto(p, { frase: { texto: "Peace be with you all.", anio: 2025 } }, "2026-09-11T17:00:00.000Z");
  assert.equal(editada.frase.texto, "Peace be with you all.");
  assert.equal(editada.frase.autor, "Pope Leo XIV", "los campos no indicados se conservan");
  assert.equal(editada.frase.origen, "banco");
  assert.throws(() => editarTexto(p, { frase: { texto: "" } }, "2026-09-11T17:00:00.000Z"), /frase/);
});

test("(frases) formulario de cuenta: el bloque frases va y vuelve (activo, por día, preferencia, hashtags y banco); el banco se valida fila a fila; sin frases no se inventa el bloque", () => {
  const d = { id: "prueba", nombre: "Prueba", usuario: "@prueba", idioma: "en", zonaHoraria: "America/New_York", temas: ["a"], tono: "b", fuentes: [], franjas: ["09:00"], colores: { principal: "#500014", acento: "#C8A45D", oscuro: "#202020", claro: "#F5F0E6" }, logoForma: "circulo", logoTamano: 96, ilustracionesActivo: false, estiloIlustracion: "", rotulo: "",
    frasesActivo: true, frasesPorDia: 2, frasesPreferir: "banco", frasesHashtags: "#PopeLeoXIV Vatican", frasesBanco: [{ texto: " Peace be with you all! ", autor: "Pope Leo XIV", fuente: "First blessing", anio: "2025", url: "https://www.vatican.va/content/leo-xiv/en.html" }, { texto: "Be not afraid!", autor: "Saint John Paul II", fuente: "", anio: "", url: "" }] };
  assert.deepEqual(erroresDeCuenta(d).filter((e) => /frases/.test(e)), []);
  const c = configDesdeFormulario(d, null);
  assert.deepEqual(c.frases, { activo: true, porDia: 2, preferir: "banco", hashtags: ["#PopeLeoXIV", "#Vatican"], banco: [
    { texto: "Peace be with you all!", autor: "Pope Leo XIV", fuente: "First blessing", anio: 2025, url: "https://www.vatican.va/content/leo-xiv/en.html" },
    { texto: "Be not afraid!", autor: "Saint John Paul II", fuente: "" },
  ] });
  const f = formularioDesdeConfig("prueba", c, "");
  assert.equal(f.frasesActivo, true); assert.equal(f.frasesPorDia, 2); assert.equal(f.frasesPreferir, "banco"); assert.equal(f.frasesHashtags, "#PopeLeoXIV #Vatican");
  assert.equal(f.frasesBanco.length, 2);
  assert.equal(configDesdeFormulario({ ...d, frasesActivo: false, frasesBanco: [] }, null).frases, undefined, "sin frases no se escribe el bloque");
  assert.equal(configDesdeFormulario({ ...d, frasesActivo: false, frasesBanco: [] }, { frases: { activo: true, porDia: 1, banco: [] }, nombre: "x", marca: {} }).frases.activo, false, "al editar, apagar se guarda");
  const malas = erroresDeCuenta({ ...d, frasesBanco: [{ texto: "", autor: "x", fuente: "" }, { texto: "x".repeat(321), autor: "x", fuente: "" }, { texto: "ok", autor: "", fuente: "" }, { texto: "ok", autor: "x", fuente: "", anio: "hace poco" }, { texto: "ok", autor: "x", fuente: "", url: "vatican.va" }], frasesPorDia: 9 });
  assert.equal(malas.filter((e) => /frases: la frase 1/.test(e)).length, 1);
  assert.equal(malas.filter((e) => /frases: la frase 2/.test(e)).length, 1);
  assert.equal(malas.filter((e) => /frases: la frase 3/.test(e)).length, 1);
  assert.equal(malas.filter((e) => /frases: la frase 4/.test(e)).length, 1);
  assert.equal(malas.filter((e) => /frases: la frase 5/.test(e)).length, 1);
  assert.equal(malas.filter((e) => /frasesPorDia/.test(e)).length, 1);
});
