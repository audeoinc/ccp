"""ファイルの置き場所の読み書き(server/ccp/assets.py の put / get / delete)。フォルダに置く形だけ(バケットには接続しない)"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ccp import assets  # noqa: E402


class AssetStoreTest(unittest.TestCase):
    def test_put_get_delete_in_asset_dir(self) -> None:
        with tempfile.TemporaryDirectory() as d, mock.patch.dict(os.environ, {"ASSET_DIR": d}):
            assets.put("heroes", "a.png", b"png", "image/png")
            self.assertTrue((Path(d) / "heroes" / "a.png").is_file())
            self.assertEqual(assets.get("heroes", "a.png"), (b"png", "image/png"))
            self.assertEqual(assets.read_image("heroes", "a.png"), (b"png", "image/png"))
            assets.delete("heroes", "a.png")
            assets.delete("heroes", "a.png")  # なくても失敗しない
            self.assertIsNone(assets.get("heroes", "a.png"))

    def test_dev_folder_is_used_but_not_served(self) -> None:
        # ASSET_DIR もバケットもない(手元の開発)ときは server/images に置くが、/img からは配らない
        with tempfile.TemporaryDirectory() as d, mock.patch.dict(os.environ, {}, clear=True), mock.patch.object(assets, "DEV_DIR", Path(d)):
            assets.put("parts", "b.webp", b"w", "image/webp")
            self.assertEqual(assets.get("parts", "b.webp"), (b"w", "image/webp"))
            self.assertIsNone(assets.read_image("parts", "b.webp"))

    def test_bucket_object_names(self) -> None:
        self.assertEqual(assets.object_name("products", "x.jpg"), "images/products/x.jpg")
        # 素材は、はじめから images/ の外
        self.assertEqual(assets.object_name("creative", "y.pdf"), "creative/y.pdf")


if __name__ == "__main__":
    unittest.main()
