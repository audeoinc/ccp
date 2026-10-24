"""配信の効果の見本(表 ai_runs・delivery_lifts。結果の面の「効果」)。

  POST /api/impact/sample   見本を作り直す(送った配信ごとに、AI の依頼の記録と、ホールドアウトとの比べを作る)。
                            消すのは見本の行(sample = 1)だけ。画面から記録した本物の AI の依頼は消さない

本来は、配信の仕組みで「送らない群(ホールドアウト)」を作り、顧客ごとの購買をデータ基盤で集計して、delivery_lifts に取り込む。
いまは、画面の見え方を確かめるための見本。作り方は、撮影用の画面(src/impact.ts の sampleImpact)と同じ考え方:
  - 送った配信ごとに、AI の依頼を 4 回したことにする。学びは 7 割の配信で渡す(渡せる学び = 同じ国・チャネルの、それより前の配信のメモ。新しい順に 8 件まで。
    そのうち、それぞれ 7 割の確率で選んで渡す)
  - 案の扱いは、そのまま 45% / 人が直した 40% / 使わなかった 15%
  - 1 割をホールドアウトにし、送った群の売上が何割多いかを、学びの「効き目」(学びごとに決まった隠れた値)と、人が直したかで少し変える
"""
from __future__ import annotations

import json
import random
import zlib
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import text

from . import repo, schema as sc
from .data_api import db, ok, require_db

router = APIRouter(prefix="/api/impact", dependencies=[Depends(require_db)])

SAMPLE_TASKS = ["suggest_theme", "suggest_copy", "select_products", "select_hero"]


def _rng(seed: str) -> random.Random:
    return random.Random(zlib.crc32(seed.encode()))


def learning_quality(learning_id: str) -> float:
    """学びの効き目(見本の中だけの値)。効く学び・効かない学び・逆効果の学びが混ざるように"""
    return _rng(f"learning:{learning_id}").random() * 0.14 - 0.05


def generate(cards: list[dict[str, Any]], results: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """見本の行(ai_runs, delivery_lifts)を作る。同じ入力なら、いつも同じ結果"""
    by_card = {str(c["id"]): c for c in cards}

    def sent_at(r: dict[str, Any]) -> str:
        v = r.get("sent_at") or (by_card.get(str(r.get("delivery_card_id"))) or {}).get("scheduled_at") or ""
        return v.isoformat() if hasattr(v, "isoformat") else str(v)

    noted = [r for r in results if (r.get("notes") or "").strip() and str(r.get("delivery_card_id")) in by_card]
    runs: list[dict[str, Any]] = []
    lifts: list[dict[str, Any]] = []
    seen: set[str] = set()
    for r in results:
        cid = str(r.get("delivery_card_id"))
        card = by_card.get(cid)
        if not card or card.get("cancelled_at") or not r.get("recipients") or cid in seen:
            continue
        seen.add(cid)
        # AB テストの配信は、案ごとの行を足し合わせる(案の行があれば、配信全体の行は数えない。二重に数えないため)
        rows = [x for x in results if str(x.get("delivery_card_id")) == cid]
        if any(x.get("variant") for x in rows):
            rows = [x for x in rows if x.get("variant")]
        recipients = sum(int(x.get("recipients") or 0) for x in rows)
        revenue = sum(float(x.get("revenue") or 0) for x in rows)
        orders = sum(int(x.get("orders") or 0) for x in rows)
        rng = _rng(f"impact:{cid}")
        at = sent_at(r)
        candidates = sorted(
            (
                n for n in noted
                if str(n["delivery_card_id"]) != cid
                and by_card[str(n["delivery_card_id"])].get("country") == card.get("country")
                and by_card[str(n["delivery_card_id"])].get("channel") == card.get("channel")
                and sent_at(n) < at
            ),
            key=sent_at,
            reverse=True,
        )[:8]
        passed = bool(candidates) and rng.random() < 0.7
        # 渡せる学びのうち、それぞれ 7 割の確率で選ぶ(学びごとの効き目を切り分けられるように、いつも同じ組み合わせにはしない)
        picked = [n for n in candidates if rng.random() < 0.7] or candidates[:1]
        ids = [str(n["id"]) for n in picked] if passed else []
        edited = 0
        for task in SAMPLE_TASKS:
            x = rng.random()
            adoption = "as_is" if x < 0.45 else "edited" if x < 0.85 else "rejected"
            edited += adoption == "edited"
            runs.append({"delivery_card_id": cid, "task": task, "learning_ids": json.dumps(ids), "adoption": adoption, "sample": 1})
        # 学びの効き目は足し合わせる(効く学びが多いほど、増分が増える。逆効果の学びは減らす)
        quality = sum(learning_quality(i) for i in ids)
        share = min(0.6, max(0.01, 0.1 + (quality if passed else 0) + (0.02 if edited >= 2 else 0) + (rng.random() - 0.5) * 0.08))
        # 送った群の売上は、配信を通った売上の 2.5〜3.5 倍(店舗・EC・配信を通らない分も数えるため)
        treated_revenue = revenue * (2.5 + rng.random())
        holdout_users = round(recipients * 0.1 / 0.9)
        holdout_rpu = treated_revenue / recipients * (1 - share)
        treated_orders = round(orders * (2.5 + rng.random()))
        lifts.append({
            "delivery_card_id": cid,
            "holdout_rate": 0.1,
            "window_days": 7,
            "treated_users": recipients,
            "holdout_users": holdout_users,
            "treated_orders": treated_orders,
            "holdout_orders": round(treated_orders / recipients * holdout_users * (1 - share)),
            "treated_revenue": round(treated_revenue, 2),
            "holdout_revenue": round(holdout_rpu * holdout_users, 2),
            "sample": 1,
        })
    return runs, lifts


@router.post("/sample")
async def sample() -> dict[str, Any]:
    s = sc.load()
    runs_t, lifts_t = s.table("ai_runs"), s.table("delivery_lifts")
    async with db(write=True) as conn:
        cards = [dict(r) for r in (await conn.execute(text(f"SELECT id, country, channel, scheduled_at, cancelled_at FROM {s.table('delivery_cards').pg}"))).mappings().all()]
        results = [dict(r) for r in (await conn.execute(text(f"SELECT id, delivery_card_id, sent_at, recipients, orders, revenue, notes, variant FROM {s.table('delivery_results').pg} ORDER BY sent_at"))).mappings().all()]
        runs, lifts = generate(cards, results)
        # 見本の行だけを消す(画面から記録した本物の行は残す)
        await conn.execute(text(f"DELETE FROM {runs_t.pg} WHERE sample = 1"))
        await conn.execute(text(f"DELETE FROM {lifts_t.pg} WHERE sample = 1"))
        await repo.insert_many(conn, "ai_runs", runs)
        await repo.insert_many(conn, "delivery_lifts", lifts)
    return ok({"runs": len(runs), "lifts": len(lifts)})
