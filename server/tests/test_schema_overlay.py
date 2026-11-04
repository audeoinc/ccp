"""スキーマの重ね読み(docs/AWS_CUSTOMIZE.md の 4 章): 重ねるファイルがなければ今までと同じで、あれば足すだけ。
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
    ("型が違う", {"tables": {"products": {"columns": [["name", "int"]]}}}, False),
    ("指定が違う", {"tables": {"products": {"columns": [["name", "text"]]}}}, False),
    ("いつもある列", {"tables": {"products": {"columns": [["created_on", "date"]]}}}, False),
    ("知らない型", {"tables": {"products": {"columns": [["x", "json"]]}}}, False),
    ("知らない指定", {"tables": {"products": {"columns": [["x", "text", {"default": 1}]]}}}, False),
    ("危ない列の名前", {"tables": {"products": {"columns": [["x; DROP", "text"]]}}}, False),
    ("危ない表の名前", {"tables": {"Bad Table": {"columns": []}}}, False),
    ("列の形", {"tables": {"products": {"columns": ["x"]}}}, False),
    ("参照先がない", {"tables": {"cards": {"lookups": [["z_id", "nothing"]]}}}, False),
    ("参照と列の名前", {"tables": {"cards": {"lookups": [["title", "products"]]}}}, False),
    ("列と参照の名前", {"tables": {"cards": {"columns": [["product_id", "text"]]}}}, False),
    ("参照が違う", {"tables": {"cards": {"lookups": [["product_id", "products"]]}}}, False),
    ("onDelete", {"tables": {"cards": {"lookups": [["z_id", "products", {"onDelete": "RESTRICT"}]]}}}, False),
    ("共通の選択肢", {"choices": {"products.category": ["x"]}}, False),
    ("選択肢なし", {"tables": {"products": {"columns": [["size", "choice"]]}}}, False),
    ("空の選択肢", {"tables": {"products": {"columns": [["size", "choice"]]}}, "choices": {"products.size": []}}, False),
    ("共通の列を止める", {"tables": {"products": {"retired": ["old"]}}}, False),
    ("共通の表に一意", {"tables": {"products": {"unique": [["name"]]}}}, False),
    ("一意の列がない", {"tables": {"extras": {"columns": [["c", "text"]], "unique": [["z"]]}}}, False),
    ("列が配列でない", {"tables": {"products": {"columns": 1}}}, False),
    ("止める列の形", {"tables": {"products": {"retired": [["x"]]}}}, False),
    ("一意の形", {"tables": {"extras": {"columns": [["c", "text"]], "unique": [[["c"]]]}}}, False),
    ("知らない項目", {"views": {}}, False),
    ("表の知らない項目", {"tables": {"products": {"indexes": []}}}, False),
    ("外が配列", [], False),
]


class MergeTest(unittest.TestCase):
    def test_cases(self) -> None:
        for name, overlay, ok in CASES:
            with self.subTest(name):
                _, problems, _ = sc.merge_overlay(BASE, overlay)
                self.assertEqual(not problems, ok, problems)

    def test_base_is_not_changed(self) -> None:
        before = json.dumps(BASE)
        sc.merge_overlay(BASE, CASES[2][1])
        self.assertEqual(json.dumps(BASE), before)

    def test_same_definition_is_kept_once_and_noted(self) -> None:
        merged, _, notes = sc.merge_overlay(BASE, {"tables": {"products": {"columns": [["name", "text", {"required": True}]]}}})
        self.assertEqual([c[0] for c in merged["tables"]["products"]["columns"]], ["name", "category", "old"])
        self.assertEqual(len(notes), 1)

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
                merged, problems, _ = sc.merge_overlay(BASE, overlay)
                out = _node(BASE, overlay)
                self.assertEqual(out["problems"], problems)
                if not problems:
                    self.assertEqual(out["merged"], {**merged, "choices": merged.get("choices", {})})


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
        self._write({"tables": {"products": {"columns": [["name", "int"]]}}})
        with self.assertRaises(sc.SchemaOverlayError) as e:
            sc.load()
        self.assertIn("products.name", str(e.exception))
        self.assertIn("次にやること", str(e.exception))

    def test_broken_json_stops_with_reason(self) -> None:
        self._write("{ not json")
        with self.assertRaises(sc.SchemaOverlayError):
            sc.load()

    def test_health_shows_failed_and_stops_there(self) -> None:
        self._write({"tables": {"products": {"columns": [["name", "int"]]}}})
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
