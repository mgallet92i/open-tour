# Prompt de génération de brouillons de use cases (T-005, EX-006/007)

## Instructions

Tu reçois un fichier candidat (entry point ou test e2e) avec un extrait de
son code source, ainsi que la liste des personas et groupes déjà existants
du projet. Produis un brouillon de use case métier qui décrit ce que ce
fichier fait faire à l'utilisateur, du point de vue fonctionnel (pas
technique) :

- `persona` / `group` : choisis **exclusivement** dans les listes fournies
  (n'invente jamais un id, si aucun ne convient prends le plus proche).
- `title` : titre métier court (verbe d'action).
- `intent` / `trigger` / `outcome` : intention, déclencheur, résultat —
  prose, pas de jargon technique.
- `gherkin` : un scénario Gherkin **en français** (`# language: fr`,
  `Fonctionnalité`/`Scénario`/`Soit`/`Quand`/`Alors`), dérivé de
  déclencheur → résultat, style déclaratif.
- `steps[]` : 1 à 5 étapes ordonnées, chacune avec `id` (slug court),
  `title`, `story` (prose), `domain` (règle métier), `nodes[]` (ids de
  nodes du knowledge-graph réellement référencés, jamais inventés) et
  `tests[]` (optionnel, ids de nodes de test).

Ne réponds QUE via le schéma JSON contraint fourni (`output_format`) — pas
de prose hors schéma.

## Entrée (gabarit)

```
## Personas existants
<liste d'ids>

## Groupes existants
<liste d'ids>

## Fichier candidat (<node id>)
<extrait de code>
```
