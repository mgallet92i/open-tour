"""pipeline/batch.py — Phase BATCH (T-003, EX-008).

Wrapper de compute-batches.mjs (vendorisé, Louvain) : lit
.open-tour/intermediate/scan-result.json (écrit par scan.py),
écrit .open-tour/intermediate/batches.json.

Usage: python pipeline/batch.py <project-root>
"""
from __future__ import annotations

import sys
from pathlib import Path

from _common import intermediate_dir, run_node


def batch(project: Path) -> Path:
    run_node("compute-batches.mjs", str(project))
    return intermediate_dir(project) / "batches.json"


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python pipeline/batch.py <project-root>", file=sys.stderr)
        sys.exit(1)
    out = batch(Path(sys.argv[1]).resolve())
    print(f"batch.py: wrote {out}")
