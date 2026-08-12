/* OT.nav — sidebar (menus Business / Technique) + routing par hash.
   Refonte KG : #/personas (écran Persona), #/uc/<id> (écran Use case, à venir). */
(function () {
  "use strict";

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function data() { return window.OPENTOUR_DATA.usecases; }

  function findUc(id) {
    var list = data().usecases || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  // Menus de la sidebar. `soon: true` = écran pas encore construit (atelier en cours).
  var MENUS = [
    {
      title: "Business",
      items: [
        { id: "personas", label: "Personas", hash: "#/personas", icon: "👤" },
        { id: "usecases", label: "Cas d'usage", hash: "#/usecases", icon: "🎬", soon: true },
      ],
    },
    {
      title: "Technique",
      items: [
        { id: "data-model", label: "Modèle de données", hash: "#/data-model", icon: "🗄", soon: true },
        { id: "archi", label: "Architecture logicielle", hash: "#/archi", icon: "🏗", soon: true },
        { id: "modules", label: "Modules & règles de gestion", hash: "#/modules", icon: "⚙", soon: true },
        { id: "docs", label: "Documents techniques", hash: "#/docs", icon: "📄", soon: true },
      ],
    },
  ];

  // parse(hash) -> { screen, ucId?, personaId? }. Tout hash inconnu retombe sur l'écran Persona.
  function parse(hash) {
    var h = (hash || "").replace(/^#/, "");
    var mStep = h.match(/^\/uc\/([^/]+)\/step\/(\d+)$/);
    if (mStep) {
      var ucS = findUc(mStep[1]);
      var idx = parseInt(mStep[2], 10);
      if (ucS && idx >= 0 && idx < ucS.steps.length) {
        return { screen: "step", ucId: ucS.id, stepIdx: idx };
      }
      if (ucS) return { screen: "usecase", ucId: ucS.id };
    }

    var mUc = h.match(/^\/uc\/([^/]+)$/);
    if (mUc && findUc(mUc[1])) return { screen: "usecase", ucId: mUc[1] };

    var mP = h.match(/^\/personas\/([^/]+)$/);
    if (mP && window.OT.personas.findPersona(mP[1])) return { screen: "personas", personaId: mP[1] };
    for (var i = 0; i < MENUS.length; i++) {
      for (var j = 0; j < MENUS[i].items.length; j++) {
        var it = MENUS[i].items[j];
        if (h === it.hash.replace(/^#/, "")) return { screen: it.id };
      }
    }
    return { screen: "personas" };
  }

  // L'écran d'un use case appartient au menu Business > Personas (fil de navigation).
  function activeMenu(resolved) {
    return (resolved.screen === "usecase" || resolved.screen === "step") ? "personas" : resolved.screen;
  }

  function renderMenus(active) {
    var nav = document.querySelector("#nav .menus");
    nav.innerHTML = "";
    MENUS.forEach(function (section) {
      var sec = el("div", "msection");
      sec.appendChild(el("div", "mtitle", section.title));
      var list = el("ul", "mitems");
      section.items.forEach(function (it) {
        var li = el("li");
        var b = el("button", "mitem" + (it.id === active ? " active" : "") + (it.soon ? " soon" : ""),
          '<span class="ico">' + it.icon + '</span><span class="lbl">' + it.label + "</span>");
        b.addEventListener("click", function () { location.hash = it.hash; });
        li.appendChild(b);
        list.appendChild(li);
      });
      sec.appendChild(list);
      nav.appendChild(list.children.length ? sec : sec);
    });
  }

  function menuItem(id) {
    var found = null;
    MENUS.forEach(function (s) {
      s.items.forEach(function (it) { if (it.id === id) found = it; });
    });
    return found;
  }

  // trail(resolved) -> [{label, hash?}] — le dernier segment est la page courante
  // (jamais de lien). Un segment n'est cliquable que s'il mène à un écran réel.
  function trail(resolved) {
    if (resolved.screen === "personas") {
      var only = resolved.personaId && window.OT.personas.findPersona(resolved.personaId);
      return only
        ? [{ label: "Personas", hash: "#/personas" }, { label: only.name }]
        : [{ label: "Personas" }];
    }

    if (resolved.screen === "usecase" || resolved.screen === "step") {
      var uc = findUc(resolved.ucId);
      var parts = [{ label: "Personas", hash: "#/personas" }];
      var p = window.OT.personas.findPersona(uc.persona);
      if (p) parts.push({ label: p.name, hash: "#/personas/" + p.id });
      if (resolved.screen === "step") {
        parts.push({ label: uc.title, hash: "#/uc/" + uc.id });
        parts.push({ label: uc.steps[resolved.stepIdx].title });
      } else {
        parts.push({ label: uc.title });
      }
      return parts;
    }

    var item = menuItem(resolved.screen);
    return [{ label: item ? item.label : "" }];
  }

  function renderCrumbs(resolved) {
    var bar = el("nav", "crumbs");
    bar.setAttribute("aria-label", "Fil d'Ariane");
    trail(resolved).forEach(function (part, i, all) {
      if (i > 0) bar.appendChild(el("span", "sep", "&gt;"));
      if (part.hash && i < all.length - 1) {
        var a = el("a", null, part.label);
        a.href = part.hash;
        bar.appendChild(a);
      } else {
        bar.appendChild(el("span", "current", part.label));
      }
    });
    return bar;
  }

  function renderView(resolved) {
    var view = document.getElementById("view");
    view.innerHTML = "";
    view.appendChild(renderCrumbs(resolved));

    // L'écran technique est borné en hauteur : son scroll vit dans ses panneaux.
    var screen = el("div", "screen" + (resolved.screen === "step" ? " fill" : ""));
    view.appendChild(screen);

    if (resolved.screen === "personas") {
      window.OT.personas.render(screen, resolved.personaId);
      return;
    }

    if (resolved.screen === "usecase") {
      window.OT.usecase.render(screen, findUc(resolved.ucId));
      return;
    }

    if (resolved.screen === "step") {
      window.OT.step.render(screen, findUc(resolved.ucId), resolved.stepIdx);
      return;
    }

    var item = menuItem(resolved.screen);
    screen.appendChild(el("header", "vhead", "<h1>" + (item ? item.label : "") + "</h1>"));
    screen.appendChild(el("div", "canvas", "<span>écran à construire</span>"));
  }

  function route() {
    var resolved = parse(location.hash);
    renderMenus(activeMenu(resolved));
    renderView(resolved);
  }

  function boot() {
    var project = data().project || {};
    document.querySelector("#nav .brand .project").textContent = project.name || "";
    route();
  }

  window.OT = window.OT || {};
  window.OT.nav = { parse: parse, route: route, trail: trail, MENUS: MENUS };

  window.addEventListener("hashchange", route);
  window.addEventListener("load", boot);
})();
