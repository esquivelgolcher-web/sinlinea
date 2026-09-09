// Límites de la API de GitHub en el panel (también con token): el almacén no repite consultas de metadatos de secretos
// sin necesidad, detecta las respuestas de límite (403/429 con cabeceras x-ratelimit / retry-after), deja de consultar
// hasta la hora de reinicio y lo explica con un mensaje claro. Nunca lee ni muestra valores de secretos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearAlmacenGitHub, ErrorLimiteApi, limiteDeRespuesta } from "../panel/almacen.mjs";

const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o), "utf8").toString("base64");

// fetch simulado con enrutado por URL (listarCuentas lanza varias lecturas en paralelo) y cabeceras de respuesta.
function fetchPorRuta(rutas) {
  const llamadas = [];
  const impl = async (url, opciones = {}) => {
    const u = String(url);
    llamadas.push({ url: u, metodo: opciones.method || "GET" });
    const regla = rutas.find((r) => r.re.test(u));
    const r = regla ? (typeof regla.res === "function" ? regla.res(u) : regla.res) : { status: 404, json: { message: "Not Found" } };
    const cabeceras = new Map(Object.entries(r.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
    return {
      ok: r.status >= 200 && r.status < 300, status: r.status,
      headers: { get: (k) => cabeceras.get(String(k).toLowerCase()) ?? null },
      json: async () => r.json, text: async () => JSON.stringify(r.json),
    };
  };
  return { impl, llamadas, metadatos: () => llamadas.filter((l) => /\/actions\/secrets\/|\/environments\//.test(l.url)).length };
}

const configA = { nombre: "A", instagram: { tokenSecreto: "IG_ACCESS_TOKEN_A", usuarioIdSecreto: "IG_USER_ID_A" } };
const configB = { nombre: "B", instagram: { origen: "entorno" } };
function rutasBase(extra = []) {
  return [
    ...extra,
    { re: /contents\/config\.json\?/, res: { status: 200, json: { content: b64({ cuentas: ["a", "b"], zonaHoraria: "America/Panama" }), sha: "g1" } } },
    { re: /contents\/cuentas\/a\?/, res: { status: 200, json: [{ name: "config.json" }, { name: "logo.png" }] } },
    { re: /contents\/cuentas\/b\?/, res: { status: 200, json: [{ name: "config.json" }] } },
    { re: /contents\/cuentas\/a\/config\.json/, res: { status: 200, json: { content: b64(configA), sha: "a1" } } },
    { re: /contents\/cuentas\/b\/config\.json/, res: { status: 200, json: { content: b64(configB), sha: "b1" } } },
    { re: /actions\/secrets\/IG_ACCESS_TOKEN_A$/, res: { status: 200, json: { name: "IG_ACCESS_TOKEN_A", updated_at: "2026-09-08T16:43:18Z" } } },
    { re: /actions\/secrets\/IG_USER_ID_A$/, res: { status: 404, json: { message: "Not Found" } } },
    { re: /environments\/cuenta-b\/secrets\/IG_ACCESS_TOKEN$/, res: { status: 200, json: { name: "IG_ACCESS_TOKEN", updated_at: "2026-09-09T10:00:00Z" } } },
    { re: /environments\/cuenta-b\/secrets\/IG_USER_ID$/, res: { status: 200, json: { name: "IG_USER_ID", updated_at: "2026-09-09T10:01:00Z" } } },
  ];
}

test("(límites) listarCuentas consulta los metadatos de secretos una vez y los reutiliza en las siguientes cargas; frescos: true vuelve a consultarlos", async () => {
  const f = fetchPorRuta(rutasBase());
  const a = crearAlmacenGitHub({ token: "t", owner: "o", repo: "r", fetchImpl: f.impl });
  const uno = await a.listarCuentas();
  assert.equal(f.metadatos(), 4, "dos secretos de repositorio + dos del Environment");
  assert.deepEqual(uno.cuentas.find((c) => c.id === "a").secretosActualizados, { IG_ACCESS_TOKEN_A: "2026-09-08T16:43:18Z", IG_USER_ID_A: null });
  assert.deepEqual(uno.cuentas.find((c) => c.id === "b").secretosActualizados, { IG_ACCESS_TOKEN: "2026-09-09T10:00:00Z", IG_USER_ID: "2026-09-09T10:01:00Z" });
  assert.equal(uno.limite, null);
  const dos = await a.listarCuentas();
  assert.equal(f.metadatos(), 4, "la segunda carga no repite las consultas de metadatos");
  assert.deepEqual(dos.cuentas.find((c) => c.id === "b").secretosActualizados, uno.cuentas.find((c) => c.id === "b").secretosActualizados);
  await a.listarCuentas({ frescos: true });
  assert.equal(f.metadatos(), 8, "con frescos: true se consultan de nuevo");
});

test("(límites) los metadatos guardados caducan: pasado el plazo se consultan de nuevo sin pedirlo", async () => {
  let ahora = Date.parse("2026-09-09T12:00:00Z");
  const f = fetchPorRuta(rutasBase());
  const a = crearAlmacenGitHub({ token: "t", owner: "o", repo: "r", fetchImpl: f.impl, ahora: () => ahora, vidaMetadatosMs: 60_000 });
  await a.listarCuentas();
  ahora += 30_000;
  await a.listarCuentas();
  assert.equal(f.metadatos(), 4);
  ahora += 31_000;
  await a.listarCuentas();
  assert.equal(f.metadatos(), 8);
});

test("(límites) un 403 con x-ratelimit-remaining: 0 en una lectura opcional no rompe la carga: se anota el límite, se dejan de consultar secretos y no se afirma nada sobre ellos", async () => {
  const ahora = Date.parse("2026-09-09T12:00:00Z");
  const reinicio = Math.floor(ahora / 1000) + 1800;
  const limitado = { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reinicio) }, json: { message: "API rate limit exceeded for user ID 1." } };
  const f = fetchPorRuta(rutasBase([{ re: /actions\/secrets\//, res: limitado }]));
  const a = crearAlmacenGitHub({ token: "t", owner: "o", repo: "r", fetchImpl: f.impl, ahora: () => ahora });
  const info = await a.listarCuentas();
  assert.equal(info.cuentas.length, 2, "las cuentas ya leídas se devuelven");
  assert.equal(info.secretosLegibles, false);
  assert.ok(info.cuentas.every((c) => c.secretosActualizados === null), "sin metadatos no se afirma nada");
  assert.equal(info.limite.reinicia, new Date(reinicio * 1000).toISOString());
  assert.match(info.limite.mensaje, /límite/i);
  assert.match(info.limite.mensaje, /\d{1,2}:\d{2}/, "indica la hora de reinicio");
  assert.equal(f.metadatos(), 1, "tras la respuesta de límite no se consulta ningún otro secreto ni Environment");
  const antes = f.llamadas.length;
  await assert.rejects(() => a.listarCuentas(), (e) => e instanceof ErrorLimiteApi && /límite/i.test(e.message));
  assert.equal(f.llamadas.length, antes, "mientras dura el límite no se llama a la API");
});

test("(límites) un 403 de límite en una lectura obligatoria falla con ErrorLimiteApi y el mensaje claro; al llegar la hora de reinicio se vuelve a consultar", async () => {
  let ahora = Date.parse("2026-09-09T12:00:00Z");
  const reinicio = Math.floor(ahora / 1000) + 600;
  let bloquear = true;
  const f = fetchPorRuta(rutasBase([{ re: /contents\/config\.json\?/, res: () => (bloquear
    ? { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reinicio) }, json: { message: "API rate limit exceeded" } }
    : { status: 200, json: { content: b64({ cuentas: [] }), sha: "g2" } }) }]));
  const a = crearAlmacenGitHub({ token: "github_pat_" + "x".repeat(30), owner: "o", repo: "r", fetchImpl: f.impl, ahora: () => ahora });
  await assert.rejects(() => a.listarCuentas(), (e) => {
    assert.ok(e instanceof ErrorLimiteApi);
    assert.match(e.message, /GitHub limitó/i);
    assert.match(e.message, /\d{1,2}:\d{2}/);
    assert.ok(!e.message.includes("github_pat_"), "el mensaje no incluye el token");
    assert.equal(e.reinicia, new Date(reinicio * 1000).toISOString());
    return true;
  });
  const antes = f.llamadas.length;
  await assert.rejects(() => a.leerArchivo("cuentas/a/config.json"), ErrorLimiteApi);
  assert.equal(f.llamadas.length, antes, "ninguna llamada mientras dura el límite");
  ahora = reinicio * 1000 + 1000;
  bloquear = false;
  const info = await a.listarCuentas();
  assert.deepEqual(info.global, { cuentas: [] });
  assert.equal(info.limite, null);
});

test("(límites) un 429 con retry-after pausa las consultas ese tiempo; un 403 sin cabeceras de límite sigue siendo un error de permiso normal", async () => {
  const ahora = Date.parse("2026-09-09T12:00:00Z");
  const f = fetchPorRuta([{ re: /contents\/config\.json\?/, res: { status: 429, headers: { "retry-after": "45" }, json: { message: "too many requests" } } }]);
  const a = crearAlmacenGitHub({ token: "t", owner: "o", repo: "r", fetchImpl: f.impl, ahora: () => ahora });
  await assert.rejects(() => a.listarCuentas(), (e) => e instanceof ErrorLimiteApi && e.reinicia === new Date(ahora + 45_000).toISOString());
  const g = fetchPorRuta([{ re: /contents\/config\.json\?/, res: { status: 403, json: { message: "Resource not accessible by personal access token" } } }]);
  const b = crearAlmacenGitHub({ token: "t", owner: "o", repo: "r", fetchImpl: g.impl, ahora: () => ahora });
  await assert.rejects(() => b.listarCuentas(), (e) => !(e instanceof ErrorLimiteApi) && /403/.test(e.message));
});

test("(límites) limiteDeRespuesta reconoce solo las respuestas de límite y calcula la hora de reinicio", () => {
  const ahora = Date.parse("2026-09-09T12:00:00Z");
  const res = (status, headers = {}) => ({ status, headers: { get: (k) => headers[k.toLowerCase()] ?? null } });
  assert.equal(limiteDeRespuesta(res(200), ahora), null);
  assert.equal(limiteDeRespuesta(res(403), ahora), null);
  assert.equal(limiteDeRespuesta(res(403, { "x-ratelimit-remaining": "12" }), ahora), null);
  assert.equal(limiteDeRespuesta(res(403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1788700000" }), ahora), 1788700000 * 1000);
  assert.equal(limiteDeRespuesta(res(429, { "retry-after": "30" }), ahora), ahora + 30_000);
  assert.equal(limiteDeRespuesta(res(429), ahora), ahora + 60_000, "sin cabeceras, un minuto de pausa");
  assert.equal(limiteDeRespuesta({ status: 403 }, ahora), null, "respuestas sin cabeceras (fetch simulado) no se confunden con un límite");
});
