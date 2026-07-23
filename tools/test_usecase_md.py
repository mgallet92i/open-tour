"""Test unitaire T-002 : round-trip parse<->render de tools/_usecase_md.py.

Usage : python tools/test_usecase_md.py (ou pytest tools/).
"""
from _usecase_md import parse_frontmatter, parse_usecase_body, render_usecase_md

USECASE_MD = """---
type: usecase
id: gen-rapport-hebdo
persona: analyste
group: gen
status: validated
title: Générer le rapport hebdomadaire d'activité
---
# Intention
Chaque lundi, produire le rapport hebdomadaire de l'équipe.

# Déclencheur
Cron du lundi 06h UTC — ou manuellement : python cli/generate_report.py --team demo

# Résultat
Un fichier « Rapport hebdo - S28.pdf » dans out/.

# Scénario
```gherkin
# language: fr
Fonctionnalité: Génération du rapport hebdomadaire
  Scénario: Rapport de l'équipe démo
    Soit les données de la semaine disponibles
    Quand le cron du lundi 06h UTC déclenche la génération pour l'équipe démo
    Alors un rapport « Rapport hebdo - S28.pdf » est produit dans out/
```

# Étapes
## perimetre — Identifier l'équipe concernée
Le rapport porte sur une équipe.
- **Domaine** : Périmètre = un manager + son sous-arbre d'équipes.
- **Code** : `config:perimeters.json` `file:cli/generate_report.py`
- **Tests** : `file:tests/test_cli_args.py`

## indicateurs — Collecter les métriques de la semaine
Pour chaque indicateur on interroge l'entrepôt de données.
- **Domaine** : L'entrepôt est la seule source de vérité.
- **Code** : `file:data/metrics_client.py`
- **Tests** : `file:tests/data/test_metrics_client.py`

## imports-csv — Compléter les données depuis les exports CSV
Certaines données arrivent par export CSV.
- **Domaine** : Le réalisé fait foi sur le prévisionnel.
- **Code** : `file:core/legacy_csv.py` `file:core/legacy_graph.py`
- **Tests** : `file:tests/core/test_legacy_csv.py` `file:tests/core/test_legacy_graph.py`

## sections — Composer les sections du rapport
Le rapport suit un ordre fixe.
- **Domaine** : Semaine courante marquée d'une étoile.
- **Code** : `file:builders/section_registry.py` `file:builders/pdf_builder.py`
- **Tests** : `file:tests/builders/test_section_registry.py`

## cover-nommage — Habiller et nommer le livrable
La page de garde reçoit le titre et la date.
- **Domaine** : Convention de nommage du livrable.
- **Code** : `file:builders/cover_builder.py` `file:core/filename.py`
- **Tests** : `file:tests/builders/test_cover_builder.py` `file:tests/core/test_filename.py`
"""

STUB_MD = """---
type: usecase
id: gen-rapport-trimestriel
persona: manager
group: gen
status: draft
title: Générer la synthèse trimestrielle
---
# Intention
Bientôt : produire la synthèse trimestrielle.

# Déclencheur
Cron trimestriel — bientôt

# Résultat
Bientôt
"""


def test_frontmatter_roundtrip():
    fm, body = parse_frontmatter(USECASE_MD)
    assert fm == {
        "type": "usecase", "id": "gen-rapport-hebdo", "persona": "analyste",
        "group": "gen", "status": "validated",
        "title": "Générer le rapport hebdomadaire d'activité",
    }
    assert body.startswith("# Intention")


def test_usecase_body_five_steps():
    _, body = parse_frontmatter(USECASE_MD)
    parsed = parse_usecase_body(body)
    assert parsed["intent"] == "Chaque lundi, produire le rapport hebdomadaire de l'équipe."
    assert parsed["gherkin"] is not None
    assert "# language: fr" in parsed["gherkin"]
    assert "Fonctionnalité:" in parsed["gherkin"]
    assert len(parsed["steps"]) == 5
    first = parsed["steps"][0]
    assert first == {
        "id": "perimetre", "title": "Identifier l'équipe concernée",
        "domain": "Périmètre = un manager + son sous-arbre d'équipes.",
        "nodes": ["config:perimeters.json", "file:cli/generate_report.py"],
        "tests": ["file:tests/test_cli_args.py"],
        "story": "Le rapport porte sur une équipe.",
    }
    last = parsed["steps"][-1]
    assert last["id"] == "cover-nommage"
    assert last["nodes"] == ["file:builders/cover_builder.py", "file:core/filename.py"]


def test_render_is_inverse_of_parse():
    fm, body = parse_frontmatter(USECASE_MD)
    parsed = parse_usecase_body(body)
    rendered = render_usecase_md(fm, parsed)
    reparsed_fm, reparsed_body = parse_frontmatter(rendered)
    reparsed = parse_usecase_body(reparsed_body)
    assert reparsed_fm == fm
    assert reparsed == parsed


def test_stub_without_scenario_or_steps():
    fm, body = parse_frontmatter(STUB_MD)
    parsed = parse_usecase_body(body)
    assert fm["status"] == "draft"
    assert parsed["gherkin"] is None
    assert parsed["steps"] == []
    assert parsed["outcome"] == "Bientôt"


if __name__ == "__main__":
    test_frontmatter_roundtrip()
    test_usecase_body_five_steps()
    test_render_is_inverse_of_parse()
    test_stub_without_scenario_or_steps()
    print("OK test_usecase_md.py")
