import { test } from "node:test";
import assert from "node:assert/strict";
import { base64Utf8, desdeBase64Utf8, deducirRepo } from "../panel/almacen.mjs";

test("base64 ida y vuelta con tildes y ñ", () => {
  const t = '{"titular":"Panamá ñ ¿qué?"}';
  assert.equal(desdeBase64Utf8(base64Utf8(t)), t);
});

test("deducirRepo lee owner y repo de la URL de Pages", () => {
  assert.deepEqual(deducirRepo({ hostname: "luis.github.io", pathname: "/sinlinea/panel/" }), { owner: "luis", repo: "sinlinea" });
  assert.equal(deducirRepo({ hostname: "localhost", pathname: "/panel/" }), null);
  assert.equal(deducirRepo({ hostname: "www.sinlinea.news", pathname: "/panel/" }), null);
});
