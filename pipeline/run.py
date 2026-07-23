"""pipeline/run.py — CLI orchestrateur (T-007, EX-012).

Usage: python pipeline/run.py --project <path> [--concurrency N]
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

from _common import check_host_prereqs
from batch import batch
from enrich import enrich
from merge import merge
from scan import scan
from structure import structure


def main() -> None:
    parser = argparse.ArgumentParser(description="Pipeline metadata headless (UA-compatible)")
    parser.add_argument("--project", required=True, help="Chemin du projet à analyser")
    parser.add_argument("--concurrency", type=int, default=5, help="Parallélisme LLM (défaut 5)")
    args = parser.parse_args()

    project = Path(args.project).resolve()
    if not project.is_dir():
        print(f"Erreur : {project} n'est pas un répertoire", file=sys.stderr)
        sys.exit(1)

    check_host_prereqs()

    print(f"[1/5] scan {project}")
    scan(project)
    print("[2/5] batch")
    batch(project)
    print("[3/5] structure")
    structure(project)
    print("[4/5] enrich (LLM)")
    asyncio.run(enrich(project, args.concurrency))
    print("[5/5] merge")
    out = merge(project)
    print(f"Pipeline terminé : {out}")


if __name__ == "__main__":
    main()
