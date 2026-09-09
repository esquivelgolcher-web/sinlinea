import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parse } from "yaml";
import { cargarConfiguracion } from "../src/lib/config.mjs";
import { nombresDeSecretos } from "../src/lib/secretos.mjs";

const leer = (n) => fs.readFileSync(`.github/workflows/${n}.yml`, "utf8");
const wf = (n) => parse(leer(n));

test("los cuatro workflows comparten el grupo de concurrencia sinlinea", () => {
  for (const n of ["generar", "regenerar", "publicar", "renovar-token"]) {
    assert.equal(wf(n).concurrency.group, "sinlinea", n);
    assert.equal(wf(n).concurrency["cancel-in-progress"], false, n);
  }
});

test("disparadores y secretos de cada workflow", () => {
  const g = wf("generar");
  assert.equal(g.on.schedule[0].cron, "20 */3 * * *");
  assert.ok(g.on.push["paths-ignore"].includes("posts/**"));
  assert.ok(g.on.push["paths-ignore"].includes("public/ilus/**"), "generar (M3) debe ignorar public/ilus/**");
  assert.match(leer("generar"), /secrets\.ANTHROPIC_API_KEY/);
  const r = wf("regenerar");
  assert.ok(r.on.push.paths.includes("posts/**"));
  assert.equal(r.on.schedule[0].cron, "40 * * * *");
  const p = wf("publicar");
  assert.equal(p.on.schedule[0].cron, "*/30 * * * *");
  assert.match(leer("publicar"), /secrets\.IG_ACCESS_TOKEN/);
  assert.match(leer("publicar"), /secrets\.IG_USER_ID/);
  const t = wf("renovar-token");
  assert.equal(t.on.schedule[0].cron, "0 14 * * 1");
  assert.match(leer("renovar-token"), /secrets\.GH_PAT/);
  assert.match(leer("renovar-token"), /gh secret set "\$nombre" --repo/, "(modo actual) guarda el token en el secreto de repositorio con el nombre declarado por la cuenta");
  assert.match(leer("renovar-token"), /gh secret set IG_ACCESS_TOKEN --env "\$ENTORNO"/, "(fase 2) guarda el token en el Environment de la cuenta");
  assert.match(leer("renovar-token"), /temp\/nuevo-token-IG_ACCESS_TOKEN\.txt/, "el orquestador por cuenta deja el token con el nombre fijo");
});

test("generar y regenerar despliegan Pages; publicar y renovar solo escriben en el repo", () => {
  for (const n of ["generar", "regenerar"]) {
    assert.match(leer(n), /actions\/deploy-pages@v4/, n);
    assert.equal(wf(n).permissions.pages, "write", n);
  }
  for (const n of ["publicar", "renovar-token"]) {
    assert.ok(!leer(n).includes("deploy-pages"), n);
    assert.equal(wf(n).permissions.contents, "write", n);
  }
});

test("el reintento de push falla el paso cuando los tres intentos fallan", () => {
  for (const n of ["generar", "regenerar", "publicar", "renovar-token"]) {
    const texto = leer(n);
    assert.match(texto, /if \[ "\$i" = 3 \]; then echo "No se pudo hacer push tras 3 intentos"; exit 1; fi/, n);
    assert.ok(!texto.includes("&& break || sleep 5"), `${n} aún tiene el bucle antiguo`);
  }
});

test("regenerar recibe ANTHROPIC_API_KEY para acortar titulares que no caben", () => {
  assert.match(leer("regenerar"), /secrets\.ANTHROPIC_API_KEY/);
});

test("generar y regenerar reciben GEMINI_API_KEY y guardan public/ilus", () => {
  for (const n of ["generar", "regenerar"]) {
    assert.match(leer(n), /secrets\.GEMINI_API_KEY/, n);
    assert.match(leer(n), /git add posts public\/img public\/ilus/, n);
  }
});

test("probar-gemini es manual, solo lee y usa el secreto GEMINI_API_KEY", () => {
  const w = wf("probar-gemini");
  assert.ok(w.on.workflow_dispatch !== undefined);
  assert.equal(w.permissions.contents, "read");
  assert.match(leer("probar-gemini"), /secrets\.GEMINI_API_KEY/);
});

test("(M0) renovar-token comprueba GH_PAT antes de pedir un token nuevo", () => {
  const texto = leer("renovar-token");
  const comprobar = texto.indexOf("GH_PAT");
  const pedir = texto.indexOf("node src/renovar-token.mjs");
  assert.ok(comprobar >= 0 && pedir >= 0 && comprobar < pedir, "la comprobación de GH_PAT va antes de pedir el token");
  const w = wf("renovar-token");
  const pasos = w.jobs.cuentas.steps.map((s) => s.name);
  assert.ok(pasos.some((n) => /GH_PAT/.test(n)), "el job cuentas (del que dependen los demás) comprueba GH_PAT");
  for (const j of ["renovar-entorno", "renovar-repositorio"]) assert.ok(w.jobs[j].needs.includes("cuentas"), j);
});

test("(M0) verificar es manual, solo lectura, expone los secretos compartidos en su job y los de Instagram en el job de cada cuenta", () => {
  const v = wf("verificar");
  assert.deepEqual(Object.keys(v.on), ["workflow_dispatch"]);
  assert.equal(v.permissions.contents, "read");
  const texto = leer("verificar");
  for (const s of ["ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GH_PAT"]) assert.match(texto, new RegExp(`secrets\\.${s}`), s);
  assert.match(texto, /node src\/verificar\.mjs --solo-compartido/);
  assert.match(texto, /node src\/verificar\.mjs --cuenta "\$CUENTA" --por-cuenta/);
  assert.equal(/upload-artifact/.test(texto), false);
  assert.equal(/git push/.test(texto), false);
});

const WORKFLOWS_IG = { publicar: "publicar", "renovar-token": "renovar", "probar-instagram": "probar", verificar: "verificar", metricas: "metricas" };

test("(fase 2) los workflows de Instagram no nombran cuentas: un job por cuenta a partir de config.json, con las credenciales de su origen y solo las suyas", () => {
  const { cuentas } = cargarConfiguracion(".");
  assert.ok(cuentas.length >= 2);
  for (const [archivo, prefijo] of Object.entries(WORKFLOWS_IG)) {
    const texto = leer(archivo);
    const w = wf(archivo);
    for (const c of cuentas) {
      const n = nombresDeSecretos(c);
      for (const nombre of [n.token, n.usuarioId]) {
        if (["IG_ACCESS_TOKEN", "IG_USER_ID"].includes(nombre)) continue;
        assert.equal(texto.includes(nombre), false, `${archivo} no debe nombrar el secreto ${nombre} de la cuenta ${c.cuenta}`);
      }
    }
    const lista = archivo === "verificar" ? "verificar" : "cuentas";
    assert.match(texto, /node src\/cuentas-activas\.mjs/, `${archivo} construye la matriz con cuentas-activas`);
    const entorno = w.jobs[`${prefijo}-entorno`];
    const repositorio = w.jobs[`${prefijo}-repositorio`];
    assert.ok(entorno && repositorio, `${archivo}: jobs ${prefijo}-entorno y ${prefijo}-repositorio`);
    for (const [nombre, job] of [["entorno", entorno], ["repositorio", repositorio]]) {
      assert.equal(job.strategy["fail-fast"], false, `${archivo} ${nombre}: un fallo de una cuenta no cancela a las demás`);
      assert.equal(job.strategy["max-parallel"], 1, `${archivo} ${nombre}: un job a la vez para no pisar los push del bot`);
      assert.equal(job.strategy.matrix.include, "${{ fromJSON(needs." + lista + ".outputs." + nombre + ") }}", `${archivo} ${nombre}: matriz desde la salida ${nombre}`);
      assert.deepEqual(Object.keys(job.env).filter((k) => k.startsWith("IG_")), ["IG_ACCESS_TOKEN", "IG_USER_ID"], `${archivo} ${nombre}: solo dos credenciales con nombre fijo`);
      assert.ok(job.steps.some((st) => /--cuenta "\$CUENTA" --por-cuenta/.test(st.run || "")), `${archivo} ${nombre}: ejecución por cuenta`);
    }
    assert.equal(entorno.environment, "${{ matrix.entorno }}", `${archivo}: el job de entorno usa el Environment de la cuenta`);
    assert.equal(entorno.env.IG_ACCESS_TOKEN, "${{ secrets.IG_ACCESS_TOKEN }}");
    assert.equal(entorno.env.IG_USER_ID, "${{ secrets.IG_USER_ID }}");
    assert.ok(entorno.steps.some((st) => /Environment de la cuenta está completo/.test(st.name || "")), `${archivo}: el job de entorno falla si su Environment no está completo`);
    assert.equal(repositorio.env.IG_ACCESS_TOKEN, "${{ secrets[matrix.tokenSecreto] }}", `${archivo}: modo actual con el nombre declarado por la cuenta`);
    assert.equal(repositorio.env.IG_USER_ID, "${{ secrets[matrix.usuarioIdSecreto] }}");
    assert.equal(repositorio.environment, undefined, `${archivo}: el job de modo actual no usa entornos`);
    assert.ok(repositorio.needs.includes(`${prefijo}-entorno`) && /always\(\)/.test(repositorio.if), `${archivo}: el job de modo actual corre después del de entorno aunque este falle`);
    assert.ok(entorno.if.includes("!= '[]'") && repositorio.if.includes("!= '[]'"), `${archivo}: sin cuentas de un origen, ese job se omite`);
  }
});

test("(fase 2) el job cuentas comprueba los Environments por la API con GH_PAT y el job de entorno falla antes de Instagram si su matriz no dice completo; ninguna huella de valores", () => {
  for (const [archivo, prefijo] of Object.entries(WORKFLOWS_IG)) {
    const texto = leer(archivo);
    const w = wf(archivo);
    assert.equal(/sha256sum|huella/.test(texto), false, `${archivo}: no se comparan huellas de secretos`);
    assert.equal(/comprobar-entorno\.sh/.test(texto), false, `${archivo}: sin script de huellas`);
    const lista = archivo === "verificar" ? "verificar" : "cuentas";
    const pasoLista = w.jobs[lista].steps.find((st) => st.id === "lista");
    assert.ok(pasoLista, `${archivo}: paso lista`);
    assert.match(pasoLista.run, /--comprobar-entornos/, `${archivo}: comprueba los Environments por la API`);
    assert.equal(pasoLista.env.GH_TOKEN, "${{ secrets.GH_PAT }}", `${archivo}: la comprobación usa GH_PAT (permiso Environments: lectura)`);
    const entorno = w.jobs[`${prefijo}-entorno`];
    const guardia = entorno.steps.find((st) => /Environment de la cuenta está completo/.test(st.name || ""));
    assert.ok(guardia, `${archivo}: paso de comprobación en el job de entorno`);
    assert.equal(guardia.env.COMPLETO, "${{ matrix.completo }}");
    assert.match(guardia.run, /exit 1/);
    const indiceGuardia = entorno.steps.indexOf(guardia);
    const indiceNode = entorno.steps.findIndex((st) => /node src\//.test(st.run || ""));
    assert.ok(indiceGuardia < indiceNode, `${archivo}: la comprobación va antes de contactar con Instagram`);
    assert.deepEqual(Object.keys(entorno.env).filter((k) => !["CUENTA", "ENTORNO"].includes(k)), ["IG_ACCESS_TOKEN", "IG_USER_ID"], `${archivo}: el job de entorno no recibe GH_PAT ni credenciales de otras cuentas`);
  }
});

test("(M2) probar-instagram es manual, acepta la cuenta como entrada y solo guarda data/<cuenta>/", () => {
  const v = wf("probar-instagram");
  assert.deepEqual(Object.keys(v.on), ["workflow_dispatch"]);
  assert.ok(v.on.workflow_dispatch.inputs.cuenta, "entrada cuenta");
  assert.equal(v.permissions.contents, "write", "(vigencia) guarda data/<cuenta>/token-info.json con la caducidad real o desconocida");
  const texto = leer("probar-instagram");
  assert.match(texto, /node src\/probar-instagram\.mjs/);
  assert.equal(/upload-artifact/.test(texto), false);
  assert.match(texto, /git add data\b/);
  assert.equal(/git add (posts|public|cuentas|src)/.test(texto), false, "solo escribe en data/");
  assert.equal(/run:.*\$\{\{\s*inputs\./.test(texto), false, "(M2 fix) la entrada va por env, no interpolada en run:");
  assert.match(texto, /CUENTA: \$\{\{ inputs\.cuenta \}\}/);
  assert.match(texto, /if: always\(\)/, "guarda conexion.json también cuando la prueba falla");
});

test("(métricas) metricas.yml: diario y manual (cuenta, guardar), solo lectura en Instagram, escribe únicamente data/<cuenta>/metricas y respeta metricas.recoger en las corridas programadas", () => {
  const w = wf("metricas");
  const texto = leer("metricas");
  assert.equal(w.on.schedule[0].cron, "30 5 * * *", "una vez al día, 00:30 de Panamá");
  assert.ok(w.on.workflow_dispatch.inputs.cuenta, "entrada cuenta");
  assert.equal(w.on.workflow_dispatch.inputs.guardar.default, "false", "manual: por defecto solo sonda, sin guardar");
  assert.equal(w.permissions.contents, "write");
  assert.equal(w.concurrency.group, "sinlinea");
  assert.equal(w.concurrency["cancel-in-progress"], false);
  for (const j of ["metricas-entorno", "metricas-repositorio"]) assert.equal(w.jobs[j]["timeout-minutes"], 10, `${j}: una cuenta lenta no bloquea el día`);
  const lista = w.jobs.cuentas.steps.find((st) => st.id === "lista");
  assert.match(lista.run, /--solo-metricas/, "las corridas programadas solo incluyen cuentas con metricas.recoger = true");
  assert.match(texto, /node src\/metricas\.mjs --cuenta "\$CUENTA" --por-cuenta/);
  assert.match(texto, /--sin-guardar/, "guardar=false ejecuta la sonda");
  assert.match(texto, /git add "data\/\$CUENTA\/metricas"/, "solo se guardan las métricas de esa cuenta");
  assert.equal(/git add (posts|public|cuentas|src|data)/.test(texto), false, "nunca posts/ ni todo data/");
  assert.equal(/run:.*\$\{\{\s*inputs\./.test(texto), false, "las entradas van por env, no interpoladas en run:");
  assert.equal(/ANTHROPIC_API_KEY|GEMINI_API_KEY/.test(texto), false, "sin Claude ni Gemini");
  assert.equal(/media_publish|publicar\.mjs/.test(texto), false, "no publica");
});
