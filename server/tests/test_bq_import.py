"""bq_import.py の、DB・BigQuery を使わない部分の単体テスト(更新の判定・天気の選択肢)。

  cd server && python -m unittest discover tests
"""
from __future__ import annotations

import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ccp.bq_import import _weather_choice, changed  # noqa: E402

NOW = datetime(2026, 10, 17, 3, 0, tzinfo=timezone.utc)


class ChangedTest(unittest.TestCase):
    def test_first_time_is_changed(self) -> None:
        self.assertTrue(changed(None, NOW, NOW))

    def test_table_compares_modified(self) -> None:
        prev = {"source_modified": NOW - timedelta(hours=1), "imported_at": NOW - timedelta(minutes=1)}
        self.assertFalse(changed(prev, NOW - timedelta(hours=1), NOW))
        self.assertTrue(changed(prev, NOW - timedelta(minutes=5), NOW))

    def test_view_without_watch_rereads_after_interval(self) -> None:
        self.assertFalse(changed({"source_modified": None, "imported_at": NOW - timedelta(minutes=3)}, None, NOW))
        self.assertTrue(changed({"source_modified": None, "imported_at": NOW - timedelta(minutes=30)}, None, NOW))


class WeatherChoiceTest(unittest.TestCase):
    def test_strongest_lift_over_20_percent(self) -> None:
        self.assertEqual(_weather_choice({"lift_cold": 0.8, "lift_rain": 0.3, "lift_hot": -0.5}), "cold")
        self.assertEqual(_weather_choice({"lift_cold": None, "lift_rain": 0.25, "lift_hot": 0.1}), "rainy")

    def test_weak_or_missing_is_none(self) -> None:
        self.assertIsNone(_weather_choice({"lift_cold": 0.1, "lift_rain": 0.05, "lift_hot": -0.2}))
        self.assertIsNone(_weather_choice({}))


if __name__ == "__main__":
    unittest.main()
