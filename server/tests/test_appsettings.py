"""仕事の設定を DB で持つ(server/ccp/appsettings.py)。DB には接続しない(読み書きは身代わり)。

  cd server && python -m unittest discover tests
"""
from __future__ import annotations

import asyncio
import contextlib
import sys
import unittest
from pathlib import Path
from typing import Any
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ccp import appsettings, bq, data_api  # noqa: E402

SPU = next(o for o in bq.OUTPUTS if o.name == "spu")


def row(value: dict[str, Any], source: str = "screen") -> dict[str, Any]:
    return {"value": value, "by": "x", "at": None, "source": source, "changes": "[]"}


class Base(unittest.TestCase):
    def setUp(self) -> None:
        patches = [
            mock.patch.object(appsettings, "_rows", {}),
            mock.patch.object(appsettings, "_loaded_at", None),
            mock.patch.object(appsettings, "_rows_ok", False),
            mock.patch.dict("os.environ", {"BQ_SPU": "p.d.spu_env", "GEMINI_MODEL": "model-env"}),
        ]
        for p in patches:
            p.__enter__()
            self.addCleanup(p.__exit__, None, None, None)


class GetTest(Base):
    def test_env_until_db_has_the_group(self) -> None:
        self.assertEqual(bq.location(SPU), "p.d.spu_env")
        self.assertEqual(appsettings.get("ai", "model"), "model-env")
        self.assertEqual(appsettings.source("bq"), "env")

    def test_db_wins_even_if_env_is_left(self) -> None:
        # 本番: 写したあとも環境変数は残っている。DB の値だけが効く
        appsettings._rows["bq"] = row({"spu": "p.d.spu_db"})
        self.assertEqual(bq.location(SPU), "p.d.spu_db")
        self.assertEqual(appsettings.source("bq"), "db")

    def test_blank_in_db_is_not_filled_from_env(self) -> None:
        # 画面で空にした = 使わない。環境変数に戻らない
        appsettings._rows["bq"] = row({"spu": ""})
        self.assertIsNone(bq.location(SPU))
        appsettings._rows["ai"] = row({"thinking": "high"})
        self.assertEqual(appsettings.get("ai", "model"), "gemini-3.5-flash")
        self.assertEqual(appsettings.get("ai", "concurrency"), 4)

    def test_trial_values_only_inside(self) -> None:
        appsettings._rows["bq"] = row({"spu": "p.d.spu_db"})
        with appsettings.trying("bq", {"spu": "p.d.spu_try"}):
            self.assertEqual(bq.location(SPU), "p.d.spu_try")
        self.assertEqual(bq.location(SPU), "p.d.spu_db")


class CleanTest(unittest.TestCase):
    def test_location_shape(self) -> None:
        got = appsettings.clean("bq", {"spu": " `p.d.t` ", "sku": ""})
        self.assertEqual(got["spu"], "p.d.t")
        self.assertEqual(got["sku"], "")
        with self.assertRaises(appsettings.Invalid):
            appsettings.clean("bq", {"spu": "d.t"})
        with self.assertRaises(appsettings.Invalid):
            appsettings.clean("bq", {"spu": "p.d.t; DROP"})

    def test_ai_values(self) -> None:
        got = appsettings.clean("ai", {"model": "gemini-x", "thinking": "HIGH", "concurrency": "8", "outlet_timeout": 60})
        self.assertEqual((got["thinking"], got["concurrency"], got["outlet_url"]), ("high", 8, ""))
        for bad in ({"model": ""}, {"model": "m", "thinking": "max"}, {"model": "m", "concurrency": 0}, {"model": "m", "outlet_url": "ftp://x"}):
            with self.assertRaises(appsettings.Invalid):
                appsettings.clean("ai", bad)


class EnsureTest(Base):
    """起動したあとの最初の読み込みで、DB にないまとめだけを、環境変数から一度だけ写す"""

    def run_ensure(self, in_db: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
        inserted: list[dict[str, Any]] = []
        state = dict(in_db)

        async def read(_conn: Any) -> dict[str, dict[str, Any]]:
            return dict(state)

        class Conn:
            async def execute(self, _sql: Any, params: dict[str, Any]) -> None:
                inserted.append(params)
                state[params["name"]] = row({}, "env")

        @contextlib.asynccontextmanager
        async def fake_db(write: bool = False):  # noqa: ARG001
            yield Conn()

        with mock.patch.object(appsettings, "_read", read), mock.patch.object(data_api, "db", fake_db):
            asyncio.run(appsettings.ensure())
        return inserted

    def test_copies_groups_missing_in_db(self) -> None:
        got = self.run_ensure({})
        self.assertEqual(sorted(p["name"] for p in got), ["ai", "bq"])
        self.assertEqual(set(appsettings._rows), {"ai", "bq"})

    def test_does_not_copy_again(self) -> None:
        self.assertEqual(self.run_ensure({"bq": row({"spu": "p.d.db"}), "ai": row({})}), [])

    def test_no_env_no_copy(self) -> None:
        with mock.patch.dict("os.environ", {}, clear=True):
            self.assertEqual(self.run_ensure({}), [])

    def test_db_down_keeps_env(self) -> None:
        @contextlib.asynccontextmanager
        async def broken(write: bool = False):  # noqa: ARG001
            raise RuntimeError("down")
            yield  # pragma: no cover

        with mock.patch.object(data_api, "db", broken):
            asyncio.run(appsettings.ensure())
        self.assertEqual(bq.location(SPU), "p.d.spu_env")


if __name__ == "__main__":
    unittest.main()
