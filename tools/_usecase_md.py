"""tools/_usecase_md.py — parser/serializer OKF+Gherkin partagé (T-002, EX-001/002/003).

Grammaire markdown plate (design.md §3) : frontmatter YAML plat (`clé: valeur`,
un niveau) + corps en sections `# Titre` / `## id — titre` / `- **Champ** :`.
Stdlib seul (INV-003) : pas de PyYAML, pas de lib Gherkin.
"""
from __future__ import annotations

import re

_STEP_HEADER_RE = re.compile(r"^##\s+(\S+)\s+—\s+(.+)$")
_FIELD_RE = re.compile(r"^-\s+\*\*(.+?)\*\*\s*:\s*(.*)$")
_BACKTICK_RE = re.compile(r"`([^`]+)`")

_SECTION_KEYS = {
    "intention": "intent",
    "déclencheur": "trigger",
    "résultat": "outcome",
    "scénario": "scenario",
    "étapes": "steps",
}


def parse_frontmatter(text: str) -> tuple[dict, str]:
    """Sépare le frontmatter YAML plat (clé: valeur, un niveau) du corps brut."""
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}, text
    fm: dict[str, str] = {}
    i = 1
    while i < len(lines) and lines[i].strip() != "---":
        if ":" in lines[i]:
            key, _, value = lines[i].partition(":")
            fm[key.strip()] = value.strip().strip('"')
        i += 1
    body = "\n".join(lines[i + 1:]).lstrip("\n")
    return fm, body


def parse_usecase_body(body: str) -> dict:
    """body -> {intent, trigger, outcome, gherkin: str|None,
    steps: [{id, title, story, domain, nodes: [str], tests: [str]}]}."""
    result: dict = {"intent": "", "trigger": "", "outcome": "", "gherkin": None, "steps": []}
    section: str | None = None
    step: dict | None = None
    buf: list[str] = []
    in_gherkin = False
    gherkin_lines: list[str] = []

    def flush_section() -> None:
        if section in ("intent", "trigger", "outcome"):
            result[section] = "\n".join(buf).strip()

    def flush_step() -> None:
        if step is not None:
            step["story"] = "\n".join(buf).strip()
            result["steps"].append(step)

    for line in body.splitlines():
        stripped = line.strip()
        if stripped.startswith("```"):
            if in_gherkin:
                result["gherkin"] = "\n".join(gherkin_lines)
                in_gherkin = False
            elif stripped == "```gherkin":
                in_gherkin = True
                gherkin_lines = []
            continue
        if in_gherkin:
            gherkin_lines.append(line)
            continue
        if stripped.startswith("## "):
            flush_step()
            m = _STEP_HEADER_RE.match(stripped)
            if m:
                step = {"id": m.group(1), "title": m.group(2), "domain": "", "nodes": [], "tests": []}
            else:
                step = {"id": stripped[3:].strip(), "title": "", "domain": "", "nodes": [], "tests": []}
            buf = []
            section = "step"
            continue
        if stripped.startswith("# "):
            flush_section()
            flush_step()
            step = None
            section = _SECTION_KEYS.get(stripped[2:].strip().lower())
            buf = []
            continue
        if section == "step" and step is not None:
            m = _FIELD_RE.match(stripped)
            if m:
                field, value = m.group(1).lower(), m.group(2)
                if field == "domaine":
                    step["domain"] = value
                elif field == "code":
                    step["nodes"] = _BACKTICK_RE.findall(value)
                elif field == "tests":
                    step["tests"] = _BACKTICK_RE.findall(value)
                continue
        buf.append(line)

    flush_section()
    flush_step()
    return result


def render_usecase_md(frontmatter: dict, fields: dict) -> str:
    """Inverse de parse_usecase_body — sérialise un brouillon LLM en .md."""
    fm_lines = ["---"]
    for key, value in frontmatter.items():
        needs_quotes = isinstance(value, str) and value.startswith("#")
        fm_lines.append(f'{key}: "{value}"' if needs_quotes else f"{key}: {value}")
    fm_lines.append("---")

    parts = ["\n".join(fm_lines)]
    if fields.get("intent"):
        parts.append(f"# Intention\n{fields['intent']}")
    if fields.get("trigger"):
        parts.append(f"# Déclencheur\n{fields['trigger']}")
    if fields.get("outcome"):
        parts.append(f"# Résultat\n{fields['outcome']}")
    gherkin = fields.get("gherkin")
    if gherkin:
        parts.append(f"# Scénario\n```gherkin\n{gherkin.strip()}\n```")
    steps = fields.get("steps") or []
    if steps:
        blocks = ["# Étapes"]
        for step in steps:
            block = [f"## {step['id']} — {step['title']}", step.get("story", "").strip()]
            if step.get("domain"):
                block.append(f"- **Domaine** : {step['domain']}")
            if step.get("nodes"):
                block.append("- **Code** : " + " ".join(f"`{n}`" for n in step["nodes"]))
            if step.get("tests"):
                block.append("- **Tests** : " + " ".join(f"`{t}`" for t in step["tests"]))
            blocks.append("\n".join(block))
        parts.append("\n\n".join(blocks))
    return "\n\n".join(parts) + "\n"
