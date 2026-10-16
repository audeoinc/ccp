"""importer.py の、画像に依存しない部分(コード・選択肢・デモ用の数値)の単体テスト。"""
from __future__ import annotations

import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ccp import importer as im  # noqa: E402


class ImporterTest(unittest.TestCase):
    def test_product_codes_are_six_digits_starting_with_4_and_stable(self) -> None:
        used: set[str] = set()
        a = im.product_code("ab" * 20, used)
        self.assertRegex(a, r"^4\d{5}$")
        self.assertEqual(im.product_code("ab" * 20, set()), a)  # 同じ画像 → 同じコード
        b = im.product_code("ab" * 20, used)  # 重なったら、次の番号
        self.assertNotEqual(a, b)
        self.assertRegex(b, r"^4\d{5}$")
        edge = im.product_code("f" * 40, set())
        self.assertRegex(edge, r"^4\d{5}$")

    def test_jp_uses_the_us_images_when_the_jp_folder_is_empty(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as d:
            base = Path(d)
            (base / "products" / "us").mkdir(parents=True)
            (base / "products" / "jp").mkdir(parents=True)
            (base / "products" / "us" / "b.png").write_bytes(b"1")
            (base / "products" / "us" / "a.png").write_bytes(b"2")
            got = im.list_images(base)
            self.assertEqual([p.name for p in got["products/jp"]], ["a.png", "b.png"])  # 共有(名前順)
            self.assertEqual([p.name for p in got["products/us"]], ["a.png", "b.png"])
            # JP 用のフォルダに画像があれば、そちらを使う
            (base / "products" / "jp" / "x.png").write_bytes(b"3")
            self.assertEqual([p.name for p in im.list_images(base)["products/jp"]], ["x.png"])

    def test_same_image_gets_different_digests_per_market(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "a.png"
            f.write_bytes(b"image-bytes")
            us, jp = im.digest_for(f, "products/us"), im.digest_for(f, "products/jp")
            self.assertNotEqual(us, jp)
            self.assertEqual(us, im.digest_for(f, "products/us"))
            self.assertNotEqual(im.product_code(us, set()), im.product_code(jp, set()))

    def test_hero_codes(self) -> None:
        self.assertEqual(im.code_for("heroes/jp", 2), "H03")
        self.assertEqual(im.code_for("heroes/us", 19), "UH20")

    def test_enums_come_from_models(self) -> None:
        e = im.load_enums()
        self.assertEqual(e["category"]["アウター"], "outer")
        self.assertEqual(e["market"], {"JP": "JP", "US": "US"})
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
        self.assertEqual(rows[-1]["stock"], 120)
        self.assertEqual(len({r["id"] for r in rows}), len(rows))  # 行ごとに、別の ID
        for a, b in zip(rows, rows[1:]):
            self.assertEqual(a["stock"] - b["units"], b["stock"])
        self.assertEqual(rows[0]["revenue"], rows[0]["units"] * 9800)

    def test_rising_trend_sells_more_at_the_end_than_the_start(self) -> None:
        up = im.weekly_rows(random.Random("a"), "P02", "トップス", 5800, 100, "上昇")
        down = im.weekly_rows(random.Random("a"), "P03", "トップス", 5800, 100, "下降")
        self.assertGreater(up[-1]["units"], up[0]["units"])
        self.assertLess(down[-1]["units"], down[0]["units"])


if __name__ == "__main__":
    unittest.main()
