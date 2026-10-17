"""BigQuery の出力の、値の確かめ(docs/BIGQUERY.md の 11 章の 3)。

列があるかだけでなく、キーの重複・空の値・市場の値・数値の範囲・SKU と SPU の結びつきまで確かめる。
同じ関数を、次の 2 か所で使う(確かめ方を 1 つにして、「確かめでは通ったのに、取り込めない」を起こさないため):
  - python -m ccp.cli bq-check   利用先の Claude が、ビューを作っては確かめるのを繰り返すための道具
  - 取り込み(bq_import.py)      NG がある出力は取り込まず、前のデータのまま残す

NG = 取り込めない(キーの重複・必須の空・ありえない値)。注意 = 取り込めるが、確かめてほしい(CCP の選択肢にない値 など)。
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any, Iterable

from . import bq, schema as sc

NG, WARN = "NG", "注意"
MARKET = re.compile(r"^[A-Z]{2}$")
# 仕様(BIGQUERY_EXPORT.md)のキー
KEYS = {"spu": ("market", "product_code"), "sku": ("market", "sku_code"), "sku_stock": ("market", "sku_code"),
        "weekly": ("market", "product_code", "week_start"), "forecast": ("market", "date")}
# データの時点が、これより古ければ注意(更新が止まっていないか)
FRESH = {"spu": timedelta(days=3), "sku": timedelta(days=3), "sku_stock": timedelta(hours=6), "weekly": timedelta(days=10), "forecast": timedelta(days=2)}


@dataclass
class Issue:
    level: str
    output: str
    message: str
    count: int = 0
    examples: list[str] = field(default_factory=list)

    def text(self) -> str:
        ex = f"(例: {', '.join(self.examples)})" if self.examples else ""
        n = f" {self.count} 行" if self.count else ""
        return f"{self.message}{n}{ex}"


def _num(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _key(row: dict[str, Any], cols: Iterable[str]) -> str:
    return "/".join(str(row.get(c)) for c in cols)


def as_ts(v: Any) -> datetime | None:
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    if isinstance(v, str) and v:
        try:
            d = datetime.fromisoformat(v.replace("Z", "+00:00"))
            return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


def _date(v: Any) -> date | None:
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    if isinstance(v, str) and v:
        try:
            return date.fromisoformat(v[:10])
        except ValueError:
            return None
    return None


class _Collector:
    def __init__(self, output: str, key: tuple[str, ...]) -> None:
        self.output, self.key = output, key
        self.issues: list[Issue] = []

    def check(self, level: str, message: str, rows: list[dict[str, Any]], bad: Any) -> None:
        """bad(行 → 真偽)が真になる行を数えて、あれば 1 件の問題にする(例は 3 件まで)"""
        hits = [r for r in rows if bad(r)]
        if hits:
            self.issues.append(Issue(level, self.output, message, len(hits), [_key(r, self.key) for r in hits[:3]]))

    def range(self, rows: list[dict[str, Any]], col: str, lo: float | None, hi: float | None, level: str = NG) -> None:
        def bad(r: dict[str, Any]) -> bool:
            v = _num(r.get(col))
            return v is not None and ((lo is not None and v < lo) or (hi is not None and v > hi))

        span = f"{lo if lo is not None else ''}〜{hi if hi is not None else ''}"
        self.check(level, f"{col} が範囲({span})の外です", rows, bad)

    def values(self, rows: list[dict[str, Any]], col: str, allowed: Iterable[str], level: str = NG, note: str = "") -> None:
        ok = set(allowed)
        hits = [r for r in rows if r.get(col) not in (None, "") and str(r.get(col)) not in ok]
        if hits:
            found = sorted({str(r.get(col)) for r in hits})
            self.issues.append(Issue(level, self.output, f"{col} に、決まった値({' / '.join(sorted(ok))})にない値があります: {', '.join(found[:8])}{note}", len(hits), [_key(r, self.key) for r in hits[:3]]))


def validate(name: str, rows: list[dict[str, Any]], context: dict[str, list[dict[str, Any]]] | None = None, now: datetime | None = None) -> list[Issue]:
    """出力 name(spu / sku / sku_stock / weekly / forecast)の行を確かめる。
    context には、結びつきを確かめる相手の行を入れる(sku なら spu、sku_stock なら sku。なければ、結びつきは確かめない)"""
    o = next(x for x in bq.OUTPUTS if x.name == name)
    key = KEYS[name]
    c = _Collector(name, key)
    ctx = context or {}
    now = now or datetime.now(timezone.utc)
    if not rows:
        c.issues.append(Issue(NG, name, "行が 1 行もありません"))
        return c.issues

    # 共通: 必須の列が空でない・キーが重ならない・市場の形
    for col in o.required:
        c.check(NG, f"必須の列 {col} が空です", rows, lambda r, col=col: r.get(col) in (None, ""))
    seen: dict[str, int] = {}
    for r in rows:
        k = _key(r, key)
        seen[k] = seen.get(k, 0) + 1
    dup = [k for k, n in seen.items() if n > 1]
    if dup:
        c.issues.append(Issue(NG, name, f"キー({', '.join(key)})が重なっている組があります: {len(dup)} 組", 0, dup[:3]))
    c.check(NG, "market が大文字の 2 文字(JP / US など)ではありません", rows, lambda r: r.get("market") not in (None, "") and not MARKET.match(str(r.get("market"))))
    markets = sc.load().table("products").by_name["market"].choices or []
    c.values(rows, "market", markets, WARN, "(CCP の配信カードの国にない市場は、AI の選定に使われません)")

    # 共通: データの時点が古すぎない・先すぎない
    stamp = "issued_at" if name == "forecast" else "as_of"
    times = [t for t in (as_ts(r.get(stamp)) for r in rows) if t]
    if times:
        newest = max(times)
        if newest > now + timedelta(hours=1):
            c.issues.append(Issue(WARN, name, f"{stamp} が未来です(最新 {newest:%Y-%m-%d %H:%M %Z})。取り込んだ時刻ではなく、元のデータの時点を入れてください"))
        elif now - newest > FRESH[name]:
            c.issues.append(Issue(WARN, name, f"{stamp} が古いままです(最新 {newest:%Y-%m-%d %H:%M %Z})。元のデータの更新が止まっていないか確かめてください"))

    if name == "spu":
        c.values(rows, "sales_trend", ("up", "flat", "down"))
        c.values(rows, "weather_basis", ("spu", "category"))
        for col in ("price", "units_4w", "revenue_4w", "views_4w", "review_count", "hot_days", "cold_days", "rain_days"):
            c.range(rows, col, 0, None)
        c.range(rows, "cvr_4w", 0, 1)
        c.range(rows, "rating", 1, 5)
        c.range(rows, "revenue_yoy", 0, None)
        for col in ("lift_hot", "lift_cold", "lift_rain"):
            c.range(rows, col, -1, None)
            c.range(rows, col, None, 5, WARN)  # 売上 +500% を超える反応は、計算の誤り(日数が少ない など)を疑う
        c.check(WARN, "description が 500 字を超えています(AI に渡すときに長すぎる)", rows, lambda r: len(str(r.get("description") or "")) > 500)
        for col in ("category", "season"):
            allowed = sc.load().table("products").by_name[col].choices or []
            c.values(rows, col, allowed, WARN, "(いまの CCP は決まった選択肢で持つ。BACKLOG の B7)")
        c.check(WARN, "category_path の区切りが ' > ' ではありません", rows, lambda r: bool(r.get("category_path")) and ">" in str(r["category_path"]) and " > " not in str(r["category_path"]))
        c.check(WARN, "review_count があるのに rating が空です", rows, lambda r: (_num(r.get("review_count")) or 0) > 0 and r.get("rating") is None)

    elif name == "sku":
        c.range(rows, "price", 0, None)
        c.range(rows, "units_4w", 0, None)
        spu = ctx.get("spu")
        if spu is not None:
            have = {(r.get("market"), r.get("product_code")) for r in spu}
            c.check(NG, "product_code が、SPU の出力にありません(SKU は必ず SPU に属する)", rows, lambda r: (r.get("market"), r.get("product_code")) not in have)
            with_sku = {(r.get("market"), r.get("product_code")) for r in rows}
            orphans = [r for r in spu if (r.get("market"), r.get("product_code")) not in with_sku]
            if orphans:
                c.issues.append(Issue(WARN, name, "SKU が 1 つもない SPU があります(在庫が 0 として扱われます)", len(orphans), [_key(r, KEYS["spu"]) for r in orphans[:3]]))

    elif name == "sku_stock":
        c.range(rows, "stock", 0, None)
        c.check(NG, "stock が整数ではありません", rows, lambda r: _num(r.get("stock")) is not None and not float(_num(r.get("stock")) or 0).is_integer())
        sku = ctx.get("sku")
        if sku is not None:
            have = {(r.get("market"), r.get("sku_code")) for r in sku}
            c.check(NG, "sku_code が、SKU の出力にありません", rows, lambda r: (r.get("market"), r.get("sku_code")) not in have)
            stocked = {(r.get("market"), r.get("sku_code")) for r in rows}
            missing = [r for r in sku if (r.get("market"), r.get("sku_code")) not in stocked]
            if missing:
                c.issues.append(Issue(WARN, name, "在庫の行がない SKU があります(在庫 0 として扱います)", len(missing), [_key(r, KEYS["sku"]) for r in missing[:3]]))

    elif name == "weekly":
        c.range(rows, "units", 0, None)
        c.range(rows, "revenue", 0, None)
        c.range(rows, "stock", 0, None)
        c.check(NG, "week_start が月曜ではありません", rows, lambda r: (d := _date(r.get("week_start"))) is not None and d.weekday() != 0)
        this_monday = (now.date() - timedelta(days=now.date().weekday()))
        c.check(WARN, "終わっていない今週(以降)の行があります(直近 12 週は、先週までにしてください)", rows, lambda r: (d := _date(r.get("week_start"))) is not None and d >= this_monday)
        weeks: dict[tuple[Any, Any], int] = {}
        for r in rows:
            k = (r.get("market"), r.get("product_code"))
            weeks[k] = weeks.get(k, 0) + 1
        short = [f"{m}/{p}" for (m, p), n in weeks.items() if n < 12]
        if short:
            c.issues.append(Issue(WARN, name, "12 週に満たない商品があります(販売がなかった週も、units = 0 の行を出してください)", len(short), short[:3]))
        spu = ctx.get("spu")
        if spu is not None:
            have = {(r.get("market"), r.get("product_code")) for r in spu}
            c.check(WARN, "product_code が、SPU の出力にありません", rows, lambda r: (r.get("market"), r.get("product_code")) not in have)

    elif name == "forecast":
        c.values(rows, "weather", ("sunny", "cloudy", "rain", "snow"))
        c.range(rows, "precip_prob", 0, 100)
        c.range(rows, "temp_max", -40, 50, WARN)
        c.check(NG, "temp_min が temp_max より高い行があります", rows, lambda r: _num(r.get("temp_min")) is not None and _num(r.get("temp_max")) is not None and (_num(r.get("temp_min")) or 0) > (_num(r.get("temp_max")) or 0))
        c.check(WARN, "過去の日付の予報があります(今日からにしてください)", rows, lambda r: (d := _date(r.get("date"))) is not None and d < now.date() - timedelta(days=1))
    return c.issues


def has_ng(issues: list[Issue]) -> bool:
    return any(i.level == NG for i in issues)


def fetch(o: bq.Output, client: Any) -> list[dict[str, Any]]:
    """出力の行を、すべて読む(仕様の列だけ。数百〜数千行なので、まとめて読む)"""
    from google.cloud import bigquery  # noqa: F401 — パッケージがないときに、ここで分かるように

    where = bq.location(o)
    t = client.get_table(where)
    have = {f.name.lower(): f.name for f in (getattr(t, "schema", None) or [])}
    cols = [have[c] for c in (*o.required, *o.optional) if c in have]
    sql = f"SELECT {', '.join(f'`{c}`' for c in cols)} FROM `{where}`"
    return [{k.lower(): v for k, v in dict(r).items()} for r in client.query(sql).result()]


def run_cli() -> int:
    """python -m ccp.cli bq-check: 設定された出力を読み、値まで確かめて表示する。NG の数を返す(何も変えない)"""
    outputs = bq.configured()
    if not outputs:
        print("BQ_SPU などの設定がありません(server/workbench.env.example を見て、出力の場所を設定してください)")
        return 1
    client = bq.client()
    print(f"接続のアカウント: {bq.account()} / ジョブのプロジェクト: {bq.job_project() or '(なし)'}")
    rows: dict[str, list[dict[str, Any]]] = {}
    ng = 0
    for o in bq.OUTPUTS:  # SPU → SKU → 在庫 の順に読むので、結びつきも確かめられる
        if o not in outputs:
            print(f"■ {o.label}: {o.env} の設定がありません(確かめない)")
            continue
        try:
            rows[o.name] = fetch(o, client)
        except Exception as e:  # noqa: BLE001 — 読めない理由を、そのまま見せる
            print(f"■ {o.label}: 読めません({type(e).__name__}: {e})")
            ng += 1
            continue
        ctx = {"spu": rows.get("spu"), "sku": rows.get("sku")}
        issues = validate(o.name, rows[o.name], {k: v for k, v in ctx.items() if v is not None})
        n_ng = sum(1 for i in issues if i.level == NG)
        print(f"■ {o.label}: {len(rows[o.name])} 行 — {'OK' if not issues else f'NG {n_ng} 件・注意 {len(issues) - n_ng} 件'}")
        for i in issues:
            print(f"  [{i.level}] {i.text()}")
        ng += n_ng
    print()
    print("値の問題は見つかりませんでした" if ng == 0 else f"NG が {ng} 件あります。NG がある出力は、CCP は取り込みません(前のデータのまま)")
    return ng
