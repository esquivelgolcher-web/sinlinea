import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { generarLogo } from "../src/logo.mjs";
import { abrirNavegador } from "../src/lib/render.mjs";

let navegador;
before(async () => { navegador = await abrirNavegador(); });
after(async () => { await navegador?.close(); });

function hex(c) { return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); }
function cerca(pixel, color, tol = 12) { return pixel.every((v, i) => Math.abs(v - color[i]) <= tol); }

test("(logo) generarLogo produce un PNG cuadrado: fondo del color pedido y letras centradas del color pedido", async () => {
  const salida = path.join("temp", "test-render", "logo-prueba.png");
  const fondo = "#3B2B1F";
  const letra = "#E9E4DA";
  const r = await generarLogo({ texto: "LEG", fondo, letra, tamano: 512, salida, navegador });
  assert.equal(r.ruta, salida);
  assert.equal(fs.existsSync(salida), true);
  const { data, info } = await sharp(salida).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 512);
  assert.equal(info.height, 512);
  const px = (x, y) => Array.from(data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3));
  assert.ok(cerca(px(4, 4), hex(fondo)), `la esquina es del color de fondo: ${px(4, 4)}`);
  assert.ok(cerca(px(507, 507), hex(fondo)), "la esquina opuesta también");
  // En la fila central hay letras: píxeles del color de la letra que ocupan entre el 55 % y el 80 % del ancho, centrados.
  const y = 256;
  const xs = [];
  for (let x = 0; x < 512; x++) if (cerca(px(x, y), hex(letra), 40)) xs.push(x);
  assert.ok(xs.length > 40, `hay letras en la fila central (${xs.length} píxeles)`);
  const ancho = xs[xs.length - 1] - xs[0];
  assert.ok(ancho >= 512 * 0.55 && ancho <= 512 * 0.8, `las letras ocupan ~2/3 del ancho: ${ancho}`);
  const centro = (xs[0] + xs[xs.length - 1]) / 2;
  assert.ok(Math.abs(centro - 256) <= 10, `las letras están centradas horizontalmente: ${centro}`);
  // Y verticalmente: la columna central tiene letra tanto arriba como abajo del centro, a distancias parecidas.
  const ys = [];
  for (let yy = 0; yy < 512; yy++) if (cerca(px(256, yy), hex(letra), 40)) ys.push(yy);
  assert.ok(ys.length > 20, "hay letra en la columna central");
  assert.ok(Math.abs((ys[0] + ys[ys.length - 1]) / 2 - 256) <= 14, `las letras están centradas verticalmente: ${(ys[0] + ys[ys.length - 1]) / 2}`);
  fs.rmSync(salida, { force: true });
});
