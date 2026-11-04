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
# AWS 側の列・表(docs/AWS_CUSTOMIZE.md の 4 章)。開発側には置かない。ないときは、schema.json だけで動く
OVERLAY_PATH = Path(__file__).resolve().parent / "client" / "schema.json"

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


class SchemaOverlayError(RuntimeError):
    """重ねるファイルを読めない。黙って飛ばすと、足した列への保存や取り込みが、あとで分かりにくく失敗するので、起動を止める"""

    def __init__(self, problems: list[str]) -> None:
        self.problems = problems
        super().__init__("server/ccp/client/schema.json を重ねられません。\n- " + "\n- ".join(problems) + "\n次にやること: 上の行を直してから、もう一度起動してください(決まりは docs/AWS_CUSTOMIZE.md の 4 章)")


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
    # 一意の組(schema.json の unique。列の名前の並び)。同じ組の行は 1 つだけ(ON CONFLICT で書き換えられるように)
    unique: list[list[str]] = field(default_factory=list)
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
        for lk in self.lookups:
            ref = _schema().tables[lk.ref].pg
            sql.append(f"ALTER TABLE {self.pg} ADD COLUMN IF NOT EXISTS {lk.pg} uuid REFERENCES {ref}(id) ON DELETE {lk.on_delete}")
            sql.append(f"CREATE INDEX IF NOT EXISTS ix_{self.pg}_{lk.pg} ON {self.pg}({lk.pg})")
        for c in self.columns:
            if c.index:
                sql.append(f"CREATE INDEX IF NOT EXISTS ix_{self.pg}_{c.pg} ON {self.pg}({c.pg})")
        for cols in self.unique:
            pg = [self.resolve(c)[0] for c in cols]
            # 一意にする前に、同じ組の行が重なっていれば、新しい 1 行だけを残す(一意の決まりがなかった間に、同時に書いて重なった行)。
            # 重なりがなければ、何も消さない
            same = " AND ".join(f"a.{c} = b.{c}" for c in pg)
            sql.append(f"DELETE FROM {self.pg} AS a USING {self.pg} AS b WHERE {same} AND (a.modified_on, a.id) < (b.modified_on, b.id)")
            sql.append(f"CREATE UNIQUE INDEX IF NOT EXISTS ux_{self.pg}_{'_'.join(pg)} ON {self.pg}({', '.join(pg)})")
        return sql


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

_NAME = re.compile(r"^[a-z][a-z0-9_]*$")
_RESERVED = {"id", "state_code", "created_on", "modified_on"}
_ON_DELETE = {"NO ACTION", "CASCADE", "SET NULL"}


def _j(v: Any) -> str:
    return json.dumps(v, ensure_ascii=False, separators=(",", ":"))


def _entry_ok(e: Any) -> bool:
    return isinstance(e, list) and 2 <= len(e) <= 3 and isinstance(e[0], str) and isinstance(e[1], str) and (len(e) == 2 or isinstance(e[2], dict))


def _items(t: dict[str, Any], key: str) -> list[Any]:
    v = t.get(key, [])
    return v if isinstance(v, list) else []


def merge_overlay(base: dict[str, Any], overlay: Any) -> tuple[dict[str, Any], list[str], list[str]]:
    """schema.json の中身に、重ねるファイルの中身を重ねる。返すのは (重ねた形, 重ねられない理由, 消してよい行)。
    足すだけ: 共通の列を変える・消す形は受けない(それは共通の変更で、CHANGES.md に書くもの)。
    同じ決まりを scripts/schema-overlay.mjs(npm run verify)も持つ。食い違いは test_schema_overlay.py が見つける"""
    merged = json.loads(json.dumps(base))
    problems: list[str] = []
    notes: list[str] = []
    if not isinstance(overlay, dict):
        return merged, ["いちばん外は { } にしてください"], notes
    for key in overlay:
        if key not in ("tables", "choices") and not key.startswith("_"):
            problems.append(f"{key}: 使えない項目です(使えるのは tables と choices)")
    tables = merged["tables"]
    over_tables = overlay.get("tables", {})
    over_choices = overlay.get("choices", {})
    if not isinstance(over_tables, dict) or not isinstance(over_choices, dict):
        return merged, ["tables と choices は { } にしてください"], notes
    added_tables = {n for n in over_tables if n not in tables}
    own_choice_columns: set[str] = set()

    # 先に表をそろえる(足した表どうしの参照は、書いた順によらない)
    for name, t in over_tables.items():
        if not _NAME.match(name):
            problems.append(f"{name}: 表の名前は、小文字の英字で始まる英数字と _ にしてください")
            continue
        if not isinstance(t, dict):
            problems.append(f"{name}: 表の定義は {{ }} にしてください")
            continue
        for key in t:
            if key not in ("columns", "lookups", "retired", "unique") and not key.startswith("_"):
                problems.append(f"{name}.{key}: 使えない項目です(使えるのは columns・lookups・retired・unique)")
            elif key in ("columns", "lookups", "retired", "unique") and not isinstance(t[key], list):
                problems.append(f"{name}.{key}: [ ] で並べてください")
        tables.setdefault(name, {"columns": [], "lookups": []})

    for name, t in over_tables.items():
        if name not in tables or not isinstance(t, dict):
            continue
        target = tables[name]
        have_cols = {c[0]: c for c in target["columns"]}
        have_lks = {lk[0]: lk for lk in target["lookups"]}
        for c in _items(t, "columns"):
            if not _entry_ok(c):
                problems.append(f"{name}: 列は [名前, 型] か [名前, 型, {{ 指定 }}] にしてください({_j(c)})")
                continue
            col = f"{name}.{c[0]}"
            opts = c[2] if len(c) == 3 else {}
            if not _NAME.match(c[0]):
                problems.append(f"{col}: 列の名前は、小文字の英字で始まる英数字と _ にしてください")
            elif c[0] in _RESERVED:
                problems.append(f"{col}: どの表にもある列なので、足せません。別の名前にしてください")
            elif c[1] not in SQL_TYPES:
                problems.append(f"{col}: 使えない型です: {c[1]}(使える型: {', '.join(SQL_TYPES)})")
            elif any(k not in ("required", "index") for k in opts):
                problems.append(f"{col}: 使えない指定です(使えるのは required と index)")
            elif c[0] in have_lks:
                problems.append(f"{col}: 同じ名前の参照が、すでにあります。別の名前にしてください")
            elif c[0] in have_cols:
                old = have_cols[c[0]]
                if old[1] != c[1] or (old[2] if len(old) > 2 else {}) != opts:
                    problems.append(f"{col}: すでにある列と定義が違います(いま: {_j(old)}、重ね: {_j(c)})。別の名前にするか、いまの定義に合わせてください")
                else:
                    notes.append(f"{col}: すでに同じ定義の列があります。重ねるファイルから消してかまいません")
            else:
                new = [c[0], c[1], opts] if opts else [c[0], c[1]]
                target["columns"].append(new)
                have_cols[c[0]] = new
                if c[1] == "choice":
                    own_choice_columns.add(col)
        for lk in _items(t, "lookups"):
            if not _entry_ok(lk):
                problems.append(f"{name}: 参照は [名前, 参照先の表] か [名前, 参照先の表, {{ \"onDelete\": … }}] にしてください({_j(lk)})")
                continue
            col = f"{name}.{lk[0]}"
            opts = lk[2] if len(lk) == 3 else {}
            if not _NAME.match(lk[0]):
                problems.append(f"{col}: 参照の名前は、小文字の英字で始まる英数字と _ にしてください")
            elif lk[0] in _RESERVED or lk[0] in have_cols:
                problems.append(f"{col}: 同じ名前の列が、すでにあります。別の名前にしてください")
            elif lk[1] not in tables:
                problems.append(f"{col}: 参照先の表 {lk[1]} がありません")
            elif any(k != "onDelete" for k in opts) or opts.get("onDelete", "NO ACTION") not in _ON_DELETE:
                problems.append(f"{col}: 使えない指定です(onDelete に使えるのは {', '.join(sorted(_ON_DELETE))})")
            elif lk[0] in have_lks:
                old = have_lks[lk[0]]
                if old[1] != lk[1] or (old[2] if len(old) > 2 else {}) != opts:
                    problems.append(f"{col}: すでにある参照と定義が違います。別の名前にするか、いまの定義に合わせてください")
                else:
                    notes.append(f"{col}: すでに同じ定義の参照があります。重ねるファイルから消してかまいません")
            else:
                new = [lk[0], lk[1], opts] if opts else [lk[0], lk[1]]
                target["lookups"].append(new)
                have_lks[lk[0]] = new

    for name, t in over_tables.items():
        if name not in tables or not isinstance(t, dict):
            continue
        target = tables[name]
        names = {c[0] for c in target["columns"]} | {lk[0] for lk in target["lookups"]}
        retired = _items(t, "retired")
        for r in retired:
            if not isinstance(r, str):
                problems.append(f"{name}: retired には列の名前を並べてください({_j(r)})")
            elif r in names:
                problems.append(f"{name}.{r}: 使っている列を retired にはできません。共通の列を止めるなら、共通の変更として CHANGES.md に書いてください")
        if retired and not problems:
            have = target.get("retired", [])
            target["retired"] = [*have, *[r for r in retired if r not in have]]
        unique = _items(t, "unique")
        if unique and name not in added_tables:
            # 一意にする SQL は、重なった行を消す。共通の表の行を、重ねるファイルだけで消させない
            problems.append(f"{name}: unique は、重ねるファイルで足した表にだけ書けます(一意にするときに、重なった行が消えるため)")
        elif unique:
            for u in unique:
                if not isinstance(u, list) or not u or any(not isinstance(c, str) or c not in names for c in u):
                    problems.append(f"{name}: unique の列がありません: {_j(u)}")
            target["unique"] = unique

    choices = merged.setdefault("choices", {})
    for col, values in over_choices.items():
        if col not in own_choice_columns:
            problems.append(f"{col}: 重ねるファイルで足した choice の列にだけ、選択肢を書けます")
        elif not isinstance(values, list) or not values or any(not isinstance(v, str) for v in values):
            problems.append(f"{col}: 選択肢は、文字の値を 1 つ以上並べてください")
        else:
            choices[col] = values
    for col in sorted(own_choice_columns - set(over_choices)):
        problems.append(f"{col}: choice の列には、choices に選択肢を書いてください")
    return merged, problems, notes


def overlay_status() -> dict[str, Any] | None:
    """重ねるファイルの様子(健康診断のため)。ファイルがなければ None"""
    if not OVERLAY_PATH.exists():
        return None
    try:
        overlay = json.loads(OVERLAY_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        return {"problems": [f"読めません({type(e).__name__}: {e})"], "notes": [], "tables": 0, "columns": 0}
    base = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    merged, problems, notes = merge_overlay(base, overlay)
    return {
        "problems": problems,
        "notes": notes,
        "tables": len(merged["tables"]) - len(base["tables"]),
        "columns": sum(len(t["columns"]) + len(t["lookups"]) for t in merged["tables"].values()) - sum(len(t["columns"]) + len(t["lookups"]) for t in base["tables"].values()),
    }


def _read_raw() -> dict[str, Any]:
    raw = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    if not OVERLAY_PATH.exists():
        return raw
    try:
        overlay = json.loads(OVERLAY_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise SchemaOverlayError([f"読めません({type(e).__name__}: {e})"]) from e
    merged, problems, _notes = merge_overlay(raw, overlay)
    if problems:
        raise SchemaOverlayError(problems)
    return merged


def _schema() -> Schema:
    global _cache
    if _cache is None:
        raw = _read_raw()
        choices = raw.get("choices", {})
        tables: dict[str, Table] = {}
        for name, t in raw["tables"].items():
            cols = [Column(c[0], c[1], **(c[2] if len(c) > 2 else {}), choices=choices.get(f"{name}.{c[0]}")) for c in t["columns"]]
            lks = [Lookup(lk[0], lk[1], (lk[2] if len(lk) > 2 else {}).get("onDelete", "NO ACTION")) for lk in t["lookups"]]
            tables[name] = Table(name, cols, lks, set(t.get("retired", [])), [list(u) for u in t.get("unique", [])])
        _cache = Schema(tables)
    return _cache


def load() -> Schema:
    return _schema()


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


# ---- 絞り込み(eq / ne / gt / ge / lt / le と in を、and / or でつなぐ範囲だけ。かっこは使えない)
# in は、配信のいくつかの id の行をまとめて読むため(表をまるごと読んでから画面で絞らないように。2026-10-25 の整理 第 2 段)
_VALUE = r"'(?:[^']|'')*'|[^\s',()]+"
_CLAUSE = re.compile(rf"\s*(\w+)\s+(?:(eq|ne|gt|ge|lt|le)\s+({_VALUE})|(in)\s*\(\s*((?:{_VALUE})(?:\s*,\s*(?:{_VALUE}))*)\s*\))\s*", re.IGNORECASE)
_JOIN = re.compile(r"(and|or)\b", re.IGNORECASE)
_ITEM = re.compile(_VALUE)
_OPS = {"eq": "=", "ne": "<>", "gt": ">", "ge": ">=", "lt": "<", "le": "<="}
# in に並べられる数(とても長い URL・SQL にしないため)
MAX_IN = 500


def _unquote(raw: str) -> str:
    return raw[1:-1].replace("''", "'") if raw.startswith("'") else raw


def parse_filter(table: Table, text: str | None) -> tuple[str, dict[str, Any]]:
    """画面の絞り込み(OData に似た書き方)を、SQL の条件とパラメータにする。and は or より先につながる(SQL と同じ)"""
    if not text or not text.strip():
        return "", {}
    parts: list[str] = []
    params: dict[str, Any] = {}
    pos = 0
    while True:
        m = _CLAUSE.match(text, pos)
        if not m:
            raise BadRequest(f"絞り込みの書き方に対応していません: {text!r}")
        name = m.group(1)
        col, type_ = table.resolve(name)
        if m.group(4):
            items = _ITEM.findall(m.group(5))
            if len(items) > MAX_IN:
                raise BadRequest(f"in に並べられるのは {MAX_IN} 個までです")
            if any(x.lower() == "null" for x in items):
                raise BadRequest("in に null は使えません(ne null / eq null を or でつないでください)")
            keys = []
            for x in items:
                key = f"f{len(params)}"
                params[key] = coerce(type_, _unquote(x))
                keys.append(":" + key)
            parts.append(f"{col} IN ({', '.join(keys)})")
        else:
            op, raw = m.group(2).lower(), m.group(3)
            if raw.lower() == "null":
                if op not in ("eq", "ne"):
                    raise BadRequest("null は eq / ne だけ使えます")
                parts.append(f"{col} IS {'NOT ' if op == 'ne' else ''}NULL")
            else:
                key = f"f{len(params)}"
                params[key] = coerce(type_, _unquote(raw))
                parts.append(f"{col} {_OPS[op]} :{key}")
        pos = m.end()
        if pos >= len(text):
            break
        j = _JOIN.match(text, pos)
        if not j:
            raise BadRequest(f"絞り込みの書き方に対応していません: {text!r}")
        parts.append(j.group(1).upper())
        pos = j.end()
        if pos >= len(text) or not text[pos:].strip():
            raise BadRequest(f"絞り込みの書き方に対応していません: {text!r}")
    # or を使うときは、ほかの条件(画面がつなぐもの)と混ざらないよう、全体をかっこでくくる
    sql = " ".join(parts)
    return (f"({sql})" if "OR" in parts else sql), params


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
