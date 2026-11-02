"""商品ページの本文(server/ccp/page_text.py。X80 段 ②)と、その取り込み(product_images.py の page)の単体テスト。DB には接続しない。

  cd server && python -m unittest discover tests
"""
from __future__ import annotations

import asyncio
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from ccp import product_images as pi  # noqa: E402
from ccp import product_pages as pp  # noqa: E402
from ccp.page_text import MAX_TEXT, page_text  # noqa: E402

from test_product_images import FakeConn, img, make_zip  # noqa: E402

PAGE = """<html><head><title>Wool Coat | Shop</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Wool Coat","description":"A warm coat made of merino wool."}</script></head>
<body><header><nav>Men Women Sale</nav></header>
<main><h1>Wool Coat</h1><p>Soft <b>merino</b> wool.</p><ul><li>Water repellent</li><li>Two pockets</li></ul>
<figure><img src="a.jpg" alt="a"><figcaption>caption of the photo</figcaption></figure>
<div aria-hidden="true">hidden text</div><p data-nosnippet>not body</p><button>Add to bag</button></main>
<aside><main>second main</main></aside>
<footer>Copyright</footer></body></html>"""


class PageTextTest(unittest.TestCase):
    def test_reads_main_only_and_skips_chrome(self) -> None:
        got = page_text(PAGE)
        self.assertEqual(got["title"], "Wool Coat | Shop")
        # <main> の中だけ。ナビ・フッター・ボタン・画像の説明・隠した所・2 つ目の <main> は入れない。JSON-LD の説明は先頭に
        self.assertEqual(got["text"], "A warm coat made of merino wool.\nWool Coat\nSoft merino wool.\nWater repellent\nTwo pockets")

    def test_whole_body_when_no_main_and_no_duplicate_description(self) -> None:
        got = page_text("<body><nav>menu</nav><div><p>Light parka.</p><p>Taped seams.</p></div><script>var x = 1</script></body>")
        self.assertEqual(got["text"], "Light parka.\nTaped seams.")
        # JSON-LD の説明が本文にもあれば、重ねない
        html = '<script type="application/ld+json">{"@type":"Product","description":"Light parka."}</script><main><p>Light parka.</p></main>'
        self.assertEqual(page_text(html)["text"], "Light parka.")

    def test_broken_html_and_length_limit(self) -> None:
        self.assertEqual(page_text("<main><p>unclosed <b>bold</main></i>")["text"], "unclosed bold")
        self.assertEqual(len(page_text("<p>" + "x" * (MAX_TEXT + 500) + "</p>")["text"]), MAX_TEXT)

    def test_sample_photo_page_body_has_no_sample_notice(self) -> None:
        photos = [{"image_url": "/img/products/m.jpg", "alt": "", "caption": "", "is_main": 1},
                  {"image_url": "/img/products/t.jpg", "alt": "Taped seams", "caption": "Seams keep water out.", "is_main": 0}]
        html = pp.sample_html("U04", {"name": "Rain Parka", "description": "Light parka for rainy days.", "price": 98, "market": "US", "photos": photos})
        text = page_text(html)["text"]
        self.assertIn("Light parka for rainy days.", text)
        self.assertIn("Seams keep water out.", text)
        # 「見本のページです」の注記は本文に入れない(AI がページの事実と取りちがえないように)
        self.assertNotIn("sample product page", text)
        self.assertIn("Light parka for rainy days.", page_text(pp.sample_html("U04", {"name": "Rain Parka", "description": "Light parka for rainy days."}))["text"])


class CollectScriptTextTest(unittest.TestCase):
    def test_script_reads_the_same_text(self) -> None:
        path = Path(__file__).resolve().parents[2] / "scripts" / "collect-product-images.py"
        if not path.is_file():
            self.skipTest("スクリプトがない(Workbench 版の ZIP)")
        spec = importlib.util.spec_from_file_location("collect_product_images_text", path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)  # type: ignore[union-attr]
        self.assertEqual(mod.page_text(PAGE), page_text(PAGE))


class ImportPageTextTest(unittest.TestCase):
    def test_imports_text_with_images_and_text_only(self) -> None:
        products = [
            {"product_code": "A1", "market": "JP", "images": [img("JP_A1/01_main.jpg", "a", True)], "page": {"title": "A1 page", "text": "Body of A1"},
             "final_url": "https://shop/p/A1", "collected_at": "2026-11-02T10:00:00+09:00"},
            # 本文だけ(画像は集まらなかった): 本文は入れ、画像の行は消さない
            {"product_code": "B2", "market": "JP", "images": [], "page": {"title": "", "text": "Body of B2"}, "page_url": "https://shop/p/B2"},
            # 画像も本文もない: 飛ばす
            {"product_code": "C3", "market": "JP", "images": [], "page": {"title": "x", "text": "  "}},
        ]
        z = make_zip(products)
        catalog = [{"id": "p1", "product_code": "A1", "market": "JP", "image_url": "x"}, {"id": "p2", "product_code": "B2", "market": "JP", "image_url": "y"},
                   {"id": "p3", "product_code": "C3", "market": "JP", "image_url": "z"}]
        p = pi.plan({"products": products}, catalog)
        self.assertEqual([i["product"]["id"] for i in p["items"]], ["p1", "p2"])
        self.assertEqual(pi.summary({"products": products}, p)["texts"], 2)
        with tempfile.TemporaryDirectory() as d:
            conn = FakeConn()
            r = asyncio.run(pi.apply(conn, z, p, pi.local_put(Path(d)), main_to_master=False))
        self.assertEqual((r["rows"], r["texts"]), (1, 2))
        texts = [c for c in conn.calls if c[0].startswith("INSERT INTO product_page_texts")]
        self.assertEqual([(c[1]["pid"], c[1]["name"], c[1]["body"], c[1]["url"]) for c in texts],
                         [("p1", "A1 page", "Body of A1", "https://shop/p/A1"), ("p2", "B2", "Body of B2", "https://shop/p/B2")])
        self.assertEqual([c[1]["at"] for c in texts], ["2026-11-02T10:00:00+09:00", None])
        # 本文の行も、商品ごとに先に消してから入れる(本物の ZIP は本物の行だけ)。本文だけの B2 は、画像の行を消さない
        deletes = [c for c in conn.calls if c[0].startswith("DELETE")]
        self.assertEqual([(c[0].split()[2], c[1]["id"]) for c in deletes], [("product_page_texts", "p1"), ("product_images", "p1"), ("product_page_texts", "p2")])
        self.assertTrue(all("source IS NULL" in c[0] for c in deletes))


if __name__ == "__main__":
    unittest.main()
