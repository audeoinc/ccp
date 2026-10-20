"""外部広告の出稿の記録(表 ad_spends。X49)。

  POST /api/ads/sample   見本のデータを作り直す(いまの商品から、過去 150 日ぶんの日ごとの出稿を作る。表の中身は置き換わる)

本物のデータは、あとで BigQuery(または CSV)から取り込む。いまは、商品を軸に見る画面(見せ方「商品」)を触って確かめるための見本。
見本の作り方は、撮影用の画面(src/mock/ads.ts)と同じ: 商品ごとに決まった乱数で、出稿する商品・媒体・期間を決める。
"""
from __future__ import annotations

import random
import zlib
from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import text

from . import schema as sc
from .data_api import db, ok, require_db

router = APIRouter(prefix="/api/ads", dependencies=[Depends(require_db)])

# 媒体ごとの、クリック率・クリック単価(US はドル、JP は円)・購入率
MEDIA = {
    "google_shopping": (0.012, 0.55, 60, 0.025),
    "google_search": (0.035, 1.10, 110, 0.030),
    "meta": (0.009, 0.70, 75, 0.012),
    "tiktok": (0.006, 0.45, 50, 0.008),
}


def generate_rows(products: list[dict[str, Any]], today: date, days: int = 150) -> list[dict[str, Any]]:
    """商品ごとに、出稿する媒体と期間(7〜21 日の出稿と、休み)を決め、日ごとの記録を作る。同じ入力なら、いつも同じ結果"""
    rows: list[dict[str, Any]] = []
    start = today - timedelta(days=days)
    for p in products:
        code = str(p.get("product_code") or "")
        market = p.get("market") or "JP"
        if not code:
            continue
        rng = random.Random(zlib.crc32(f"{market}:{code}".encode()))
        # 4 割ほどの商品だけを出稿する(出稿していない商品も、画面で見分けられるように)
        if rng.random() > 0.4:
            continue
        price = float(p.get("price") or (80 if market == "US" else 9000))
        media = rng.sample(list(MEDIA), rng.randint(1, 3))
        for m in media:
            ctr, cpc_us, cpc_jp, cvr = MEDIA[m]
            cpc = cpc_us if market == "US" else cpc_jp
            d = start + timedelta(days=rng.randint(0, 20))
            while d <= today:
                run = rng.randint(7, 21)
                for i in range(run):
                    day = d + timedelta(days=i)
                    if day > today:
                        break
                    imps = int(rng.uniform(800, 6000))
                    clicks = max(0, int(imps * ctr * rng.uniform(0.6, 1.4)))
                    conv = sum(1 for _ in range(clicks) if rng.random() < cvr)
                    rows.append({
                        "date": day.isoformat(),
                        "market": market,
                        "product_code": code,
                        "media": m,
                        "campaign": f"{m}-{code}-{d.isoformat()}",
                        "impressions": imps,
                        "clicks": clicks,
                        "spend": round(clicks * cpc * rng.uniform(0.8, 1.2), 2),
                        "conversions": conv,
                        "revenue": round(conv * price, 2),
                    })
                d = d + timedelta(days=run + rng.randint(5, 30))
    return rows


@router.post("/sample")
async def sample() -> dict[str, Any]:
    t = sc.load().table("ad_spends")
    async with db() as conn:
        products = [dict(r) for r in (await conn.execute(text("SELECT product_code, market, price FROM products"))).mappings().all()]
        rows = generate_rows(products, date.today())
        await conn.execute(text(f"DELETE FROM {t.pg}"))
        if rows:
            values = [t.to_db(r) for r in rows]
            cols = list(values[0])
            await conn.execute(text(f"INSERT INTO {t.pg} ({', '.join(cols)}) VALUES ({', '.join(':' + c for c in cols)})"), values)
        await conn.commit()
    return ok({"rows": len(rows)})
