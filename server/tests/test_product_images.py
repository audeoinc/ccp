"""product_images.py(商品の画像の取り込み)の単体テスト。DB には接続しない(接続は偽物)。

  cd server && python -m unittest discover tests
"""
from __future__ import annotations

import asyncio
import io
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ccp import product_images as pi  # noqa: E402


def make_zip(products: list[dict]) -> zipfile.ZipFile:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("manifest.json", json.dumps({"products": products, "images": 0}))
        for p in products:
            for img in p.get("images", []):
                z.writestr(f"products/{img['file']}", b"IMG-" + img["sha256"].encode())
    buf.seek(0)
    return zipfile.ZipFile(buf)


def img(file: str, sha: str, main: bool = False, ctype: str = "image/jpeg") -> dict:
    return {"file": file, "sha256": sha * 32, "content_type": ctype, "main": main, "src": f"https://shop/{file}", "alt": ""}


class FakeConn:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict]] = []

    async def execute(self, stmt, params=None):  # noqa: ANN001, ANN201
        self.calls.append((str(stmt), params or {}))


class PlanTest(unittest.TestCase):
    def test_plan_matches_code_and_market(self) -> None:
        manifest = {"products": [
            {"product_code": "A1", "market": "JP", "images": [img("JP_A1/01_main.jpg", "a", True), img("JP_A1/02.gif", "b", ctype="image/gif")]},
            {"product_code": "B2", "market": None, "images": [img("ALL_B2/01.jpg", "c")]},
            {"product_code": "Z9", "market": "JP", "images": [img("JP_Z9/01.jpg", "d")]},
            {"product_code": "E5", "market": "JP", "images": [], "error": "HTTPError: 404"},
        ]}
        products = [{"id": "p1", "product_code": "A1", "market": "JP"}, {"id": "p2", "product_code": "A1", "market": "US"},
                    {"id": "p3", "product_code": "B2", "market": "JP"}, {"id": "p4", "product_code": "B2", "market": "US"}]
        p = pi.plan(manifest, products)
        # 市場があれば、その市場の商品だけ。なければ、同じコードのすべての市場。GIF は配れないので飛ばす
        self.assertEqual(sorted(i["product"]["id"] for i in p["items"]), ["p1", "p3", "p4"])
        self.assertEqual((p["missing"], p["unsupported"], len(p["errors"])), (["JP/Z9"], 1, 1))


class ApplyTest(unittest.TestCase):
    def test_apply_places_files_and_rows(self) -> None:
        products = [{"product_code": "A1", "market": "JP", "images": [img("JP_A1/01_main.jpg", "a", True), img("JP_A1/02.jpg", "b")]}]
        z = make_zip(products)
        p = pi.plan({"products": products}, [{"id": "p1", "product_code": "A1", "market": "JP", "image_url": None},
                                              {"id": "p2", "product_code": "A1", "market": "JP", "image_url": "https://cdn/main.jpg"}])
        with tempfile.TemporaryDirectory() as d:
            conn = FakeConn()
            r = asyncio.run(pi.apply(conn, z, p, pi.local_put(Path(d)), main_to_master=False))
            files = sorted(x.name for x in (Path(d) / "products").iterdir())
        # 同じ画像は 1 つだけ置く。行は商品ごと。メイン画像は、空の商品だけ埋める
        self.assertEqual(files, ["a" * 24 + ".jpg", "b" * 24 + ".jpg"])
        self.assertEqual((r["placed"], r["rows"], r["mains"]), (2, 4, 1))
        inserts = [c for c in conn.calls if c[0].startswith("INSERT")]
        self.assertEqual([(c[1]["pid"], c[1]["sort"], c[1]["main"]) for c in inserts], [("p1", 1, 1), ("p1", 2, 0), ("p2", 1, 1), ("p2", 2, 0)])
        self.assertTrue(all(c[1]["url"].startswith("/img/products/") for c in inserts))
        # 何度流しても同じになるよう、商品ごとに先に消す
        self.assertEqual(sum(1 for c in conn.calls if c[0].startswith("DELETE")), 2)
        updates = [c for c in conn.calls if c[0].startswith("UPDATE")]
        self.assertEqual([u[1]["id"] for u in updates], ["p1"])
        # 本物の ZIP は、本物の行だけを消す(見本の行は残す)
        self.assertTrue(all("source IS NULL" in c[0] for c in conn.calls if c[0].startswith("DELETE")))
        self.assertTrue(all(c[1]["source"] is None for c in inserts))

    def test_sample_zip(self) -> None:
        # 見本の写真: 見本の行だけを入れ替え、説明・アングルを入れ、仮の画像(placehold.co)のメインは置き換える(本物の画像は置き換えない)
        products = [{"product_code": "A1", "market": "JP", "images": [{**img("A1/01.jpg", "a", True), "angle": "front"}, {**img("A1/02.jpg", "b"), "alt": "見出し", "caption": "説明", "angle": "texture"}]}]
        z = make_zip(products)
        p = pi.plan({"products": products}, [{"id": "p1", "product_code": "A1", "market": "JP", "image_url": "https://placehold.co/400x400?text=A1"},
                                              {"id": "p2", "product_code": "A1", "market": "JP", "image_url": "/img/products/real.jpg"}])
        put_names: list[str] = []
        conn = FakeConn()
        r = asyncio.run(pi.apply(conn, z, p, lambda n, d, c: put_names.append(n) is None, main_to_master=False, sample=True))
        self.assertEqual(r["mains"], 1)
        self.assertTrue(all("source = :s" in c[0] for c in conn.calls if c[0].startswith("DELETE")))
        inserts = [c[1] for c in conn.calls if c[0].startswith("INSERT")]
        self.assertEqual([(i["source"], i["angle"], i["caption"]) for i in inserts[:2]], [("sample", "front", None), ("sample", "texture", "説明")])
        self.assertEqual(len(put_names), 4)
        # 仮の画像は控えない
        self.assertFalse([c for c in conn.calls if c[0].startswith("INSERT") and c[1].get("source") == "master"])

    def test_sample_replaces_real_main_and_keeps_a_copy(self) -> None:
        # 「メイン画像も置き換える」: 本物のメイン画像を置き換え、前の画像は master の行に控える
        products = [{"product_code": "A1", "market": "JP", "images": [img("A1/01.jpg", "a", True)]}]
        p = pi.plan({"products": products}, [{"id": "p1", "product_code": "A1", "market": "JP", "image_url": "/img/products/real.jpg"}])
        conn = FakeConn()
        r = asyncio.run(pi.apply(conn, make_zip(products), p, lambda *_: False, main_to_master=True, sample=True))
        self.assertEqual(r["mains"], 1)
        kept = [c[1] for c in conn.calls if c[0].startswith("INSERT") and c[1].get("source") == "master"]
        self.assertEqual([k["url"] for k in kept], ["/img/products/real.jpg"])
        self.assertIn("NOT EXISTS", [c[0] for c in conn.calls if c[0].startswith("INSERT") and c[1].get("source") == "master"][0])



class HeroTest(unittest.TestCase):
    def test_hero_plan_and_apply(self) -> None:
        # 行は id で、なければ画像コードと市場で探す。前の画像は original_image_url に控え(COALESCE で最初の 1 度だけ)、焦点を空に戻す
        manifest = {"kind": "heroes", "heroes": [
            {"id": "h1", "image_code": "X", "market": "JP", "file": "a/01.jpg", "sha256": "a" * 64, "content_type": "image/jpeg"},
            {"id": "gone", "image_code": "UH2", "market": "US", "file": "b/01.jpg", "sha256": "b" * 64, "content_type": "image/jpeg"},
            {"id": "gone2", "image_code": "H9", "market": "JP", "file": "c/01.jpg", "sha256": "c" * 64, "content_type": "image/jpeg"},
        ]}
        heroes = [{"id": "h1", "image_code": "H1", "market": "JP"}, {"id": "h2", "image_code": "UH2", "market": "US"}]
        p = pi.hero_plan(manifest, heroes)
        self.assertEqual([i["hero"]["id"] for i in p["items"]], ["h1", "h2"])
        self.assertEqual(p["missing"], ["JP/H9"])
        conn = FakeConn()
        self.assertEqual(asyncio.run(pi.hero_apply(conn, p)), 2)
        sql, params = conn.calls[0]
        self.assertIn("COALESCE(original_image_url, image_url)", sql)
        self.assertIn("focal_x = NULL", sql)
        self.assertEqual(params, {"u": "/img/heroes/s-" + "a" * 24 + ".jpg", "id": "h1"})


if __name__ == "__main__":
    unittest.main()
