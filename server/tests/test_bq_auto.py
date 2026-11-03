"""BigQuery の定期の取り込みと、その管理(server/ccp/bq_import.py の tick・due・設定、identity.py の admin_denied)。
BigQuery と DB には接続しない(偽の DB は tests/fakes.py)。

  cd server && python -m unittest discover tests
"""
from __future__ import annotations

import asyncio
import sys
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from ccp import bq, bq_import, identity  # noqa: E402
from fakes import FakeStore, Result, Row  # noqa: E402

NOW = datetime(2026, 11, 3, 3, 0, tzinfo=timezone.utc)
SPU, STOCK = (next(o for o in bq.OUTPUTS if o.name == n) for n in ("spu", "sku_stock"))


class SettingsTest(unittest.TestCase):
    def test_default_is_off_with_stock_every_5_minutes(self) -> None:
        s = bq_import.parse_settings(None)
        self.assertFalse(s["enabled"])
        self.assertEqual(s["intervals"]["sku_stock"], 5)
        self.assertEqual(s["intervals"]["spu"], 60)

    def test_unknown_interval_falls_back_to_default(self) -> None:
        s = bq_import.parse_settings('{"enabled": true, "intervals": {"spu": 7, "sku": 15, "nope": 2}}')
        self.assertTrue(s["enabled"])
        self.assertEqual(s["intervals"]["spu"], 60)
        self.assertEqual(s["intervals"]["sku"], 15)
        self.assertNotIn("nope", s["intervals"])

    def test_broken_json_is_off(self) -> None:
        self.assertFalse(bq_import.parse_settings("{")["enabled"])

    def test_env_turns_auto_off(self) -> None:
        on = bq_import.parse_settings({"enabled": True})
        with mock.patch.dict("os.environ", {"BQ_AUTO_SYNC": "0"}):
            self.assertFalse(bq_import.auto_on(on))
        with mock.patch.dict("os.environ", {"BQ_AUTO_SYNC": ""}):
            self.assertTrue(bq_import.auto_on(on))


class DueTest(unittest.TestCase):
    def setUp(self) -> None:
        p = mock.patch.dict(bq_import._checked, clear=True)
        p.__enter__()
        self.addCleanup(p.__exit__, None, None, None)
        self.settings = bq_import.parse_settings(None)

    def test_never_checked_is_due(self) -> None:
        self.assertEqual(bq_import.due(["spu", "sku_stock"], self.settings, {}, NOW), ["spu", "sku_stock"])

    def test_stock_is_due_before_others(self) -> None:
        # 6 分前に確かめた: 在庫(5 分)は時機、SPU(60 分)はまだ
        bq_import._checked.update({"spu": NOW - timedelta(minutes=6), "sku_stock": NOW - timedelta(minutes=6)})
        self.assertEqual(bq_import.due(["spu", "sku_stock"], self.settings, {}, NOW), ["sku_stock"])

    def test_record_time_counts_as_checked(self) -> None:
        prev = {"spu": {"imported_at": NOW - timedelta(minutes=70)}, "sku_stock": {"checked_at": NOW - timedelta(minutes=1)}}
        self.assertEqual(bq_import.due(["spu", "sku_stock"], self.settings, prev, NOW), ["spu"])


class TickTest(unittest.TestCase):
    def setUp(self) -> None:
        self.settings = bq_import.parse_settings({"enabled": True})
        self.sync = mock.AsyncMock(return_value={})
        patches = [
            mock.patch.dict(bq_import._checked, {"spu": NOW - timedelta(minutes=10), "sku_stock": NOW - timedelta(minutes=10)}, clear=True),
            mock.patch.dict("os.environ", {"BQ_AUTO_SYNC": ""}),
            mock.patch.object(bq, "configured", return_value=[SPU, STOCK]),
            mock.patch.object(bq_import, "load_settings", mock.AsyncMock(side_effect=lambda: self.settings)),
            mock.patch.object(bq_import, "latest", mock.AsyncMock(return_value={})),
            mock.patch.object(bq_import, "_now", return_value=NOW),
            mock.patch.object(bq_import, "sync", self.sync),
        ]
        for p in patches:
            p.__enter__()
            self.addCleanup(p.__exit__, None, None, None)

    def tick(self, trigger: str = "auto") -> list[str]:
        return asyncio.run(bq_import.tick(trigger))

    def test_only_due_outputs_are_synced(self) -> None:
        self.assertEqual(self.tick(), ["sku_stock"])
        self.sync.assert_awaited_once_with(False, ["sku_stock"], "auto")

    def test_startup_checks_everything(self) -> None:
        self.assertEqual(self.tick("startup"), ["spu", "sku_stock"])

    def test_off_does_nothing(self) -> None:
        self.settings = bq_import.parse_settings({"enabled": False})
        self.assertEqual(self.tick(), [])
        self.sync.assert_not_awaited()

    def test_env_off_does_not_even_read_settings(self) -> None:
        with mock.patch.dict("os.environ", {"BQ_AUTO_SYNC": "0"}):
            self.assertEqual(self.tick(), [])
        bq_import.load_settings.assert_not_awaited()  # type: ignore[attr-defined]

    def test_unconfigured_does_nothing(self) -> None:
        with mock.patch.object(bq, "configured", return_value=[]):
            self.assertEqual(self.tick(), [])
        bq_import.load_settings.assert_not_awaited()  # type: ignore[attr-defined]


class AdminTest(unittest.TestCase):
    def setUp(self) -> None:
        self.store = FakeStore()
        self.admin = self.store.add("users", name="Aya", role="admin", is_developer=0)
        self.dev = self.store.add("users", name="Dan", role="member", is_developer=1)
        self.member = self.store.add("users", name="Mo", role="member", is_developer=0)
        self.store.statements.append(
            (r"^SELECT role, is_developer FROM users WHERE id = :id", lambda s, m, p: Result([Row(r) for r in s.rows("users", id=p["id"])])),
        )
        p = mock.patch.object(identity, "current_identity", mock.AsyncMock(return_value=None))
        p.__enter__()
        self.addCleanup(p.__exit__, None, None, None)

    def denied(self, actor_id: str | None) -> str | None:
        request = SimpleNamespace(headers={"x-ccp-actor-id": actor_id} if actor_id else {})

        async def run() -> str | None:
            async with self.store.db() as conn:
                return await identity.admin_denied(conn, request)  # type: ignore[arg-type]

        return asyncio.run(run())

    def test_admin_and_developer_pass(self) -> None:
        self.assertIsNone(self.denied(self.admin))
        self.assertIsNone(self.denied(self.dev))

    def test_member_and_nobody_are_denied(self) -> None:
        self.assertIsNotNone(self.denied(self.member))
        self.assertIsNotNone(self.denied(None))
        self.assertIsNotNone(self.denied(str(uuid.uuid4())))
        self.assertIsNotNone(self.denied("not-a-uuid"))


if __name__ == "__main__":
    unittest.main()
