# Prompt d'enrichissement — pipeline-metadata (T-005)

Dérivé de `file-analyzer.md` (Understand-Anything), périmètre réduit :
uniquement résumé + tags + complexité par node (EX-005/006). Le call-graph
et les liens `tested_by` sont déjà déterministes (structure.py / merge.py,
INV-004) — ce prompt n'en produit aucun.

## Instructions

Tu reçois une liste de nodes de code (fichiers, fonctions, classes) avec un
extrait de leur code source. Pour CHAQUE node de la liste, produis :

- `summary` : 1 phrase, la proposition la plus informative en tête (ex.
  "Parse un fichier CSV d'export et normalise les colonnes" plutôt que
  "Cette fonction sert à..."). Pas de ponctuation finale superflue.
- `tags` : 2 à 5 mots-clés courts (domaine métier ou technique). En plus de
  ces tags libres, pour les nodes de type `file` uniquement, ajoute ces tags
  contrôlés quand ils s'appliquent (consommés par la détection de use cases) :
  - `entrypoint` : le fichier est le point d'entrée d'un parcours utilisateur
    ou système (main/CLI, controller ou endpoint HTTP, trigger, page ou
    composant UI racine, job planifié).
  - `e2e` : test de bout en bout ou d'intégration exerçant un parcours
    complet (pas un test unitaire isolé).
- `complexity` : `"simple"` | `"moderate"` | `"complex"`, jugé sur la
  logique (branches, boucles, effets de bord), pas sur la longueur brute.

Ne réponds QUE via le schéma JSON contraint fourni (`output_format`) — pas
de prose hors schéma, pas de node omis, pas de node inventé.

## Entrée (gabarit)

```
Nodes à enrichir (id | type | name | filePath | extrait) :
<liste rendue par enrich.py>
```
