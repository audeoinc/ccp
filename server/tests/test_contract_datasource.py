"""データの入口の契約テスト(docs/ARCHITECTURE.md の 0.5 章): 同じテスト(Contract)を、アダプターごとの組み立てで流す。

偽物の入口(FakeSource)は、「BigQuery がなくても、取り込みの側が動くか」を確かめるため。
BigQuery は本物を呼ばず、bq.py が使う get_table・query だけをメモリの偽物にする。
アダプター(Databricks など)を足したら、ここに組み立てを 1 つ足す。
"""
from __future__ import annotations

import asyncio
import re
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any
from unittest import mock

from ccp import bq, bq_import, bq_validate, datasource

T1 = datetime(2026, 11, 1, tzinfo=timezone.utc)
T2 = datetime(2026, 11, 2, tzinfo=timezone.utc)
# 場所 → (種類, 最終更新, 列, 行)
TABLES: dict[str, tuple[str, datetime | None, list[str], list[dict[str, Any]]]] = {
    "p.d.table": ("TABLE", T1, ["market", "Sku_Code", "stock"], [{"market": "US", "Sku_Code": "A", "stock": 1}, {"market": "JP", "Sku_Code": "B", "stock": 2}]),
    "p.d.view": ("VIEW", T1, ["market"], [{"market": "US"}]),
    "p.d.source": ("TABLE", T2, ["market"], []),
    "p.d.empty": ("TABLE", T1, ["market"], []),
}


class FakeSource:
    """偽物の入口: 契約を満たす、いちばん小さいアダプター"""

    def _t(self, where: str) -> tuple[str, datetime | None, list[str], list[dict[str, Any]]]:
        if where not in TABLES:
            raise LookupError(where)
        return TABLES[where]

    def columns(self, where: str) -> list[str]:
        return list(self._t(where)[2])

    def last_updated(self, where: str, watch: str | None = None) -> datetime | None:
        kind, modified, *_ = self._t(where)
        if kind == "TABLE":
            return modified
        return self._t(watch)[1] if watch else None

    def read_rows(self, where: str, columns: list[str]) -> list[dict[str, Any]]:
        return [{c.lower(): r[c] for c in columns} for r in self._t(where)[3]]


class FakeBigQueryClient:
    """bq.BigQuerySource が使う所だけ"""

    def get_table(self, where: str) -> Any:
        if where not in TABLES:
            raise LookupError(where)
        kind, modified, cols, _rows = TABLES[where]
        return SimpleNamespace(table_type=kind, modified=modified, schema=[SimpleNamespace(name=c) for c in cols])

    def query(self, sql: str) -> Any:
        m = re.fullmatch(r"SELECT (.+) FROM `(.+)`", sql)
        assert m, sql
        cols = [c.strip().strip("`") for c in m.group(1).split(",")]
        rows = [{c: r[c] for c in cols} for r in TABLES[m.group(2)][3]]
        return SimpleNamespace(result=lambda: rows)


class Contract:
    def source(self) -> datasource.DataSource:
        raise NotImplementedError

    def test_columns(self) -> None:
        self.assertEqual(self.source().columns("p.d.table"), ["market", "Sku_Code", "stock"])

    def test_read_only_the_asked_columns_with_lower_names(self) -> None:
        self.assertEqual(self.source().read_rows("p.d.table", ["market", "Sku_Code"]), [{"market": "US", "sku_code": "A"}, {"market": "JP", "sku_code": "B"}])

    def test_empty_table_is_no_rows(self) -> None:
        self.assertEqual(self.source().read_rows("p.d.empty", ["market"]), [])

    def test_table_last_updated(self) -> None:
        self.assertEqual(self.source().last_updated("p.d.table"), T1)

    def test_table_ignores_watch(self) -> None:
        self.assertEqual(self.source().last_updated("p.d.table", "p.d.source"), T1)

    def test_view_uses_the_watched_table(self) -> None:
        self.assertEqual(self.source().last_updated("p.d.view", "p.d.source"), T2)

    def test_view_without_watch_is_unknown(self) -> None:
        self.assertIsNone(self.source().last_updated("p.d.view"))

    def test_missing_raises(self) -> None:
        for call in (lambda s: s.columns("p.d.none"), lambda s: s.last_updated("p.d.none"), lambda s: s.read_rows("p.d.none", ["x"])):
            with self.assertRaises(Exception):
                call(self.source())


class FakeSourceContract(Contract, unittest.TestCase):
    def source(self) -> datasource.DataSource:
        return FakeSource()


class BigQueryContract(Contract, unittest.TestCase):
    def source(self) -> datasource.DataSource:
        return bq.BigQuerySource(FakeBigQueryClient())


class ImportSideTest(unittest.TestCase):
    """取り込みの側は、入口の形だけを使う(BigQuery がなくても動く)"""

    OUTPUT = bq.Output("sku_stock", "BQ_SKU_STOCK", "SKU の在庫", ("market", "sku_code"), ("nothing",))

    def _where(self, where: str, watch: str | None = None) -> Any:
        return (mock.patch.object(bq, "location", return_value=where), mock.patch.object(bq, "watch_location", return_value=watch))

    def test_fetch_reads_the_columns_of_the_spec_that_exist(self) -> None:
        a, b = self._where("p.d.table")
        with a, b:
            # 列の名前の大文字・小文字がちがっても読む。仕様にない列(stock)と、出力にない列(nothing)は読まない
            self.assertEqual(bq_validate.fetch(self.OUTPUT, FakeSource()), [{"market": "US", "sku_code": "A"}, {"market": "JP", "sku_code": "B"}])

    def test_modified_passes_the_watched_table(self) -> None:
        a, b = self._where("p.d.view", "p.d.source")
        with a, b:
            self.assertEqual(bq_import._modified(self.OUTPUT, FakeSource()), T2)

    def test_sync_opens_the_port_not_bigquery(self) -> None:
        a, b = self._where("p.d.table")
        no_bq = mock.patch.object(bq, "client", side_effect=AssertionError("BigQuery を直に呼んだ"))
        with a, b, no_bq, mock.patch.object(datasource, "open", return_value=FakeSource()) as opened, mock.patch.object(bq, "configured", return_value=[self.OUTPUT]), mock.patch.object(bq, "OUTPUTS", (self.OUTPUT,)), mock.patch.object(bq_import, "latest", mock.AsyncMock(return_value={"sku_stock": {"source_modified": T1, "imported_at": T2}})), mock.patch.object(bq_import, "status", mock.AsyncMock(return_value={})):
            out = asyncio.run(bq_import.sync(False, None, "button"))
        opened.assert_called_once()
        self.assertEqual((out["imported"], out["failed"]), ([], []))


if __name__ == "__main__":
    unittest.main()
