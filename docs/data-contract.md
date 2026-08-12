# Contrat de données — `data.js` (T-008, EX-013)

`<project>/.open-tour/data.js` est produit par `tools/build_data.py
<project-root>` à partir de deux sources, toutes deux **dans le repo du
projet analysé** : `<project>/.open-tour/usecases/` (racine `usecases`, un
fichier markdown par entité — OKF, `tools/_usecase_md.py`) et
`<project>/.open-tour/knowledge-graph.json` (racine `graph`, filtré aux
seuls nodes référencés par les use cases).

## Layout générique — tout le contenu projet vit chez le projet

Le repo open-tour est générique (outil open-sourçable) : il ne contient
**aucun contenu projet**. Chaque projet analysé porte son dossier
`.open-tour/` :

```
<project-root>/.open-tour/
├── usecases/               # contenu curé, committé (index.md, personas/, groups/, <id>.md)
├── knowledge-graph.json    # produit par pipeline/run.py — régénérable, ignoré
├── intermediate/           # artefacts pipeline — régénérables, ignorés
└── data.js                 # produit par build_data.py — régénérable, ignoré
```

Gitignore conseillé côté projet : `.open-tour/*` + `!.open-tour/usecases/`.

Résolution commune à `build_data.py`, `gen_usecases.py` et `serve.py`
(argument positionnel `<project-root>` obligatoire) :

- projet valide si `<project-root>/.open-tour/usecases/index.md` existe,
  sinon message d'erreur + exit 1 — **pas de défaut silencieux** ;
- `graphSource` (frontmatter d'`index.md`) est **optionnel** : défaut
  `../knowledge-graph.json`, résolu relativement à `usecases/` — plus de
  chemin absolu committé ;
- un `data.js` **par projet** (`.open-tour/data.js`) ; `serve.py
  <project-root>` sert le viewer générique `web/` et expose ce fichier à
  l'URL `/data.js` (pas de sélecteur de projet — non-goal).

```
window.OPENTOUR_DATA = { "usecases": {...}, "graph": {...} };
```

## Racine `usecases` (assemblée depuis `<project>/.open-tour/usecases/`)

| Champ | Type | Description |
|---|---|---|
| `project.name` | string | Nom du projet analysé |
| `project.description` | string | Résumé métier (rédigé à la main, pas dérivé du pipeline) |
| `project.graphSource` | string | Chemin résolu vers `knowledge-graph.json` (frontmatter optionnel, défaut `../knowledge-graph.json` relatif à `usecases/`) |
| `personas[]` | array | `{id, name, icon, description}` |
| `groups[]` | array | `{id, name, icon, description, color}` — lignes du plan (métro), EX-015 |
| `usecases[]` | array | `{id, persona, group, title, status, intent, trigger, outcome, scenario, steps[]}` |
| `usecases[].group` | string | FK → `groups[].id` (NOUVEAU, EX-015) |
| `usecases[].status` | `"draft"` \| `"validated"` | Curation humaine (NOUVEAU, EX-002/005) — `draft` tant qu'un humain n'a pas relu |
| `usecases[].scenario` | string \| null | Bloc Gherkin fr brut (`# language: fr`), `null` pour un stub sans étapes (NOUVEAU, EX-003) |
| `usecases[].steps[]` | array | Étapes du parcours — **liste plate ordonnée, sans branchement** (voir ci-dessous) |

### `usecases[].steps[]` (une étape du parcours)

| Champ | Type | Description |
|---|---|---|
| `id` | string | Identifiant de l'étape |
| `title` | string | Intitulé de l'étape (nœud du logigramme) |
| `story` | string | Récit fonctionnel de ce qui se passe à cette étape |
| `domain` | string | **Règle de gestion** portée par l'étape (fr) |
| `nodes[]` | string[] | Ids de nodes du graphe référencés par l'étape |
| `tests[]` | string[] | Ids de nodes de test référencés (optionnel) |

⚠️ **Aucune information de branchement.** `steps[]` est une séquence linéaire : pas de
condition, pas de chemin alternatif, pas de boucle. L'écran Use case rend donc un
logigramme **séquentiel** (`web/usecase.js`). Dessiner des losanges de décision
exigerait d'abord d'extraire les branches en amont (Gherkin, call-graph, ou
`decisions` des Flows Salesforce) — chantier pipeline, pas chantier UI.

### `groups[]` (NOUVEAU, EX-015)

| Champ | Type | Description |
|---|---|---|
| `id` | string | Identifiant de la ligne (FK cible pour `usecases[].group`) |
| `name` | string | Nom de la ligne affiché au plan |
| `icon` | string | Icône de la ligne |
| `description` | string | Résumé de la ligne |
| `color` | string | Couleur de ligne, **distincte par ligne** (INV-007). Posée par le plan en variable CSS locale `--line` sur `.mline` (ui.md §2.2). Une échelle de secours (`--ot-line-1..6`, tokens.css) est cyclée par ordre de déclaration si `color` est absent ou en collision. |

## Racine `graph` — dict `{node_id: FileEntry}`

Un seul niveau : uniquement les nodes de **type `file`** référencés (directement
ou via leurs symboles) par `usecases`. Structure par entrée :

| Champ | Type | Source (knowledge-graph.json) |
|---|---|---|
| `id` | string | `node.id` (`file:<relpath>`) |
| `type` | `"file"` | `node.type` |
| `name` | string | `node.name` |
| `title` | string \| null | dérivé de `summary` par `short_title()` (1re proposition, ≤ 60 car.) |
| `filePath` | string | `node.filePath` |
| `summary` | string | `node.summary` (produit par `enrich.py`, EX-005/006) |
| `tags` | string[] | `node.tags` (EX-005) |
| `rules` | string[] | `node.rules` — règles de gestion fr (`enrich.py`), défaut `[]` si absent |
| `symbols[]` | array | fonctions/classes du fichier (edges `contains`) |
| `tests[]` | string[] | ids de nodes test liés (edges `tested_by`, EX-007) |
| `flow` | object \| null | call-graph intra-module dérivé des edges `calls` du knowledge-graph (`build_flow`), tous langages — `null` si aucun symbole du fichier n'a de `lineRange` exploitable |

### `symbols[]` (fonctions/classes contenues dans le fichier)

| Champ | Type | Source |
|---|---|---|
| `id` | string | `function:<relpath>:<name>` \| `class:<relpath>:<name>` |
| `type` | `"function"` \| `"class"` | `node.type` |
| `name` | string | `node.name` |
| `title` | string \| null | dérivé de `summary` |
| `summary` | string | `node.summary` |
| `rules` | string[] | `node.rules` — règles portées par le symbole, défaut `[]` |
| `lineRange` | `[start, end]` | `node.lineRange` |
| `tests[]` | string[] | edges `tested_by` dont la source est ce symbole |

## Champs volontairement non requis (YAGNI)

`layers`, `tour`, `project.description`/`frameworks` du schéma UA complet ne
sont **pas** consommés par `web/index.html` — `merge.py` (T-006) ne les
écrit pas (design.md §3, §6).

## Exemple minimal

```json
{
  "usecases": { "project": {"name": "DEMO_PROJECT", "graphSource": "..."}, "personas": [], "usecases": [] },
  "graph": {
    "file:core/legacy_csv.py": {
      "id": "file:core/legacy_csv.py",
      "type": "file",
      "name": "legacy_csv.py",
      "title": "Parse les CSV d'export et normalise les colonnes",
      "filePath": "core/legacy_csv.py",
      "summary": "Parse les CSV d'export et normalise les colonnes",
      "tags": ["csv", "parsing", "legacy"],
      "rules": ["Les colonnes manquantes sont normalisées à vide avant import"],
      "symbols": [
        {"id": "function:core/legacy_csv.py:load_all_csv", "type": "function", "name": "load_all_csv",
         "title": "Charge tous les CSV du répertoire", "summary": "Charge tous les CSV du répertoire",
         "rules": ["Un fichier CSV vide est ignoré sans erreur"],
         "lineRange": [300, 395], "tests": ["file:tests/core/test_legacy_csv.py"]}
      ],
      "tests": ["file:tests/core/test_legacy_csv.py"],
      "flow": {"defs": {"...": {"start": 1, "end": 10, "calls": []}}, "entries": ["load_all_csv"]}
    }
  }
}
```
