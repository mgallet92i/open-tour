/* OT.code — visualiseur de code source inline (pas de modale) avec numéros de
   lignes, surlignage d'une plage et coloration syntaxique.

   ponytail: tokenizer maison ~50 lignes (commentaires, chaînes, nombres,
   mots-clés) plutôt qu'une lib vendorisée — l'app est zéro dépendance runtime
   (testé par index.test.js). Un seul jeu de mots-clés, généreux, partagé par
   tous les langages : colorer `def` dans du TS est sans conséquence. Plafond
   assumé : pas de JSX, pas d'interpolation imbriquée, pas de regex littérales.
   Si la précision devient un besoin réel -> vendoriser Prism dans web/vendor/. */
(function () {
  "use strict";

  // Style de commentaires par extension. `block` = [ouvrant, fermant].
  var LANGS = {
    ts: { line: "//", block: ["/*", "*/"] },
    js: { line: "//", block: ["/*", "*/"] },
    mjs: { line: "//", block: ["/*", "*/"] },
    java: { line: "//", block: ["/*", "*/"] },
    cs: { line: "//", block: ["/*", "*/"] },
    go: { line: "//", block: ["/*", "*/"] },
    rs: { line: "//", block: ["/*", "*/"] },
    css: { line: null, block: ["/*", "*/"] },
    cls: { line: "//", block: ["/*", "*/"] },   // Apex
    trigger: { line: "//", block: ["/*", "*/"] },
    py: { line: "#", block: null },
    sh: { line: "#", block: null },
    yml: { line: "#", block: null },
    yaml: { line: "#", block: null },
    toml: { line: "#", block: null },
    sql: { line: "--", block: ["/*", "*/"] },
  };

  var KEYWORDS = new Set((
    "abstract as async await break case catch class const constructor continue def del elif else except " +
    "export extends false final finally for from function global if implements import in instanceof interface " +
    "is lambda let match new none not null or pass private protected public raise return select from where " +
    "static super switch this throw throws true try type typeof var void while with yield and enum readonly " +
    "public_static override virtual namespace using struct impl fn pub mut trait self True False None"
  ).split(" "));

  function langOf(path) {
    var ext = (path || "").split(".").pop().toLowerCase();
    return LANGS[ext] || { line: null, block: null };
  }

  function isWordChar(c) { return /[A-Za-z0-9_$]/.test(c); }

  // tokenizeLine(line, lang, state) -> [[type, text], ...]
  // `state` porte l'état multi-lignes (bloc de commentaire ouvert) et est muté.
  function tokenizeLine(line, lang, state) {
    var out = [], i = 0, plain = "";
    function flush() { if (plain) { out.push(["plain", plain]); plain = ""; } }

    while (i < line.length) {
      if (state.block) {
        var close = lang.block ? lang.block[1] : "*/";
        var idx = line.indexOf(close, i);
        if (idx === -1) { out.push(["com", line.slice(i)]); i = line.length; }
        else { out.push(["com", line.slice(i, idx + close.length)]); i = idx + close.length; state.block = false; }
        continue;
      }

      if (lang.block && line.startsWith(lang.block[0], i)) {
        flush();
        state.block = true;
        continue;
      }

      if (lang.line && line.startsWith(lang.line, i)) {
        flush();
        out.push(["com", line.slice(i)]);
        break;
      }

      var c = line[i];

      if (c === '"' || c === "'" || c === "`") {
        flush();
        var j = i + 1;
        while (j < line.length) {
          if (line[j] === "\\") { j += 2; continue; }
          if (line[j] === c) { j++; break; }
          j++;
        }
        out.push(["str", line.slice(i, j)]);
        i = j;
        continue;
      }

      if (/\d/.test(c) && !(i > 0 && isWordChar(line[i - 1]))) {
        flush();
        var k = i;
        while (k < line.length && /[\w.]/.test(line[k])) k++;
        out.push(["num", line.slice(i, k)]);
        i = k;
        continue;
      }

      if (isWordChar(c)) {
        var w = i;
        while (w < line.length && isWordChar(line[w])) w++;
        var word = line.slice(i, w);
        if (KEYWORDS.has(word)) { flush(); out.push(["kw", word]); }
        else plain += word;
        i = w;
        continue;
      }

      plain += c;
      i++;
    }
    flush();
    return out;
  }

  // render(host, {path, content, start, end}) — construit le visualiseur inline.
  // Les tokens sont posés en textContent : aucun échappement HTML à gérer.
  function render(host, opts) {
    host.innerHTML = "";
    var box = document.createElement("div");
    box.className = "codeview";

    var bar = document.createElement("div");
    bar.className = "cbar";
    bar.appendChild(elText("span", "cpath", opts.path));
    if (opts.start) {
      bar.appendChild(elText("span", "crange", "lignes " + opts.start + "–" + opts.end));
    }
    box.appendChild(bar);

    var scroll = document.createElement("div");
    scroll.className = "cscroll";

    if (opts.content === null || opts.content === undefined) {
      scroll.appendChild(elText("div", "cempty",
        "Source indisponible — lancer le serveur : python tools/serve.py <project-root>"));
      box.appendChild(scroll);
      host.appendChild(box);
      return;
    }

    var lang = langOf(opts.path);
    var state = { block: false };
    var pre = document.createElement("pre");
    var firstHi = null;

    opts.content.split("\n").forEach(function (line, idx) {
      var n = idx + 1;
      var row = document.createElement("div");
      var hi = opts.start && n >= opts.start && n <= opts.end;
      row.className = "cl" + (hi ? " hi" : "");
      row.appendChild(elText("span", "ln", String(n)));
      var code = document.createElement("span");
      code.className = "ct";
      tokenizeLine(line, lang, state).forEach(function (t) {
        code.appendChild(elText("span", "t-" + t[0], t[1]));
      });
      if (!line) code.appendChild(document.createTextNode(" "));
      row.appendChild(code);
      if (hi && !firstHi) firstHi = row;
      pre.appendChild(row);
    });

    scroll.appendChild(pre);
    box.appendChild(scroll);
    host.appendChild(box);

    if (firstHi) {
      window.requestAnimationFrame(function () {
        scroll.scrollTop = Math.max(0, firstHi.offsetTop - scroll.clientHeight / 3);
      });
    }
  }

  function elText(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    e.textContent = text;
    return e;
  }

  // INV-006 : échec de fetch -> null (page ouverte sans serve.py), jamais d'exception.
  var cache = {};
  async function fetchSource(filePath) {
    if (cache[filePath] !== undefined) return cache[filePath];
    var content;
    try {
      var r = await fetch("/src?path=" + encodeURIComponent(filePath));
      content = r.ok ? (await r.json()).content : null;
    } catch (e) {
      content = null;
    }
    cache[filePath] = content;
    return content;
  }

  window.OT = window.OT || {};
  window.OT.code = { render: render, fetchSource: fetchSource, tokenizeLine: tokenizeLine, langOf: langOf };
})();
