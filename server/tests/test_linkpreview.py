"""素材の URL の見本カード(server/ccp/linkpreview.py。X58)"""
import unittest
from unittest import mock

from ccp import linkpreview


class ParseTest(unittest.TestCase):
    def test_prefers_og_and_resolves_relative_image(self):
        html = """<html><head><title>Plain title</title>
        <meta property="og:title" content="OG title"><meta name="description" content="desc">
        <meta property="og:image" content="/img/card.png"><meta property="og:site_name" content="Example">
        </head><body>x</body></html>"""
        p = linkpreview.parse(html, "https://example.com/a/b")
        self.assertEqual(p["title"], "OG title")
        self.assertEqual(p["description"], "desc")
        self.assertEqual(p["site"], "Example")
        self.assertEqual(p["image"], "https://example.com/img/card.png")

    def test_falls_back_to_title_tag(self):
        p = linkpreview.parse("<title> Hello </title>", "https://example.org/")
        self.assertEqual(p["title"], "Hello")
        self.assertEqual(p["site"], "example.org")
        self.assertEqual(p["image"], "")


class SafetyTest(unittest.TestCase):
    def test_blocks_non_http_and_private_addresses(self):
        with self.assertRaises(linkpreview.Blocked):
            linkpreview.check_public("file:///etc/passwd")
        for ip in ["127.0.0.1", "10.0.0.5", "169.254.169.254", "192.168.1.1", "::1"]:
            with mock.patch("socket.getaddrinfo", return_value=[(None, None, None, None, (ip, 80))]):
                with self.assertRaises(linkpreview.Blocked, msg=ip):
                    linkpreview.check_public("http://internal.example/")

    def test_allows_public_address(self):
        with mock.patch("socket.getaddrinfo", return_value=[(None, None, None, None, ("93.184.216.34", 443))]):
            linkpreview.check_public("https://example.com/")


if __name__ == "__main__":
    unittest.main()
