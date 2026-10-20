"""外部広告の見本(server/ccp/ads.py の generate_rows。X49)"""
import unittest
from datetime import date

from ccp.ads import MEDIA, generate_rows

PRODUCTS = [{"product_code": str(400000 + i), "market": "US" if i % 2 else "JP", "price": 100} for i in range(60)]


class GenerateRowsTest(unittest.TestCase):
    def test_same_input_same_rows(self):
        a = generate_rows(PRODUCTS, date(2026, 10, 20))
        b = generate_rows(PRODUCTS, date(2026, 10, 20))
        self.assertEqual(a, b)

    def test_rows_are_in_range_and_valid(self):
        today = date(2026, 10, 20)
        rows = generate_rows(PRODUCTS, today, days=150)
        self.assertGreater(len(rows), 0)
        codes = {r["product_code"] for r in rows}
        # 出稿するのは一部の商品だけ
        self.assertLess(len(codes), len(PRODUCTS))
        for r in rows:
            self.assertIn(r["media"], MEDIA)
            self.assertLessEqual(r["date"], today.isoformat())
            self.assertGreaterEqual(r["clicks"], 0)
            self.assertGreaterEqual(r["spend"], 0)


if __name__ == "__main__":
    unittest.main()
