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

  // parse(hash) -> { screen, ucId? }. Tout hash inconnu retombe sur l'écran Persona.
  function parse(hash) {
    var h = (hash || "").replace(/^#/, "");
    var mUc = h.match(/^\/uc\/([^/]+)$/);
    if (mUc && findUc(mUc[1])) return { screen: "usecase", ucId: mUc[1] };
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
    return resolved.screen === "usecase" ? "personas" : resolved.screen;
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

  function renderView(resolved) {
    var view = document.getElementById("view");
    view.innerHTML = "";

    if (resolved.screen === "personas") {
      window.OT.personas.render(view);
      return;
    }

    if (resolved.screen === "usecase") {
      var uc = findUc(resolved.ucId);
      var head = el("header", "vhead");
      head.appendChild(el("h1", null, uc.title));
      if (uc.intent) head.appendChild(el("p", "sub", uc.intent));
      view.appendChild(head);
      // ponytail: écran Use case (logigramme des steps) = prochaine itération d'atelier.
      view.appendChild(el("div", "canvas", "<span>logigramme des " + uc.steps.length + " étapes — à construire</span>"));
      return;
    }

    var item = null;
    MENUS.forEach(function (s) {
      s.items.forEach(function (it) { if (it.id === resolved.screen) item = it; });
    });
    view.appendChild(el("header", "vhead", "<h1>" + (item ? item.label : "") + "</h1>"));
    view.appendChild(el("div", "canvas", "<span>écran à construire</span>"));
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
  window.OT.nav = { parse: parse, route: route, MENUS: MENUS };

  window.addEventListener("hashchange", route);
  window.addEventListener("load", boot);
})();
