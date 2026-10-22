"""devtools.py(開発用の画面の API)の単体テスト。BigQuery には接続しない。

  cd server && python -m unittest discover tests
"""
from __future__ import annotations

import sys
import unittest
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ccp import devtools  # noqa: E402


class EnabledTest(unittest.TestCase):
    def test_hidden_unless_enabled(self) -> None:
        with mock.patch.dict("os.environ", {"CCP_DEVTOOLS": ""}):
            self.assertTrue(devtools.blocks("/dev/"))
            self.assertTrue(devtools.blocks("/dev"))
            self.assertTrue(devtools.blocks("/api/dev/status"))
            # CCP の画面・API は隠さない(/devices のような、たまたま dev で始まる名前も)
            self.assertFalse(devtools.blocks("/"))
            self.assertFalse(devtools.blocks("/api/data/products"))
            self.assertFalse(devtools.blocks("/devices"))
        with mock.patch.dict("os.environ", {"CCP_DEVTOOLS": "1"}):
            self.assertFalse(devtools.blocks("/dev/"))
            self.assertFalse(devtools.blocks("/api/dev/status"))


class OnlySelectTest(unittest.TestCase):
    def test_select_only(self) -> None:
        self.assertIsNone(devtools.only_select("SELECT"))
        for st in ("CREATE_TABLE_AS_SELECT", "INSERT", "DELETE", "SCRIPT", "DROP_TABLE"):
            self.assertIsNotNone(devtools.only_select(st), st)
        self.assertIsNotNone(devtools.only_select(None))


class PlainTest(unittest.TestCase):
    def test_values(self) -> None:
        row = {
            "ts": datetime(2026, 10, 22, 9, 0, tzinfo=timezone.utc),
            "d": date(2026, 10, 19),
            "n": Decimal("12345678901234567890.12"),
            "b": b"\x00\x01",
            "arr": [Decimal("1.5"), None],
            "rec": {"x": date(2026, 1, 1)},
        }
        out = devtools.plain(row)
        self.assertEqual(out["ts"], "2026-10-22T09:00:00+00:00")
        self.assertEqual(out["d"], "2026-10-19")
        # 桁を落とさない(float にすると丸まる)
        self.assertEqual(out["n"], "12345678901234567890.12")
        self.assertEqual(out["b"], "AAE=")
        self.assertEqual(out["arr"], ["1.5", None])
        self.assertEqual(out["rec"], {"x": "2026-01-01"})


class FlattenTest(unittest.TestCase):
    def test_nested(self) -> None:
        f = lambda name, t, sub=None, mode="NULLABLE": SimpleNamespace(name=name, field_type=t, mode=mode, description="", fields=sub or [])  # noqa: E731
        cols = devtools.flatten_fields([f("id", "STRING", mode="REQUIRED"), f("item", "RECORD", [f("color", "STRING"), f("size", "STRING")], "REPEATED")])
        self.assertEqual([c["name"] for c in cols], ["id", "item", "item.color", "item.size"])
        self.assertEqual(cols[1]["mode"], "REPEATED")


class ChatTest(unittest.TestCase):
    def test_chapters(self) -> None:
        md = "# 題\n\n## 1. 全体\nA\n\n---\n\n## 2. SPU\nB\n\n## 3. SKU\nC\n"
        self.assertEqual(devtools.chapters(md, (1, 3)), "## 1. 全体\nA\n\n## 3. SKU\nC")

    def test_parse_reply(self) -> None:
        self.assertEqual(devtools.parse_reply('{"reply": "直しました", "sql": " SELECT 1 ", "questions": ["q", ""]}'), {"reply": "直しました", "sqls": [{"title": "", "sql": "SELECT 1"}], "questions": ["q"]})
        # JSON が崩れていても、本文を返事として見せる
        self.assertEqual(devtools.parse_reply("ただの文")["reply"], "ただの文")

    def test_private_columns(self) -> None:
        for name in ("customer_name", "item_nm", "email", "tel_no", "review_text", "氏名"):
            self.assertTrue(devtools.PRIVATE.search(name), name)
        for name in ("sku_cd", "qty", "sales_date", "price"):
            self.assertFalse(devtools.PRIVATE.search(name), name)

    def test_context_has_spec_and_sql(self) -> None:
        body = devtools.ChatIn(output="sku", sql="SELECT 1", last="BadRequest: x", notes="まとめ")
        c = devtools.build_context(body, None)
        self.assertIn("## 3. SKU", c)
        self.assertIn("## 1. 全体のルール", c)
        self.assertIn("SELECT 1", c)
        self.assertIn("まとめ", c)


class ToolTest(unittest.TestCase):
    def client(self) -> SimpleNamespace:
        tables = [SimpleNamespace(project="p", dataset_id="a", table_id=n, table_type="TABLE") for n in ("m_ctlg_item", "CTLG_price", "t_sales")]
        return SimpleNamespace(project="p", list_tables=lambda ds: tables if ds == "p.a" else [],
                               query=lambda sql, job_config=None: SimpleNamespace(statement_type="DELETE", total_bytes_processed=0, schema=[]))

    def test_list_tables_by_part_of_name(self) -> None:
        out, step = devtools.run_tool(self.client(), "list_tables", {"dataset": "a", "name_contains": "ctlg"}, devtools.ChatIn())
        self.assertEqual([t["table"] for t in out["tables"]], ["p.a.m_ctlg_item", "p.a.CTLG_price"])
        self.assertIn("2 件", step)

    def test_run_select_only(self) -> None:
        out, _ = devtools.run_tool(self.client(), "run_select", {"sql": "DELETE FROM x WHERE true"}, devtools.ChatIn())
        self.assertIn("SELECT ではない", out["error"])
        out, _ = devtools.run_tool(self.client(), "run_select", {"sql": "SELECT 1"}, devtools.ChatIn(allow_run=False))
        self.assertIn("止めて", out["error"])

    def test_tools_declared(self) -> None:
        names = [f.name for f in devtools.tool_declarations()[0].function_declarations]
        self.assertEqual(names, ["list_datasets", "list_tables", "describe_table", "describe_view_sources", "dry_run", "run_select"])

    def test_view_sources(self) -> None:
        refs = [SimpleNamespace(project="p", dataset_id="v", table_id="vw"), SimpleNamespace(project="p", dataset_id="raw", table_id="item"),
                SimpleNamespace(project="p", dataset_id="raw", table_id="item"), SimpleNamespace(project="p", dataset_id="raw", table_id="price")]
        c = SimpleNamespace(query=lambda sql, job_config=None: SimpleNamespace(referenced_tables=refs))
        # ビュー自身と重なりは除く
        self.assertEqual(devtools.view_sources(c, "p.v.vw"), ["p.raw.item", "p.raw.price"])

    def test_referenced_views(self) -> None:
        # ジョブの記録には元の表だけ。SQL に書いたビューは、名前から見つける
        job = SimpleNamespace(referenced_tables=[SimpleNamespace(project="p", dataset_id="raw", table_id="item")])
        kinds = {"p.mart.v_item": "VIEW", "p.raw.item": "TABLE"}

        def get_table(name: str) -> SimpleNamespace:
            if name not in kinds:
                raise KeyError(name)
            pr, ds, t = name.split(".")
            return SimpleNamespace(project=pr, dataset_id=ds, table_id=t, table_type=kinds[name])

        c = SimpleNamespace(get_table=get_table)
        r = devtools.referenced(c, "SELECT a.x FROM `p.mart.v_item` a JOIN p.raw.item b ON a.id = b.id", job)
        self.assertEqual(r, {"tables": ["p.raw.item"], "views": ["p.mart.v_item"]})

    def test_weight_and_cost(self) -> None:
        self.assertEqual(devtools.weight(50 * 1024**2, 2000), "軽い")
        self.assertEqual(devtools.weight(5 * 1024**3, None), "ふつう")
        self.assertEqual(devtools.weight(200 * 1024**3, None), "重い")
        self.assertAlmostEqual(devtools.cost_usd(1024**4), 6.25)

    def test_parse_fenced(self) -> None:
        r = devtools.parse_reply('調べました。\n```json\n{"reply": "a", "sql": "SELECT 1"}\n```')
        self.assertEqual((r["reply"], r["sqls"][0]["sql"]), ("a", "SELECT 1"))

    def test_parse_many_sqls(self) -> None:
        r = devtools.parse_reply('{"reply": "2 つ", "sqls": [{"title": "値の確かめ", "sql": "SELECT DISTINCT a FROM t"}, {"title": "本番", "sql": "SELECT a FROM t"}, {"title": "空", "sql": ""}]}')
        self.assertEqual([x["title"] for x in r["sqls"]], ["値の確かめ", "本番"])

    def test_pro_of(self) -> None:
        self.assertEqual(devtools.pro_of("gemini-3.8-flash"), "gemini-3.8-pro")
        self.assertEqual(devtools.pro_of("gemini-3.5-flash-lite"), "gemini-3.5-pro")
        self.assertIsNone(devtools.pro_of("gemini-3.8-pro"))

    def test_pick_models(self) -> None:
        names = ["publishers/google/models/gemini-3.5-flash", "publishers/google/models/gemini-3.5-pro", "publishers/google/models/gemini-3.8-pro-preview",
                 "publishers/google/models/gemini-3.8-pro", "publishers/google/models/gemini-3.5-flash-image", "publishers/google/models/text-embedding-005",
                 "publishers/google/models/gemini-3.5-flash-lite"]
        self.assertEqual(devtools.pick_models(names), ["gemini-3.8-pro", "gemini-3.8-pro-preview", "gemini-3.5-pro", "gemini-3.5-flash"])


if __name__ == "__main__":
    unittest.main()
