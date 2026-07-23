"""pipeline/merge.py — Phase MERGE + écriture finale (T-006, EX-009/010).

Fusionne les batch-<i>.json via merge-batch-graphs.py (vendorisé, stdlib
Python — tested_by déjà résolu par son link_tests()), puis enveloppe le
résultat dans knowledge-graph.json (schéma UA, EX-010).

Usage: python pipeline/merge.py <project-root>
"""
from __future__ import annotations

import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from _common import VENDOR_SKILL_DIR, intermediate_dir, read_json, write_json

LANGUAGE_BY_TAG_PREFIX = {"function", "class"}


def _git_commit_hash(project: Path) -> str:
    try:
        out = subprocess.run(
            ["git", "-C", str(project), "rev-parse", "HEAD"],
            capture_output=True, text=True, check=True,
        )
        return out.stdout.strip()
    except (FileNotFoundError, subprocess.CalledProcessError):
        return ""


def _languages_present(nodes: list[dict]) -> list[str]:
    exts = {Path(n["filePath"]).suffix for n in nodes if n.get("filePath")}
    mapping = {".py": "python", ".ts": "typescript", ".tsx": "typescript", ".js": "javascript", ".jsx": "javascript"}
    langs = sorted({mapping[e] for e in exts if e in mapping})
    return langs


def merge(project: Path) -> Path:
    inter = intermediate_dir(project)
    script = VENDOR_SKILL_DIR / "merge-batch-graphs.py"
    result = subprocess.run(
        [sys.executable, str(script), str(project)], capture_output=True, text=True,
    )
    if result.stderr:
        print(result.stderr, file=sys.stderr, end="")
    if result.returncode != 0:
        raise RuntimeError(f"merge-batch-graphs.py failed (exit {result.returncode})")

    assembled = read_json(inter / "assembled-graph.json")

    envelope = {
        "version": "1.0.0",
        "project": {
            "name": project.name,
            "languages": _languages_present(assembled["nodes"]),
            "analyzedAt": datetime.now(timezone.utc).isoformat(),
            "gitCommitHash": _git_commit_hash(project),
        },
        "nodes": assembled["nodes"],
        "edges": assembled["edges"],
    }

    out_dir = project / ".open-tour"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "knowledge-graph.json"
    write_json(out_path, envelope)
    return out_path


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python pipeline/merge.py <project-root>", file=sys.stderr)
        sys.exit(1)
    out = merge(Path(sys.argv[1]).resolve())
    print(f"merge.py: wrote {out}")
