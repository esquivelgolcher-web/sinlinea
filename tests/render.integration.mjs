import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { abrirNavegador, renderizarPost } from "../src/lib/render.mjs";
import { cargarConfig } from "../src/lib/config.mjs";

const cfg = cargarConfig("config.json");
const base = JSON.parse(fs.readFileSync("tests/fixtures/post-ejemplo.json", "utf8"));
let navegador;
before(async () => { navegador = await abrirNavegador(); });
after(async () => { await navegador?.close(); });

for (const variante of ["negro", "amarillo", "rojo"]) {
  test(`renderiza la variante ${variante} como JPEG 1080x1350 menor a 1 MB`, async () => {
    const post = { ...base, variante };
    const destino = path.join("temp", "test-render", `${variante}.jpg`);
    const img = await renderizarPost(post, { config: cfg, navegador, destino });
    const meta = await sharp(img.ruta).metadata();
    assert.equal(meta.format, "jpeg");
    assert.equal(meta.width, 1080);
    assert.equal(meta.height, 1350);
    assert.ok(fs.statSync(img.ruta).size < 1024 * 1024);
    assert.equal(img.version, 3);
    assert.match(img.hash, /^[0-9a-f]{16}$/);
  });
}

test("un titular muy largo se reduce pero no desborda (no lanza)", async () => {
  const post = { ...base, titular: "Un titular exageradamente largo que obliga a la plantilla a reducir el tamaño de la letra varias veces hasta que quepa bien" };
  const img = await renderizarPost(post, { config: cfg, navegador, destino: path.join("temp", "test-render", "largo.jpg") });
  assert.ok(fs.existsSync(img.ruta));
});
