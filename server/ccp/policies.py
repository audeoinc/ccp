"""マーケティングポリシーの取り込み(バックログ M3・M4。設計は docs/POLICY.md、取り込むファイルの形は docs/POLICY_FORMAT.md)。

  POST /api/policies/preview  {kind: "rules" | "sales", filename, content}
                              ファイルを読み分けた結果(件数・読めなかった行と理由)を返す。何も変えない
  POST /api/policies/import   同じ入力。読めたものを保存する
                              rules(ルール系の Markdown): 同じファイル名の決まりを、まるごと置き換える(版 = ファイル名 + 取り込んだ日時)
                              sales(販売系の CSV):       ファイルに入っている週 × 市場の行を置き換える(ファイルにない週は残す)

読み分けは、画面の確かめ(preview)と取り込みで同じ関数を使う(確かめでは通ったのに取り込めない、を起こさないため)。
読めなかった決まり・行は飛ばし、理由を返す(1 つの誤りで、ファイル全体を止めない。直すのは元のファイル)。
"""
from __future__ import annotations

import csv
import io
import re
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text

from .data_api import db, require_db

router = APIRouter(prefix="/api/policies", dependencies=[Depends(require_db)])

TARGETS = ("theme", "selection", "hero", "headline", "copy", "instructions", "schedule")
STRENGTHS = ("must", "should", "info")
CHANNELS = ("email", "app")
SCOPES = ("product", "category", "all")
MARKET = re.compile(r"^[A-Z]{2}$")
RULE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]*$")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
PERIOD = re.compile(r"^(\d{4}-\d{2}-\d{2})\s*[-〜~]\s*(\d{4}-\d{2}-\d{2})$")
# 決まりの項目の名前(日本語 / 英語)→ 内部の名前
ITEM_KEYS = {
    "対象": "applies_to", "applies_to": "applies_to",
    "強さ": "strength", "strength": "strength",
    "市場": "market", "market": "market",
    "チャネル": "channel", "channel": "channel",
    "期間": "period", "period": "period",
    "確かめ方": "check", "check": "check",
}
# 確かめ方の書き方(POLICY_FORMAT.md の 3.3)
CHECK_FORMS = (
    re.compile(r"^含めない\s+/.+/$"),
    re.compile(r"^含めない\s+\S.*$"),
    re.compile(r"^含める\s+/.+/$"),
    re.compile(r"^除く\s+段階\s*=\s*\S+$"),
    re.compile(r"^上限\s+週\s+\d+\s*回$"),
)
BODY_LIMIT = 300
NOTE_LIMIT = 200


@dataclass
class Problem:
    line: int
    message: str
    where: str = ""  # 決まりの番号・行の要約


@dataclass
class Rule:
    rule_id: str
    title: str
    applies_to: list[str]
    strength: str
    market: list[str] = field(default_factory=list)
    channel: list[str] = field(default_factory=list)
    period_start: str | None = None
    period_end: str | None = None
    check_spec: str | None = None
    body: str = ""
    line: int = 0


@dataclass
class Parsed:
    kind: str
    rows: list[dict[str, Any]]
    problems: list[Problem]
    title: str = ""


def _split_list(v: str) -> list[str]:
    return [x.strip() for x in re.split(r"[,、，]", v) if x.strip()]


def _valid_date(s: str) -> bool:
    try:
        date.fromisoformat(s)
        return True
    except ValueError:
        return False


# ---- ルール系(Markdown)
def parse_rules(content: str) -> Parsed:
    """Markdown を、決まりの一覧に読み分ける。`## <番号> <題名>` が 1 件。見出しのすぐ下の `- 項目: 値` が項目、残りが本文"""
    lines = content.replace("﻿", "").splitlines()
    problems: list[Problem] = []
    rules: list[Rule] = []
    title = ""
    cur: dict[str, Any] | None = None

    def flush() -> None:
        if cur is None:
            return
        items, body_lines, n = cur["items"], cur["body"], cur["line"]
        rid, head = cur["id"], cur["title"]
        bad = False
        if not RULE_ID.match(rid):
            problems.append(Problem(n, f"決まりの番号「{rid}」に、英数字と - _ 以外が入っています", rid))
            bad = True
        targets = _split_list(items.get("applies_to", ""))
        unknown = [t for t in targets if t not in TARGETS]
        if not targets:
            problems.append(Problem(n, "「対象」がありません(theme / selection / hero / headline / copy / instructions / schedule)", rid))
            bad = True
        elif unknown:
            problems.append(Problem(n, f"「対象」に知らない名前があります: {', '.join(unknown)}", rid))
            bad = True
        strength = items.get("strength", "").strip().lower()
        if strength not in STRENGTHS:
            problems.append(Problem(n, "「強さ」がありません、または must / should / info 以外です" + (f"({strength})" if strength else ""), rid))
            bad = True
        markets = [m.upper() for m in _split_list(items.get("market", ""))]
        if any(not MARKET.match(m) for m in markets):
            problems.append(Problem(n, f"「市場」は大文字 2 文字(JP / US など)で: {items.get('market')}", rid))
            bad = True
        channels = [c.lower() for c in _split_list(items.get("channel", ""))]
        if any(c not in CHANNELS for c in channels):
            problems.append(Problem(n, f"「チャネル」は email / app で: {items.get('channel')}", rid))
            bad = True
        ps = pe = None
        if items.get("period"):
            m = PERIOD.match(items["period"].strip())
            if not m or not (_valid_date(m.group(1)) and _valid_date(m.group(2))) or m.group(1) > m.group(2):
                problems.append(Problem(n, f"「期間」は YYYY-MM-DD - YYYY-MM-DD で(始まりが終わりより前): {items['period']}", rid))
                bad = True
            else:
                ps, pe = m.group(1), m.group(2)
        check = items.get("check", "").strip() or None
        if check and not any(f.match(check) for f in CHECK_FORMS):
            problems.append(Problem(n, f"「確かめ方」の書き方が分かりません(含めない / 含める / 除く 段階= / 上限 週 n 回): {check}", rid))
            bad = True
        if check and strength != "must":
            problems.append(Problem(n, "「確かめ方」は must の決まりだけで使います(そのまま取り込み、確かめには使いません)", rid))
        body = "\n".join(body_lines).strip()
        if not body and not bad:
            problems.append(Problem(n, "本文がありません(題名だけを AI に渡します)", rid))
        if len(body) > BODY_LIMIT:
            problems.append(Problem(n, f"本文が {BODY_LIMIT} 字を超えています({len(body)} 字。AI に渡すので、短く具体的に)", rid))
        if any(r.rule_id == rid for r in rules):
            problems.append(Problem(n, f"決まりの番号「{rid}」が、このファイルの中で重なっています(あとのほうを飛ばします)", rid))
            bad = True
        if not bad:
            rules.append(Rule(rid, head, targets, strength, markets, channels, ps, pe, check, body, n))

    for i, raw in enumerate(lines, start=1):
        line = raw.rstrip()
        if line.startswith("## "):
            flush()
            head = line[3:].strip()
            rid, _, rest = head.partition(" ")
            cur = {"id": rid, "title": rest.strip() or rid, "items": {}, "body": [], "line": i, "in_items": True}
            continue
        if line.startswith("# ") and cur is None:
            title = line[2:].strip()
            continue
        if cur is None:
            continue  # 題名の下の `- 版:` など
        m = re.match(r"^\s*[-*]\s+([^:：]+)[:：]\s*(.*)$", line)
        if cur["in_items"] and m and m.group(1).strip() in ITEM_KEYS:
            cur["items"][ITEM_KEYS[m.group(1).strip()]] = m.group(2).strip()
            continue
        if cur["in_items"] and m and m.group(1).strip() not in ITEM_KEYS:
            problems.append(Problem(i, f"知らない項目です(無視します): {m.group(1).strip()}", cur["id"]))
            continue
        if line.strip() or cur["body"]:
            if line.strip():
                cur["in_items"] = False
            cur["body"].append(line)
    flush()
    rows = [{**asdict(r), "applies_to": ",".join(r.applies_to), "market": ",".join(r.market), "channel": ",".join(r.channel)} for r in rules]
    return Parsed("rules", rows, problems, title)


# ---- 販売系(CSV)
SALES_COLS = ("week_start", "market", "scope", "target", "stage", "priority", "promo_period", "focus", "note")


def parse_sales(content: str) -> Parsed:
    """CSV を、週ごとの方針の行に読み分ける。1 行目は列名(順番は自由。余分な列は無視)"""
    problems: list[Problem] = []
    rows: list[dict[str, Any]] = []
    reader = csv.DictReader(io.StringIO(content.replace("﻿", "")))
    headers = [h.strip() for h in (reader.fieldnames or [])]
    missing = [c for c in ("week_start", "market", "scope") if c not in headers]
    if missing:
        problems.append(Problem(1, f"必須の列がありません: {', '.join(missing)}(1 行目は列名。POLICY_FORMAT.md の 2 章)"))
        return Parsed("sales", [], problems)
    seen: set[tuple[str, str, str, str]] = set()
    for n, rec in enumerate(reader, start=2):
        r = {k.strip(): (v or "").strip() for k, v in rec.items() if k}
        if not any(r.values()):
            continue
        where = f"{r.get('week_start', '')} {r.get('market', '')} {r.get('scope', '')} {r.get('target', '')}".strip()
        ws, market, scope, target = r.get("week_start", ""), r.get("market", "").upper(), r.get("scope", "").lower(), r.get("target", "")
        bad = False
        if not DATE.match(ws) or not _valid_date(ws):
            problems.append(Problem(n, f"week_start は YYYY-MM-DD で: {ws or '(空)'}", where))
            bad = True
        elif date.fromisoformat(ws).weekday() != 0:
            problems.append(Problem(n, f"week_start は月曜にしてください: {ws}({'月火水木金土日'[date.fromisoformat(ws).weekday()]}曜)", where))
            bad = True
        if not MARKET.match(market):
            problems.append(Problem(n, f"market は大文字 2 文字(JP / US など)で: {market or '(空)'}", where))
            bad = True
        if scope not in SCOPES:
            problems.append(Problem(n, f"scope は product / category / all のどれかで: {scope or '(空)'}", where))
            bad = True
        if scope in ("product", "category") and not target:
            problems.append(Problem(n, f"scope が {scope} の行は、target(商品コード / カテゴリ)が要ります", where))
            bad = True
        if scope == "all" and target:
            problems.append(Problem(n, "scope が all の行の target は使いません(空にします)", where))
            target = ""
        priority: int | None = None
        if r.get("priority"):
            try:
                priority = int(r["priority"])
            except ValueError:
                problems.append(Problem(n, f"priority は数字で: {r['priority']}", where))
                bad = True
        if r.get("promo_period") and not PERIOD.match(r["promo_period"]):
            problems.append(Problem(n, f"promo_period は YYYY-MM-DD - YYYY-MM-DD で: {r['promo_period']}(そのまま取り込みます)", where))
        if len(r.get("note", "")) > NOTE_LIMIT:
            problems.append(Problem(n, f"note が {NOTE_LIMIT} 字を超えています({len(r['note'])} 字)", where))
        key = (ws, market, scope, target)
        if key in seen:
            problems.append(Problem(n, "同じ週・市場・対象の行が重なっています(あとのほうを飛ばします)", where))
            bad = True
        if bad:
            continue
        seen.add(key)
        rows.append({
            "week_start": ws, "market": market, "scope": scope, "target": target, "stage": r.get("stage", ""), "priority": priority,
            "promo_period": r.get("promo_period", ""), "focus": r.get("focus", ""), "note": r.get("note", ""), "line": n,
        })
    return Parsed("sales", rows, problems)


def parse(kind: str, content: str) -> Parsed:
    if kind == "rules":
        return parse_rules(content)
    if kind == "sales":
        return parse_sales(content)
    raise ValueError(f"kind は rules か sales です: {kind}")


# ---- API
class PolicyFile(BaseModel):
    kind: str
    filename: str
    content: str


def _summary(p: Parsed, filename: str) -> dict[str, Any]:
    out: dict[str, Any] = {
        "kind": p.kind, "filename": filename, "title": p.title, "count": len(p.rows),
        "problems": [asdict(x) for x in p.problems],
    }
    if p.kind == "sales":
        weeks = sorted({(r["week_start"], r["market"]) for r in p.rows})
        out["weeks"] = [{"week_start": w, "market": m, "rows": sum(1 for r in p.rows if (r["week_start"], r["market"]) == (w, m))} for w, m in weeks]
    else:
        out["rules"] = [{k: r[k] for k in ("rule_id", "title", "applies_to", "strength", "market", "channel", "check_spec")} for r in p.rows]
    return out


@router.post("/preview")
async def preview(file: PolicyFile) -> dict[str, Any]:
    try:
        p = parse(file.kind, file.content)
    except ValueError as e:
        return {"success": False, "error": {"message": str(e)}}
    return {"success": True, "data": _summary(p, file.filename)}


async def save(p: Parsed, filename: str) -> dict[str, Any]:
    """読めた行を保存する(1 つのトランザクション)。rules はファイルごと、sales は週 × 市場ごとに置き換える"""
    now = datetime.now(timezone.utc)
    async with db(write=True) as conn:
        if p.kind == "rules":
            removed = (await conn.execute(text("DELETE FROM policy_rules WHERE source_file = :f"), {"f": filename})).rowcount
            values = [{
                "rule_id": r["rule_id"], "title": r["title"], "applies_to": r["applies_to"], "strength": r["strength"], "market": r["market"],
                "channel": r["channel"], "period_start": date.fromisoformat(r["period_start"]) if r["period_start"] else None,
                "period_end": date.fromisoformat(r["period_end"]) if r["period_end"] else None, "check_spec": r["check_spec"], "body": r["body"],
                "source_file": filename, "sort_order": i, "imported_at": now,
            } for i, r in enumerate(p.rows)]
            if values:
                cols = list(values[0])
                await conn.execute(text(f"INSERT INTO policy_rules ({', '.join(cols)}) VALUES ({', '.join(':' + c for c in cols)})"), values)
            # 同じ番号が、別のファイルにも残っていれば知らせる(あとから取り込んだほうを使うが、元のファイルを整理してもらう)
            dup = (await conn.execute(text("SELECT rule_id FROM policy_rules GROUP BY rule_id HAVING count(*) > 1"))).scalars().all()
            return {"replaced": removed, "saved": len(values), "duplicates": list(dup)}
        weeks = sorted({(r["week_start"], r["market"]) for r in p.rows})
        removed = 0
        for w, m in weeks:
            removed += (await conn.execute(text("DELETE FROM sales_policies WHERE week_start = :w AND market = :m"), {"w": date.fromisoformat(w), "m": m})).rowcount
        values = [{
            "week_start": date.fromisoformat(r["week_start"]), "market": r["market"], "scope": r["scope"], "target": r["target"], "stage": r["stage"],
            "priority": r["priority"], "promo_period": r["promo_period"], "focus": r["focus"], "note": r["note"], "source_file": filename, "imported_at": now,
        } for r in p.rows]
        if values:
            cols = list(values[0])
            await conn.execute(text(f"INSERT INTO sales_policies ({', '.join(cols)}) VALUES ({', '.join(':' + c for c in cols)})"), values)
        return {"replaced": removed, "saved": len(values), "weeks": len(weeks)}


@router.post("/import")
async def import_file(file: PolicyFile) -> dict[str, Any]:
    try:
        p = parse(file.kind, file.content)
    except ValueError as e:
        return {"success": False, "error": {"message": str(e)}}
    if not p.rows:
        return {"success": False, "error": {"message": "読めた決まり・行がありません(中身を確かめてください)"}, "data": _summary(p, file.filename)}
    result = await save(p, file.filename)
    return {"success": True, "data": {**_summary(p, file.filename), **result}}
