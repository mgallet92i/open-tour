"""pipeline/structure.py — Phase STRUCTURE+CALLGRAPH déterministe.

Pour chaque batch de batches.json (EX-007), lit l'index CodeGraph
(.codegraph/codegraph.db, sqlite3 stdlib, mode=ro — INV-002) et construit
les nodes/edges du schéma UA (EX-001, EX-002, EX-003, EX-004, INV-001,
INV-003) — voir design.md §3.

Usage: python pipeline/structure.py <project-root>
"""
from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

from _common import ensure_codegraph_index, intermediate_dir, read_json, write_json

# Fichiers hors index CodeGraph (EX-004) : pas d'extraction structurelle
# (functions/classes/callGraph), mais un node minimal est conservé pour que
# les use cases puissent les référencer (ex. config:perimeters.json).
CATEGORY_TO_TYPE = {"config": "config", "docs": "document"}


def _ua_id(kind: str, file_path: str, name: str) -> str:
    return f"{kind}:{file_path}:{name}"


def _load_codegraph_index(conn: sqlite3.Connection) -> dict:
    """Une passe globale sur l'index CodeGraph (design.md §4). Retourne
    indexed_files / symbols_by_file / calls_by_file (EX-003, ADR-1/2/3/4)."""
    indexed_files = {row[0] for row in conn.execute("SELECT path FROM files")}

    symbol_rows = conn.execute(
        """
        SELECT n.id, n.kind, n.name, n.file_path, n.start_line, n.end_line
        FROM edges e JOIN nodes n ON e.target = n.id
        JOIN nodes fn ON e.source = fn.id
        WHERE e.kind = 'contains' AND fn.kind IN ('file', 'namespace') AND n.kind IN ('function', 'class')
        """
    ).fetchall()

    cg_id_to_ua_id: dict[str, str] = {}
    cg_id_to_file: dict[str, str] = {}
    symbols_by_file: dict[str, list[dict]] = {}
    for cg_id, kind, name, file_path, start_line, end_line in symbol_rows:
        ua_id = _ua_id(kind, file_path, name)
        cg_id_to_ua_id[cg_id] = ua_id
        cg_id_to_file[cg_id] = file_path
        symbols_by_file.setdefault(file_path, []).append({
            "id": ua_id, "type": kind, "name": name, "lineRange": [start_line, end_line],
        })
    for symbols in symbols_by_file.values():
        symbols.sort(key=lambda s: s["lineRange"][0])

    # method -> classe parente (ADR-3) : un method n'a pas de node dédié,
    # il résout vers l'UA id + le file_path de sa classe conteneuse.
    for class_cg_id, method_cg_id in conn.execute(
        """
        SELECT source, target FROM edges e JOIN nodes n ON e.target = n.id
        WHERE e.kind = 'contains' AND n.kind = 'method'
        """
    ):
        if class_cg_id in cg_id_to_ua_id:
            cg_id_to_ua_id[method_cg_id] = cg_id_to_ua_id[class_cg_id]
            cg_id_to_file[method_cg_id] = cg_id_to_file[class_cg_id]

    # calls bruts : résolution vers UA ids, dédup (source,target), self-loops
    # et cibles non résolues (variable/constant/import/...) exclus (ADR-4).
    calls_by_file: dict[str, list[tuple[str, str, int]]] = {}
    seen: dict[tuple[str, str, str], int] = {}
    for source, target, line in conn.execute("SELECT source, target, line FROM edges WHERE kind = 'calls'"):
        source_ua = cg_id_to_ua_id.get(source)
        target_ua = cg_id_to_ua_id.get(target)
        if not source_ua or not target_ua or source_ua == target_ua:
            continue
        source_file = cg_id_to_file[source]
        key = (source_file, source_ua, target_ua)
        if key in seen:
            seen[key] = min(seen[key], line)
        else:
            seen[key] = line

    for (source_file, source_ua, target_ua), line in seen.items():
        calls_by_file.setdefault(source_file, []).append((source_ua, target_ua, line))

    return {
        "indexed_files": indexed_files,
        "symbols_by_file": symbols_by_file,
        "calls_by_file": calls_by_file,
    }


def build_nodes_and_edges_cg(path: str, index: dict, batch_import_data: dict) -> tuple[list[dict], list[dict]]:
    """Remplace l'ancienne build_nodes_and_edges (basée sur extract-structure.mjs) :
    même schéma de sortie (EX-002), construit depuis l'index CodeGraph déjà
    chargé (`index`, cf. _load_codegraph_index) au lieu du JSON tree-sitter."""
    file_id = f"file:{path}"
    nodes = [{"id": file_id, "type": "file", "name": Path(path).name, "filePath": path}]
    edges: list[dict] = []

    for symbol in index["symbols_by_file"].get(path, []):
        nodes.append({
            "id": symbol["id"], "type": symbol["type"], "name": symbol["name"],
            "filePath": path, "lineRange": symbol["lineRange"],
        })
        edges.append({"source": file_id, "target": symbol["id"], "type": "contains"})

    for source_ua, target_ua, line in index["calls_by_file"].get(path, []):
        edges.append({"source": source_ua, "target": target_ua, "type": "calls", "lineNumber": line})

    for target_path in batch_import_data.get(path, []):
        edges.append({"source": file_id, "target": f"file:{target_path}", "type": "imports"})

    return nodes, edges


def build_simple_node(file_entry: dict, batch_import_data: dict) -> tuple[list[dict], list[dict]]:
    """Node minimal (pas d'extraction structurelle) pour un fichier hors
    Python/TS/JS — INV-007. Type dérivé de fileCategory (config/docs),
    sinon "file" par défaut."""
    path = file_entry["path"]
    node_type = CATEGORY_TO_TYPE.get(file_entry.get("fileCategory"), "file")
    node_id = f"{node_type}:{path}"
    nodes = [{"id": node_id, "type": node_type, "name": Path(path).name, "filePath": path}]
    edges = [
        {"source": node_id, "target": f"file:{target_path}", "type": "imports"}
        for target_path in batch_import_data.get(path, [])
    ]
    return nodes, edges


def structure(project: Path) -> list[Path]:
    ensure_codegraph_index(project)
    inter = intermediate_dir(project)
    batches = read_json(inter / "batches.json")["batches"]

    db_path = project / ".codegraph" / "codegraph.db"
    conn = sqlite3.connect(f"file:{db_path.as_posix()}?mode=ro", uri=True)
    try:
        index = _load_codegraph_index(conn)
    finally:
        conn.close()

    written: list[Path] = []
    for b in batches:
        batch_import_data = b.get("batchImportData", {})

        nodes: list[dict] = []
        edges: list[dict] = []
        for file_entry in b["files"]:
            path = file_entry["path"]
            if path in index["indexed_files"]:
                n, e = build_nodes_and_edges_cg(path, index, batch_import_data)
            else:
                n, e = build_simple_node(file_entry, batch_import_data)
            nodes.extend(n)
            edges.extend(e)

        if not nodes:
            continue

        nodes.sort(key=lambda n: n["id"])
        edges.sort(key=lambda e: (e["source"], e["target"], e["type"]))

        out_path = inter / f"batch-{b['batchIndex']}.json"
        write_json(out_path, {"nodes": nodes, "edges": edges})
        written.append(out_path)

    return written


def _fixture_index() -> dict:
    """Fixture SQLite en mémoire couvrant symbole top-level, classe+méthode,
    call cross-symbole, self-loop, call vers variable (T-003/T-004), et
    classe encapsulée dans un namespace (C#/VB.NET : file -> namespace -> class)."""
    conn = sqlite3.connect(":memory:")
    conn.execute("CREATE TABLE files (path TEXT PRIMARY KEY)")
    conn.execute(
        "CREATE TABLE nodes (id TEXT PRIMARY KEY, kind TEXT, name TEXT, file_path TEXT, start_line INTEGER, end_line INTEGER)"
    )
    conn.execute("CREATE TABLE edges (source TEXT, target TEXT, kind TEXT, line INTEGER)")

    conn.execute("INSERT INTO files VALUES ('a.py')")
    conn.execute("INSERT INTO files VALUES ('b.cs')")
    conn.executemany(
        "INSERT INTO nodes VALUES (?, ?, ?, ?, ?, ?)",
        [
            ("f1", "file", "a.py", "a.py", None, None),
            ("fn1", "function", "foo", "a.py", 1, 5),
            ("cl1", "class", "Bar", "a.py", 10, 20),
            ("m1", "method", "baz", "a.py", 11, 15),
            ("v1", "variable", "X", "a.py", None, None),
            # fonction imbriquée dans une méthode : NON top-level, doit rester exclue
            ("fn2", "function", "inner", "a.py", 12, 14),
            # C# : la classe pend sous un namespace, pas sous le fichier
            ("f2", "file", "b.cs", "b.cs", None, None),
            ("ns1", "namespace", "Acme.Dal", "b.cs", 1, 40),
            ("cl2", "class", "Repo", "b.cs", 5, 30),
            ("m2", "method", "Load", "b.cs", 6, 12),
        ],
    )
    conn.executemany(
        "INSERT INTO edges VALUES (?, ?, ?, ?)",
        [
            ("f1", "fn1", "contains", None),
            ("f1", "cl1", "contains", None),
            ("cl1", "m1", "contains", None),
            ("fn1", "m1", "calls", 3),   # cross-symbole -> résolu vers la classe Bar
            ("fn1", "fn1", "calls", 4),  # self-loop -> exclu
            ("m1", "v1", "calls", 12),   # cible variable non résolue -> exclue
            ("m1", "fn2", "contains", None),  # parent method -> fn2 non top-level
            ("f2", "ns1", "contains", None),
            ("ns1", "cl2", "contains", None),
            ("cl2", "m2", "contains", None),
        ],
    )
    conn.commit()
    return _load_codegraph_index(conn)


def _selfcheck_load_index() -> None:
    """T-003 self-check : résolution/dédup/filtrage de _load_codegraph_index."""
    index = _fixture_index()
    assert index["indexed_files"] == {"a.py", "b.cs"}
    assert {s["id"] for s in index["symbols_by_file"]["a.py"]} == {"function:a.py:foo", "class:a.py:Bar"}
    calls = index["calls_by_file"]["a.py"]
    assert calls == [("function:a.py:foo", "class:a.py:Bar", 3)], calls
    # Une classe encapsulée dans un namespace reste un symbole top-level du fichier :
    # sans cela, 100 % des classes C# disparaissent du graphe.
    cs_symbols = {s["id"] for s in index["symbols_by_file"].get("b.cs", [])}
    assert cs_symbols == {"class:b.cs:Repo"}, cs_symbols
    print("OK structure.py _load_codegraph_index self-check")


def _selfcheck_build_nodes_edges() -> None:
    """T-004 self-check : nodes/edges attendus sur la fixture T-003, et deux
    runs consécutifs produisent la même sortie triée (INV-003)."""
    index = _fixture_index()
    nodes, edges = build_nodes_and_edges_cg("a.py", index, batch_import_data={})
    nodes.sort(key=lambda n: n["id"])
    edges.sort(key=lambda e: (e["source"], e["target"], e["type"]))

    node_ids = {n["id"] for n in nodes}
    assert node_ids == {"file:a.py", "function:a.py:foo", "class:a.py:Bar"}, node_ids
    assert {"source": "function:a.py:foo", "target": "class:a.py:Bar", "type": "calls", "lineNumber": 3} in edges

    nodes2, edges2 = build_nodes_and_edges_cg("a.py", index, batch_import_data={})
    nodes2.sort(key=lambda n: n["id"])
    edges2.sort(key=lambda e: (e["source"], e["target"], e["type"]))
    assert nodes == nodes2 and edges == edges2, "sortie non déterministe entre deux runs (INV-003)"
    print("OK structure.py build_nodes_and_edges_cg self-check")


if __name__ == "__main__":
    if len(sys.argv) == 1:
        _selfcheck_load_index()
        _selfcheck_build_nodes_edges()
    elif len(sys.argv) == 2:
        files = structure(Path(sys.argv[1]).resolve())
        print(f"structure.py: wrote {len(files)} batch-<i>.json files")
    else:
        print("Usage: python pipeline/structure.py [project-root]", file=sys.stderr)
        sys.exit(1)
