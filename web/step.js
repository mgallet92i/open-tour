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

  var selected = null;        // { modId, symName, start, end }
  var activeTab = "modules";  // "modules" | "rules"

  var TABS = [
    { id: "modules", label: "Modules impliqués" },
    { id: "rules", label: "Règle de l'étape" },
  ];

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
    var box = el("section", "rules");

    if (step.domain) {
      var own = el("div", "own");
      own.appendChild(elText("span", "rlabel", "Règle de l'étape"));
      own.appendChild(elText("span", "txt", step.domain));
      box.appendChild(own);
    }

    if (others.length) {
      box.appendChild(elText("div", "sublabel",
        others.length + " règle" + (others.length > 1 ? "s" : "") + " portée" +
        (others.length > 1 ? "s" : "") + " par les modules"));
      var list = el("ul", "rlist");
      others.forEach(function (r) {
        var li = el("li");
        li.appendChild(elText("span", "src", r.src));
        li.appendChild(elText("span", "txt", r.rule));
        list.appendChild(li);
      });
      box.appendChild(list);
    }

    if (!box.children.length) {
      box.appendChild(elText("div", "empty", "Aucune règle de gestion rattachée à cette étape."));
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

  function renderTabs(onSwitch) {
    var bar = el("div", "tabs");
    bar.setAttribute("role", "tablist");
    TABS.forEach(function (t) {
      var b = elText("button", "tab" + (t.id === activeTab ? " active" : ""), t.label);
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", t.id === activeTab ? "true" : "false");
      b.addEventListener("click", function () { onSwitch(t.id); });
      bar.appendChild(b);
    });
    return bar;
  }

  function renderModulesTab(resolved) {
    var cols = el("div", "tech");
    var codeHost = el("div", "codepane");

    function repaint(sel) {
      selected = sel;
      cols.replaceChild(renderModules(resolved, repaint), cols.firstChild);
      paintCode(codeHost);
    }

    cols.appendChild(renderModules(resolved, repaint));
    cols.appendChild(codeHost);
    paintCode(codeHost);
    return cols;
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

    var tabsHost = el("div", "tabshost");
    var body = el("div", "tabbody");

    function paintTab() {
      tabsHost.innerHTML = "";
      tabsHost.appendChild(renderTabs(function (id) {
        activeTab = id;
        paintTab();
      }));
      body.innerHTML = "";
      body.appendChild(activeTab === "rules"
        ? renderRules(step, collectRules(resolved))
        : renderModulesTab(resolved));
    }

    paintTab();
    host.appendChild(tabsHost);
    host.appendChild(body);
  }

  window.OT = window.OT || {};
  window.OT.step = { render: render, resolveNodes: resolveNodes, collectRules: collectRules };
})();
