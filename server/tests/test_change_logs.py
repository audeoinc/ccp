"""data_api.py の変更の記録(change_logs)で見張る列の確かめ(X1)。

  cd server && python -m unittest discover tests
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ccp import schema as sc  # noqa: E402
from ccp.data_api import WATCHED  # noqa: E402


class WatchedColumnsTest(unittest.TestCase):
    def test_watched_columns_exist(self) -> None:
        # 列の名前を書き間違えると、その項目の変更が黙って残らなくなるので、schema.json と突き合わせる
        s = sc.load()
        for table, (cols, extra) in WATCHED.items():
            t = s.table(table)
            names = {c.pg for c in t.columns} | {lk.pg for lk in t.lookups}
            for col in [*cols, extra]:
                self.assertIn(col, names, f"{table}.{col}")

    def test_card_kinds(self) -> None:
        cols, _ = WATCHED["delivery_cards"]
        # 日程の変更のアラートは date だけを見る。中身の変更は edit(アラートにしない)
        self.assertEqual(cols["scheduled_at"], "date")
        self.assertEqual(cols["instructions"], "edit")
        self.assertNotIn("status", cols)


if __name__ == "__main__":
    unittest.main()
