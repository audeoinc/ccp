"""開発用の画面から、CCP の DB(PostgreSQL)を読む(X104。`dev.tools.pg`。docs/DEVTOOLS.md の 11 章)。

  GET  /api/dev/pg/status   使えるか(使えなければ、なぜか 1 行)
  GET  /api/dev/pg/tables   表と列の一覧(server/schema.json から。DB には聞かない)
  POST /api/dev/pg/run      {sql, max_rows}  読むだけの取引の中で、1 つの文を流す

DB は動いているアプリのデータそのものなので、BigQuery より守りを固くする:
  - 使えるのは、ログインした開発者(users.is_developer)だけ。ログインがない置き先では使えない(だれが流したかを残せないため)。
    /api/dev/ 全体の開発者の判定(main.py)とは別に、ここでも確かめる(ログインがないと、全体の判定は通してしまうため)
  - 読むだけ: SET TRANSACTION READ ONLY の中で流し、最後は必ず取り消す(ROLLBACK)。文の頭を見て止めるのは補い。
    複数の文は、PostgreSQL が断る(準備した文には 1 つの文しか入らない)
  - 1 回の時間(statement_timeout。既定 15 秒・DEVTOOLS_PG_TIMEOUT_S)と、返す行数(200 行まで)に上限
  - 読むだけの DB のユーザーを別に持つなら、CCP_DB_READONLY_URL(書き方は DATABASE_URL と同じ)。なければ、アプリと同じつなぎ先
  - AI(Gemini)には、表と列の形(schema.json)だけを渡す。AI の道具は CCP の DB に向けない(ai_sql.py)
"""
from __future__ import annotations

import os
import re
import time
from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field
from .common import plain
from .store import record_run

router = APIRouter()

MAX_ROWS = 200
# 頭に来てよい言葉(読むだけの取引が本当の守り。ここは、うっかりを早く知らせるため)
READ_HEADS = ("select", "with", "table", "values", "explain", "show")
_ro_engine: Any = None


def timeout_s() -> float:
    try:
        return max(1.0, min(float(os.getenv("DEVTOOLS_PG_TIMEOUT_S") or 15), 120.0))
    except ValueError:
        return 15.0


async def who(request: Request) -> tuple[str | None, str]:
    """流してよい人のメールアドレスと、だめな理由(よければ理由は空)"""
    from ..identity import current_identity, developer_denied

    ident = await current_identity(request)
    if ident is None:
        return None, "CCP の DB は、ログインした開発者だけが使えます(この置き先にはログインがありません。ログインの設定は docs/WORKBENCH.md の 7.2)"
    if why := await developer_denied(request):
        return None, why
    return ident.email, ""


def catalog() -> list[dict[str, Any]]:
    """表と列(schema.json)。選択肢があれば、使える値も"""
    from .. import schema as sc

    out = []
    for name, t in sorted(sc.load().tables.items()):
        cols = [{"name": "id", "type": "uuid"}]
        cols += [{"name": c.pg, "type": c.type, **({"choices": list(c.choices)} if c.choices else {})} for c in t.all_columns]
        cols += [{"name": lk.pg, "type": f"uuid → {lk.ref}"} for lk in t.lookups]
        out.append({"name": name, "columns": cols})
    return out


def head_word(sql: str) -> str:
    """文の頭の言葉(コメント・括弧を飛ばす)"""
    s = re.sub(r"--[^\n]*|/\*.*?\*/", " ", sql, flags=re.S).lstrip(" \t\r\n(")
    m = re.match(r"[A-Za-z]+", s)
    return m.group(0).lower() if m else ""


async def _connect():  # noqa: ANN202
    """読むだけのつなぎ先(CCP_DB_READONLY_URL があればそれ、なければアプリと同じ)"""
    global _ro_engine
    url = os.getenv("CCP_DB_READONLY_URL", "").strip()
    if url:
        if _ro_engine is None:
            from sqlalchemy.ext.asyncio import create_async_engine

            _ro_engine = create_async_engine(url, pool_size=2, max_overflow=0, pool_pre_ping=True)
        return _ro_engine.connect()
    from ..db import get_engine

    return (await get_engine()).connect()


@router.get("/pg/status")
async def status(request: Request) -> dict[str, Any]:
    email, why = await who(request)
    return {"ok": True, "available": email is not None, "reason": why, "readonly_role": bool(os.getenv("CCP_DB_READONLY_URL", "").strip()), "timeout_s": timeout_s(), "max_rows": MAX_ROWS}


@router.get("/pg/tables")
async def tables(request: Request) -> dict[str, Any]:
    email, why = await who(request)
    if email is None:
        return {"ok": False, "error": why}
    return {"ok": True, "tables": catalog()}


class PgSqlIn(BaseModel):
    sql: str = Field(min_length=1, max_length=200_000)
    max_rows: int = Field(MAX_ROWS, ge=1, le=MAX_ROWS)


async def run_readonly(sql: str, max_rows: int) -> dict[str, Any]:
    """読むだけの取引の中で流し、最後は取り消す。返すのは先頭 max_rows 行と、もっとあるか"""
    t0 = time.monotonic()
    conn = await _connect()
    try:
        await conn.start()
        tx = await conn.begin()
        try:
            await conn.exec_driver_sql("SET TRANSACTION READ ONLY")
            # 単位は ms。SET LOCAL は、この取引の中だけ
            await conn.exec_driver_sql(f"SET LOCAL statement_timeout = {int(timeout_s() * 1000)}")
            # 文はそのままドライバに渡す(text() は '10:30' の :30 を引数と読むため)。準備した文になるので、複数の文は PostgreSQL が断る
            res = await conn.exec_driver_sql(sql.strip().rstrip(";"))
            columns = [{"name": k, "type": ""} for k in res.keys()] if res.returns_rows else []
            got = res.fetchmany(max_rows + 1) if res.returns_rows else []
        finally:
            await tx.rollback()
    finally:
        await conn.close()
    rows = [plain(dict(r._mapping)) for r in got[:max_rows]]
    return {"ok": True, "columns": columns, "rows": rows, "more": len(got) > max_rows, "seconds": round(time.monotonic() - t0, 2)}


@router.post("/pg/run")
async def run(body: PgSqlIn, request: Request) -> dict[str, Any]:
    email, why = await who(request)
    if email is None:
        return {"ok": False, "error": why}
    head = head_word(body.sql)
    if head not in READ_HEADS:
        err = f"CCP の DB には、読む文(SELECT・WITH など)だけを流せます(この文の頭は「{head or '?'}」)"
        record_run("画面", body.sql, error=err, target="pg", actor=email)
        return {"ok": False, "error": err}
    try:
        out = await run_readonly(body.sql, body.max_rows)
    except Exception as e:  # noqa: BLE001 — 文の誤り・時間切れ・読むだけの取引での書き込みは、すべて理由を返す
        msg = str(getattr(e, "orig", None) or e).strip().splitlines()[0][:2000]
        if "statement timeout" in msg or "canceling statement" in msg:
            msg = f"{timeout_s():g} 秒で止めました(時間の上限)。条件で絞ってください。({msg})"
        record_run("画面", body.sql, error=msg, target="pg", actor=email)
        return {"ok": False, "error": msg}
    record_run("画面", body.sql, rows=len(out["rows"]), seconds=out["seconds"], target="pg", actor=email)
    return out
