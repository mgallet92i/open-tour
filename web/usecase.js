/* OT.usecase — écran "Use case" : logigramme vertical des étapes.
   Déclencheur en entrée, étapes numérotées, résultat attendu en sortie.
   Séquence linéaire : `steps[]` est une liste plate ordonnée, le contrat de
   données ne porte aucun branchement (pas de condition, pas de chemin
   alternatif) — un losange de décision serait une invention. */
(function () {
  "use strict";

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
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
    box.appendChild(el("div", "elabel", label));
    box.appendChild(el("div", "etext", text || "—"));
    return box;
  }

  function renderStep(uc, step, i) {
    var card = el("button", "stepcard");
    card.appendChild(el("span", "num", String(i + 1)));

    var body = el("div", "sbody");
    body.appendChild(el("div", "stitle", step.title));
    if (step.story) body.appendChild(el("p", "story", step.story));
    if (step.domain) {
      body.appendChild(el("div", "rule",
        '<span class="rlabel">Règle</span><span class="rtext">' + step.domain + "</span>"));
    }

    var meta = el("div", "smeta");
    var mods = moduleCount(step);
    if (mods) meta.appendChild(el("span", "chip", mods + " module" + (mods > 1 ? "s" : "")));
    var tests = (step.tests || []).length;
    meta.appendChild(el("span", "chip " + (tests ? "ok" : "none"),
      tests ? "✓ " + tests + " test" + (tests > 1 ? "s" : "") : "aucun test"));
    body.appendChild(meta);

    card.appendChild(body);
    card.appendChild(el("span", "go", "→"));
    card.addEventListener("click", function () {
      location.hash = "#/uc/" + uc.id + "/step/" + i;
    });
    return card;
  }

  // OT.usecase.render(host, uc)
  function render(host, uc) {
    var head = el("header", "vhead");
    head.appendChild(el("h1", null, uc.title));
    if (uc.intent) head.appendChild(el("p", "sub", uc.intent));
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
