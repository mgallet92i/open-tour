# AGENTS.md — open-tour

Visite guidée d'une codebase par le métier : personas → use cases → flow → drill-down technique.

## Règle d'or : le repo est générique, le contenu vit chez le projet analysé

Aucun contenu projet ici. Tout vit dans `<project-root>/.open-tour/` :

```
<project-root>/.open-tour/
├── usecases/            # curé à la main, COMMITTÉ (index.md, personas/, groups/, <id>.md)
├── knowledge-graph.json # pipeline/run.py — régénérable, ignoré
├── intermediate/        # artefacts pipeline — régénérables, ignorés
└── data.js              # tools/build_data.py — régénérable, ignoré
```

⚠️ Ne **jamais** gitignorer `.open-tour/` en bloc côté projet : `usecases/` doit être versionné.
Gitignore correct : `.open-tour/*` + `!.open-tour/usecases/`.

## codegraph vs open-tour — dépendance, pas concurrence

Même relation que `node_modules/` vs `dist/` :

| | `.codegraph/` | `.open-tour/` |
|---|---|---|
| Rôle | **entrée de build** | **artefact de sortie** |
| Contenu | index SQLite (`codegraph.db`) | use cases curés + graphe |
| Git | **gitignoré**, régénérable | `usecases/` **committé** |
| Produit par | CLI `codegraph` (npm) | `pipeline/run.py` + `build_data.py` |

`codegraph` est un **prérequis d'exécution** du pipeline, pas une alternative :
- `pipeline/_common.py::ensure_codegraph_index()` lance `codegraph init` (si `.codegraph/` absent) sinon `sync` ;
- `scan.py` et `structure.py` lisent ensuite `.codegraph/codegraph.db` en SQL `mode=ro` ;
- `check_host_prereqs()` échoue net si le binaire est absent (`npm i -g @colbymchenry/codegraph`).

Version validée : `CODEGRAPH_TESTED_VERSION` dans `_common.py` (schéma DB non garanti stable).
En cas de casse après upgrade : les seules requêtes SQL sont dans `scan.py` et `structure.py::_load_codegraph_index`.

## Pipeline — `python pipeline/run.py --project <path>` (6 phases)

| # | Module | Fait quoi |
|---|---|---|
| 1 | `scan.py` | `codegraph init/sync` + inventaire fichiers (Node vendorisé) + importMap depuis `codegraph.db` → `intermediate/scan-result.json` |
| 2 | `batch.py` | clustering Louvain (`compute-batches.mjs` vendorisé) → `batches.json` |
| 3 | `structure.py` | nodes/edges du schéma UA depuis `codegraph.db` (déterministe) → `batch-<i>.json` |
| 4 | `flows.py` | **Salesforce** : parse les `.flow-meta.xml` (xml.etree stdlib), ajoute arêtes `calls`/`imports` + expose `flow_digest()`. **No-op** sans `.flow-meta.xml` |
| 5 | `enrich.py` | `summary`/`tags`/`rules` par LLM (Claude Agent SDK, `output_format json_schema`) |
| 6 | `merge.py` | fusion + `tested_by` → `<project>/.open-tour/knowledge-graph.json` |

Prérequis hôte (`check_host_prereqs`) : binaire `codegraph`, Node ≥ 22, et une auth Anthropic
(`ANTHROPIC_API_KEY` **ou** CLI `claude` sur le PATH — le SDK hérite du login).

## Outils

- `tools/build_data.py <project-root>` — `usecases/` + `knowledge-graph.json` → `data.js` (filtré aux nodes référencés). Contrat : `docs/data-contract.md`.
- `tools/gen_usecases.py <project-root> [--dry-run] [--only id1,id2]` — brouillons `status: draft` pour les candidats non couverts. N'écrase jamais un fichier existant.
- `tools/serve.py <project-root> [port]` — sert `web/` + le `data.js` du projet + `/src` (lecture disque local). → http://127.0.0.1:8642/

## Contraintes à ne pas casser

- `web/` est **zéro dépendance runtime** (Playwright est une devDependency de test). Pas de framework, pas de bundler.
- Les use cases suivent le pattern **OKF** : un `.md` par entité, frontmatter plat, scénario Gherkin fr.
- `pipeline/vendor/ua/` = fork émondé d'Understand-Anything (MIT). Ne pas y toucher hors resync.
- Sortie console : Windows en cp1252, encoder en `errors="replace"` (cf. `_common.py`).

## Tests

```bash
python -m pytest pipeline tools                       # unitaires Python (13)
for t in index code; do node web/$t.test.js; done     # web (45 assertions)
python pipeline/_common.py                            # self-checks de module
```

Les tests web sont des **self-checks Node sans framework** (`assert` stdlib, DOM factice) — pas de jsdom, pas de runner.

⚠️ `npm run test:e2e` **ne marche pas** : `playwright.config.ts` pointe sur `testDir: ./e2e`, répertoire absent du repo (les specs e2e dépendaient d'un projet interne). Soit écrire les specs, soit retirer la config — ne pas la documenter comme fonctionnelle.

---

<!-- deluminator:debut — bloc gere par `deluminator sync`, ne pas editer a la main -->

## Suivi des taches — norme Deluminator

**Une tache vit dans le depot qu'elle concerne**, jamais ailleurs : `.df/taches/<id>.md`, un
fichier par tache. Pas de Jira, pas de TODO en prose, pas de backlog dans le HANDOFF. Un constat
sur un autre depot se depose **dans ce depot-la**.

Les identifiants sont a **portee de depot** : `T-001` peut exister partout sans collision,
l'adressage inter-depots etant le couple *(depot, id)*.

Un fichier = un frontmatter + un corps libre.

```markdown
---
type: "tache"
id: "T-001"
titre: "Libelle court, sans le detail"
statut: "A faire"
priorite: "2. Moyen"
echeance: null
theme: "Infra"
maj: "2026-08-21"
---

Le detail, le pourquoi, les pistes, ce qui a ete essaye. Lien vers une autre tache : [[T-002]].
```

- `statut` : `A faire` | `En cours` | `En attente` | `Termine`
- `priorite` : `1. Haut` | `2. Moyen` | `3. Bas` (le rang prefixe rend le tri lexical correct)
- `echeance` : `"2026-09-30"` ou `null`

> **INVARIANT — toute valeur de frontmatter est un litteral JSON** (chaine entre guillemets,
> nombre, booleen ou `null`). C'est du YAML valide, JSON en etant un sous-ensemble, et ca se lit
> sans analyseur YAML donc sans dependance. Un titre contenant `:`, `---`, `#` ou un saut de ligne
> ne peut ni casser le document ni etre altere. Une valeur non quotee est **refusee franchement**,
> jamais devinee.

Apres **toute** ecriture dans `.df/taches/`, regenerer l'index :

```
deluminator index          # regenere .df/taches/index.md
deluminator index --check  # ne regenere rien, ECHOUE si l'index est perime
```

`index.md` est **genere** : committe, trie, sans horodatage — ne jamais l'editer a la main.
Outil : `C:/projets/deluminator` (installation : `npm i -g .` depuis ce dossier).

<!-- deluminator:fin -->
