"""在庫の持ち(いまの在庫で何週分売れるか)の材料を、商品コードの一覧から 1 回でまとめて返す(読むだけ)。

  GET /api/stock-cover?codes=U01,U02   → {"U01": {"last4": 115, "stock": 180}, ...}

商品のフロートの入れ替えの行(いまの商品・候補)に出す。行ごとに週の実績を読むと、並べた数だけ問い合わせが増えたので(2026-10-26)、
1 つの SQL で、商品ごとに直近 4 週の販売数の合計と、いちばん新しい週の在庫だけを集計する。
在庫の持ちの計算(在庫 ÷ 直近 4 週の平均)は、画面の 1 か所(src/useProductData.ts の coverOf)で行う(詳しい情報の「在庫の持ち」と同じ数にするため)。
週の実績がない商品は、返さない。
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import text

from .data_api import db, require_db
from .schema import BadRequest

router = APIRouter(prefix="/api", dependencies=[Depends(require_db)])

# 一度に頼める商品の数(絞り込みの in と同じ上限)
MAX_CODES = 500

# 週の並びは、詳しい情報の読み方(week_start の新しい順)と同じにする
SQL = """
SELECT product_code,
       SUM(COALESCE(units, 0)) AS last4,
       MAX(CASE WHEN rn = 1 THEN stock END) AS stock
FROM (
  SELECT product_code, units, stock,
         ROW_NUMBER() OVER (PARTITION BY product_code ORDER BY week_start DESC) AS rn
  FROM weekly_performances
  WHERE product_code = ANY(:codes)
) w
WHERE rn <= 4
GROUP BY product_code
"""


def parse_codes(raw: str) -> list[str]:
    """「U01,U02」を、空を除いた重複のない並びにする。多すぎるときは止める"""
    codes = list(dict.fromkeys(c.strip() for c in raw.split(",") if c.strip()))
    if len(codes) > MAX_CODES:
        raise BadRequest(f"一度に頼める商品は {MAX_CODES} 件までです")
    return codes


def shape(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """集計の行を、商品コードごとの {last4, stock} にする"""
    return {str(r["product_code"]): {"last4": int(r["last4"] or 0), "stock": None if r["stock"] is None else int(r["stock"])} for r in rows}


@router.get("/stock-cover")
async def stock_cover(codes: str = "") -> dict[str, Any]:
    wanted = parse_codes(codes)
    if not wanted:
        return {"success": True, "data": {}}
    async with db() as conn:
        rows = [dict(r) for r in (await conn.execute(text(SQL), {"codes": wanted})).mappings().all()]
    return {"success": True, "data": shape(rows)}
