"""db.cli_conn(コマンドから DB を使う接続)の単体テスト。DB には接続しない。

  cd server && python -m unittest discover tests
"""
from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ccp import db, dbready  # noqa: E402


class FakeController:
    """何回目から使えるようになるか(starts_after)を決めた、DB の起動の受け持ち"""

    def __init__(self, starts_after: int) -> None:
        self.calls = 0
        self.starts_after = starts_after
        self.touched = 0

    async def ensure_running(self) -> None:
        self.calls += 1
        if self.calls <= self.starts_after:
            raise dbready.DbNotReady("starting")

    async def touch(self) -> None:
        self.touched += 1


class FakeEngine:
    def __init__(self) -> None:
        self.opened: list[str] = []

    def _cm(self, kind: str):
        engine = self

        class _Cm:
            async def __aenter__(self):
                engine.opened.append(kind)
                return kind

            async def __aexit__(self, *exc):
                return False

        return _Cm()

    def begin(self):
        return self._cm("begin")

    def connect(self):
        return self._cm("connect")


async def _use(write: bool) -> str:
    async with db.cli_conn(write=write) as conn:
        return conn


class CliConnTest(unittest.TestCase):
    def test_without_controller_connects_directly(self) -> None:
        engine = FakeEngine()
        with mock.patch.object(dbready, "controller", return_value=None), mock.patch.object(db, "get_engine", mock.AsyncMock(return_value=engine)):
            self.assertEqual(asyncio.run(_use(True)), "begin")
            self.assertEqual(asyncio.run(_use(False)), "connect")
        self.assertEqual(engine.opened, ["begin", "connect"])

    def test_waits_until_db_is_running(self) -> None:
        c = FakeController(starts_after=2)
        with mock.patch.object(dbready, "controller", return_value=c), mock.patch.object(db, "get_engine", mock.AsyncMock(return_value=FakeEngine())), \
                mock.patch.object(db, "CLI_POLL_S", 0), mock.patch("builtins.print"):
            self.assertEqual(asyncio.run(_use(True)), "begin")
        self.assertEqual(c.calls, 3)
        self.assertEqual(c.touched, 1)

    def test_gives_up_after_wait(self) -> None:
        c = FakeController(starts_after=10**9)
        with mock.patch.object(dbready, "controller", return_value=c), mock.patch.object(db, "get_engine", mock.AsyncMock(return_value=FakeEngine())), \
                mock.patch.object(db, "CLI_POLL_S", 0), mock.patch.object(db, "CLI_WAIT_S", -1), mock.patch("builtins.print"):
            with self.assertRaises(dbready.DbNotReady):
                asyncio.run(_use(True))


if __name__ == "__main__":
    unittest.main()
