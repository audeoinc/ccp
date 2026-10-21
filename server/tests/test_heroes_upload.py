"""メイン画像のライブラリに画像を上げる(server/ccp/heroes.py の upload。X59)"""
import asyncio
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from ccp import heroes


class FakeRequest:
    def __init__(self, data: bytes):
        self._data = data

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
