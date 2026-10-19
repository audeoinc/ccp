"""開発元の本番だけの API。Cloud Scheduler が定期的に呼ぶ、DB の自動停止の確認(dbctl)。"""
from __future__ import annotations

import asyncio
import os

from fastapi import APIRouter, HTTPException, Request

from . import dbctl

router = APIRouter()


@router.post("/internal/idle-check")
async def idle_check(request: Request):
    """Cloud Scheduler が定期的に呼ぶ。最後のアクセスから一定時間たっていたら、DB を停止する"""
    if not dbctl.enabled():
        return {"action": "none", "note": "DB の自動制御は無効です"}
    await _verify_scheduler(request)
    return await dbctl.controller().idle_check(float(os.getenv("DB_IDLE_MINUTES", "30")))


async def _verify_scheduler(request: Request) -> None:
    """Cloud Scheduler の署名つき(OIDC)トークンだけを受け付ける"""
    from google.auth.transport import requests as greq
    from google.oauth2 import id_token

    header = request.headers.get("authorization", "")
    if not header.startswith("Bearer "):
        raise HTTPException(401, "token required")
    try:
        claims = await asyncio.to_thread(id_token.verify_oauth2_token, header[7:], greq.Request(), os.environ["IDLE_CHECK_AUDIENCE"])
    except Exception as e:  # noqa: BLE001 — 署名・有効期限・宛先の不一致は、すべて拒否
        raise HTTPException(401, "invalid token") from e
    if claims.get("email") != os.environ["IDLE_CHECK_SA_EMAIL"] or not claims.get("email_verified"):
        raise HTTPException(403, "forbidden")
