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


if __name__ == "__main__":
    unittest.main()
