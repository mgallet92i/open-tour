/* OT.screens — écran plan (#/plan) et écran itinéraire (#/uc/<id>).
   Contrat : design.md §3.2 (OT.screens), §3.3 (placement générique DEC-02), §3.4.
   UI : ui.md §5 (plan), §6 (itinéraire N variable), §4 (composants), classes app.css. */
(function () {
  "use strict";

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function usecasesData() { return window.OPENTOUR_DATA.usecases; }
  function personas() { return usecasesData().personas; }
  function groups() { return usecasesData().groups || []; }
  function usecases() { return usecasesData().usecases; }
  function findUc(id) {
    var list = usecases();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  // OT.derive — méta itinéraire dérivée des données (EX-008), pure et testable.
  var derive = {
    stepCount: function (uc) { return uc.steps.length; },
    moduleCount: function (uc) {
      var seen = {};
      var n = 0;
      uc.steps.forEach(function (s) {
        (s.nodes || []).forEach(function (id) {
          if (id.indexOf("file:") === 0 && !seen[id]) { seen[id] = true; n++; }
        });
      });
      return n;
    },
    testFileCount: function (uc) {
      var seen = {};
      var n = 0;
      uc.steps.forEach(function (s) {
        (s.tests || []).forEach(function (id) {
          if (!seen[id]) { seen[id] = true; n++; }
        });
      });
      return n;
    },
  };

  // Fraction d'abscisse curviligne du jalon i sur n étapes (DEC-02, design.md §3.3).
  // Départ = 0, Destination = 1 ; jalons équi-répartis entre les deux.
  function milestoneFraction(i, n) { return (i + 1) / (n + 1); }

  function isAvailable(uc) { return uc.steps.length > 0; }
  function isDimmed(uc, persona) { return !isAvailable(uc) || (!!persona && uc.persona !== persona); }

  function renderCrumbs(parts) {
    var nav = el("nav", "crumbs");
    parts.forEach(function (p, i) {
      if (i > 0) nav.appendChild(document.createTextNode(" · "));
      if (p.hash) {
        var a = el("a", null, p.label);
        a.href = p.hash;
        nav.appendChild(a);
      } else {
        nav.appendChild(document.createTextNode(p.label));
      }
    });
    return nav;
  }

  function renderHero(subtitle) {
    var hero = el("header", "hero");
    hero.innerHTML =
      '<div class="kicker">Visite guidée</div>' +
      '<h1><span class="brand">open</span>-tour</h1>' +
      '<div class="project">' + subtitle + "</div>";
    return hero;
  }

  // OT.screens.renderPlan(persona?) — écran #/plan (ui.md §5).
  function renderPlan(persona) {
    var app = document.getElementById("app");
    app.appendChild(renderHero("plan du réseau"));

    var wrap = el("div", "wrap");
    app.appendChild(wrap);

    var crumbParts = [{ label: "Plan du réseau" }];
    if (persona) {
      var pFilter = personas().filter(function (p) { return p.id === persona; })[0];
      if (pFilter) crumbParts.push({ label: pFilter.icon + " " + pFilter.name });
    }
    wrap.appendChild(renderCrumbs(crumbParts));

    var chips = el("div", "chips");
    personas().forEach(function (p) {
      var active = persona === p.id;
      var chip = el("span", "chip" + (active ? " active" : ""), p.icon + " " + p.name);
      chip.tabIndex = 0;
      chip.addEventListener("click", function () { window.OT.router.navigate("#/plan/p/" + p.id); });
      chip.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") chip.click(); });
      chips.appendChild(chip);
    });
    var allChip = el("span", "chip" + (!persona ? " active" : ""), "Tous les voyageurs");
    allChip.tabIndex = 0;
    allChip.addEventListener("click", function () { window.OT.router.navigate("#/plan"); });
    allChip.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") allChip.click(); });
    chips.appendChild(allChip);
    wrap.appendChild(chips);

    var metro = el("div", "metro");
    wrap.appendChild(metro);

    groups().forEach(function (g, gi) {
      var stationsUc = usecases().filter(function (u) { return u.group === g.id; });
      var mline = el("div", "mline");
      mline.style.setProperty("--line", g.color || ("var(--ot-line-" + ((gi % 6) + 1) + ")"));

      var lhead = el("div", "lhead");
      lhead.innerHTML =
        '<span class="disc">' + g.icon + "</span>" +
        "<div><div class=\"name\">" + g.name + "</div>" +
        '<div class="sub">' + g.description + " · " + stationsUc.length +
        " station" + (stationsUc.length > 1 ? "s" : "") + "</div></div>";
      mline.appendChild(lhead);

      var rail = el("div", "rail");
      rail.appendChild(el("div", "track"));
      var stationsEl = el("div", "stations");
      stationsUc.forEach(function (uc, si) {
        var available = isAvailable(uc);
        var dimmed = isDimmed(uc, persona);
        var terminus = si === stationsUc.length - 1;
        var station = el("div", "station" + (terminus ? " terminus" : "") + (dimmed ? " dim" : ""));
        station.innerHTML =
          '<span class="dot"></span>' +
          '<div class="title">' + uc.title + "</div>" +
          (available
            ? '<span class="badge ok">' + uc.steps.length + " étape" + (uc.steps.length > 1 ? "s" : "") + " · ✓ testé</span>"
            : '<span class="badge soon">bientôt</span>');
        if (available) {
          station.tabIndex = 0;
          station.addEventListener("click", function () { window.OT.router.navigate("#/uc/" + uc.id); });
          station.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") station.click(); });
        }
        stationsEl.appendChild(station);
      });
      rail.appendChild(stationsEl);
      mline.appendChild(rail);
      metro.appendChild(mline);
    });

    var legend = el(
      "div",
      "legend",
      "<span>● station = cas d'usage</span><span>● terminus de ligne</span><span>▬ une ligne = un groupe métier</span>"
    );
    wrap.appendChild(legend);
  }

  // OT.screens.renderItinerary(uc) — écran #/uc/<id> (ui.md §6, design.md §3.3 DEC-02).
  function renderItinerary(uc) {
    var app = document.getElementById("app");
    app.appendChild(renderHero(usecasesData().project.name));

    var wrap = el("div", "wrap");
    app.appendChild(wrap);

    var persona = personas().filter(function (p) { return p.id === uc.persona; })[0];
    var crumbParts = [{ label: "Plan du réseau", hash: "#/plan" }];
    if (persona) crumbParts.push({ label: persona.icon + " " + persona.name });
    crumbParts.push({ label: uc.title });
    wrap.appendChild(renderCrumbs(crumbParts));

    var route = el("div", "route");
    wrap.appendChild(route);

    var available = usecases().filter(isAvailable);
    var n = available.indexOf(uc) + 1;
    var head = el("div", "head");
    head.innerHTML = '<h2><span class="n">Nº ' + n + "</span>" + uc.title + "</h2>";
    var go = el("button", "go", "Commencer la visite ➜");
    go.addEventListener("click", function () { window.OT.router.navigate("#/uc/" + uc.id + "/step/0"); });
    head.appendChild(go);
    route.appendChild(head);

    route.appendChild(el("p", "intent", uc.intent));

    var map = el("div", "map");
    map.innerHTML =
      '<svg viewBox="0 0 920 700" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
      '<path id="road" d="M 170 650 C 480 660, 720 610, 740 520 C 758 440, 520 430, 380 415 C 220 397, 165 350, 260 300 C 360 248, 620 290, 700 225 C 760 176, 640 110, 460 95" fill="none" stroke="var(--ot-road)" stroke-width="26" stroke-linecap="round"/>' +
      '<path d="M 170 650 C 480 660, 720 610, 740 520 C 758 440, 520 430, 380 415 C 220 397, 165 350, 260 300 C 360 248, 620 290, 700 225 C 760 176, 640 110, 460 95" fill="none" stroke="var(--ot-road-dash)" stroke-width="3" stroke-dasharray="14 12" stroke-linecap="round"/>' +
      "</svg>";
    route.appendChild(map);

    route.appendChild(
      el(
        "div",
        "meta",
        "<span><b>" + derive.stepCount(uc) + " étapes</b> · " + derive.moduleCount(uc) +
          " modules · " + derive.testFileCount(uc) + " fichiers de test</span>"
      )
    );

    // getPointAtLength exige le <path> attaché au DOM et rendu (design.md §3.3).
    window.requestAnimationFrame(function () { placeMilestones(map, uc); });
  }

  // Placement générique des N jalons par abscisse curviligne (DEC-02) — pas de pins en dur.
  function placeMilestones(mapEl, uc) {
    var svg = mapEl.querySelector("svg");
    var road = mapEl.querySelector("#road");
    var vb = svg.viewBox.baseVal;
    var totalLength = road.getTotalLength();
    function at(len) {
      var p = road.getPointAtLength(len);
      return { left: (p.x / vb.width) * 100, top: (p.y / vb.height) * 100 };
    }
    function place(node, pos) {
      node.style.left = pos.left + "%";
      node.style.top = pos.top + "%";
      mapEl.appendChild(node);
    }

    // ponytail: trigger affiché brut (pas de parsing regex du texte/commande) — pas d'EX/TF ne l'exige.
    var start = el("div", "start", '<div class="board">DÉPART</div><div class="post"></div><div class="trig">' + uc.trigger + "</div>");
    place(start, at(0));

    var n = uc.steps.length;
    uc.steps.forEach(function (step, i) {
      var pos = at(totalLength * milestoneFraction(i, n));
      var pin = el("div", "pin", String(i + 1));
      pin.tabIndex = 0;
      pin.addEventListener("click", function () { window.OT.router.navigate("#/uc/" + uc.id + "/step/" + i); });
      pin.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") pin.click(); });
      place(pin, pos);

      var tested = (step.tests || []).length > 0;
      var tag = el(
        "div",
        "tag " + (i % 2 ? "left" : "right"),
        '<div class="t">' + (i + 1) + " · " + step.title + "</div>" + (tested ? '<span class="badge ok">✓ testé</span>' : "")
      );
      tag.tabIndex = 0;
      tag.addEventListener("click", function () { window.OT.router.navigate("#/uc/" + uc.id + "/step/" + i); });
      tag.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") tag.click(); });
      place(tag, pos);
    });

    var finishPos = at(totalLength);
    var finishPin = el("div", "pin finish", "⚑");
    place(finishPin, finishPos);
    var dest = el("div", "dest", '<div class="label">Destination</div><div class="outcome">' + uc.outcome + "</div>");
    place(dest, finishPos);
  }

  window.OT = window.OT || {};
  window.OT.screens = { renderPlan: renderPlan, renderItinerary: renderItinerary };
  window.OT.derive = derive;
  // exposés pour les tests (pures, pas de DOM) :
  window.OT._internal = { milestoneFraction: milestoneFraction, isAvailable: isAvailable, isDimmed: isDimmed, findUc: findUc };
})();
