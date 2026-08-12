// Self-check node du tokenizer OT.code — assert stdlib, pas de framework.
// Usage : node web/code.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sandbox = { window: {}, document: {}, fetch: () => {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, "code.js"), "utf8"), sandbox);
const { tokenizeLine, langOf } = sandbox.window.OT.code;

const types = (line, lang, state) => tokenizeLine(line, lang, state || { block: null }).map((t) => t[0]).join(",");
const texts = (line, lang, state) => tokenizeLine(line, lang, state || { block: null }).map((t) => t[1]);

const ts = langOf("admin.ts");
const py = langOf("scan.py");
const sql = langOf("q.sql");

// Reconstitution intégrale : la concaténation des tokens doit rendre la ligne
// d'origine, sinon le visualiseur afficherait du code faux.
[
  ["const x = 42; // note", ts],
  ["s = 'a\\'b' + \"c\"", ts],
  ["# tout en commentaire", py],
  ["def f(a, b):", py],
  ["SELECT * FROM t -- fin", sql],
  ["", ts],
  ["   \t  ", ts],
].forEach(([line, lang]) => {
  assert.strictEqual(texts(line, lang).join(""), line, "perte de caractères sur : " + JSON.stringify(line));
});

// Mots-clés, nombres, chaînes, commentaires de fin de ligne.
assert.strictEqual(types("const x = 42; // note", ts), "kw,plain,num,plain,com");
assert.strictEqual(types("# rien", py), "com");
assert.strictEqual(types("-- juste un commentaire", sql), "com");

// Un mot-clé n'est reconnu que sur un mot entier (`constant` n'est pas `const`).
assert.ok(!types("constant = 1", ts).split(",").includes("kw"), "`constant` ne doit pas être colorié en mot-clé");

// Nombre collé à un identifiant : `a1` reste du texte, pas un nombre.
assert.ok(texts("a1 = 2", ts).join("") === "a1 = 2");

// Chaîne non terminée : consommée jusqu'au bout de la ligne, sans exception.
assert.strictEqual(types('x = "pas fermé', ts), "plain,str");

// Commentaire de bloc multi-lignes : l'état est porté d'une ligne à l'autre.
const state = { block: null };
assert.strictEqual(types("/* debut", ts, state), "com");
assert.ok(state.block, "le bloc doit rester ouvert");
assert.strictEqual(types("toujours dedans", ts, state), "com");
assert.ok(state.block);
const closing = tokenizeLine("fin */ const y = 1;", ts, state);
assert.strictEqual(state.block, null, "le bloc doit se refermer sur */");
assert.strictEqual(closing[0][0], "com");
assert.ok(closing.some((t) => t[0] === "kw"), "le code après */ doit être colorié normalement");

// Python n'a pas de commentaire de bloc /* */ : la ligne reste du texte.
assert.ok(!types("/* pas un commentaire python */", py).split(",").includes("com"));

// Docstring Python : bloc """ ... """ porté sur plusieurs lignes, colorié en
// chaîne — sinon la prose se fait coloriser comme du code (True, global, guillemets).
const pyState = { block: null };
assert.strictEqual(types('"""Docstring ouvrant', py, pyState), "str");
assert.ok(pyState.block, "le docstring doit rester ouvert");
assert.strictEqual(types("True global ' guillemet", py, pyState), "str", "la prose du docstring reste une chaine");
assert.strictEqual(types('fin """', py, pyState), "str");
assert.strictEqual(pyState.block, null, "le docstring doit se refermer");
// Docstring d'une seule ligne : ouvert et ferme sur place, l'etat reste propre.
const oneLine = { block: null };
assert.strictEqual(types('"""resume."""', py, oneLine), "str");
assert.strictEqual(oneLine.block, null);

// Extension inconnue : aucun style de commentaire, aucune exception.
const unknown = langOf("fichier.zzz");
assert.strictEqual(unknown.line, null);
assert.strictEqual(texts("// pas un commentaire ici", unknown).join(""), "// pas un commentaire ici");

console.log("OK : 27/27 assertions tokenizer code.js PASS");
