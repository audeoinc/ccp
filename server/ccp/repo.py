"""DB の行の読み書きの小道具(schema.json の表の定義で、値を確かめてから書く)。

これまで承認(approvals)・制作(production)・汎用の窓口(data_api)・CLI・パック・効果(impact)が、
それぞれ同じような INSERT / UPDATE / SELECT を組み立てていた(制作が承認の非公開の関数を読み込み、承認も制作を読み込む、
両方向の依存もあった)。ここに 1 つにまとめる(2026-10-25 の整理 第 2 段)。値はすべてパラメータで渡し、SQL に埋め込まない。
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from . import schema as sc


def now() -> datetime:
    return datetime.now(timezone.utc)


def columns_sql(t: sc.Table, names: list[str] | None = None) -> str:
    """返す列(names がなければ、すべて。id は必ず先頭に)"""
    if not names:
        cols = ["id"] + [c.pg for c in t.all_columns] + [lk.pg for lk in t.lookups]
    else:
        cols = ["id"] + [t.resolve(n.strip())[0] for n in names if n.strip() != "id"]
    return ", ".join(dict.fromkeys(cols))


def insert_sql(t: sc.Table, cols: list[str], tail: str = "") -> str:
    """INSERT の文(列がなければ DEFAULT VALUES)。tail は ON CONFLICT … や RETURNING …"""
    if not cols:
        return f"INSERT INTO {t.pg} DEFAULT VALUES{tail}"
    return f"INSERT INTO {t.pg} ({', '.join(cols)}) VALUES ({', '.join(':' + c for c in cols)}){tail}"


def import_values(t: sc.Table, rec: dict[str, Any]) -> dict[str, Any]:
    """取り込み(seed・パック)の 1 行。id と、作った日時・変えた日時も元のまま残す
    (作った日時は、確定後の変更・承認の履歴の並びに使うため)"""
    values = t.to_db(rec)
    values["id"] = sc.coerce("uuid", rec["id"])
    for col in ("created_on", "modified_on"):
        if rec.get(col):
            values[col] = sc.coerce("timestamptz", rec[col])
    return values


async def insert(conn: AsyncConnection, table: str, record: dict[str, Any]) -> dict[str, Any]:
    """1 行を足して、足した行(画面の形)を返す"""
    t = sc.load().table(table)
    values = t.to_db(record)
    row = (await conn.execute(text(insert_sql(t, list(values), f" RETURNING {columns_sql(t)}")), values)).mappings().one()
    return t.to_api(dict(row))


async def insert_many(conn: AsyncConnection, table: str, records: list[dict[str, Any]]) -> None:
    """何行かをまとめて足す(列はそろっていること。返す行はない)"""
    if not records:
        return
    t = sc.load().table(table)
    values = [t.to_db(r) for r in records]
    await conn.execute(text(insert_sql(t, list(values[0]))), values)


async def update(conn: AsyncConnection, table: str, row_id: str, record: dict[str, Any]) -> dict[str, Any] | None:
    """1 行を直して、直した行を返す(なければ None)。変えた日時は、いまにする"""
    t = sc.load().table(table)
    values = t.to_db(record)
    sets = [f"{c} = :{c}" for c in values] + ["modified_on = now()"]
    sql = f"UPDATE {t.pg} SET {', '.join(sets)} WHERE id = :_id RETURNING {columns_sql(t)}"
    row = (await conn.execute(text(sql), {**values, "_id": sc.coerce("uuid", row_id)})).mappings().first()
    return t.to_api(dict(row)) if row else None


async def select(conn: AsyncConnection, table: str, where: str, params: dict[str, Any], order: str = "created_on") -> list[dict[str, Any]]:
    """条件に合う行(where はコードに書いた条件だけ。値は params で渡す)"""
    t = sc.load().table(table)
    rows = (await conn.execute(text(f"SELECT {columns_sql(t)} FROM {t.pg} WHERE {where} ORDER BY {order}"), params)).mappings().all()
    return [t.to_api(dict(r)) for r in rows]


async def one(conn: AsyncConnection, table: str, row_id: str, lock: bool = False) -> dict[str, Any] | None:
    """id の 1 行(なければ None)。lock なら、このトランザクションの間ほかから書かせない(FOR UPDATE)"""
    t = sc.load().table(table)
    sql = f"SELECT {columns_sql(t)} FROM {t.pg} WHERE id = :id" + (" FOR UPDATE" if lock else "")
    row = (await conn.execute(text(sql), {"id": sc.coerce("uuid", row_id)})).mappings().first()
    return t.to_api(dict(row)) if row else None
