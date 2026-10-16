"""/api/data/{テーブル} — 画面(src/data の表ごとのサービス)から呼ばれる、データの読み書き。

テーブル名と項目名は、PostgreSQL と同じ名前(delivery_cards、scheduled_at など)。
受け付けるのは、schema.json にあるテーブルと列だけ。値はすべて、パラメータとして渡す(SQL に直接埋め込まない)。
"""
from __future__ import annotations

from typing import Any
from urllib.parse import unquote

import aiohttp

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncConnection

from . import dbctl, schema as sc
from .db import get_engine, reset_engine



async def require_db() -> None:
    """DB が止まっていれば、起動を依頼して「準備中」と返す。使える間は、最後のアクセスの時刻を残す"""
    if dbctl.enabled():
        c = dbctl.controller()
        await c.ensure_running()
        await c.touch()


_schema_ready = False
_schema_lock = asyncio.Lock()


async def _ensure_schema(conn: AsyncConnection) -> None:
    """プロセスで最初に接続できたとき、schema.json の列・テーブルを DB に反映する(足りない列を足すだけ。何度実行してもよい)。
    列を足したときに、手で migrate を実行しなくても、反映(デプロイ)だけで使えるようにするため"""
    global _schema_ready
    if _schema_ready:
        return
    async with _schema_lock:
        if _schema_ready:
            return
        try:
            async with conn.begin():
                for stmt in sc.load().ddl():
                    await conn.execute(text(stmt))
        except SQLAlchemyError as e:  # 反映できなくても、既存の列の読み書きは続ける(次のプロセスで、また試す)
            print(f"[schema] 列の反映に失敗しました: {e}")
        _schema_ready = True


# 最後に DB につなげなかった理由(本番以外の環境で、画面とサーバーのログに出す)
last_db_error: str | None = None
log = logging.getLogger("ccp.db")


@asynccontextmanager
async def db(write: bool = False) -> AsyncIterator[AsyncConnection]:
    """DB に接続する(write=True なら、トランザクションつき)。起動の途中などで接続できないときは、500 ではなく「準備中」として扱う。
    本番以外(DB の自動起動を使わない環境)では、つながらない理由を残して、画面に「つながりません」と出す(register_errors)"""
    global last_db_error
    try:
        conn = (await get_engine()).connect()
        await conn.start()
    except (SQLAlchemyError, OSError, aiohttp.ClientError, asyncio.TimeoutError, KeyError) as e:
        last_db_error = f"{type(e).__name__}: {e}" if not isinstance(e, KeyError) else f"設定がありません: {e}(DATABASE_URL、または CLOUD_SQL_INSTANCE など)"
        log.warning("DB につながりません: %s", last_db_error)
        await reset_engine()
        raise dbctl.DbNotReady("starting") from e
    last_db_error = None
    try:
        await _ensure_schema(conn)
        if write:
            async with conn.begin():
                yield conn
        else:
            yield conn
    finally:
        await conn.close()


router = APIRouter(prefix="/api/data", dependencies=[Depends(require_db)])
SCHEMA = sc.load()


def ok(data: Any) -> dict[str, Any]:
    return {"success": True, "data": data}


def fail(status: int, message: str, code: str | None = None) -> JSONResponse:
    err: dict[str, Any] = {"message": message}
    if code:
        err["code"] = code
    return JSONResponse({"success": False, "error": err}, status_code=status)


def _columns_sql(t: sc.Table, names: list[str] | None) -> str:
    if not names:
        cols = ["id"] + [c.pg for c in t.all_columns] + [lk.pg for lk in t.lookups]
    else:
        cols = ["id"] + [t.resolve(n.strip())[0] for n in names if n.strip() != "id"]
    return ", ".join(dict.fromkeys(cols))


@router.get("/{table}")
async def list_rows(
    table: str,
    filter: str | None = None,
    orderBy: str | None = None,
    select: str | None = None,
    top: int | None = Query(None, ge=1, le=5000),
    skip: int = Query(0, ge=0),
):
    t = SCHEMA.table(table)
    where, params = sc.parse_filter(t, filter)
    order = sc.parse_order(t, [orderBy] if orderBy else None) or "created_on ASC, id ASC"
    sql = f"SELECT {_columns_sql(t, select.split(',') if select else None)} FROM {t.pg}"
    if where:
        sql += f" WHERE {where}"
    sql += f" ORDER BY {order}"
    if top:
        sql += " LIMIT :_top"
        params["_top"] = top
    if skip:
        sql += " OFFSET :_skip"
        params["_skip"] = skip
    async with db() as conn:
        rows = (await conn.execute(text(sql), params)).mappings().all()
    return ok([t.to_api(dict(r)) for r in rows])


@router.get("/{table}/{row_id}")
async def get_row(table: str, row_id: str):
    t = SCHEMA.table(table)
    rid = sc.coerce("uuid", row_id)
    async with db() as conn:
        row = (await conn.execute(text(f"SELECT {_columns_sql(t, None)} FROM {t.pg} WHERE id = :id"), {"id": rid})).mappings().first()
    if row is None:
        return fail(404, "レコードが見つかりません")
    return ok(t.to_api(dict(row)))


@router.post("/{table}")
async def create_row(table: str, request: Request):
    t = SCHEMA.table(table)
    values = t.to_db(await _body(request))
    cols = list(values)
    returning = _columns_sql(t, None)
    if cols:
        sql = f"INSERT INTO {t.pg} ({', '.join(cols)}) VALUES ({', '.join(':' + c for c in cols)}) RETURNING {returning}"
    else:
        sql = f"INSERT INTO {t.pg} DEFAULT VALUES RETURNING {returning}"
    async with db(write=True) as conn:
        row = (await conn.execute(text(sql), values)).mappings().one()
    return ok(t.to_api(dict(row)))


# 変更の記録(アラートの「MD 方針の変更」「日程の変更」のため。バックログ A1)。
# 配信日時・商品の方針が書き換わったら、変更前と変更後を change_logs に残す。どこから書き換えても漏れないよう、サーバーの側で記録する。
# テーブル → (種類, 見張る列, 一緒に残す列)
WATCHED: dict[str, tuple[str, list[str], str]] = {
    "delivery_cards": ("date", ["scheduled_at"], "name"),
    "product_policies": ("policy", ["stage", "promo_period", "policy"], "product_code"),
}


def _text(v: Any) -> str:
    s = sc.serialize(v)
    return "" if s is None else str(s)


async def _log_changes(conn: AsyncConnection, t: sc.Table, row_id: Any, before: dict[str, Any], after: dict[str, Any], actor: str) -> None:
    kind, cols, extra = WATCHED[t.name]
    for col in cols:
        if col not in after or _text(before.get(col)) == _text(after.get(col)):
            continue
        is_card = t.name == "delivery_cards"
        await conn.execute(
            text(
                "INSERT INTO change_logs (kind, field, before_value, after_value, product_code, card_name, actor, delivery_card_id) "
                "VALUES (:kind, :field, :before, :after, :code, :card_name, :actor, :card_id)"
            ),
            {
                "kind": kind,
                "field": col,
                "before": _text(before.get(col)),
                "after": _text(after.get(col)),
                "code": None if is_card else after.get(extra) or before.get(extra),
                "card_name": (after.get(extra) or before.get(extra)) if is_card else None,
                "actor": actor or None,
                "card_id": row_id if is_card else None,
            },
        )


@router.patch("/{table}/{row_id}")
async def update_row(table: str, row_id: str, request: Request):
    t = SCHEMA.table(table)
    values = t.to_db(await _body(request))
    sets = [f"{c} = :{c}" for c in values] + ["modified_on = now()"]
    sql = f"UPDATE {t.pg} SET {', '.join(sets)} WHERE id = :_id RETURNING {_columns_sql(t, None)}"
    rid = sc.coerce("uuid", row_id)
    watched = WATCHED.get(t.name)
    async with db(write=True) as conn:
        before = None
        if watched and any(c in values for c in watched[1]):
            cols = ", ".join([*watched[1], watched[2]])
            before = (await conn.execute(text(f"SELECT {cols} FROM {t.pg} WHERE id = :_id FOR UPDATE"), {"_id": rid})).mappings().first()
        row = (await conn.execute(text(sql), {**values, "_id": rid})).mappings().first()
        if row is not None and before is not None:
            # 書き換えた人(画面で入れた名前。ログインで人を見分けないため、画面が x-ccp-actor で送る)
            actor = unquote(request.headers.get("x-ccp-actor", ""))[:100]
            await _log_changes(conn, t, rid, dict(before), {**dict(before), **{k: v for k, v in values.items()}}, actor)
    if row is None:
        return fail(404, "レコードが見つかりません")
    return ok(t.to_api(dict(row)))


@router.delete("/{table}/{row_id}")
async def delete_row(table: str, row_id: str):
    t = SCHEMA.table(table)
    async with db(write=True) as conn:
        await conn.execute(text(f"DELETE FROM {t.pg} WHERE id = :id"), {"id": sc.coerce("uuid", row_id)})
    return ok(None)


async def _body(request: Request) -> dict[str, Any]:
    try:
        body = await request.json()
    except ValueError as e:  # 壊れた JSON・UTF-8 ではない文字(UnicodeDecodeError も ValueError の仲間)
        raise sc.BadRequest("本文が正しい JSON(UTF-8)ではありません") from e
    if not isinstance(body, dict):
        raise sc.BadRequest("本文は、オブジェクトで指定してください")
    return body


def register_errors(app: FastAPI) -> None:
    @app.exception_handler(dbctl.DbNotReady)
    async def _starting(_: Request, e: dbctl.DbNotReady):
        # DB の自動起動を使わない環境(Workbench など)では、待っても起動しないので、つながらない理由を返す
        if not dbctl.enabled():
            return fail(503, f"データベースにつながりません: {last_db_error or '理由は不明'}", "db_unreachable")
        return fail(503, "データベースを起動しています(10 分ほどかかることがあります)", "db_starting")

    @app.exception_handler(sc.BadRequest)
    async def _bad(_: Request, e: sc.BadRequest):
        return fail(400, str(e))

    @app.exception_handler(IntegrityError)
    async def _integrity(_: Request, e: IntegrityError):
        return fail(409, "データの整合性エラー(参照先がない・必須項目が空など)")

    @app.exception_handler(DBAPIError)
    async def _db(_: Request, e: DBAPIError):
        return fail(503, "データベースに接続できません", "db_unavailable")

    @app.exception_handler(OSError)
    async def _os(_: Request, e: OSError):
        return fail(503, "データベースに接続できません", "db_unavailable")
