"""bq_import.summarize_reviews(レビューの要約とキーワード。B5)の単体テスト。
Gemini(ccp.ai.generate)と DB(bq_import.db)を偽物に差し替える(クラウドのセッション・CI では、どちらも使えないため)。

  cd server && python -m unittest discover -s tests
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import unittest
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ccp import ai, bq_import  # noqa: E402
from ccp.bq_import import parse_summary, summarize_reviews, summary_basis  # noqa: E402

LAST = datetime(2026, 10, 16, 9, 0, tzinfo=timezone.utc)


def _row(i: int, **kw: Any) -> dict[str, Any]:
    r = {"id": f"p{i}", "market": "JP", "name": f"商品{i}", "rating": 4.2, "review_count": 10 + i,
         "last_review_at": LAST, "review_texts": "暖かい---軽い---袖が長い", "review_summary_basis": None}
    r.update(kw)
    return r


def _reply(summary: str = "暖かくて軽いと好評。袖が長いという声もある。", keywords: Any = None) -> str:
    if keywords is None:
        keywords = [{"term": "暖かい", "sentiment": "good"}, {"term": "軽い", "sentiment": "good"}, {"term": "袖が長い", "sentiment": "bad"}]
    return json.dumps({"summary": summary, "keywords": keywords}, ensure_ascii=False)


class _Result:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self._rows = rows

    def mappings(self) -> "_Result":
        return self

    def all(self) -> list[dict[str, Any]]:
        return self._rows


class FakeDb:
    """SELECT には products の行を返し、UPDATE の値を記録する"""

    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows
        self.updates: list[dict[str, Any]] = []

    @asynccontextmanager
    async def __call__(self, write: bool = False):  # noqa: ANN204 — bq_import.db の身代わり
        yield self

    async def execute(self, stmt: Any, params: Any = None) -> _Result:
        sql = str(stmt)
        if sql.lstrip().upper().startswith("UPDATE"):
            self.updates.extend(params)
            return _Result([])
        return _Result([dict(r) for r in self.rows])


class SummarizeTest(unittest.TestCase):
    def setUp(self) -> None:
        env = mock.patch.dict(os.environ, {"GOOGLE_CLOUD_PROJECT": "test", "GEMINI_CONCURRENCY": "2"})
        env.start()
        self.addCleanup(env.stop)

    def run_with(self, rows: list[dict[str, Any]], generate: Any, budget_s: float = 25) -> tuple[dict[str, int], FakeDb]:
        fake = FakeDb(rows)
        with mock.patch.object(bq_import, "db", fake), mock.patch.object(ai, "generate", generate):
            got = asyncio.run(summarize_reviews(budget_s))
        return got, fake

    def test_saves_summary_and_keywords(self) -> None:
        calls: list[str] = []

        async def gen(prompt: str) -> str:
            calls.append(prompt)
            return _reply()

        got, fake = self.run_with([_row(1)], gen)
        self.assertEqual(got, {"made": 1, "left": 0, "failed": 0})
        self.assertEqual(len(calls), 1)
        # 1 回の呼び出しで、要約とキーワードの両方を頼んでいる
        self.assertIn("keywords", calls[0])
        u = fake.updates[0]
        self.assertEqual(u["id"], "p1")
        self.assertTrue(u["s"].startswith("暖かくて"))
        self.assertEqual(u["b"], summary_basis(_row(1)))
        self.assertEqual(json.loads(u["k"]), [{"term": "暖かい", "sentiment": "good"}, {"term": "軽い", "sentiment": "good"},
                                              {"term": "袖が長い", "sentiment": "bad"}])

    def test_unchanged_count_and_date_is_not_remade(self) -> None:
        calls: list[str] = []

        async def gen(prompt: str) -> str:
            calls.append(prompt)
            return _reply()

        same = _row(1)
        same["review_summary_basis"] = summary_basis(same)
        changed = _row(2, review_summary_basis="1|2026-01-01T00:00:00+00:00")
        no_reviews = _row(3, review_texts=None)
        got, fake = self.run_with([same, changed, no_reviews], gen)
        self.assertEqual(got, {"made": 1, "left": 0, "failed": 0})
        self.assertEqual(len(calls), 1)
        self.assertEqual([u["id"] for u in fake.updates], ["p2"])

    def test_stops_calling_after_budget(self) -> None:
        calls: list[str] = []

        async def gen(prompt: str) -> str:
            calls.append(prompt)
            await asyncio.sleep(0.1)
            return _reply()

        # 同時に 2 件、1 件 0.1 秒。0.25 秒の上限なら、0・0.1・0.2 秒に始めた 6 件ほどで止まる(時間の揺れを見込んで幅をもたせる)
        got, fake = self.run_with([_row(i) for i in range(20)], gen, budget_s=0.25)
        self.assertGreater(got["made"], 0)
        self.assertLess(got["made"], 12)
        self.assertEqual(got["made"] + got["left"], 20)
        # 上限を過ぎてからは、新しく呼んでいない(呼んだ数 = 作った数)
        self.assertEqual(len(calls), got["made"])
        self.assertEqual(len(fake.updates), got["made"])

    def test_broken_reply_is_skipped(self) -> None:
        replies = {"p1": "これは JSON ではない", "p2": _reply(summary=""), "p3": json.dumps([1, 2]), "p4": _reply()}

        async def gen(prompt: str) -> str:
            pid = next(k for k in replies if f"商品{k[1:]}\n" in prompt)
            return replies[pid]

        async def boom(prompt: str) -> str:
            raise RuntimeError("429 RESOURCE_EXHAUSTED")

        got, fake = self.run_with([_row(i) for i in range(1, 5)], gen)
        self.assertEqual(got, {"made": 1, "left": 0, "failed": 3})
        self.assertEqual([u["id"] for u in fake.updates], ["p4"])

        got, fake = self.run_with([_row(1)], boom)
        self.assertEqual(got, {"made": 0, "left": 0, "failed": 1})
        self.assertEqual(fake.updates, [])

    def test_without_ai_settings_does_nothing(self) -> None:
        async def gen(prompt: str) -> str:
            raise AssertionError("呼ばれないはず")

        with mock.patch.dict(os.environ, {"GOOGLE_CLOUD_PROJECT": ""}):
            got, fake = self.run_with([_row(1)], gen)
        self.assertEqual(got, {"made": 0, "left": 0, "failed": 0})


class ParseSummaryTest(unittest.TestCase):
    def test_keeps_summary_when_keywords_are_broken(self) -> None:
        got = parse_summary(json.dumps({"summary": "よい", "keywords": "暖かい"}))
        self.assertEqual(got, ("よい", []))

    def test_filters_and_dedupes_keywords(self) -> None:
        kws = [{"term": " 暖かい ", "sentiment": "GOOD"}, {"term": "暖かい", "sentiment": "good"}, {"term": "", "sentiment": "bad"},
               {"term": "ふつう", "sentiment": "neutral"}, "軽い", {"term": "x" * 80, "sentiment": "bad"}]
        _, keywords = parse_summary(json.dumps({"summary": "s", "keywords": kws})) or ("", [])
        self.assertEqual(keywords[0], {"term": "暖かい", "sentiment": "good"})
        self.assertEqual(len(keywords), 2)
        self.assertEqual(len(keywords[1]["term"]), bq_import.KEYWORD_LEN)

    def test_at_most_six(self) -> None:
        kws = [{"term": f"w{i}", "sentiment": "good"} for i in range(10)]
        _, keywords = parse_summary(json.dumps({"summary": "s", "keywords": kws})) or ("", [])
        self.assertEqual(len(keywords), bq_import.KEYWORDS_MAX)

    def test_broken_is_none(self) -> None:
        self.assertIsNone(parse_summary("{"))
        self.assertIsNone(parse_summary(json.dumps({"keywords": []})))
        self.assertIsNone(parse_summary("[]"))


if __name__ == "__main__":
    unittest.main()
