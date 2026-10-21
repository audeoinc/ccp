"""メイン画像のライブラリに画像を上げる(server/ccp/heroes.py の upload。X59)"""
import asyncio
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from ccp import heroes, parts


class FakeRequest:
    def __init__(self, data: bytes, content_type: str = "application/octet-stream"):
        self._data = data
        self.headers = {"content-type": content_type}

    async def body(self) -> bytes:
        return self._data


class HeroUploadTest(unittest.TestCase):
    def test_saves_to_asset_dir_and_returns_img_url(self):
        with tempfile.TemporaryDirectory() as d, mock.patch.dict(os.environ, {"ASSET_DIR": d}):
            res = asyncio.run(heroes.upload(FakeRequest(b"\x89PNG"), "秋の写真.png"))
            url = res["data"]["image_url"]
            self.assertRegex(url, heroes.URL)
            self.assertTrue((Path(d) / "heroes" / url.rsplit("/", 1)[1]).is_file())

    def test_rejects_other_types_and_large(self):
        self.assertEqual(asyncio.run(heroes.upload(FakeRequest(b"x"), "a.gif")).status_code, 400)
        self.assertEqual(asyncio.run(heroes.upload(FakeRequest(b""), "a.png")).status_code, 400)
        with mock.patch.object(heroes, "MAX_BYTES", 2):
            self.assertEqual(asyncio.run(heroes.upload(FakeRequest(b"abc"), "a.jpg")).status_code, 400)

    def test_describe_rejects_outside_urls(self):
        self.assertEqual(asyncio.run(heroes.describe(heroes.DescribeIn(image_url="https://example.com/a.png"))).status_code, 400)
        self.assertEqual(asyncio.run(heroes.describe(heroes.DescribeIn(image_url="/img/heroes/../x.png"))).status_code, 400)


class DescribeImageTest(unittest.TestCase):
    """画像そのものを AI に見せる(X59 ⑤。ライブラリで直すとき・空の項目をまとめて埋めるとき)"""

    def test_rejects_other_types_and_empty(self):
        self.assertEqual(asyncio.run(heroes.describe_image(FakeRequest(b"GIF", "image/gif"))).status_code, 400)
        self.assertEqual(asyncio.run(heroes.describe_image(FakeRequest(b"", "image/jpeg"))).status_code, 400)

    def test_returns_ai_draft(self):
        class Resp:
            text = '{"name": "秋の公園", "tags": "秋, 公園"}'

        class Models:
            async def generate_content(self, **kw):
                self.kw = kw
                return Resp()

        models = Models()
        client = mock.Mock()
        client.aio.models = models
        with mock.patch.object(heroes, "_get_client", return_value=client):
            res = asyncio.run(heroes.describe_image(FakeRequest(b"JPEG", "image/jpeg; charset=binary"), "en"))
        self.assertEqual(res["data"], {"name": "秋の公園", "tags": "秋, 公園"})
        self.assertIn("英語", models.kw["contents"][1])


class PartsTest(unittest.TestCase):
    """部品の画像(X59 ③): 置き場所は parts/。消せるのは上げた画像だけ"""

    def test_upload_and_delete_in_parts_folder(self):
        with tempfile.TemporaryDirectory() as d, mock.patch.dict(os.environ, {"ASSET_DIR": d}):
            url = asyncio.run(parts.upload(FakeRequest(b"PNG"), "button.png"))["data"]["image_url"]
            self.assertRegex(url, r"^/img/parts/up-[0-9a-f]{32}\.png$")
            name = url.rsplit("/", 1)[1]
            self.assertTrue((Path(d) / "parts" / name).is_file())
            asyncio.run(parts.delete_file(name))
            self.assertFalse((Path(d) / "parts" / name).exists())
            self.assertEqual(asyncio.run(parts.delete_file("logo.png")).status_code, 400)

    def test_rejects(self):
        self.assertEqual(asyncio.run(parts.upload(FakeRequest(b"x"), "a.gif")).status_code, 400)
        self.assertEqual(asyncio.run(parts.describe_image(FakeRequest(b"x", "image/gif"))).status_code, 400)


class HeroDeleteTest(unittest.TestCase):
    def test_deletes_only_uploaded_files(self):
        with tempfile.TemporaryDirectory() as d, mock.patch.dict(os.environ, {"ASSET_DIR": d}):
            url = asyncio.run(heroes.upload(FakeRequest(b"PNG-DATA"), "a.png"))["data"]["image_url"]
            name = url.rsplit("/", 1)[1]
            self.assertTrue((Path(d) / "heroes" / name).is_file())
            asyncio.run(heroes.delete_file(name))
            self.assertFalse((Path(d) / "heroes" / name).exists())
            # もとからある画像(up- で始まらない名前)は消さない
            self.assertEqual(asyncio.run(heroes.delete_file("H01.jpg")).status_code, 400)


if __name__ == "__main__":
    unittest.main()
