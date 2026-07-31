"""Test unitaire T-002 : merge.merge() préserve toutes les clés des nodes
(dont `rules`) lors du réenveloppage de assembled-graph.json en
knowledge-graph.json. Le sous-process vendor est mocké (hors périmètre) ;
l'assembled-graph.json de fixture tient lieu de sa sortie.

Usage : python pipeline/test_merge.py (ou pytest pipeline/).
"""
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

import merge
from _common import intermediate_dir, read_json, write_json

FIXTURE_NODE = {
    "id": "file:a.py",
    "filePath": "a.py",
    "summary": "un module",
    "tags": ["x"],
    "complexity": "simple",
    "rules": ["r1", "r2"],
}


def _fake_vendor_ok(*_args, **_kwargs):
    """Remplace subprocess.run (vendor + git rev-parse) : rien ne s'exécute,
    la sortie de fixture est déjà écrite dans intermediate/."""
    return SimpleNamespace(returncode=0, stderr="", stdout="")


def test_merge_preserves_rules():
    original_run = merge.subprocess.run
    merge.subprocess.run = _fake_vendor_ok
    try:
        with TemporaryDirectory() as td:
            project = Path(td)
            write_json(
                intermediate_dir(project) / "assembled-graph.json",
                {"nodes": [dict(FIXTURE_NODE)], "edges": []},
            )
            out = merge.merge(project)
            got = read_json(out)["nodes"][0]
    finally:
        merge.subprocess.run = original_run

    # Toutes les clés préservées, `rules` incluse, valeurs inchangées.
    # Couvre la survie de `rules` (CA-1) et la non-régression des champs
    # existants (CA-2) en une assertion.
    assert got == FIXTURE_NODE


if __name__ == "__main__":
    test_merge_preserves_rules()
    print("OK test_merge.py")
