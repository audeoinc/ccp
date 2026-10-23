"""devimages.py(開発用の画面の「画像の一覧」)の単体テスト。DB には接続しない。

  cd server && python -m unittest discover tests
"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ccp import devimages as di  # noqa: E402


class LinkStateTest(unittest.TestCase):
    NAMES = {"heroes": {"H01.jpg"}, "products": {"a.jpg"}, "parts": set(), "creative": {"0123.png"}}

    def test_states(self) -> None:
        cases = {
            "/img/heroes/H01.jpg": "ok",
            "/img/heroes/H02.jpg": "missing",
            "/img/products/a.jpg": "ok",
            "/api/creative/files/0123.png": "ok",
            "/api/creative/files/9999.png": "missing",
            "https://placehold.co/300x400": "external",
            "/sample-shop/img/P01/front.svg": "ok",
            "": "empty",
            None: "empty",
            "/somewhere/else.jpg": "unknown",
        }
        for url, want in cases.items():
            self.assertEqual(di.link_state(url, self.NAMES), want, url)

    def test_unknown_when_store_unreadable(self) -> None:
        self.assertEqual(di.link_state("/img/heroes/H01.jpg", {"heroes": None}), "unknown")


class StoredNamesTest(unittest.TestCase):
    def test_reads_asset_dir_folders(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "heroes").mkdir()
            (Path(d) / "heroes" / "H01.jpg").write_bytes(b"x")
            (Path(d) / "creative").mkdir()
            (Path(d) / "creative" / "0123.png").write_bytes(b"x")
            with mock.patch.dict(os.environ, {"ASSET_DIR": d}):
                self.assertEqual(di.stored_names("heroes"), {"H01.jpg"})
                self.assertEqual(di.stored_names("parts"), set())
                self.assertEqual(di.stored_names("creative"), {"0123.png"})


if __name__ == "__main__":
    unittest.main()
