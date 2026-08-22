"""Fusionne <project>/.open-tour/usecases/ + knowledge-graph.json -> <project>/.open-tour/data.js.

Le proto ne ré-analyse rien : il consomme le graphe existant et n'en extrait
que les nœuds référencés par les use cases (fichiers + leurs symboles contenus).
Usage : python tools/build_data.py <project-root>
"""
import json
import re
import sys
from pathlib import Path

import _usecase_md

ROOT = Path(__file__).resolve().parent.parent


def resolve_usecases_dir(project_root: str | None) -> Path:
    """Résout <project-root>/.open-tour/usecases/ — projet valide si
    usecases/index.md existe. Argument absent ou projet invalide -> exit 1
    (pas de défaut silencieux)."""
    if project_root:
        d = Path(project_root).resolve() / ".open-tour" / "usecases"
        if (d / "index.md").is_file():
            return d
    raise SystemExit(
        f"Projet {'invalide : ' + project_root if project_root else 'manquant'} — "
        "<project-root>/.open-tour/usecases/index.md introuvable "
        "(argument positionnel <project-root> obligatoire)"
    )


def short_title(summary: str) -> str | None:
    """Titre fonctionnel court dérivé du résumé LLM : première proposition,
    coupée avant parenthèse/deux-points/tiret long, bornée à 60 caractères."""
    if not summary:
        return None
    t = re.split(r"\s+[—:(«]|\.\s", summary, maxsplit=1)[0].strip().rstrip(".,;")
    if len(t) > 60:
        t = t[:57].rsplit(" ", 1)[0] + "…"
    return t or None


def load_usecases(root: Path) -> dict:
    """Lit data/<slug>/usecases/ -> reconstruit EXACTEMENT le dict USECASES actuel
    (project/personas/groups/usecases), + status et scenario par usecase.
    Le reste de build_data.py (extraction wanted, build_flow, écriture
    data.js) ne change pas : seule la source change, pas la fusion."""
    fm, body = _usecase_md.parse_frontmatter((root / "index.md").read_text(encoding="utf-8"))
    # graphSource optionnel : défaut ../knowledge-graph.json, résolu relatif à usecases/
    graph_path = (root / fm["graphSource"]).resolve() if fm.get("graphSource") else (root.parent / "knowledge-graph.json").resolve()
    project = {"name": fm["name"], "description": body.strip(), "graphSource": str(graph_path)}

    personas = []
    for path in sorted((root / "personas").glob("*.md")):
        fm, body = _usecase_md.parse_frontmatter(path.read_text(encoding="utf-8"))
        personas.append({"id": fm["id"], "name": fm["name"], "icon": fm["icon"], "description": body.strip()})

    groups = []
    for path in sorted((root / "groups").glob("*.md")):
        fm, body = _usecase_md.parse_frontmatter(path.read_text(encoding="utf-8"))
        groups.append({
            "id": fm["id"], "name": fm["name"], "icon": fm["icon"],
            "color": fm["color"], "description": body.strip(),
        })

    usecases = []
    for path in sorted(root.glob("*.md")):
        fm, body = _usecase_md.parse_frontmatter(path.read_text(encoding="utf-8"))
        # OKF : c'est le `type` du frontmatter qui décide, pas le nom du fichier.
        # `usecases/` héberge aussi l'index projet (type: project) et des fiches
        # d'un autre type. Cas rencontré en usage réel : une fiche
        # `type: integration` décrivant la configuration d'une intégration,
        # légitimement sans `persona`. Filtrer par nom faisait planter tout
        # le build en KeyError sur ces fiches.
        if fm.get("type") != "usecase":
            continue
        parsed = _usecase_md.parse_usecase_body(body)
        usecases.append({
            "id": fm["id"], "persona": fm["persona"], "group": fm["group"],
            "title": fm["title"], "status": fm["status"],
            "intent": parsed["intent"], "trigger": parsed["trigger"], "outcome": parsed["outcome"],
            "scenario": parsed["gherkin"], "steps": parsed["steps"],
        })

    return {"project": project, "personas": personas, "groups": groups, "usecases": usecases}


def build_flow(symbols: list[dict], calls_by_source: dict):
    """Graphe d'appels intra-module dérivé des edges `calls` du KG (déjà en
    mémoire dans calls_by_source) : appels locaux au fichier, dans l'ordre des
    sites d'appel. ponytail: local au module — les appels cross-module
    viendront quand un use case en aura besoin."""
    id_to_name = {s["id"]: s["name"] for s in symbols if s.get("lineRange")}
    defs = {}
    for s in symbols:
        if not s.get("lineRange"):
            continue
        start, end = s["lineRange"]
        seen, calls = set(), []
        for _, target in sorted(calls_by_source.get(s["id"], [])):
            name = id_to_name.get(target)
            if name and name != s["name"] and name not in seen:
                seen.add(name)
                calls.append(name)
        defs[s["name"]] = {"start": start, "end": end, "calls": calls}
    if not defs:
        return None
    called = {c for d in defs.values() for c in d["calls"]}
    entries = [name for name, d in sorted(defs.items(), key=lambda kv: kv[1]["start"]) if name not in called]
    return {"defs": defs, "entries": entries}


def extract_graph(usecases: dict, graph: dict) -> dict:
    """Filtre le knowledge-graph aux nodes référencés par les use cases et
    reconstruit le dict {file_id: FileEntry} écrit dans data.js. Pur : ne lit
    rien sur disque, testable en mémoire."""
    nodes = {n["id"]: n for n in graph["nodes"]}
    contains = {}        # file id -> [symbol ids]
    tested_by = {}       # prod id -> [test ids]
    calls_by_source = {}  # symbol id -> [(lineNumber, target symbol id), ...]
    for e in graph["edges"]:
        if e["type"] == "contains":
            contains.setdefault(e["source"], []).append(e["target"])
        elif e["type"] == "tested_by":
            tested_by.setdefault(e["source"], []).append(e["target"])
        elif e["type"] == "calls":
            calls_by_source.setdefault(e["source"], []).append((e.get("lineNumber", 0), e["target"]))

    wanted = set()
    for uc in usecases["usecases"]:
        for step in uc["steps"]:
            wanted.update(step["nodes"])
            wanted.update(step.get("tests", []))

    extract = {}
    missing = []
    for fid in sorted(wanted):
        n = nodes.get(fid)
        if n is None:
            missing.append(fid)
            continue
        symbols = []
        for sid in contains.get(fid, []):
            s = nodes.get(sid)
            if s is None:
                continue
            symbols.append({
                "id": s["id"],
                "type": s["type"],
                "name": s["name"],
                "title": short_title(s.get("summary", "")),
                "summary": s.get("summary", ""),
                "rules": s.get("rules", []),
                "lineRange": s.get("lineRange"),
                "tests": [t for t in tested_by.get(sid, [])],
            })
        file_path = n.get("filePath", "")
        extract[fid] = {
            "id": fid,
            "type": n["type"],
            "name": n["name"],
            "title": short_title(n.get("summary", "")),
            "filePath": file_path,
            "summary": n.get("summary", ""),
            "tags": n.get("tags", []),
            "rules": n.get("rules", []),
            "symbols": symbols,
            "tests": [t for t in tested_by.get(fid, [])],
            "flow": build_flow(symbols, calls_by_source),
        }

    if missing:
        raise SystemExit(f"Nœuds référencés introuvables dans le graphe : {missing}")

    return extract


def main() -> None:
    usecases_dir = resolve_usecases_dir(sys.argv[1] if len(sys.argv) > 1 else None)
    usecases = load_usecases(usecases_dir)
    graph = json.loads(Path(usecases["project"]["graphSource"]).read_text(encoding="utf-8"))

    extract = extract_graph(usecases, graph)
    out = usecases_dir.parent / "data.js"
    payload = {"usecases": usecases, "graph": extract}
    out.write_text("window.OPENTOUR_DATA = " + json.dumps(payload, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
    print(f"OK : {out} — {len(extract)} fichiers, {sum(len(v['symbols']) for v in extract.values())} symboles")


if __name__ == "__main__":
    main()
