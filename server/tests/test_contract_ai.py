"""AI の出口の契約テスト(docs/ARCHITECTURE.md の 0.5 章): Gemini と外の層(AI_OUTLET_URL)が、同じ依頼に同じに振る舞う。

同じテスト(Contract)を、アダプターごとの組み立て(GeminiAdapter・OutletAdapter)で 2 回流す。
どちらも本物の AI は呼ばない: Gemini は呼び出し口(get_client)を偽物に、外の層は見本の層(tools/ai-outlet/sample_layer.py)を
手元で立てて、答える AI だけを差し替える。アダプターを足したら、ここに組み立てを 1 つ足す。
"""
import asyncio
import importlib.util
import json
import os
import threading
import time
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest import mock

import httpx

from ccp import ai

_spec = importlib.util.spec_from_file_location("sample_layer", Path(__file__).resolve().parents[2] / "tools" / "ai-outlet" / "sample_layer.py")
layer = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(layer)


class Contract:
    """どのアダプターでも同じになること。答える AI は answer(parts, effort) で差し替える。
    parts は [("text", 文) | ("image", 種類, 中身)] にならした形(アダプターごとの渡し方の違いは、組み立ての側で吸収する)"""

    via = ""

    def setUp(self) -> None:
        self.got: list[tuple[list, str | None]] = []
        self.answer = lambda parts, effort: '{"ok": true}'
        # 上限の門は、イベントループごとに作り直す(asyncio.run のたびにループが変わるため)
        ai._gate = None
        self.start()

    def _answer(self, parts, effort):
        self.got.append((parts, effort))
        return self.answer(parts, effort)

    def ask(self, prompt: str = "x"):
        res = asyncio.run(ai.ask(ai.AskIn(prompt=prompt)))
        if isinstance(res, dict):
            return 200, res
        return res.status_code, json.loads(res.body)

    def failure(self) -> BaseException:
        """generate() が投げた例外(投げなければテストを落とす)"""
        try:
            asyncio.run(ai.generate("ask", ["x"]))
        except Exception as e:  # noqa: BLE001
            return e
        self.fail("失敗のはずが、答えが返った")

    # ---- 答えるとき

    def test_text_is_returned_trimmed(self):
        self.answer = lambda parts, effort: '  {"a": 1}\n'
        self.assertEqual(asyncio.run(ai.generate("ask", ["下書きして"])), '{"a": 1}')
        self.assertEqual(self.ask("下書きして"), (200, {"success": True, "text": '{"a": 1}'}))

    def test_parts_and_effort_reach_the_ai_in_order(self):
        img = ai.Image(b"\x89PNG", "image/png")
        asyncio.run(ai.generate("hero_describe", [img, "説明して"], effort="medium"))
        self.assertEqual(self.got, [([("image", "image/png", b"\x89PNG"), ("text", "説明して")], "medium")])

    def test_ask_uses_thinking_setting(self):
        self.ask("x")
        self.assertEqual(self.got[0][1], "low")

    def test_try_call_reports_ok_and_route(self):
        out = asyncio.run(ai.try_call())
        self.assertTrue(out["ok"], out)
        self.assertEqual((out["via"], out["message"]), (self.via, ""))

    # ---- 失敗の形

    def test_empty_answer_is_a_failure(self):
        self.answer = lambda parts, effort: ""
        status, body = self.ask()
        self.assertEqual(status, 502)
        self.assertFalse(body["success"])
        self.assertIn("空でした", body["error"]["message"])

    def test_busy_is_said_busy(self):
        def busy(parts, effort):
            raise RuntimeError("429 RESOURCE_EXHAUSTED")

        self.answer = busy
        status, body = self.ask()
        self.assertEqual(status, 502)
        self.assertIn("混み合っています", body["error"]["message"])
        self.assertIn("混み合", ai.explain(self.failure()))

    def test_other_error_is_a_502_with_reason(self):
        def broken(parts, effort):
            raise ValueError("こわれた")

        self.answer = broken
        status, body = self.ask()
        self.assertEqual(status, 502)
        self.assertTrue(body["error"]["message"].startswith("AI の呼び出しに失敗しました"))
        out = asyncio.run(ai.try_call())
        self.assertFalse(out["ok"])
        self.assertTrue(out["message"])

    def test_timeout_is_said_timeout(self):
        self.make_slow()
        status, body = self.ask()
        self.assertEqual(status, 502)
        self.assertIn("時間内に返事がありませんでした", ai.explain(self.failure()))

    def test_unreachable_is_said_unreachable(self):
        self.make_unreachable()
        status, _ = self.ask()
        self.assertEqual(status, 502)
        self.assertIn("届きませんでした", ai.explain(self.failure()))

    # ---- 同時の上限

    def test_concurrency_limit_applies(self):
        active = peak = 0
        lock = threading.Lock()

        def slow(parts, effort):
            nonlocal active, peak
            with lock:
                active += 1
                peak = max(peak, active)
            time.sleep(0.15)
            with lock:
                active -= 1
            return "{}"

        self.answer = slow

        async def many():
            await asyncio.gather(*[ai.generate("ask", ["x"]) for _ in range(5)])

        with mock.patch.dict(os.environ, {"GEMINI_CONCURRENCY": "2"}):
            asyncio.run(many())
        self.assertEqual(peak, 2)


def _no_outlet_env():
    return mock.patch.dict(os.environ, {"AI_OUTLET_URL": "", "AI_OUTLET_TOKEN": "", "GOOGLE_CLOUD_PROJECT": "test"})


class GeminiAdapter(Contract, unittest.TestCase):
    """Gemini: 呼び出し口を偽物にする。SDK が投げる例外(時間切れ・つながらない)は、httpx の例外で真似る"""

    via = "gemini"

    def start(self) -> None:
        test = self

        class Models:
            async def generate_content(self, *, model, contents, config):
                items = contents if isinstance(contents, list) else [contents]
                parts = [("text", c) if isinstance(c, str) else ("image", c.inline_data.mime_type, c.inline_data.data) for c in items]
                level = config.thinking_config.thinking_level.value.lower() if config.thinking_config else None
                text = await asyncio.to_thread(test._answer, parts, level)
                return mock.Mock(text=text)

        client = mock.Mock()
        client.aio.models = Models()
        for p in (_no_outlet_env(), mock.patch.object(ai, "get_client", lambda: client)):
            p.start()
            self.addCleanup(p.stop)

    def make_slow(self) -> None:
        def slow(parts, effort):
            raise httpx.ReadTimeout("timed out")

        self.answer = slow

    def make_unreachable(self) -> None:
        def down(parts, effort):
            raise httpx.ConnectError("[Errno 11001] getaddrinfo failed")

        self.answer = down


def _no_gemini():
    raise AssertionError("出口があるのに Gemini を呼んだ")


class OutletAdapter(Contract, unittest.TestCase):
    """外の層: 見本の層を手元で立てる(層の約束の parts を、ならした形に戻して answer に渡す)"""

    via = "outlet"

    def start(self) -> None:
        import base64

        test = self

        def answer(parts, effort):
            flat = [("text", p["text"]) if "text" in p else ("image", p["image"]["mime_type"], base64.b64decode(p["image"]["data"])) for p in parts]
            return test._answer(flat, effort)

        handler = type("H", (layer.Handler,), {"answer": staticmethod(answer), "token": "t0ken", "log_message": lambda *a: None})
        # 時間切れのテストでは、層が答えを書く前に CCP が切る。その書き込みの失敗は、出さない
        self.server = type("S", (ThreadingHTTPServer,), {"handle_error": lambda *a: None})(("127.0.0.1", 0), handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self._stop)
        url = f"http://127.0.0.1:{self.server.server_port}/ask"
        for p in (mock.patch.dict(os.environ, {"AI_OUTLET_URL": url, "AI_OUTLET_TOKEN": "t0ken", "AI_OUTLET_TIMEOUT": "10"}), mock.patch.object(ai, "get_client", _no_gemini)):
            p.start()
            self.addCleanup(p.stop)

    def _stop(self) -> None:
        if self.server:
            self.server.shutdown()
            self.server.server_close()
            self.server = None

    def make_slow(self) -> None:
        def slow(parts, effort):
            time.sleep(1.5)
            return "{}"

        self.answer = slow
        p = mock.patch.dict(os.environ, {"AI_OUTLET_TIMEOUT": "1"})
        p.start()
        self.addCleanup(p.stop)

    def make_unreachable(self) -> None:
        self._stop()


if __name__ == "__main__":
    unittest.main()
