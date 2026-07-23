// Self-check node : wiring index.html (TF-021/024) + boot file:// sans crash.
// Pas de framework — assert stdlib. Usage : node web/index.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execSync } = require("child_process");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

// TF-024 : zéro dépendance runtime / CDN — aucune ressource http(s) distante, pas d'ES module.
assert.strictEqual((html.match(/(src|href)=["'](https?:)?\/\//g) || []).length, 0);
assert.strictEqual(/type=["']module["']/.test(html), false);

// Ordre des scripts classiques (design.md §6) : data -> drilldown -> screens -> router (boot).
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
assert.deepStrictEqual(scripts, ["data.js", "drilldown.js", "screens.js", "router.js"]);

// tokens.css + app.css en <link>, host #app présent.
const links = [...html.matchAll(/<link[^>]*href="([^"]+)"/g)].map((m) => m[1]);
assert.deepStrictEqual(links, ["tokens.css", "app.css"]);
assert.ok(/<main id="app">/.test(html));

// TF-021 : pipeline/ intouché (diff vide).
const pipelineDiff = execSync("git diff --stat -- pipeline/", { cwd: path.join(__dirname, "..") }).toString();
assert.strictEqual(pipelineDiff.trim(), "");

// Boot file:// simulé (DOM minimal) : aucune exception, écran rendu sur hash vide (fallback plan).
class FakeEl {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.style = { setProperty() {} };
    this._html = "";
    this.classList = { add() {}, remove() {}, contains() { return false; } };
  }
  set innerHTML(v) { this._html = v; }
  get innerHTML() { return this._html; }
  appendChild(c) { this.children.push(c); return c; }
  append(...c) { c.forEach((x) => this.children.push(x)); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  addEventListener() {}
  setAttribute() {}
}
const appEl = new FakeEl("main");
const doc = {
  getElementById: (id) => (id === "app" ? appEl : null),
  querySelector: () => null,
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
assert.ok(appEl.children.length > 0, "l'écran plan doit se rendre sur hash vide (fallback INV-004)");

console.log("OK : 8/8 assertions index.html wiring PASS");
