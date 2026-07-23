"""pipeline/scan.py — Phase SCAN + IMPORT-MAP (T-002, EX-001, EX-002).

Fusionne scan-project.mjs (inventaire fichiers) + importMap/exportsByPath
dérivés de `.codegraph/codegraph.db` (SQL stdlib, ADR-1/ADR-3/ADR-4 — design.md)
en un seul scan-result.json, au format attendu par compute-batches.mjs
(vendorisé) : { files[], importMap, exportsByPath, totalFiles, ... }

Usage: python pipeline/scan.py <project-root>
"""
from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

from _common import ensure_codegraph_index, intermediate_dir, read_json, run_node, write_json


def _load_import_map_and_exports(conn: sqlite3.Connection) -> tuple[dict[str, list[str]], dict[str, list[str]]]:
    """Design.md §3/§4, ADR-1/ADR-4 : deux passes SQL sur codegraph.db.

    importMap : edges kind='imports', résolu vers le file_path cible (le
    target peut être un node file/class/function/import — on ne veut que
    son fichier conteneur), dédupliqué, self-loops exclus.

    exportsByPath : fonctions/classes top-level par fichier (même population
    que symbols_by_file de structure.py), réduites aux noms — approximation
    des exports tree-sitter, acceptée car aucun script Python en aval ne
    consomme exportsByPath/neighborMap (ADR-4)."""
    import_map: dict[str, set[str]] = {}
    for source_file, target_file in conn.execute(
        """
        SELECT fn.file_path, n.file_path
        FROM edges e JOIN nodes n ON e.target = n.id
        JOIN nodes fn ON e.source = fn.id
        WHERE e.kind = 'imports'
        """
    ):
        if target_file == source_file:
            continue
        import_map.setdefault(source_file, set()).add(target_file)

    exports_by_path: dict[str, list[str]] = {}
    for name, file_path in conn.execute(
        """
        SELECT n.name, n.file_path
        FROM edges e JOIN nodes n ON e.target = n.id
        JOIN nodes fn ON e.source = fn.id
        WHERE e.kind = 'contains' AND fn.kind = 'file' AND n.kind IN ('function', 'class')
        """
    ):
        exports_by_path.setdefault(file_path, []).append(name)

    return (
        {path: sorted(targets) for path, targets in import_map.items()},
        {path: sorted(names) for path, names in exports_by_path.items()},
    )


def scan(project: Path) -> Path:
    ensure_codegraph_index(project)
    inter = intermediate_dir(project)
    scan_out = inter / "_scan-raw.json"
    run_node("scan-project.mjs", str(project), str(scan_out))
    scan_result = read_json(scan_out)

    db_path = project / ".codegraph" / "codegraph.db"
    conn = sqlite3.connect(f"file:{db_path.as_posix()}?mode=ro", uri=True)
    try:
        import_map, exports_by_path = _load_import_map_and_exports(conn)
    finally:
        conn.close()

    merged = {
        **scan_result,
        "importMap": import_map,
        "exportsByPath": exports_by_path,
    }
    out_path = inter / "scan-result.json"
    write_json(out_path, merged)

    # Nettoyage des fichiers intermédiaires internes à cette phase
    scan_out.unlink(missing_ok=True)

    return out_path


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python pipeline/scan.py <project-root>", file=sys.stderr)
        sys.exit(1)
    out = scan(Path(sys.argv[1]).resolve())
    print(f"scan.py: wrote {out}")
