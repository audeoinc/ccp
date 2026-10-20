"""CCP(Campaign Contents Planner)の GCP 版サーバー。

1 つのプロセスで、画面(ビルド済みの dist-gcp)・データ API・AI(次の段階)を配信する。
アクセスは HTTP Basic 認証(環境変数 APP_PASSWORD。営業支援システムと同じ仕組み)。
"""
from __future__ import annotations

import base64
import os
import secrets
from pathlib import Path

import asyncio
import logging

from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles

from . import dbready
from .ai import router as ai_router
from .approvals import router as approvals_router
from .assets import router as assets_router
from .bq_import import router as bq_router
from .identity import router as me_router
from .production import router as production_router
from .ads import router as ads_router
from .impact import router as impact_router
from .policies import router as policies_router
from .metrics import router as metrics_router
from .pack import router as pack_router
from sqlalchemy import text

from .data_api import db, register_errors, router as data_router

try:
    # 環境ごとの追加の API(ccp/hosted/)。そのフォルダがない環境では、登録しない
    from .hosted.routes import router as hosted_router
except ImportError:
    hosted_router = None

logging.basicConfig(level=logging.INFO)  # DB の状態の記録などを、サーバーのログに出す

APP_PASSWORD = os.getenv("APP_PASSWORD")
STATIC_DIR = Path(os.getenv("STATIC_DIR") or Path(__file__).resolve().parents[2] / "dist-gcp")

app = FastAPI(title="CCP", docs_url=None, redoc_url=None)
register_errors(app)


@app.middleware("http")
async def basic_auth(request: Request, call_next):
    # 死活確認(中身は何も返さない)と、内部の呼び出し(/internal/。呼ばれる側で、署名つきトークンを確認する)は、Basic 認証の対象外
    path = request.url.path
    if APP_PASSWORD and path != "/ping" and not path.startswith("/internal/"):
        header = request.headers.get("authorization", "")
        ok = False
        if header.startswith("Basic "):
            try:
                _, _, pw = base64.b64decode(header[6:]).decode("utf-8").partition(":")
                ok = secrets.compare_digest(pw.encode(), APP_PASSWORD.encode())
            except Exception:  # noqa: BLE001 — 壊れた認証ヘッダーは、不一致として扱う
                ok = False
        if not ok:
            return PlainTextResponse("Unauthorized", status_code=401, headers={"WWW-Authenticate": 'Basic realm="ccp"'})
    return await call_next(request)


@app.get("/ping")
async def healthz():
    return {"ok": True}


@app.get("/api/db/status")
async def db_status():
    """画面の「準備中」表示が、数秒おきに呼ぶ。止まっていれば、起動も依頼する"""
    c = dbready.controller()
    if c is None:
        # DB の自動起動を使わない環境(Workbench など): 実際につながるかを確かめ、つながらなければ理由を返す
        from . import data_api

        try:
            async with db() as conn:
                await asyncio.wait_for(conn.execute(text("SELECT 1")), 8)
        except Exception:  # noqa: BLE001 — 理由は data_api.last_db_error に残っている
            return {"state": "unreachable", "detail": data_api.last_db_error or "理由は不明"}
        return {"state": "running"}
    try:
        await c.ensure_running()
    except dbready.DbNotReady:
        pass
    state = await c.status(fresh=True)
    if state == "running":
        # 状態が「稼働中」でも、接続できるようになるまでには、少し間がある。実際に接続できるかを確かめる
        try:
            async with db() as conn:
                await asyncio.wait_for(conn.execute(text("SELECT 1")), 8)
        except Exception:  # noqa: BLE001 — 接続できなければ、準備中のまま
            state = "starting"
    return {"state": state}


app.include_router(data_router)
app.include_router(ai_router)
app.include_router(assets_router)
app.include_router(pack_router)
app.include_router(bq_router)
app.include_router(policies_router)
app.include_router(metrics_router)
app.include_router(approvals_router)
app.include_router(me_router)
app.include_router(production_router)
app.include_router(ads_router)
app.include_router(impact_router)
if hosted_router is not None:
    app.include_router(hosted_router)

if STATIC_DIR.is_dir():
    # 画面。API より後に登録して、/api が先に処理されるようにする
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="web")
