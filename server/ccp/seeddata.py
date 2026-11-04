"""見本のデータ(server/seed.json)。`python -m ccp.cli seed` で入り、`remove-seed` で消す。

見本は、人が明示したときだけ入れる(起動・DB が空のときに自動では入れない)。
見本の商品が入ったままだと、データの入口(BigQuery)の商品と合わず、取り込みが止まる(bq_import.spu_mismatch)。
そのとき「見本が入っているため」と消し方を出せるよう、見本の商品コードと行の ID を、ここで引けるようにする。
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from sqlalchemy import text

from . import schema as sc

SEED_PATH = Path(__file__).resolve().parent.parent / "seed.json"
REMOVE_HINT = "cd server && .venv/bin/python -m ccp.cli remove-seed(数えるだけ)→ 中身を確かめて --yes"


@lru_cache(maxsize=1)
def load() -> dict[str, list[dict[str, Any]]]:
    """表の名前 → 見本の行。ファイルがなければ空(見本を持たない配り方でも動くように)"""
    try:
        return json.loads(SEED_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}


def product_codes() -> set[str]:
    return {str(r["product_code"]) for r in load().get("products", []) if r.get("product_code")}


def _ids(t: sc.Table) -> list:
    return [sc.coerce("uuid", r["id"]) for r in load().get(t.name, [])]


async def survey(conn: Any) -> dict[str, Any]:
    """入っている見本の行の数(found: 表 → 件数)と、見本を使っている見本でない行(used)。何も変えない。
    見本でない行が見本を参照していれば、消さない(参照の消し方しだいで、本物の行も消えるか、途中で止まるため)"""
    schema = sc.load()
    order = schema.creation_order()
    found: dict[str, int] = {}
    for t in order:
        ids = _ids(t)
        if ids:
            n = (await conn.execute(text(f"SELECT count(*) FROM {t.pg} WHERE id = ANY(:ids)"), {"ids": ids})).scalar_one()
            if n:
                found[t.name] = n
    used = []
    for t in order:
        for lk in t.lookups:
            if lk.ref not in found:
                continue
            n = (await conn.execute(
                text(f"SELECT count(*) FROM {t.pg} WHERE {lk.pg} = ANY(:ref) AND NOT (id = ANY(:own))"),
                {"ref": _ids(schema.tables[lk.ref]), "own": _ids(t)},
            )).scalar_one()
            if n:
                used.append({"table": t.pg, "column": lk.pg, "ref": schema.tables[lk.ref].pg, "count": n})
    return {"found": found, "used": used}


async def remove(conn: Any, found: dict[str, int]) -> None:
    """見本の行を、参照する側から消す(survey で used がないことを確かめてから呼ぶ)"""
    for t in reversed(sc.load().creation_order()):
        if t.name in found:
            await conn.execute(text(f"DELETE FROM {t.pg} WHERE id = ANY(:ids)"), {"ids": _ids(t)})
