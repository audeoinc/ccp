"""見本の画面(デモのビルド)を返すだけの、小さなサーバー。

push のたびに、デモのビルド(vite.mock.config.ts。サーバーも DB も使わない)を、置き場所のフォルダへ
ブランチごとに置く(cloudbuild-preview.yaml)。このサーバーは、そのフォルダを読んで返すだけで、作り直さない。
  /                 ブランチの一覧
  /b/main/          main の見本(フォルダ main/)
  /b/<ブランチ>/     作りかけのブランチの見本(フォルダ branches/<ブランチ>/。14 日で消える)
守りは本番と同じ Basic 認証(パスワードは環境変数 APP_PASSWORD。ユーザー名は何でもよい)。
置き場所のフォルダは環境変数 SITE_DIR(既定 /site)。標準の部品だけで書く(依存を足さない)。
"""

from __future__ import annotations

import base64
import hmac
import html
import mimetypes
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

SITE = Path(os.environ.get("SITE_DIR", "/site")).resolve()
PASSWORD = os.environ.get("APP_PASSWORD", "")
# ブランチ名は、ビルドの側で URL に使える形(英小文字・数字・-)にそろえてある
SAFE = set("abcdefghijklmnopqrstuvwxyz0123456789-")


def folder_of(slug: str) -> Path | None:
    if not slug or not set(slug) <= SAFE:
        return None
    return SITE / "main" if slug == "main" else SITE / "branches" / slug


def branches() -> list[tuple[str, float]]:
    """見本のあるブランチと、更新した時刻(新しい順。main は先頭)"""
    out: list[tuple[str, float]] = []
    for slug, d in [("main", SITE / "main")] + [(p.name, p) for p in sorted((SITE / "branches").glob("*"))]:
        index = d / "index.html"
        if index.is_file():
            out.append((slug, index.stat().st_mtime))
    return sorted(out, key=lambda x: (x[0] != "main", -x[1]))


class Handler(BaseHTTPRequestHandler):
    server_version = "ccp-preview"

    def authorized(self) -> bool:
        if not PASSWORD:
            return False
        h = self.headers.get("Authorization", "")
        if not h.startswith("Basic "):
            return False
        try:
            _, _, given = base64.b64decode(h[6:]).decode("utf-8").partition(":")
        except Exception:
            return False
        return hmac.compare_digest(given.encode(), PASSWORD.encode())

    def send(self, code: int, body: bytes, ctype: str, extra: dict[str, str] | None = None) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def do_HEAD(self) -> None:
        self.do_GET()

    def do_GET(self) -> None:
        if not self.authorized():
            self.send(401, b"", "text/plain", {"WWW-Authenticate": 'Basic realm="ccp-preview", charset="UTF-8"'})
            return
        path = unquote(urlsplit(self.path).path)
        if path in ("", "/"):
            self.index()
            return
        parts = path.split("/")
        # /b/<ブランチ>  → 末尾の / を足して開き直す(中のファイルを ./ で読むため)
        if len(parts) == 3 and parts[1] == "b":
            self.send(301, b"", "text/plain", {"Location": f"/b/{parts[2]}/"})
            return
        if len(parts) < 4 or parts[1] != "b":
            self.send(404, b"not found", "text/plain")
            return
        root = folder_of(parts[2])
        rel = "/".join(parts[3:]) or "index.html"
        target = (root / rel).resolve() if root else None
        # フォルダの外は返さない。ないファイルは 404(画面の行き先は ? の後ろなので、index.html で受ける必要はない)
        if not root or not target or not str(target).startswith(str(root.resolve()) + os.sep) or not target.is_file():
            self.send(404, b"not found", "text/plain")
            return
        ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        # 名前にハッシュの入った assets は長く覚えさせ、index.html は毎回確かめさせる(push のあと、開き直せば新しい見本になるように)
        cache = "public, max-age=31536000, immutable" if "/assets/" in path else "no-cache"
        self.send(200, target.read_bytes(), ctype, {"Cache-Control": cache})

    def index(self) -> None:
        rows = "".join(
            f'<li><a href="/b/{html.escape(s)}/">{html.escape(s)}</a> <span>{time.strftime("%Y-%m-%d %H:%M", time.localtime(t))}</span></li>'
            for s, t in branches()
        )
        body = f"""<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>CCP preview</title>
<style>body{{font:15px system-ui,sans-serif;margin:24px;line-height:1.8}}span{{color:#666;font-size:13px;margin-left:8px}}</style>
<h1>CCP preview / 見本の画面</h1>
<p>見本のデータで動く画面です(本物のデータ・AI は使いません)。/ Demo build with sample data.</p>
<ul>{rows or '<li>まだありません / none yet</li>'}</ul>"""
        self.send(200, body.encode("utf-8"), "text/html; charset=utf-8", {"Cache-Control": "no-cache"})

    def log_message(self, fmt: str, *args: object) -> None:
        # Cloud Run のログに、1 行ずつ(パスワードは出さない)
        print(f"{self.command} {urlsplit(self.path).path} {args[1] if len(args) > 1 else ''}", flush=True)


if __name__ == "__main__":
    ThreadingHTTPServer(("", int(os.environ.get("PORT", "8080"))), Handler).serve_forever()
