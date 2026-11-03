"""開発用の画面から CCP の DB を読む(X104。ccp/devtools/pg_tools.py)のテスト。DB は差し替える。

  cd server && python -m unittest discover tests
"""
from __future__ import annotations

import asyncio
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ccp.devtools import pg_tools  # noqa: E402
from ccp.devtools.ai_sql import ChatIn, build_context  # noqa: E402
from ccp.identity import Identity  # noqa: E402


def run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


class FakeResult:
    returns_rows = True

    def __init__(self, n: int) -> None:
        self.n = n

    def keys(self):  # noqa: ANN201
        return ["id", "name"]

    def fetchmany(self, k: int):  # noqa: ANN201
        return [mock.Mock(_mapping={"id": i, "name": f"n{i}"}) for i in range(min(k, self.n))]


class FakeTx:
    def __init__(self, log: list[str]) -> None:
        self.log = log

    async def rollback(self) -> None:
        self.log.append("ROLLBACK")


class FakeConn:
    def __init__(self, n: int = 3, fail: Exception | None = None) -> None:
        self.log: list[str] = []
        self.n, self.fail = n, fail

    async def start(self) -> None:
        pass

    async def begin(self) -> FakeTx:
        self.log.append("BEGIN")
        return FakeTx(self.log)

    async def exec_driver_sql(self, sql: str) -> FakeResult | None:
        if sql.startswith("SET "):
            self.log.append(sql)
            return None
        self.log.append("QUERY")
        if self.fail:
            raise self.fail
        return FakeResult(self.n)

    async def close(self) -> None:
        self.log.append("CLOSE")


def as_user(email: str | None, developer: bool = True):  # noqa: ANN201
    """ログインした人と、開発者か"""
    ident = Identity(email, "oidc") if email else None
    return mock.patch.multiple(
        "ccp.identity",
        current_identity=mock.AsyncMock(return_value=ident),
        developer_denied=mock.AsyncMock(return_value=None if developer else "開発用の画面は、開発者だけが開けます"),
    )


class PgToolsTest(unittest.TestCase):
    def setUp(self) -> None:
        rec = mock.patch.object(pg_tools, "record_run")
        self.record = rec.start()
        self.addCleanup(rec.stop)

    def test_needs_a_signed_in_developer(self) -> None:
        with as_user(None):
            st = run(pg_tools.status(mock.Mock()))
            self.assertFalse(st["available"])
            self.assertIn("ログイン", st["reason"])
            self.assertFalse(run(pg_tools.run(pg_tools.PgSqlIn(sql="select 1"), mock.Mock()))["ok"])
            self.assertFalse(run(pg_tools.tables(mock.Mock()))["ok"])
        with as_user("dev@example.com", developer=False):
            self.assertFalse(run(pg_tools.status(mock.Mock()))["available"])
        with as_user("dev@example.com"):
            self.assertTrue(run(pg_tools.status(mock.Mock()))["available"])
            names = [t["name"] for t in run(pg_tools.tables(mock.Mock()))["tables"]]
            self.assertIn("delivery_cards", names)

    def test_only_reading_statements(self) -> None:
        self.assertEqual(pg_tools.head_word("  -- メモ\n/* x */ (SELECT 1)"), "select")
        self.assertEqual(pg_tools.head_word("WITH a AS (select 1) select * from a"), "with")
        conn = FakeConn()
        with as_user("dev@example.com"), mock.patch.object(pg_tools, "_connect", mock.AsyncMock(return_value=conn)):
            for bad in ("DELETE FROM users", "update users set name='x'", "drop table users", "insert into x values (1)"):
                r = run(pg_tools.run(pg_tools.PgSqlIn(sql=bad), mock.Mock()))
                self.assertFalse(r["ok"], bad)
        self.assertEqual(conn.log, [], "読む文でなければ、DB にはつながない")

    def test_runs_inside_a_read_only_transaction_and_rolls_back(self) -> None:
        conn = FakeConn(n=250)
        with as_user("dev@example.com"), mock.patch.object(pg_tools, "_connect", mock.AsyncMock(return_value=conn)):
            r = run(pg_tools.run(pg_tools.PgSqlIn(sql="select id, name from users;"), mock.Mock()))
        self.assertTrue(r["ok"], r)
        self.assertEqual(len(r["rows"]), 200)
        self.assertTrue(r["more"])
        self.assertEqual(conn.log[:3], ["BEGIN", "SET TRANSACTION READ ONLY", "SET LOCAL statement_timeout = 15000"])
        self.assertEqual(conn.log[-2:], ["ROLLBACK", "CLOSE"])
        # 流す先とだれが流したかを、履歴に残す
        kw = self.record.call_args.kwargs
        self.assertEqual((kw["target"], kw["actor"]), ("pg", "dev@example.com"))

    def test_errors_are_returned_and_still_rolled_back(self) -> None:
        conn = FakeConn(fail=RuntimeError("canceling statement due to statement timeout"))
        with as_user("dev@example.com"), mock.patch.object(pg_tools, "_connect", mock.AsyncMock(return_value=conn)):
            r = run(pg_tools.run(pg_tools.PgSqlIn(sql="select pg_sleep(100)"), mock.Mock()))
        self.assertFalse(r["ok"])
        self.assertIn("秒で止めました", r["error"])
        self.assertIn("ROLLBACK", conn.log)

    def test_timeout_setting(self) -> None:
        with mock.patch.dict(os.environ, {"DEVTOOLS_PG_TIMEOUT_S": "5"}):
            self.assertEqual(pg_tools.timeout_s(), 5.0)
        with mock.patch.dict(os.environ, {"DEVTOOLS_PG_TIMEOUT_S": "abc"}):
            self.assertEqual(pg_tools.timeout_s(), 15.0)


class PgContextTest(unittest.TestCase):
    def test_ai_gets_only_the_shape(self) -> None:
        ctx = build_context(ChatIn(target="pg"), None)
        self.assertIn("CCP の DB(PostgreSQL)", ctx)
        self.assertIn("`delivery_cards`", ctx)
        self.assertIn("道具で流さず", ctx)
        self.assertNotIn("CCP の DB(PostgreSQL)", build_context(ChatIn(), None))


if __name__ == "__main__":
    unittest.main()
