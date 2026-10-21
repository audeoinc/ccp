"""production.py の、AB テストの案ごとの HTML(列 variant_html)の読み書きの単体テスト。

  cd server && python -m unittest discover tests
"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ccp.production import merge_variant_html, parse_variant_html  # noqa: E402


class VariantHtmlTest(unittest.TestCase):
    def test_parse_ignores_bad_values(self) -> None:
        self.assertEqual(parse_variant_html(None), {})
        self.assertEqual(parse_variant_html("not json"), {})
        self.assertEqual(parse_variant_html("[1]"), {})
        # A 案は列 html に入るので、ここでは読まない。html が文字でないものも捨てる
        raw = json.dumps({"A": {"html": "a"}, "B": {"html": "b"}, "C": {"html": 3}})
        self.assertEqual(parse_variant_html(raw), {"B": {"html": "b"}})

    def test_merge_keeps_other_variants(self) -> None:
        raw = json.dumps({"B": {"html": "b1"}, "C": {"html": "c1"}})
        out = json.loads(merge_variant_html(raw, "B", "b2", "2026-10-21T00:00:00+00:00", "Ken"))
        self.assertEqual(out["B"], {"html": "b2", "saved_at": "2026-10-21T00:00:00+00:00", "saved_by_name": "Ken"})
        self.assertEqual(out["C"], {"html": "c1"})

    def test_merge_from_empty(self) -> None:
        out = json.loads(merge_variant_html(None, "C", "<p>c</p>", None, None))
        self.assertEqual(list(out), ["C"])


if __name__ == "__main__":
    unittest.main()
