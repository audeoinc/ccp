"""データ定義(schema.json)の読み込みと、値の変換。

表・列の名前は、画面・API・PostgreSQL で同じ(delivery_cards、scheduled_at、hero_image_id など)。
テーブルを作る SQL も、触ってよい列の許可リストも、選択肢の値の確かめも、ここから作る。
"""
from __future__ import annotations

import hashlib
import json
import re
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

SCHEMA_PATH = Path(__file__).resolve().parent.parent / "schema.json"
LEGACY_PATH = Path(__file__).resolve().parent / "legacy_names.json"

SQL_TYPES = {
    "text": "text",
    "int": "integer",
    "numeric": "numeric(14,2)",
    "float": "double precision",  # 率・比(購入率・前年比・天気への反応)。numeric(14,2) では、小数 2 桁で丸まってしまうため
    "timestamptz": "timestamptz",
    "date": "date",
    "choice": "text",  # 選択肢は、文字の値(email / app など)。使える値は schema.json の choices
}

# どの表にもある列
SYSTEM_COLUMNS = [("state_code", "int"), ("created_on", "timestamptz"), ("modified_on", "timestamptz")]

# 書き込みのときに、あっても無視する列(DB が決める・読むだけの列)
IGNORED_ON_WRITE = {"id", "created_on", "modified_on"}


class BadRequest(ValueError):
    """依頼の内容が正しくない(400 で返す)"""


@dataclass
class Column:
    pg: str
    type: str
    required: bool = False
    index: bool = False
    # 選択肢の列なら、使える値
    choices: list[str] | None = None


@dataclass
class Lookup:
    pg: str  # 例: hero_image_id
    ref: str  # 参照先の表
    on_delete: str = "NO ACTION"


@dataclass
class Table:
    pg: str
    columns: list[Column]
    lookups: list[Lookup]
    # 使わなくなった列(schema.json の retired)。書き込みに来ても、断らずに無視する
    retired: set[str] = field(default_factory=set)
    by_name: dict[str, Column] = field(default_factory=dict)
    by_lookup: dict[str, Lookup] = field(default_factory=dict)

    def __post_init__(self) -> None:
        cols = self.columns + [Column(pg, t) for pg, t in SYSTEM_COLUMNS]
        self.by_name = {c.pg: c for c in cols}
        self.by_lookup = {lk.pg: lk for lk in self.lookups}

    @property
    def name(self) -> str:
        return self.pg

    @property
    def all_columns(self) -> list[Column]:
        return list(self.by_name.values())

    # ---- 列の解決(名前 → 列名と型)
    def resolve(self, name: str) -> tuple[str, str]:
        if name == "id":
            return "id", "uuid"
        if name in self.by_name:
            c = self.by_name[name]
            return c.pg, c.type
        if name in self.by_lookup:
            return name, "uuid"
        raise BadRequest(f"不明な項目です: {name}")

    # ---- 値の変換(画面から来た値 → PostgreSQL に渡す値)
    def to_db(self, record: dict[str, Any]) -> dict[str, Any]:
        out: dict[str, Any] = {}
        for key, value in record.items():
            if key in IGNORED_ON_WRITE or key in self.retired or self._is_label(key):
                continue
            if key in self.by_lookup:
                out[key] = _lookup_id(value)
            elif key in self.by_name:
                c = self.by_name[key]
                v = coerce(c.type, value)
                if c.choices is not None and v is not None and v not in c.choices:
                    raise BadRequest(f"{key} に使えない値です: {value!r}(使える値: {', '.join(c.choices)})")
                out[key] = v
            else:
                raise BadRequest(f"不明な項目です: {key}")
        return out

    def _is_label(self, key: str) -> bool:
        """選択肢の表示名(status_name など。画面が値から求めるもので、保存しない)"""
        if not key.endswith("_name"):
            return False
        c = self.by_name.get(key[: -len("_name")])
        return c is not None and c.choices is not None

    # ---- 値の変換(PostgreSQL の行 → 画面に返す形)
    def to_api(self, row: dict[str, Any]) -> dict[str, Any]:
        out: dict[str, Any] = {}
        if "id" in row:
            out["id"] = str(row["id"])
        for c in self.all_columns:
            if c.pg in row:
                out[c.pg] = serialize(row[c.pg])
        for lk in self.lookups:
            if lk.pg in row:
                out[lk.pg] = serialize(row[lk.pg])
        return out

    # ---- テーブルを作る SQL
    def ddl(self) -> list[str]:
        parts = ["id uuid PRIMARY KEY DEFAULT gen_random_uuid()"]
        for c in self.columns:
            parts.append(f"{c.pg} {SQL_TYPES[c.type]}{' NOT NULL' if c.required else ''}")
        for lk in self.lookups:
            ref = _schema().tables[lk.ref].pg
            parts.append(f"{lk.pg} uuid REFERENCES {ref}(id) ON DELETE {lk.on_delete}")
        parts += ["state_code smallint NOT NULL DEFAULT 0", "created_on timestamptz NOT NULL DEFAULT now()", "modified_on timestamptz NOT NULL DEFAULT now()"]
        sql = [f"CREATE TABLE IF NOT EXISTS {self.pg} (\n  " + ",\n  ".join(parts) + "\n)"]
        # 列を足したときに、既存のテーブルにも反映する
        for c in self.columns:
            sql.append(f"ALTER TABLE {self.pg} ADD COLUMN IF NOT EXISTS {c.pg} {SQL_TYPES[c.type]}")
            sql.append(f"ALTER TABLE {self.pg} ALTER COLUMN {c.pg} TYPE {SQL_TYPES[c.type]}")  # 型を変えたときに、既存のテーブルにも反映
        sql += self.legacy_value_sql()
        for lk in self.lookups:
            ref = _schema().tables[lk.ref].pg
            sql.append(f"ALTER TABLE {self.pg} ADD COLUMN IF NOT EXISTS {lk.pg} uuid REFERENCES {ref}(id) ON DELETE {lk.on_delete}")
            sql.append(f"CREATE INDEX IF NOT EXISTS ix_{self.pg}_{lk.pg} ON {self.pg}({lk.pg})")
        for c in self.columns:
            if c.index:
                sql.append(f"CREATE INDEX IF NOT EXISTS ix_{self.pg}_{c.pg} ON {self.pg}({c.pg})")
        return sql

    def legacy_value_sql(self) -> list[str]:
        """以前の選択肢の値(588230000 などの数)を、文字の値に置き換える SQL。

        2026-10-16 に、選択肢を数から文字にした。それより前のデータベースも、サーバーが最初につないだときに、
        ここで置き換わる(数の値の行だけを書き換えるので、何度実行しても同じ)。
        """
        out = []
        for c in self.columns:
            old = legacy().get("choices", {}).get(f"{self.pg}.{c.pg}")
            if not old:
                continue
            cases = " ".join(f"WHEN '{k}' THEN '{v}'" for k, v in old.items())
            out.append(f"UPDATE {self.pg} SET {c.pg} = CASE {c.pg} {cases} ELSE {c.pg} END WHERE {c.pg} ~ '^[0-9]+$'")
        return out


@dataclass
class Schema:
    tables: dict[str, Table]

    def table(self, name: str) -> Table:
        try:
            return self.tables[name]
        except KeyError:
            raise BadRequest(f"不明なテーブルです: {name}") from None

    def creation_order(self) -> list[Table]:
        """参照される側を先に作る順(並び替えの結果)"""
        done: list[Table] = []
        seen: set[str] = set()

        def visit(t: Table) -> None:
            if t.pg in seen:
                return
            seen.add(t.pg)
            for lk in t.lookups:
                visit(self.tables[lk.ref])
            done.append(t)

        for t in self.tables.values():
            visit(t)
        return done

    def ddl(self) -> list[str]:
        return [s for t in self.creation_order() for s in t.ddl()]

    def ddl_hash(self) -> str:
        """テーブルを作る SQL の全体の指紋。列・型・参照・索引・以前の選択肢の置き換えのどれかが変われば変わる
        (起動のたびに約 1000 本の SQL を流さず、変わったときだけ流すため。整理⑥)"""
        return hashlib.sha256("\n".join(self.ddl()).encode("utf-8")).hexdigest()

    def expected_columns(self) -> set[tuple[str, str]]:
        """DB にあるはずの (テーブル, 列)。指紋が同じでも、表・列が欠けていれば SQL を流す(手で消した・古い写しを戻した など)"""
        out: set[tuple[str, str]] = set()
        for t in self.tables.values():
            for name in ["id", "state_code", "created_on", "modified_on", *[c.pg for c in t.columns], *[lk.pg for lk in t.lookups]]:
                out.add((t.pg, name))
        return out


_cache: Schema | None = None
_legacy: dict[str, Any] | None = None


def _schema() -> Schema:
    global _cache
    if _cache is None:
        raw = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
        choices = raw.get("choices", {})
        tables: dict[str, Table] = {}
        for name, t in raw["tables"].items():
            cols = [Column(c[0], c[1], **(c[2] if len(c) > 2 else {}), choices=choices.get(f"{name}.{c[0]}")) for c in t["columns"]]
            lks = [Lookup(lk[0], lk[1], (lk[2] if len(lk) > 2 else {}).get("onDelete", "NO ACTION")) for lk in t["lookups"]]
            tables[name] = Table(name, cols, lks, set(t.get("retired", [])))
        _cache = Schema(tables)
    return _cache


def load() -> Schema:
    return _schema()


def legacy() -> dict[str, Any]:
    """以前の名前(cr854_…)・選択肢の数 → いまの名前・値の対応(引っ越し用のパックの版 1 を読むときと、DB の値の置き換えに使う)"""
    global _legacy
    if _legacy is None:
        _legacy = json.loads(LEGACY_PATH.read_text(encoding="utf-8"))
    return _legacy


def convert_legacy_rows(old_table: str, rows: list[dict[str, Any]]) -> tuple[str, list[dict[str, Any]]]:
    """以前の名前の行を、いまの名前・値に直す(引っ越し用のパックの版 1 用)"""
    lg = legacy()
    name = lg["tables"][old_table]
    pk = lg["pk"][old_table]
    cols = lg["columns"][old_table]
    out = []
    for r in rows:
        n: dict[str, Any] = {}
        for k, v in r.items():
            if k == pk:
                n["id"] = v
            elif k in cols:
                col = cols[k]
                mapping = lg["choices"].get(f"{name}.{col}")
                n[col] = mapping.get(str(v), v) if mapping and v is not None else v
        out.append(n)
    return name, out


# ---- 値の変換
def coerce(type_: str, value: Any) -> Any:
    if value is None or value == "":
        return None if type_ != "text" else ("" if value == "" else None)
    try:
        if type_ == "int":
            return int(value)
        if type_ == "choice":
            return str(value)
        if type_ == "numeric":
            return Decimal(str(value))
        if type_ == "float":
            return float(value)
        if type_ == "timestamptz":
            if isinstance(value, datetime):
                return value
            d = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
        if type_ == "date":
            return date.fromisoformat(str(value)[:10])
        if type_ == "uuid":
            return uuid.UUID(str(value))
    except (ValueError, ArithmeticError) as e:
        raise BadRequest(f"値の形式が正しくありません: {value!r}") from e
    return str(value)


_GUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


def _lookup_id(value: Any) -> uuid.UUID | None:
    """参照先の id。空なら、参照を外す"""
    if value is None or value == "":
        return None
    if not _GUID.match(str(value)):
        raise BadRequest(f"参照の形式が正しくありません: {value!r}")
    return uuid.UUID(str(value))


def serialize(v: Any) -> Any:
    if isinstance(v, datetime):
        return v.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, Decimal):
        return int(v) if v == v.to_integral_value() else float(v)
    if isinstance(v, uuid.UUID):
        return str(v)
    return v


# ---- 絞り込み(eq / ne / gt / ge / lt / le を and でつなぐ範囲だけ)
_CLAUSE = re.compile(r"\s*(\w+)\s+(eq|ne|gt|ge|lt|le)\s+('(?:[^']|'')*'|[^\s']+)\s*(?:and\b|$)", re.IGNORECASE)
_OPS = {"eq": "=", "ne": "<>", "gt": ">", "ge": ">=", "lt": "<", "le": "<="}


def parse_filter(table: Table, text: str | None) -> tuple[str, dict[str, Any]]:
    if not text or not text.strip():
        return "", {}
    clauses: list[str] = []
    params: dict[str, Any] = {}
    pos = 0
    while pos < len(text):
        m = _CLAUSE.match(text, pos)
        if not m:
            raise BadRequest(f"絞り込みの書き方に対応していません: {text!r}")
        name, op, raw = m.group(1), m.group(2).lower(), m.group(3)
        col, type_ = table.resolve(name)
        if raw.lower() == "null":
            if op not in ("eq", "ne"):
                raise BadRequest("null は eq / ne だけ使えます")
            clauses.append(f"{col} IS {'NOT ' if op == 'ne' else ''}NULL")
        else:
            val = raw[1:-1].replace("''", "'") if raw.startswith("'") else raw
            key = f"f{len(params)}"
            params[key] = coerce(type_, val)
            clauses.append(f"{col} {_OPS[op]} :{key}")
        pos = m.end()
    return " AND ".join(clauses), params


def parse_order(table: Table, items: list[str] | None) -> str:
    out: list[str] = []
    for item in items or []:
        for part in item.split(","):
            bits = part.split()
            if not bits:
                continue
            col, _ = table.resolve(bits[0])
            direction = bits[1].lower() if len(bits) > 1 else "asc"
            if direction not in ("asc", "desc"):
                raise BadRequest(f"並び順が正しくありません: {part!r}")
            out.append(f"{col} {direction.upper()}")
    return ", ".join(out)
