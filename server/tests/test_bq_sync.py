"""BigQuery の取り込みの流れ(server/ccp/bq_import.py の sync)。BigQuery と DB には接続しない(偽の DB は tests/fakes.py)。

読む・確かめる・書く、の中身(fetch・validate・_write)は差し替えて、sync が「どれを取り込み、どれを止め、何を記録するか」だけを確かめる。

  cd server && python -m unittest discover tests
"""
from __future__ import annotations

import asyncio
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from ccp import bq, bq_import, bq_validate as bv  # noqa: E402
from fakes import FakeStore, Result, Row  # noqa: E402

MODIFIED = datetime(2026, 10, 25, 3, 0, tzinfo=timezone.utc)
SPU, SKU = (next(o for o in bq.OUTPUTS if o.name == n) for n in ("spu", "sku"))


class SyncTest(unittest.TestCase):
    def setUp(self) -> None:
        self.store = FakeStore()
        self.lock_ok = True
        self.store.statements += [
            (r"^SELECT pg_try_advisory_xact_lock", lambda s, m, p: Result([Row({"got": self.lock_ok})])),
            (r"^DELETE FROM bq_imports WHERE id IN", lambda s, m, p: Result()),
        ]
        self.rows = {"spu": [{"market": "JP", "product_code": f"P{i}", "as_of": MODIFIED} for i in range(20)],
                     "sku": [{"market": "JP", "sku_code": "S1", "product_code": "P1", "as_of": MODIFIED}]}
        self.issues: dict[str, list[bv.Issue]] = {}
        self.prev: dict = {}
        self.write = mock.AsyncMock(return_value="入れ替えた")
        self.sum_stock = mock.AsyncMock()
        patches = [
            self.store.patch("ccp.bq_import"),
            mock.patch.object(bq_import, "_last_check", 0.0),
            mock.patch.object(bq, "configured", return_value=[SPU, SKU]),
            mock.patch.object(bq, "client", return_value=SimpleNamespace()),
            mock.patch.object(bq_import, "_modified", return_value=MODIFIED),
            mock.patch.object(bv, "fetch", side_effect=self.fetch),
            mock.patch.object(bv, "validate", side_effect=lambda name, rows, ctx, now=None: list(self.issues.get(name, []))),
            mock.patch.object(bq_import, "latest", mock.AsyncMock(side_effect=lambda: self.prev)),
            mock.patch.object(bq_import, "status", mock.AsyncMock(return_value={"outputs": []})),
            mock.patch.object(bq_import, "_db_context", mock.AsyncMock(return_value=[])),
            mock.patch.object(bq_import, "_write", self.write),
            mock.patch.object(bq_import, "_sum_stock", self.sum_stock),
        ]
        for p in patches:
            p.__enter__()
            self.addCleanup(p.__exit__, None, None, None)

    def fetch(self, o, client):  # noqa: ANN001, ANN201
        got = self.rows[o.name]
        if isinstance(got, Exception):
            raise got
        return got

    def sync(self, force: bool = True) -> dict:
        return asyncio.run(bq_import.sync(force))

    def records(self) -> dict[str, str]:
        return {r["source"]: r["status"] for r in self.store.rows("bq_imports")}

    def test_imports_good_and_stops_ng(self) -> None:
        self.issues["sku"] = [bv.Issue(bv.NG, "sku", "キーが重なっています")]
        r = self.sync()
        self.assertEqual([i["name"] for i in r["imported"]], ["spu"])
        self.assertEqual([f["name"] for f in r["failed"]], ["sku"])
        self.assertIn("キーが重なっています", r["failed"][0]["message"])
        self.assertEqual([c.args[1] for c in self.write.await_args_list], ["spu"])
        # SKU を取り込まないので、在庫の合計は直さない
        self.sum_stock.assert_not_awaited()
        self.assertEqual(self.records(), {"spu": "ok", "sku": "error"})

    def test_busy_writes_nothing(self) -> None:
        self.lock_ok = False
        r = self.sync()
        self.assertEqual(r["skipped"], "busy")
        self.write.assert_not_awaited()
        self.assertEqual(self.store.rows("bq_imports"), [])

    def test_rows_halved_is_stopped(self) -> None:
        self.prev = {"spu": {"last_ok": {"row_count": 100}}}
        r = self.sync()
        self.assertIn("spu", [f["name"] for f in r["failed"]])
        self.assertIn("半分を切りました", next(f["message"] for f in r["failed"] if f["name"] == "spu"))
        self.assertNotIn("spu", [c.args[1] for c in self.write.await_args_list])

    def test_read_failure_does_not_stop_others(self) -> None:
        self.rows["spu"] = RuntimeError("権限がありません")
        r = self.sync()
        self.assertEqual([i["name"] for i in r["imported"]], ["sku"])
        self.assertIn("BigQuery を読めません", r["failed"][0]["message"])
        self.sum_stock.assert_awaited()
        self.assertEqual(self.records(), {"sku": "ok", "spu": "error"})

    def test_unchanged_outputs_are_not_read(self) -> None:
        self.prev = {o: {"source_modified": MODIFIED, "last_ok": {"row_count": 1}} for o in ("spu", "sku")}
        with mock.patch.object(bq_import, "changed", return_value=False):
            r = self.sync(force=False)
        self.assertEqual((r["imported"], r["failed"]), ([], []))
        self.write.assert_not_awaited()

    def test_recent_check_is_skipped_without_force(self) -> None:
        self.sync()
        r = self.sync(force=False)
        self.assertEqual(r["skipped"], "recent")


if __name__ == "__main__":
    unittest.main()
