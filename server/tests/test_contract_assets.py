"""ファイルの置き場所の契約テスト(docs/ARCHITECTURE.md の 0.5 章): フォルダ(ASSET_DIR)とバケット(GCS)が、同じ操作に同じに振る舞う。

同じテスト(Contract)を、アダプターごとの組み立て(FolderAdapter・GcsAdapter)で 2 回流す。
GCS は本物を呼ばず、assets.py が使う JSON API の 3 つ(置く・読む・消す)だけを、メモリの上で真似る(FakeGcs)。
アダプター(S3 など)を足したら、ここに組み立てを 1 つ足す。
"""
from __future__ import annotations

import asyncio
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock
from urllib.parse import parse_qs, unquote, urlparse

from fastapi import HTTPException

from ccp import assets


class Contract:
    def test_put_then_get(self):
        assets.put("heroes", "a.png", b"png", "image/png")
        self.assertEqual(assets.get("heroes", "a.png"), (b"png", "image/png"))

    def test_content_type_follows_the_file(self):
        for name, ctype in (("b.jpg", "image/jpeg"), ("c.jpeg", "image/jpeg"), ("d.webp", "image/webp")):
            assets.put("products", name, b"x", ctype)
            self.assertEqual(assets.get("products", name), (b"x", ctype))

    def test_missing_is_none(self):
        self.assertIsNone(assets.get("heroes", "nothing.png"))

    def test_same_name_is_overwritten(self):
        assets.put("parts", "p.png", b"old", "image/png")
        assets.put("parts", "p.png", b"new", "image/png")
        self.assertEqual(assets.get("parts", "p.png"), (b"new", "image/png"))

    def test_delete_then_none_and_delete_again_is_quiet(self):
        assets.put("heroes", "a.png", b"png", "image/png")
        assets.delete("heroes", "a.png")
        self.assertIsNone(assets.get("heroes", "a.png"))
        assets.delete("heroes", "a.png")

    def test_kinds_are_separate(self):
        assets.put("heroes", "same.png", b"hero", "image/png")
        assets.put("products", "same.png", b"product", "image/png")
        assets.delete("heroes", "same.png")
        self.assertEqual(assets.get("products", "same.png"), (b"product", "image/png"))

    def test_creative_files(self):
        # 素材は画像でないこともある(置き場所の中の場所だけがちがう)。種類は呼ぶ側(creative.py)が拡張子で決めるので、中身だけを比べる
        assets.put("creative", "brief.pdf", b"%PDF", "application/pdf")
        data, _ = assets.get("creative", "brief.pdf")
        self.assertEqual(data, b"%PDF")

    def test_served_by_img(self):
        assets.put("heroes", "a.png", b"png", "image/png")
        res = asyncio.run(assets.image("heroes", "a.png"))
        self.assertEqual((res.body, res.media_type), (b"png", "image/png"))
        with self.assertRaises(HTTPException) as e:
            asyncio.run(assets.image("heroes", "nothing.png"))
        self.assertEqual(e.exception.status_code, 404)

    def test_cannot_put_raises(self):
        # 置けないときは、黙らずに例外(置けたつもりで、行だけが残らないように)
        self.break_store()
        with self.assertRaises(Exception):
            assets.put("heroes", "a.png", b"png", "image/png")


class FolderAdapter(Contract, unittest.TestCase):
    def setUp(self) -> None:
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        self.dir = Path(d.name)
        p = mock.patch.dict(os.environ, {"ASSET_DIR": d.name, "ASSET_BUCKET": "", "STATE_BUCKET": ""})
        p.start()
        self.addCleanup(p.stop)

    def break_store(self) -> None:
        # 置き場所のフォルダのはずの所が、ファイルになっている
        f = self.dir / "file"
        f.write_bytes(b"")
        os.environ["ASSET_DIR"] = str(f)


class FakeResponse:
    def __init__(self, status: int, content: bytes = b"", content_type: str = "application/json") -> None:
        self.status_code = status
        self.content = content
        self.headers = {"Content-Type": content_type}

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class FakeGcs:
    """GCS の JSON API の、assets.py が使う 3 つだけ(同じ名前は上書き・消すときにないものは 404)"""

    def __init__(self, bucket: str) -> None:
        self.bucket = bucket
        self.objects: dict[str, tuple[bytes, str]] = {}
        self.down = False

    def _name(self, url: str) -> str:
        path = urlparse(url).path
        prefix = f"/storage/v1/b/{self.bucket}/o/"
        assert path.startswith(prefix), url
        return unquote(path[len(prefix):])

    def post(self, url: str, data: bytes, headers: dict, timeout: float) -> FakeResponse:
        if self.down:
            return FakeResponse(503)
        u = urlparse(url)
        assert u.path == f"/upload/storage/v1/b/{self.bucket}/o", url
        q = parse_qs(u.query)
        assert q["uploadType"] == ["media"], url
        self.objects[q["name"][0]] = (data, headers["Content-Type"])
        return FakeResponse(200)

    def get(self, url: str, timeout: float) -> FakeResponse:
        assert parse_qs(urlparse(url).query).get("alt") == ["media"], url
        found = self.objects.get(self._name(url))
        return FakeResponse(200, *found) if found else FakeResponse(404)

    def delete(self, url: str, timeout: float) -> FakeResponse:
        return FakeResponse(204) if self.objects.pop(self._name(url), None) else FakeResponse(404)


class GcsAdapter(Contract, unittest.TestCase):
    def setUp(self) -> None:
        self.gcs = FakeGcs("test-bucket")
        for p in (mock.patch.dict(os.environ, {"ASSET_BUCKET": "test-bucket"}), mock.patch.object(assets, "_session", self.gcs)):
            p.start()
            self.addCleanup(p.stop)
        os.environ.pop("ASSET_DIR", None)

    def break_store(self) -> None:
        self.gcs.down = True

    def test_objects_are_where_other_tools_expect(self):
        # バケットの中の場所は、引っ越し用のパックなど、ほかの道具も読む
        assets.put("heroes", "a.png", b"png", "image/png")
        assets.put("creative", "brief.pdf", b"%PDF", "application/pdf")
        self.assertEqual(sorted(self.gcs.objects), ["creative/brief.pdf", "images/heroes/a.png"])


if __name__ == "__main__":
    unittest.main()
