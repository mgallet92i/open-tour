"""pipeline/enrich.py — Phase LLM (T-005, EX-005/006, INV-005).

Enrichit chaque batch-<i>.json (nodes construits par structure.py) avec
summary/tags/complexity via Claude Agent SDK, sortie contrainte par
output_format json_schema (pas de post-réparation JSON, INV-005).

Simplification vs. design.md §3 (ponytail, notée ici) : le call-graph
(EX-003) et les liens tested_by (EX-007) sont déjà 100% déterministes
(structure.py / merge-batch-graphs.py::link_tests, vendorisé) — ce module
n'arbitre PAS de testLinks LLM : le linker vendorisé couvre déjà le critère
T-EX-007 sans appel LLM supplémentaire. Ajouter l'arbitrage LLM des
orphelins si le linker déterministe s'avère insuffisant en usage réel.

Usage: python pipeline/enrich.py <project-root> [--concurrency N]
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from _common import intermediate_dir, read_json, write_json

ENRICH_SCHEMA = {
    "type": "object",
    "properties": {
        "enrichments": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "summary": {"type": "string"},
                    "tags": {"type": "array", "items": {"type": "string"}},
                    "complexity": {"enum": ["simple", "moderate", "complex"]},
                    "rules": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["id", "summary", "tags", "complexity", "rules"],
            },
        },
    },
    "required": ["enrichments"],
}

PROMPT_TEMPLATE = (Path(__file__).resolve().parent / "prompts" / "enrich.md").read_text(encoding="utf-8")

MAX_SNIPPET_LINES = 60


def _snippet(project: Path, node: dict) -> str:
    file_path = project / node["filePath"]
    try:
        lines = file_path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return ""
    if node["type"] == "file":
        chunk = lines[:MAX_SNIPPET_LINES]
    else:
        start, end = node.get("lineRange", [1, len(lines)])
        chunk = lines[max(0, start - 1):min(len(lines), end)][:MAX_SNIPPET_LINES]
    return "\n".join(chunk)


def _render_prompt(project: Path, nodes: list[dict]) -> str:
    parts = [PROMPT_TEMPLATE, "\n## Nodes\n"]
    for n in nodes:
        parts.append(
            f"### {n['id']} ({n['type']}, {n['filePath']})\n```\n{_snippet(project, n)}\n```\n"
        )
    return "\n".join(parts)


async def enrich_batch(project: Path, nodes: list[dict], semaphore: asyncio.Semaphore) -> list[dict]:
    from claude_agent_sdk import ClaudeAgentOptions, ResultMessage, query

    async with semaphore:
        options = ClaudeAgentOptions(output_format={"type": "json_schema", "schema": ENRICH_SCHEMA})
        prompt = _render_prompt(project, nodes)
        async for message in query(prompt=prompt, options=options):
            if isinstance(message, ResultMessage):
                if message.is_error or not message.structured_output:
                    raise RuntimeError(f"enrich.py: LLM call failed: {message.result}")
                return message.structured_output["enrichments"]
    raise RuntimeError("enrich.py: no ResultMessage received from query()")


async def enrich(project: Path, concurrency: int = 5) -> list[Path]:
    inter = intermediate_dir(project)
    batch_files = sorted(inter.glob("batch-*.json"))
    semaphore = asyncio.Semaphore(concurrency)

    async def process(path: Path) -> Path:
        data = read_json(path)
        nodes = data["nodes"]
        enrichments = await enrich_batch(project, nodes, semaphore)
        by_id = {e["id"]: e for e in enrichments}
        for node in nodes:
            e = by_id.get(node["id"])
            if e:
                node["summary"] = e["summary"]
                node["tags"] = e["tags"]
                node["complexity"] = e["complexity"]
                node["rules"] = e["rules"]
        write_json(path, data)
        return path

    return list(await asyncio.gather(*(process(p) for p in batch_files)))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python pipeline/enrich.py <project-root> [--concurrency N]", file=sys.stderr)
        sys.exit(1)
    concurrency = 5
    for arg in sys.argv[2:]:
        if arg.startswith("--concurrency"):
            concurrency = int(arg.split("=", 1)[1]) if "=" in arg else int(sys.argv[sys.argv.index(arg) + 1])
    files = asyncio.run(enrich(Path(sys.argv[1]).resolve(), concurrency))
    print(f"enrich.py: enriched {len(files)} batches")
