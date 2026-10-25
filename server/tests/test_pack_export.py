"""パックの書き出し(server/ccp/pack.py の write_pack・export_pack)と、置き換えの取り込みのまとめ方(batches)。DB には接続しない"""
from __future__ import annotations

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

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

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

    def test_file_refs_include_pin_images(self) -> None:
        """ピンを書いたときの様子の画像(配信カードのコメントと、開発へのリクエスト)も、パックに入れる"""
        note = "11111111111111111111111111111111.png"
        dev = "22222222222222222222222222222222.png"
        rows = {"card_notes": [{"id": "n1", "anchor_image": note}, {"id": "n2"}], "dev_requests": [{"id": "d1", "anchor_image": dev}, {"id": "d2", "anchor_image": None}]}
        self.assertEqual(sorted(pack.file_refs(rows)), [("creative", note), ("creative", dev)])

    def test_large_export_is_chunked_without_length_and_removes_file(self) -> None:
        """32MiB を超える ZIP でも、大きさ(Content-Length)を付けずに分けて返す(応答の大きさの上限に当たらないように)"""
        big = os.urandom(1024 * 1024)
        names = [f"p{i}.jpg" for i in range(34)]
        rows = {"products": [{"id": n, "image_url": f"/img/products/{n}"} for n in names]}
        made: list[str] = []
        real = tempfile.mkstemp

        def mkstemp(**kw):
            fd, path = real(**kw)
            made.append(path)
            return fd, path

        app = FastAPI()
        app.include_router(pack.router)
        app.dependency_overrides[pack.require_db] = lambda: None
        with tempfile.TemporaryDirectory() as d, mock.patch.dict(os.environ, {"ASSET_DIR": d}), \
                mock.patch.object(pack, "read_tables", mock.AsyncMock(return_value=rows)), \
                mock.patch.object(pack.tempfile, "mkstemp", mkstemp):
            (Path(d) / "products").mkdir()
            for n in names:
                (Path(d) / "products" / n).write_bytes(big)
            with TestClient(app) as client:
                r = client.get("/api/export")
        self.assertEqual(r.status_code, 200)
        self.assertNotIn("content-length", r.headers)
        self.assertIn("attachment", r.headers["content-disposition"])
        self.assertGreater(len(r.content), 32 * 1024 * 1024)
        with zipfile.ZipFile(io.BytesIO(r.content)) as z:
            self.assertEqual(z.read("images/products/p0.jpg"), big)
            self.assertEqual(json.loads(z.read("data.json"))["missingImages"], [])
        self.assertEqual(len(made), 1)
        self.assertFalse(os.path.exists(made[0]))


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


class NewestPerUniqueTest(unittest.TestCase):
    def test_keeps_newest_of_same_user_and_name(self) -> None:
        from ccp import schema as sc

        t = sc.load().table("user_prefs")
        rows = [
            {"id": "a", "user_id": "u1", "name": "lang", "value": "ja", "modified_on": "2026-10-01T00:00:00Z"},
            {"id": "b", "user_id": "u1", "name": "zoom", "value": "1", "modified_on": "2026-10-01T00:00:00Z"},
            {"id": "c", "user_id": "u1", "name": "lang", "value": "en", "modified_on": "2026-10-02T00:00:00Z"},
            {"id": "d", "user_id": None, "name": "lang", "value": "x"},
        ]
        self.assertEqual([r["id"] for r in pack.newest_per_unique(t, rows)], ["b", "c", "d"])
        # 一意の組のない表は、そのまま
        self.assertEqual(pack.newest_per_unique(sc.load().table("events"), rows), rows)


if __name__ == "__main__":
    unittest.main()
