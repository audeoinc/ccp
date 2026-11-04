"""AI の設定のモデルの一覧と「試す」(server/ccp/ai.py)。AI は呼ばない(身代わり)。

  cd server && python -m unittest discover tests
"""
from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ccp import ai, appsettings  # noqa: E402


class Base(unittest.TestCase):
    def setUp(self) -> None:
        for p in (
            mock.patch.object(appsettings, "_rows", {}),
            mock.patch.object(appsettings, "_rows_ok", True),
            mock.patch.object(appsettings, "ensure", mock.AsyncMock()),
            mock.patch.object(ai, "_models", {"models": [], "at": None, "live": False, "error": ""}),
            mock.patch.dict("os.environ", {"GEMINI_MODEL": "gemini-x"}, clear=False),
        ):
            p.__enter__()
            self.addCleanup(p.__exit__, None, None, None)


class ModelsTest(Base):
    def test_unreadable_falls_back_to_builtin_and_keeps_current(self) -> None:
        with mock.patch.object(ai, "_read_models", side_effect=PermissionError("403 PERMISSION_DENIED")):
            got = asyncio.run(ai.list_models())
        self.assertFalse(got["live"])
        self.assertTrue(got["builtin"])
        self.assertIn("権限", got["error"])
        # いまのモデルは、一覧になくても選べるように先頭に
        self.assertEqual(got["models"][0], "gemini-x")
        self.assertIn(ai.DEFAULT_MODELS[0], got["models"])

    def test_keeps_last_list_when_refresh_fails(self) -> None:
        with mock.patch.object(ai, "_read_models", return_value=["gemini-9-flash"]):
            asyncio.run(ai.list_models())
        with mock.patch.object(ai, "_read_models", side_effect=TimeoutError()):
            got = asyncio.run(ai.list_models(refresh=True))
        self.assertIn("gemini-9-flash", got["models"])
        self.assertFalse(got["live"])
        self.assertFalse(got["builtin"])

    def test_cached_for_a_day(self) -> None:
        reader = mock.Mock(return_value=["gemini-9-flash"])
        with mock.patch.object(ai, "_read_models", reader):
            asyncio.run(ai.list_models())
            asyncio.run(ai.list_models())
        self.assertEqual(reader.call_count, 1)


class OrderTest(unittest.TestCase):
    def test_only_current_text_models_newest_first(self) -> None:
        got = ai.text_models([
            "gemini-nano-banana-2.1", "gemini-omni-1.1-flash-preview", "gemini-3.5-transcribe", "gemini-3.5-transcribe-preview",
            "gemini-2.5-pro-exp-03-25", "gemini-2.5-flash-preview-04-17", "gemini-1.5-pro-002", "text-embedding-005",
            "gemini-2.5-flash", "gemini-3.5-flash-lite", "gemini-3.5-pro", "gemini-3.5-flash", "gemini-3.8-flash", "gemini-3.8-flash-preview", "gemini-4-argon",
        ])
        self.assertEqual(got, ["gemini-4-argon", "gemini-3.8-flash", "gemini-3.8-flash-preview", "gemini-3.5-flash", "gemini-3.5-pro", "gemini-3.5-flash-lite", "gemini-2.5-flash"])


class TryTest(Base):
    def test_ok_uses_values_being_tried(self) -> None:
        seen: list[str] = []

        async def gen(*_a, **_k):
            seen.append(str(appsettings.get("ai", "model")))
            return '{"ok": true}'

        with mock.patch.object(ai, "generate", gen):
            got = asyncio.run(ai.try_call({"model": "gemini-y"}))
        self.assertTrue(got["ok"])
        self.assertEqual(seen, ["gemini-y"])
        # 試したあとは、もとの値に戻る
        self.assertEqual(appsettings.get("ai", "model"), "gemini-x")

    def test_failure_is_explained(self) -> None:
        async def gen(*_a, **_k):
            raise RuntimeError("404 NOT_FOUND: Publisher model was not found")

        with mock.patch.object(ai, "generate", gen):
            got = asyncio.run(ai.try_call({"model": "gemini-nope"}))
        self.assertFalse(got["ok"])
        self.assertIn("見つかりません", got["message"])


if __name__ == "__main__":
    unittest.main()
