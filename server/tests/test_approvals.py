"""approvals.py の、DB を使わない部分(依頼の結果・だれが決められるか)の単体テスト。
例は approval_cases.json(画面の src/approvals.ts も、scripts/check-approvals.mjs で同じ例を確かめる)。

  cd server && python -m unittest discover tests
"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ccp.approvals import eligible_reviewers, request_outcome  # noqa: E402

CASES = json.loads((Path(__file__).parent / "approval_cases.json").read_text(encoding="utf-8"))


class OutcomeTest(unittest.TestCase):
    def test_cases(self) -> None:
        for c in CASES["outcome"]:
            with self.subTest(c["name"]):
                self.assertEqual(request_outcome(c["rule"], c["decisions"]), c["expect"])


class EligibleTest(unittest.TestCase):
    def test_cases(self) -> None:
        for c in CASES["eligible"]:
            with self.subTest(c["name"]):
                self.assertEqual(eligible_reviewers(c["reviewers"], c["actor"], c["groups"], c["requester"]), c["expect"])


if __name__ == "__main__":
    unittest.main()
