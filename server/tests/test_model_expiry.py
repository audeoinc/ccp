"""見本の画像にモデルの使用期限を入れる(server/ccp/model_expiry.py。X77)。DB には接続しない。

  cd server && python -m unittest discover tests
"""
from __future__ import annotations

import asyncio
import sys
import unittest
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ccp import model_expiry as me  # noqa: E402


class _Result:
    def __init__(self, rows):
        self.rows = rows

    def mappings(self):
        return self

    def all(self):
        return self.rows


class _Conn:
    def __init__(self, rows):
        self.rows = rows
        self.sql = ""

    async def execute(self, sql, params=None):
        self.sql = str(sql)
        return _Result(self.rows)


def _row(code: str, day: int, card: str) -> dict:
    return {"card_name": card, "scheduled_at": datetime(2026, 11, day, 1, 0, tzinfo=timezone.utc), "country": "JP",
            "product_id": f"id-{code}", "product_code": code, "product_name": code, "image_id": f"img-{code}"}


class PlanTest(unittest.TestCase):
    def test_picks_different_products_with_the_day_before_their_first_delivery(self) -> None:
        conn = _Conn([_row("A", 3, "c1"), _row("B", 3, "c1"), _row("A", 5, "c2"), _row("C", 7, "c3"), _row("D", 9, "c4")])
        got = asyncio.run(me.plan(conn, 3))
        self.assertEqual([(r["product_code"], r["until"], r["card_name"]) for r in got],
                         [("A", date(2026, 11, 2), "c1"), ("B", date(2026, 11, 2), "c1"), ("C", date(2026, 11, 6), "c3")])
        # これからの配信・取りやめていない・メイン画像のまま・まだ期限のない見本のメイン、だけを見る
        for part in ("c.scheduled_at >= now()", "c.cancelled_at IS NULL", "i.source = 'sample'", "i.model_usable_until IS NULL"):
            self.assertIn(part, conn.sql)


if __name__ == "__main__":
    unittest.main()
