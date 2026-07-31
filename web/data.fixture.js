// Fixture synthétique pour les self-checks Node (web/*.test.js).
// Aucun contenu projet : dataset minimal conforme à docs/data-contract.md.
window.OPENTOUR_DATA = {
 "usecases": {
  "project": {
   "name": "FIXTURE_PROJECT",
   "description": "Projet fixture des self-checks.",
   "graphSource": "/fixture/knowledge-graph.json"
  },
  "personas": [
   {"id": "dev", "name": "Équipe Dev", "icon": "🧑‍💻", "description": "Développe le produit."},
   {"id": "ops", "name": "Équipe Ops", "icon": "🛠️", "description": "Exploite le produit."}
  ],
  "groups": [
   {"id": "core", "name": "Cœur", "icon": "⚙️", "color": "#3e689e", "description": "Fonctions cœur."},
   {"id": "quality", "name": "Qualité", "icon": "🧪", "color": "#b0653a", "description": "Recette."}
  ],
  "usecases": [
   {
    "id": "uc-demo", "persona": "dev", "group": "core", "title": "Use case de démonstration",
    "status": "validated", "intent": "Démontrer.", "trigger": "Un clic.", "outcome": "Un résultat.",
    "scenario": "# language: fr\nFonctionnalité: Démo\n  Scénario: Nominal\n    Soit une fixture\n    Quand le test tourne\n    Alors il passe",
    "steps": [
     {"id": "s1", "title": "Étape 1", "story": "Story 1.", "domain": "Domaine 1.",
      "nodes": ["file:src/a.py", "file:src/b.py"], "tests": ["file:tests/test_a.py"]},
     {"id": "s2", "title": "Étape 2", "story": "Story 2.", "domain": "Domaine 2.",
      "nodes": ["file:src/c.py", "file:src/d.py"], "tests": ["file:tests/test_b.py", "file:tests/test_c.py"]},
     {"id": "s3", "title": "Étape 3", "story": "Story 3.", "domain": "Domaine 3.",
      "nodes": ["file:src/e.py", "file:src/f.py"], "tests": ["file:tests/test_d.py", "file:tests/test_e.py"]},
     {"id": "s4", "title": "Étape 4", "story": "Story 4.", "domain": "Domaine 4.",
      "nodes": ["file:src/g.py", "file:src/h.py"], "tests": ["file:tests/test_f.py", "file:tests/test_g.py"]},
     {"id": "s5", "title": "Étape 5", "story": "Story 5.", "domain": "Domaine 5.",
      "nodes": ["file:src/i.py", "file:src/j.py"], "tests": ["file:tests/test_h.py"]}
    ]
   },
   {
    "id": "uc-soon", "persona": "ops", "group": "quality", "title": "Use case à venir",
    "status": "draft", "intent": "Bientôt.", "trigger": "Bientôt.", "outcome": "Bientôt.",
    "scenario": null, "steps": []
   }
  ]
 },
 "graph": {
  "file:src/a.py": {
   "id": "file:src/a.py", "type": "file", "name": "a.py", "title": "Module A",
   "filePath": "src/a.py", "summary": "Module A de la fixture.", "tags": ["entrypoint"],
   "rules": ["Le module A ne démarre que si la configuration est chargée."],
   "symbols": [
    {"id": "function:src/a.py:run", "type": "function", "name": "run", "title": "Lance le module A",
     "summary": "Lance le module A.", "rules": ["Un appel sans argument utilise la valeur par défaut."],
     "lineRange": [1, 10], "tests": ["file:tests/test_a.py"]}
   ],
   "tests": ["file:tests/test_a.py"],
   "flow": {"defs": {"run": {"start": 1, "end": 10, "calls": []}}, "entries": ["run"]}
  }
 }
};
