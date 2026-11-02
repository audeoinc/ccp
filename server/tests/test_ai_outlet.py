"""AI の出口(AI_OUTLET_URL。docs/AI_OUTLET.md): 4 か所が、見本の層(tools/ai-outlet/sample_layer.py)を通っても同じに動く。
層が失敗しても、Gemini に回さない"""
import asyncio
import base64
import importlib.util
import io
import json
import os
import threading
import unittest
from contextlib import redirect_stdout
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest import mock

from ccp import ai, check, heroes, parts
from ccp import product_pages as pp

_spec = importlib.util.spec_from_file_location("sample_layer", Path(__file__).resolve().parents[2] / "tools" / "ai-outlet" / "sample_layer.py")
layer = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(layer)


class FakeRequest:
    def __init__(self, data: bytes, content_type: str):
        self._data = data
        self.headers = {"content-type": content_type}

    async def body(self) -> bytes:
        return self._data


def no_gemini():
    raise AssertionError("出口があるのに Gemini を呼んだ")


class OutletTest(unittest.TestCase):
    """見本の層を手元で立て、答える AI だけを差し替える(受けたものを記録して、決まった答えを返す)"""

    def setUp(self) -> None:
        self.got: list[tuple[list, str | None]] = []
        self.reply = '{"ok": true}'
        self.fail: Exception | None = None

        def answer(parts_, effort):
            self.got.append((parts_, effort))
            if self.fail:
                raise self.fail
            return self.reply

        handler = type("H", (layer.Handler,), {"answer": staticmethod(answer), "token": "t0ken", "log_message": lambda *a: None})
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.server.server_port}/ask"
        env = mock.patch.dict(os.environ, {"AI_OUTLET_URL": self.url, "AI_OUTLET_TOKEN": "t0ken", "AI_OUTLET_TIMEOUT": "10"})
        env.start()
        self.addCleanup(env.stop)
        g = mock.patch.object(ai, "get_client", no_gemini)
        g.start()
        self.addCleanup(g.stop)
        # 上限の門は、イベントループごとに作り直す(asyncio.run のたびにループが変わるため)
        ai._gate = None

    def tearDown(self) -> None:
        if self.server:
            self.server.shutdown()
            self.server.server_close()

    def test_ask_goes_through_outlet_with_effort(self):
        res = asyncio.run(ai.ask(ai.AskIn(prompt="下書きして")))
        self.assertEqual(res, {"success": True, "text": '{"ok": true}'})
        self.assertEqual(self.got, [([{"text": "下書きして"}], "low")])

    def test_hero_and_part_describe_send_image_then_prompt(self):
        self.reply = '{"name": "秋の公園"}'
        res = asyncio.run(heroes.describe_image(FakeRequest(b"JPEG", "image/jpeg"), "en"))
        self.assertEqual(res["data"], {"name": "秋の公園"})
        res = asyncio.run(parts.describe_image(FakeRequest(b"PNG", "image/png")))
        self.assertEqual(res["data"], {"name": "秋の公園"})
        (hero_parts, hero_effort), (part_parts, _) = self.got
        self.assertEqual(hero_parts[0], {"image": {"mime_type": "image/jpeg", "data": base64.b64encode(b"JPEG").decode()}})
        self.assertIn("英語", hero_parts[1]["text"])
        self.assertIsNone(hero_effort)
        self.assertEqual(part_parts[0]["image"]["mime_type"], "image/png")

    def test_product_image_suggest_sends_labels_and_images_in_order(self):
        self.reply = json.dumps({"images": [{"index": 0, "angle": "front", "note": ""}], "picks": [{"index": 0, "reason": "正面"}]})

        async def judged(srcs):
            return {}

        async def save(found):
            pass

        body = pp.SuggestIn(images=[pp.SuggestImage(src="https://www.example.com/a.jpg", alt="正面")])
        with mock.patch.object(pp, "judged_angles", judged), mock.patch.object(pp, "save_angles", save), \
                mock.patch.object(pp, "_read", lambda src: (b"jpg", "image/jpeg")):
            out = asyncio.run(pp.suggest(body))["data"]
        self.assertEqual(out["picks"], [{"index": 0, "reason": "正面"}])
        sent = self.got[0][0]
        self.assertEqual([("image" if "image" in p else "text") for p in sent], ["text", "text", "text", "text", "image"])
        self.assertIn("画像 0(ページの説明: 正面)", sent[3]["text"])

    def test_purposes_are_sent(self):
        seen: list[str] = []
        real = layer.handle

        def spy(body, answer):
            seen.append(body["purpose"])
            self.assertEqual((body["version"], body["response_format"]), (1, "json"))
            return real(body, answer)

        with mock.patch.object(layer, "handle", spy):
            asyncio.run(ai.ask(ai.AskIn(prompt="x")))
            asyncio.run(heroes.describe_image(FakeRequest(b"J", "image/jpeg")))
            asyncio.run(parts.describe_image(FakeRequest(b"J", "image/jpeg")))
        self.assertEqual(seen, ["ask", "hero_describe", "part_describe"])

    def test_failure_is_shown_and_not_sent_to_gemini(self):
        self.fail = RuntimeError("429 RESOURCE_EXHAUSTED")
        res = asyncio.run(ai.ask(ai.AskIn(prompt="x")))
        self.assertEqual(res.status_code, 502)
        msg = json.loads(res.body)["error"]["message"]
        self.assertIn("混み合っています", msg)
        self.assertIn("AI の呼び出しに失敗しました", msg)
        # 画像の所は、層の理由をそのまま見せる
        res = asyncio.run(heroes.describe_image(FakeRequest(b"J", "image/jpeg")))
        self.assertEqual(res.status_code, 502)
        self.assertIn("RuntimeError", json.loads(res.body)["error"]["message"])

    def test_wrong_token_is_refused(self):
        with mock.patch.dict(os.environ, {"AI_OUTLET_TOKEN": "other"}):
            res = asyncio.run(ai.ask(ai.AskIn(prompt="x")))
        self.assertEqual(res.status_code, 502)
        self.assertIn("合言葉が違います", json.loads(res.body)["error"]["message"])
        self.assertEqual(self.got, [])

    def test_empty_answer_is_a_failure(self):
        self.reply = ""
        res = asyncio.run(ai.ask(ai.AskIn(prompt="x")))
        self.assertEqual(res.status_code, 502)

    def test_unreachable_outlet_says_so(self):
        self.server.shutdown()
        self.server.server_close()
        self.server = None
        res = asyncio.run(ai.ask(ai.AskIn(prompt="x")))
        self.assertIn("届きませんでした", json.loads(res.body)["error"]["message"])

    def test_concurrency_limit_applies_to_outlet(self):
        active = peak = 0
        lock = threading.Lock()
        release = threading.Event()

        def slow(parts_, effort):
            nonlocal active, peak
            with lock:
                active += 1
                peak = max(peak, active)
            release.wait(0.2)
            with lock:
                active -= 1
            return "{}"

        handler = type("H2", (layer.Handler,), {"answer": staticmethod(slow), "token": "t0ken", "log_message": lambda *a: None})
        self.server.RequestHandlerClass = handler

        async def many():
            await asyncio.gather(*[ai.generate("ask", ["x"]) for _ in range(5)])

        with mock.patch.dict(os.environ, {"GEMINI_CONCURRENCY": "2"}):
            asyncio.run(many())
        self.assertLessEqual(peak, 2)

    def test_check_shows_outlet_without_token(self):
        buf = io.StringIO()
        with redirect_stdout(buf):
            ng = check.check_outlet()
        self.assertEqual(ng, 0)
        self.assertIn("届きます", buf.getvalue())
        self.assertIn("合言葉: あり", buf.getvalue())
        self.assertNotIn("t0ken", buf.getvalue())


class NoOutletTest(unittest.TestCase):
    def test_empty_url_uses_gemini_as_before(self):
        sent = {}

        class Models:
            async def generate_content(self, **kw):
                sent.update(kw)
                return mock.Mock(text=' {"a": 1} ')

        client = mock.Mock()
        client.aio.models = Models()
        ai._gate = None
        with mock.patch.dict(os.environ, {"AI_OUTLET_URL": ""}), mock.patch.object(ai, "get_client", lambda: client):
            res = asyncio.run(ai.ask(ai.AskIn(prompt="下書き")))
        self.assertEqual(res, {"success": True, "text": '{"a": 1}'})
        self.assertEqual(sent["contents"], "下書き")
        self.assertEqual(sent["config"].response_mime_type, "application/json")

    def test_check_without_outlet(self):
        buf = io.StringIO()
        with mock.patch.dict(os.environ, {"AI_OUTLET_URL": ""}), redirect_stdout(buf):
            self.assertEqual(check.check_outlet(), 0)
        self.assertIn("Gemini", buf.getvalue())


if __name__ == "__main__":
    unittest.main()
