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

  // Style de commentaires par extension.
  // `line` = commentaire jusqu'en fin de ligne ; `blocks` = [ouvrant, fermant, type]
  // multi-lignes (type `com` pour un commentaire, `str` pour un docstring Python).
  var C_BLOCKS = [["/*", "*/", "com"]];
  var PY_BLOCKS = [['"""', '"""', "str"], ["'''", "'''", "str"]];

  var LANGS = {
    ts: { line: "//", blocks: C_BLOCKS },
    js: { line: "//", blocks: C_BLOCKS },
    mjs: { line: "//", blocks: C_BLOCKS },
    java: { line: "//", blocks: C_BLOCKS },
    cs: { line: "//", blocks: C_BLOCKS },
    go: { line: "//", blocks: C_BLOCKS },
    rs: { line: "//", blocks: C_BLOCKS },
    css: { line: null, blocks: C_BLOCKS },
    cls: { line: "//", blocks: C_BLOCKS },      // Apex
    trigger: { line: "//", blocks: C_BLOCKS },
    py: { line: "#", blocks: PY_BLOCKS },
    sh: { line: "#", blocks: null },
    yml: { line: "#", blocks: null },
    yaml: { line: "#", blocks: null },
    toml: { line: "#", blocks: null },
    sql: { line: "--", blocks: C_BLOCKS },
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
    return LANGS[ext] || { line: null, blocks: null };
  }

  function isWordChar(c) { return /[A-Za-z0-9_$]/.test(c); }

  // tokenizeLine(line, lang, state) -> [[type, text], ...]
  // `state` porte l'état multi-lignes (bloc de commentaire ouvert) et est muté.
  function tokenizeLine(line, lang, state) {
    var out = [], i = 0, plain = "";
    function flush() { if (plain) { out.push(["plain", plain]); plain = ""; } }

    while (i < line.length) {
      // Dans un bloc ouvert sur une ligne précédente : on consomme jusqu'au fermant.
      if (state.block) {
        var close = state.block.end, btype = state.block.type;
        var idx = line.indexOf(close, i);
        if (idx === -1) { out.push([btype, line.slice(i)]); i = line.length; }
        else {
          out.push([btype, line.slice(i, idx + close.length)]);
          i = idx + close.length;
          state.block = null;
        }
        continue;
      }

      var opened = null;
      (lang.blocks || []).forEach(function (b) {
        if (!opened && line.startsWith(b[0], i)) opened = b;
      });
      if (opened) {
        flush();
        // Ouverture ET fermeture sur la même ligne (docstring d'une ligne).
        var endIdx = line.indexOf(opened[1], i + opened[0].length);
        if (endIdx !== -1) {
          out.push([opened[2], line.slice(i, endIdx + opened[1].length)]);
          i = endIdx + opened[1].length;
        } else {
          out.push([opened[2], line.slice(i)]);
          i = line.length;
          state.block = { end: opened[1], type: opened[2] };
        }
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

  // clampRange(start, end, total) -> [start, end] | null
  // Une plage n'est retenue que si elle est faite de deux entiers >= 1 avec
  // start <= end, et qu'elle recoupe le fichier ; elle est ensuite bornée à sa
  // taille. Sinon on n'affiche AUCUNE plage : mieux vaut pas d'information
  // qu'un « lignes 50–10 » ou un fichier entier surligné comme s'il était la
  // plage demandée.
  function clampRange(start, end, total) {
    if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
    if (start < 1 || end < start || start > total) return null;
    return [start, Math.min(end, total)];
  }

  // render(host, {path, content, start, end}) — construit le visualiseur inline.
  // Les tokens sont posés en textContent : aucun échappement HTML à gérer.
  function render(host, opts) {
    host.innerHTML = "";
    var box = document.createElement("div");
    box.className = "codeview";

    var lines = (opts.content === null || opts.content === undefined)
      ? null
      : opts.content.split("\n");
    var range = lines ? clampRange(opts.start, opts.end, lines.length) : null;

    var bar = document.createElement("div");
    bar.className = "cbar";
    bar.appendChild(elText("span", "cpath", opts.path));
    if (range) {
      bar.appendChild(elText("span", "crange", "lignes " + range[0] + "–" + range[1]));
    }
    box.appendChild(bar);

    var scroll = document.createElement("div");
    scroll.className = "cscroll";

    if (!lines) {
      scroll.appendChild(elText("div", "cempty",
        "Source indisponible — lancer le serveur : python tools/serve.py <project-root>"));
      box.appendChild(scroll);
      host.appendChild(box);
      return;
    }

    var lang = langOf(opts.path);
    var state = { block: null };
    var pre = document.createElement("pre");
    var firstHi = null;

    lines.forEach(function (line, idx) {
      var n = idx + 1;
      var row = document.createElement("div");
      var hi = !!range && n >= range[0] && n <= range[1];
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
  window.OT.code = {
    render: render, fetchSource: fetchSource, tokenizeLine: tokenizeLine,
    langOf: langOf, clampRange: clampRange,
  };
})();
