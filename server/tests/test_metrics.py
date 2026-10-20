"""metrics.py(商品・カテゴリの週の指標の CSV の読み分け)の単体テスト。DB には接続しない。

  cd server && python -m unittest discover tests
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ccp.metrics import parse  # noqa: E402

PRODUCT_CSV = """﻿week_start,market,product_code,metric,value,rank,rank_of,wow,mom,yoy
2026-10-12,JP,P01,ec_sales,"1,234,000",12,240,0.05,-2%,0.18
2026-10-12,JP,P01,sku_stockout_rate,0.12,,,0.02,-0.01,
2026-10-13,JP,P01,ec_sales,100,,,,,
2026-10-12,jp,P02,page_views,100,,,,,
2026-10-12,JP,P01,ec_sales,999,,,,,
"""


class ParseTest(unittest.TestCase):
    def test_product(self) -> None:
        p = parse(PRODUCT_CSV)
        self.assertEqual(p.kind, "product")
        self.assertEqual(p.table, "product_metrics")
        self.assertEqual(len(p.rows), 2)
        sales = p.rows[0]
        self.assertEqual(sales["value"], 1234000)
        self.assertEqual(sales["rank"], 12)
        self.assertEqual(sales["rank_of"], 240)
        self.assertAlmostEqual(sales["mom"], -0.02)  # % は 100 で割る
        self.assertIsNone(p.rows[1]["rank"])
        self.assertIsNone(p.rows[1]["yoy"])
        messages = " ".join(x.message for x in p.problems)
        self.assertIn("月曜", messages)  # 2026-10-13 は火曜
        self.assertIn("metric は", messages)  # 知らない項目
        self.assertIn("重なっています", messages)

    def test_category(self) -> None:
        p = parse("week_start,market,category,metric,value,rank,rank_of\n2026-10-12,US,tops,ec_sessions,52000,3,7\n2026-10-12,US,tops,spu_stock,1,,\n")
        self.assertEqual(p.kind, "category")
        self.assertEqual([r["category"] for r in p.rows], ["tops"])
        self.assertEqual(len(p.problems), 1)  # カテゴリには在庫の項目がない

    def test_no_key_column(self) -> None:
        p = parse("week_start,market,metric,value\n2026-10-12,JP,ec_sales,1\n")
        self.assertEqual(p.rows, [])
        self.assertEqual(p.problems[0].line, 1)


if __name__ == "__main__":
    unittest.main()
