"""人の設定(ペインの幅・フロートの大きさ・言語・表示の大きさなど)を、ユーザーごとに保存する(バックログ ST6)。

これまでは、ブラウザ(localStorage)にだけ覚えていた。ログインしている人(identity.py)がいれば、ここに写して、
別の PC・ブラウザで開いても同じ設定で始まるようにする。ログインがなければ、これまでどおりブラウザだけ(人 = ブラウザ)。

  GET /api/prefs   ログインしている人の設定 {user_id, prefs: {名前: 値}}。ログインなし・未登録なら user_id は null で prefs は空
  PUT /api/prefs   {set: {名前: 値 | null}}  値を置き換える(null は消す)。ログインなしなら 403

だれの設定かは、画面が送る値ではなく、サーバーがログインから決める(ほかの人の設定を読んだり書いたりできないように)。
値は、画面の localStorage の文字をそのまま持つ(中身はサーバーでは読まない)。
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from .data_api import Fail, db, fail, ok, require_db
from .identity import resolve_user

router = APIRouter(prefix="/api/prefs", dependencies=[Depends(require_db)])

# 1 回に送れる数と大きさ(設定ではない大きなもの・壊れた画面からの大量の書き込みで、表がふくらまないように)
MAX_KEYS = 200
MAX_NAME = 200
MAX_VALUE = 20_000


async def _user_id(conn: AsyncConnection, request: Request) -> str | None:
    _, user = await resolve_user(conn, request)
    return user["id"] if user else None


def check_changes(body: Any) -> tuple[dict[str, str | None] | None, str | None]:
    """PUT の中身を確かめる。よければ (変更, None)、だめなら (None, 理由)"""
    changes = body.get("set") if isinstance(body, dict) else None
    if not isinstance(changes, dict):
        return None, "set がありません"
    if len(changes) > MAX_KEYS:
        return None, f"一度に送れるのは {MAX_KEYS} 個までです"
    out: dict[str, str | None] = {}
    for name, value in changes.items():
        if not isinstance(name, str) or not name or len(name) > MAX_NAME:
            return None, "設定の名前が正しくありません"
        if value is not None and (not isinstance(value, str) or len(value) > MAX_VALUE):
            return None, f"{name} の値が正しくないか、大きすぎます"
        out[name] = value
    return out, None


@router.get("")
async def get_prefs(request: Request):
    async with db() as conn:
        uid = await _user_id(conn, request)
        if uid is None:
            return ok({"user_id": None, "prefs": {}})
        rows = (await conn.execute(text("SELECT name, value FROM user_prefs WHERE user_id = :u ORDER BY modified_on"), {"u": uid})).mappings().all()
    # 同じ名前の行が重なっていたら(同時に書いたときなど)、新しいほうを使う
    return ok({"user_id": uid, "prefs": {r["name"]: r["value"] for r in rows if r["value"] is not None}})


@router.put("")
async def put_prefs(request: Request):
    changes, err = check_changes(await request.json())
    if changes is None:
        return fail(400, err or "")
    async with db(write=True) as conn:
        uid = await _user_id(conn, request)
        if uid is None:
            raise Fail(403, "ログインしていないので、設定はこのブラウザにだけ覚えます", "not_signed_in")
        for name, value in changes.items():
            # 表に一意の制約を持たない(schema.json の仕組みにない)ので、消してから入れる(1 つのトランザクションの中)
            await conn.execute(text("DELETE FROM user_prefs WHERE user_id = :u AND name = :n"), {"u": uid, "n": name})
            if value is not None:
                await conn.execute(text("INSERT INTO user_prefs (user_id, name, value) VALUES (:u, :n, :v)"), {"u": uid, "n": name, "v": value})
    return ok({"saved": len(changes)})
