import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseFeed, fetchText } from "../src/lib/rss.mjs";

const xml = fs.readFileSync("tests/fixtures/laprensa.xml", "utf8");

test("parseFeed extrae título, enlace, fecha, descripción y content:encoded", () => {
  const items = parseFeed(xml);
  assert.equal(items.length, 2);
  const [a, b] = items;
  assert.equal(a.title, "Bomberos piden más fondos: $22.3 millones quedarían sin cubrir en 2027");
  assert.equal(a.link, "https://www.prensa.com/sociedad/bomberos-piden-mas-fondos/");
  assert.equal(a.pubDate, "Mon, 07 Sep 2026 13:10:00 +0000");
  assert.equal(a.description, "El Cuerpo de Bomberos advirtió que su presupuesto no alcanza.");
  assert.match(a.contenido, /^<p>El Cuerpo de Bomberos/);
  assert.equal(a.image, "https://www.prensa.com/resizer/foto.jpg");
  assert.equal(b.contenido, "");
  assert.equal(b.guid, b.link);
});

test("fetchText reintenta tras un 5xx y devuelve el texto", async () => {
  let llamadas = 0;
  const fetchImpl = async () => {
    llamadas += 1;
    if (llamadas === 1) return new Response("caído", { status: 503 });
    return new Response("<rss/>", { status: 200 });
  };
  const texto = await fetchText("https://ejemplo.test/feed", { fetchImpl, retries: 1 });
  assert.equal(texto, "<rss/>");
  assert.equal(llamadas, 2);
});

test("fetchText lanza un error con el código HTTP al agotar reintentos", async () => {
  const fetchImpl = async () => new Response("no", { status: 404 });
  await assert.rejects(
    () => fetchText("https://ejemplo.test/x", { fetchImpl, retries: 0 }),
    /HTTP 404 en https:\/\/ejemplo\.test\/x/
  );
});
