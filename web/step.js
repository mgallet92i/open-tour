/* OT.step — écran technique d'une étape : modules impliqués, symboles, règles de
   gestion et code source affiché EN LIGNE (plus de modale).
   Helpers purs repris de l'ancien drilldown.js : resolveNodes (INV-003 — un node
   absent du graphe est ignoré silencieusement) et collectRules. */
(function () {
  "use strict";

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function elText(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    e.textContent = text;
    return e;
  }

  function graph() { return (window.OPENTOUR_DATA && window.OPENTOUR_DATA.graph) || {}; }

  // INV-003 : un node absent du graphe est ignoré, jamais d'écran cassé.
  function resolveNodes(ids, g) {
    var out = [];
    (ids || []).forEach(function (id) { if (g[id]) out.push({ id: id, node: g[id] }); });
    return out;
  }

  // Règles de gestion portées par les fichiers et leurs symboles.
  function collectRules(resolved) {
    var out = [];
    resolved.forEach(function (entry) {
      var n = entry.node;
      var fileRules = n.rules || [];
      var symbols = [];
      (n.symbols || []).forEach(function (s) {
        if ((s.rules || []).length) symbols.push({ label: s.title || s.name, rules: s.rules });
      });
      if (fileRules.length || symbols.length) {
        out.push({ file: n.filePath || n.name, fileRules: fileRules, symbols: symbols });
      }
    });
    return out;
  }

  var selected = null;   // { modId, symName, start, end }

  // Règles des modules, dédoublonnées par texte : la même règle est couramment
  // portée à la fois par le fichier et par un de ses symboles.
  function dedupe(groups, own) {
    var seen = own ? new Set([own.trim()]) : new Set();
    var out = [];
    groups.forEach(function (grp) {
      grp.fileRules.forEach(function (r) {
        if (seen.has(r.trim())) return;
        seen.add(r.trim());
        out.push({ src: grp.file, rule: r });
      });
      grp.symbols.forEach(function (sym) {
        sym.rules.forEach(function (r) {
          if (seen.has(r.trim())) return;
          seen.add(r.trim());
          out.push({ src: sym.label, rule: r });
        });
      });
    });
    return out;
  }

  function renderRules(step, groups) {
    var others = dedupe(groups, step.domain);
    if (!step.domain && !others.length) return null;

    var box = el("section", "rules");

    if (step.domain) {
      var own = el("div", "own");
      own.appendChild(elText("span", "rlabel", "Règle de l'étape"));
      own.appendChild(elText("span", "txt", step.domain));
      box.appendChild(own);
    }

    if (others.length) {
      // <details> natif : replié par défaut, aucun JS d'ouverture/fermeture.
      var det = el("details", "more");
      det.appendChild(elText("summary", null,
        others.length + " autre" + (others.length > 1 ? "s" : "") +
        " règle" + (others.length > 1 ? "s" : "") + " portée" + (others.length > 1 ? "s" : "") +
        " par les modules"));
      var list = el("ul", "rlist");
      others.forEach(function (r) {
        var li = el("li");
        li.appendChild(elText("span", "src", r.src));
        li.appendChild(elText("span", "txt", r.rule));
        list.appendChild(li);
      });
      det.appendChild(list);
      box.appendChild(det);
    }

    return box;
  }

  function renderModules(resolved, onPick) {
    var pane = el("div", "modpane");
    pane.appendChild(elText("div", "plabel", "Modules impliqués"));

    resolved.forEach(function (entry) {
      var n = entry.node;
      var mod = el("div", "mod" + (selected && selected.modId === entry.id ? " active" : ""));

      var head = el("button", "mhead");
      head.appendChild(elText("div", "mtitle", n.title || n.name));
      head.appendChild(elText("div", "mpath", n.filePath || n.name));
      if (n.summary) head.appendChild(elText("div", "msum", n.summary));
      head.addEventListener("click", function () {
        onPick({ modId: entry.id, symName: null, start: null, end: null });
      });
      mod.appendChild(head);

      var syms = (n.symbols || []).filter(function (s) { return s.lineRange; });
      if (syms.length) {
        var ul = el("ul", "symlist");
        syms.forEach(function (s) {
          var li = el("li");
          var active = selected && selected.modId === entry.id && selected.symName === s.name;
          var b = el("button", "sym" + (active ? " active" : ""));
          b.appendChild(elText("span", "kind " + s.type, s.type === "class" ? "classe" : "fn"));
          b.appendChild(elText("span", "sname", s.title || s.name));
          if (s.summary) b.title = s.summary;
          b.addEventListener("click", function () {
            onPick({ modId: entry.id, symName: s.name, start: s.lineRange[0], end: s.lineRange[1] });
          });
          li.appendChild(b);
          ul.appendChild(li);
        });
        mod.appendChild(ul);
      }
      pane.appendChild(mod);
    });

    if (!resolved.length) {
      pane.appendChild(elText("div", "empty", "Aucun module du graphe rattaché à cette étape."));
    }
    return pane;
  }

  async function paintCode(host) {
    var g = graph();
    var mod = selected && g[selected.modId];
    if (!mod) {
      host.innerHTML = "";
      host.appendChild(elText("div", "cplaceholder", "Choisis un module ou une fonction pour afficher le code."));
      return;
    }
    host.innerHTML = "";
    host.appendChild(elText("div", "cplaceholder", "Chargement de " + mod.filePath + "…"));
    var content = await window.OT.code.fetchSource(mod.filePath);
    window.OT.code.render(host, {
      path: mod.filePath, content: content, start: selected.start, end: selected.end,
    });
  }

  // OT.step.render(host, uc, stepIdx)
  function render(host, uc, stepIdx) {
    var step = uc.steps[stepIdx];
    var resolved = resolveNodes(step.nodes, graph());

    // Sélection par défaut : premier module de l'étape.
    if (!selected || !graph()[selected.modId] || (step.nodes || []).indexOf(selected.modId) === -1) {
      selected = resolved.length
        ? { modId: resolved[0].id, symName: null, start: null, end: null }
        : null;
    }

    var head = el("header", "vhead");
    head.appendChild(elText("h1", null, step.title));
    if (step.story) head.appendChild(elText("p", "sub", step.story));
    host.appendChild(head);

    var rules = renderRules(step, collectRules(resolved));
    if (rules) host.appendChild(rules);

    var cols = el("div", "tech");
    var codeHost = el("div", "codepane");

    function repaint(sel) {
      selected = sel;
      // Re-rendu du seul panneau modules (état actif) + du code.
      var fresh = renderModules(resolved, repaint);
      cols.replaceChild(fresh, cols.firstChild);
      paintCode(codeHost);
    }

    cols.appendChild(renderModules(resolved, repaint));
    cols.appendChild(codeHost);
    host.appendChild(cols);
    paintCode(codeHost);
  }

  window.OT = window.OT || {};
  window.OT.step = { render: render, resolveNodes: resolveNodes, collectRules: collectRules };
})();
