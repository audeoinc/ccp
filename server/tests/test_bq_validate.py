"""bq_validate.py(BigQuery の出力の、値の確かめ)の単体テスト。BigQuery には接続しない。

  cd server && python -m unittest discover tests
"""
from __future__ import annotations

import sys
import unittest
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ccp.bq_validate import NG, WARN, has_ng, validate  # noqa: E402

NOW = datetime(2026, 10, 17, 3, 0, tzinfo=timezone.utc)
AS_OF = datetime(2026, 10, 16, 15, 0, tzinfo=timezone.utc)


def spu(code: str = "P01", **kw: object) -> dict[str, object]:
    return {"market": "JP", "product_code": code, "name": "コート", "category": "outer", "season": "autumn_winter", "sales_trend": "up", "as_of": AS_OF, **kw}


def sku(code: str = "P01-BL-M", product: str = "P01", **kw: object) -> dict[str, object]:
    return {"market": "JP", "sku_code": code, "product_code": product, "as_of": AS_OF, **kw}


def messages(issues: list, level: str) -> str:
    return "\n".join(i.message for i in issues if i.level == level)


class SpuTest(unittest.TestCase):
    def test_clean_rows_pass(self) -> None:
        self.assertEqual(validate("spu", [spu("P01"), spu("P02")], now=NOW), [])

    def test_duplicate_key_and_empty_required_are_ng(self) -> None:
        issues = validate("spu", [spu("P01"), spu("P01"), spu("P03", name=None)], now=NOW)
        self.assertTrue(has_ng(issues))
        self.assertIn("重なっている", messages(issues, NG))
        self.assertIn("name が空", messages(issues, NG))

    def test_market_and_range(self) -> None:
        issues = validate("spu", [spu("P01", market="jpn"), spu("P02", cvr_4w=1.5, rating=0)], now=NOW)
        ng = messages(issues, NG)
        self.assertIn("大文字の 2 文字", ng)
        self.assertIn("cvr_4w", ng)
        self.assertIn("rating", ng)

    def test_unknown_category_is_only_a_warning(self) -> None:
        issues = validate("spu", [spu("P01", category="Knitwear")], now=NOW)
        self.assertFalse(has_ng(issues))
        self.assertIn("category", messages(issues, WARN))

    def test_stale_as_of_warns(self) -> None:
        issues = validate("spu", [spu("P01", as_of=datetime(2026, 9, 1, tzinfo=timezone.utc))], now=NOW)
        self.assertIn("古いまま", messages(issues, WARN))


class LinkTest(unittest.TestCase):
    def test_sku_must_belong_to_spu(self) -> None:
        issues = validate("sku", [sku("A", "P01"), sku("B", "P99")], {"spu": [spu("P01"), spu("P02")]}, now=NOW)
        self.assertIn("SPU の出力にありません", messages(issues, NG))
        self.assertIn("SKU が 1 つもない SPU", messages(issues, WARN))

    def test_stock_must_belong_to_sku(self) -> None:
        stock = [{"market": "JP", "sku_code": "A", "stock": 3, "as_of": NOW}, {"market": "JP", "sku_code": "Z", "stock": -1, "as_of": NOW}]
        issues = validate("sku_stock", stock, {"sku": [sku("A"), sku("B")]}, now=NOW)
        ng = messages(issues, NG)
        self.assertIn("SKU の出力にありません", ng)
        self.assertIn("stock が範囲", ng)
        self.assertIn("在庫の行がない SKU", messages(issues, WARN))


class WeeklyForecastTest(unittest.TestCase):
    def test_week_start_must_be_monday(self) -> None:
        rows = [{"market": "JP", "product_code": "P01", "week_start": date(2026, 10, 6), "units": 1, "revenue": 1, "as_of": AS_OF},
                {"market": "JP", "product_code": "P01", "week_start": date(2026, 10, 7), "units": 1, "revenue": 1, "as_of": AS_OF}]
        issues = validate("weekly", rows, now=NOW)
        self.assertIn("月曜ではありません", messages(issues, NG))
        self.assertIn("12 週に満たない", messages(issues, WARN))

    def test_weekly_unknown_product_is_ng(self) -> None:
        rows = [{"market": "JP", "product_code": "P99", "week_start": date(2026, 10, 5), "units": 1, "revenue": 1, "as_of": AS_OF}]
        self.assertIn("SPU の出力にありません", messages(validate("weekly", rows, {"spu": [spu("P01")]}, now=NOW), NG))

    def test_forecast_values(self) -> None:
        rows = [{"market": "US", "date": date(2026, 10, 18), "weather": "storm", "precip_prob": 120, "temp_max": 10, "temp_min": 12, "issued_at": NOW}]
        ng = messages(validate("forecast", rows, now=NOW), NG)
        self.assertIn("weather", ng)
        self.assertIn("precip_prob", ng)
        self.assertIn("temp_min", ng)

    def test_empty_output_is_ng(self) -> None:
        self.assertTrue(has_ng(validate("forecast", [], now=NOW)))


if __name__ == "__main__":
    unittest.main()
