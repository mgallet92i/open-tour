/* OT.router — routing par hash, 3 écrans (plan / itinéraire / étape).
   Contrat : design.md §3.1 (table routing), §3.2 (contrat OT.router). */
(function () {
  "use strict";

  function findUc(id) {
    var list = (window.OPENTOUR_DATA && window.OPENTOUR_DATA.usecases.usecases) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function personaExists(id) {
    var list = (window.OPENTOUR_DATA && window.OPENTOUR_DATA.usecases.personas) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return true;
    }
    return false;
  }

  // parse(hash) -> { screen:'plan'|'itinerary'|'step', ucId?, stepIdx?, persona? }
  // Résout aussi les fallbacks INV-004 (hash/uc/step inconnu -> jamais d'écran cassé).
  function parse(hash) {
    var h = (hash || "").replace(/^#/, "");

    var mStep = h.match(/^\/uc\/([^/]+)\/step\/(\d+)$/);
    if (mStep) {
      var uc = findUc(mStep[1]);
      if (!uc || uc.steps.length === 0) return { screen: "plan" };
      var idx = parseInt(mStep[2], 10);
      if (idx < 0 || idx >= uc.steps.length) return { screen: "itinerary", ucId: uc.id };
      return { screen: "step", ucId: uc.id, stepIdx: idx };
    }

    var mUc = h.match(/^\/uc\/([^/]+)$/);
    if (mUc) {
      var uc2 = findUc(mUc[1]);
      if (!uc2 || uc2.steps.length === 0) return { screen: "plan" };
      return { screen: "itinerary", ucId: uc2.id };
    }

    var mPersona = h.match(/^\/plan\/p\/([^/]+)$/);
    if (mPersona) {
      var persona = mPersona[1];
      if (!personaExists(persona)) return { screen: "plan" };
      return { screen: "plan", persona: persona };
    }

    // '#/plan', '#/', '', ou tout hash inconnu -> plan (INV-004)
    return { screen: "plan" };
  }

  // route() : lit location.hash, résout, vide #app et délègue au renderer (INV-001).
  function route() {
    var resolved = parse(location.hash);
    // fix RV : une navigation (back/forward/hashchange) doit fermer la modale
    // code source encore ouverte (drilldown.js .overlay), sinon elle flotte
    // hors écran jusqu'à Échap. Un seul point de passage : route().
    var overlay = document.querySelector(".overlay");
    if (overlay) overlay.remove();
    var app = document.getElementById("app");
    if (app) app.innerHTML = "";

    if (resolved.screen === "plan") {
      window.OT.screens.renderPlan(resolved.persona);
    } else if (resolved.screen === "itinerary") {
      window.OT.screens.renderItinerary(findUc(resolved.ucId));
    } else if (resolved.screen === "step") {
      window.OT.drilldown.renderStep(findUc(resolved.ucId), resolved.stepIdx);
    }
  }

  // navigate(hash) : historique natif — un hashchange déclenche route() (EX-012).
  function navigate(hash) {
    location.hash = hash;
  }

  window.OT = window.OT || {};
  window.OT.router = { parse: parse, route: route, navigate: navigate };

  window.addEventListener("hashchange", route);
  window.addEventListener("load", route);
})();
