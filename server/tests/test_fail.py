"""data_api.Fail(書き込みのトランザクションの中で失敗を返す例外)の単体テスト。DB は使わない。

  cd server && python -m unittest discover tests
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from ccp.data_api import Fail, register_errors  # noqa: E402


class FailTest(unittest.TestCase):
    def test_returns_same_body_as_fail(self) -> None:
        app = FastAPI()
        register_errors(app)

        @app.get("/x")
        async def x():
            raise Fail(409, "もう受け付けていません", "closed")

        r = TestClient(app).get("/x")
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json(), {"success": False, "error": {"message": "もう受け付けていません", "code": "closed"}})

    def test_rolls_back_the_transaction(self) -> None:
        # async with の中で raise すれば、トランザクションの begin() は取り消しで抜ける(return では確定してしまう)
        events: list[str] = []

        class Tx:
            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                events.append("rollback" if exc_type else "commit")
                return False

        async def run() -> None:
            async with Tx():
                raise Fail(404, "見つかりません")

        import asyncio

        with self.assertRaises(Fail):
            asyncio.run(run())
        self.assertEqual(events, ["rollback"])



class WriteDeniedTest(unittest.TestCase):
    """汎用の窓口(/api/data)で、専用の窓口がある表を書かせない(整理③)"""

    def test_locked_tables(self) -> None:
        from ccp.data_api import write_denied

        for table in ("approval_requests", "approval_reviewers", "production_requests", "user_prefs", "notifications"):
            for op in ("create", "update", "delete"):
                self.assertIsNotNone(write_denied(table, op, ["status"]), (table, op))

    def test_screen_writes_still_allowed(self) -> None:
        from ccp.data_api import write_denied

        # history.ts の logEvent と、alerts.ts の「対応済みにする」
        self.assertIsNone(write_denied("events", "create"))
        self.assertIsNone(write_denied("change_logs", "update", ["resolved_at", "resolved_by", "resolve_note"]))
        self.assertIsNone(write_denied("delivery_cards", "update", ["status"]))

    def test_records_cannot_be_rewritten(self) -> None:
        from ccp.data_api import write_denied

        self.assertIsNotNone(write_denied("events", "update", ["note"]))
        self.assertIsNotNone(write_denied("events", "delete"))
        self.assertIsNotNone(write_denied("change_logs", "update", ["after_value"]))
        self.assertIsNotNone(write_denied("change_logs", "create"))


if __name__ == "__main__":
    unittest.main()
