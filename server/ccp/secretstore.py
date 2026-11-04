"""⚙ →「秘密の設定」(settings.setup)。パスワード・鍵を、書くだけの欄で入れる。

- **値は返さない。** 入っているか・どこから来ているかだけを返す(画面にも API にも、ログにも出さない)。
- 書く先は、初期設定の画面と同じ server/ccp.env(envfile)。起動し直さずに効く。
- 環境から渡された値(Secrets など)は、そちらが勝つので、画面では変えられない。
- サーバーが 2 台以上・起動のたびにファイルが消える置き方では、ここで書いた値はそのサーバーにしか残らないので、
  Secrets で渡す(画面にも書いてある)。
"""
from __future__ import annotations

import logging
import os
from typing import Any

from fastapi import APIRouter, Request

from . import envfile, health

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/settings/secrets")

# 起動し直さずに効く(依頼のたび・呼ぶたびに環境変数を読む)ものだけを置く
MIN_LENGTH = {"APP_PASSWORD": 8, "OIDC_CLIENT_SECRET": 1, "AI_OUTLET_TOKEN": 1}


def _view() -> dict[str, Any]:
    items = [{"name": k, "set": bool(os.getenv(k, "").strip()), "locked": envfile.from_env(k)} for k in MIN_LENGTH]
    return {"items": items, "file": str(envfile.path())}


def _refused(name: str) -> str | None:
    if name not in MIN_LENGTH:
        return "この名前は、ここでは変えられません"
    if envfile.from_env(name):
        return "環境から渡された値(Secrets など)なので、画面では変えられません。渡している所で変えてください"
    return None


def _store(name: str, value: str | None) -> dict[str, Any]:
    try:
        envfile.write({name: value})
    except OSError as e:
        return {"success": False, "error": {"message": f"{envfile.path()} に書けません({type(e).__name__})。サーバーを動かすユーザーの書く権限を確認するか、Secrets で渡してください", "code": "not_writable"}}
    # 値は残さない。何をしたかだけ
    log.info("秘密の設定 %s を%s", name, "書きました" if value is not None else "消しました")
    health.forget_summary()
    return {"success": True, "data": _view()}


@router.get("")
async def get_secrets(request: Request) -> dict[str, Any]:
    if bad := await health.denied(request):
        return bad
    return {"success": True, "data": _view()}


@router.put("/{name}")
async def put_secret(name: str, body: dict[str, Any], request: Request) -> dict[str, Any]:
    if bad := await health.denied(request):
        return bad
    if why := _refused(name):
        return {"success": False, "error": {"message": why, "code": "refused"}}
    value = str(body.get("value") or "").strip()
    if len(value) < MIN_LENGTH[name]:
        return {"success": False, "error": {"message": f"{MIN_LENGTH[name]} 文字以上にしてください", "code": "too_short"}}
    return _store(name, value)


@router.delete("/{name}")
async def delete_secret(name: str, request: Request) -> dict[str, Any]:
    if bad := await health.denied(request):
        return bad
    if why := _refused(name):
        return {"success": False, "error": {"message": why, "code": "refused"}}
    return _store(name, None)
