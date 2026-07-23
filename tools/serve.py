"""Serveur du proto : sert web/ (viewer générique) + le data.js du projet + endpoint /src.

Le code source est lu sur le disque local (racine = <project-root>).
Provider alternatif (version industrialisée, hors proto) : API REST Azure
DevOps `_apis/git/items` + PAT — même contrat de sortie JSON.
Usage : python tools/serve.py <project-root> [port]
"""
import json
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from build_data import resolve_usecases_dir

ROOT = Path(__file__).resolve().parent.parent
USECASES_DIR = resolve_usecases_dir(sys.argv[1] if len(sys.argv) > 1 else None)
DATA_JS = USECASES_DIR.parent / "data.js"
SRC_ROOT = USECASES_DIR.parent.parent  # racine du repo analysé


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / "web"), **kwargs)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/data.js":
            if not DATA_JS.is_file():
                self.send_error(404, "data.js absent — lancer tools/build_data.py d'abord")
                return
            body = DATA_JS.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/javascript; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if url.path != "/src":
            return super().do_GET()
        rel = parse_qs(url.query).get("path", [""])[0]
        target = (SRC_ROOT / rel).resolve()
        if not str(target).startswith(str(SRC_ROOT.resolve())) or not target.is_file():
            self.send_error(404, "fichier hors racine ou introuvable")
            return
        body = json.dumps(
            {"path": rel, "content": target.read_text(encoding="utf-8", errors="replace")},
            ensure_ascii=False,
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8642
    print(f"open-tour sur http://127.0.0.1:{port}/ — sources : {SRC_ROOT}")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
