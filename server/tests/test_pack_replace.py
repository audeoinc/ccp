"""パックの置き換えの取り込み(server/ccp/pack.py の replace_tables)と、コマンド(python -m ccp.cli import-pack)。DB には接続しない(偽の DB は tests/fakes.py)。

  cd server && python -m unittest discover tests
"""
from __future__ import annotations

import asyncio
import contextlib
import io
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from ccp import cli, pack  # noqa: E402
from fakes import FakeStore  # noqa: E402

U1 = "00000000-0000-0000-0000-0000000000a1"
U2 = "00000000-0000-0000-0000-0000000000a2"
OLD = "2026-10-01T00:00:00+00:00"
NEW = "2026-10-20T00:00:00+00:00"


def quiet(coro):  # noqa: ANN001, ANN201
    with contextlib.redirect_stdout(io.StringIO()):
        return asyncio.run(coro)


class ReplaceTablesTest(unittest.TestCase):
    def setUp(self) -> None:
        self.store = FakeStore()
        p = mock.patch("ccp.db.cli_conn", lambda write=True: self.store.db(write=True))
        p.start()
        self.addCleanup(p.stop)

    def test_replaces_rows_and_keeps_dev_requests(self) -> None:
        s = self.store
        s.add("delivery_cards", name="消える配信")
        mine = s.add("dev_requests", body="この環境で書いた")
        tables = {
            "users": [{"id": U1, "name": "パックの人", "created_on": OLD, "modified_on": NEW}],
            "delivery_cards": [{"id": "00000000-0000-0000-0000-0000000000c1", "name": "パックの配信"}],
            "dev_requests": [{"id": mine, "body": "パックの側(同じ id)"}, {"id": "00000000-0000-0000-0000-0000000000d2", "body": "パックだけ"}],
        }
        quiet(pack.replace_tables(tables))
        self.assertEqual([r["name"] for r in s.rows("delivery_cards")], ["パックの配信"])
        # 作った日時・変えた日時は、パックのまま
        u = s.row("users", U1)
        self.assertEqual((u["created_on"].isoformat(), u["modified_on"].isoformat()), (OLD, NEW))
        # 開発へのリクエストは消さず、まだない行だけを足す(すでにある行は、この環境のまま)
        self.assertEqual(sorted(r["body"] for r in s.rows("dev_requests")), ["この環境で書いた", "パックだけ"])

    def test_feature_settings_stay_as_this_environment(self) -> None:
        """機能の公開・非公開(X87)は、その環境のもの。置き換えでも消さず、パックの値も取り込まない"""
        s = self.store
        s.add("feature_settings", feature_id="*", enabled=1)
        s.add("feature_settings", feature_id="face.results", enabled=0)
        tables = {"feature_settings": [{"id": "00000000-0000-0000-0000-0000000000f1", "feature_id": "face.results", "enabled": 1}]}
        quiet(pack.replace_tables(tables))
        self.assertEqual(sorted((r["feature_id"], r["enabled"]) for r in s.rows("feature_settings")), [("*", 1), ("face.results", 0)])
        quiet(pack.add_tables(tables))
        self.assertEqual(sorted((r["feature_id"], r["enabled"]) for r in s.rows("feature_settings")), [("*", 1), ("face.results", 0)])

    def test_duplicate_prefs_keep_newest(self) -> None:
        tables = {
            "users": [{"id": U1, "name": "人"}],
            "user_prefs": [
                {"id": "00000000-0000-0000-0000-0000000000e1", "user_id": U1, "name": "lang", "value": "ja", "modified_on": OLD},
                {"id": "00000000-0000-0000-0000-0000000000e2", "user_id": U1, "name": "lang", "value": "en", "modified_on": NEW},
                {"id": "00000000-0000-0000-0000-0000000000e3", "user_id": U1, "name": "width", "value": "320", "modified_on": OLD},
            ],
        }
        quiet(pack.replace_tables(tables))
        self.assertEqual(sorted((r["name"], r["value"]) for r in self.store.rows("user_prefs")), [("lang", "en"), ("width", "320")])

    def test_many_rows_go_in_batches(self) -> None:
        tables = {"users": [{"id": f"00000000-0000-0000-0000-{i:012d}", "name": f"人{i}"} for i in range(1200)]}
        with mock.patch.object(pack, "BATCH", 500):
            quiet(pack.replace_tables(tables))
        self.assertEqual(len(self.store.rows("users")), 1200)
        # 1 行ずつではなく、BATCH 行ずつまとめて送る
        self.assertEqual([n for q, n in self.store.batches if q.startswith("INSERT INTO users")], [500, 500, 200])


class ImportPackCommandTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)
        assets = self.dir / "assets"
        (assets / "products").mkdir(parents=True)
        (assets / "products" / "a.jpg").write_bytes(b"jpg")
        self.tables = {"users": [{"id": U1, "name": "人"}], "products": [{"id": U2, "image_url": "/img/products/a.jpg"}]}
        self.zip = self.dir / "pack.zip"
        with mock.patch.dict("os.environ", {"ASSET_DIR": str(assets)}), self.zip.open("wb") as f:
            pack.write_pack(f, self.tables, datetime(2026, 10, 25, tzinfo=timezone.utc))
        self.images = self.dir / "images"
        self.replace = mock.AsyncMock()
        self.add = mock.AsyncMock()
        self.migrate = mock.AsyncMock()
        for p in (mock.patch.object(pack, "replace_tables", self.replace), mock.patch.object(pack, "add_tables", self.add),
                  mock.patch.object(cli, "migrate", self.migrate)):
            p.start()
            self.addCleanup(p.stop)

    def test_without_yes_changes_nothing(self) -> None:
        for add in (False, True):
            quiet(cli.import_pack(self.zip, self.images, yes=False, add=add))
        self.replace.assert_not_awaited()
        self.add.assert_not_awaited()
        self.migrate.assert_not_awaited()
        self.assertFalse(self.images.exists())

    def test_yes_replaces_and_places_files(self) -> None:
        quiet(cli.import_pack(self.zip, self.images, yes=True))
        self.migrate.assert_awaited_once()
        self.assertEqual(self.replace.await_args.args[0]["users"][0]["id"], U1)
        self.assertEqual((self.images / "products" / "a.jpg").read_bytes(), b"jpg")

    def test_add_keeps_existing_files(self) -> None:
        (self.images / "products").mkdir(parents=True)
        (self.images / "products" / "a.jpg").write_bytes(b"mine")
        quiet(cli.import_pack(self.zip, self.images, yes=True, add=True))
        self.add.assert_awaited_once()
        self.replace.assert_not_awaited()
        self.assertEqual((self.images / "products" / "a.jpg").read_bytes(), b"mine")

    def test_command_line_passes_flags(self) -> None:
        run = mock.AsyncMock()
        with mock.patch.object(cli, "import_pack", run), mock.patch.object(sys, "argv", ["ccp.cli", "import-pack", str(self.zip)]):
            cli.main()
        self.assertEqual(run.await_args.args, (self.zip, cli.DEFAULT_IMAGES, False, False))
        with mock.patch.object(cli, "import_pack", run), \
                mock.patch.object(sys, "argv", ["ccp.cli", "import-pack", str(self.zip), "--images", str(self.images), "--add", "--yes"]):
            cli.main()
        self.assertEqual(run.await_args.args, (self.zip, self.images, True, True))


if __name__ == "__main__":
    unittest.main()
