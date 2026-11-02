"""AI の出口の見本の層(docs/AI_OUTLET.md)。CCP から受けた依頼を、そのまま Gemini(Vertex AI)に回して、答えを返す。

使いたい AI につなぐ層を作るときの、出発点にする(Gemini を呼ぶ所を、使いたい AI を呼ぶ形に書き換える)。
CCP のフォルダの外に写して使う(CCP を新しい版に入れ替えても、層が消えないように)。

動かし方(CCP のサーバーと同じ Python で動く。足すライブラリはない):
  GOOGLE_CLOUD_PROJECT=<プロジェクト> AI_OUTLET_TOKEN=<合言葉> python sample_layer.py --port 8090
CCP のサーバーの側:
  AI_OUTLET_URL=http://127.0.0.1:8090/ask  AI_OUTLET_TOKEN=<同じ合言葉>

  --host       待つアドレス。既定 127.0.0.1(同じマシンの中だけ。外から呼ばれないように)
  --port       待つポート。既定 8090
  環境変数 AI_OUTLET_TOKEN   入っていれば、Authorization: Bearer <合言葉> のない呼び出しを断る
  環境変数 GEMINI_MODEL      既定 gemini-3.5-flash(GOOGLE_CLOUD_LOCATION は既定 global)
"""
from __future__ import annotations

import argparse
import base64
import hmac
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VERSION = 1
_client = None


def gemini(parts: list[dict], effort: str | None) -> str:
    """約束の parts を Gemini に渡して、答えの文を返す。使いたい AI につなぐときは、ここを書き換える"""
    global _client
    from google import genai
    from google.genai import types

    if _client is None:
        _client = genai.Client(vertexai=True, project=os.environ["GOOGLE_CLOUD_PROJECT"], location=os.getenv("GOOGLE_CLOUD_LOCATION", "global"))
    contents = []
    for p in parts:
        if "text" in p:
            contents.append(p["text"])
        elif "image" in p:
            contents.append(types.Part.from_bytes(data=base64.b64decode(p["image"]["data"]), mime_type=p["image"]["mime_type"]))
    resp = _client.models.generate_content(
        model=os.getenv("GEMINI_MODEL", "gemini-3.5-flash"),
        contents=contents,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel(effort.upper())) if effort else None,
        ),
    )
    return (resp.text or "").strip()


def handle(body: dict, answer=gemini) -> tuple[int, dict]:
    """依頼 1 つを受けて、(HTTP の番号, 返す JSON)を返す。HTTP の受け口と分けて、試しやすくしている"""
    if body.get("version") != VERSION:
        return 400, {"error": {"message": f"約束の版 {body.get('version')} には対応していません(対応は {VERSION})"}}
    parts = body.get("parts")
    if not isinstance(parts, list) or not parts:
        return 400, {"error": {"message": "parts がありません"}}
    try:
        text = answer(parts, body.get("effort"))
    except Exception as e:  # noqa: BLE001 — どんな失敗も、理由を CCP に返す
        busy = "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e)
        return (429 if busy else 502), {"error": {"message": f"AI の呼び出しに失敗しました: {type(e).__name__}"}}
    if not text:
        return 502, {"error": {"message": "AI の返答が空でした"}}
    return 200, {"text": text}


class Handler(BaseHTTPRequestHandler):
    answer = staticmethod(gemini)
    token: str | None = None  # 確かめる合言葉。None なら環境変数 AI_OUTLET_TOKEN

    def do_POST(self) -> None:  # noqa: N802 — http.server の決まった名前
        token = (self.token if self.token is not None else os.getenv("AI_OUTLET_TOKEN", "")).strip()
        if token and not hmac.compare_digest(self.headers.get("Authorization", ""), f"Bearer {token}"):
            return self._send(401, {"error": {"message": "合言葉が違います"}})
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
        except ValueError:
            return self._send(400, {"error": {"message": "JSON として読めません"}})
        self._send(*handle(body if isinstance(body, dict) else {}, self.answer))

    def _send(self, status: int, out: dict) -> None:
        data = json.dumps(out, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt: str, *args) -> None:  # 中身(指示文・画像)は出さず、1 行だけ
        sys.stderr.write(f"{self.address_string()} {fmt % args}\n")


def main() -> None:
    ap = argparse.ArgumentParser(description="AI の出口の見本の層(受けた依頼を Gemini に回す)")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8090)
    a = ap.parse_args()
    print(f"見本の層: http://{a.host}:{a.port}/ask で待っています(合言葉: {'あり' if os.getenv('AI_OUTLET_TOKEN') else 'なし'})", flush=True)
    ThreadingHTTPServer((a.host, a.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
