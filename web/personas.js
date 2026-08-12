/* OT.personas — écran "Persona" : mind map persona -> famille -> cas d'usage.
   Registre visuel Xmind : nœuds arrondis en 3 colonnes, connecteurs courbes
   colorés par famille. Les connecteurs sont tracés en SVG APRÈS layout
   (getBoundingClientRect) — le DOM porte la structure, le SVG la décoration. */
(function () {
  "use strict";

  function el(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  // Tout texte issu des données passe par textContent : un libellé métier
  // contient couramment un « < » (« si le montant < 1000 € ») qui casserait le
  // rendu en innerHTML — et personne ne veut d'un balisage injecté par la donnée.
  function elText(tag, cls, text) {
    var e = el(tag, cls);
    e.textContent = text;
    return e;
  }

  function data() { return window.OPENTOUR_DATA.usecases; }

  function famColor(group, i) {
    return (group && group.color) || "var(--ot-line-" + ((i % 6) + 1) + ")";
  }

  // Familles d'un persona, dans l'ordre de déclaration des groupes (stable).
  // Les cas d'usage sans famille connue (`groups` absent, ou `group` qui ne
  // correspond à rien) sont regroupés dans une famille de repli : un cas
  // d'usage valide ne doit JAMAIS disparaître en silence de l'écran.
  function familiesOf(personaId) {
    var groups = data().groups || [];
    var mine = (data().usecases || []).filter(function (u) { return u.persona === personaId; });
    var known = {};
    groups.forEach(function (g) { known[g.id] = true; });

    var out = [];
    groups.forEach(function (g, gi) {
      var ucs = mine.filter(function (u) { return u.group === g.id; });
      if (ucs.length) out.push({ group: g, index: gi, ucs: ucs });
    });

    var orphans = mine.filter(function (u) { return !known[u.group]; });
    if (orphans.length) {
      out.push({
        group: { id: "__sans_famille__", name: "Sans famille", icon: "•", color: "var(--ot-muted)" },
        index: out.length,
        ucs: orphans,
      });
    }
    return out;
  }

  function renderPersonaMap(persona) {
    var fams = familiesOf(persona.id);
    var sec = el("section", "pmap");

    var pcol = el("div", "col-persona");
    var pnode = el("div", "node persona");
    pnode.appendChild(elText("span", "ico", persona.icon || ""));
    pnode.appendChild(elText("span", "lbl", persona.name));
    pcol.appendChild(pnode);
    sec.appendChild(pcol);

    var fcol = el("div", "col-fams");
    fams.forEach(function (f) {
      var row = el("div", "fam-row");
      row.style.setProperty("--fam", famColor(f.group, f.index));

      var fnode = el("div", "node fam");
      fnode.appendChild(elText("span", "ico", f.group.icon || ""));
      fnode.appendChild(elText("span", "lbl", f.group.name));
      fnode.appendChild(elText("span", "cnt", String(f.ucs.length)));
      row.appendChild(fnode);

      var ucol = el("div", "col-ucs");
      f.ucs.forEach(function (uc) {
        var b = elText("button", "node uc" + (uc.status === "draft" ? " draft" : ""), uc.title);
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

  function findPersona(id) {
    var list = data().personas || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  // OT.personas.render(host, personaId?) — tous les personas, ou un seul si ciblé.
  function render(host, personaId) {
    var d = data();
    var only = personaId ? findPersona(personaId) : null;

    var vhead = el("header", "vhead");
    vhead.appendChild(elText("h1", null, only ? only.name : "Personas"));
    vhead.appendChild(elText("p", "sub", only
      ? (only.description || "Ses cas d'usage, par famille.")
      : "Qui utilise " + (d.project.name || "l'application") + ", et pour quoi faire."));
    host.appendChild(vhead);

    var wrap = el("div", "pmaps");
    (only ? [only] : d.personas || []).forEach(function (p) {
      wrap.appendChild(renderPersonaMap(p));
    });
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
  window.OT.personas = { render: render, familiesOf: familiesOf, curve: curve, findPersona: findPersona };
})();
