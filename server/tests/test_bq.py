"""bq.py(BigQuery の出力の確かめ)の単体テスト。BigQuery には接続しない(クライアントは偽物)。

  cd server && python -m unittest discover tests
"""
from __future__ import annotations

import os
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ccp import bq  # noqa: E402

SPU = next(o for o in bq.OUTPUTS if o.name == "spu")
STOCK = next(o for o in bq.OUTPUTS if o.name == "sku_stock")
WHEN = datetime(2026, 10, 17, 9, 30, tzinfo=timezone.utc)


def table(kind: str, columns: list[str], rows: int | None = 10) -> SimpleNamespace:
    return SimpleNamespace(table_type=kind, modified=WHEN, num_rows=rows, schema=[SimpleNamespace(name=c) for c in columns])


class FakeClient:
    """get_table と query だけを持つ、BigQuery のクライアントの身代わり"""

    def __init__(self, tables: dict[str, SimpleNamespace], query_error: Exception | None = None) -> None:
        self.tables = tables
        self.query_error = query_error
        self.queries: list[str] = []

    def get_table(self, where: str) -> SimpleNamespace:
        if where not in self.tables:
            raise LookupError(f"Not found: {where}")
        return self.tables[where]

    def query(self, sql: str, job_config: object = None) -> None:
        self.queries.append(sql)
        if self.query_error:
            raise self.query_error


class LocationTest(unittest.TestCase):
    def test_configured_reads_env_and_strips_backquotes(self) -> None:
        with mock.patch.dict(os.environ, {"BQ_SPU": " `p.d.spu` ", "BQ_SKU": ""}, clear=False):
            self.assertEqual(bq.location(SPU), "p.d.spu")
            names = [o.name for o in bq.configured()]
            self.assertIn("spu", names)
            self.assertNotIn("sku", names)

    def test_job_project_prefers_bq_project(self) -> None:
        with mock.patch.dict(os.environ, {"BQ_PROJECT": "jobs", "GOOGLE_CLOUD_PROJECT": "ai"}):
            self.assertEqual(bq.job_project(), "jobs")
        with mock.patch.dict(os.environ, {"GOOGLE_CLOUD_PROJECT": "ai"}):
            os.environ.pop("BQ_PROJECT", None)
            self.assertEqual(bq.job_project(), "ai")


class CompareColumnsTest(unittest.TestCase):
    def test_case_insensitive_and_split_required_optional(self) -> None:
        missing, optional = bq.compare_columns(STOCK, ["MARKET", "sku_code", "Stock"])
        self.assertEqual(missing, ["as_of"])
        self.assertEqual(optional, [])
        missing, optional = bq.compare_columns(SPU, ["market", "product_code", "name", "as_of", "rating"])
        self.assertEqual(missing, [])
        self.assertIn("lift_hot", optional)
        self.assertNotIn("rating", optional)


class InspectTest(unittest.TestCase):
    def test_table_with_all_columns_is_ok(self) -> None:
        fake = FakeClient({"p.d.stock": table("TABLE", ["market", "sku_code", "stock", "as_of"], rows=420)})
        with mock.patch.dict(os.environ, {"BQ_SKU_STOCK": "p.d.stock"}):
            r = bq.inspect(STOCK, fake)
        self.assertTrue(r.ok)
        self.assertEqual((r.kind, r.rows, r.modified), ("TABLE", 420, WHEN))
        self.assertEqual(fake.queries, [])  # テーブルなら、問い合わせの試しはしない

    def test_missing_required_column_is_ng(self) -> None:
        fake = FakeClient({"p.d.stock": table("TABLE", ["market", "sku_code", "as_of"])})
        with mock.patch.dict(os.environ, {"BQ_SKU_STOCK": "p.d.stock"}):
            r = bq.inspect(STOCK, fake)
        self.assertFalse(r.ok)
        self.assertEqual(r.missing, ["stock"])

    def test_not_found_is_reported(self) -> None:
        with mock.patch.dict(os.environ, {"BQ_SKU_STOCK": "p.d.none"}):
            r = bq.inspect(STOCK, FakeClient({}))
        self.assertFalse(r.ok)
        self.assertIn("Not found", r.error)

    def test_view_uses_watch_table_and_dry_run(self) -> None:
        later = datetime(2026, 10, 17, 10, 0, tzinfo=timezone.utc)
        fake = FakeClient({
            "p.d.stock_v": table("VIEW", ["market", "sku_code", "stock", "as_of"], rows=None),
            "p.raw.stock": SimpleNamespace(table_type="TABLE", modified=later, num_rows=9, schema=[]),
        })
        with mock.patch.dict(os.environ, {"BQ_SKU_STOCK": "p.d.stock_v", "BQ_SKU_STOCK_WATCH": "p.raw.stock"}):
            r = bq.inspect(STOCK, fake)
        self.assertTrue(r.ok, r.notes)
        self.assertEqual(r.modified, later)  # 更新は、元のテーブルで見る
        self.assertEqual(len(fake.queries), 1)
        self.assertIn("FROM `p.d.stock_v`", fake.queries[0])

    def test_view_without_watch_warns_and_failed_dry_run_is_ng(self) -> None:
        fake = FakeClient({"p.d.stock_v": table("VIEW", ["market", "sku_code", "stock", "as_of"])}, query_error=PermissionError("jobs.create denied"))
        with mock.patch.dict(os.environ, {"BQ_SKU_STOCK": "p.d.stock_v"}):
            os.environ.pop("BQ_SKU_STOCK_WATCH", None)
            r = bq.inspect(STOCK, fake)
        self.assertFalse(r.ok)
        self.assertTrue(any("_WATCH" in n for n in r.notes))
        self.assertTrue(any("jobs.create denied" in n for n in r.notes))


if __name__ == "__main__":
    unittest.main()
