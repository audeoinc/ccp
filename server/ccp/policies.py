"""マーケティングポリシーの取り込み(バックログ M3・M4。設計は docs/POLICY.md、取り込むファイルの形は docs/POLICY_FORMAT.md)。

  POST /api/policies/preview  {kind: "rules" | "sales", filename, content}
                              ファイルを読み分けた結果(件数・読めなかった行と理由)を返す。何も変えない
  POST /api/policies/import   同じ入力。読めたものを保存する
  POST /api/policies/rules            画面で決まりを足す(X61。置き場所は「画面で作成」。取り込み直しても消えない)
  PUT  /api/policies/rules/{id}       決まりを直す(取り込んだ決まりも直せる。同じファイルを取り込み直すと、ファイルの内容に戻る)
  DELETE /api/policies/rules/{id}     決まりを消す
  GET  /api/policies/rules/export     いまの決まりを、取り込める Markdown にする(?source_file= でファイルごと)
  画面で足す・直す・消すと、表 policy_rule_edits に前後の中身を残す。確かめは、取り込みと同じ読み分け(rule_markdown → parse_rules)
                              rules(ルール系の Markdown): 同じファイル名の決まりを、まるごと置き換える(版 = ファイル名 + 取り込んだ日時)
                              sales(販売系の CSV):       ファイルに入っている週 × 市場の行を置き換える(ファイルにない週は残す)

読み分けは、画面の確かめ(preview)と取り込みで同じ関数を使う(確かめでは通ったのに取り込めない、を起こさないため)。
読めなかった決まり・行は飛ばし、理由を返す(1 つの誤りで、ファイル全体を止めない。直すのは元のファイル)。
"""
from __future__ import annotations

import csv
import io
import json
import re
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timezone
from typing import Any
from urllib.parse import unquote

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import text

from . import schema as sc
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
    if p.kind == "rules":
        if file.filename == SCREEN_FILE:
            return {"success": False, "error": {"message": f"「{SCREEN_FILE}」は画面で足した決まりの置き場所です。別のファイル名にしてください"}}
        # 画面で直した決まり(このファイルから取り込んだもの)は、取り込むとファイルの内容に戻る
        async with db() as conn:
            edited = (await conn.execute(text("SELECT rule_id FROM policy_rules WHERE source_file = :f AND edited_at IS NOT NULL ORDER BY sort_order"), {"f": file.filename})).scalars().all()
        return {"success": True, "data": {**_summary(p, file.filename), "edited_on_screen": list(edited)}}
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
    if p.kind == "rules" and file.filename == SCREEN_FILE:
        # 画面で足した決まりの置き場所は、取り込みで置き換えない
        return {"success": False, "error": {"message": f"「{SCREEN_FILE}」は画面で足した決まりの置き場所です。別のファイル名にしてください"}}
    if not p.rows:
        return {"success": False, "error": {"message": "読めた決まり・行がありません(中身を確かめてください)"}, "data": _summary(p, file.filename)}
    result = await save(p, file.filename)
    return {"success": True, "data": {**_summary(p, file.filename), **result}}


# ---- 画面で直す(X61)
# 画面で足した決まりの置き場所(ファイル名の代わり)。ファイルを取り込み直しても、ここは置き換わらない
SCREEN_FILE = "画面で作成"
# 書き出しのときの項目の名前(読み分けの ITEM_KEYS の日本語)
_ITEM_LABELS = (("applies_to", "対象"), ("strength", "強さ"), ("market", "市場"), ("channel", "チャネル"))


def rule_markdown(r: dict[str, Any]) -> str:
    """決まり 1 件を、取り込みのファイルと同じ Markdown にする(画面で直したものを、同じ読み分けで確かめる・書き出すため)"""
    head = f"## {str(r.get('rule_id') or '').strip()} {str(r.get('title') or '').strip()}".rstrip()
    lines = [head]
    for key, label in _ITEM_LABELS:
        v = str(r.get(key) or "").strip()
        if v:
            lines.append(f"- {label}: {', '.join(_split_list(v))}")
    ps, pe = str(r.get("period_start") or "")[:10], str(r.get("period_end") or "")[:10]
    if ps or pe:
        lines.append(f"- 期間: {ps or pe} - {pe or ps}")
    if str(r.get("check_spec") or "").strip():
        lines.append(f"- 確かめ方: {str(r['check_spec']).strip()}")
    body = str(r.get("body") or "").strip()
    return "\n".join(lines) + ("\n\n" + body if body else "") + "\n"


def rules_markdown(rows: list[dict[str, Any]], title: str) -> str:
    """決まりの一覧を、取り込めるファイルの形(POLICY_FORMAT.md の 3 章)にする"""
    today = datetime.now(timezone.utc).date().isoformat()
    head = f"# {title}\n- 版: {today}(CCP から書き出し)\n"
    return head + "\n" + "\n".join(rule_markdown(r) for r in rows)


def check_rule(fields: dict[str, Any]) -> tuple[dict[str, Any] | None, list[Problem]]:
    """画面で入れた決まりを、取り込みと同じ読み分けで確かめる。読めれば保存する形の行を返す"""
    if not str(fields.get("rule_id") or "").strip():
        return None, [Problem(0, "決まりの番号を入れてください(例: R-LIMIT-001)")]
    if not str(fields.get("title") or "").strip():
        return None, [Problem(0, "題名を入れてください")]
    p = parse_rules(rule_markdown(fields))
    # 行番号は画面では意味がないので 0 に
    problems = [Problem(0, x.message, x.where) for x in p.problems]
    return (p.rows[0] if p.rows else None), problems


class RuleIn(BaseModel):
    rule_id: str = ""
    title: str = ""
    applies_to: str = ""
    strength: str = ""
    market: str = ""
    channel: str = ""
    period_start: str | None = None
    period_end: str | None = None
    check_spec: str | None = None
    body: str = ""


def _actor(request: Request) -> str:
    return unquote(request.headers.get("x-ccp-actor", ""))[:100]


def _db_values(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "rule_id": row["rule_id"], "title": row["title"], "applies_to": row["applies_to"], "strength": row["strength"],
        "market": row["market"], "channel": row["channel"],
        "period_start": date.fromisoformat(row["period_start"]) if row.get("period_start") else None,
        "period_end": date.fromisoformat(row["period_end"]) if row.get("period_end") else None,
        "check_spec": row.get("check_spec"), "body": row.get("body") or "",
    }


_HISTORY_KEYS = ("rule_id", "title", "applies_to", "strength", "market", "channel", "period_start", "period_end", "check_spec", "body", "source_file")


def history_json(row: Any) -> str:
    """直した記録に残す、前後の中身(JSON)"""
    if row is None:
        return ""
    return json.dumps({k: (str(row[k]) if row.get(k) is not None else None) for k in _HISTORY_KEYS}, ensure_ascii=False)


async def _history(conn: Any, action: str, rule_id: str, before: Any, after: Any, actor: str, source_file: str | None) -> None:
    await conn.execute(
        text("INSERT INTO policy_rule_edits (rule_id, action, before_value, after_value, actor, source_file) VALUES (:r, :a, :b, :f, :who, :src)"),
        {"r": rule_id, "a": action, "b": history_json(before), "f": history_json(after), "who": actor, "src": source_file},
    )


def _invalid(problems: list[Problem]) -> dict[str, Any]:
    return {"success": False, "error": {"message": " / ".join(p.message for p in problems) or "決まりを読めませんでした"}, "data": {"problems": [asdict(p) for p in problems]}}


@router.post("/rules")
async def create_rule(body: RuleIn, request: Request) -> dict[str, Any]:
    """画面で決まりを足す(置き場所は「画面で作成」。ファイルを取り込み直しても消えない)"""
    row, problems = check_rule(body.model_dump())
    if row is None:
        return _invalid(problems)
    actor = _actor(request)
    async with db(write=True) as conn:
        if (await conn.execute(text("SELECT 1 FROM policy_rules WHERE rule_id = :r"), {"r": row["rule_id"]})).first():
            return {"success": False, "error": {"message": f"決まりの番号「{row['rule_id']}」は、もう使われています"}}
        order = (await conn.execute(text("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM policy_rules WHERE source_file = :f"), {"f": SCREEN_FILE})).scalar() or 0
        values = {**_db_values(row), "source_file": SCREEN_FILE, "sort_order": order, "edited_at": datetime.now(timezone.utc), "edited_by": actor}
        cols = list(values)
        created = (await conn.execute(text(f"INSERT INTO policy_rules ({', '.join(cols)}) VALUES ({', '.join(':' + c for c in cols)}) RETURNING *"), values)).mappings().first()
        await _history(conn, "create", row["rule_id"], None, dict(created) if created else values, actor, SCREEN_FILE)
    return {"success": True, "data": {"problems": [asdict(p) for p in problems]}}


@router.put("/rules/{rid}")
async def update_rule(rid: str, body: RuleIn, request: Request) -> dict[str, Any]:
    """決まりを直す。取り込んだ決まりを直したときは、同じファイルを取り込み直すと、ファイルの内容に戻る(取り込みの確かめで知らせる)"""
    row, problems = check_rule(body.model_dump())
    if row is None:
        return _invalid(problems)
    actor = _actor(request)
    async with db(write=True) as conn:
        before = (await conn.execute(text("SELECT * FROM policy_rules WHERE id = :id FOR UPDATE"), {"id": sc.coerce("uuid", rid)})).mappings().first()
        if before is None:
            return {"success": False, "error": {"message": "決まりが見つかりません(ほかの人が消したか、取り込み直されました)"}}
        if (await conn.execute(text("SELECT 1 FROM policy_rules WHERE rule_id = :r AND id <> :id"), {"r": row["rule_id"], "id": before["id"]})).first():
            return {"success": False, "error": {"message": f"決まりの番号「{row['rule_id']}」は、ほかの決まりで使われています"}}
        values = {**_db_values(row), "edited_at": datetime.now(timezone.utc), "edited_by": actor}
        sets = ", ".join(f"{c} = :{c}" for c in values)
        after = (await conn.execute(text(f"UPDATE policy_rules SET {sets}, modified_on = now() WHERE id = :id RETURNING *"), {**values, "id": before["id"]})).mappings().first()
        await _history(conn, "update", row["rule_id"], dict(before), dict(after) if after else None, actor, before.get("source_file"))
    return {"success": True, "data": {"problems": [asdict(p) for p in problems]}}


@router.delete("/rules/{rid}")
async def delete_rule(rid: str, request: Request) -> dict[str, Any]:
    actor = _actor(request)
    async with db(write=True) as conn:
        before = (await conn.execute(text("DELETE FROM policy_rules WHERE id = :id RETURNING *"), {"id": sc.coerce("uuid", rid)})).mappings().first()
        if before is None:
            return {"success": False, "error": {"message": "決まりが見つかりません"}}
        await _history(conn, "delete", str(before.get("rule_id") or ""), dict(before), None, actor, before.get("source_file"))
    return {"success": True, "data": {}}


@router.get("/rules/export")
async def export_rules(source_file: str = "") -> dict[str, Any]:
    """いまの決まりを、取り込めるファイル(Markdown)にする。source_file を渡せば、そのファイルの分だけ(元のファイルを直すため)"""
    async with db() as conn:
        q = "SELECT * FROM policy_rules" + (" WHERE source_file = :f" if source_file else "") + " ORDER BY source_file, sort_order, rule_id"
        rows = [dict(r) for r in (await conn.execute(text(q), {"f": source_file} if source_file else {})).mappings().all()]
    title = source_file or "CCP のマーケティングの決まり(すべて)"
    base = re.sub(r"\.(md|markdown|txt)$", "", source_file or "ccp-rules", flags=re.I)
    return {"success": True, "data": {"filename": f"{base}.md", "content": rules_markdown(rows, title), "count": len(rows)}}
