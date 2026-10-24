"""optional.hosted(ccp/hosted/ を、あれば読み込む)の単体テスト。

  cd server && python -m unittest discover tests
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ccp import optional  # noqa: E402


class OptionalHostedTest(unittest.TestCase):
    def setUp(self) -> None:
        optional.hosted.cache_clear()

    def test_absent_file_is_silent(self) -> None:
        # ファイルがない(この環境では使わない)ときは、黙って None
        with self.assertNoLogs("ccp.optional", level="WARNING"):
            self.assertIsNone(optional.hosted("no_such_module_for_test", "x"))

    def test_absent_folder_is_silent(self) -> None:
        err = ModuleNotFoundError("No module named 'ccp.hosted'", name="ccp.hosted")
        with mock.patch("importlib.import_module", side_effect=err), self.assertNoLogs("ccp.optional", level="WARNING"):
            self.assertIsNone(optional.hosted("routes", "router"))

    def test_missing_dependency_is_logged(self) -> None:
        # ファイルはあるのに、中で使う依存が入っていない(本番で気づけなかった形)
        err = ModuleNotFoundError("No module named 'some_db_driver'", name="some_db_driver")
        with mock.patch("importlib.import_module", side_effect=err), self.assertLogs("ccp.optional", level="WARNING") as logs:
            self.assertIsNone(optional.hosted("connect", "create_engine"))
        self.assertIn("some_db_driver", logs.output[0])

    def test_error_inside_is_logged(self) -> None:
        with mock.patch("importlib.import_module", side_effect=SyntaxError("bad")), self.assertLogs("ccp.optional", level="WARNING"):
            self.assertIsNone(optional.hosted("routes", "router"))

    def test_present_is_loaded(self) -> None:
        fake = mock.Mock(router="R")
        with mock.patch("importlib.import_module", return_value=fake):
            self.assertEqual(optional.hosted("routes", "router"), "R")


if __name__ == "__main__":
    unittest.main()
