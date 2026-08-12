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

// Ordre des scripts classiques : data (données) -> nav (boot).
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
assert.deepStrictEqual(scripts, ["data.js", "nav.js"]);

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
  addEventListener() {}
  setAttribute() {}
}
const hosts = { nav: new FakeEl("aside"), view: new FakeEl("main") };
const tree = new FakeEl("nav");
const doc = {
  getElementById: (id) => hosts[id] || null,
  querySelector: (sel) => (sel === "#nav .tree" ? tree : new FakeEl("div")),
  createElement: (t) => new FakeEl(t),
  createTextNode: (t) => ({ text: t }),
  addEventListener: () => {},
};
const win = {
  addEventListener: (evt, fn) => { if (evt === "load") win._load = fn; },
  requestAnimationFrame: (fn) => fn(),
  location: { hash: "" },
};
const sandbox = { window: win, document: doc, location: win.location, requestAnimationFrame: win.requestAnimationFrame };
vm.createContext(sandbox);
scripts.forEach((f) => vm.runInContext(fs.readFileSync(path.join(__dirname, f === "data.js" ? "data.fixture.js" : f), "utf8"), sandbox));
assert.doesNotThrow(() => sandbox.window._load());
assert.ok(tree.children.length > 0, "la sidebar doit lister au moins un groupe");
assert.ok(hosts.view.children.length > 0, "la vue doit afficher le placeholder sur hash vide");

// parse() : hash inconnu -> accueil ; hash valide -> ucId.
const { parse } = sandbox.window.OT.nav;
// (les objets viennent du realm vm : comparer les valeurs, pas les prototypes)
assert.strictEqual(parse("#/n-importe-quoi").ucId, undefined);
assert.strictEqual(parse("#/uc/inconnu").ucId, undefined);
const firstUc = sandbox.window.OPENTOUR_DATA.usecases.usecases[0].id;
assert.strictEqual(parse("#/uc/" + firstUc).ucId, firstUc);

console.log("OK : 12/12 assertions shell (index.html + nav.js) PASS");
