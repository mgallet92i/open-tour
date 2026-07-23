// Self-check node : OT.router.parse() contre la table de routing (design.md §3.1).
// Pas de framework — assert stdlib. Usage : node web/router.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const dataSrc = fs.readFileSync(path.join(__dirname, "data.fixture.js"), "utf8");
const routerSrc = fs.readFileSync(path.join(__dirname, "router.js"), "utf8");

const sandbox = {
  window: {
    addEventListener: () => {},
  },
  location: { hash: "" },
  document: { getElementById: () => null },
};
sandbox.window.location = sandbox.location;
vm.createContext(sandbox);
vm.runInContext(dataSrc, sandbox);
vm.runInContext(routerSrc, sandbox);

const parse = sandbox.window.OT.router.parse;

// #/plan et racine
assert.deepEqual(parse(""), { screen: "plan" });
assert.deepEqual(parse("#/"), { screen: "plan" });
assert.deepEqual(parse("#/plan"), { screen: "plan" });

// persona valide / inconnue (fallback plan "Tous")
assert.deepEqual(parse("#/plan/p/dev"), { screen: "plan", persona: "dev" });
assert.deepEqual(parse("#/plan/p/inconnu"), { screen: "plan" });

// uc réel avec étapes -> itinéraire
assert.deepEqual(parse("#/uc/uc-demo"), {
  screen: "itinerary",
  ucId: "uc-demo",
});

// uc fictif sans étape ("bientôt") -> fallback plan (INV-002/INV-004)
assert.deepEqual(parse("#/uc/uc-soon"), { screen: "plan" });

// uc inconnu -> fallback plan (TF-020)
assert.deepEqual(parse("#/uc/inexistant"), { screen: "plan" });

// étape valide
assert.deepEqual(parse("#/uc/uc-demo/step/2"), {
  screen: "step",
  ucId: "uc-demo",
  stepIdx: 2,
});

// étape hors bornes -> fallback itinéraire (TF-020)
assert.deepEqual(parse("#/uc/uc-demo/step/999"), {
  screen: "itinerary",
  ucId: "uc-demo",
});

// uc absent + step -> fallback plan
assert.deepEqual(parse("#/uc/inexistant/step/0"), { screen: "plan" });

// fix RV : route() ferme une modale .overlay (drilldown.js) encore ouverte à la navigation
// (back/forward/hashchange) — INV-006 inchangé, la modale s'ouvre toujours normalement.
const overlay = { removed: false, remove() { this.removed = true; } };
sandbox.document.querySelector = (sel) => (sel === ".overlay" ? overlay : null);
sandbox.document.getElementById = (id) => (id === "app" ? { innerHTML: "" } : null);
sandbox.window.OT.screens = { renderPlan: () => {}, renderItinerary: () => {} };
sandbox.window.OT.drilldown = { renderStep: () => {} };
sandbox.location.hash = "";
sandbox.window.OT.router.route();
assert.strictEqual(overlay.removed, true);

console.log("OK : 11/11 assertions router.parse()/route() PASS");
