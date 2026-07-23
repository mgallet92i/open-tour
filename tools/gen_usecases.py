"""tools/gen_usecases.py — Générateur de brouillons de use cases (T-005, EX-006/007).

Détecte les fichiers candidats (entry points, tests e2e) non couverts par
les use cases existants dans le knowledge-graph du projet, demande au LLM
(CLI `claude`, même mécanique que pipeline/enrich.py) un brouillon structuré,
et l'écrit en <project>/.open-tour/usecases/<id>.md avec status: draft —
sans jamais écraser un fichier existant (INV-002).

Usage: python tools/gen_usecases.py <project-root> [--dry-run] [--concurrency N] [--only id1,id2]
"""
from __future__ import annotations

import asyncio
import json
import re
import sys
from pathlib import Path

import _usecase_md
from build_data import load_usecases, resolve_usecases_dir

ROOT = Path(__file__).resolve().parent.parent
MAX_SNIPPET_LINES = 60
CANDIDATE_TAGS = ("entrypoint", "e2e")

PROMPT_TEMPLATE = (ROOT / "pipeline" / "prompts" / "gen_usecases.md").read_text(encoding="utf-8")

GEN_SCHEMA = {
    "type": "object",
    "properties": {
        "persona": {"type": "string"}, "group": {"type": "string"},
        "title": {"type": "string"}, "intent": {"type": "string"},
        "trigger": {"type": "string"}, "outcome": {"type": "string"},
        "gherkin": {"type": "string"},
        "steps": {"type": "array", "items": {"type": "object", "properties": {
            "id": {"type": "string"}, "title": {"type": "string"},
            "story": {"type": "string"}, "domain": {"type": "string"},
            "nodes": {"type": "array", "items": {"type": "string"}},
            "tests": {"type": "array", "items": {"type": "string"}},
        }, "required": ["id", "title", "story", "domain", "nodes"]}},
    },
    "required": ["persona", "group", "title", "intent", "trigger", "outcome", "gherkin", "steps"],
}


def candidate_id(file_path: str) -> str:
    """Slug déterministe dérivé du chemin de fichier (pas de LLM — nécessaire
    à la dédup INV-002 avant même l'appel LLM)."""
    stem = re.sub(r"^test_", "", Path(file_path).stem)
    return re.sub(r"[^a-z0-9]+", "-", stem.lower()).strip("-")


def find_candidates(graph: dict, existing_ids: set[str], wanted_nodes: set[str]) -> list[dict]:
    """Fichiers entry-point (tag `entrypoint`) ou tests e2e (tag `e2e`) non
    référencés par un use case existant (EX-006)."""
    candidates = []
    for n in graph["nodes"]:
        if n["type"] != "file" or n["id"] in wanted_nodes:
            continue
        signals = [t for t in CANDIDATE_TAGS if t in n.get("tags", [])]
        if not signals:
            continue
        cid = candidate_id(n["filePath"])
        if cid in existing_ids:
            continue
        candidates.append({"id": cid, "node": n, "signals": signals})
    # Collision de slug (ex: deux Program.cs) : préfixer par le dossier parent
    # pour que chaque candidat garde un id distinct (dédup INV-002).
    counts = {}
    for c in candidates:
        counts[c["id"]] = counts.get(c["id"], 0) + 1
    for c in candidates:
        if counts[c["id"]] > 1:
            parent = re.sub(r"[^a-z0-9]+", "-", Path(c["node"]["filePath"]).parent.name.lower()).strip("-")
            if parent:
                c["id"] = f"{parent}-{c['id']}"
    return candidates


def _snippet(project: Path, file_path: str) -> str:
    try:
        lines = (project / file_path).read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return ""
    return "\n".join(lines[:MAX_SNIPPET_LINES])


def _render_prompt(project: Path, node: dict, personas: list[dict], groups: list[dict]) -> str:
    persona_ids = ", ".join(p["id"] for p in personas)
    group_ids = ", ".join(g["id"] for g in groups)
    return "\n".join([
        PROMPT_TEMPLATE,
        "\n## Personas existants\n" + persona_ids,
        "\n## Groupes existants\n" + group_ids,
        f"\n## Fichier candidat ({node['id']})\n```\n{_snippet(project, node['filePath'])}\n```\n",
    ])


async def gen_one(project: Path, candidate: dict, personas: list[dict], groups: list[dict],
                   semaphore: asyncio.Semaphore) -> dict:
    from claude_agent_sdk import ClaudeAgentOptions, ResultMessage, query

    async with semaphore:
        options = ClaudeAgentOptions(output_format={"type": "json_schema", "schema": GEN_SCHEMA})
        prompt = _render_prompt(project, candidate["node"], personas, groups)
        async for message in query(prompt=prompt, options=options):
            if isinstance(message, ResultMessage):
                if message.is_error or not message.structured_output:
                    raise RuntimeError(f"gen_usecases.py: LLM call failed for {candidate['id']}: {message.result}")
                return message.structured_output
    raise RuntimeError(f"gen_usecases.py: no ResultMessage for {candidate['id']}")


def write_draft(usecases_dir: Path, cid: str, output: dict) -> Path | None:
    """N'écrase jamais un fichier existant (INV-002) — collision -> skip + message."""
    path = usecases_dir / f"{cid}.md"
    if path.exists():
        print(f"skip {cid} : fichier déjà existant (INV-002)")
        return None
    frontmatter = {
        "type": "usecase", "id": cid,
        "persona": output["persona"], "group": output["group"],
        "status": "draft", "title": output["title"],
    }
    fields = {
        "intent": output["intent"], "trigger": output["trigger"], "outcome": output["outcome"],
        "gherkin": output["gherkin"], "steps": output["steps"],
    }
    path.write_text(_usecase_md.render_usecase_md(frontmatter, fields), encoding="utf-8")
    print(f"OK {path}")
    return path


async def run(project: Path, usecases_dir: Path, dry_run: bool, concurrency: int,
              only: set[str] | None = None) -> list[Path]:
    usecases = load_usecases(usecases_dir)
    graph = json.loads(Path(usecases["project"]["graphSource"]).read_text(encoding="utf-8"))

    wanted_nodes = set()
    for uc in usecases["usecases"]:
        for step in uc["steps"]:
            wanted_nodes.update(step["nodes"])
            wanted_nodes.update(step.get("tests", []))
    existing_ids = {uc["id"] for uc in usecases["usecases"]}

    candidates = find_candidates(graph, existing_ids, wanted_nodes)
    if only is not None:
        unknown = only - {c["id"] for c in candidates}
        if unknown:
            print(f"gen_usecases.py: ids --only inconnus : {', '.join(sorted(unknown))}", file=sys.stderr)
            sys.exit(1)
        candidates = [c for c in candidates if c["id"] in only]

    if dry_run:
        if not candidates:
            print("gen_usecases.py --dry-run : aucun candidat détecté")
        for c in candidates:
            print(f"{c['id']} — signaux: {', '.join(c['signals'])} — {c['node']['filePath']}")
        return []

    semaphore = asyncio.Semaphore(concurrency)

    async def process(c: dict):
        return c, await gen_one(project, c, usecases["personas"], usecases["groups"], semaphore)

    results = await asyncio.gather(*(process(c) for c in candidates))
    return [path for c, output in results if (path := write_draft(usecases_dir, c["id"], output))]


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python tools/gen_usecases.py <project-root> [--dry-run] [--concurrency N] [--only id1,id2]", file=sys.stderr)
        sys.exit(1)
    arg_project_root = Path(sys.argv[1]).resolve()
    arg_usecases_dir = resolve_usecases_dir(sys.argv[1])
    arg_dry_run = "--dry-run" in sys.argv[2:]
    arg_concurrency = 5
    arg_only = None
    for arg in sys.argv[2:]:
        if arg.startswith("--concurrency"):
            arg_concurrency = int(arg.split("=", 1)[1]) if "=" in arg else int(sys.argv[sys.argv.index(arg) + 1])
        if arg.startswith("--only"):
            raw = arg.split("=", 1)[1] if "=" in arg else sys.argv[sys.argv.index(arg) + 1]
            arg_only = {s.strip() for s in raw.split(",") if s.strip()}

    written_paths = asyncio.run(run(arg_project_root, arg_usecases_dir, arg_dry_run, arg_concurrency, arg_only))
    if not arg_dry_run:
        print(f"gen_usecases.py: {len(written_paths)} brouillon(s) écrit(s)")
