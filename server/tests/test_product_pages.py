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
