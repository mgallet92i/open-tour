"""Utilitaires partagés par les phases du pipeline (T-001..T-007).

ponytail: un seul point pour lancer les scripts Node vendorisés + résoudre
les chemins .open-tour/intermediate/ — évite de dupliquer
subprocess.run(...) dans scan.py/batch.py/structure.py/merge.py.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

PIPELINE_DIR = Path(__file__).resolve().parent
VENDOR_SKILL_DIR = PIPELINE_DIR / "vendor" / "ua" / "skills" / "understand"

# Version CLI codegraph validée (schéma interne codegraph.db non garanti stable
# entre versions — les requêtes SQL sont isolées dans structure.py::_load_codegraph_index
# et scan.py, seuls points à retoucher en cas de casse après un upgrade).
CODEGRAPH_TESTED_VERSION = "1.5.0"


def ensure_codegraph_index(project: Path) -> None:
    """EX-002/EX-005 : pas de `.codegraph/` -> `codegraph init`, sinon `codegraph
    sync` (no-op si à jour). Sortie CLI relayée via print(). Factorisée ici
    (ADR-2) pour être partagée par scan.py et structure.py."""
    if not (project / ".codegraph").exists():
        out = run_codegraph("init", str(project), cwd=project)
    else:
        out = run_codegraph("sync", str(project), cwd=project)
    if out:
        # ponytail: console Windows en cp1252, sortie CLI en UTF-8 (box-drawing) -> replace
        enc = sys.stdout.encoding or "utf-8"
        safe = out.encode(enc, errors="replace").decode(enc, errors="replace")
        print(safe, end="" if safe.endswith("\n") else "\n")


def intermediate_dir(project: Path) -> Path:
    d = project / ".open-tour" / "intermediate"
    d.mkdir(parents=True, exist_ok=True)
    return d


def run_node(script_name: str, *args: str) -> None:
    """Lance un script Node vendorisé, échoue bruyamment si le process échoue."""
    script = VENDOR_SKILL_DIR / script_name
    cmd = ["node", str(script), *[str(a) for a in args]]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(
            f"{script_name} failed (exit {result.returncode}):\n{result.stderr}"
        )
    if result.stderr:
        # Warnings non fatales (ex. grammaires tree-sitter absentes) -> stderr du parent
        print(result.stderr, file=sys.stderr, end="")


def run_python(script_name: str, *args: str) -> None:
    script = VENDOR_SKILL_DIR / script_name
    cmd = [sys.executable, str(script), *[str(a) for a in args]]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.stderr:
        print(result.stderr, file=sys.stderr, end="")
    if result.returncode != 0:
        raise RuntimeError(f"{script_name} failed (exit {result.returncode})")


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def check_host_prereqs() -> None:
    """EX-012 : échec net si Node < 22 ou aucune authentification Anthropic.
    EX-006 : échec net si le binaire `codegraph` est absent (checké avant
    Node/API key)."""
    if shutil.which("codegraph") is None:
        raise RuntimeError(
            "codegraph introuvable — installez-le : npm i -g @colbymchenry/codegraph"
        )
    cg_version = run_codegraph("--version", cwd=Path.cwd()).strip()
    if cg_version != CODEGRAPH_TESTED_VERSION:
        print(
            f"AVERTISSEMENT : codegraph {cg_version} detecte, version testee "
            f"{CODEGRAPH_TESTED_VERSION} -- le schema codegraph.db n'est pas garanti "
            "stable ; en cas de casse, voir structure.py::_load_codegraph_index.",
            file=sys.stderr,
        )

    try:
        out = subprocess.run(["node", "--version"], capture_output=True, text=True, check=True)
    except (FileNotFoundError, subprocess.CalledProcessError) as exc:
        raise RuntimeError("Node.js introuvable (requis >= 22) — installez Node.") from exc
    version = out.stdout.strip().lstrip("v")
    major = int(version.split(".")[0])
    if major < 22:
        raise RuntimeError(f"Node.js >= 22 requis, trouvé {version}")
    # Le SDK claude-agent-sdk passe par le CLI Claude Code, qui hérite du
    # login Max — la clé API n'est requise que si le CLI est absent
    # (vérifié 2026-07-16, cf. docs/backlog.md).
    if not os.environ.get("ANTHROPIC_API_KEY") and shutil.which("claude") is None:
        raise RuntimeError(
            "Aucune authentification Anthropic : ni ANTHROPIC_API_KEY dans l'environnement, "
            "ni CLI `claude` sur le PATH (login Max) — requis pour la phase enrich (EX-012)."
        )


def run_codegraph(*args: str, cwd: Path) -> str:
    """Lance `codegraph <args>` avec DO_NOT_TRACK=1 (INV-004). Échoue
    bruyamment si returncode != 0. Retourne stdout (EX-005).

    ponytail: résolution via shutil.which (pas juste "codegraph") — sous
    Windows, CreateProcess ne fait pas la résolution PATHEXT que fait le
    shell, donc lancer le nom nu échoue avec FileNotFoundError sur le shim
    npm (.CMD)."""
    binary = shutil.which("codegraph")
    if binary is None:
        raise RuntimeError(
            "codegraph introuvable — installez-le : npm i -g @colbymchenry/codegraph"
        )
    cmd = [binary, *args]
    result = subprocess.run(
        cmd, cwd=cwd, env={**os.environ, "DO_NOT_TRACK": "1"},
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    if result.returncode != 0:
        raise RuntimeError(f"codegraph {' '.join(args)} failed (exit {result.returncode}):\n{result.stderr}")
    return result.stdout


if __name__ == "__main__":
    # ponytail: check minimal — run_node/run_json round-trip sur un fichier temporaire
    import tempfile

    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / "x.json"
        write_json(p, {"a": 1})
        assert read_json(p) == {"a": 1}

    # T-001 self-check : run_codegraph("--version") si le binaire est présent,
    # sinon on vérifie que check_host_prereqs() lève avec le message d'install
    # quand PATH ne contient pas codegraph.
    if shutil.which("codegraph"):
        out = run_codegraph("--version", cwd=Path.cwd())
        assert out.strip(), "run_codegraph --version a renvoyé une sortie vide"
    else:
        try:
            check_host_prereqs()
            raise AssertionError("check_host_prereqs() aurait dû lever RuntimeError (codegraph absent)")
        except RuntimeError as exc:
            assert "npm i -g @colbymchenry/codegraph" in str(exc)

    print("OK _common.py self-check")
