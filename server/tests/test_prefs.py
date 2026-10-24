"""prefs.py の、DB を使わない部分(送られた設定の確かめ)の単体テスト。

  cd server && python -m unittest discover tests
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ccp.prefs import MAX_KEYS, MAX_VALUE, check_changes  # noqa: E402


class CheckChangesTest(unittest.TestCase):
    def test_values_and_removals(self) -> None:
        changes, err = check_changes({"set": {"ui.lang": "en", "hints.dismissed": None}})
        self.assertIsNone(err)
        self.assertEqual(changes, {"ui.lang": "en", "hints.dismissed": None})

    def test_needs_set(self) -> None:
        self.assertIsNone(check_changes({})[0])
        self.assertIsNone(check_changes([1, 2])[0])

    def test_rejects_bad_names_and_values(self) -> None:
        self.assertIsNone(check_changes({"set": {"": "x"}})[0])
        self.assertIsNone(check_changes({"set": {"a": 1}})[0])
        self.assertIsNone(check_changes({"set": {"a": "x" * (MAX_VALUE + 1)}})[0])

    def test_rejects_too_many(self) -> None:
        self.assertIsNone(check_changes({"set": {f"k{i}": "1" for i in range(MAX_KEYS + 1)}})[0])


if __name__ == "__main__":
    unittest.main()
