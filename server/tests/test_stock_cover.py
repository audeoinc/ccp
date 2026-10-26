"""在庫の持ちの材料をまとめて返す窓口(server/ccp/stock_cover.py)の、受け取りと形づくり"""
import unittest

from ccp.schema import BadRequest
from ccp.stock_cover import MAX_CODES, parse_codes, shape


class ParseCodesTest(unittest.TestCase):
    def test_trims_and_dedupes(self):
        self.assertEqual(parse_codes(" U01, U02,,U01 "), ["U01", "U02"])

    def test_empty(self):
        self.assertEqual(parse_codes(""), [])

    def test_too_many(self):
        with self.assertRaises(BadRequest):
            parse_codes(",".join(f"P{i}" for i in range(MAX_CODES + 1)))


class ShapeTest(unittest.TestCase):
    def test_by_code(self):
        rows = [{"product_code": "U06", "last4": 115, "stock": 180}, {"product_code": "U07", "last4": None, "stock": None}]
        self.assertEqual(shape(rows), {"U06": {"last4": 115, "stock": 180}, "U07": {"last4": 0, "stock": None}})


if __name__ == "__main__":
    unittest.main()
