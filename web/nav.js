/* OT.nav — sidebar de navigation (groupes -> use cases) + routing par hash.
   Refonte KG v0 : le shell et la navigation ; la zone principale est un
   placeholder tant que la vue graphe n'est pas arbitrée. */
(function () {
  "use strict";

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function data() { return window.OPENTOUR_DATA.usecases; }
  function groups() { return data().groups || []; }
  function usecases() { return data().usecases || []; }

  function findUc(id) {
    var list = usecases();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  // parse(hash) -> { ucId } | {} — tout hash inconnu retombe sur l'accueil.
  function parse(hash) {
    var m = (hash || "").replace(/^#/, "").match(/^\/uc\/([^/]+)$/);
    if (m && findUc(m[1])) return { ucId: m[1] };
    return {};
  }

  function matches(uc, q) {
    if (!q) return true;
    var hay = (uc.title + " " + (uc.intent || "") + " " + uc.id).toLowerCase();
    return hay.indexOf(q.toLowerCase()) !== -1;
  }

  var query = "";
  var collapsed = {};

  function renderTree() {
    var tree = document.querySelector("#nav .tree");
    tree.innerHTML = "";
    var current = parse(location.hash).ucId;
    var shown = 0;

    groups().forEach(function (g, gi) {
      var ucs = usecases().filter(function (u) { return u.group === g.id && matches(u, query); });
      if (!ucs.length) return;
      shown += ucs.length;

      var sec = el("div", "group" + (collapsed[g.id] ? " collapsed" : ""));
      sec.style.setProperty("--line", g.color || ("var(--ot-line-" + ((gi % 6) + 1) + ")"));

      var head = el("button", "ghead",
        '<span class="caret">▾</span><span class="swatch"></span>' +
        '<span class="gname">' + g.name + '</span><span class="count">' + ucs.length + "</span>");
      head.addEventListener("click", function () {
        collapsed[g.id] = !collapsed[g.id];
        renderTree();
      });
      sec.appendChild(head);

      var list = el("ul", "ucs");
      ucs.forEach(function (uc) {
        var li = el("li");
        var b = el("button", "uc" + (uc.id === current ? " active" : "") + (uc.status === "draft" ? " draft" : ""), uc.title);
        b.addEventListener("click", function () { location.hash = "#/uc/" + uc.id; });
        li.appendChild(b);
        list.appendChild(li);
      });
      sec.appendChild(list);
      tree.appendChild(sec);
    });

    if (!shown) tree.appendChild(el("div", "empty", "Aucun cas d'usage ne correspond."));
  }

  function renderView() {
    var view = document.getElementById("view");
    view.innerHTML = "";
    var uc = findUc(parse(location.hash).ucId);

    if (!uc) {
      view.appendChild(el("div", "placeholder",
        "<div><p>Choisis un cas d'usage dans la navigation.</p></div>"));
      return;
    }

    var head = el("div", "uchead");
    head.appendChild(el("h1", null, uc.title));
    head.appendChild(el("div", "sub",
      uc.steps.length + " étape" + (uc.steps.length > 1 ? "s" : "")));
    if (uc.intent) head.appendChild(el("p", "intent", uc.intent));
    view.appendChild(head);

    // ponytail: zone graphe volontairement vide en v0 — la représentation
    // du KG est en cours d'arbitrage (références Xmind/mind map à venir).
    view.appendChild(el("div", "canvas", "<span>zone graphe</span>"));
  }

  function route() {
    renderTree();
    renderView();
  }

  function boot() {
    var search = document.querySelector("#nav .search input");
    search.addEventListener("input", function () {
      query = search.value.trim();
      renderTree();
    });

    var project = data().project || {};
    var sub = document.querySelector("#nav .brand .project");
    sub.textContent = project.name || "";

    route();
  }

  window.OT = window.OT || {};
  window.OT.nav = { parse: parse, route: route, matches: matches };

  window.addEventListener("hashchange", route);
  window.addEventListener("load", boot);
})();
