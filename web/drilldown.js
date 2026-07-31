/* OT.drilldown — écran étape (EX-009, EX-010). Drill-down technique du proto
   (web/index.html) REPRIS VERBATIM : renderDetail/renderTech/renderSymbols/
   openSource/srcCache — mêmes classes, même logique. Nouveau : en-tête étape +
   nav prev/next/retour (chrome, ui.md §7/§4.7). Contrat : design.md §3.2. */
(function () {
  "use strict";

  function graph() {
    return (window.OPENTOUR_DATA && window.OPENTOUR_DATA.graph) || {};
  }

  // --- helpers purs (seam de test — pas de DOM, cf. drilldown.test.js) ---

  function navState(stepIdx, total) {
    return { prevDisabled: stepIdx <= 0, nextDisabled: stepIdx >= total - 1 };
  }

  // INV-003 : un node absent du graphe est ignoré silencieusement
  // (repris du proto : `const n = G[id]; if (!n) return;`).
  function resolveNodes(ids, g) {
    var out = [];
    for (var i = 0; i < ids.length; i++) {
      var n = g[ids[i]];
      if (n) out.push({ id: ids[i], node: n });
    }
    return out;
  }

  // Collecteur pur nodes -> règles de gestion, groupées fichier puis symbole.
  // Entrée : sortie de resolveNodes ([{ id, node }]). Sortie ordonnée comme
  // l'entrée ; un fichier/symbole sans règle est omis ; aucune règle -> [].
  function collectRules(resolved) {
    var out = [];
    for (var i = 0; i < resolved.length; i++) {
      var n = resolved[i].node;
      var fileRules = n.rules || [];
      var symbols = [];
      var syms = n.symbols || [];
      for (var j = 0; j < syms.length; j++) {
        var s = syms[j], sr = s.rules || [];
        if (sr.length) symbols.push({ label: s.title || s.name, rules: sr });
      }
      if (fileRules.length || symbols.length) {
        out.push({ file: n.filePath || n.title || n.name, fileRules: fileRules, symbols: symbols });
      }
    }
    return out;
  }

  // INV-006 : fetch('/src') en try/catch, échec -> content=null (repris verbatim).
  async function fetchSource(filePath, fetchFn) {
    try {
      var r = await fetchFn("/src?path=" + encodeURIComponent(filePath));
      if (!r.ok) throw new Error(r.status);
      return (await r.json()).content;
    } catch (e) {
      return null; // provider indisponible (page ouverte sans serve.py)
    }
  }

  // --- état module (mêmes rôles que activeStep/techOpen/activeMod du proto) ---
  var techOpen = false;
  var rulesOpen = false;
  var activeMod = null;
  var flowOpen = new Set();
  var lastKey = null;
  var srcCache = {};
  var currentUc = null;
  var currentStepIdx = 0;

  // Rafraîchit l'écran étape courant (équivalent des ré-appels renderUsecases()
  // du proto, qui référençait l'état module-level plutôt que de re-router).
  function refresh() {
    var app = document.getElementById("app");
    if (app) app.innerHTML = "";
    renderStep(currentUc, currentStepIdx);
  }

  function renderStep(uc, stepIdx) {
    currentUc = uc;
    currentStepIdx = stepIdx;
    var key = uc.id + "/" + stepIdx;
    if (key !== lastKey) {
      techOpen = false;
      rulesOpen = false;
      activeMod = null;
      flowOpen.clear();
      lastKey = key;
    }
    var step = uc.steps[stepIdx];
    var app = document.getElementById("app");
    var wrap = document.createElement("div");
    wrap.className = "wrap";
    wrap.appendChild(renderHeader(uc, stepIdx, step));
    wrap.appendChild(renderDetail(uc, stepIdx, step));
    wrap.appendChild(renderStepNav(uc, stepIdx));
    app.appendChild(wrap);
  }

  function renderHeader(uc, stepIdx, step) {
    var frag = document.createElement("div");
    var nav = document.createElement("nav");
    nav.className = "crumbs";
    nav.innerHTML =
      '<a data-nav="#/plan">Plan</a> › <a data-nav="#/uc/' + uc.id + '">Itinéraire</a> › Étape ' + (stepIdx + 1);
    nav.querySelectorAll("[data-nav]").forEach(function (a) {
      a.onclick = function () { window.OT.router.navigate(a.getAttribute("data-nav")); };
    });
    var hero = document.createElement("div");
    hero.className = "hero";
    hero.innerHTML =
      "<h2>" + (stepIdx + 1) + " · " + step.title + "</h2><p class=\"intent\">" + uc.intent + "</p>";
    frag.appendChild(nav);
    frag.appendChild(hero);
    return frag;
  }

  // --- repris verbatim du proto (web/index.html) ---

  function renderDetail(uc, stepIdx, step) {
    var d = document.createElement("div");
    d.className = "detail";
    d.innerHTML =
      "<h3>" + step.title + "</h3><p class=\"story\">" + step.story + "</p>" +
      '<div class="domain"><b>Règle métier :</b> ' + step.domain + "</div>";
    var reveal = document.createElement("div");
    reveal.className = "reveal";
    var btn = document.createElement("button");
    btn.textContent = techOpen ? "Masquer l'implémentation" : "Voir l'implémentation ↓";
    btn.onclick = function () {
      techOpen = !techOpen;
      if (!techOpen) activeMod = null;
      refresh();
    };
    reveal.appendChild(btn);
    var tech = document.createElement("div");
    tech.className = "tech" + (techOpen ? " open" : "");
    if (techOpen) tech.appendChild(renderTech(uc, stepIdx, step));
    reveal.appendChild(tech);
    d.appendChild(reveal);
    var groups = collectRules(resolveNodes(step.nodes, graph()));
    if (groups.length) {
      var rReveal = document.createElement("div");
      rReveal.className = "reveal";
      var rBtn = document.createElement("button");
      rBtn.textContent = rulesOpen ? "Masquer les règles de gestion" : "Règles de gestion";
      rBtn.onclick = function () {
        rulesOpen = !rulesOpen;
        refresh();
      };
      rReveal.appendChild(rBtn);
      var rBlock = document.createElement("div");
      rBlock.className = "tech" + (rulesOpen ? " open" : "");
      if (rulesOpen) rBlock.appendChild(renderRules(groups));
      rReveal.appendChild(rBlock);
      d.appendChild(rReveal);
    }
    return d;
  }

  function renderRules(groups) {
    var box = document.createElement("div");
    box.className = "sym"; // réutilise le style de .sym .lbl (app.css) pour les libellés
    groups.forEach(function (grp) {
      var fh = document.createElement("div");
      fh.className = "lbl";
      fh.textContent = grp.file;
      box.appendChild(fh);
      if (grp.fileRules.length) box.appendChild(rulesList(grp.fileRules));
      grp.symbols.forEach(function (sym) {
        var sh = document.createElement("div");
        sh.className = "lbl";
        sh.textContent = sym.label;
        box.appendChild(sh);
        box.appendChild(rulesList(sym.rules));
      });
    });
    return box;
  }

  function rulesList(rules) {
    var ul = document.createElement("ul");
    // textContent, pas innerHTML : une règle de gestion contient couramment un
    // comparateur (« si le montant < 1000 € ») qui casserait le rendu.
    rules.forEach(function (r) {
      var li = document.createElement("li");
      li.textContent = r;
      ul.appendChild(li);
    });
    return ul;
  }

  function renderTech(uc, stepIdx, step) {
    var cols = document.createElement("div");
    cols.className = "cols";
    var list = document.createElement("div");
    list.className = "modlist";
    list.innerHTML = '<div class="lbl">Modules impliqués</div>';
    var g = graph();
    var resolved = resolveNodes(step.nodes, g); // INV-003
    if (!activeMod || !g[activeMod] || step.nodes.indexOf(activeMod) === -1) {
      activeMod = resolved.length ? resolved[0].id : null;
    }
    var stepNum = stepIdx + 1;
    resolved.forEach(function (entry, i) {
      var id = entry.id, n = entry.node;
      var el = document.createElement("div");
      el.className = "mod" + (id === activeMod ? " active" : "");
      el.innerHTML =
        '<div style="font-weight:600;font-size:13px"><span style="color:var(--ot-code)">' + stepNum + "." + (i + 1) +
        "</span> " + (n.title || n.name) + '</div><div class="p">' + (n.filePath || n.name) +
        '</div><div class="s">' + n.summary + "</div>";
      el.onclick = function () { activeMod = id; refresh(); };
      list.appendChild(el);
    });
    cols.appendChild(list);
    var activeIdx = -1;
    for (var i = 0; i < resolved.length; i++) if (resolved[i].id === activeMod) activeIdx = i;
    cols.appendChild(renderSymbols(g[activeMod], step, stepNum + "." + (activeIdx + 1)));
    return cols;
  }

  function renderSymbols(mod, step, modNum) {
    var pane = document.createElement("div");
    pane.className = "sym";
    if (!mod) { pane.textContent = "Module introuvable dans le graphe."; return pane; } // INV-003
    pane.innerHTML =
      '<div class="head"><div style="font-weight:600"><span style="color:var(--ot-code)">' + modNum +
      "</span> " + (mod.title || mod.name) + '</div><div class="p">' + mod.filePath +
      '</div><div class="s">' + mod.summary + "</div></div>";
    var inFlow = new Set();
    if (mod.flow && mod.flow.entries.length) {
      var lbl = document.createElement("div");
      lbl.className = "lbl";
      lbl.textContent = "Flow d'appels (dans l'ordre — cliquer une étape pour la déplier)";
      pane.appendChild(lbl);
      var sym = {};
      mod.symbols.forEach(function (s) { sym[s.name] = s; });
      var titleOf = function (n) { return (sym[n] && sym[n].title) || n; };
      Object.keys(mod.flow.defs).forEach(function (n) { inFlow.add(n); });

      var makeBox = function (name, path) {
        var d = mod.flow.defs[name];
        var kids = d.calls.filter(function (c) { return path.indexOf(c) === -1; });
        var key = mod.id + "|" + path.concat([name]).join(">");
        var box = document.createElement("div");
        box.className = "fbox" + (kids.length ? " expandable" : "") + (flowOpen.has(key) ? " open" : "");
        box.title = sym[name] ? sym[name].summary : "";
        box.innerHTML =
          '<div class="ft">' + titleOf(name) + " " +
          (kids.length ? '<span class="caret">' + (flowOpen.has(key) ? "▲" : "▼") + "</span>" : "") + "</div>" +
          (titleOf(name) !== name ? '<div class="fn">' + name + "</div>" : "") +
          '<span class="src" title="Voir le code source">&lt;/&gt;</span>';
        var srcEl = box.querySelector(".src");
        if (srcEl) {
          srcEl.onclick = function (e) {
            e.stopPropagation();
            openSource(mod, { name: name, lineRange: [d.start, d.end] });
          };
        }
        if (kids.length) {
          box.onclick = function () {
            flowOpen.has(key) ? flowOpen.delete(key) : flowOpen.add(key);
            refresh();
          };
        } else {
          box.style.cursor = "pointer";
          box.title = (box.title ? box.title + "\n" : "") + "Clic : voir le code source";
          box.onclick = function () { openSource(mod, { name: name, lineRange: [d.start, d.end] }); };
        }
        return box;
      };

      var renderChain = function (names, path) {
        var wrap = document.createElement("div");
        var chain = document.createElement("div");
        chain.className = "fchain";
        names.forEach(function (n, i) {
          if (i) {
            var a = document.createElement("span");
            a.className = "farrow";
            a.textContent = "➜";
            chain.appendChild(a);
          }
          chain.appendChild(makeBox(n, path));
        });
        wrap.appendChild(chain);
        names.forEach(function (n) {
          var key = mod.id + "|" + path.concat([n]).join(">");
          var kids = mod.flow.defs[n].calls.filter(function (c) { return path.concat([n]).indexOf(c) === -1; });
          if (kids.length && flowOpen.has(key)) {
            var sub = document.createElement("div");
            sub.className = "fsub";
            sub.innerHTML = '<div class="flbl">Détail — ' + titleOf(n) + "</div>";
            sub.appendChild(renderChain(kids, path.concat([n])));
            wrap.appendChild(sub);
          }
        });
        return wrap;
      };

      mod.flow.entries.forEach(function (e, k) {
        var d = mod.flow.defs[e];
        var block = document.createElement("div");
        block.className = "fentry";
        var head = document.createElement("div");
        head.className = "fhead";
        head.innerHTML =
          '<span style="opacity:.75">' + modNum + "." + (k + 1) + "</span> " + titleOf(e) + " " +
          (titleOf(e) !== e ? '<span class="fn">' + e + "</span>" : "") +
          '<span class="src" style="position:static;color:var(--ot-white);opacity:.8">&lt;/&gt;</span>';
        head.style.cursor = "pointer";
        head.title = (sym[e] ? sym[e].summary + "\n" : "") + "Clic : voir le code source";
        head.onclick = function () { openSource(mod, { name: e, lineRange: [d.start, d.end] }); };
        block.appendChild(head);
        if (d.calls.length) block.appendChild(renderChain(d.calls, [e]));
        pane.appendChild(block);
      });
    }
    var rest = mod.symbols.filter(function (s) { return !inFlow.has(s.name); });
    if (rest.length) {
      var lbl2 = document.createElement("div");
      lbl2.className = "lbl";
      lbl2.textContent = inFlow.size ? "Autres symboles" : "Classes & fonctions";
      pane.appendChild(lbl2);
      rest.forEach(function (s) {
        var row = document.createElement("div");
        row.className = "symrow";
        row.title = "Voir le code source";
        row.innerHTML =
          '<span class="k ' + s.type + '">' + (s.type === "class" ? "classe" : "fonction") + "</span>" +
          '<span><b style="font-size:12.5px">' + (s.title || s.name) + '</b> <span class="n" style="color:var(--ot-muted)">' +
          s.name + "</span></span>" + '<span class="d">' + s.summary + "</span>";
        row.onclick = function () { openSource(mod, s); };
        pane.appendChild(row);
      });
    }
    var testIds = (step.tests || []).filter(function (t) { return graph()[t]; });
    if (testIds.length) {
      var t = document.createElement("div");
      t.className = "tests";
      t.innerHTML = '<div class="lbl">Couvert par</div>';
      testIds.forEach(function (id) {
        var n = graph()[id];
        var b = document.createElement("span");
        b.className = "badge";
        b.style.cursor = "pointer";
        b.title = (n.summary ? n.summary + "\n" : "") + "Clic : voir le code source";
        b.textContent = n.filePath;
        b.onclick = function () { openSource(n, { name: n.name, lineRange: null }); };
        t.appendChild(b);
      });
      pane.appendChild(t);
    }
    return pane;
  }

  // modale code source (lazy loading via /src, cache par fichier) — repris verbatim.
  async function openSource(mod, sym) {
    var content = srcCache[mod.filePath];
    if (content === undefined) {
      content = await fetchSource(mod.filePath, window.fetch.bind(window)); // INV-006
      srcCache[mod.filePath] = content;
    }
    var start = null, end = null;
    if (sym.lineRange) { start = sym.lineRange[0]; end = sym.lineRange[1]; }
    var overlay = document.createElement("div");
    overlay.className = "overlay";
    var box = document.createElement("div");
    box.className = "codebox";
    var symPart = sym.name && !mod.filePath.endsWith(sym.name) ? " — " + sym.name : "";
    box.innerHTML =
      '<div class="bar"><span class="t">' + mod.filePath + symPart +
      (start ? " (lignes " + start + "–" + end + ")" : "") + '</span><button>✕ fermer</button></div>';
    var scroll = document.createElement("div");
    scroll.className = "scroll";
    if (content === null) {
      scroll.innerHTML = '<pre style="padding:18px">Source indisponible — lancer le serveur : python tools/serve.py</pre>';
    } else {
      var pre = document.createElement("pre");
      var firstHi = null;
      content.split("\n").forEach(function (line, i) {
        var n = i + 1;
        var div = document.createElement("div");
        div.className = "cl" + (start && n >= start && n <= end ? " hi" : "");
        var ln = document.createElement("span"); ln.className = "ln"; ln.textContent = n;
        var code = document.createElement("span"); code.textContent = line || " ";
        div.append(ln, code);
        if (!firstHi && div.className.indexOf("hi") !== -1) firstHi = div;
        pre.appendChild(div);
      });
      scroll.appendChild(pre);
      requestAnimationFrame(function () {
        if (firstHi) scroll.scrollTop = firstHi.offsetTop - scroll.clientHeight / 3;
      });
    }
    box.appendChild(scroll);
    overlay.appendChild(box);
    var close = function () { overlay.remove(); document.removeEventListener("keydown", onKey); };
    var onKey = function (e) { if (e.key === "Escape") close(); };
    overlay.onclick = function (e) { if (e.target === overlay) close(); };
    box.querySelector("button").onclick = close;
    document.addEventListener("keydown", onKey);
    document.body.appendChild(overlay);
  }

  // --- nouveau chrome : nav étape (EX-010, ui.md §4.7) ---

  function renderStepNav(uc, stepIdx) {
    var st = navState(stepIdx, uc.steps.length);
    var bar = document.createElement("div");
    bar.className = "step-nav";
    var prev = document.createElement("button");
    prev.textContent = "‹ Étape précédente";
    prev.disabled = st.prevDisabled;
    prev.onclick = function () { window.OT.router.navigate("#/uc/" + uc.id + "/step/" + (stepIdx - 1)); };
    var back = document.createElement("button");
    back.textContent = "↩ Retour à l'itinéraire";
    back.onclick = function () { window.OT.router.navigate("#/uc/" + uc.id); };
    var next = document.createElement("button");
    next.textContent = "Étape suivante ›";
    next.disabled = st.nextDisabled;
    next.onclick = function () { window.OT.router.navigate("#/uc/" + uc.id + "/step/" + (stepIdx + 1)); };
    bar.append(prev, back, next);
    return bar;
  }

  window.OT = window.OT || {};
  window.OT.drilldown = { renderStep: renderStep, openSource: openSource };
  // ponytail: seam interne pour self-check unitaire (pas de jsdom dispo, projet
  // zero-dependency) — pas dans le contrat public design.md §3.2.
  window.OT.drilldown._internal = { navState: navState, resolveNodes: resolveNodes, fetchSource: fetchSource, collectRules: collectRules };
})();
