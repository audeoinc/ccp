"""BigQuery からの取り込み(バックログ B2・B4。設計は docs/BIGQUERY.md の 5 章と 11 章)と、その管理(settings.dataimport)。

  POST /api/bq/sync          画面を開いたとき(force なし)と、⚙ の「今すぐ取り込む」(force。only で出力を絞る。管理する人だけ)
  GET  /api/bq/status        出力ごとの状態(最後の取り込み・最後に確かめた日時・次に確かめる日時・間隔・古いか)と、自動の入・切
  POST /api/bq/check         確かめだけ(読んで bq_validate まで。書かない。管理する人だけ)
  GET  /api/bq/history       取り込みの記録(新しい順。管理する人だけ)
  GET/PUT /api/bq/settings   自動の取り込みの入・切と、出力ごとの間隔(変えるのは管理する人だけ)

流れ:
  ① 出力ごとに、最終更新の日時を見る(ビューなら BQ_<名前>_WATCH の表。メタデータだけなので、無料・一瞬)
  ② 前回の取り込みから変わった出力だけ、行を読む(force なら、すべて)
  ③ 値を確かめる(bq_validate。ccp.cli bq-check と同じ確かめ)。行数が前回の半分を切ったときも止める
  ④ NG がない出力だけを、1 つのトランザクションで入れ替える(途中の状態を、画面や AI に見せない)
     NG の出力は、前のデータのまま残し、理由を bq_imports に記録する(画面に出す)

定期の取り込み(2026-11-03 利用者): サーバーの中で回す(run_scheduler。main.py が起動のときに始める)。起動したらすぐ 1 回、そのあとは 1 分ごとに、
出力ごとの間隔(在庫 5 分・ほか 60 分。画面で変えられる)がたった出力の最終更新を見て、変わっていれば取り込む(上の ①〜④)。
既定は「切」(管理する人が「確認だけ」と「今すぐ取り込む」で本物のデータを確かめてから入れる。2026-10-17 の取り込みの事故の教訓)。
環境変数 BQ_AUTO_SYNC=0 なら、画面の設定にかかわらず回さない(使われないときにサーバーが止まる環境・試験)。
自動が「入」のときは、画面を開いたときの取り込みはしない(状態を返すだけ。二重に読まないため)。
DB が使えないとき(dbready)は、require_db が「準備中」を返す。画面は、データを読めてから取り込みを依頼する。
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from datetime import datetime, timedelta, timezone
import re
from typing import Any
from urllib.parse import unquote

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from . import appsettings, bq, bq_validate as bv, datasource, dbready, schema as sc, seeddata
from .data_api import db, require_db
from .identity import admin_denied

log = logging.getLogger("ccp.bq")
router = APIRouter(prefix="/api/bq", dependencies=[Depends(require_db)])

# 画面を開くたびに BigQuery を見に行かないよう、force でない確認は、この間隔をあける(プロセスごと)
MIN_INTERVAL_S = 60
# 更新を見る表がないビューは、最終更新の日時で変化が分からないので、この間隔で読み直す
VIEW_REFRESH = timedelta(minutes=10)
# 取り込みを、複数のプロセス(サーバーの複数の台)で同時に行わない(PostgreSQL の勧告ロックの番号。CCP の中で一意なら何でもよい)
LOCK_KEY = 4210017
# 定期の取り込みの順番(サーバーが 2 台以上でも、BigQuery を読むのは 1 台だけにする。書き込みの LOCK_KEY とは別の番号)
TICK_LOCK_KEY = 4210018
# 出力 → 書き込む表(取り込む順。SKU の確かめに SPU が、在庫の確かめに SKU が要る)
ORDER = ("spu", "sku", "sku_stock", "weekly", "forecast", "ranking")

_lock = asyncio.Lock()
_last_check = 0.0
# 出力ごとに、最後に最終更新を確かめた日時(このプロセスの中。変わっていなければ記録を足さないので、ここで持つ)
_checked: dict[str, datetime] = {}

# 何で取り込んだか(記録の trigger): 画面を開いたとき / ⚙ のボタン / 定期 / サーバーの起動のとき
TRIGGERS = ("open", "manual", "auto", "startup")
# 定期の取り込み: 目を覚ます間隔(秒)と、出力ごとの確かめる間隔(分)の既定と、選べる値
TICK_S = 60
DEFAULT_INTERVALS = {"spu": 60, "sku": 60, "sku_stock": 5, "weekly": 60, "forecast": 60, "ranking": 60}
INTERVAL_CHOICES = (2, 5, 15, 30, 60, 180, 360, 1440)
# 設定の置き場所(app_settings のまとめ。環境ごとに持つ。appsettings.py)
SETTINGS_NAME = "bq.sync"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def env_disabled() -> bool:
    """環境変数 BQ_AUTO_SYNC=0 で、定期の取り込みを止めているか"""
    return (os.getenv("BQ_AUTO_SYNC") or "").strip() == "0"


def parse_settings(raw: Any) -> dict[str, Any]:
    """設定の値(JSON の文字列か辞書)を、入・切と出力ごとの間隔(分)にそろえる。知らない出力・選べない間隔は既定に戻す"""
    v: Any = raw
    if isinstance(raw, str):
        try:
            v = json.loads(raw)
        except ValueError:
            v = {}
    if not isinstance(v, dict):
        v = {}
    got = v.get("intervals") if isinstance(v.get("intervals"), dict) else {}
    intervals = {}
    for name, default in DEFAULT_INTERVALS.items():
        try:
            m = int(got.get(name, default))
        except (TypeError, ValueError):
            m = default
        intervals[name] = m if m in INTERVAL_CHOICES else default
    return {"enabled": v.get("enabled") is True, "intervals": intervals}


async def load_settings() -> dict[str, Any]:
    """いまの設定(app_settings の最新の行。なければ既定 = 切)。appsettings が覚えた値を使うので、呼ぶたびには DB を読まない"""
    await appsettings.ensure()
    return parse_settings(appsettings.raw(SETTINGS_NAME))


async def save_settings(value: dict[str, Any], by: str) -> dict[str, Any]:
    """設定を残す(app_settings は、変えるたびに 1 行足す。前の行は変更の記録)"""
    clean = parse_settings(value)
    before = await load_settings()
    changes = (["enabled"] if before["enabled"] != clean["enabled"] else []) + sorted(f"interval:{k}" for k, v in clean["intervals"].items() if before["intervals"].get(k) != v)
    await appsettings.save(SETTINGS_NAME, clean, by, changes)
    return clean


def auto_on(settings: dict[str, Any]) -> bool:
    return bool(settings.get("enabled")) and not env_disabled()


def last_checked(name: str, prev: dict[str, Any] | None) -> datetime | None:
    """出力を最後に確かめた日時(このプロセスで確かめた日時と、記録の日時の新しいほう)"""
    times = [t for t in (_checked.get(name), (prev or {}).get("checked_at"), (prev or {}).get("imported_at")) if t]
    return max(times) if times else None


def due(names: list[str], settings: dict[str, Any], prev: dict[str, dict[str, Any]], now: datetime) -> list[str]:
    """間隔がたって、確かめる時機の出力"""
    out = []
    for name in names:
        last = last_checked(name, prev.get(name))
        if last is None or now - last >= timedelta(minutes=settings["intervals"].get(name, 60)):
            out.append(name)
    return out


def _modified(o: bq.Output, source: datasource.DataSource) -> datetime | None:
    """出力の最終更新の日時。分からなければ None = 間隔ごとに読む"""
    return source.last_updated(bq.location(o) or "", bq.watch_location(o))


def changed(prev: dict[str, Any] | None, modified: datetime | None, now: datetime) -> bool:
    """前回の取り込み(成否を問わない)から、出力が変わったか。失敗した版を、開くたびに読み直さないため、失敗の記録とも比べる"""
    if prev is None:
        return True
    if modified is None:
        imported = prev.get("imported_at")
        return imported is None or now - imported >= VIEW_REFRESH
    last = prev.get("source_modified")
    return last is None or modified > last


def _weather_choice(r: dict[str, Any]) -> str | None:
    """天気への反応の数字から、いまの CCP の「天気」の選択肢(sunny / rainy / cold)を決める。
    AI の指示文と商品の表示が、この選択肢を使っているため(反応が +20% に満たなければ、どれでもない)"""
    best = max((("cold", r.get("lift_cold")), ("rainy", r.get("lift_rain")), ("sunny", r.get("lift_hot"))), key=lambda x: float(x[1]) if x[1] is not None else -9)
    return best[0] if best[1] is not None and float(best[1]) >= 0.2 else None


_GENDER = {
    "mens": "mens", "men": "mens", "man": "mens", "male": "mens", "m": "mens",
    "womens": "womens", "women": "womens", "woman": "womens", "female": "womens", "ladies": "womens", "w": "womens", "f": "womens",
    "unisex": "unisex", "u": "unisex", "all": "unisex",
}


def gender_of(v: Any) -> str | None:
    """SPU の gender を、CCP の値(mens / womens / unisex)に読み替える。読めない値・空は None(商品は、どの対象にも出る)"""
    key = re.sub(r"[^a-z]", "", str(v or "").lower())
    return _GENDER.get(key)


def _values(table: str, row: dict[str, Any], cols: list[str]) -> dict[str, Any]:
    t = sc.load().table(table)
    return {c: sc.coerce(t.by_name[c].type, row.get(c)) for c in cols}


SPU_COLS = ["name", "product_code", "market", "category", "category_path", "page_url", "season", "price", "description", "sales_trend", "rating",
            "units_4w", "revenue_4w", "revenue_yoy", "views_4w", "cvr_4w", "review_count", "last_review_at", "review_texts",
            "lift_hot", "lift_cold", "lift_rain", "hot_days", "cold_days", "rain_days", "weather_basis", "as_of"]


async def _write_spu(conn: AsyncConnection, rows: list[dict[str, Any]]) -> str:
    """products に、SPU を書く。いまの行(商品の id は、配信の商品・メモから参照されている)は、市場と商品コードで見つけて更新する。
    BigQuery にない商品は、消さずに残す(配信カードに載った商品の表示を壊さないため)"""
    existing = (await conn.execute(text("SELECT id, market, product_code FROM products"))).mappings().all()
    by_key = {(r["market"], r["product_code"]): r["id"] for r in existing}
    by_code = {r["product_code"]: r["id"] for r in existing if r["market"] is None}
    updates, inserts = [], []
    for r in rows:
        v = _values("products", r, SPU_COLS)
        v["weather"] = _weather_choice(r)
        v["gender"] = gender_of(r.get("gender"))
        pid = by_key.get((r["market"], r["product_code"])) or by_code.get(r["product_code"])
        (updates if pid else inserts).append({**v, "id": pid} if pid else v)
    cols = SPU_COLS + ["weather", "gender"]
    if updates:
        await conn.execute(text(f"UPDATE products SET {', '.join(f'{c} = :{c}' for c in cols)}, modified_on = now() WHERE id = :id"), updates)
    if inserts:
        await conn.execute(text(f"INSERT INTO products ({', '.join(cols)}) VALUES ({', '.join(':' + c for c in cols)})"), inserts)
    keys = {(r["market"], r["product_code"]) for r in rows}
    left = sum(1 for r in existing if (r["market"], r["product_code"]) not in keys and not (r["market"] is None and any(k[1] == r["product_code"] for k in keys)))
    return f"更新 {len(updates)}・追加 {len(inserts)}" + (f"(BigQuery にない商品 {left} 件は、そのまま残しました)" if left else "")


def spu_mismatch(rows: list[dict[str, Any]], existing: list[dict[str, Any]]) -> str | None:
    """BigQuery の SPU が、いまの商品とまるで合っていないときの理由(合っていれば None)。
    いまの商品が 1 つもなければ、初めての取り込みなので通す。2026-10-17 に、本番にないダミーの商品を取り込んでしまったので、
    既存の商品の半分以上が BigQuery にない取り込みは止める(商品の入れ替えが本当に要るときは、ccp.importer で行う)"""
    have = {r["product_code"] for r in existing if r.get("product_code")}
    if not have:
        return None
    coming = {r["product_code"] for r in rows}
    gone = have - coming
    missing = len(gone)
    if missing * 2 > len(have):
        why = f"BigQuery の SPU に、いまの商品 {len(have)} 点のうち {missing} 点がありません(出力が、この環境の商品と合っていません)。取り込みを止めました"
        # 合わない商品の多くが見本(cli seed で入るもの)なら、そう言って消し方を出す(人が覚えていなくても、次にやることが分かるように)
        sample = gone & seeddata.product_codes()
        if sample and len(sample) * 2 >= missing:
            why += f"。合わない商品のうち {len(sample)} 点は見本の商品(server/seed.json)です。見本を消すと、次の取り込みで BigQuery の商品が入ります: {seeddata.REMOVE_HINT}"
        return why
    return None


# 画面の ⚙ の「見本の SKU を作る」で入れた行の印(sku・sku_stock の source。X63)。BigQuery から入れた行は空
SAMPLE = "sample"


async def _replace(conn: AsyncConnection, table: str, rows: list[dict[str, Any]], cols: list[str], extra: Any = None, scope: str | None = None, keep_sample: bool = False) -> str:
    """表を入れ替える。scope を渡すと、取り込む行にあるその列の値(商品コードなど)の行だけを消して入れ替える(ほかの行は残す)。
    2026-10-17 に、本番にない商品のダミーを取り込んで、本番の週ごとの実績を全部消してしまった。BigQuery にない商品の行は、消さない。
    keep_sample なら、見本の行(source = 'sample')は消さない(SKU の在庫は 1 時間に数回入れ替わるので、そのたびに見本が消えないように)"""
    if scope:
        keys = sorted({str(r[scope]) for r in rows if r.get(scope) is not None})
        await conn.execute(text(f"DELETE FROM {table} WHERE {scope} = ANY(:keys)"), {"keys": keys})
    elif keep_sample:
        await conn.execute(text(f"DELETE FROM {table} WHERE source IS DISTINCT FROM :sample"), {"sample": SAMPLE})
    else:
        await conn.execute(text(f"DELETE FROM {table}"))
    values = [{**_values(table, r, cols), **(extra(r) if extra else {})} for r in rows]
    if values:
        names = list(values[0])
        await conn.execute(text(f"INSERT INTO {table} ({', '.join(names)}) VALUES ({', '.join(':' + c for c in names)})"), values)
    return f"{len(values)} 行"


# 出力ごとの、写す先の CCP の DB の表(画面にも「BigQuery の場所 → この表」と出す。変えられない)
DEST = {"spu": "products", "sku": "sku", "sku_stock": "sku_stock", "weekly": "weekly_performances", "forecast": "weather_forecast", "ranking": "product_rankings"}


async def _write(conn: AsyncConnection, name: str, rows: list[dict[str, Any]]) -> str:
    if name == "spu":
        return await _write_spu(conn, rows)
    if name == "sku":
        # BigQuery の SKU が来た商品の見本は消す(本物と見本を、同じ商品に混ぜない)。ほかの商品の見本は残す
        codes = sorted({str(r["product_code"]) for r in rows if r.get("product_code") is not None})
        await conn.execute(text("""
            DELETE FROM sku_stock WHERE source = :sample
              AND sku_code IN (SELECT sku_code FROM sku WHERE source = :sample AND product_code = ANY(:codes))
        """), {"sample": SAMPLE, "codes": codes})
        await conn.execute(text("DELETE FROM sku WHERE source = :sample AND product_code = ANY(:codes)"), {"sample": SAMPLE, "codes": codes})
        return await _replace(conn, DEST["sku"], rows, ["market", "sku_code", "product_code", "color", "color_hex", "size", "length", "price", "units_4w", "as_of"], keep_sample=True)
    if name == "sku_stock":
        return await _replace(conn, DEST["sku_stock"], rows, ["market", "sku_code", "stock", "as_of"], keep_sample=True)
    if name == "weekly":
        # name は、いまの画面・初期データと同じ「商品コード 週の始まり」
        return await _replace(conn, DEST["weekly"], rows, ["market", "product_code", "week_start", "units", "revenue", "stock"],
                              lambda r: {"name": f"{r['product_code']} {str(r['week_start'])[:10]}"}, scope="product_code")
    if name == "ranking":
        # 週ごとの実績と同じく、取り込む商品の行だけを入れ替える(BigQuery にない商品の行は残す)
        return await _replace(conn, DEST["ranking"], rows, ["market", "product_code", "week_start", "channel", "rank", "units", "as_of"], scope="product_code")
    return await _replace(conn, DEST["forecast"], rows, ["market", "date", "temp_max", "temp_min", "precip_prob", "weather", "issued_at"])


async def _sum_stock(conn: AsyncConnection) -> None:
    """SPU の在庫(products.stock)を、SKU の在庫の合計にする。在庫の行がない SKU は 0(BIGQUERY_EXPORT.md の 4 章)。
    SKU と在庫を入れ替えたのと同じトランザクションで書くので、SPU と SKU の在庫が食い違わない。
    見本の SKU(source = 'sample')は数えない(見本は、いまの商品の在庫に合わせて作った写しで、在庫の出どころではないため)"""
    await conn.execute(text("""
        UPDATE products AS p SET stock = s.total, modified_on = now()
        FROM (
          SELECT k.market, k.product_code, SUM(COALESCE(st.stock, 0)) AS total
          FROM sku AS k LEFT JOIN sku_stock AS st ON st.market = k.market AND st.sku_code = k.sku_code AND st.source IS DISTINCT FROM 'sample'
          WHERE k.source IS DISTINCT FROM 'sample'
          GROUP BY k.market, k.product_code
        ) AS s
        WHERE p.product_code = s.product_code AND (p.market = s.market OR p.market IS NULL) AND p.stock IS DISTINCT FROM s.total
    """))
    # BigQuery から取り込んだ SPU で、SKU が 1 つもないものは、在庫 0
    await conn.execute(text("""
        UPDATE products AS p SET stock = 0, modified_on = now()
        WHERE p.as_of IS NOT NULL AND COALESCE(p.stock, 0) <> 0
          AND NOT EXISTS (SELECT 1 FROM sku AS k WHERE k.product_code = p.product_code AND (k.market = p.market OR p.market IS NULL) AND k.source IS DISTINCT FROM 'sample')
    """))


async def _db_context(conn: AsyncConnection, name: str) -> list[dict[str, Any]]:
    """取り込まない側の、いまの DB の行(SKU を確かめるときの SPU など)"""
    if name == "spu":
        sql = "SELECT market, product_code FROM products WHERE as_of IS NOT NULL"
    else:
        sql = "SELECT market, sku_code FROM sku WHERE source IS DISTINCT FROM 'sample'"
    return [dict(r) for r in (await conn.execute(text(sql))).mappings().all()]


async def latest() -> dict[str, dict[str, Any]]:
    """出力ごとの、最後の取り込みの記録(成否を問わない)と、最後に成功した記録・その前に成功した行数"""
    async with db() as conn:
        rows = (await conn.execute(text("""
            SELECT DISTINCT ON (source) id, source, status, source_modified, data_as_of, row_count, message, imported_at, checked_at, repeat_count, trigger, actor
            FROM bq_imports ORDER BY source, imported_at DESC
        """))).mappings().all()
        ok = (await conn.execute(text("""
            SELECT source, data_as_of, row_count, imported_at, n FROM (
              SELECT source, data_as_of, row_count, imported_at, ROW_NUMBER() OVER (PARTITION BY source ORDER BY imported_at DESC) AS n
              FROM bq_imports WHERE status = 'ok'
            ) AS x WHERE n <= 2
        """))).mappings().all()
    okmap = {r["source"]: dict(r) for r in ok if r["n"] == 1}
    before = {r["source"]: r["row_count"] for r in ok if r["n"] == 2}
    return {r["source"]: {**dict(r), "last_ok": okmap.get(r["source"]), "rows_before": before.get(r["source"])} for r in rows}


def _iso(v: Any) -> Any:
    return sc.serialize(v) if v is not None else None


def is_stale(name: str, data_as_of: datetime | None, now: datetime) -> bool:
    """データが古いか(bq_validate.FRESH と同じ基準。まだ取り込んでいなければ古くない = 「まだ」)"""
    fresh = bv.FRESH.get(name)
    return bool(fresh and data_as_of and now - data_as_of > fresh)


async def status() -> dict[str, Any]:
    outputs = bq.configured()
    settings = await load_settings() if outputs else parse_settings(None)
    auto = {"enabled": settings["enabled"], "envDisabled": env_disabled(), "active": auto_on(settings), "intervals": settings["intervals"], "choices": list(INTERVAL_CHOICES)}
    # 設定していない出力も、名前と環境変数の名前だけ返す(管理の画面の「未設定」。表の場所は利用先の名前を含むので返さない)
    unconfigured = [{"name": o.name, "label": o.label, "env": o.env, "dest": DEST[o.name]} for o in bq.OUTPUTS if o not in outputs]
    if not outputs:
        return {"configured": False, "outputs": [], "unconfigured": unconfigured, "auto": auto}
    last = await latest()
    now = _now()
    out = []
    for o in bq.OUTPUTS:
        if o not in outputs:
            continue
        r = last.get(o.name) or {}
        ok = r.get("last_ok") or {}
        checked = last_checked(o.name, r)
        interval = settings["intervals"].get(o.name, 60)
        out.append({
            "name": o.name, "label": o.label, "env": o.env, "dest": DEST[o.name], "status": r.get("status") or "never", "message": r.get("message") or "",
            "dataAsOf": _iso(ok.get("data_as_of")), "importedAt": _iso(ok.get("imported_at")), "rows": ok.get("row_count"),
            "rowsBefore": r.get("rows_before"),
            "triedAt": _iso(r.get("imported_at")), "sourceModified": _iso(r.get("source_modified")),
            "checkedAt": _iso(checked), "intervalMin": interval,
            "nextCheckAt": _iso(checked + timedelta(minutes=interval)) if checked and auto["active"] else None,
            "repeat": (r.get("repeat_count") or 1) if r else None, "trigger": r.get("trigger"), "actor": r.get("actor"),
            "stale": is_stale(o.name, ok.get("data_as_of"), now),
        })
    return {"configured": True, "outputs": out, "unconfigured": unconfigured, "auto": auto}


def _judge(name: str, rows: list[dict[str, Any]], prev: dict[str, Any], ctx: dict[str, Any], existing: list[dict[str, Any]], now: datetime) -> list[bv.Issue]:
    """出力 1 つの確かめ(③。bq_validate と、商品が合っているか・行数が半分を切っていないか)。取り込みと「確認だけ」で同じ"""
    issues = bv.validate(name, rows, ctx, now=now)
    if name == "spu" and (why := spu_mismatch(rows, existing)):
        issues.append(bv.Issue(bv.NG, name, why))
    before = ((prev or {}).get("last_ok") or {}).get("row_count")
    if before and before >= 10 and len(rows) < before / 2:
        issues.append(bv.Issue(bv.NG, name, f"行数が前回の半分を切りました(前回 {before} 行 → 今回 {len(rows)} 行)。元のデータの不具合を疑って、取り込みを止めました"))
    return issues


def _ctx_for(name: str, context: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    return {"spu": context["spu"]} if name in ("sku", "weekly") else {"sku": context["sku"]} if name == "sku_stock" else {}


async def _existing_products() -> list[dict[str, Any]]:
    async with db() as conn:
        return [dict(r) for r in (await conn.execute(text("SELECT product_code FROM products"))).mappings().all()]


def _pick(only: list[str] | None) -> list[bq.Output]:
    outputs = [o for o in bq.OUTPUTS if o in bq.configured()]
    return [o for o in outputs if o.name in only] if only else outputs


async def sync(force: bool = False, only: list[str] | None = None, trigger: str = "open", actor: str | None = None) -> dict[str, Any]:
    """変わった出力を取り込む。返すのは、取り込んだ出力・取り込まなかった出力と理由・いまの状態。
    only で出力を絞る(定期の取り込みは、間隔がたった出力だけ)。trigger・actor は記録に残す"""
    global _last_check
    if not bq.configured():
        return {"configured": False, "imported": [], "failed": [], "outputs": []}
    async with _lock:
        if trigger == "open":
            # 自動が「入」なら、開いたときは読まない(定期の取り込みが読む。二重に読まないため)
            if auto_on(await load_settings()):
                return {"configured": True, "imported": [], "failed": [], "skipped": "auto", **(await status())}
            if not force and time.monotonic() - _last_check < MIN_INTERVAL_S:
                return {"configured": True, "imported": [], "failed": [], "skipped": "recent", **(await status())}
            _last_check = time.monotonic()
        now = _now()
        outputs = _pick(only)
        source = await asyncio.to_thread(datasource.open)
        prev = await latest()

        # ① ② 変わった出力だけ読む
        modified: dict[str, datetime | None] = {}
        rows: dict[str, list[dict[str, Any]]] = {}
        failed: list[dict[str, str]] = []
        for o in outputs:
            try:
                modified[o.name] = await asyncio.to_thread(_modified, o, source)
                _checked[o.name] = now
                if force or changed(prev.get(o.name), modified[o.name], now):
                    rows[o.name] = await asyncio.to_thread(bv.fetch, o, source)
            except Exception as e:  # noqa: BLE001 — 見つからない・権限がない など。ほかの出力は続ける
                log.warning("BigQuery の %s を読めません: %s", o.name, e)
                failed.append({"name": o.name, "message": f"BigQuery を読めません({type(e).__name__}: {e})"})
                modified.setdefault(o.name, None)
        if not rows and not failed:
            return {"configured": True, "imported": [], "failed": [], **(await status())}

        # ③ 確かめる(SKU は SPU に、在庫は SKU に結びつくか。取り込まない側は、いまの DB の行と比べる)
        async with db() as conn:
            context = {n: rows[n] if n in rows else await _db_context(conn, n) for n in ("spu", "sku")}
        existing = await _existing_products() if "spu" in rows else []
        good: dict[str, list[dict[str, Any]]] = {}
        notes: dict[str, str] = {}
        for name in ORDER:
            if name not in rows:
                continue
            issues = _judge(name, rows[name], prev.get(name) or {}, _ctx_for(name, context), existing, now)
            if bv.has_ng(issues):
                failed.append({"name": name, "message": " / ".join(i.text() for i in issues if i.level == bv.NG)})
                if name in ("spu", "sku"):
                    # 取り込まない版で、次の確かめをしない(DB に残る前の版と比べる)
                    async with db() as conn:
                        context[name] = await _db_context(conn, name)
            else:
                good[name] = rows[name]
                notes[name] = " / ".join(i.text() for i in issues)

        # ④ 1 つのトランザクションで入れ替える
        imported: list[dict[str, Any]] = []
        who = (actor or "")[:100] or None
        async with db(write=True) as conn:
            got = (await conn.execute(text("SELECT pg_try_advisory_xact_lock(:k)"), {"k": LOCK_KEY})).scalar_one()
            # ほかで取り込み中なら、書かずに抜ける(状態は、この接続を返してから読む。接続を 2 本同時に持たない)
            if got:
                for name in ORDER:
                    if name in good:
                        summary = await _write(conn, name, good[name])
                        imported.append({"name": name, "rows": len(good[name]), "summary": summary})
                if "sku" in good or "sku_stock" in good:
                    await _sum_stock(conn)
                base = {"trigger": trigger, "actor": who, "checked_at": now, "repeat_count": 1, "imported_at": now}
                records = []
                for name in ORDER:
                    if name in good:
                        stamp = "issued_at" if name == "forecast" else "as_of"
                        times = [t for t in (bv.as_ts(r.get(stamp)) for r in good[name]) if t]
                        records.append({**base, "source": name, "status": "ok", "source_modified": modified.get(name), "data_as_of": max(times) if times else None,
                                        "row_count": len(good[name]), "message": notes.get(name) or None})
                repeats = []
                for f in failed:
                    message = f["message"][:2000]
                    p = prev.get(f["name"]) or {}
                    # 同じ理由の失敗が続くときは、記録を足さずに、前の記録の「最後に確かめた日時」と「回数」を進める(定期の取り込みで、記録が同じ行で埋まらないように)
                    if p.get("status") == "error" and p.get("message") == message and p.get("id"):
                        repeats.append({"id": p["id"], "checked_at": now, "repeat_count": int(p.get("repeat_count") or 1) + 1, "trigger": trigger, "actor": who})
                        continue
                    records.append({**base, "source": f["name"], "status": "error", "source_modified": modified.get(f["name"]), "data_as_of": None,
                                    "row_count": len(rows.get(f["name"], [])), "message": message})
                if records:
                    await conn.execute(text("""
                        INSERT INTO bq_imports (source, status, source_modified, data_as_of, row_count, message, imported_at, trigger, actor, checked_at, repeat_count)
                        VALUES (:source, :status, :source_modified, :data_as_of, :row_count, :message, :imported_at, :trigger, :actor, :checked_at, :repeat_count)
                    """), records)
                for r in repeats:
                    await conn.execute(text("UPDATE bq_imports SET checked_at = :checked_at, repeat_count = :repeat_count, trigger = :trigger, actor = :actor WHERE id = :id"), r)
                # 記録は、出力ごとに直近 50 件だけ残す(画面を開くたびに増えるため)
                await conn.execute(text("""
                    DELETE FROM bq_imports WHERE id IN (
                      SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY source ORDER BY imported_at DESC) AS n FROM bq_imports) AS x WHERE n > 50
                    )
                """))
        if not got:
            return {"configured": True, "imported": [], "failed": [], "skipped": "busy", **(await status())}
        if imported or failed:
            log.info("BigQuery の取り込み(%s): 取り込んだ %s / 止めた %s", trigger, [i["name"] for i in imported], [f["name"] for f in failed])
        return {"configured": True, "imported": imported, "failed": failed, **(await status())}


async def check(only: list[str] | None = None) -> dict[str, Any]:
    """確かめだけ(読んで ③ まで。書かない。ccp.cli bq-check と同じ確かめ)。出力ごとに、NG・注意の一覧と、行数・データの時点"""
    if not bq.configured():
        return {"configured": False, "outputs": []}
    now = _now()
    outputs = _pick(only)
    source = await asyncio.to_thread(datasource.open)
    prev = await latest()
    rows: dict[str, list[dict[str, Any]]] = {}
    result: dict[str, dict[str, Any]] = {}
    kinds: dict[str, str] = {}
    for o in outputs:
        # 表かビューか(ビューのときだけ、更新の合図に見る元の表が要る。画面で「要りません」と言えるように)
        try:
            if kind := getattr(source, "kind", None):
                kinds[o.name] = await asyncio.to_thread(kind, bq.location(o))
        except Exception:  # noqa: BLE001 — 読めないなら、下の読み込みが理由を出す
            pass
        try:
            rows[o.name] = await asyncio.to_thread(bv.fetch, o, source)
        except Exception as e:  # noqa: BLE001
            result[o.name] = {"name": o.name, "label": o.label, "ok": False, "rows": None, "dataAsOf": None,
                              "issues": [{"level": bv.NG, "text": f"BigQuery を読めません({type(e).__name__}: {e})"}]}
    async with db() as conn:
        context = {n: rows[n] if n in rows else await _db_context(conn, n) for n in ("spu", "sku")}
    existing = await _existing_products() if "spu" in rows else []
    for name in ORDER:
        if name not in rows:
            continue
        issues = _judge(name, rows[name], prev.get(name) or {}, _ctx_for(name, context), existing, now)
        stamp = "issued_at" if name == "forecast" else "as_of"
        times = [t for t in (bv.as_ts(r.get(stamp)) for r in rows[name]) if t]
        result[name] = {"name": name, "label": next(o.label for o in bq.OUTPUTS if o.name == name), "ok": not bv.has_ng(issues), "rows": len(rows[name]), "kind": kinds.get(name, ""),
                        "dataAsOf": _iso(max(times)) if times else None, "issues": [{"level": i.level, "text": i.text()} for i in issues]}
    return {"configured": True, "checkedAt": _iso(now), "outputs": [result[o.name] for o in outputs if o.name in result]}


async def history(source: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
    """取り込みの記録(新しい順)。表の場所を変えた記録(app_settings のまとめ bq)も、その出力の記録にまぜる(status = settings)"""
    limit = max(1, min(int(limit), 300))
    where = "WHERE source = :source " if source else ""
    async with db() as conn:
        rows = (await conn.execute(text(
            f"SELECT source, status, source_modified, data_as_of, row_count, message, imported_at, checked_at, repeat_count, trigger, actor FROM bq_imports {where}ORDER BY imported_at DESC LIMIT {limit}"
        ), {"source": source} if source else {})).mappings().all()
    out = [{"source": r["source"], "status": r["status"], "sourceModified": _iso(r["source_modified"]), "dataAsOf": _iso(r["data_as_of"]),
             "rows": r["row_count"], "message": r["message"] or "", "importedAt": _iso(r["imported_at"]), "checkedAt": _iso(r["checked_at"]),
             "repeat": r["repeat_count"] or 1, "trigger": r["trigger"], "actor": r["actor"]} for r in rows] + await _settings_changes(source, limit)
    out.sort(key=lambda r: r["importedAt"] or "", reverse=True)
    return out[:limit]


async def _settings_changes(source: str | None, limit: int) -> list[dict[str, Any]]:
    """表の場所を変えた・環境変数から写した記録を、取り込みの記録の形に"""
    out = []
    for h in await appsettings.history("bq", limit):
        names = sorted({k.removesuffix("_watch") for k in h["changes"] if k != "project"})
        for name in names:
            if source and name != source:
                continue
            what = "環境変数から、表の場所を写しました" if h["source"] == "env" else "表の場所を変えました"
            out.append({"source": name, "status": "settings", "sourceModified": None, "dataAsOf": None, "rows": None, "message": what,
                        "importedAt": h["at"], "checkedAt": None, "repeat": 1, "trigger": "settings", "actor": h["by"]})
    return out


# ---- 定期の取り込み


async def tick(trigger: str = "auto") -> list[str] | None:
    """1 回分の定期の取り込み。間隔がたった出力を確かめ、変わっていれば取り込む。確かめた出力の名前を返す(何もしなければ空)。
    まだ動き出せない(設定をまだ読んでいない)ときは None(起動のときの 1 回を、次の回に回す)。
    自動が「切」のあいだは DB を読まない(このプロセスが覚えた設定だけを見る。画面で変えたら、保存と一緒に覚え直す)。
    使われないあいだ DB が止まる環境でも、見回りが DB を起こし続けないように(BQ_AUTO_SYNC=0 に頼らずに済むように)"""
    if env_disabled():
        return []
    if not appsettings.loaded():
        # DB の起動を受け持つ仕組みがない環境(DB は止まらない)は、自分で読む。
        # 止まる DB の環境は、画面・窓口が読むのを待つ(人が使い始めれば、DB は起きている)
        if dbready.controller() is not None:
            return None
        await appsettings.ensure()
        if not appsettings.loaded():
            return None
    if not parse_settings(appsettings.raw(SETTINGS_NAME))["enabled"]:
        return []
    # 入のあいだは、表の場所・間隔を、覚えた時間(TTL)ごとに読み直す
    await appsettings.ensure()
    settings = parse_settings(appsettings.raw(SETTINGS_NAME))
    if not settings["enabled"] or not bq.configured():
        return []
    if _lock.locked():
        return []  # 取り込み中(ボタン・開いたとき)なら、この回は飛ばす
    names = [o.name for o in _pick(None)]
    targets = names if trigger == "startup" else due(names, settings, await latest(), _now())
    if not targets:
        return targets
    # 書き込みは LOCK_KEY で 1 台に絞れるが、読むのは絞れない。同じ時刻に見回った別のサーバーが同じ出力を読まないように、
    # 取り込みが終わるまで番を持つ(トランザクションの錠なので、サーバーが落ちても残らない)。取れなければ、この回は飛ばす
    async with db() as conn:
        if not (await conn.execute(text("SELECT pg_try_advisory_xact_lock(:k)"), {"k": TICK_LOCK_KEY})).scalar_one():
            return []
        await sync(False, targets, trigger)
    return targets


async def run_scheduler() -> None:
    """サーバーが動いている間、回し続ける。動き出したらすぐ 1 回(止めていた間に古くなったデータで動かないように)、そのあとは TICK_S ごと"""
    first = True
    while True:
        try:
            got = await tick("startup" if first else "auto")
            first = first and got is None
        except dbready.DbNotReady:
            pass  # DB の起動中。次の回に確かめる(起動のときの 1 回も、次の回に回す)
        except Exception:  # noqa: BLE001 — 認証が取れない など。止めずに、次の回も確かめる(記録は sync が残す)
            log.exception("BigQuery の定期の取り込みに失敗しました")
            first = False
        await asyncio.sleep(TICK_S)


# ---- 入口


def _only(v: str | None) -> list[str] | None:
    names = [x.strip() for x in (v or "").split(",") if x.strip()]
    return names or None


async def _admin(request: Request) -> str | None:
    async with db() as conn:
        return await admin_denied(conn, request)


def _denied(why: str) -> dict[str, Any]:
    return {"success": False, "error": {"message": why, "code": "forbidden"}}


def _actor_name(request: Request) -> str:
    return unquote(request.headers.get("x-ccp-actor", "")).strip()[:100]


def _bq_error(e: Exception, what: str) -> dict[str, Any]:
    if isinstance(e, ImportError):
        return {"success": False, "error": {"message": "パッケージ google-cloud-bigquery がありません(server/requirements.txt)"}}
    log.exception("BigQuery の%sに失敗しました", what)
    return {"success": False, "error": {"message": f"BigQuery から{what}できませんでした({type(e).__name__}: {e})"}}


@router.get("/status")
async def get_status() -> dict[str, Any]:
    await appsettings.ensure()
    return {"success": True, "data": await status()}


@router.post("/sync")
async def post_sync(request: Request, force: bool = False, only: str | None = None, trigger: str | None = None) -> dict[str, Any]:
    # 出力を絞った取り込みは、管理する人だけ。力ずく(force)は、管理する人でなければ、変わった出力だけの取り込みにする
    # (⚙ の「今すぐ取り込む」は、だれでも押せる。管理の画面がない人も、いまどおり使えるように)
    await appsettings.ensure()
    t = trigger if trigger in ("open", "manual") else ("manual" if force else "open")
    if force or only:
        why = await _admin(request)
        if why and only:
            return _denied(why)
        if why:
            force = False
    try:
        return {"success": True, "data": await sync(force, _only(only), t, _actor_name(request) or None)}
    except dbready.DbNotReady:
        raise  # DB の起動中は、ほかの API と同じ「準備中」で返す(register_errors)
    except Exception as e:  # noqa: BLE001 — 認証が取れない など。画面に理由を出す(取り込みに失敗しても、画面は使える)
        return _bq_error(e, "取り込み")


@router.post("/check")
async def post_check(request: Request, only: str | None = None) -> dict[str, Any]:
    if (why := await _admin(request)):
        return _denied(why)
    await appsettings.ensure()
    try:
        return {"success": True, "data": await check(_only(only))}
    except dbready.DbNotReady:
        raise
    except Exception as e:  # noqa: BLE001
        return _bq_error(e, "確認")


@router.get("/history")
async def get_history(request: Request, source: str | None = None, limit: int = 50) -> dict[str, Any]:
    if (why := await _admin(request)):
        return _denied(why)
    return {"success": True, "data": await history(source, limit)}


@router.get("/settings")
async def get_settings() -> dict[str, Any]:
    s = await load_settings()
    return {"success": True, "data": {**s, "envDisabled": env_disabled(), "choices": list(INTERVAL_CHOICES)}}


@router.put("/settings")
async def put_settings(request: Request) -> dict[str, Any]:
    if (why := await _admin(request)):
        return _denied(why)
    body = await request.json()
    s = await save_settings(body if isinstance(body, dict) else {}, _actor_name(request))
    return {"success": True, "data": {**s, "envDisabled": env_disabled(), "choices": list(INTERVAL_CHOICES)}}
