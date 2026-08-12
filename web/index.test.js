// Self-check node : wiring index.html + boot du shell sans crash.
// Pas de framework — assert stdlib. Usage : node web/index.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

// Zéro dépendance runtime / CDN — aucune ressource http(s) distante, pas d'ES module.
assert.strictEqual((html.match(/(src|href)=["'](https?:)?\/\//g) || []).length, 0);
assert.strictEqual(/type=["']module["']/.test(html), false);

// Ordre des scripts classiques : data (données) -> écrans -> nav (routing + boot).
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
assert.deepStrictEqual(scripts, ["data.js", "personas.js", "usecase.js", "nav.js"]);

// Feuilles de style et hôtes du shell.
const links = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
assert.deepStrictEqual(links, ["tokens.css", "shell.css"]);
assert.ok(/<aside id="nav">/.test(html), "hôte sidebar #nav manquant");
assert.ok(/<main id="view">/.test(html), "hôte principal #view manquant");

// Boot simulé (DOM factice) : aucune exception, sidebar et vue peuplées sur hash vide.
class FakeEl {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.style = { setProperty() {} };
    this._html = "";
    this.textContent = "";
    this.value = "";
  }
  set innerHTML(v) { this._html = v; if (v === "") this.children = []; }
  get innerHTML() { return this._html; }
  appendChild(c) { this.children.push(c); return c; }
  querySelector() { return new FakeEl("div"); }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  addEventListener() {}
  setAttribute() {}
}
const hosts = { nav: new FakeEl("aside"), view: new FakeEl("main") };
const menus = new FakeEl("nav");
const doc = {
  getElementById: (id) => hosts[id] || null,
  querySelector: (sel) => (sel === "#nav .menus" ? menus : new FakeEl("div")),
  createElement: (t) => new FakeEl(t),
  createElementNS: (ns, t) => new FakeEl(t),
  createTextNode: (t) => ({ text: t }),
  addEventListener: () => {},
};
const win = {
  addEventListener: (evt, fn) => { if (evt === "load") win._load = fn; },
  removeEventListener: () => {},
  requestAnimationFrame: (fn) => fn(),
  getComputedStyle: () => ({ getPropertyValue: () => "#000" }),
  location: { hash: "" },
};
const sandbox = {
  window: win,
  document: doc,
  location: win.location,
  requestAnimationFrame: win.requestAnimationFrame,
  getComputedStyle: win.getComputedStyle,
};
vm.createContext(sandbox);
scripts.forEach((f) => vm.runInContext(fs.readFileSync(path.join(__dirname, f === "data.js" ? "data.fixture.js" : f), "utf8"), sandbox));
assert.doesNotThrow(() => sandbox.window._load());
assert.ok(menus.children.length > 0, "la sidebar doit rendre ses sections de menu");
assert.ok(hosts.view.children.length > 0, "la vue doit rendre l'écran Persona sur hash vide");

// parse() : hash inconnu -> écran Persona ; hash valide -> écran ciblé.
const { parse } = sandbox.window.OT.nav;
// (les objets viennent du realm vm : comparer les valeurs, pas les prototypes)
assert.strictEqual(parse("#/n-importe-quoi").screen, "personas");
assert.strictEqual(parse("#/uc/inconnu").screen, "personas");
assert.strictEqual(parse("#/archi").screen, "archi");
const firstUc = sandbox.window.OPENTOUR_DATA.usecases.usecases[0].id;
assert.strictEqual(parse("#/uc/" + firstUc).screen, "usecase");
assert.strictEqual(parse("#/uc/" + firstUc).ucId, firstUc);

// trail() : le dernier segment est toujours la page courante, jamais un lien.
const { trail } = sandbox.window.OT.nav;
const tUc = trail(parse("#/uc/" + sandbox.window.OPENTOUR_DATA.usecases.usecases[0].id));
assert.strictEqual(tUc.length, 3, "fil d'Ariane d'un cas d'usage : Personas > persona > titre");
assert.ok(tUc.slice(0, -1).every((p) => p.hash), "tout segment sauf le dernier doit être cliquable");
assert.strictEqual(tUc[tUc.length - 1].hash, undefined, "le segment courant ne doit pas être un lien");
assert.strictEqual(trail(parse("#/personas")).length, 1);

// Route étape : index valide -> écran step ; index hors bornes -> retour au use case.
const ucWithSteps = sandbox.window.OPENTOUR_DATA.usecases.usecases.find((u) => u.steps.length > 0);
if (ucWithSteps) {
  const rStep = parse("#/uc/" + ucWithSteps.id + "/step/0");
  assert.strictEqual(rStep.screen, "step");
  assert.strictEqual(rStep.stepIdx, 0);
  assert.strictEqual(parse("#/uc/" + ucWithSteps.id + "/step/99").screen, "usecase");
  const tStep = trail(rStep);
  assert.strictEqual(tStep.length, 4, "fil d'Ariane d'une étape : Personas > persona > uc > étape");
  assert.ok(tStep.slice(0, -1).every((p) => p.hash), "seul le segment courant est sans lien");
}

// familiesOf() : un persona ne remonte que ses propres cas d'usage.
const { familiesOf } = sandbox.window.OT.personas;
const p0 = sandbox.window.OPENTOUR_DATA.usecases.personas[0].id;
const fams = familiesOf(p0);
assert.ok(fams.length > 0, "le premier persona doit avoir au moins une famille");
assert.ok(fams.every((f) => f.ucs.every((u) => u.persona === p0)), "fuite d'un cas d'usage entre personas");

console.log("OK : 25/25 assertions shell (index.html + nav.js + personas.js + usecase.js) PASS");
