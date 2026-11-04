"""見本のデータ(server/seed.json)は、人が明示したときだけ入り、入ったままで取り込みが止まったら、理由と消し方が出る"""
from __future__ import annotations

import asyncio
import io
import re
import unittest
from contextlib import asynccontextmanager, redirect_stdout
from unittest import mock

from ccp import appsettings, bq, cli, seeddata
from ccp import schema as sc
from ccp.bq_import import spu_mismatch

SEED_CODES = sorted(seeddata.product_codes())


class SpuHintTest(unittest.TestCase):
    def test_sample_products_are_named_with_the_way_out(self):
        why = spu_mismatch([{"product_code": "REAL-1"}], [{"product_code": c} for c in SEED_CODES])
        self.assertIn("見本の商品", why or "")
        self.assertIn("remove-seed", why or "")

    def test_other_mismatch_has_no_sample_hint(self):
        why = spu_mismatch([{"product_code": "REAL-1"}], [{"product_code": c} for c in ("X1", "X2", "X3")])
        self.assertIsNotNone(why)
        self.assertNotIn("見本", why or "")


class SeedGuardTest(unittest.TestCase):
    def run_seed(self, configured: bool, with_bq: bool) -> tuple[str, bool]:
        """seed を流し、出力と、DB につないだか(= 入れ始めたか)を返す"""
        touched = []

        @asynccontextmanager
        async def conn(write: bool = True):
            touched.append(write)
            raise RuntimeError("DB には行かない")
            yield  # noqa: unreachable

        async def nothing():
            return None

        buf = io.StringIO()
        with mock.patch.object(appsettings, "ensure_cli", nothing), mock.patch.object(bq, "configured", lambda: ["spu"] if configured else []), \
                mock.patch.object(cli, "cli_conn", conn), redirect_stdout(buf):
            try:
                asyncio.run(cli.seed(False, with_bq))
            except (SystemExit, RuntimeError):
                pass
        return buf.getvalue(), bool(touched)

    def test_stops_when_bigquery_is_set(self):
        out, touched = self.run_seed(configured=True, with_bq=False)
        self.assertFalse(touched)
        self.assertIn("--with-bq", out)

    def test_runs_without_bigquery_or_when_told(self):
        self.assertTrue(self.run_seed(configured=False, with_bq=False)[1])
        self.assertTrue(self.run_seed(configured=True, with_bq=True)[1])


class FakeConn:
    """remove-seed が流す 3 つの形(見本の行を数える・見本でない行の参照を数える・消す)だけを、メモリの表で答える"""

    def __init__(self, rows: dict[str, list[dict]]) -> None:
        self.rows = rows
        self.deleted: list[str] = []

    async def execute(self, stmt, params):
        q = str(stmt)
        if m := re.fullmatch(r"SELECT count\(\*\) FROM (\w+) WHERE id = ANY\(:ids\)", q):
            n = sum(1 for r in self.rows.get(m.group(1), []) if r["id"] in params["ids"])
        elif m := re.fullmatch(r"SELECT count\(\*\) FROM (\w+) WHERE (\w+) = ANY\(:ref\) AND NOT \(id = ANY\(:own\)\)", q):
            n = sum(1 for r in self.rows.get(m.group(1), []) if r.get(m.group(2)) in params["ref"] and r["id"] not in params["own"])
        elif m := re.fullmatch(r"DELETE FROM (\w+) WHERE id = ANY\(:ids\)", q):
            self.deleted.append(m.group(1))
            self.rows[m.group(1)] = [r for r in self.rows.get(m.group(1), []) if r["id"] not in params["ids"]]
            return None
        else:
            raise AssertionError(f"知らない文: {q}")
        return mock.Mock(scalar_one=lambda: n)


def seed_row(table: str, i: int = 0) -> dict:
    return {"id": sc.coerce("uuid", seeddata.load()[table][i]["id"])}


class RemoveSeedTest(unittest.TestCase):
    def run_remove(self, rows: dict[str, list[dict]], yes: bool) -> tuple[str, FakeConn, bool]:
        fake = FakeConn(rows)

        @asynccontextmanager
        async def conn(write: bool = True):
            yield fake

        buf = io.StringIO()
        stopped = False
        with mock.patch.object(cli, "cli_conn", conn), redirect_stdout(buf):
            try:
                asyncio.run(cli.remove_seed(yes))
            except SystemExit:
                stopped = True
        return buf.getvalue(), fake, stopped

    def test_counts_only_without_yes(self):
        out, fake, _ = self.run_remove({"products": [seed_row("products"), {"id": "real"}]}, yes=False)
        self.assertIn("products: 1 件", out)
        self.assertIn("--yes", out)
        self.assertEqual(fake.deleted, [])

    def test_removes_only_seed_rows(self):
        p = seed_row("products")
        dp = {**seed_row("delivery_products"), "product_id": p["id"]}
        out, fake, _ = self.run_remove({"products": [p, {"id": "real"}], "delivery_products": [dp]}, yes=True)
        self.assertEqual(fake.rows["products"], [{"id": "real"}])
        self.assertEqual(fake.rows["delivery_products"], [])
        # 参照する側を先に消す
        self.assertLess(fake.deleted.index("delivery_products"), fake.deleted.index("products"))
        self.assertIn("消しました", out)

    def test_stops_when_real_rows_use_samples(self):
        p = seed_row("products")
        out, fake, stopped = self.run_remove({"products": [p], "delivery_products": [{"id": "real-dp", "product_id": p["id"]}]}, yes=True)
        self.assertTrue(stopped)
        self.assertEqual(fake.deleted, [])
        self.assertIn("delivery_products.product_id: 1 件", out)

    def test_nothing_to_remove(self):
        out, fake, _ = self.run_remove({"products": [{"id": "real"}]}, yes=True)
        self.assertIn("見本の行はありません", out)
        self.assertEqual(fake.deleted, [])


if __name__ == "__main__":
    unittest.main()
