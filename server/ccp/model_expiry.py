"""見本の画像に、写っているモデル(人物)の使用期限を入れる(X77 の確かめ用)。

  python -m ccp.cli sample-model-expiry [--count 3]           # 入れる案を出すだけ(何も変えない)
  python -m ccp.cli sample-model-expiry [--count 3] --yes     # 案のとおりに入れる

これからの配信(取りやめていないもの)に載っている商品のうち、配信でメイン画像のまま使っていて、
見本の写真(product_images の source = sample)のメインがあるものから、配信日の早い順に、違う商品を count 件選ぶ。
期限は「その商品が最初に載る配信の、前の日」。配信カードに「モデルの使用期限」のアラートが出る(画面の imageExpiryAlerts)。
すでに期限の入っている画像は、選ばない(何度流しても、同じ画像を書き換えない)。消すときは、その行の model_usable_until を空に戻す
"""
from __future__ import annotations

from datetime import timedelta
from typing import Any

from sqlalchemy import text

from . import schema as sc
from .db import get_engine


async def plan(conn: Any, count: int) -> list[dict[str, Any]]:
    s = sc.load()
    dp, dc, pr = s.table("delivery_products").pg, s.table("delivery_cards").pg, s.table("products").pg
    rows = (await conn.execute(text(f"""
        SELECT c.name AS card_name, c.scheduled_at, c.country, p.id AS product_id, p.product_code, p.name AS product_name, i.id AS image_id
        FROM {dp} d
        JOIN {dc} c ON c.id = d.delivery_card_id
        JOIN {pr} p ON p.id = d.product_id
        JOIN product_images i ON i.product_id = p.id AND i.is_main = 1 AND i.source = 'sample' AND i.model_usable_until IS NULL
        WHERE c.scheduled_at >= now() AND c.cancelled_at IS NULL
          AND COALESCE(d.state, '') <> 'candidate' AND d.variant IS NULL AND COALESCE(d.image_url, '') = ''
        ORDER BY c.scheduled_at, p.product_code
    """))).mappings().all()
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for r in rows:
        if r["product_id"] in seen:
            continue
        seen.add(r["product_id"])
        out.append({**dict(r), "until": (r["scheduled_at"] - timedelta(days=1)).date()})
        if len(out) >= count:
            break
    return out


async def run(count: int, yes: bool) -> None:
    async with (await get_engine()).begin() as conn:
        picked = await plan(conn, count)
        if not picked:
            print("入れる画像がありません(これからの配信に、見本の写真のメインを使っている商品がない。または、もう期限が入っている)")
            return
        print("モデルの使用期限を入れる案(商品のメインの見本の写真に、最初に載る配信の前の日):")
        for r in picked:
            print(f"  {r['product_code']} {r['product_name']} → {r['until']}(配信「{r['card_name']}」{r['scheduled_at']:%Y-%m-%d %H:%M} {r['country'] or ''})")
        if not yes:
            print("\nまだ何も変えていません。入れるときは --yes を付けて流してください")
            return
        for r in picked:
            await conn.execute(text("UPDATE product_images SET model_usable_until = :u, modified_on = now() WHERE id = :id"), {"u": r["until"], "id": r["image_id"]})
        print(f"\n{len(picked)} 枚に入れました。画面を開き直すと、配信カードにアラートが出ます")
