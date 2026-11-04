"""初期設定の画面(settings.setup。2026-11-03 利用者「忘れていても問題ないように」)。

新しいサーバーで起動して、起動に要る設定が足りなければ(DB のつなぎ先がない・DB につながらない)、
サーバーは DB なしの「初期設定」の状態で動き、画面は初期設定だけを出す。人が手順を覚えていなくても、上から順に入れれば動き出す。

- 段: ① DB → ② Google(プロジェクト。認証は環境から渡されているかを確かめるだけ) → ③ 写真の置き場所 → ④ 画面のパスワード → ⑤ 健康診断を見て始める。
  BigQuery・AI のモデルは DB の設定なので、始めたあと ⚙ で入れる(健康診断の「直す」が連れて行く)。
- どの段も「つながるか確認」が通らないと保存しない(次へ進めない)。②〜④ は「あとで」で飛ばせる(飛ばしたことはファイルに残す)。
- 途中でやめても、次に開くと、済んでいない最初の段から始まる(済んだかは、いまの値から求める)。
- 守り: 初期設定の間は、だれでも画面を開ける。起動のときにサーバーのログに一度だけの合言葉を出し、それを入れた人だけが読み書きできる。
- 値はサーバーの設定のファイル(envfile.py)に書く。環境から渡された値(Secrets など)が優先で、その項目は画面で変えられない。
- 設定が済んでいる間は、この窓口は何もしない(needed=false を返すだけ)。
"""
from __future__ import annotations

import asyncio
import logging
import os
import secrets
from pathlib import Path
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Request

from . import dbready, envfile, optional

log = logging.getLogger("ccp.setup")
router = APIRouter(prefix="/api/setup")

STEPS = ("db", "google", "assets", "password")
# 飛ばせる段(DB は飛ばせない。なければ何も動かない)
SKIPPABLE = {"google", "assets", "password"}
SKIP_KEY = "CCP_SETUP_SKIPPED"
KEY_HEADER = "x-ccp-setup-key"

_state: dict[str, Any] = {"active": False, "reason": "", "key": "", "db_ok": False}


def active() -> bool:
    return bool(_state["active"])


def missing_reason() -> str:
    """設定のファイル・環境だけで分かる、足りない理由(DB にはつながない)"""
    if os.getenv("DATABASE_URL") or optional.hosted("connect", "create_engine") is not None:
        return ""
    return "DB のつなぎ先(DATABASE_URL)がありません"


def activate(reason: str) -> None:
    _state.update(active=True, reason=reason)
    if not _state["key"]:
        _state["key"] = secrets.token_urlsafe(9)
    # ログを見られる人(サーバーを立てた人)だけが、画面で初期設定を進められるように。合言葉は、この起動の間だけ使える
    banner = (
        "\n" + "=" * 64 + f"\n  初期設定が要ります: {reason}\n  画面を開くと「初期設定」が出ます。次の合言葉を入れてください:\n\n"
        f"      {_state['key']}\n\n  (この合言葉は、サーバーを起動し直すと変わります)\n" + "=" * 64
    )
    log.warning(banner)
    print(banner, flush=True)


async def try_db(url: str) -> tuple[bool, str]:
    """その URL で、つないでみる(何も書かない)。合っていれば PostgreSQL の版を返す"""
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    try:
        engine = create_async_engine(url, pool_size=1, max_overflow=0)
    except Exception as e:  # noqa: BLE001 — URL の形が違う など
        return False, f"つなぎ先の形が違います({type(e).__name__}: {str(e)[:160]})"
    try:
        async with engine.connect() as conn:
            version = (await asyncio.wait_for(conn.execute(text("SELECT version()")), 10)).scalar_one()
        return True, str(version).split(",")[0]
    except Exception as e:  # noqa: BLE001 — 原因を、そのまま見せる
        return False, _db_reason(e)
    finally:
        await engine.dispose()


def _db_reason(e: BaseException) -> str:
    text = f"{type(e).__name__}: {str(e)[:200]}"
    for keys, hint in (
        (("password authentication failed", "InvalidPassword"), "ユーザーかパスワードが違います"),
        (("does not exist", "InvalidCatalogName"), "DB の名前が見つかりません(先に PostgreSQL で DB を作ってください)"),
        (("gaierror", "Name or service not known", "getaddrinfo"), "ホストが見つかりません(ホスト名を確かめてください)"),
        (("Connection refused", "ConnectionRefused", "Errno 111", "WinError 1225"), "ホストには届きましたが、PostgreSQL が受け付けていません(ポート・PostgreSQL が動いているか・接続を許す設定)"),
        (("TimeoutError", "timeout"), "時間内に返事がありません(ホスト・ポート・間の通り道(ファイアウォールなど))"),
    ):
        if any(k in text for k in keys):
            return f"{hint}。({text})"
    return text


async def at_startup() -> None:
    """起動のときに、初期設定が要るかを決める。DB を必要なときだけ起こす環境では、つなぎに行かない(つなぎ先は環境が持つ)"""
    reason = missing_reason()
    if not reason and os.getenv("DATABASE_URL") and dbready.controller() is None:
        ok, why = await try_db(os.environ["DATABASE_URL"])
        _state["db_ok"] = ok
        if not ok:
            reason = f"DB につながりません: {why}"
    if reason:
        activate(reason)


# ---- 段ごとの値・確かめ・保存


def build_url(v: dict[str, Any]) -> str:
    host = str(v.get("host") or "").strip()
    port = str(v.get("port") or "5432").strip()
    name = str(v.get("name") or "").strip()
    user = str(v.get("user") or "").strip()
    password = str(v.get("password") or "")
    if not (host and name and user):
        raise ValueError("ホスト・DB の名前・ユーザーを入れてください")
    if not port.isdigit():
        raise ValueError("ポートは数字で入れてください(ふつうは 5432)")
    # パスワードの @ や : などは、URL の中で別の意味になるので、置き換えて入れる(人が %40 を覚えていなくてよいように)
    return f"postgresql+asyncpg://{quote(user, safe='')}:{quote(password, safe='')}@{host}:{port}/{quote(name, safe='')}"


def _db_values() -> dict[str, Any]:
    url = os.getenv("DATABASE_URL", "")
    if not url:
        return {"host": "", "port": "5432", "name": "", "user": ""}
    from sqlalchemy.engine import make_url

    try:
        u = make_url(url)
    except Exception:  # noqa: BLE001
        return {"host": "", "port": "5432", "name": "", "user": ""}
    return {"host": u.host or "", "port": str(u.port or 5432), "name": u.database or "", "user": u.username or ""}


def _skipped() -> set[str]:
    return {s for s in os.getenv(SKIP_KEY, "").split(",") if s}


def _step(step: str) -> dict[str, Any]:
    skipped = step in _skipped()
    if step == "db":
        return {"id": "db", "done": bool(_state["db_ok"]), "locked": envfile.from_env("DATABASE_URL"), "values": _db_values(), "secretSet": bool(os.getenv("DATABASE_URL"))}
    if step == "google":
        project = os.getenv("GOOGLE_CLOUD_PROJECT", "")
        return {
            "id": "google", "done": bool(project) or skipped, "skipped": skipped,
            "locked": envfile.from_env("GOOGLE_CLOUD_PROJECT"),
            "values": {"project": project, "location": os.getenv("GOOGLE_CLOUD_LOCATION", "global")},
        }
    if step == "assets":
        d = os.getenv("ASSET_DIR", "")
        return {"id": "assets", "done": (bool(d) and Path(d).is_dir()) or skipped, "skipped": skipped, "locked": envfile.from_env("ASSET_DIR"), "values": {"dir": d}}
    # ログイン(OIDC)・手前の認証・「守らない」と決めた(CCP_AUTH)なら、画面のパスワードは要らない
    guarded = bool(os.getenv("APP_PASSWORD") or os.getenv("CCP_IAP_AUDIENCE") or os.getenv("OIDC_ISSUER") or os.getenv("CCP_AUTH"))
    return {"id": "password", "done": guarded or skipped, "skipped": skipped, "locked": envfile.from_env("APP_PASSWORD"), "values": {}, "secretSet": bool(os.getenv("APP_PASSWORD"))}


async def check(step: str, v: dict[str, Any]) -> tuple[bool, str, dict[str, str | None]]:
    """入れた値を確かめる。(通ったか, 人に見せる文, 保存するときに書く値)"""
    if step == "db":
        if envfile.from_env("DATABASE_URL"):
            ok, why = await try_db(os.environ["DATABASE_URL"])
            return ok, (f"つながりました({why})" if ok else why), {}
        # パスワードを空のまま確かめたら、いまのパスワードを使う(書くだけの欄なので、画面には戻さない)
        if not v.get("password") and os.getenv("DATABASE_URL"):
            from sqlalchemy.engine import make_url

            v = {**v, "password": make_url(os.environ["DATABASE_URL"]).password or ""}
        try:
            url = build_url(v)
        except ValueError as e:
            return False, str(e), {}
        ok, why = await try_db(url)
        return ok, (f"つながりました({why})" if ok else why), {"DATABASE_URL": url}
    if step == "google":
        project = str(v.get("project") or "").strip()
        location = str(v.get("location") or "global").strip() or "global"
        if not project:
            return False, "プロジェクト(ID)を入れてください", {}
        try:
            from .creds import get_credentials

            creds = await asyncio.wait_for(asyncio.to_thread(get_credentials), 20)
        except Exception as e:  # noqa: BLE001
            return False, f"Google の認証が取れません({type(e).__name__})。サーバーを動かすアカウントの認証が、環境から渡されているかを確かめてください", {}
        who = getattr(creds, "service_account_email", None) or "このサーバーのアカウント"
        return True, f"認証が取れました({who})。AI と BigQuery は、始めたあとに ⚙ で確かめます", {"GOOGLE_CLOUD_PROJECT": project, "GOOGLE_CLOUD_LOCATION": location}
    if step == "assets":
        d = str(v.get("dir") or "").strip()
        if not d:
            return False, "フォルダを入れてください", {}
        p = Path(d)
        if not p.is_absolute():
            return False, "絶対パスで入れてください(起動する場所によって見つからなくなるため)", {}
        base = p if p.exists() else next((q for q in p.parents if q.exists()), None)
        if base is None or not base.is_dir() or not os.access(base, os.W_OK):
            return False, f"{base or p} に書けません(サーバーを動かすユーザーに、書く権限が要ります)", {}
        return True, ("書けます" if p.exists() else "書けます(保存するとフォルダを作ります)"), {"ASSET_DIR": str(p)}
    pw = str(v.get("password") or "")
    if len(pw) < 8:
        return False, "8 文字以上にしてください", {}
    return True, "使えます", {"APP_PASSWORD": pw}


def _key_ok(request: Request) -> bool:
    got = request.headers.get(KEY_HEADER, "")
    return bool(_state["key"]) and secrets.compare_digest(got.encode(), str(_state["key"]).encode())


def _closed() -> dict[str, Any]:
    return {"success": False, "error": {"message": "初期設定は済んでいます", "code": "setup_done"}}


def _need_key() -> dict[str, Any]:
    return {"success": False, "error": {"message": "合言葉が違います。サーバーのログ(起動したターミナル)に出ている合言葉を入れてください", "code": "setup_key"}}


def _view() -> dict[str, Any]:
    return {"needed": True, "reason": _state["reason"], "steps": [_step(s) for s in STEPS], "file": str(envfile.path())}


@router.get("/state")
async def state(request: Request) -> dict[str, Any]:
    """画面が最初に呼ぶ。設定が済んでいれば needed=false だけ。合言葉がなければ、理由だけ(つなぎ先などは出さない)"""
    if not active():
        return {"success": True, "data": {"needed": False}}
    if not _key_ok(request):
        return {"success": True, "data": {"needed": True, "reason": _state["reason"], "keyRequired": True}}
    return {"success": True, "data": _view()}


@router.post("/test/{step}")
async def test(step: str, request: Request) -> dict[str, Any]:
    """保存の前に確かめる(何も書かない)"""
    if not active():
        return _closed()
    if not _key_ok(request):
        return _need_key()
    if step not in STEPS:
        return {"success": False, "error": {"message": f"知らない段です: {step}"}}
    ok, message, _ = await check(step, (await request.json()) or {})
    return {"success": True, "data": {"ok": ok, "message": message}}


@router.post("/save/{step}")
async def save(step: str, request: Request) -> dict[str, Any]:
    """確かめて、通ったときだけファイルに書く(通らなければ書かない。次の段へ進めない)"""
    if not active():
        return _closed()
    if not _key_ok(request):
        return _need_key()
    if step not in STEPS:
        return {"success": False, "error": {"message": f"知らない段です: {step}"}}
    ok, message, values = await check(step, (await request.json()) or {})
    if not ok:
        return {"success": True, "data": {"ok": False, "message": message, "state": _view()}}
    if step == "assets" and values.get("ASSET_DIR"):
        Path(str(values["ASSET_DIR"])).mkdir(parents=True, exist_ok=True)
    skipped = _skipped() - {step}
    envfile.write({**values, SKIP_KEY: ",".join(sorted(skipped)) or None})
    if step == "db":
        _state["db_ok"] = True
        # 前のつなぎ先で作った接続を捨てる(次に DB を使うときに、新しいつなぎ先で作り直す)
        from .db import reset_engine

        await reset_engine()
    log.info("初期設定: %s を保存しました", step)
    return {"success": True, "data": {"ok": True, "message": message, "state": _view()}}


@router.post("/skip/{step}")
async def skip(step: str, request: Request) -> dict[str, Any]:
    if not active():
        return _closed()
    if not _key_ok(request):
        return _need_key()
    if step not in SKIPPABLE:
        return {"success": False, "error": {"message": "この段は飛ばせません"}}
    envfile.write({SKIP_KEY: ",".join(sorted(_skipped() | {step}))})
    return {"success": True, "data": _view()}


@router.post("/finish")
async def finish(request: Request) -> dict[str, Any]:
    """DB の段が済んでいれば、初期設定を終えて、ふつうに動き始める(起動し直さない)。健康診断の結果を返す"""
    if not active():
        return _closed()
    if not _key_ok(request):
        return _need_key()
    if not _state["db_ok"]:
        return {"success": False, "error": {"message": "DB の段が済んでいません"}}
    _state.update(active=False, reason="")
    from .health import at_startup as health_at_startup

    await health_at_startup()
    log.info("初期設定を終えました")
    return {"success": True, "data": {"needed": False}}


async def gate(path: str) -> dict[str, Any] | None:
    """初期設定の間は、初期設定の窓口のほかの API を断る(DB がないまま動いて、分かりにくい失敗を出さないように)"""
    if active() and path.startswith("/api/") and not path.startswith("/api/setup/"):
        return {"success": False, "error": {"message": f"初期設定が済んでいません: {_state['reason']}", "code": "setup_required"}}
    return None
