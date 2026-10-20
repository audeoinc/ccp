"""商品の販売順位(product_rankings)のダミーを作る(python -m ccp.cli ranking-dummy)。

本物は、BigQuery の出力 ranking(BIGQUERY_EXPORT.md の 9 章)から取り込む。それまでのあいだ、結果の画面の
「販売チャネルごとの順位」を確かめられるよう、DB にある商品と配信から、それらしい順位を作る。

- 本物の順位は全商品の中の順位なので、DB の商品の中で順位を付けず、400 点ほどの中の順位に見えるように作る。
- 配信に載せた週は、配信経由の順位が上がる(配信の効き方の違いが、画面で見えるように)。
- 同じ商品・同じ週なら、何度作っても同じ数字(乱数の種は、商品コードと週)。
- ダミーの行は as_of を空にする。BigQuery から取り込んだ行(as_of あり)が 1 行でもあれば、何もしない(本物を上書きしないため)。
画面のサンプルデータ(src/mock/seed.ts の productRankings)と同じ考え方。
"""
from __future__ import annotations

import random
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import text

from .db import get_engine

WEEKS = 20
CHANNELS = (("all", 3000), ("ec", 1800), ("delivery", 500))


def _monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _units(rank: int, scale: int) -> int:
    return max(0, round(scale / rank ** 0.85))


def build(products: list[dict[str, Any]], placed: set[tuple[str, date]], weeks: list[date]) -> list[dict[str, Any]]:
    """products: market・product_code の行。placed: 配信に載せた (商品コード, 週)"""
    rows: list[dict[str, Any]] = []
    for p in products:
        code = p["product_code"]
        base = 1 + int(400 * random.Random(f"rank:{code}").random() ** 1.6)
        for w in weeks:
            r = random.Random(f"rank:{code}:{w.isoformat()}")
            all_ = max(1, round(base * (0.6 + r.random())))
            ec = max(1, round(all_ * (0.7 + 0.7 * r.random())))
            via = max(1, round(all_ * ((0.15 + 0.3 * r.random()) if (code, w) in placed else (1 + 1.5 * r.random()))))
            for (channel, scale), rank in zip(CHANNELS, (all_, ec, via)):
                rows.append({"market": p["market"], "product_code": code, "week_start": w, "channel": channel, "rank": rank, "units": _units(rank, scale)})
    return rows


async def run(yes: bool) -> None:
    engine = await get_engine()
    async with engine.connect() as conn:
        real = (await conn.execute(text("SELECT COUNT(*) FROM product_rankings WHERE as_of IS NOT NULL"))).scalar_one()
        if real:
            print(f"BigQuery から取り込んだ順位が {real} 行あります。ダミーは作りません")
            return
        products = [dict(r) for r in (await conn.execute(text(
            "SELECT DISTINCT market, product_code FROM products WHERE product_code IS NOT NULL AND product_code <> ''"
        ))).mappings().all()]
        sent = (await conn.execute(text("""
            SELECT p.product_code, c.scheduled_at
            FROM delivery_products AS d
            JOIN delivery_cards AS c ON c.id = d.delivery_card_id
            JOIN products AS p ON p.id = d.product_id
            WHERE c.scheduled_at IS NOT NULL AND (d.state IS NULL OR d.state = 'selected')
        """))).mappings().all()
    placed = {(r["product_code"], _monday(r["scheduled_at"].date())) for r in sent}
    this_week = _monday(datetime.now(timezone.utc).date())
    weeks = [this_week - timedelta(weeks=n) for n in range(WEEKS - 1, -1, -1)]
    rows = build(products, placed, weeks)
    print(f"商品 {len(products)} 点 × {len(weeks)} 週({weeks[0]}〜{weeks[-1]})× 3 チャネル = {len(rows)} 行")
    if not yes:
        print("--yes を付けると、いまのダミーの行(as_of が空)を消して、作り直します")
        return
    async with engine.begin() as conn:
        await conn.execute(text("DELETE FROM product_rankings WHERE as_of IS NULL"))
        if rows:
            await conn.execute(text("""
                INSERT INTO product_rankings (market, product_code, week_start, channel, rank, units)
                VALUES (:market, :product_code, :week_start, :channel, :rank, :units)
            """), rows)
    print("作りました")
