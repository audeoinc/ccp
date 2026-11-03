"""/api/ask — 画面から受け取った依頼文を AI に渡し、返答のテキストをそのまま返す。
AI を呼ぶ所(/api/ask・メイン画像の説明・部品の画像の説明・商品ページの画像の提案)は、すべて generate() を通す。

AI の出口(docs/AI_OUTLET.md):
  出口の URL             入っていれば、AI をすべて、外の層(この URL)に頼む。空なら Gemini(いまどおり)
  AI_OUTLET_TOKEN        層に送る合言葉(Authorization: Bearer)。空なら送らない(秘密なので、環境変数のまま)
  出口の待ち時間         1 回の待ち時間(秒)。既定 120
  層が失敗しても、自動で Gemini には回さない(どちらの AI が書いたか分からなくなる・データを Google に出したくない場合に困るため)。

プロンプトの作り方・返答の JSON の解釈・やり直しは、画面側(src/aiSelect.ts)にあり。
ここは「文字列を渡して、文字列を受け取る」だけにして、2 つのビルドで AI の動きがずれないようにする。

設定(営業支援システムと同じ Vertex AI):
  GOOGLE_CLOUD_PROJECT   プロジェクト ID(環境変数。コードには書かない)
  GOOGLE_CLOUD_LOCATION  既定 global(環境変数)
  ⚙ →「AI の設定」(DB。appsettings.py のまとめ ai。2026-11-03 までは環境変数で、DB にまだなければ一度だけ写す):
  モデル(GEMINI_MODEL)          既定 gemini-3.5-flash
  考える深さ(GEMINI_THINKING)   minimal / low / medium / high。既定 low(1 回の下書きで 6〜9 回呼ぶため、速さを優先)
  同時の上限(GEMINI_CONCURRENCY) AI への同時の呼び出しの上限。既定 4(混み合いによる 429 を減らす)。出口を使うときも効く
  出口の URL・待ち時間(AI_OUTLET_URL・AI_OUTLET_TIMEOUT)

混み合い(429 RESOURCE_EXHAUSTED)や一時的なサーバーエラー(500/503/504)は、SDK が間隔を空けて、最大 5 回まで自動でやり直す。
"""
from __future__ import annotations

import asyncio
import base64
import logging
import os
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Union

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from google import genai
from google.genai import types
import requests
from pydantic import BaseModel, Field

from . import appsettings, dbready
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
_gate_size = 0
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
    return str(appsettings.get("ai", "outlet_url") or "").strip()


def _gate_() -> asyncio.Semaphore:
    global _gate, _gate_size
    size = int(appsettings.get("ai", "concurrency"))
    # 画面で上限を変えたら、作り直す(いま呼んでいる分は、前の上限のまま終わる)
    if _gate is None or _gate_size != size:
        _gate, _gate_size = asyncio.Semaphore(size), size
    return _gate


async def generate(purpose: str, parts: list[Part], *, effort: str | None = None) -> str:
    """AI に parts(文と画像。並んだ順に渡す)を見せ、返答の文(JSON の文)を返す。失敗したら例外を投げる。
    purpose は使う所(ask / hero_describe / part_describe / product_image_suggest)。effort は考える深さ(minimal / low / medium / high)。
    出口(AI_OUTLET_URL)が入っていれば層に、空なら Gemini に頼む。同時に呼ぶ数の上限は、どちらにも効かせる"""
    await appsettings.ensure()
    async with _gate_():
        if outlet_url():
            return await asyncio.to_thread(_ask_outlet, purpose, parts, effort)
        contents = [p if isinstance(p, str) else types.Part.from_bytes(data=p.data, mime_type=p.mime_type) for p in parts]
        resp = await get_client().aio.models.generate_content(
            model=str(appsettings.get("ai", "model")),
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
        r = requests.post(outlet_url(), json=body, headers=headers, timeout=float(appsettings.get("ai", "outlet_timeout")))
    except requests.RequestException as e:
        raise OutletError(f"AI の出口(⚙ →「AI の設定」の URL)に届きませんでした: {type(e).__name__}") from e
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


# ---- 使えるモデルの一覧と「試す」(⚙ →「AI の設定」。2026-11-03 利用者)

# 一覧を読めないとき(権限がない・外に出られない環境)に出す、コードに持つ一覧。古くなっても「そのほか」で書けるので止まらない
DEFAULT_MODELS = ("gemini-3.5-flash", "gemini-3.5-pro", "gemini-2.5-flash", "gemini-2.5-pro")
MODELS_TTL_S = 24 * 3600
# 文章を作れないモデル(埋め込み・画像・音声・文字起こしなど)は、名前で外す。
# Vertex AI の一覧は「何に使えるか」(supported_actions)を返さないので、名前だけが手がかり(2026-11-03 本番で確かめた)
_NOT_TEXT = ("embedding", "image", "tts", "audio", "live", "vision", "transcribe", "translate", "banana", "omni", "computer-use", "robotics")
# 呼べないことがある古い試験版: 日付つきの試験版・プレビュー(-exp-・-preview-MM-DD)と、1.x の版
_OLD = re.compile(r"-exp(-|$)|-preview-\d{2}-\d{2}|^gemini-1\.")
_VERSION = re.compile(r"^gemini-(\d+(?:\.\d+)?)-?(.*)$")
_models: dict = {"models": [], "at": None, "live": False, "error": ""}


def model_order(name: str) -> tuple:
    """版の大きい順。同じ版の中は flash・pro・flash-lite・そのほかの順で、プレビューは後ろ(名前の逆順だと、変わった名前が先頭に来るため)"""
    m = _VERSION.match(name)
    if not m:
        return (1, 0.0, 1, 9, name)
    rest = m.group(2)
    kind = 2 if rest.startswith("flash-lite") else 0 if rest.startswith("flash") else 1 if rest.startswith("pro") else 3
    return (0, -float(m.group(1)), 1 if "preview" in rest else 0, kind, name)


def text_models(names: list[str]) -> list[str]:
    """文章を作れて、いま呼べそうな Gemini だけを、選びやすい順に"""
    keep = {n for n in names if n.startswith("gemini") and not any(x in n for x in _NOT_TEXT) and not _OLD.search(n)}
    return sorted(keep, key=model_order)


def _read_models() -> list[str]:
    names: list[str] = []
    for m in get_client().models.list(config={"query_base": True}):
        actions = getattr(m, "supported_actions", None)
        if actions and "generateContent" not in actions:
            continue
        names.append((m.name or "").rsplit("/", 1)[-1])
    return text_models(names)


async def list_models(refresh: bool = False) -> dict:
    """いま使える Gemini のモデル。1 日覚えておく。読めなければ、前に読めた一覧か、コードの一覧(live=False と理由を添える)"""
    at = _models["at"]
    fresh = _models["live"] and at and time.time() - at.timestamp() < MODELS_TTL_S
    if refresh or not fresh:
        try:
            names = await asyncio.wait_for(asyncio.to_thread(_read_models), timeout=20)
            if not names:
                raise RuntimeError("文章を作れるモデルが 1 つも返りませんでした")
            _models.update(models=names, at=datetime.now(timezone.utc), live=True, error="")
        except Exception as e:  # noqa: BLE001 — 読めなくても、前の一覧か既定で続ける
            log.warning("モデルの一覧を読めませんでした: %s", e)
            _models.update(live=False, error=explain(e))
    names = list(_models["models"] or DEFAULT_MODELS)
    model = str(appsettings.get("ai", "model"))
    if model and model not in names:
        names.insert(0, model)
    return {"models": names, "at": _models["at"].isoformat() if _models["at"] else None, "live": _models["live"], "error": _models["error"], "builtin": not _models["models"]}


def explain(e: BaseException) -> str:
    """AI を呼べなかった理由を、人に分かる言葉で(元の文も短く添える)"""
    if isinstance(e, OutletError):
        return e.message
    if isinstance(e, (asyncio.TimeoutError, TimeoutError)):
        return "時間内に返事がありませんでした(待ち時間を延ばすか、混み具合・つながりを確かめてください)"
    if isinstance(e, KeyError) and "GOOGLE_CLOUD_PROJECT" in str(e):
        return "サーバーの設定に GOOGLE_CLOUD_PROJECT がありません"
    text = f"{type(e).__name__}: {e}"
    hints = (
        (("404", "NOT_FOUND"), "このモデルは、この環境(プロジェクト・地域)で見つかりません。名前か、GOOGLE_CLOUD_LOCATION を確かめてください"),
        (("403", "PERMISSION_DENIED"), "権限がありません(サーバーのアカウントに Vertex AI を使う権限が要ります)"),
        (("429", "RESOURCE_EXHAUSTED"), "混み合っているか、使える量の上限に達しています。しばらくしてから試してください"),
        (("400", "INVALID_ARGUMENT"), "このモデルでは使えない設定です(考える深さなど)"),
        (("DefaultCredentialsError", "credentials"), "Google の認証がありません(サーバーの認証の設定を確かめてください)"),
        (("ConnectError", "ConnectionError", "getaddrinfo"), "Vertex AI に届きませんでした(外へのつながりを確かめてください)"),
    )
    for keys, hint in hints:
        if any(k in text for k in keys):
            return f"{hint}。({text[:200]})"
    return text[:300]


async def try_call(values: dict | None = None) -> dict:
    """入れた設定(保存の前の値)で、短く 1 回だけ呼ぶ。何も保存しない"""
    with appsettings.trying("ai", values or {}):
        via = "outlet" if outlet_url() else "gemini"
        limit = float(appsettings.get("ai", "outlet_timeout")) + 5 if via == "outlet" else 60.0
        start = time.monotonic()
        try:
            text = await asyncio.wait_for(generate("ask", ['次の JSON だけを返してください: {"ok": true}'], effort=str(appsettings.get("ai", "thinking"))), timeout=limit)
            ok, message = bool(text), "" if text else "返事が空でした"
        except Exception as e:  # noqa: BLE001
            ok, message = False, explain(e)
        return {"ok": ok, "seconds": round(time.monotonic() - start, 1), "message": message, "via": via, "model": str(appsettings.get("ai", "model"))}


class AskIn(BaseModel):
    prompt: str = Field(min_length=1, max_length=400_000)


@router.post("/ask")
async def ask(body: AskIn):
    try:
        await appsettings.ensure()
        text = await generate("ask", [body.prompt], effort=str(appsettings.get("ai", "thinking")))
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
