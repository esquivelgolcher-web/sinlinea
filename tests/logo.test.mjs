import { test } from "node:test";
import assert from "node:assert/strict";
import { opcionesDeLogo } from "../src/logo.mjs";
import { cargarConfiguracion } from "../src/lib/config.mjs";

const personal = cargarConfiguracion(".").cuentas.find((c) => c.cuenta === "luiseskivelgolcher");

test("(logo) opcionesDeLogo toma por defecto las iniciales y los colores oscuro/principal de la cuenta", () => {
  assert.deepEqual(opcionesDeLogo(personal, {}), {
    texto: "LEG",
    fondo: personal.marca.colores.oscuro,
    letra: personal.marca.colores.principal,
    tamano: 1024,
    salida: "cuentas/luiseskivelgolcher/logo.png",
  });
});

test("(logo) opcionesDeLogo admite sobreescribir texto, colores, tamaño y salida, y rechaza colores que no sean #RRGGBB", () => {
  const claro = opcionesDeLogo(personal, { texto: "LE", fondo: "#FFFFFF", letra: "#111111", tamano: "512", salida: "cuentas/luiseskivelgolcher/logo-claro.png" });
  assert.deepEqual(claro, { texto: "LE", fondo: "#FFFFFF", letra: "#111111", tamano: 512, salida: "cuentas/luiseskivelgolcher/logo-claro.png" });
  assert.throws(() => opcionesDeLogo(personal, { fondo: "blanco" }), /fondo/);
  assert.throws(() => opcionesDeLogo(personal, { letra: "#FFF" }), /letra/);
  assert.throws(() => opcionesDeLogo(personal, { tamano: "0" }), /tamano/);
  assert.throws(() => opcionesDeLogo(personal, { texto: "" }), /texto/);
});
