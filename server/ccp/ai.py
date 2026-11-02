"""/api/ask — 画面から受け取った依頼文を AI に渡し、返答のテキストをそのまま返す。
AI を呼ぶ所(/api/ask・メイン画像の説明・部品の画像の説明・商品ページの画像の提案)は、すべて generate() を通す。

AI の出口(docs/AI_OUTLET.md):
  AI_OUTLET_URL          入っていれば、AI をすべて、外の層(この URL)に頼む。空なら Gemini(いまどおり)
  AI_OUTLET_TOKEN        層に送る合言葉(Authorization: Bearer)。空なら送らない
  AI_OUTLET_TIMEOUT      1 回の待ち時間(秒)。既定 120
  層が失敗しても、自動で Gemini には回さない(どちらの AI が書いたか分からなくなる・データを Google に出したくない場合に困るため)。

プロンプトの作り方・返答の JSON の解釈・やり直しは、画面側(src/aiSelect.ts)にあり。
ここは「文字列を渡して、文字列を受け取る」だけにして、2 つのビルドで AI の動きがずれないようにする。

設定(環境変数。営業支援システムと同じ Vertex AI):
  GOOGLE_CLOUD_PROJECT   プロジェクト ID(コードには書かない)
  GOOGLE_CLOUD_LOCATION  既定 global
  GEMINI_MODEL           既定 gemini-3.5-flash
  GEMINI_THINKING        思考の深さ(minimal / low / medium / high)。既定 low(1 回の下書きで 6〜9 回呼ぶため、速さを優先)
  GEMINI_CONCURRENCY     AI への同時の呼び出しの上限。既定 4(混み合いによる 429 を減らす)。出口を使うときも効く

混み合い(429 RESOURCE_EXHAUSTED)や一時的なサーバーエラー(500/503/504)は、SDK が間隔を空けて、最大 5 回まで自動でやり直す。
"""
from __future__ import annotations

import asyncio
import base64
import logging
import os
from dataclasses import dataclass
from typing import Union

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from google import genai
from google.genai import types
import requests
from pydantic import BaseModel, Field

from . import dbready
from .creds import get_credentials

log = logging.getLogger("ccp.ai")


async def note_activity() -> None:
    """AI の利用も、アクセスとして数える(使っている間に、DB を止めないため)"""
    c = dbready.controller()
    if c is not None:
        await c.touch()


router = APIRouter(prefix="/api", dependencies=[Depends(note_activity)])

_client: genai.Client | None = None
_gate: asyncio.Semaphore | None = None
RETRY = types.HttpRetryOptions(attempts=5, initial_delay=2.0, max_delay=30.0, exp_base=2.0, jitter=1.0, http_status_codes=[429, 500, 503, 504])


def get_client() -> genai.Client:
    """Gemini(Vertex AI)の呼び出し口。プロセスで 1 つを使い回す(ほかのモジュールも、これを通す)"""
    global _client
    if _client is None:
        _client = genai.Client(
            vertexai=True,
            project=os.environ["GOOGLE_CLOUD_PROJECT"],
            location=os.getenv("GOOGLE_CLOUD_LOCATION", "global"),
            credentials=get_credentials(),
            http_options=types.HttpOptions(retry_options=RETRY),
        )
    return _client


@dataclass
class Image:
    """AI に見せる画像(JPEG・PNG・WebP)"""
    data: bytes
    mime_type: str


Part = Union[str, Image]
OUTLET_VERSION = 1


class OutletError(Exception):
    """出口の層が失敗した(message は、使う人に見せてよい理由。status は層が返した HTTP の番号。届かなかったときは 0)"""

    def __init__(self, message: str, status: int = 0):
        super().__init__(message)
        self.message = message
        self.status = status


def outlet_url() -> str:
    return os.getenv("AI_OUTLET_URL", "").strip()


def _gate_() -> asyncio.Semaphore:
    global _gate
    if _gate is None:
        _gate = asyncio.Semaphore(int(os.getenv("GEMINI_CONCURRENCY", "4")))
    return _gate


async def generate(purpose: str, parts: list[Part], *, effort: str | None = None) -> str:
    """AI に parts(文と画像。並んだ順に渡す)を見せ、返答の文(JSON の文)を返す。失敗したら例外を投げる。
    purpose は使う所(ask / hero_describe / part_describe / product_image_suggest)。effort は考える深さ(minimal / low / medium / high)。
    出口(AI_OUTLET_URL)が入っていれば層に、空なら Gemini に頼む。同時に呼ぶ数の上限は、どちらにも効かせる"""
    async with _gate_():
        if outlet_url():
            return await asyncio.to_thread(_ask_outlet, purpose, parts, effort)
        contents = [p if isinstance(p, str) else types.Part.from_bytes(data=p.data, mime_type=p.mime_type) for p in parts]
        resp = await get_client().aio.models.generate_content(
            model=os.getenv("GEMINI_MODEL", "gemini-3.5-flash"),
            contents=contents[0] if len(contents) == 1 else contents,
            config=types.GenerateContentConfig(
                # 返答は JSON だけ(プロンプトでも指示しているが、形式の崩れを減らす)
                response_mime_type="application/json",
                thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel(effort.upper())) if effort else None,
            ),
        )
        return (resp.text or "").strip()


def _ask_outlet(purpose: str, parts: list[Part], effort: str | None) -> str:
    """層との約束(版 1。docs/AI_OUTLET.md の 2 章)で、層に頼む"""
    body: dict = {
        "version": OUTLET_VERSION,
        "purpose": purpose,
        "parts": [{"text": p} if isinstance(p, str) else {"image": {"mime_type": p.mime_type, "data": base64.b64encode(p.data).decode("ascii")}} for p in parts],
        "response_format": "json",
    }
    if effort:
        body["effort"] = effort.lower()
    headers = {"Content-Type": "application/json"}
    token = os.getenv("AI_OUTLET_TOKEN", "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        r = requests.post(outlet_url(), json=body, headers=headers, timeout=float(os.getenv("AI_OUTLET_TIMEOUT") or 120))
    except requests.RequestException as e:
        raise OutletError(f"AI の出口(AI_OUTLET_URL)に届きませんでした: {type(e).__name__}") from e
    try:
        got = r.json()
    except ValueError:
        got = None
    if r.status_code != 200:
        msg = ((got or {}).get("error") or {}).get("message") if isinstance(got, dict) and isinstance(got.get("error"), dict) else None
        raise OutletError(str(msg or f"AI の出口が失敗を返しました(HTTP {r.status_code})")[:500], r.status_code)
    text = got.get("text") if isinstance(got, dict) else None
    if not isinstance(text, str):
        raise OutletError("AI の出口の返答に text がありません", r.status_code)
    return text.strip()


def reason(e: Exception) -> str:
    """失敗の理由の短い文(出口の層の理由は、そのまま見せてよい約束)"""
    return e.message if isinstance(e, OutletError) else type(e).__name__


class AskIn(BaseModel):
    prompt: str = Field(min_length=1, max_length=400_000)


@router.post("/ask")
async def ask(body: AskIn):
    try:
        text = await generate("ask", [body.prompt], effort=os.getenv("GEMINI_THINKING", "low"))
    except OutletError as e:
        log.warning("AI の出口が失敗しました: %s(HTTP %s)", e.message, e.status)
        hint = "AI が混み合っています。しばらくしてから、もう一度お試しください。" if e.status == 429 else ""
        return JSONResponse({"success": False, "error": {"message": f"{hint}AI の呼び出しに失敗しました: {e.message}"[:600]}}, status_code=502)
    except Exception as e:  # noqa: BLE001 — Vertex AI のエラーは種類が多い。画面に原因を返す
        log.exception("Gemini の呼び出しに失敗しました")
        busy = "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e)
        hint = "AI が混み合っています。しばらくしてから、もう一度お試しください。" if busy else ""
        return JSONResponse({"success": False, "error": {"message": f"{hint}AI の呼び出しに失敗しました: {type(e).__name__}: {e}"[:600]}}, status_code=502)
    if not text:
        return JSONResponse({"success": False, "error": {"message": "AI の返答が空でした(安全フィルターなどで止まった可能性があります)"}}, status_code=502)
    return {"success": True, "text": text}
