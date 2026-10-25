"""テストの偽の DB(メモリの上の表)。窓口(approvals・production・data_api など)を、PostgreSQL なしで通して確かめるため。

読めるのは、ccp/repo.py と data_api が組み立てる形の SQL(id の 1 行を読む・足す・直す・消す、`列 = :値` を AND でつないだ絞り込み)と、
各窓口が直接書いている、いくつかの決まった文(STATEMENTS)だけ。知らない文が来たら、AssertionError で止める
(偽の DB が黙って何もしないと、テストが通ってしまうため)。

  store = FakeStore()
  with store.patch("ccp.approvals", "ccp.production"):   # その窓口の db() を、この偽の DB に差し替える
      ...
書く接続(db(write=True))が例外で抜けたら、表を入る前に戻す(本物の DB のトランザクションと同じ。Fail で取り消されるかを確かめられる)。
"""
from __future__ import annotations

import copy
import re
import uuid
from contextlib import ExitStack, asynccontextmanager, contextmanager
from datetime import datetime, timezone
from typing import Any, Callable
from unittest import mock


class Result:
    def __init__(self, rows: list[dict[str, Any]] | None = None, rowcount: int = 0) -> None:
        self._rows = rows or []
        self.rowcount = rowcount

    def mappings(self) -> "Result":
        return self

    def all(self) -> list[Any]:
        return list(self._rows)

    def first(self) -> Any:
        return self._rows[0] if self._rows else None

    def one(self) -> Any:
        assert len(self._rows) == 1, f"1 行のはずが {len(self._rows)} 行"
        return self._rows[0]

    def scalar_one(self) -> Any:
        return next(iter(self.one().values()))


class Row(dict):
    """mappings() の行と、タプルの行(r[0])の両方で読める行"""

    def __getitem__(self, key: Any) -> Any:
        if isinstance(key, int):
            return list(self.values())[key]
        return super().__getitem__(key)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _key(v: Any) -> str:
    return str(v)


_INSERT = re.compile(r"^INSERT INTO (\w+) (?:\((.*?)\) VALUES \((.*?)\)|DEFAULT VALUES)(?: ON CONFLICT[^R]*?DO NOTHING)?(?: RETURNING (.*))?$", re.S)
_UPDATE = re.compile(r"^UPDATE (\w+) SET (.*?) WHERE id = :(\w+)(?: RETURNING (.*))?$", re.S)
_SELECT = re.compile(r"^SELECT (.*?) FROM (\w+)(?: WHERE (.*?))?(?: ORDER BY .*?)?(?: LIMIT \d+)?( FOR UPDATE)?$", re.S)
_DELETE = re.compile(r"^DELETE FROM (\w+) WHERE id = :(\w+)$")
_DELETE_ALL = re.compile(r"^DELETE FROM (\w+)$")
_COND = re.compile(r"^(\w+) = :(\w+)$")


class FakeConn:
    def __init__(self, store: "FakeStore") -> None:
        self.store = store

    async def execute(self, stmt: Any, params: Any = None) -> Result:
        sql = " ".join(str(stmt).split())
        self.store.log.append(sql)
        if isinstance(params, list):
            # まとめて送った(executemany)回と、その行の数
            self.store.batches.append((sql, len(params)))
            for p in params:
                await self.execute(stmt, p)
            return Result(rowcount=len(params))
        params = params or {}
        for pattern, handler in self.store.statements:
            m = re.search(pattern, sql)
            if m:
                return handler(self.store, m, params)
        if m := _INSERT.match(sql):
            cols = [c.strip() for c in (m.group(2) or "").split(",") if c.strip()]
            vals = [v.strip() for v in (m.group(3) or "").split(",") if v.strip()]
            return self.store.insert(m.group(1), {c: params[v[1:]] for c, v in zip(cols, vals)}, m.group(4), "ON CONFLICT" in sql)
        if m := _UPDATE.match(sql):
            sets = {}
            for part in m.group(2).split(","):
                col, _, val = part.strip().partition(" = ")
                sets[col] = _now() if val == "now()" else params[val[1:]]
            return self.store.update(m.group(1), params[m.group(3)], sets, m.group(4))
        if m := _DELETE.match(sql):
            return self.store.delete(m.group(1), params[m.group(2)])
        if m := _DELETE_ALL.match(sql):
            n = len(self.store.tables.get(m.group(1), {}))
            self.store.tables[m.group(1)] = {}
            return Result(rowcount=n)
        if m := _SELECT.match(sql):
            return self.store.select(m.group(2), m.group(1), m.group(3), params)
        raise AssertionError(f"偽の DB が知らない SQL です: {sql}")

    def begin(self) -> Any:
        return _Nested()

    def begin_nested(self) -> Any:
        return _Nested()

    async def commit(self) -> None:
        self.store.commits += 1


class _Nested:
    async def __aenter__(self) -> "_Nested":
        return self

    async def __aexit__(self, *exc: Any) -> bool:
        return False


class FakeStore:
    def __init__(self) -> None:
        self.tables: dict[str, dict[str, dict[str, Any]]] = {}
        self.log: list[str] = []
        self.commits = 0
        self.rollbacks = 0
        self.batches: list[tuple[str, int]] = []
        self.statements: list[tuple[str, Callable[["FakeStore", re.Match[str], dict[str, Any]], Result]]] = list(STATEMENTS)

    # ---- 表の中身
    def add(self, table: str, **values: Any) -> str:
        """行を置く(テストの準備)。id を返す"""
        rid = uuid.UUID(str(values.pop("id"))) if "id" in values else uuid.uuid4()
        now = _now()
        self.tables.setdefault(table, {})[_key(rid)] = {"id": rid, "created_on": now, "modified_on": now, **values}
        return str(rid)

    def rows(self, table: str, **where: Any) -> list[dict[str, Any]]:
        return [r for r in self.tables.get(table, {}).values() if all(_key(r.get(k)) == _key(v) for k, v in where.items())]

    def row(self, table: str, rid: Any) -> dict[str, Any] | None:
        return self.tables.get(table, {}).get(_key(rid))

    # ---- SQL の働き
    def _returning(self, row: dict[str, Any], cols: str | None) -> list[dict[str, Any]]:
        if cols is None:
            return []
        names = [c.strip() for c in cols.split(",")]
        return [Row({c: row.get(c) for c in names})]

    def insert(self, table: str, values: dict[str, Any], returning: str | None, on_conflict: bool) -> Result:
        rid = values.get("id") or uuid.uuid4()
        if on_conflict and self.row(table, rid) is not None:
            return Result(rowcount=0)
        now = _now()
        row = {"created_on": now, "modified_on": now, **values, "id": rid}
        self.tables.setdefault(table, {})[_key(rid)] = row
        return Result(self._returning(row, returning), rowcount=1)

    def update(self, table: str, rid: Any, sets: dict[str, Any], returning: str | None) -> Result:
        row = self.row(table, rid)
        if row is None:
            return Result()
        row.update(sets)
        return Result(self._returning(row, returning), rowcount=1)

    def delete(self, table: str, rid: Any) -> Result:
        return Result(rowcount=1 if self.tables.get(table, {}).pop(_key(rid), None) is not None else 0)

    def select(self, table: str, cols: str, where: str | None, params: dict[str, Any]) -> Result:
        conds: list[tuple[str, Any]] = []
        for part in re.split(r"\s+AND\s+", where) if where else []:
            m = _COND.match(part.strip())
            assert m, f"偽の DB が知らない絞り込みです: {part}"
            conds.append((m.group(1), params[m.group(2)]))
        found = [r for r in self.tables.get(table, {}).values() if all(_key(r.get(c)) == _key(v) for c, v in conds)]
        found.sort(key=lambda r: (r["created_on"], _key(r["id"])))
        if cols.strip() == "*":
            return Result([Row(r) for r in found])
        names = [c.strip() for c in cols.split(",")]
        return Result([Row({c: r.get(c) for c in names}) for r in found])

    # ---- 窓口の db() の差し替え
    @asynccontextmanager
    async def db(self, write: bool = False) -> Any:
        if not write:
            yield FakeConn(self)
            return
        saved = copy.deepcopy(self.tables)
        try:
            yield FakeConn(self)
        except BaseException:
            self.tables = saved
            self.rollbacks += 1
            raise
        self.commits += 1

    @contextmanager
    def patch(self, *modules: str) -> Any:
        with ExitStack() as stack:
            for m in modules:
                stack.enter_context(mock.patch(f"{m}.db", self.db))
            yield self


# ---- 窓口が直接書いている決まった文(正規表現 → 働き)
def _find_user(store: FakeStore, m: re.Match[str], p: dict[str, Any]) -> Result:
    found = [r for r in store.rows("users") if str(r.get("email") or "").lower() == p["e"] and r.get("status") in (None, "active")]
    found.sort(key=lambda r: r["created_on"])
    return Result([Row({k: r.get(k) for k in ("id", "name", "email", "role", "status")}) for r in found[:1]])


def _group_ids(store: FakeStore, m: re.Match[str], p: dict[str, Any]) -> Result:
    rows = [r for r in store.rows("approval_group_members", user_id=p["u"])]
    return Result([Row({"approval_group_id": r["approval_group_id"]}) for r in rows])


def _group_users(store: FakeStore, m: re.Match[str], p: dict[str, Any]) -> Result:
    return Result([Row({"user_id": r.get("user_id")}) for r in store.rows("approval_group_members", approval_group_id=p["g"])])


def _card_status(store: FakeStore, m: re.Match[str], p: dict[str, Any]) -> Result:
    return store.update("delivery_cards", p["id"], {"status": p["s"], "modified_on": _now()}, None)


def _stale(table: str, live: tuple[str, ...], extra: Callable[[dict[str, Any]], dict[str, Any]]) -> Callable[[FakeStore, re.Match[str], dict[str, Any]], Result]:
    def run(store: FakeStore, m: re.Match[str], p: dict[str, Any]) -> Result:
        n = 0
        for r in store.rows(table, delivery_card_id=p["c"]):
            if r.get("status") in live:
                r.update({"status": "stale", **extra(p)})
                n += 1
        return Result(rowcount=n)

    return run


def _max_version(store: FakeStore, m: re.Match[str], p: dict[str, Any]) -> Result:
    versions = [int(r.get("version") or 0) for r in store.rows("production_requests", delivery_card_id=p["c"])]
    return Result([Row({"v": max(versions, default=0)})])


STATEMENTS: list[tuple[str, Callable[[FakeStore, re.Match[str], dict[str, Any]], Result]]] = [
    (r"^SELECT id, name, email, role, status FROM users WHERE lower\(email\) = :e", _find_user),
    (r"^SELECT approval_group_id FROM approval_group_members WHERE user_id = :u", _group_ids),
    (r"^SELECT user_id FROM approval_group_members WHERE approval_group_id = :g", _group_users),
    (r"^UPDATE delivery_cards SET status = :s, modified_on = now\(\) WHERE id = :id$", _card_status),
    (r"^UPDATE approval_requests SET status = 'stale'", _stale("approval_requests", ("open", "approved", "changes_requested"), lambda p: {"closed_at": p["now"]})),
    (r"^UPDATE production_requests SET status = 'stale'", _stale("production_requests", ("requested", "in_progress", "done", "checked"), lambda p: {})),
    (r"^SELECT COALESCE\(MAX\(version\), 0\) FROM production_requests", _max_version),
]
