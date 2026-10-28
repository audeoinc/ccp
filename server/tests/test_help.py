"""help.py(「？ 聞く」の保存と FAQ)の、DB を使わない部分の単体テスト。

  cd server && python -m unittest discover tests
"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ccp.help import MAX_PLACES, MAX_QUESTION, check_groups, check_record, merge_places, place_key  # noqa: E402


class CheckRecordTest(unittest.TestCase):
    def test_record(self) -> None:
        rec, err = check_record(
            {
                "question": " 承認を依頼するには? ",
                "answer": {"known": True, "reply": "…"},
                "lang": "en",
                "screen": {"page": "calendar", "open": "delivery card"},
                "part": {"el": "btn.approve", "label": "承認を依頼する"},
                "at": "2026-10-28T10:00:00Z",
                # だれが聞いたかは、送られても列にしない
                "user": "someone",
            }
        )
        self.assertIsNone(err)
        assert rec is not None
        self.assertEqual(rec["question"], "承認を依頼するには?")
        self.assertEqual(json.loads(rec["answer"])["known"], True)
        self.assertEqual(rec["lang"], "en")
        self.assertEqual(rec["element"], "btn.approve")
        self.assertFalse(rec["tell_dev"])
        self.assertNotIn("user", rec)

    def test_rejects_and_limits(self) -> None:
        self.assertIsNone(check_record({})[0])
        self.assertIsNone(check_record({"question": "  "})[0])
        rec, _ = check_record({"question": "x" * (MAX_QUESTION + 10), "lang": "fr", "tellDev": True})
        assert rec is not None
        self.assertEqual(len(rec["question"]), MAX_QUESTION)
        self.assertEqual(rec["lang"], "ja")
        self.assertTrue(rec["tell_dev"])
        self.assertIsNone(rec["element"])


class PlacesTest(unittest.TestCase):
    def test_place_key(self) -> None:
        self.assertEqual(place_key('{"page": "calendar", "view": "week"}', "x"), {"page": "calendar", "view": "week", "el": "x"})
        self.assertEqual(place_key("not json", None), {})

    def test_merge_counts_and_limits(self) -> None:
        a = {"page": "calendar"}
        merged = json.loads(merge_places(None, [a, a, {"page": "results"}, {}]))
        self.assertEqual(merged[0], {"page": "calendar", "count": 2})
        again = json.loads(merge_places(json.dumps(merged), [a]))
        self.assertEqual(again[0]["count"], 3)
        many = json.loads(merge_places(None, [{"page": f"p{i}"} for i in range(MAX_PLACES + 5)]))
        self.assertEqual(len(many), MAX_PLACES)


class CheckGroupsTest(unittest.TestCase):
    def test_groups(self) -> None:
        groups, err = check_groups(
            {
                "groups": [
                    {"faq_id": "f1", "question_ids": ["q1", "q1", "zz"], "answer_ja": {"reply": "a"}},
                    # 新しい束は、聞き方と答えがそろっているときだけ FAQ になる
                    {"question_ids": ["q2", "q1"], "question_ja": "q", "answer_ja": "a"},
                    {"question_ids": ["q3"], "question_ja": "聞き方だけ"},
                    {"faq_id": "unknown", "question_ids": ["q4"], "question_ja": "q", "answer_ja": "a"},
                ]
            },
            {"f1"},
            {"q1", "q2", "q3", "q4"},
        )
        self.assertIsNone(err)
        assert groups is not None
        self.assertEqual(groups[0]["faq_id"], "f1")
        self.assertEqual(groups[0]["question_ids"], ["q1"])
        self.assertEqual(groups[1]["faq_id"], None)
        # 前の束に入った質問は、次の束には入らない
        self.assertEqual(groups[1]["question_ids"], ["q2"])
        self.assertIsNotNone(groups[1]["texts"])
        self.assertIsNone(groups[2]["texts"])
        # 知らない FAQ の id は、新しい束として扱う
        self.assertIsNone(groups[3]["faq_id"])

    def test_needs_groups(self) -> None:
        self.assertIsNone(check_groups({}, set(), set())[0])


if __name__ == "__main__":
    unittest.main()
