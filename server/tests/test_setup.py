"""初期設定の画面(server/ccp/setup.py)と、サーバーの設定のファイル(envfile.py)。DB・Google にはつながない(身代わり)。

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

from ccp import envfile, setup  # noqa: E402


class EnvFileTest(unittest.TestCase):
    def setUp(self) -> None:
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.file = Path(self.dir.name) / "ccp.env"
        for p in (
            mock.patch.dict(os.environ, {"CCP_ENV_FILE": str(self.file), "FROM_SECRETS": "s"}),
            mock.patch.object(envfile, "_from_env", set()),
            mock.patch.object(envfile, "_from_file", set()),
        ):
            p.__enter__()
            self.addCleanup(p.__exit__, None, None, None)

    def test_env_wins_over_file(self) -> None:
        self.file.write_text("# メモ\nFROM_SECRETS=file\nONLY_FILE='a b'\n", encoding="utf-8")
        envfile.load()
        self.assertEqual(os.environ["FROM_SECRETS"], "s")
        self.assertEqual(os.environ["ONLY_FILE"], "a b")
        self.assertTrue(envfile.from_env("FROM_SECRETS"))
        self.assertFalse(envfile.from_env("ONLY_FILE"))
        os.environ.pop("ONLY_FILE", None)

    def test_write_keeps_other_lines_lf_and_skips_env_values(self) -> None:
        self.file.write_text("# メモ\nA=1\n", encoding="utf-8")
        envfile.load()
        envfile.write({"A": "2", "B": "x y", "FROM_SECRETS": "changed"})
        raw = self.file.read_bytes()
        self.assertNotIn(b"\r\n", raw)
        text = raw.decode("utf-8")
        self.assertIn("# メモ", text)
        self.assertIn("A=2", text)
        self.assertIn("B='x y'", text)
        self.assertNotIn("FROM_SECRETS", text)
        self.assertEqual(os.environ["FROM_SECRETS"], "s")
        envfile.write({"A": None})
        self.assertNotIn("A=", self.file.read_text(encoding="utf-8"))
        for k in ("A", "B"):
            os.environ.pop(k, None)


class SetupTest(unittest.TestCase):
    def test_url_escapes_password(self) -> None:
        url = setup.build_url({"host": "db", "port": "5432", "name": "ccp", "user": "app", "password": "p@ss:w/rd"})
        self.assertEqual(url, "postgresql+asyncpg://app:p%40ss%3Aw%2Frd@db:5432/ccp")
        from sqlalchemy.engine import make_url

        self.assertEqual(make_url(url).password, "p@ss:w/rd")
        self.assertEqual(make_url(url).host, "db")
        with self.assertRaises(ValueError):
            setup.build_url({"host": "db", "name": "", "user": "u"})

    def test_needs_setup_without_database(self) -> None:
        with mock.patch.dict(os.environ, {"DATABASE_URL": ""}), mock.patch.object(setup.optional, "hosted", return_value=None):
            self.assertIn("DATABASE_URL", setup.missing_reason())

    def test_gate_only_while_active(self) -> None:
        with mock.patch.dict(setup._state, {"active": True, "reason": "x"}):
            self.assertEqual(asyncio.run(setup.gate("/api/data/x"))["error"]["code"], "setup_required")
            self.assertIsNone(asyncio.run(setup.gate("/api/setup/state")))
            self.assertIsNone(asyncio.run(setup.gate("/index.html")))
        with mock.patch.dict(setup._state, {"active": False}):
            self.assertIsNone(asyncio.run(setup.gate("/api/data/x")))

    def test_checks_refuse_bad_values(self) -> None:
        self.assertFalse(asyncio.run(setup.check("assets", {"dir": "relative/path"}))[0])
        self.assertFalse(asyncio.run(setup.check("password", {"password": "short"}))[0])
        ok, _msg, values = asyncio.run(setup.check("password", {"password": "long enough"}))
        self.assertTrue(ok)
        self.assertEqual(values, {"APP_PASSWORD": "long enough"})
        with tempfile.TemporaryDirectory() as d:
            ok, _msg, values = asyncio.run(setup.check("assets", {"dir": str(Path(d) / "new")}))
        self.assertTrue(ok)

    def test_db_reason_is_human(self) -> None:
        self.assertIn("パスワード", setup._db_reason(RuntimeError("password authentication failed for user")))


if __name__ == "__main__":
    unittest.main()
