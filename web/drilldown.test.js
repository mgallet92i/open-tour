// Self-check node : helpers purs de OT.drilldown (pas de DOM/jsdom dispo,
// projet zero-dependency EX-020). Usage : node web/drilldown.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const dataSrc = fs.readFileSync(path.join(__dirname, "data.fixture.js"), "utf8");
const drillSrc = fs.readFileSync(path.join(__dirname, "drilldown.js"), "utf8");

const sandbox = {
  window: { addEventListener: () => {}, fetch: () => Promise.reject(new Error("no fetch in test")) },
  document: { getElementById: () => null },
};
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(dataSrc, sandbox);
vm.runInContext(drillSrc, sandbox);

const internal = sandbox.window.OT.drilldown._internal;

// --- navState : bornes prev/next (EX-010) ---
assert.deepEqual(internal.navState(0, 5), { prevDisabled: true, nextDisabled: false });
assert.deepEqual(internal.navState(2, 5), { prevDisabled: false, nextDisabled: false });
assert.deepEqual(internal.navState(4, 5), { prevDisabled: false, nextDisabled: true });
assert.deepEqual(internal.navState(0, 1), { prevDisabled: true, nextDisabled: true });

// --- resolveNodes : INV-003, un id absent du graphe est ignoré silencieusement ---
const graph = sandbox.window.OPENTOUR_DATA.graph;
const realId = Object.keys(graph)[0];
const resolved = internal.resolveNodes([realId, "id-inexistant-xyz"], graph);
assert.strictEqual(resolved.length, 1, "l'id absent du graphe doit être filtré, pas planter");
assert.strictEqual(resolved[0].id, realId);

const resolvedNone = internal.resolveNodes(["a", "b"], graph);
assert.deepEqual(resolvedNone, [], "aucun crash si tous les ids sont absents");

// --- fetchSource : INV-006, échec fetch -> content=null (pas de throw) ---
(async () => {
  const failFetch = () => Promise.reject(new Error("network down"));
  const content1 = await internal.fetchSource("web/foo.js", failFetch);
  assert.strictEqual(content1, null, "fetch KO -> null, jamais de throw");

  const notOkFetch = () => Promise.resolve({ ok: false, status: 404 });
  const content2 = await internal.fetchSource("web/foo.js", notOkFetch);
  assert.strictEqual(content2, null, "réponse !ok -> null");

  const okFetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ content: "const x = 1;" }) });
  const content3 = await internal.fetchSource("web/foo.js", okFetch);
  assert.strictEqual(content3, "const x = 1;", "réponse ok -> content transmis");

  // --- collectRules : groupement fichier->symbole + filtrage + cas vide ---
  const rulesGraph = internal.collectRules(internal.resolveNodes(["file:src/a.py"], graph));
  assert.strictEqual(rulesGraph.length, 1, "un node porteur -> un groupe fichier");
  assert.strictEqual(rulesGraph[0].file, "src/a.py");
  assert.ok(rulesGraph[0].fileRules.length >= 1, "règles de niveau fichier collectées");
  assert.strictEqual(rulesGraph[0].symbols.length, 1, "seul le symbole porteur de règle apparaît");
  assert.strictEqual(rulesGraph[0].symbols[0].label, "Lance le module A");
  assert.ok(rulesGraph[0].symbols[0].rules.length >= 1, "règles du symbole collectées");

  // filtrage : fichier sans règle fichier ni symbole porteur -> omis (sortie vide)
  const noRules = internal.collectRules([
    { id: "x", node: { filePath: "src/x.py", symbols: [{ name: "f", summary: "s" }] } },
  ]);
  assert.deepEqual(noRules, [], "aucune règle sur le node/symbole -> groupe omis");

  // cas « aucune règle » : entrée vide -> sortie vide (masque le bouton)
  assert.deepEqual(internal.collectRules([]), [], "collectRules([]) -> []");

  // --- contrat public OT.drilldown (design.md §3.2) ---
  assert.strictEqual(typeof sandbox.window.OT.drilldown.renderStep, "function");
  assert.strictEqual(typeof sandbox.window.OT.drilldown.openSource, "function");

  console.log("OK : 20/20 assertions drilldown PASS");
})();
