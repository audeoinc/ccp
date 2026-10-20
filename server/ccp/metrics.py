"""商品とカテゴリの週の指標の取り込み(バックログ X48。取り込むファイルの形は docs/METRICS_FORMAT.md)。

  POST /api/metrics/import  {filename, content}
                            CSV を読み、ファイルに入っている週 × 市場の行を置き換える(ファイルにない週は残す)
  python -m ccp.cli import-metrics <CSV>   同じことを、コマンドで行う(Workbench で、毎週のファイルを入れるとき)

値は、外(いまはファイル。あとで BigQuery)で計算し終えたもの(順位・WoW・MoM・YoY まで)を、そのまま持つ。
画面では計算しない(母集団・暦の月の数え方を、取り込む側の 1 か所で決めるため)。
1 行目の列名で、商品の指標(product_code の列がある)か、カテゴリの指標(category の列がある)かを見分ける。
読めなかった行は飛ばし、理由を返す(1 つの誤りで、ファイル全体を止めない。直すのは元のファイル)。
"""
from __future__ import annotations

import csv
import io
import re
from dataclasses import asdict, dataclass
from datetime import date, datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text

from .data_api import db, require_db

router = APIRouter(prefix="/api/metrics", dependencies=[Depends(require_db)])

# 項目の名前(画面の src/metrics.ts と同じ)。知らない名前の行は飛ばす(言い換えで、表の行がばらけないように)
PRODUCT_METRICS = ("spu_stock", "sku_stock", "sku_stockout_rate", "store_sales", "ec_sales", "ec_favorites")
CATEGORY_METRICS = ("ec_sessions", "ec_sales", "ec_favorites")
MARKET = re.compile(r"^[A-Z]{2}$")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
NUMBERS = ("value", "wow", "mom", "yoy")
INTEGERS = ("rank", "rank_of")


@dataclass
class Problem:
    line: int
    message: str
    where: str = ""


@dataclass
class Parsed:
    kind: str  # product / category
    rows: list[dict[str, Any]]
    problems: list[Problem]

    @property
    def table(self) -> str:
        return "product_metrics" if self.kind == "product" else "category_metrics"

    @property
    def key(self) -> str:
        return "product_code" if self.kind == "product" else "category"


def _number(v: str) -> float | None:
    """空は None。桁区切り・通貨の記号・% は外して読む(% は 100 で割る。表計算から書き出したときのため)"""
    s = v.strip().replace(",", "").replace("¥", "").replace("$", "")
    if not s:
        return None
    pct = s.endswith("%")
    n = float(s[:-1] if pct else s)
    return n / 100 if pct else n


def parse(content: str) -> Parsed:
    """CSV を、週 × 項目の行に読み分ける。1 行目は列名(順番は自由。余分な列は無視)"""
    problems: list[Problem] = []
    rows: list[dict[str, Any]] = []
    reader = csv.DictReader(io.StringIO(content.replace("﻿", "")))
    headers = [h.strip() for h in (reader.fieldnames or [])]
    kind = "product" if "product_code" in headers else "category" if "category" in headers else ""
    if not kind:
        problems.append(Problem(1, "product_code(商品の指標)か category(カテゴリの指標)の列がありません(1 行目は列名。METRICS_FORMAT.md)"))
        return Parsed("product", [], problems)
    key = "product_code" if kind == "product" else "category"
    names = PRODUCT_METRICS if kind == "product" else CATEGORY_METRICS
    missing = [c for c in ("week_start", "market", "metric", "value") if c not in headers]
    if missing:
        problems.append(Problem(1, f"必須の列がありません: {', '.join(missing)}"))
        return Parsed(kind, [], problems)
    seen: set[tuple[str, str, str, str]] = set()
    for n, rec in enumerate(reader, start=2):
        r = {k.strip(): (v or "").strip() for k, v in rec.items() if k}
        if not any(r.values()):
            continue
        ws, market, target, metric = r.get("week_start", ""), r.get("market", "").upper(), r.get(key, ""), r.get("metric", "").lower()
        where = f"{ws} {market} {target} {metric}".strip()
        bad = False
        try:
            if not DATE.match(ws):
                raise ValueError
            if date.fromisoformat(ws).weekday() != 0:
                problems.append(Problem(n, f"week_start は月曜にしてください: {ws}", where))
                bad = True
        except ValueError:
            problems.append(Problem(n, f"week_start は YYYY-MM-DD で: {ws or '(空)'}", where))
            bad = True
        if not MARKET.match(market):
            problems.append(Problem(n, f"market は大文字 2 文字(JP / US など)で: {market or '(空)'}", where))
            bad = True
        if not target:
            problems.append(Problem(n, f"{key} が空です", where))
            bad = True
        if metric not in names:
            problems.append(Problem(n, f"metric は {' / '.join(names)} のどれかで: {metric or '(空)'}", where))
            bad = True
        values: dict[str, Any] = {}
        for c in NUMBERS + INTEGERS:
            try:
                v = _number(r.get(c, ""))
                values[c] = int(v) if v is not None and c in INTEGERS else v
            except ValueError:
                problems.append(Problem(n, f"{c} は数字で: {r.get(c)}", where))
                bad = True
        if not bad and values["value"] is None:
            problems.append(Problem(n, "value が空です", where))
            bad = True
        k = (ws, market, target, metric)
        if not bad and k in seen:
            problems.append(Problem(n, "同じ週・市場・対象・項目の行が重なっています(あとのほうを飛ばします)", where))
            bad = True
        if bad:
            continue
        seen.add(k)
        rows.append({"week_start": ws, "market": market, key: target, "metric": metric, **values, "line": n})
    return Parsed(kind, rows, problems)


def summary(p: Parsed, filename: str) -> dict[str, Any]:
    weeks = sorted({(r["week_start"], r["market"]) for r in p.rows})
    return {
        "kind": p.kind, "filename": filename, "count": len(p.rows), "problems": [asdict(x) for x in p.problems],
        "weeks": [{"week_start": w, "market": m, "rows": sum(1 for r in p.rows if (r["week_start"], r["market"]) == (w, m))} for w, m in weeks],
    }


async def save(p: Parsed, filename: str) -> dict[str, Any]:
    """読めた行を保存する(1 つのトランザクション)。週 × 市場ごとに置き換える(BigQuery からの取り込みに替えても、同じ置き換え方)"""
    now = datetime.now(timezone.utc)
    weeks = sorted({(r["week_start"], r["market"]) for r in p.rows})
    async with db(write=True) as conn:
        removed = 0
        for w, m in weeks:
            removed += (await conn.execute(text(f"DELETE FROM {p.table} WHERE week_start = :w AND market = :m"), {"w": date.fromisoformat(w), "m": m})).rowcount
        values = [{
            "week_start": date.fromisoformat(r["week_start"]), "market": r["market"], p.key: r[p.key], "metric": r["metric"],
            **{c: r[c] for c in NUMBERS + INTEGERS}, "source_file": filename, "imported_at": now,
        } for r in p.rows]
        if values:
            cols = list(values[0])
            await conn.execute(text(f"INSERT INTO {p.table} ({', '.join(cols)}) VALUES ({', '.join(':' + c for c in cols)})"), values)
    return {"replaced": removed, "saved": len(values)}


class MetricsFile(BaseModel):
    filename: str
    content: str


@router.post("/import")
async def import_file(file: MetricsFile) -> dict[str, Any]:
    p = parse(file.content)
    if not p.rows:
        return {"success": False, "error": {"message": "読めた行がありません(中身を確かめてください)"}, "data": summary(p, file.filename)}
    result = await save(p, file.filename)
    return {"success": True, "data": {**summary(p, file.filename), **result}}
