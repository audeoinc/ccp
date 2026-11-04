"""配信の効果の見本(server/ccp/impact.py の generate)"""
import json
import unittest

from ccp.impact import SAMPLE_TASKS, generate

CARDS = [{"id": f"c{i}", "country": "US" if i % 2 else "JP", "channel": "email", "scheduled_at": f"2026-09-{i + 1:02d}T10:00:00", "cancelled_at": None} for i in range(20)]
RESULTS = [
    {"id": f"r{i}", "delivery_card_id": f"c{i}", "sent_at": f"2026-09-{i + 1:02d}T10:00:00", "recipients": 10000, "orders": 30, "revenue": 3000, "notes": "Worked: warm hero" if i < 4 else None}
    for i in range(20)
]


class GenerateTest(unittest.TestCase):
    def test_same_input_same_rows(self):
        self.assertEqual(generate(CARDS, RESULTS), generate(CARDS, RESULTS))

    def test_rows_are_valid(self):
        runs, lifts = generate(CARDS, RESULTS)
        self.assertEqual(len(lifts), len(CARDS))
        self.assertEqual(len(runs), len(CARDS) * len(SAMPLE_TASKS))
        by_id = {r["id"]: r for r in RESULTS}
        for run in runs:
            self.assertEqual(run["sample"], 1)
            self.assertIn(run["adoption"], ("as_is", "edited", "rejected"))
            card = next(c for c in CARDS if c["id"] == run["delivery_card_id"])
            # 渡す学びは、同じ国・チャネルの、それより前の配信のメモだけ
            for lid in json.loads(run["learning_ids"]):
                src = by_id[lid]
                src_card = next(c for c in CARDS if c["id"] == src["delivery_card_id"])
                self.assertEqual(src_card["country"], card["country"])
                self.assertLess(src["sent_at"], card["scheduled_at"])
        for lift in lifts:
            # 送った群の 1 人あたりの売上は、送らなかった群より多い(増分は正)
            self.assertGreater(lift["treated_revenue"] / lift["treated_users"], lift["holdout_revenue"] / lift["holdout_users"])

    def test_withheld_learnings_are_not_passed(self):
        # わざと渡さなかった学び(X56 の (c))は、渡した学びと重ならず、渡せた学び(同じ国・前の配信)の中から選ぶ
        runs, _ = generate(CARDS, RESULTS)
        by_id = {r["id"]: r for r in RESULTS}
        seen = False
        for run in runs:
            withheld = json.loads(run.get("withheld_ids") or "[]")
            seen = seen or bool(withheld)
            self.assertFalse(set(withheld) & set(json.loads(run["learning_ids"])))
            card = next(c for c in CARDS if c["id"] == run["delivery_card_id"])
            for lid in withheld:
                src_card = next(c for c in CARDS if c["id"] == by_id[lid]["delivery_card_id"])
                self.assertEqual(src_card["country"], card["country"])
        self.assertTrue(seen)

    def test_ab_variant_lifts(self):
        # AB テストの配信は、配信全体の行と、案ごとの行(X56 の (d))。案の送った人を足すと全体になり、送らなかった群は共通
        results = RESULTS + [
            {"id": "ra", "delivery_card_id": "c19", "variant": "A", "sent_at": "2026-09-20T10:00:00", "recipients": 6000, "orders": 20, "revenue": 2000, "notes": None},
            {"id": "rb", "delivery_card_id": "c19", "variant": "B", "sent_at": "2026-09-20T10:00:00", "recipients": 4000, "orders": 10, "revenue": 1000, "notes": None},
            # 勝ち案を残りに送った分(同じ案の 2 つめの行。案 B として足す)
            {"id": "rb2", "delivery_card_id": "c19", "variant": "B", "sent_at": "2026-09-20T14:00:00", "recipients": 20000, "orders": 40, "revenue": 5000, "notes": None},
        ]
        _, lifts = generate(CARDS, results)
        rows = [l for l in lifts if l["delivery_card_id"] == "c19"]
        whole = next(l for l in rows if not l.get("variant"))
        parts = [l for l in rows if l.get("variant")]
        self.assertEqual(sorted(l["variant"] for l in parts), ["A", "B"])
        self.assertEqual(sum(l["treated_users"] for l in parts), whole["treated_users"])
        self.assertAlmostEqual(sum(l["treated_revenue"] for l in parts), whole["treated_revenue"], delta=0.02)
        for l in parts:
            self.assertEqual((l["holdout_users"], l["holdout_revenue"]), (whole["holdout_users"], whole["holdout_revenue"]))


if __name__ == "__main__":
    unittest.main()
