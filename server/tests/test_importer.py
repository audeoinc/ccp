"""importer.py の、画像に依存しない部分(コード・選択肢・デモ用の数値)の単体テスト。"""
from __future__ import annotations

import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ccp import importer as im  # noqa: E402


class ImporterTest(unittest.TestCase):
    def test_codes(self) -> None:
        self.assertEqual(im.code_for("products/jp", 0), "P01")
        self.assertEqual(im.code_for("products/us", 11), "U12")
        self.assertEqual(im.code_for("heroes/jp", 2), "H03")
        self.assertEqual(im.code_for("heroes/us", 19), "UH20")

    def test_enums_come_from_generated_models(self) -> None:
        e = im.load_enums()
        self.assertEqual(e["category"]["アウター"], 588230000)
        self.assertEqual(e["market"], {"JP": 588230000, "US": 588230001})
        self.assertIn("特集", e["purpose"])
        self.assertEqual(set(e["trend"]), {"上昇", "横ばい", "下降"})

    def test_prices_follow_the_house_style(self) -> None:
        rng = random.Random(1)
        for _ in range(50):
            jp = im.make_price(rng, "アウター", False)
            self.assertEqual(jp % 1000, 800)  # 9800 など
            self.assertTrue(19800 - 1000 <= jp <= 39800 + 1000)
            us = im.make_price(rng, "トップス", True)
            self.assertEqual(us % 2, 0)

    def test_weekly_stock_decreases_by_units_and_ends_at_current_stock(self) -> None:
        rows = im.weekly_rows(random.Random("x"), "P01", "アウター", 9800, 120, "上昇")
        self.assertEqual(len(rows), len(im.WEEKS))
        self.assertEqual(rows[-1]["cr854_stock"], 120)
        for a, b in zip(rows, rows[1:]):
            self.assertEqual(a["cr854_stock"] - b["cr854_units"], b["cr854_stock"])
        self.assertEqual(rows[0]["cr854_revenue"], rows[0]["cr854_units"] * 9800)

    def test_rising_trend_sells_more_at_the_end_than_the_start(self) -> None:
        up = im.weekly_rows(random.Random("a"), "P02", "トップス", 5800, 100, "上昇")
        down = im.weekly_rows(random.Random("a"), "P03", "トップス", 5800, 100, "下降")
        self.assertGreater(up[-1]["cr854_units"], up[0]["cr854_units"])
        self.assertLess(down[-1]["cr854_units"], down[0]["cr854_units"])


if __name__ == "__main__":
    unittest.main()
