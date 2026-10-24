"""商品ページから、配信で使う商品の画像を選ぶ(server/ccp/product_pages.py。X64)"""
import unittest

from ccp import product_pages as pp


class SampleShopTest(unittest.TestCase):
    def test_sample_code_from_shop_url_and_app_path(self):
        self.assertEqual(pp.sample_code("https://shop.example.com/p/P01?utm_source=mail"), "P01")
        self.assertEqual(pp.sample_code("/sample-shop/p/U03"), "U03")
        self.assertIsNone(pp.sample_code("https://www.example.org/p/P01"))
        self.assertIsNone(pp.sample_code("https://shop.example.com/c/tops"))

    def test_sample_page_lists_every_angle_through_the_real_parser(self):
        html = pp.sample_html("P01", {"name": "<Coat>", "description": "warm"})
        self.assertIn("&lt;Coat&gt;", html)
        found = pp.extract(html, "https://shop.example.com/sample-shop/p/P01")
        paths = [f["src"].split("shop.example.com")[1] for f in found]
        self.assertEqual(paths, [f"/sample-shop/img/P01/{a}.svg" for a in pp.ANGLES])

    def test_photo_page_shows_photos_and_captions_through_the_real_parser(self):
        photos = [{"image_url": "/img/products/m.jpg", "alt": "", "caption": "", "angle": "front", "is_main": 1},
                  {"image_url": "/img/products/t.jpg", "alt": "Wool", "caption": "Warm <b>", "angle": "texture", "is_main": 0}]
        html = pp.sample_html("U01", {"name": "Coat", "description": "warm", "price": 198, "market": "US", "photos": photos})
        self.assertIn("Sample", html)
        self.assertIn("$198", html)
        self.assertIn("Warm &lt;b&gt;", html)
        found = pp.extract(html, "https://shop.example.com/sample-shop/p/U01")
        # メインが先頭。小さな写真の列は除き、特長の写真を拾う
        self.assertEqual([f["src"] for f in found], ["https://shop.example.com/img/products/m.jpg", "https://shop.example.com/img/products/t.jpg"])
        # 画像ごとの説明: 特長の写真は説明の文、説明のないメインは商品の名前
        self.assertEqual([f["description"] for f in found], ["Coat", "Warm <b>"])

    def test_sample_svg_gets_colors_per_product(self):
        a, b = pp.sample_svg("P01", "front"), pp.sample_svg("P02", "front")
        self.assertNotIn("{{", a)
        self.assertNotEqual(a, b)
        self.assertEqual(a, pp.sample_svg("P01", "front"))


class ExtractTest(unittest.TestCase):
    def test_skips_logos_tiny_and_data_images_and_takes_largest_srcset(self):
        html = """<meta property="og:image" content="https://cdn.example.com/a.jpg">
        <img src="/logo.png"><img src="data:image/png;base64,xx"><img src="/x.jpg" width="40">
        <img src="/s.jpg" srcset="/s-400.jpg 400w, /s-1200.jpg 1200w" alt="Side">
        <img data-src="/lazy.jpg" src="/placeholder.gif" alt="Lazy">
        <img src="https://cdn.example.com/a.jpg">"""
        found = pp.extract(html, "https://www.example.com/item/1")
        self.assertEqual([f["src"] for f in found], ["https://cdn.example.com/a.jpg", "https://www.example.com/s-1200.jpg", "https://www.example.com/lazy.jpg"])
        self.assertEqual(found[1]["alt"], "Side")


if __name__ == "__main__":
    unittest.main()


class DescriptionTest(unittest.TestCase):
    PAGE = """<html><head><script type="application/ld+json">{"@type": "Product", "image": [
      {"@type": "ImageObject", "contentUrl": "/d.jpg?width=300", "caption": "from json-ld"}]}</script></head><body>
      <img src="/a.jpg" alt="alt text" title="title text">
      <img src="/b.jpg" title="title only">
      <figure><figcaption>caption first</figcaption><img src="/c.jpg"></figure>
      <img src="/d.jpg"><img src="/e.jpg"></body></html>"""

    def test_alt_then_title_then_figcaption_then_json_ld(self) -> None:
        found = pp.extract(self.PAGE, "https://shop/p/1")
        self.assertEqual([(f["src"].rsplit("/", 1)[1], f["description"]) for f in found],
                         [("a.jpg", "alt text"), ("b.jpg", "title only"), ("c.jpg", "caption first"), ("d.jpg", "from json-ld"), ("e.jpg", "")])


class OriginalSizeTest(unittest.TestCase):
    """画像の URL の ?width= だけを外して、元の大きさで取る(2026-10-23)"""

    def test_removes_width_only(self) -> None:
        f = pp.original_size
        self.assertEqual(f("https://shop/a.jpg?width=600"), "https://shop/a.jpg")
        self.assertEqual(f("https://shop/a.jpg?v=12&width=600&crop=center"), "https://shop/a.jpg?v=12&crop=center")
        self.assertEqual(f("https://shop/a.jpg?WIDTH=600&v=1"), "https://shop/a.jpg?v=1")
        # ほかのクエリ・書き方(エンコード)・# の後ろは、そのまま
        self.assertEqual(f("https://shop/a.jpg?name=a%20b&width=1#x"), "https://shop/a.jpg?name=a%20b#x")
        # width がない URL・別の名前(w・height・widths)は、そのまま
        for u in ("https://shop/a.jpg", "https://shop/a.jpg?w=600", "https://shop/a.jpg?height=400", "https://shop/a.jpg?widths=1", "/img/products/x.jpg"):
            self.assertEqual(f(u), u)

    def test_extract_strips_width_and_merges_sizes(self) -> None:
        html = '<img src="/a.jpg?width=200"><img srcset="/a.jpg?width=400 400w, /a.jpg?width=1200 1200w"><img src="/b.jpg?v=3&width=300">'
        got = [i["src"] for i in pp.extract(html, "https://shop/p/1")]
        # 大きさ違いの同じ画像は、1 つにまとまる
        self.assertEqual(got, ["https://shop/a.jpg", "https://shop/b.jpg?v=3"])


class ExpiryTest(unittest.TestCase):
    """写っているモデルの使用期限(X77)を、img の data 属性 → JSON-LD → ページの中の JSON の順に拾う"""

    PAGE = """<html><head><script type="application/ld+json">
      {"@type": "Product", "image": [{"@type": "ImageObject", "contentUrl": "/b.jpg", "modelExpirationDate": "2026-11-30T00:00:00Z"},
                                     {"@type": "ImageObject", "contentUrl": "/c.jpg", "expires": "2026/12/1"}]}</script>
      <script>window.__DATA__ = {"images": [{"src": "https:\\/\\/shop\\/d.jpg?width=300", "modelExpirationDate": "2027-01-15"}]}</script>
      </head><body>
      <img src="/a.jpg" data-model-expiration-date="2026-10-20"><img src="/b.jpg"><img src="/c.jpg"><img src="/d.jpg"><img src="/e.jpg"></body></html>"""

    def test_attribute_then_json_ld_then_page_json(self) -> None:
        found = pp.extract(self.PAGE, "https://shop/p/1")
        self.assertEqual([(f["src"].rsplit("/", 1)[1], f.get("model_usable_until")) for f in found],
                         [("a.jpg", "2026-10-20"), ("b.jpg", "2026-11-30"), ("c.jpg", "2026-12-01"), ("d.jpg", "2027-01-15"), ("e.jpg", None)])

    def test_sample_page_writes_the_expiry_so_the_parser_reads_it(self) -> None:
        photos = [{"image_url": "/img/products/m.jpg", "alt": "", "caption": "", "angle": "front", "is_main": 1, "model_usable_until": "2026-10-20"},
                  {"image_url": "/img/products/t.jpg", "alt": "Wool", "caption": "Warm", "angle": "texture", "is_main": 0}]
        html = pp.sample_html("U01", {"name": "Coat", "description": "warm", "price": 198, "market": "US", "photos": photos})
        self.assertIn("Model usage rights until: 2026-10-20", html)
        found = pp.extract(html, "https://shop.example.com/sample-shop/p/U01")
        self.assertEqual([f.get("model_usable_until") for f in found], ["2026-10-20", None])


class CollectScriptTest(unittest.TestCase):
    """手元の PC で集めるスクリプト(scripts/collect-product-images.py)も、同じ外し方をする。
    スクリプトは Workbench 版の ZIP に入らないので、ないときは飛ばす"""

    def test_script_strips_width(self) -> None:
        import importlib.util
        from pathlib import Path

        path = Path(__file__).resolve().parents[2] / "scripts" / "collect-product-images.py"
        if not path.is_file():
            self.skipTest("スクリプトがない(Workbench 版の ZIP)")
        spec = importlib.util.spec_from_file_location("collect_product_images", path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)  # type: ignore[union-attr]
        for u in ("https://shop/a.jpg?width=600", "https://shop/a.jpg?v=12&width=600&crop=center", "https://shop/a.jpg", "https://shop/a.jpg?w=600"):
            self.assertEqual(mod.original_size(u), pp.original_size(u))
        got = [i["src"] for i in mod.extract('<img src="/a.jpg?width=200"><img src="/a.jpg?width=800">', "https://shop/p/1")]
        self.assertEqual(got, ["https://shop/a.jpg"])
        # 説明の拾い方も同じ
        self.assertEqual(mod.extract(DescriptionTest.PAGE, "https://shop/p/1"), pp.extract(DescriptionTest.PAGE, "https://shop/p/1"))
        # モデルの使用期限の拾い方も同じ(X77)
        self.assertEqual(mod.extract(ExpiryTest.PAGE, "https://shop/p/1"), pp.extract(ExpiryTest.PAGE, "https://shop/p/1"))
