// Self-check node : logique pure de screens.js (OT.derive, placement DEC-02, dim/dispo).
// Pas de framework — assert stdlib. Le rendu DOM (createElement/SVG) est du ressort
// de la vérification web-ui/chrome-devtools (VALIDATION), pas testable ici sans navigateur.
// Usage : node web/screens.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const dataSrc = fs.readFileSync(path.join(__dirname, "data.fixture.js"), "utf8");
const screensSrc = fs.readFileSync(path.join(__dirname, "screens.js"), "utf8");

const sandbox = { window: {}, document: { getElementById: () => null, createElement: () => ({ style: {} }) } };
vm.createContext(sandbox);
vm.runInContext(dataSrc, sandbox);
vm.runInContext(screensSrc, sandbox);

const OT = sandbox.window.OT;
const uc = sandbox.window.OPENTOUR_DATA.usecases.usecases.find((u) => u.id === "uc-demo");
const soon = sandbox.window.OPENTOUR_DATA.usecases.usecases.find((u) => u.id === "uc-soon");

// TF-006 : méta dérivée (EX-008)
assert.strictEqual(OT.derive.stepCount(uc), 5);
assert.strictEqual(OT.derive.moduleCount(uc), 10);
assert.strictEqual(OT.derive.testFileCount(uc), 8);

// INV-002 : dispo / bientôt
assert.strictEqual(OT._internal.isAvailable(uc), true);
assert.strictEqual(OT._internal.isAvailable(soon), false);

// DEC-04 : dim = pas dispo OU hors-persona filtré ; jamais masqué (juste un flag)
assert.strictEqual(OT._internal.isDimmed(uc, null), false);
assert.strictEqual(OT._internal.isDimmed(uc, "dev"), false);
assert.strictEqual(OT._internal.isDimmed(uc, "ops"), true); // uc.persona === "dev"
assert.strictEqual(OT._internal.isDimmed(soon, null), true); // sans étape -> toujours dim

// DEC-02 : équi-répartition des jalons — départ 0, destination 1, i=0..n-1 entre les deux
assert.strictEqual(OT._internal.milestoneFraction(0, 5), 1 / 6);
assert.strictEqual(OT._internal.milestoneFraction(4, 5), 5 / 6);
assert.strictEqual(OT._internal.milestoneFraction(0, 1), 1 / 2);

console.log("OK : 9/9 assertions screens.js (logique pure) PASS");
