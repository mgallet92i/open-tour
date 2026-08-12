/* OT.usecase — écran "Use case" : logigramme vertical des étapes.
   Déclencheur en entrée, étapes numérotées, résultat attendu en sortie.
   Séquence linéaire : `steps[]` est une liste plate ordonnée, le contrat de
   données ne porte aucun branchement (pas de condition, pas de chemin
   alternatif) — un losange de décision serait une invention. */
(function () {
  "use strict";

  function el(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  // Texte issu des données -> textContent (un « < » dans une règle métier
  // casserait le rendu en innerHTML).
  function elText(tag, cls, text) {
    var e = el(tag, cls);
    e.textContent = text;
    return e;
  }

  function data() { return window.OPENTOUR_DATA.usecases; }

  // Couleur de la famille du use case — même code couleur que l'écran Persona.
  function groupColor(groupId) {
    var groups = data().groups || [];
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].id === groupId) {
        return groups[i].color || "var(--ot-line-" + ((i % 6) + 1) + ")";
      }
    }
    return "var(--ot-muted)";
  }

  function moduleCount(step) {
    return (step.nodes || []).filter(function (id) { return id.indexOf("file:") === 0; }).length;
  }

  function renderEndpoint(kind, label, text) {
    var box = el("div", "endpoint " + kind);
    box.appendChild(elText("div", "elabel", label));
    box.appendChild(elText("div", "etext", text || "—"));
    return box;
  }

  function renderStep(uc, step, i) {
    var card = el("button", "stepcard");
    card.appendChild(elText("span", "num", String(i + 1)));

    var body = el("div", "sbody");
    body.appendChild(elText("div", "stitle", step.title));
    if (step.story) body.appendChild(elText("p", "story", step.story));
    if (step.domain) {
      var rule = el("div", "rule");
      rule.appendChild(elText("span", "rlabel", "Règle"));
      rule.appendChild(elText("span", "rtext", step.domain));
      body.appendChild(rule);
    }

    var meta = el("div", "smeta");
    var mods = moduleCount(step);
    if (mods) meta.appendChild(elText("span", "chip", mods + " module" + (mods > 1 ? "s" : "")));
    var tests = (step.tests || []).length;
    meta.appendChild(elText("span", "chip " + (tests ? "ok" : "none"),
      tests ? "✓ " + tests + " test" + (tests > 1 ? "s" : "") : "aucun test"));
    body.appendChild(meta);

    card.appendChild(body);
    card.appendChild(elText("span", "go", "→"));
    card.addEventListener("click", function () {
      location.hash = "#/uc/" + uc.id + "/step/" + i;
    });
    return card;
  }

  // OT.usecase.render(host, uc)
  function render(host, uc) {
    var head = el("header", "vhead");
    head.appendChild(elText("h1", null, uc.title));
    if (uc.intent) head.appendChild(elText("p", "sub", uc.intent));
    host.appendChild(head);

    var flow = el("div", "flow");
    flow.style.setProperty("--fam", groupColor(uc.group));

    flow.appendChild(renderEndpoint("start", "Déclencheur", uc.trigger));
    uc.steps.forEach(function (step, i) {
      flow.appendChild(el("div", "link"));
      flow.appendChild(renderStep(uc, step, i));
    });
    flow.appendChild(el("div", "link"));
    flow.appendChild(renderEndpoint("end", "Résultat attendu", uc.outcome));

    host.appendChild(flow);
  }

  window.OT = window.OT || {};
  window.OT.usecase = { render: render, groupColor: groupColor, moduleCount: moduleCount };
})();
