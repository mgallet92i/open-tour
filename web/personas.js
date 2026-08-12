/* OT.personas — écran "Persona" : mind map persona -> famille -> cas d'usage.
   Registre visuel Xmind : nœuds arrondis en 3 colonnes, connecteurs courbes
   colorés par famille. Les connecteurs sont tracés en SVG APRÈS layout
   (getBoundingClientRect) — le DOM porte la structure, le SVG la décoration. */
(function () {
  "use strict";

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function data() { return window.OPENTOUR_DATA.usecases; }

  function famColor(group, i) {
    return (group && group.color) || "var(--ot-line-" + ((i % 6) + 1) + ")";
  }

  // Familles d'un persona, dans l'ordre de déclaration des groupes (stable).
  function familiesOf(personaId) {
    var groups = data().groups || [];
    var out = [];
    groups.forEach(function (g, gi) {
      var ucs = (data().usecases || []).filter(function (u) {
        return u.persona === personaId && u.group === g.id;
      });
      if (ucs.length) out.push({ group: g, index: gi, ucs: ucs });
    });
    return out;
  }

  function renderPersonaMap(persona) {
    var fams = familiesOf(persona.id);
    var sec = el("section", "pmap");

    var pcol = el("div", "col-persona");
    var pnode = el("div", "node persona",
      '<span class="ico">' + (persona.icon || "") + "</span>" +
      '<span class="lbl">' + persona.name + "</span>");
    pcol.appendChild(pnode);
    sec.appendChild(pcol);

    var fcol = el("div", "col-fams");
    fams.forEach(function (f) {
      var row = el("div", "fam-row");
      row.style.setProperty("--fam", famColor(f.group, f.index));

      var fnode = el("div", "node fam",
        '<span class="ico">' + (f.group.icon || "") + "</span>" +
        '<span class="lbl">' + f.group.name + "</span>" +
        '<span class="cnt">' + f.ucs.length + "</span>");
      row.appendChild(fnode);

      var ucol = el("div", "col-ucs");
      f.ucs.forEach(function (uc) {
        var b = el("button", "node uc" + (uc.status === "draft" ? " draft" : ""), uc.title);
        b.addEventListener("click", function () { location.hash = "#/uc/" + uc.id; });
        ucol.appendChild(b);
      });
      row.appendChild(ucol);
      fcol.appendChild(row);
    });
    sec.appendChild(fcol);

    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "links");
    svg.setAttribute("aria-hidden", "true");
    sec.appendChild(svg);

    return sec;
  }

  // Courbe horizontale entre le bord droit de `from` et le bord gauche de `to`.
  function curve(from, to, origin) {
    var x1 = from.right - origin.left, y1 = from.top + from.height / 2 - origin.top;
    var x2 = to.left - origin.left, y2 = to.top + to.height / 2 - origin.top;
    var dx = Math.max((x2 - x1) * 0.5, 12);
    return "M " + x1 + " " + y1 + " C " + (x1 + dx) + " " + y1 + ", " + (x2 - dx) + " " + y2 + ", " + x2 + " " + y2;
  }

  function drawLinks(sec) {
    var svg = sec.querySelector("svg.links");
    var origin = sec.getBoundingClientRect();
    svg.setAttribute("viewBox", "0 0 " + origin.width + " " + origin.height);
    svg.setAttribute("width", origin.width);
    svg.setAttribute("height", origin.height);
    svg.innerHTML = "";

    var pnode = sec.querySelector(".node.persona");
    if (!pnode) return;
    var pbox = pnode.getBoundingClientRect();

    function path(d, stroke, w) {
      var p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", d);
      p.setAttribute("fill", "none");
      p.setAttribute("stroke", stroke);
      p.setAttribute("stroke-width", w);
      p.setAttribute("stroke-linecap", "round");
      svg.appendChild(p);
    }

    Array.prototype.forEach.call(sec.querySelectorAll(".fam-row"), function (row) {
      var color = getComputedStyle(row).getPropertyValue("--fam").trim();
      var fnode = row.querySelector(".node.fam");
      path(curve(pbox, fnode.getBoundingClientRect(), origin), color, 3);
      var fbox = fnode.getBoundingClientRect();
      Array.prototype.forEach.call(row.querySelectorAll(".node.uc"), function (uc) {
        path(curve(fbox, uc.getBoundingClientRect(), origin), color, 1.5);
      });
    });
  }

  // OT.personas.render(host) — écran complet (tous les personas).
  function render(host) {
    var d = data();
    host.appendChild(el("header", "vhead",
      "<h1>Personas</h1><p class=\"sub\">Qui utilise " + (d.project.name || "l'application") +
      ", et pour quoi faire.</p>"));

    var wrap = el("div", "pmaps");
    (d.personas || []).forEach(function (p) { wrap.appendChild(renderPersonaMap(p)); });
    host.appendChild(wrap);

    function redraw() {
      Array.prototype.forEach.call(wrap.querySelectorAll(".pmap"), drawLinks);
    }
    window.requestAnimationFrame(redraw);
    if (window.OT._redraw) window.removeEventListener("resize", window.OT._redraw);
    window.OT._redraw = redraw;
    window.addEventListener("resize", redraw);
  }

  window.OT = window.OT || {};
  window.OT.personas = { render: render, familiesOf: familiesOf, curve: curve };
})();
