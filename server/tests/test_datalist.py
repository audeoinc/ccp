"""取り込んだデータの一覧(server/ccp/datalist.py。X105)。SQL そのものは、手元の PostgreSQL(PGlite)で通して確かめた(記録はアーカイブ)。
ここでは、検索のならし方・どの出力も読めること・見本を消す窓口の決まりを確かめる"""
from __future__ import annotations

import asyncio
import json
import re
import unittest
from contextlib import asynccontextmanager
from unittest import mock

from ccp import datalist, seeddata
from ccp import schema as sc
from ccp.bq_import import DEST


class TermsTest(unittest.TestCase):
    def test_same_form_as_the_sql_side(self):
        # 画面の fuzzySearch.ts と同じ: 大文字・全角・カタカナ・区切りをならす。空白で語を分ける
        self.assertEqual(datalist.terms_of("ＲＥＡＬ-001  ダッフル"), ["real001", "だっふる"])
        self.assertEqual(datalist.terms_of("  "), [])
        self.assertEqual(datalist.terms_of(None), [])

    def test_translate_table_is_paired(self):
        # 対のない文字は translate で消える。消してよいのは、後ろに置いた記号だけ
        self.assertEqual(len(datalist._KATA) + len(datalist._FULL), len(datalist._TO))
        self.assertEqual(datalist._FROM.translate(str.maketrans(datalist._FROM[: len(datalist._TO)], datalist._TO))[len(datalist._TO) :], datalist._SKIP)


class ColumnsTest(unittest.TestCase):
    def test_every_output_has_sql_and_columns(self):
        for name, table in DEST.items():
            self.assertIn(name, datalist.ORDER)
            self.assertIn(name, datalist.SAMPLE_SQL)
            names = [c.pg for c in datalist.columns_of(name)]
            self.assertEqual(set(names), {c.pg for c in sc.load().table(table).columns} - datalist.HIDDEN)
            self.assertIn("market", names)

    def test_products_start_with_what_people_check(self):
        self.assertEqual([c.pg for c in datalist.columns_of("spu")][:4], ["product_code", "name", "market", "page_url"])

    def test_search_uses_only_text_and_date_columns(self):
        where, params = datalist.where_of("weekly", ["p01"])
        self.assertIn('"week_start"::text', where)
        self.assertNotIn('"units"', where)
        self.assertEqual(params["t0"], "p01")
        self.assertEqual(datalist.where_of("weekly", []), ("", {}))


class FakeConn:
    """read_rows が流す文の形だけを見て、決まった答えを返す"""

    def __init__(self) -> None:
        self.sql: list[tuple[str, dict]] = []

    async def execute(self, stmt, params):
        q = str(stmt)
        self.sql.append((q, params))
        result = mock.Mock()
        if "GROUP BY market" in q:
            result.mappings.return_value.all.return_value = [{"market": "JP", "n": 3, "s": 1}, {"market": None, "n": 2, "s": 0}]
        elif q.startswith("SELECT count(*)"):
            result.scalar_one.return_value = 2
        else:
            result.mappings.return_value.all.return_value = [{"id": "x", "product_code": "P01", "_sample": True}]
        return result


class ReadRowsTest(unittest.TestCase):
    def test_summary_and_paging(self):
        conn = FakeConn()
        out = asyncio.run(datalist.read_rows(conn, "spu", "コート", 200, 100))
        self.assertEqual((out["total"], out["matched"], out["sample"]), (5, 2, 1))
        self.assertEqual(out["byMarket"], [{"market": "JP", "rows": 3}, {"market": "", "rows": 2}])
        self.assertEqual(out["rows"][0]["_sample"], True)
        json.dumps(out)
        q, params = conn.sql[-1]
        # ページ送りで行が抜けないよう、最後に id で並べる
        self.assertRegex(q, r"ORDER BY .*, id LIMIT :limit OFFSET :offset$")
        self.assertEqual((params["limit"], params["offset"], params["t0"]), (100, 200, "こーと"))
        self.assertEqual(set(params["codes"]), seeddata.product_codes())

    def test_forecast_has_no_sample_codes(self):
        conn = FakeConn()
        asyncio.run(datalist.read_rows(conn, "forecast", None, 0, 10))
        self.assertTrue(all("codes" not in p for _, p in conn.sql))
        self.assertEqual(len(conn.sql), 2)  # 検索がなければ、当たった数は数え直さない

    def test_unknown_output(self):
        res = asyncio.run(datalist.list_rows("nothing"))
        self.assertFalse(res["success"])


class SeedApiTest(unittest.TestCase):
    def run_remove(self, survey: dict, denied: str | None = None):
        calls: list[str] = []

        async def admin(request):
            return denied

        async def fake_survey(conn):
            return survey

        async def fake_remove(conn, found):
            calls.append("remove")

        class Conn:
            async def execute(self, stmt, params):
                calls.append(re.sub(r"\s+", " ", str(stmt))[:24])
                self.params = params

        @asynccontextmanager
        async def db(write=False):
            yield Conn()

        request = mock.Mock(headers={"x-ccp-actor": "A"})
        with mock.patch.object(datalist, "_admin", admin), mock.patch.object(datalist, "db", db), \
                mock.patch.object(seeddata, "survey", fake_survey), mock.patch.object(seeddata, "remove", fake_remove):
            res = asyncio.run(datalist.seed_remove(request))
        return res, calls

    def test_only_admins(self):
        res, calls = self.run_remove({"found": {"products": 1}, "used": []}, denied="管理する人だけ")
        self.assertEqual(res["error"]["code"], "forbidden")
        self.assertEqual(calls, [])

    def test_removes_and_leaves_a_record(self):
        res, calls = self.run_remove({"found": {"products": 60}, "used": []})
        self.assertTrue(res["success"])
        self.assertEqual(calls, ["remove", "INSERT INTO bq_imports ("])

    def test_stops_when_real_rows_use_samples(self):
        res, calls = self.run_remove({"found": {"products": 60}, "used": [{"table": "delivery_products", "column": "product_id", "ref": "products", "count": 1}]})
        self.assertFalse(res["success"])
        self.assertEqual(res["error"]["code"], "in_use")
        self.assertEqual(calls, [])

    def test_nothing_to_remove_writes_nothing(self):
        res, calls = self.run_remove({"found": {}, "used": []})
        self.assertTrue(res["success"])
        self.assertEqual(calls, [])


if __name__ == "__main__":
    unittest.main()
