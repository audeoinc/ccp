"""パックの「足すだけ」の取り込み(server/ccp/pack.py の add_tables。X58)。DB の代わりに、メモリ上の偽の接続で確かめる"""
import asyncio
import unittest
import uuid
from unittest import mock

from ccp import pack


class FakeResult:
    def __init__(self, rows=None, rowcount=0):
        self._rows = rows or []
        self.rowcount = rowcount

    def all(self):
        return self._rows


class Nested:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


class FakeConn:
    """表ごとの id の集合を持つ。参照先(delivery_card_id)がない行は、外部キーの違反として失敗させる"""

    def __init__(self, ids):
        self.ids = ids
        self.inserted = []

    def begin_nested(self):
        return Nested()

    async def execute(self, stmt, values=None):
        sql = str(stmt)
        if sql.startswith("SELECT id FROM "):
            table = sql.split("FROM ", 1)[1].strip()
            return FakeResult([(i,) for i in self.ids.get(table, set())])
        table = sql.split("INSERT INTO ", 1)[1].split(" ", 1)[0]
        card = values.get("delivery_card_id")
        if card is not None and str(card) not in self.ids.get("delivery_cards", set()):
            raise RuntimeError("foreign key violation")
        self.ids.setdefault(table, set()).add(str(values["id"]))
        self.inserted.append((table, str(values["id"])))
        return FakeResult(rowcount=1)


class FakeBegin:
    def __init__(self, conn):
        self.conn = conn

    async def __aenter__(self):
        return self.conn

    async def __aexit__(self, *a):
        return False


class FakeEngine:
    def __init__(self, conn):
        self.conn = conn

    def begin(self):
        return FakeBegin(self.conn)


def uid():
    return str(uuid.uuid4())


class AddTablesTest(unittest.TestCase):
    def test_adds_only_missing_rows_and_keeps_existing(self):
        card_old, card_new, asset_new, asset_orphan = uid(), uid(), uid(), uid()
        conn = FakeConn({"delivery_cards": {card_old}})
        tables = {
            "delivery_cards": [{"id": card_old, "name": "Workbench で直した配信"}, {"id": card_new, "name": "本番で作った見本"}],
            "card_assets": [
                {"id": asset_new, "name": "mood.png", "delivery_card_id": card_new},
                # 参照先の配信が、パックにも取り込み先にもない行は、足さずに進める
                {"id": asset_orphan, "name": "lost.png", "delivery_card_id": uid()},
            ],
        }
        with mock.patch("ccp.db.get_engine", mock.AsyncMock(return_value=FakeEngine(conn))):
            out = asyncio.run(pack.add_tables(tables))
        self.assertEqual(out["delivery_cards"], (1, 1, 0))
        self.assertEqual(out["card_assets"], (1, 0, 1))
        self.assertIn(("delivery_cards", card_new), conn.inserted)
        self.assertNotIn(("delivery_cards", card_old), conn.inserted)  # すでにある行は、変えない


class CliAddTest(unittest.TestCase):
    def test_add_does_not_overwrite_existing_files(self):
        import tempfile
        import zipfile
        import json
        from pathlib import Path
        from ccp import cli

        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            images = root / "images"
            (images / "creative").mkdir(parents=True)
            (images / "creative" / "keep.png").write_bytes(b"workbench")
            z = root / "p.zip"
            with zipfile.ZipFile(z, "w") as f:
                f.writestr("data.json", json.dumps({"version": 2, "tables": {}}))
                f.writestr("images/creative/keep.png", b"production")
                f.writestr("images/creative/new.png", b"new")
            with mock.patch.object(cli, "migrate", mock.AsyncMock()), mock.patch("ccp.pack.add_tables", mock.AsyncMock(return_value={})):
                asyncio.run(cli.import_pack(z, images, yes=True, add=True))
            self.assertEqual((images / "creative" / "keep.png").read_bytes(), b"workbench")
            self.assertEqual((images / "creative" / "new.png").read_bytes(), b"new")


if __name__ == "__main__":
    unittest.main()
