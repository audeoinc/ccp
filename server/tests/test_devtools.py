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


if __name__ == "__main__":
    unittest.main()
