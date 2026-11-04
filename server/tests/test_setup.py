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

    def test_setup_opens_behind_a_relay_without_auth(self) -> None:
        # 認証の設定を入れるための画面なので、認証がまだなくても、中継の先から開ける(ほかの API は断る)
        from fastapi.testclient import TestClient

        from ccp import main

        env = {"CCP_AUTH": "", "OIDC_ISSUER": "", "APP_PASSWORD": "", "CCP_IAP_AUDIENCE": ""}
        relay = {"x-forwarded-for": "203.0.113.1"}
        with mock.patch.dict(os.environ, env):
            client = TestClient(main.app)
            with mock.patch.dict(setup._state, {"active": True, "reason": "x", "key": "k"}):
                self.assertEqual(client.get("/api/setup/state", headers=relay).status_code, 200)
                self.assertEqual(client.get("/api/data/x", headers=relay).status_code, 503)
                self.assertEqual(client.get("/api/data/x", headers=relay).json()["error"]["code"], "setup_required")
            with mock.patch.dict(setup._state, {"active": False}):
                self.assertEqual(client.get("/api/setup/state", headers=relay).status_code, 503)
                self.assertEqual(client.get("/api/setup/state", headers=relay).json()["error"]["code"], "auth_setup")

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



class SecretsTest(unittest.TestCase):
    """⚙ の「秘密の設定」: 値は返さない・環境から渡された値は変えられない・書くと起動し直さずに効く"""

    def setUp(self) -> None:
        from fastapi.testclient import TestClient

        from ccp import health, main

        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.file = Path(self.dir.name) / "ccp.env"
        env = mock.patch.dict(os.environ, {"CCP_ENV_FILE": str(self.file), "AI_OUTLET_TOKEN": "", "CCP_AUTH": "none"})
        env.start()
        self.addCleanup(env.stop)
        allow = mock.patch.object(health, "denied", mock.AsyncMock(return_value=None))
        allow.start()
        self.addCleanup(allow.stop)
        self.client = TestClient(main.app)
        self.url = "/api/settings/secrets"

    def _item(self, data: dict, name: str) -> dict:
        return next(i for i in data["items"] if i["name"] == name)

    def test_write_never_returns_the_value_and_takes_effect(self) -> None:
        r = self.client.put(f"{self.url}/AI_OUTLET_TOKEN", json={"value": "tok-for-test"})
        self.assertNotIn("tok-for-test", r.text)
        self.assertTrue(self._item(r.json()["data"], "AI_OUTLET_TOKEN")["set"])
        self.assertEqual(os.environ["AI_OUTLET_TOKEN"], "tok-for-test")
        self.assertIn("tok-for-test", self.file.read_text(encoding="utf-8"))
        self.assertNotIn("tok-for-test", self.client.get(self.url).text)
        r = self.client.delete(f"{self.url}/AI_OUTLET_TOKEN")
        self.assertFalse(self._item(r.json()["data"], "AI_OUTLET_TOKEN")["set"])
        self.assertNotIn("tok-for-test", self.file.read_text(encoding="utf-8"))

    def test_refuses_unknown_short_and_locked(self) -> None:
        self.assertEqual(self.client.put(f"{self.url}/DATABASE_URL", json={"value": "x"}).json()["error"]["code"], "refused")
        self.assertEqual(self.client.put(f"{self.url}/APP_PASSWORD", json={"value": "short"}).json()["error"]["code"], "too_short")
        with mock.patch.object(setup.envfile, "from_env", return_value=True):
            self.assertEqual(self.client.put(f"{self.url}/AI_OUTLET_TOKEN", json={"value": "x"}).json()["error"]["code"], "refused")
            self.assertEqual(self.client.delete(f"{self.url}/AI_OUTLET_TOKEN").json()["error"]["code"], "refused")
            self.assertTrue(self._item(self.client.get(self.url).json()["data"], "AI_OUTLET_TOKEN")["locked"])


if __name__ == "__main__":
    unittest.main()


class TemplateTest(unittest.TestCase):
    """設定の型: 秘密を入れない・読み込むと確認待ち・確認待ちのあいだは取り込まない"""

    def setUp(self) -> None:
        from ccp import appsettings, settings_template

        self.a, self.t = appsettings, settings_template
        self.saved: dict = {}

        async def fake_save(name, value, by, changes):  # noqa: ANN001
            self.saved[name] = value

        for p in (
            mock.patch.object(appsettings, "save", fake_save),
            mock.patch.object(appsettings, "ensure", mock.AsyncMock()),
            mock.patch.object(appsettings, "_rows", {}),
        ):
            p.start()
            self.addCleanup(p.stop)

    def _template(self, **groups) -> dict:
        return {"kind": self.t.KIND, "version": self.t.VERSION, "exportedAt": "2026-11-04T00:00:00Z", "dropped": [], "groups": groups}

    def test_export_has_no_secrets_and_drops_url_with_token(self) -> None:
        env = {"APP_PASSWORD": "pw-for-test", "AI_OUTLET_TOKEN": "tok-for-test", "DATABASE_URL": "postgresql://u:db-pw@h/d"}
        self.a._rows["ai"] = {"value": {"outlet_url": "https://layer.example/ask?code=url-secret"}}
        with mock.patch.dict(os.environ, env):
            out = self.t.build()
        text = str(out)
        for secret in ("pw-for-test", "tok-for-test", "db-pw", "url-secret"):
            self.assertNotIn(secret, text)
        self.assertEqual(out["dropped"], ["ai.outlet_url"])

    def test_import_turns_scheduled_off_and_marks_pending(self) -> None:
        tpl = self._template(ai={"model": "gemini-3.5-flash"}, bq={"project": "p", "spu": "p.d.spu"}, **{"bq.sync": {"enabled": True}})
        result = asyncio.run(self.t.apply(tpl, "test"))
        self.assertTrue(result["pending"])
        self.assertFalse(self.saved["bq.sync"]["enabled"])
        self.assertEqual(self.saved["bq"]["spu"], "p.d.spu")
        self.assertIn(self.a.PENDING, self.saved)

    def test_import_keeps_the_outlet_url_it_did_not_carry(self) -> None:
        self.a._rows["ai"] = {"value": {"outlet_url": "https://here.example/ask"}}
        tpl = self._template(ai={"model": "gemini-3.5-flash", "outlet_url": ""})
        tpl["dropped"] = ["ai.outlet_url"]
        asyncio.run(self.t.apply(tpl, "test"))
        self.assertEqual(self.saved["ai"]["outlet_url"], "https://here.example/ask")

    def test_import_refuses_other_files_without_writing(self) -> None:
        for bad in ({"kind": "other"}, {"kind": self.t.KIND, "version": 99}, self._template(bq={"spu": "no dots"})):
            with self.assertRaises(self.a.Invalid):
                asyncio.run(self.t.apply(bad, "test"))
        self.assertEqual(self.saved, {})

    def test_sync_does_not_read_while_pending(self) -> None:
        from ccp import bq, bq_import

        self.a._rows[self.a.PENDING] = {"value": {"exportedAt": "x"}}
        with mock.patch.object(bq, "configured", return_value=[object()]), mock.patch.object(bq, "client") as client, mock.patch.object(bq_import, "status", mock.AsyncMock(return_value={})):
            out = asyncio.run(bq_import.sync(True, None, "button"))
        self.assertEqual(out["skipped"], "template")
        client.assert_not_called()
        # 解くと、空の行が最新になる
        self.a._rows[self.a.PENDING] = {"value": {}}
        self.assertIsNone(self.a.pending())
