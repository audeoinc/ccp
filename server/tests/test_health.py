"""設定の健康診断(server/ccp/health.py)。DB・Google・AI・BigQuery には触らない(身代わり)。

  cd server && python -m unittest discover tests
"""
from __future__ import annotations

import asyncio
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ccp import appsettings, health  # noqa: E402


def by_area(items: list[health.Item], area: str) -> list[health.Item]:
    return [i for i in items if i.area == area]


class Base(unittest.TestCase):
    def setUp(self) -> None:
        for p in (
            mock.patch.object(appsettings, "_rows", {}),
            mock.patch.object(appsettings, "_rows_ok", True),
            mock.patch.object(appsettings, "ensure", mock.AsyncMock()),
            mock.patch.dict(os.environ, {"DATABASE_URL": "", "GOOGLE_CLOUD_PROJECT": "", "AI_OUTLET_URL": "", "APP_PASSWORD": "", "ASSET_DIR": "", "BQ_AUTO_SYNC": ""}),
        ):
            p.__enter__()
            self.addCleanup(p.__exit__, None, None, None)


class DiagnoseTest(Base):
    def run_light(self) -> list[health.Item]:
        with mock.patch("ccp.creds.get_credentials", return_value=mock.Mock(service_account_email="sa@example.invalid")):
            return asyncio.run(health.diagnose(full=False))

    def test_empty_server_tells_what_is_missing(self) -> None:
        items = self.run_light()
        db = by_area(items, "db")
        self.assertEqual(db[0].status, "missing")
        self.assertIn("DATABASE_URL", db[0].text)
        self.assertTrue(db[0].fix)
        self.assertEqual(by_area(items, "google")[0].status, "missing")
        self.assertEqual(by_area(items, "bq")[0].goto, "dataimport")
        # 入口の認証がなければ、中継からは開けないので「足りない」(⚙ の赤い点で気づけるように)
        self.assertEqual(by_area(items, "guard")[0].status, "missing")
        self.assertIn("CCP_AUTH=none", by_area(items, "guard")[0].fix)

    def test_devtools_without_login_is_flagged(self) -> None:
        # 開発用の画面が有効で、ログインがなければ、入れる人を見分けられない(X103)
        with mock.patch.dict(os.environ, {"CCP_DEVTOOLS": "1", "APP_PASSWORD": "pw"}):
            items = self.run_light()
        dev = [i for i in by_area(items, "guard") if "開発用の画面" in i.text]
        self.assertEqual([i.status for i in dev], ["warn"])
        with mock.patch.dict(os.environ, {"CCP_DEVTOOLS": "1", "CCP_DEV_USER_EMAIL": "a@example.com"}):
            items = self.run_light()
        self.assertEqual([i.status for i in by_area(items, "guard") if "開発用の画面" in i.text], ["ok"])

    def test_bad_url_shape(self) -> None:
        with mock.patch.dict(os.environ, {"DATABASE_URL": "postgresql://u:p@ss@host/db"}):
            items = self.run_light()
        texts = " ".join(i.text for i in by_area(items, "db"))
        self.assertIn("postgresql+asyncpg://", texts)
        self.assertIn("@ が 2 つ", texts)

    def test_light_does_not_call_ai(self) -> None:
        with mock.patch.dict(os.environ, {"GOOGLE_CLOUD_PROJECT": "p"}), mock.patch("ccp.ai.try_call") as called:
            items = self.run_light()
        called.assert_not_called()
        self.assertEqual(by_area(items, "ai")[0].status, "ok")

    def test_full_reports_ai_failure_with_way_to_fix(self) -> None:
        fail = mock.AsyncMock(return_value={"ok": False, "seconds": 0.2, "message": "権限がありません", "via": "gemini", "model": "m"})
        with mock.patch.dict(os.environ, {"GOOGLE_CLOUD_PROJECT": "p"}), mock.patch("ccp.ai.try_call", fail), mock.patch("ccp.creds.get_credentials", return_value=mock.Mock()):
            items = asyncio.run(health.diagnose(full=True))
        ai = by_area(items, "ai")[0]
        self.assertEqual((ai.status, ai.goto), ("failed", "ai"))
        self.assertIn("権限", ai.text)

    def test_assets_folder_without_photos(self) -> None:
        with tempfile.TemporaryDirectory() as d, mock.patch.dict(os.environ, {"ASSET_DIR": d}):
            items = self.run_light()
        self.assertEqual(by_area(items, "assets")[0].status, "missing")

    def test_counts(self) -> None:
        items = [health.Item("db", "ok", ""), health.Item("ai", "failed", ""), health.Item("bq", "warn", "")]
        self.assertEqual(health.counts(items), {"ok": 1, "missing": 0, "failed": 1, "warn": 1})


if __name__ == "__main__":
    unittest.main()
