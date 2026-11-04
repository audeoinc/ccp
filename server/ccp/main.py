"""CCP(Campaign Contents Planner)の GCP 版サーバー。

1 つのプロセスで、画面(ビルド済みの dist-gcp)・データ API・AI(次の段階)を配信する。
入口の認証は、差し込み口 ccp/identity.py が設定で選ぶ(ログイン(OIDC)・画面のパスワード(Basic)・手前の IAP・なし)。
"""
from __future__ import annotations

import os
from pathlib import Path

import asyncio
import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from . import dbready
from .ai import router as ai_router
from .approvals import router as approvals_router
from .appsettings import router as appsettings_router
from .health import router as health_router
from .assets import router as assets_router
from .bq_import import router as bq_router
from . import devimages, devtools
from .help import router as help_router
from . import identity
from .identity import router as me_router
from .oidc import router as oidc_router
from .prefs import router as prefs_router
from .production import router as production_router
from .ads import router as ads_router
from .creative import router as creative_router
from .heroes import router as heroes_router
from .parts import router as parts_router
from .linkpreview import router as linkpreview_router
from .product_pages import router as product_pages_router
from .impact import router as impact_router
from .policies import router as policies_router
from .metrics import router as metrics_router
from .stock_cover import router as stock_cover_router
from .pack import router as pack_router
from .product_images import router as product_images_router
from sqlalchemy import text

from .data_api import db, register_errors, router as data_router
from . import optional

# 環境ごとの追加の API(ccp/hosted/)。そのフォルダがない環境では、登録しない(あるのに読めなければ、理由をログに)
hosted_router = optional.hosted("routes", "router")

logging.basicConfig(level=logging.INFO)  # DB の状態の記録などを、サーバーのログに出す

STATIC_DIR = Path(os.getenv("STATIC_DIR") or Path(__file__).resolve().parents[2] / "dist-gcp")

app = FastAPI(title="CCP", docs_url=None, redoc_url=None)
register_errors(app)


_bg: set[asyncio.Task] = set()


@app.on_event("startup")
async def start_bq_scheduler() -> None:
    """BigQuery の定期の取り込み(bq_import.run_scheduler)を、裏で回し始める。
    BigQuery の設定がない・自動が切・BQ_AUTO_SYNC=0 なら、回っても何もしない(DB にも BigQuery にも触らない)"""
    from . import schema as sc
    from .bq_import import run_scheduler

    from .health import at_startup

    # 重ねるファイルが壊れたまま動かすと、足した列への保存があとで分かりにくく失敗する。ここで理由と次にやることを出して止める
    try:
        sc.load()
    except sc.SchemaOverlayError as e:
        print(f"[schema] {e}", flush=True)
        raise

    # 設定の健康診断も、起動を待たせずに裏で(足りない設定をログに出し、管理する人の ⚙ に赤い点)
    for job in (run_scheduler(), at_startup()):
        task = asyncio.create_task(job)
        _bg.add(task)  # 参照を持っておかないと、途中で片づけられることがある
        task.add_done_callback(_bg.discard)


@app.on_event("shutdown")
async def stop_bq_scheduler() -> None:
    for task in list(_bg):
        task.cancel()


@app.middleware("http")
async def entry_auth(request: Request, call_next):
    # 開発用の画面(/dev/)と API は、CCP_DEVTOOLS=1 のときだけ見せる(ccp/devtools/)
    if devtools.blocks(request.url.path):
        return PlainTextResponse("Not Found", status_code=404)
    # 入口の認証(死活確認・内部の呼び出しは対象外。どの道を通すかは identity.admit が決める)
    if (denied := identity.admit(request)) is not None:
        return denied
    # 開発用の画面は、ログインしていれば開発者だけ(X103)
    path = request.url.path
    if devtools.is_dev_path(path) and (why := await identity.developer_denied(request)):
        if path.startswith("/api/"):
            return JSONResponse({"ok": False, "error": why}, status_code=403)
        return PlainTextResponse(why, status_code=403)
    response = await call_next(request)
    identity.after(request, response)
    return response


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
app.include_router(product_images_router)
app.include_router(bq_router)
# 設定の状態は /api/settings/health。/api/settings/{まとめ} より先に置く(health をまとめの名前と読ませない)
app.include_router(health_router)
app.include_router(appsettings_router)
app.include_router(policies_router)
app.include_router(metrics_router)
app.include_router(stock_cover_router)
app.include_router(approvals_router)
app.include_router(me_router)
app.include_router(oidc_router)
app.include_router(help_router)
app.include_router(prefs_router)
app.include_router(production_router)
app.include_router(ads_router)
app.include_router(creative_router)
app.include_router(heroes_router)
app.include_router(parts_router)
app.include_router(linkpreview_router)
app.include_router(product_pages_router)
app.include_router(impact_router)
app.include_router(devtools.router)
app.include_router(devimages.router)
if hosted_router is not None:
    app.include_router(hosted_router)

if STATIC_DIR.is_dir():
    # 画面。API より後に登録して、/api が先に処理されるようにする
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="web")
