"""Test unitaire T-005 : détection de candidats sur un fixture KG minimal.

Usage : python tools/test_gen_usecases.py (ou pytest tools/).
"""
from gen_usecases import candidate_id, find_candidates

GRAPH = {
    "nodes": [
        {"id": "file:cli/generate_report.py", "type": "file", "filePath": "cli/generate_report.py",
         "tags": ["cli", "entrypoint"]},
        {"id": "file:tests/e2e/test_checkout.py", "type": "file", "filePath": "tests/e2e/test_checkout.py",
         "tags": ["e2e", "reconciliation"]},
        {"id": "file:core/legacy_csv.py", "type": "file", "filePath": "core/legacy_csv.py",
         "tags": ["csv", "legacy"]},
        {"id": "function:cli/generate_report.py:main", "type": "function", "filePath": "cli/generate_report.py",
         "tags": []},
    ],
}


def test_candidate_id_strips_test_prefix_and_dashes():
    assert candidate_id("tests/e2e/test_checkout.py") == "checkout"
    assert candidate_id("cli/generate_report.py") == "generate-report"


def test_find_candidates_filters_by_tag_and_coverage():
    # aucun node "wanted" (non couvert) -> les 2 fichiers taggés entrypoint/e2e sortent
    candidates = find_candidates(GRAPH, existing_ids=set(), wanted_nodes=set())
    ids = {c["id"] for c in candidates}
    assert ids == {"generate-report", "checkout"}
    # le fichier non taggé (core/legacy_csv.py) et le node non-file (function) sont exclus


def test_find_candidates_excludes_already_covered_node():
    candidates = find_candidates(GRAPH, existing_ids=set(), wanted_nodes={"file:cli/generate_report.py"})
    ids = {c["id"] for c in candidates}
    assert ids == {"checkout"}


def test_find_candidates_excludes_existing_id():
    candidates = find_candidates(GRAPH, existing_ids={"checkout"}, wanted_nodes=set())
    ids = {c["id"] for c in candidates}
    assert ids == {"generate-report"}


if __name__ == "__main__":
    test_candidate_id_strips_test_prefix_and_dashes()
    test_find_candidates_filters_by_tag_and_coverage()
    test_find_candidates_excludes_already_covered_node()
    test_find_candidates_excludes_existing_id()
    print("OK test_gen_usecases.py")
