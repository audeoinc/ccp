"""パックの書き出し(server/ccp/pack.py の write_pack・export_pack)と、置き換えの取り込みのまとめ方(batches)。DB には接続しない"""
from __future__ import annotations

import asyncio
import io
import json
import os
import sys
import tempfile
import unittest
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ccp import pack  # noqa: E402

NOW = datetime(2026, 10, 25, 9, 0, tzinfo=timezone.utc)
STORED = "0123456789abcdef0123456789abcdef.pdf"


def tables() -> dict:
    return {
        "products": [{"id": "p1", "image_url": "/img/products/a.jpg"}, {"id": "p2", "image_url": "/img/products/gone.jpg"}],
        "hero_images": [{"id": "h1", "image_url": "https://example.com/x.jpg"}],
        "card_assets": [{"id": "c1", "stored": STORED, "preview_image": None}],
    }


class WritePackTest(unittest.TestCase):
    def test_writes_found_files_and_lists_missing(self) -> None:
        with tempfile.TemporaryDirectory() as d, mock.patch.dict(os.environ, {"ASSET_DIR": d}):
            (Path(d) / "products").mkdir()
            (Path(d) / "products" / "a.jpg").write_bytes(b"jpg")
            (Path(d) / "creative").mkdir()
            (Path(d) / "creative" / STORED).write_bytes(b"pdf")
            buf = io.BytesIO()
            pack.write_pack(buf, tables(), NOW)
        with zipfile.ZipFile(io.BytesIO(buf.getvalue())) as z:
            self.assertEqual(z.read("images/products/a.jpg"), b"jpg")
            self.assertEqual(z.read(f"images/creative/{STORED}"), b"pdf")
            data = json.loads(z.read("data.json").decode("utf-8"))
        self.assertEqual(data["version"], pack.PACK_VERSION)
        self.assertEqual(data["missingImages"], ["products/gone.jpg"])
        self.assertEqual(data["counts"]["products"], 2)
        self.assertEqual(data["tables"]["hero_images"][0]["id"], "h1")

    def test_export_returns_file_and_removes_it_after(self) -> None:
        with tempfile.TemporaryDirectory() as d, mock.patch.dict(os.environ, {"ASSET_DIR": d}), \
                mock.patch.object(pack, "read_tables", mock.AsyncMock(return_value=tables())):
            res = asyncio.run(pack.export_pack())
            path = res.path
            self.assertTrue(os.path.isfile(path))
            self.assertIn("attachment", res.headers["content-disposition"])
            with zipfile.ZipFile(path) as z:
                self.assertIn("data.json", z.namelist())
            asyncio.run(res.background())
            self.assertFalse(os.path.exists(path))


class BatchesTest(unittest.TestCase):
    def test_groups_runs_with_same_columns_in_order(self) -> None:
        rows = [{"id": 1, "a": 1}, {"id": 2, "a": 2}, {"id": 3, "b": 3}, {"id": 4, "a": 4}]
        out = list(pack.batches(rows))
        self.assertEqual([c for c, _ in out], [["id", "a"], ["id", "b"], ["id", "a"]])
        self.assertEqual([[r["id"] for r in b] for _, b in out], [[1, 2], [3], [4]])

    def test_splits_long_runs(self) -> None:
        with mock.patch.object(pack, "BATCH", 2):
            out = list(pack.batches({"id": i} for i in range(5)))
        self.assertEqual([len(b) for _, b in out], [2, 2, 1])


if __name__ == "__main__":
    unittest.main()
