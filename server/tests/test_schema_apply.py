"""起動時のテーブルの反映を、変わったときだけにする(整理⑥。data_api.apply_schema と schema.ddl_hash)の単体テスト。DB は使わない。

  cd server && python -m unittest discover tests
"""
from __future__ import annotations

import asyncio
import copy
import sys
import unittest
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ccp import schema as sc  # noqa: E402
from ccp.data_api import apply_schema  # noqa: E402


def _changed(f) -> sc.Schema:
    s = copy.deepcopy(sc.load())
    f(s)
    return s


class DdlHashTest(unittest.TestCase):
    """指紋は、DB に流す SQL の全体から作る。型・列・索引のどれが変わっても変わること(変わったのに流さない、を防ぐ)"""

    def test_stable(self) -> None:
        self.assertEqual(sc.load().ddl_hash(), copy.deepcopy(sc.load()).ddl_hash())

    def test_type_change_changes_hash(self) -> None:
        base = sc.load().ddl_hash()

        def retype(s: sc.Schema) -> None:
            col = next(c for c in s.tables["delivery_cards"].columns if c.type == "text")
            col.type = "int"

        self.assertNotEqual(base, _changed(retype).ddl_hash())

    def test_added_column_and_index_change_hash(self) -> None:
        base = sc.load().ddl_hash()

        def add(s: sc.Schema) -> None:
            t = s.tables["products"]
            t.columns.append(sc.Column("x_new", "text"))

        def index(s: sc.Schema) -> None:
            col = next(c for c in s.tables["products"].columns if not c.index)
            col.index = True

        self.assertNotEqual(base, _changed(add).ddl_hash())
        self.assertNotEqual(base, _changed(index).ddl_hash())


class _Result:
    def __init__(self, scalar: Any = None, rows: list[tuple[str, str]] | None = None):
        self._scalar, self._rows = scalar, rows or []

    def scalar(self) -> Any:
        return self._scalar

    def __iter__(self):
        return iter(self._rows)


class _Conn:
    """execute に来た SQL を覚え、指紋と列の一覧を返すだけの、身代わりの接続"""

    def __init__(self, stored_hash: str | None, columns: set[tuple[str, str]]):
        self.stored_hash, self.columns, self.sql = stored_hash, columns, []

    async def execute(self, stmt: Any, params: dict[str, Any] | None = None) -> _Result:
        q = str(stmt)
        self.sql.append(q)
        if q.startswith("SELECT ddl_hash"):
            return _Result(self.stored_hash)
        if "information_schema.columns" in q:
            return _Result(rows=sorted(self.columns))
        if q.startswith("INSERT INTO ccp_schema_state"):
            self.stored_hash = (params or {})["h"]
        return _Result()


def _ran_ddl(conn: _Conn) -> bool:
    return any(q.startswith("ALTER TABLE") for q in conn.sql)


class ApplySchemaTest(unittest.TestCase):
    def setUp(self) -> None:
        self.schema = sc.load()
        self.full = self.schema.expected_columns()

    def test_skips_when_hash_matches_and_columns_exist(self) -> None:
        conn = _Conn(self.schema.ddl_hash(), self.full)
        self.assertFalse(asyncio.run(apply_schema(conn)))
        self.assertFalse(_ran_ddl(conn))

    def test_runs_when_hash_differs(self) -> None:
        conn = _Conn("old", self.full)
        self.assertTrue(asyncio.run(apply_schema(conn)))
        self.assertTrue(_ran_ddl(conn))
        self.assertEqual(conn.stored_hash, self.schema.ddl_hash())

    def test_runs_when_never_applied(self) -> None:
        conn = _Conn(None, set())
        self.assertTrue(asyncio.run(apply_schema(conn)))

    def test_runs_when_a_column_is_missing(self) -> None:
        # 指紋が同じでも、列が欠けていれば流す(手で消した・古い写しを戻した など)
        missing = set(self.full)
        missing.discard(next(iter(sorted(missing))))
        conn = _Conn(self.schema.ddl_hash(), missing)
        self.assertTrue(asyncio.run(apply_schema(conn)))

    def test_force_always_runs(self) -> None:
        conn = _Conn(self.schema.ddl_hash(), self.full)
        self.assertTrue(asyncio.run(apply_schema(conn, force=True)))

    def test_takes_the_lock_first(self) -> None:
        conn = _Conn(self.schema.ddl_hash(), self.full)
        asyncio.run(apply_schema(conn))
        self.assertIn("pg_advisory_xact_lock", conn.sql[0])


if __name__ == "__main__":
    unittest.main()
