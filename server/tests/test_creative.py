"""素材(Creative Assets)のファイルの置き場所(server/ccp/creative.py。X58)"""
import asyncio
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from ccp import creative


class FakeRequest:
    def __init__(self, data: bytes):
        self._data = data

    async def body(self) -> bytes:
        return self._data


class CreativeFilesTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.env = mock.patch.dict(os.environ, {"ASSET_DIR": self.dir.name})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.dir.cleanup()

    def test_upload_save_load_remove(self):
        res = asyncio.run(creative.upload(FakeRequest(b"\x89PNG data"), "ムード.png"))
        stored = res["data"]["stored"]
        self.assertRegex(stored, creative.STORED)
        self.assertTrue((Path(self.dir.name) / "creative" / stored).is_file())
        self.assertEqual(creative.load(stored), b"\x89PNG data")
        creative.remove(stored)
        self.assertIsNone(creative.load(stored))

    def test_rejects_bad_type_empty_and_large(self):
        self.assertEqual(asyncio.run(creative.upload(FakeRequest(b"x"), "a.exe")).status_code, 400)
        self.assertEqual(asyncio.run(creative.upload(FakeRequest(b"x"), "a.svg")).status_code, 400)
        self.assertEqual(asyncio.run(creative.upload(FakeRequest(b""), "a.png")).status_code, 400)
        with mock.patch.object(creative, "MAX_BYTES", 3):
            self.assertEqual(asyncio.run(creative.upload(FakeRequest(b"abcd"), "a.pdf")).status_code, 400)

    def test_stored_name_pattern_blocks_paths(self):
        for bad in ["../x.png", "a.png", "0" * 32 + ".png/../../x"]:
            self.assertIsNone(creative.STORED.match(bad))


if __name__ == "__main__":
    unittest.main()
