"""Test unitaire T-003 : build_data.load_usecases sur un mini <project>/.open-tour/usecases/
de fixture, + résolution du projet (projet invalide -> SystemExit).

Usage : python tools/test_build_data.py (ou pytest tools/).
"""
from pathlib import Path
from tempfile import TemporaryDirectory

from build_data import extract_graph, load_usecases, resolve_usecases_dir

INDEX_MD = """---
type: project
name: FIXTURE_PROJECT
---
Description du projet fixture.
"""

PERSONA_MD = """---
type: persona
id: analyste
name: Équipe Analystes
icon: 🛠️
---
Équipe interne.
"""

GROUP_MD = """---
type: group
id: gen
name: Génération
icon: 🏭
color: "#3e689e"
---
Production des rapports.
"""

USECASE_MD = """---
type: usecase
id: gen-rapport-hebdo
persona: analyste
group: gen
status: validated
title: Générer le rapport hebdo
---
# Intention
Produire le rapport.

# Déclencheur
Cron du lundi.

# Résultat
Un fichier pdf.

# Scénario
```gherkin
# language: fr
Fonctionnalité: Génération
  Scénario: Rapport
    Soit les données disponibles
    Quand le cron déclenche
    Alors le rapport est produit
```

# Étapes
## perimetre — Identifier l'équipe
Story du périmètre.
- **Domaine** : Domaine du périmètre.
- **Code** : `file:cli/generate_report.py`
- **Tests** : `file:tests/test_cli_args.py`
"""

STUB_MD = """---
type: usecase
id: gen-rapport-trimestriel
persona: analyste
group: gen
status: draft
title: Synthèse trimestrielle
---
# Intention
Bientôt.

# Déclencheur
Bientôt.

# Résultat
Bientôt.
"""


def _write_fixture(root: Path) -> None:
    (root / "personas").mkdir(parents=True)
    (root / "groups").mkdir(parents=True)
    (root / "index.md").write_text(INDEX_MD, encoding="utf-8")
    (root / "personas" / "analyste.md").write_text(PERSONA_MD, encoding="utf-8")
    (root / "groups" / "gen.md").write_text(GROUP_MD, encoding="utf-8")
    (root / "gen-rapport-hebdo.md").write_text(USECASE_MD, encoding="utf-8")
    (root / "gen-rapport-trimestriel.md").write_text(STUB_MD, encoding="utf-8")


INTEGRATION_MD = """---
type: integration
id: cv-matcher
group: integrations
status: published
title: Matching de CV sur les besoins clients
---

# Intention
Fiche d'intégration : décrit une configuration, pas un parcours porté par un persona.
Elle n'a donc pas de champ `persona` — et ne doit pas faire tomber le build.
"""


def test_load_usecases_ignore_les_fiches_dun_autre_type():
    """Une fiche `type: integration` (cas réel côté SWIPE : cv-matcher.md) vit dans
    usecases/ sans `persona`. Le chargement doit l'ignorer, pas lever un KeyError."""
    with TemporaryDirectory() as td:
        root = Path(td) / ".open-tour" / "usecases"
        _write_fixture(root)
        (root / "cv-matcher.md").write_text(INTEGRATION_MD, encoding="utf-8")
        data = load_usecases(root)

    ids = [uc["id"] for uc in data["usecases"]]
    assert "cv-matcher" not in ids, "une fiche non-usecase ne doit pas entrer dans usecases[]"
    assert len(data["usecases"]) == 2, "les cas d'usage réels restent chargés"


def test_load_usecases_reconstructs_expected_dict():
    with TemporaryDirectory() as td:
        root = Path(td) / ".open-tour" / "usecases"
        _write_fixture(root)
        data = load_usecases(root)
        expected_graph = str((root.parent / "knowledge-graph.json").resolve())

    assert data["project"] == {
        "name": "FIXTURE_PROJECT",
        "description": "Description du projet fixture.",
        "graphSource": expected_graph,
    }
    assert data["personas"] == [
        {"id": "analyste", "name": "Équipe Analystes", "icon": "🛠️", "description": "Équipe interne."},
    ]
    assert data["groups"] == [
        {"id": "gen", "name": "Génération", "icon": "🏭", "color": "#3e689e", "description": "Production des rapports."},
    ]
    assert len(data["usecases"]) == 2

    validated = next(uc for uc in data["usecases"] if uc["id"] == "gen-rapport-hebdo")
    assert validated["status"] == "validated"
    assert validated["persona"] == "analyste"
    assert validated["group"] == "gen"
    assert validated["scenario"] is not None
    assert len(validated["steps"]) == 1
    assert validated["steps"][0]["nodes"] == ["file:cli/generate_report.py"]
    assert validated["steps"][0]["tests"] == ["file:tests/test_cli_args.py"]

    stub = next(uc for uc in data["usecases"] if uc["id"] == "gen-rapport-trimestriel")
    assert stub["status"] == "draft"
    assert stub["scenario"] is None
    assert stub["steps"] == []


def test_resolve_usecases_dir_project_resolution():
    with TemporaryDirectory() as td:
        _write_fixture(Path(td) / ".open-tour" / "usecases")
        assert resolve_usecases_dir(td).name == "usecases"
        for bad in (None, str(Path(td) / "nexiste-pas")):
            try:
                resolve_usecases_dir(bad)
                raise AssertionError(f"resolve_usecases_dir({bad!r}) aurait dû lever SystemExit")
            except SystemExit as e:
                assert ".open-tour/usecases/index.md" in str(e)


FID = "file:core/legacy_csv.py"
SID = "function:core/legacy_csv.py:load_all_csv"


def _graph(with_rules: bool) -> tuple[dict, dict]:
    """Graphe minimal (1 fichier + 1 symbole via edge `contains`) et usecases
    minimal dont une étape référence le fichier. `with_rules` pilote la présence
    de la clé `rules` sur les deux nodes (cas défaut = absente)."""
    file_node = {"id": FID, "type": "file", "name": "legacy_csv.py",
                 "filePath": "core/legacy_csv.py", "summary": "Parse les CSV"}
    sym_node = {"id": SID, "type": "function", "name": "load_all_csv",
                "summary": "Charge tous les CSV", "lineRange": [1, 10]}
    if with_rules:
        file_node["rules"] = ["Les colonnes manquantes sont normalisées à vide"]
        sym_node["rules"] = ["Un fichier CSV vide est ignoré sans erreur"]
    graph = {"nodes": [file_node, sym_node],
             "edges": [{"type": "contains", "source": FID, "target": SID}]}
    usecases = {"usecases": [{"steps": [{"nodes": [FID], "tests": []}]}]}
    return usecases, graph


def test_extract_graph_propagates_rules():
    usecases, graph = _graph(with_rules=True)
    out = extract_graph(usecases, graph)
    assert out[FID]["rules"] == ["Les colonnes manquantes sont normalisées à vide"]
    assert out[FID]["symbols"][0]["rules"] == ["Un fichier CSV vide est ignoré sans erreur"]


def test_extract_graph_rules_default_empty():
    usecases, graph = _graph(with_rules=False)
    out = extract_graph(usecases, graph)
    assert out[FID]["rules"] == []
    assert out[FID]["symbols"][0]["rules"] == []


if __name__ == "__main__":
    test_load_usecases_reconstructs_expected_dict()
    test_resolve_usecases_dir_project_resolution()
    test_extract_graph_propagates_rules()
    test_extract_graph_rules_default_empty()
    print("OK test_build_data.py")
