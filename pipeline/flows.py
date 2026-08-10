"""pipeline/flows.py — Phase FLOWS (métadonnées Salesforce, optionnelle).

CodeGraph indexe les `.flow-meta.xml` au niveau fichier seulement — aucune
grammaire tree-sitter ne couvre la métadonnée Flow. Sur un dépôt SFDX cela
donne un node plat par flow, zéro arête, et un snippet enrich réduit aux
60 premières lignes de XML (or les balises sont triées alphabétiquement :
`<start>`, qui porte l'objet déclencheur, arrive en fin de fichier).

Cette phase rattrape les deux manques avec xml.etree (stdlib) :
  - `flow_digest()` : résumé structuré, consommé par enrich.py::_snippet ;
  - `flows()` : arêtes `calls` (Apex invoqué, sous-flux) et `imports`
    (objets manipulés) injectées dans les batch-<i>.json.

No-op sur un projet sans `.flow-meta.xml`.

Usage: python pipeline/flows.py <project-root>
"""
from __future__ import annotations

import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from _common import intermediate_dir, read_json, write_json

NS = "{http://soap.sforce.com/2006/04/metadata}"

# Éléments Flow porteurs d'un <object> : opération -> balise.
CRUD_TAGS = {
    "recordCreates": "create",
    "recordUpdates": "update",
    "recordLookups": "lookup",
    "recordDeletes": "delete",
}

# Éléments dont on ne rapporte que le compte (volume, pas de sémantique utile).
COUNTED_TAGS = ("decisions", "assignments", "screens", "formulas", "variables", "loops")

MAX_LISTED = 15


def parse_flow(xml_path: Path) -> dict | None:
    """Extrait le modèle exploitable d'un .flow-meta.xml. None si illisible."""
    try:
        root = ET.parse(xml_path).getroot()
    except (ET.ParseError, OSError):
        return None

    start = root.find(NS + "start")
    crud: list[tuple[str, str]] = []
    for tag, op in CRUD_TAGS.items():
        for el in root.findall(NS + tag):
            obj = el.findtext(NS + "object")
            if obj:
                crud.append((obj, op))

    return {
        "label": root.findtext(NS + "label") or xml_path.name,
        "description": (root.findtext(NS + "description") or "").strip(),
        "processType": root.findtext(NS + "processType") or "",
        "status": root.findtext(NS + "status") or "",
        "triggerObject": start.findtext(NS + "object") if start is not None else None,
        "triggerType": start.findtext(NS + "recordTriggerType") if start is not None else None,
        "triggerFilter": (start.findtext(NS + "filterFormula") or "").strip() if start is not None else "",
        "apex": sorted({
            ac.findtext(NS + "actionName")
            for ac in root.findall(NS + "actionCalls")
            if ac.findtext(NS + "actionType") == "apex" and ac.findtext(NS + "actionName")
        }),
        "subflows": sorted({
            s.findtext(NS + "flowName") for s in root.findall(NS + "subflows") if s.findtext(NS + "flowName")
        }),
        "crud": sorted(set(crud)),
        "decisionLabels": [
            d.findtext(NS + "label") or d.findtext(NS + "name") or ""
            for d in root.findall(NS + "decisions")
        ],
        "counts": {tag: len(root.findall(NS + tag)) for tag in COUNTED_TAGS},
    }


def flow_digest(xml_path: Path) -> str | None:
    """Digest texte d'un flow, à donner au LLM à la place du XML brut.
    None si le fichier n'est pas un flow lisible."""
    f = parse_flow(xml_path)
    if f is None:
        return None

    lines = [f"Flow Salesforce « {f['label'] } » — {f['processType']} / {f['status'] or 'statut inconnu'}"]
    if f["description"]:
        lines.append(f"Description : {f['description']}")
    if f["triggerObject"]:
        trigger = f"Déclencheur : {f['triggerObject']} ({f['triggerType'] or 'non précisé'})"
        if f["triggerFilter"]:
            trigger += f" — filtre : {f['triggerFilter']}"
        lines.append(trigger)
    if f["apex"]:
        lines.append(f"Classes Apex invoquées : {', '.join(f['apex'])}")
    if f["subflows"]:
        lines.append(f"Sous-flux appelés : {', '.join(f['subflows'])}")
    if f["crud"]:
        lines.append("Objets manipulés : " + ", ".join(f"{o} ({op})" for o, op in f["crud"][:MAX_LISTED]))
    labels = [d for d in f["decisionLabels"] if d][:MAX_LISTED]
    if labels:
        lines.append("Décisions : " + " | ".join(labels))
    lines.append("Volumétrie : " + ", ".join(f"{k}={v}" for k, v in f["counts"].items() if v))
    return "\n".join(lines)


def _target_index(project: Path) -> dict[str, str]:
    """basename -> chemin relatif, restreint aux fichiers réellement scannés
    (donc présents comme nodes dans le graphe : pas d'arête orpheline)."""
    files = read_json(intermediate_dir(project) / "scan-result.json")["files"]
    index: dict[str, str] = {}
    for entry in files:
        index.setdefault(Path(entry["path"]).name, entry["path"])
    return index


def flow_edges(rel_path: str, flow: dict, targets: dict[str, str]) -> list[dict]:
    """Arêtes sortantes d'un flow. Une cible absente du dépôt (classe d'un
    package managé, objet standard sans métadonnée versionnée) est ignorée
    plutôt que de produire une arête pendante."""
    source = f"file:{rel_path}"
    edges: list[dict] = []

    for name in flow["apex"]:
        path = targets.get(f"{name}.cls")
        if path:
            edges.append({"source": source, "target": f"class:{path}:{name}", "type": "calls"})

    for name in flow["subflows"]:
        path = targets.get(f"{name}.flow-meta.xml")
        if path:
            edges.append({"source": source, "target": f"file:{path}", "type": "calls"})

    objects = {flow["triggerObject"]} if flow["triggerObject"] else set()
    objects |= {obj for obj, _ in flow["crud"]}
    for obj in sorted(objects):
        path = targets.get(f"{obj}.object-meta.xml")
        if path:
            edges.append({"source": source, "target": f"file:{path}", "type": "imports"})

    return edges


def flows(project: Path) -> int:
    """Injecte les arêtes Flow dans les batch-<i>.json. Retourne le nombre
    d'arêtes ajoutées (0 si le projet ne contient aucun flow)."""
    inter = intermediate_dir(project)
    batch_files = sorted(inter.glob("batch-*.json"))
    if not batch_files:
        return 0

    targets = _target_index(project)
    added = 0
    for batch_path in batch_files:
        data = read_json(batch_path)
        new_edges: list[dict] = []
        for node in data["nodes"]:
            rel = node.get("filePath", "")
            if not rel.endswith(".flow-meta.xml"):
                continue
            flow = parse_flow(project / rel)
            if flow is None:
                continue
            new_edges.extend(flow_edges(rel, flow, targets))
        if not new_edges:
            continue
        existing = {(e["source"], e["target"], e["type"]) for e in data["edges"]}
        fresh = [e for e in new_edges if (e["source"], e["target"], e["type"]) not in existing]
        data["edges"] = sorted(data["edges"] + fresh, key=lambda e: (e["source"], e["target"], e["type"]))
        write_json(batch_path, data)
        added += len(fresh)

    return added


def _selfcheck() -> None:
    """Parse + digest + arêtes sur un flow synthétique couvrant déclencheur,
    Apex résolu, Apex non résolu (package managé), sous-flux et CRUD."""
    import tempfile

    xml = """<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <actionCalls><actionType>apex</actionType><actionName>MaClasse</actionName></actionCalls>
    <actionCalls><actionType>apex</actionType><actionName>ClasseManagee</actionName></actionCalls>
    <actionCalls><actionType>chatterPost</actionType><actionName>chatterPost</actionName></actionCalls>
    <decisions><label>Le montant depasse-t-il le seuil ?</label></decisions>
    <label>Mon Flow</label>
    <processType>AutoLaunchedFlow</processType>
    <recordUpdates><object>Projet__c</object></recordUpdates>
    <status>Active</status>
    <subflows><flowName>SousFlux</flowName></subflows>
    <start><object>Absence__c</object><recordTriggerType>Create</recordTriggerType></start>
</Flow>"""
    with tempfile.TemporaryDirectory() as td:
        path = Path(td) / "Mon_Flow.flow-meta.xml"
        path.write_text(xml, encoding="utf-8")

        f = parse_flow(path)
        assert f["triggerObject"] == "Absence__c" and f["triggerType"] == "Create", f
        assert f["apex"] == ["ClasseManagee", "MaClasse"], f["apex"]
        assert f["subflows"] == ["SousFlux"], f["subflows"]
        assert f["crud"] == [("Projet__c", "update")], f["crud"]

        digest = flow_digest(path)
        assert "Absence__c (Create)" in digest and "MaClasse" in digest, digest
        assert "seuil" in digest, digest

        targets = {
            "MaClasse.cls": "classes/MaClasse.cls",
            "SousFlux.flow-meta.xml": "flows/SousFlux.flow-meta.xml",
            "Absence__c.object-meta.xml": "objects/Absence__c/Absence__c.object-meta.xml",
        }
        edges = flow_edges("flows/Mon_Flow.flow-meta.xml", f, targets)
        kinds = {(e["target"], e["type"]) for e in edges}
        assert ("class:classes/MaClasse.cls:MaClasse", "calls") in kinds, kinds
        assert ("file:flows/SousFlux.flow-meta.xml", "calls") in kinds, kinds
        assert ("file:objects/Absence__c/Absence__c.object-meta.xml", "imports") in kinds, kinds
        # ClasseManagee absente du dépôt et Projet__c sans métadonnée -> pas d'arête pendante
        assert len(edges) == 3, edges

    assert flow_digest(Path("n_existe_pas.flow-meta.xml")) is None
    print("OK flows.py self-check")


if __name__ == "__main__":
    if len(sys.argv) == 1:
        _selfcheck()
    elif len(sys.argv) == 2:
        n = flows(Path(sys.argv[1]).resolve())
        print(f"flows.py: {n} arêtes Flow ajoutées")
    else:
        print("Usage: python pipeline/flows.py [project-root]", file=sys.stderr)
        sys.exit(1)
