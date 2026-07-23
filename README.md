# open-tour

Visite guidée d'une codebase par le métier : personas → use cases → flow fonctionnel → drill-down technique (module → classe → fonction).

On ne part pas du graphe technique, on part des cas d'usage. Le knowledge-graph produit par le pipeline maison (`pipeline/run.py` → `<projet>/.open-tour/knowledge-graph.json`) sert de couche implémentation — aucune ré-analyse du code au rendu.

## Proto (étape actuelle)

Proto validé sur des projets internes — le contenu (use cases, personas, groupes) vit dans les repos analysés, pas ici.

Le repo open-tour est **générique** : tout le contenu projet vit dans le repo du projet analysé, sous `<project-root>/.open-tour/` (`usecases/` committé ; `knowledge-graph.json`, `intermediate/`, `data.js` régénérables et ignorés — cf. `docs/data-contract.md`).

- `<project>/.open-tour/usecases/` — un fichier markdown par entité (OKF) : `index.md` (projet), `personas/*.md`, `groups/*.md`, `<id>.md` par use case (frontmatter plat + scénario Gherkin fr)
- `tools/build_data.py <project-root>` — fusionne `usecases/` + `knowledge-graph.json` → `<project>/.open-tour/data.js`
- `tools/gen_usecases.py <project-root>` — génère des brouillons `status: draft` dans `usecases/` depuis le knowledge-graph (candidats non couverts) via le CLI `claude`
- `web/index.html` — page statique zéro dépendance (stepper fonctionnel, drill-down 3 niveaux)

Lancer : `python tools/build_data.py <project-root> && python tools/serve.py <project-root>` (sert le viewer `web/` + le `data.js` du projet + endpoint `/src` de lazy loading du code source local) puis http://127.0.0.1:8642/

## Prérequis d'un projet cible (contrat d'entrée, version industrialisée)

- Specs fonctionnelles exploitables (docs/specs ou équivalent)
- Couverture de tests > 85 % + tests e2e (les steps du flow s'ancrent sur les tests)
- Knowledge-graph à jour (`python pipeline/run.py --project <path>`)

## Licence

MIT — voir [LICENSE](LICENSE). `pipeline/vendor/ua/` contient une version émondée du core d'[Understand-Anything](https://github.com/Egonex-AI/Understand-Anything) (MIT), utilisé pour le scan tree-sitter du pipeline.
