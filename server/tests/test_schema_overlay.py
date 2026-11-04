"""スキーマの重ね読み(docs/AWS_CUSTOMIZE.md の 4 章): 重ねるファイルがなければ今までと同じで、あれば重ねる側を採って注意を出す。
サーバー(schema.py)と npm run verify(scripts/schema-overlay.mjs)が、同じ例で同じ結果になることも確かめる。
重ねるファイルは、開発側のリポジトリには置かない(ここでは一時ファイル)。
"""
from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from typing import Any
from unittest import mock

from ccp import health, schema as sc

ROOT = Path(__file__).resolve().parents[2]
BASE: dict[str, Any] = {
    "tables": {
        "products": {"columns": [["name", "text", {"required": True}], ["category", "choice"], ["old", "text"]], "lookups": []},
        "cards": {"columns": [["title", "text"]], "lookups": [["product_id", "products", {"onDelete": "SET NULL"}]], "unique": [["title"]]},
    },
    "choices": {"products.category": ["a", "b"]},
}
# (名前, 重ねるファイル, 通るか)
CASES: list[tuple[str, Any, bool]] = [
    ("空", {}, True),
    ("注記", {"_comment": "x", "tables": {"products": {"_note": "y"}}}, True),
    ("共通の表に列", {"tables": {"products": {"columns": [["maker", "text", {"index": True}]]}}}, True),
    ("新しい表", {"tables": {"extras": {"columns": [["code", "text"]], "lookups": [["product_id", "products", {"onDelete": "CASCADE"}]], "unique": [["code"]]}}}, True),
    ("足した表どうしの参照", {"tables": {"x1": {"lookups": [["y_id", "x2"]]}, "x2": {"columns": [["c", "text"]]}}}, True),
    ("足した選択肢", {"tables": {"products": {"columns": [["size", "choice"]]}}, "choices": {"products.size": ["s", "m"]}}, True),
    ("同じ定義の列", {"tables": {"products": {"columns": [["name", "text", {"required": True}]]}}}, True),
    ("同じ定義の参照", {"tables": {"cards": {"lookups": [["product_id", "products", {"onDelete": "SET NULL"}]]}}}, True),
    ("足した列を止める", {"tables": {"products": {"retired": ["gone"]}}}, True),
    ("型が違う", {"tables": {"products": {"columns": [["name", "int"]]}}}, True),
    ("指定が違う", {"tables": {"products": {"columns": [["name", "text"]]}}}, True),
    ("いつもある列", {"tables": {"products": {"columns": [["created_on", "date"]]}}}, False),
    ("知らない型", {"tables": {"products": {"columns": [["x", "json"]]}}}, False),
    ("知らない指定", {"tables": {"products": {"columns": [["x", "text", {"default": 1}]]}}}, False),
    ("危ない列の名前", {"tables": {"products": {"columns": [["x; DROP", "text"]]}}}, False),
    ("危ない表の名前", {"tables": {"Bad Table": {"columns": []}}}, False),
    ("列の形", {"tables": {"products": {"columns": ["x"]}}}, False),
    ("参照先がない", {"tables": {"cards": {"lookups": [["z_id", "nothing"]]}}}, False),
    ("参照と列の名前", {"tables": {"cards": {"lookups": [["title", "products"]]}}}, False),
    ("列と参照の名前", {"tables": {"cards": {"columns": [["product_id", "text"]]}}}, False),
    ("参照が違う", {"tables": {"cards": {"lookups": [["product_id", "products"]]}}}, True),
    ("onDelete", {"tables": {"cards": {"lookups": [["z_id", "products", {"onDelete": "RESTRICT"}]]}}}, False),
    ("共通の選択肢", {"choices": {"products.category": ["x"]}}, True),
    ("選択肢なし", {"tables": {"products": {"columns": [["size", "choice"]]}}}, False),
    ("空の選択肢", {"tables": {"products": {"columns": [["size", "choice"]]}}, "choices": {"products.size": []}}, False),
    ("共通の列を止める", {"tables": {"products": {"retired": ["old"]}}}, True),
    ("共通の表に一意", {"tables": {"products": {"unique": [["name"]]}}}, False),
    ("一意の列がない", {"tables": {"extras": {"columns": [["c", "text"]], "unique": [["z"]]}}}, False),
    ("列が配列でない", {"tables": {"products": {"columns": 1}}}, False),
    ("止める列の形", {"tables": {"products": {"retired": [["x"]]}}}, False),
    ("一意の形", {"tables": {"extras": {"columns": [["c", "text"]], "unique": [[["c"]]]}}}, False),
    ("知らない項目", {"views": {}}, False),
    ("表の知らない項目", {"tables": {"products": {"indexes": []}}}, False),
    ("外が配列", [], False),
    ("同じ選択肢", {"choices": {"products.category": ["a", "b"]}}, True),
    ("ない列の選択肢", {"choices": {"products.nothing": ["x"], "nothing": ["x"]}}, True),
    ("選択肢をやめる", {"tables": {"products": {"columns": [["category", "text"]]}}}, True),
    ("選択肢にする", {"tables": {"products": {"columns": [["old", "choice"]]}}, "choices": {"products.old": ["x"]}}, True),
    ("選択肢にするのに値がない", {"tables": {"products": {"columns": [["old", "choice"]]}}}, False),
    ("一意の組の列を止める", {"tables": {"cards": {"retired": ["title"]}}}, True),
    ("共通の選択肢の形", {"choices": {"products.category": "x"}}, False),
]


class MergeTest(unittest.TestCase):
    def test_cases(self) -> None:
        for name, overlay, ok in CASES:
            with self.subTest(name):
                problems = sc.merge_overlay(BASE, overlay)[1]
                self.assertEqual(not problems, ok, problems)

    def test_base_is_not_changed(self) -> None:
        before = json.dumps(BASE)
        sc.merge_overlay(BASE, CASES[2][1])
        self.assertEqual(json.dumps(BASE), before)

    def test_same_definition_is_kept_once_and_noted(self) -> None:
        merged, _, notes, _ = sc.merge_overlay(BASE, {"tables": {"products": {"columns": [["name", "text", {"required": True}]]}}})
        self.assertEqual([c[0] for c in merged["tables"]["products"]["columns"]], ["name", "category", "old"])
        self.assertEqual(len(notes), 1)

    def test_overlay_wins_and_says_so(self) -> None:
        merged, problems, _, changes = sc.merge_overlay(BASE, {"tables": {"products": {"columns": [["name", "int"]]}}, "choices": {"products.category": ["a", "x"]}})
        self.assertEqual(problems, [])
        self.assertEqual(merged["tables"]["products"]["columns"][0], ["name", "int"])
        self.assertEqual(merged["choices"]["products.category"], ["a", "x"])
        self.assertTrue(any("products.name" in c for c in changes))
        self.assertTrue(any("消した値: b" in c for c in changes))

    def test_opening_a_choice_drops_values_and_ignores_the_label(self) -> None:
        merged, _, _, _ = sc.merge_overlay(BASE, {"tables": {"products": {"columns": [["category", "text"]]}}})
        self.assertNotIn("products.category", merged["choices"])
        self.assertIn("category_name", merged["tables"]["products"]["retired"])

    def test_retiring_a_column_removes_it_and_its_unique(self) -> None:
        merged, problems, _, changes = sc.merge_overlay(BASE, {"tables": {"cards": {"retired": ["title"]}}})
        self.assertEqual(problems, [])
        self.assertEqual(merged["tables"]["cards"]["columns"], [])
        self.assertEqual(merged["tables"]["cards"]["unique"], [])
        self.assertEqual(len(changes), 2)

    def test_all_types_are_the_same_in_both(self) -> None:
        for t in sc.SQL_TYPES:
            overlay = {"tables": {"products": {"columns": [["x", t]]}}, "choices": {"products.x": ["a"]} if t == "choice" else {}}
            self.assertEqual(sc.merge_overlay(BASE, overlay)[1], [])
            if shutil.which("node"):
                self.assertEqual(_node(BASE, overlay)["problems"], [], t)


def _node(base: Any, overlay: Any) -> dict[str, Any]:
    with tempfile.TemporaryDirectory() as d:
        a, b = Path(d) / "a.json", Path(d) / "b.json"
        a.write_text(json.dumps(base), encoding="utf-8")
        b.write_text(json.dumps(overlay), encoding="utf-8")
        out = subprocess.run(["node", str(ROOT / "scripts" / "schema-overlay.mjs"), str(a), str(b)], capture_output=True, encoding="utf-8", check=True)
    return json.loads(out.stdout)


@unittest.skipUnless(shutil.which("node"), "node がない")
class SameAsVerifyTest(unittest.TestCase):
    """サーバーと verify が別々の判定をすると、verify を通っても起動で止まる"""

    def test_same_result_and_same_reason(self) -> None:
        for name, overlay, _ok in CASES:
            with self.subTest(name):
                merged, problems, notes, changes = sc.merge_overlay(BASE, overlay)
                out = _node(BASE, overlay)
                self.assertEqual(out["problems"], problems)
                self.assertEqual(out["notes"], notes)
                self.assertEqual(out["changes"], changes)
                if not problems:
                    self.assertEqual(out["merged"], merged)


class LoadTest(unittest.TestCase):
    def setUp(self) -> None:
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.path = Path(self.dir.name) / "schema.json"
        for p in (mock.patch.object(sc, "OVERLAY_PATH", self.path), mock.patch.object(sc, "_cache", None)):
            p.start()
            self.addCleanup(p.stop)

    def _write(self, overlay: Any) -> None:
        self.path.write_text(json.dumps(overlay) if not isinstance(overlay, str) else overlay, encoding="utf-8")
        sc._cache = None

    def test_without_file_is_exactly_schema_json(self) -> None:
        plain = sc.load()
        raw = json.loads(sc.SCHEMA_PATH.read_text(encoding="utf-8"))
        self.assertEqual(list(plain.tables), list(raw["tables"]))
        self.assertIsNone(sc.overlay_status())
        out = health._Out()
        self.assertTrue(health._schema_overlay(out))
        self.assertEqual(list(out), [])

    def test_empty_file_changes_nothing_in_the_sql(self) -> None:
        want = sc.load().ddl_hash()
        self._write({})
        self.assertEqual(sc.load().ddl_hash(), want)

    def test_overlay_reaches_ddl_and_write_check(self) -> None:
        want = sc.load().ddl_hash()
        self._write(
            {
                "tables": {
                    "products": {"columns": [["maker_size", "choice", {"index": True}]]},
                    "client_notes": {"columns": [["body", "text"]], "lookups": [["product_id", "products", {"onDelete": "CASCADE"}]]},
                },
                "choices": {"products.maker_size": ["s", "m"]},
            }
        )
        s = sc.load()
        self.assertNotEqual(s.ddl_hash(), want)  # 指紋が変わるので、次の起動で DB に流れる
        sql = "\n".join(s.ddl())
        self.assertIn("ALTER TABLE products ADD COLUMN IF NOT EXISTS maker_size text", sql)
        self.assertIn("CREATE TABLE IF NOT EXISTS client_notes", sql)
        order = [t.pg for t in s.creation_order()]
        self.assertLess(order.index("products"), order.index("client_notes"))
        self.assertEqual(s.table("products").to_db({"maker_size": "s"}), {"maker_size": "s"})
        with self.assertRaises(sc.BadRequest):
            s.table("products").to_db({"maker_size": "xxl"})
        self.assertIn(("client_notes", "body"), s.expected_columns())

    def test_bad_file_stops_with_reason_and_next_step(self) -> None:
        self._write({"tables": {"products": {"columns": [["name", "json"]]}}})
        with self.assertRaises(sc.SchemaOverlayError) as e:
            sc.load()
        self.assertIn("products.name", str(e.exception))
        self.assertIn("次にやること", str(e.exception))

    def test_broken_json_stops_with_reason(self) -> None:
        self._write("{ not json")
        with self.assertRaises(sc.SchemaOverlayError):
            sc.load()

    def test_changed_common_definitions_work_and_warn(self) -> None:
        self._write({"tables": {"products": {"columns": [["category", "text"]], "retired": ["stock"]}}, "choices": {"products.market": ["JP", "US", "EU"]}})
        t = sc.load().table("products")
        self.assertEqual(t.to_db({"category": "Knitwear", "category_name": "x", "market": "EU", "stock": 1}), {"category": "Knitwear", "market": "EU"})
        self.assertIn("ALTER TABLE products ADD COLUMN IF NOT EXISTS category text", "\n".join(sc.load().ddl()))
        out = health._Out()
        self.assertTrue(health._schema_overlay(out))
        self.assertEqual([i.status for i in out], ["ok", "warn", "warn", "warn"])
        self.assertIn("CHANGES.md", out[1].fix)

    def test_import_side_survives_changed_common_columns(self) -> None:
        from ccp import bq_import, bq_validate

        self._write({"tables": {"products": {"columns": [["category", "text"]], "retired": ["season"]}}})
        self.assertNotIn("season", bq_import._values("products", {"name": "n", "season": "x"}, ["name", "season"]))
        row = {"market": "JP", "product_code": "A", "name": "n", "category": "Knitwear"}
        issues = bq_validate.validate("spu", [row])
        self.assertFalse(any("Knitwear" in i.message for i in issues))

    def test_health_shows_failed_and_stops_there(self) -> None:
        self._write({"tables": {"products": {"columns": [["name", "json"]]}}})
        out = health._Out()
        self.assertFalse(health._schema_overlay(out))
        self.assertEqual([i.status for i in out], ["failed"])
        self.assertIn("products.name", out[0].text)
        self.assertTrue(out[0].fix)

    def test_health_shows_ok_and_what_can_be_removed(self) -> None:
        name_col = next(c for c in sc.load().table("products").columns if c.pg == "name")
        self.assertTrue(name_col.required)
        self._write({"tables": {"products": {"columns": [["name", "text", {"required": True}], ["maker", "text"]]}}})
        out = health._Out()
        self.assertTrue(health._schema_overlay(out))
        self.assertEqual([i.status for i in out], ["ok", "warn"])
        self.assertIn("足した列と参照 1", out[0].text)


if __name__ == "__main__":
    unittest.main()
