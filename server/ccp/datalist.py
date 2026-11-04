"""/api/datalist — 取り込んだデータの一覧(settings.datalist。X105)。だれでも読むだけ。画面は src/ImportedDataList.tsx。

データの入口の 6 つの出力が写す先の表を、1 つの窓口で読む。列は schema.json から作る(出力ごとに作り込まない)。
行数の多い出力(週の数字など)があるので、検索もページ送りもサーバーで行う(画面で全部を読んでから絞らない)。
検索は、画面の fuzzySearch.ts と同じならし方(かな・カナ、全角・半角、大文字・小文字、区切りの記号)で、語の順は問わない。
打ち間違いまでは許さない(SQL の絞り込みで行うため)。

見本の印: seed.json の商品コードと照らす(DB に列を足さない)。SKU などは、その商品が見本なら印を付ける。source = 'sample' は ⚙ で作った見本の SKU。
見本を消すのは管理する人だけ(/seed。cli remove-seed と同じ seeddata の処理)。一覧からは消せない。
"""
from __future__ import annotations

import logging
import unicodedata
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text

from . import schema as sc, seeddata
from .bq_import import DEST, SAMPLE, _actor_name, _admin, _denied
from .data_api import db, require_db

log = logging.getLogger("ccp.datalist")

router = APIRouter(prefix="/api/datalist", dependencies=[Depends(require_db)])

MAX_LIMIT = 5000
# 一覧に出さない列(レビューの全文は長く、1 行が重くなるだけで、何が入っているかの確認には要らない)
HIDDEN = {"review_texts"}
# 商品は、確かめたい列を先に(ほかの出力は schema.json の順のまま)
FIRST = {"spu": ["product_code", "name", "market", "page_url"]}
ORDER = {
    "spu": "product_code, market",
    "sku": "product_code, sku_code, market",
    "sku_stock": "sku_code, market",
    "weekly": "product_code, week_start DESC, market",
    "forecast": "market, date",
    "ranking": "week_start DESC, channel, rank, market",
}
# 見本かどうかの式。:codes は seed.json の商品コード
SAMPLE_SQL = {
    "spu": "product_code = ANY(:codes)",
    "sku": f"(product_code = ANY(:codes) OR source = '{SAMPLE}')",
    "sku_stock": f"(source = '{SAMPLE}' OR sku_code IN (SELECT sku_code FROM sku WHERE product_code = ANY(:codes)))",
    "weekly": "product_code = ANY(:codes)",
    "forecast": "FALSE",
    "ranking": "product_code = ANY(:codes)",
}
SEARCHED_TYPES = ("text", "choice", "date")

# 比べる前に外す記号(fuzzySearch.ts の SKIP と同じ)。SQL の translate で消せるよう、全角も並べる
_SKIP = " \t\r\n　/／・-－_.．()（）「」『』:：、,，。!?！？▾→"
_KATA = "".join(chr(c) for c in range(0x30a1, 0x30f7))
_HIRA = "".join(chr(c - 0x60) for c in range(0x30a1, 0x30f7))
_FULL = "０１２３４５６７８９ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ"
_HALF = "0123456789abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz"
# translate は、対になる文字のない文字を消す(_SKIP は、そのために後ろに置く)
_FROM = _KATA + _FULL + _SKIP
_TO = _HIRA + _HALF


def terms_of(q: str | None) -> list[str]:
    """検索の語を、SQL の側と同じ形にならす(空白で区切った語は、すべて含むもの)"""
    out = []
    for word in (q or "").split():
        s = unicodedata.normalize("NFKC", word).lower()
        s = "".join(chr(ord(c) - 0x60) if 0x30a1 <= ord(c) <= 0x30f6 else c for c in s if c not in _SKIP)
        if s:
            out.append(s)
    return out[:10]


def columns_of(name: str) -> list[sc.Column]:
    cols = [c for c in sc.load().table(DEST[name]).columns if c.pg not in HIDDEN]
    first = FIRST.get(name, [])
    return sorted(cols, key=lambda c: first.index(c.pg) if c.pg in first else len(first))


def where_of(name: str, terms: list[str]) -> tuple[str, dict[str, Any]]:
    """検索の WHERE と値。列をつないだ 1 つの文の中に、語がすべてあるか"""
    if not terms:
        return "", {}
    cols = [f'"{c.pg}"::text' for c in columns_of(name) if c.type in SEARCHED_TYPES]
    # chr(1) は、列の境目で語がつながって当たらないように挟む
    hay = f"translate(lower(concat_ws(chr(1), {', '.join(cols)})), :from_, :to_)"
    params: dict[str, Any] = {"from_": _FROM, "to_": _TO}
    parts = []
    for i, term in enumerate(terms):
        params[f"t{i}"] = term
        parts.append(f"position(:t{i} IN {hay}) > 0")
    return "WHERE " + " AND ".join(parts), params


def _sample_params(name: str) -> dict[str, Any]:
    return {"codes": sorted(seeddata.product_codes())} if ":codes" in SAMPLE_SQL[name] else {}


async def read_rows(conn: Any, name: str, q: str | None, offset: int, limit: int) -> dict[str, Any]:
    table = DEST[name]
    cols = columns_of(name)
    sample = SAMPLE_SQL[name]
    where, params = where_of(name, terms_of(q))
    by_market = (await conn.execute(
        text(f"SELECT market, count(*) AS n, count(*) FILTER (WHERE {sample}) AS s FROM {table} GROUP BY market ORDER BY market"),
        _sample_params(name),
    )).mappings().all()
    total = sum(r["n"] for r in by_market)
    matched = total
    if where:
        matched = (await conn.execute(text(f"SELECT count(*) FROM {table} {where}"), params)).scalar_one()
    select = ", ".join(f'"{c.pg}"' for c in cols)
    # 同じ値の行の順が読むたびに変わると、ページ送りで行が抜ける・重なるので、最後に id で固定する
    rows = (await conn.execute(
        text(f"SELECT id, {select}, ({sample}) AS _sample FROM {table} {where} ORDER BY {ORDER[name]}, id LIMIT :limit OFFSET :offset"),
        {**params, **_sample_params(name), "limit": limit, "offset": offset},
    )).mappings().all()
    return {
        "columns": [{"name": c.pg, "type": c.type} for c in cols],
        "rows": [{k: sc.serialize(v) for k, v in r.items()} for r in rows],
        "total": total,
        "matched": matched,
        "sample": sum(r["s"] for r in by_market),
        "byMarket": [{"market": r["market"] or "", "rows": r["n"]} for r in by_market],
    }


# 見本を消す窓口は、{name} より先に置く(seed という出力として読まれないように)
@router.get("/seed")
async def seed_status(request: Request) -> dict[str, Any]:
    """入っている見本の行の数と、見本を使っている見本でない行(管理する人だけ)"""
    if (why := await _admin(request)):
        return _denied(why)
    async with db() as conn:
        return {"success": True, "data": await seeddata.survey(conn)}


@router.post("/seed/remove")
async def seed_remove(request: Request) -> dict[str, Any]:
    if (why := await _admin(request)):
        return _denied(why)
    actor = _actor_name(request) or None
    async with db(write=True) as conn:
        got = await seeddata.survey(conn)
        if got["used"]:
            return {"success": False, "error": {"message": "見本でない行が見本を使っているので、消しませんでした", "code": "in_use"}, "data": got}
        if got["found"]:
            await seeddata.remove(conn, got["found"])
            message = "見本のデータを消しました: " + "・".join(f"{t} {n} 件" for t, n in got["found"].items())
            # 消した記録は、商品(SPU)の取り込みの記録にまぜて出す(bq_import.history)
            await conn.execute(
                text("INSERT INTO bq_imports (source, status, message, imported_at, trigger, actor, repeat_count) VALUES (:source, 'removed', :message, now(), 'manual', :actor, 1)"),
                {"source": SAMPLE, "message": message, "actor": actor},
            )
            log.info("%s(%s)", message, actor or "名前なし")
    return {"success": True, "data": got}


@router.get("/{name}")
async def list_rows(name: str, q: str | None = None, offset: int = 0, limit: int = 100) -> dict[str, Any]:
    if name not in DEST:
        return {"success": False, "error": {"message": f"知らない出力です: {name}"}}
    async with db() as conn:
        data = await read_rows(conn, name, q, max(0, offset), max(1, min(limit, MAX_LIMIT)))
    return {"success": True, "data": data}
