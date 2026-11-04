"""共通の定義を変えたのに CHANGES.md に書いていなければ止める確認(scripts/check-client-changes.mjs)を、コマンドのまま流す。"""
from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
BASE: dict[str, Any] = {
    "tables": {
        "products": {"columns": [["name", "text"], ["season", "choice"]], "lookups": []},
        "cards": {"columns": [["title", "text"]], "lookups": [["product_id", "products"]]},
    },
}


@unittest.skipUnless(shutil.which("node"), "node がない")
class ClientChangesTest(unittest.TestCase):
    def _run(self, current: Any, changes: str | None = None, base: Any = BASE) -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "server").mkdir()
            (root / "server" / "schema.json").write_text(json.dumps(current), encoding="utf-8")
            if base is not None:
                (root / "server" / "schema.base.json").write_text(json.dumps(base), encoding="utf-8")
            if changes is not None:
                (root / "docs" / "client").mkdir(parents=True)
                (root / "docs" / "client" / "CHANGES.md").write_text(changes, encoding="utf-8")
            return subprocess.run(["node", str(ROOT / "scripts" / "check-client-changes.mjs"), str(root)], capture_output=True, encoding="utf-8")

    def _changed(self, **edits: Any) -> dict[str, Any]:
        cur = json.loads(json.dumps(BASE))
        cur["tables"].update(edits)
        return cur

    def test_nothing_changed_passes(self) -> None:
        self.assertEqual(self._run(BASE).returncode, 0)

    def test_without_base_does_nothing(self) -> None:
        # 開発側のリポジトリ。schema.base.json がなければ、列がどう変わっても止めない
        self.assertEqual(self._run({"tables": {}}, base=None).returncode, 0)

    def test_added_column_passes(self) -> None:
        cur = self._changed(products={"columns": [*BASE["tables"]["products"]["columns"], ["maker", "text"]], "lookups": []})
        self.assertEqual(self._run(cur).returncode, 0)

    def test_removed_column_stops_with_name_and_next_step(self) -> None:
        cur = self._changed(products={"columns": [["name", "text"]], "lookups": []})
        out = self._run(cur)
        self.assertEqual(out.returncode, 1)
        self.assertIn("products.season", out.stderr)
        self.assertIn("次にやること", out.stderr)

    def test_recorded_change_passes(self) -> None:
        cur = self._changed(products={"columns": [["name", "text"]], "lookups": []})
        self.assertEqual(self._run(cur, "- `products.season` を消した。理由: 相手のデータにないため\n").returncode, 0)

    def test_longer_name_does_not_count_as_recorded(self) -> None:
        cur = self._changed(products={"columns": [["name", "text"]], "lookups": []})
        self.assertEqual(self._run(cur, "products.season_code / my_products.season\n").returncode, 1)

    def test_type_change_stops(self) -> None:
        cur = self._changed(products={"columns": [["name", "int"], ["season", "choice"]], "lookups": []})
        out = self._run(cur)
        self.assertEqual(out.returncode, 1)
        self.assertIn("text → int", out.stderr)

    def test_removed_table_stops(self) -> None:
        cur = json.loads(json.dumps(BASE))
        del cur["tables"]["cards"]
        out = self._run(cur, "")
        self.assertEqual(out.returncode, 1)
        self.assertIn("- cards:", out.stderr)

    def test_lookup_changes_stop(self) -> None:
        self.assertEqual(self._run(self._changed(cards={"columns": [["title", "text"]], "lookups": []})).returncode, 1)
        self.assertEqual(self._run(self._changed(cards={"columns": [["title", "text"]], "lookups": [["product_id", "cards"]]})).returncode, 1)


if __name__ == "__main__":
    unittest.main()
