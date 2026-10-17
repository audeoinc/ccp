"""BigQuery からの取り込み(バックログ B2・B4。設計は docs/BIGQUERY.md の 5 章と 11 章)。

  POST /api/bq/sync          画面を開いたとき(force なし)と、⚙ の「BigQuery から取り込む」(force=true)
  GET  /api/bq/status        出力ごとの、最後の取り込みの記録(画面の「◯時点」)

流れ:
  ① 出力ごとに、最終更新の日時を見る(ビューなら BQ_<名前>_WATCH の表。メタデータだけなので、無料・一瞬)
  ② 前回の取り込みから変わった出力だけ、行を読む(force なら、すべて)
  ③ 値を確かめる(bq_validate。ccp.cli bq-check と同じ確かめ)。行数が前回の半分を切ったときも止める
  ④ NG がない出力だけを、1 つのトランザクションで入れ替える(途中の状態を、画面や AI に見せない)
     NG の出力は、前のデータのまま残し、理由を bq_imports に記録する(画面に出す)

Cloud Run は、決まった間隔で動き続けるサーバーではないので、定期的には取り込まない(画面を開いたとき + ボタン。11 章)。
DB が止まっているとき(dbctl)は、require_db が「準備中」を返す。画面は、データを読めてから取り込みを依頼する。
"""
from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from . import bq, bq_validate as bv, dbctl, schema as sc
from .data_api import db, require_db

log = logging.getLogger("ccp.bq")
router = APIRouter(prefix="/api/bq", dependencies=[Depends(require_db)])

# 画面を開くたびに BigQuery を見に行かないよう、force でない確認は、この間隔をあける(プロセスごと)
MIN_INTERVAL_S = 60
# 更新を見る表がないビューは、最終更新の日時で変化が分からないので、この間隔で読み直す
VIEW_REFRESH = timedelta(minutes=10)
# 取り込みを、複数のプロセス(Cloud Run の複数の台)で同時に行わない(PostgreSQL の勧告ロックの番号。CCP の中で一意なら何でもよい)
LOCK_KEY = 4210017
# 出力 → 書き込む表(取り込む順。SKU の確かめに SPU が、在庫の確かめに SKU が要る)
ORDER = ("spu", "sku", "sku_stock", "weekly", "forecast")

_lock = asyncio.Lock()
_last_check = 0.0


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _modified(o: bq.Output, client: Any) -> datetime | None:
    """出力の最終更新の日時。ビューは、更新を見る元の表の日時(なければ None = 分からない)"""
    t = client.get_table(bq.location(o))
    if (getattr(t, "table_type", "") or "") == "TABLE":
        return getattr(t, "modified", None)
    w = bq.watch_location(o)
    return getattr(client.get_table(w), "modified", None) if w else None


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


def _values(table: str, row: dict[str, Any], cols: list[str]) -> dict[str, Any]:
    t = sc.load().table(table)
    return {c: sc.coerce(t.by_name[c].type, row.get(c)) for c in cols}


SPU_COLS = ["name", "product_code", "market", "category", "category_path", "season", "price", "description", "sales_trend", "rating",
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
        pid = by_key.get((r["market"], r["product_code"])) or by_code.get(r["product_code"])
        (updates if pid else inserts).append({**v, "id": pid} if pid else v)
    cols = SPU_COLS + ["weather"]
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
    missing = len(have - coming)
    if missing * 2 > len(have):
        return f"BigQuery の SPU に、いまの商品 {len(have)} 点のうち {missing} 点がありません(出力が、この環境の商品と合っていません)。取り込みを止めました"
    return None


async def _replace(conn: AsyncConnection, table: str, rows: list[dict[str, Any]], cols: list[str], extra: Any = None, scope: str | None = None) -> str:
    """表を入れ替える。scope を渡すと、取り込む行にあるその列の値(商品コードなど)の行だけを消して入れ替える(ほかの行は残す)。
    2026-10-17 に、本番にない商品のダミーを取り込んで、本番の週ごとの実績を全部消してしまった。BigQuery にない商品の行は、消さない"""
    if scope:
        keys = sorted({str(r[scope]) for r in rows if r.get(scope) is not None})
        await conn.execute(text(f"DELETE FROM {table} WHERE {scope} = ANY(:keys)"), {"keys": keys})
    else:
        await conn.execute(text(f"DELETE FROM {table}"))
    values = [{**_values(table, r, cols), **(extra(r) if extra else {})} for r in rows]
    if values:
        names = list(values[0])
        await conn.execute(text(f"INSERT INTO {table} ({', '.join(names)}) VALUES ({', '.join(':' + c for c in names)})"), values)
    return f"{len(values)} 行"


async def _write(conn: AsyncConnection, name: str, rows: list[dict[str, Any]]) -> str:
    if name == "spu":
        return await _write_spu(conn, rows)
    if name == "sku":
        return await _replace(conn, "sku", rows, ["market", "sku_code", "product_code", "color", "size", "length", "price", "units_4w", "as_of"])
    if name == "sku_stock":
        return await _replace(conn, "sku_stock", rows, ["market", "sku_code", "stock", "as_of"])
    if name == "weekly":
        # name は、いまの画面・初期データと同じ「商品コード 週の始まり」
        return await _replace(conn, "weekly_performances", rows, ["market", "product_code", "week_start", "units", "revenue", "stock"],
                              lambda r: {"name": f"{r['product_code']} {str(r['week_start'])[:10]}"}, scope="product_code")
    return await _replace(conn, "weather_forecast", rows, ["market", "date", "temp_max", "temp_min", "precip_prob", "weather", "issued_at"])


async def _sum_stock(conn: AsyncConnection) -> None:
    """SPU の在庫(products.stock)を、SKU の在庫の合計にする。在庫の行がない SKU は 0(BIGQUERY_EXPORT.md の 4 章)。
    SKU と在庫を入れ替えたのと同じトランザクションで書くので、SPU と SKU の在庫が食い違わない"""
    await conn.execute(text("""
        UPDATE products AS p SET stock = s.total, modified_on = now()
        FROM (
          SELECT k.market, k.product_code, SUM(COALESCE(st.stock, 0)) AS total
          FROM sku AS k LEFT JOIN sku_stock AS st ON st.market = k.market AND st.sku_code = k.sku_code
          GROUP BY k.market, k.product_code
        ) AS s
        WHERE p.product_code = s.product_code AND (p.market = s.market OR p.market IS NULL) AND p.stock IS DISTINCT FROM s.total
    """))
    # BigQuery から取り込んだ SPU で、SKU が 1 つもないものは、在庫 0
    await conn.execute(text("""
        UPDATE products AS p SET stock = 0, modified_on = now()
        WHERE p.as_of IS NOT NULL AND COALESCE(p.stock, 0) <> 0
          AND NOT EXISTS (SELECT 1 FROM sku AS k WHERE k.product_code = p.product_code AND (k.market = p.market OR p.market IS NULL))
    """))


async def _db_context(conn: AsyncConnection, name: str) -> list[dict[str, Any]]:
    """取り込まない側の、いまの DB の行(SKU を確かめるときの SPU など)"""
    if name == "spu":
        sql = "SELECT market, product_code FROM products WHERE as_of IS NOT NULL"
    else:
        sql = "SELECT market, sku_code FROM sku"
    return [dict(r) for r in (await conn.execute(text(sql))).mappings().all()]


async def latest() -> dict[str, dict[str, Any]]:
    """出力ごとの、最後の取り込みの記録(成否を問わない)と、最後に成功した記録"""
    async with db() as conn:
        rows = (await conn.execute(text("""
            SELECT DISTINCT ON (source) source, status, source_modified, data_as_of, row_count, message, imported_at
            FROM bq_imports ORDER BY source, imported_at DESC
        """))).mappings().all()
        ok = (await conn.execute(text("""
            SELECT DISTINCT ON (source) source, data_as_of, row_count, imported_at
            FROM bq_imports WHERE status = 'ok' ORDER BY source, imported_at DESC
        """))).mappings().all()
    okmap = {r["source"]: dict(r) for r in ok}
    return {r["source"]: {**dict(r), "last_ok": okmap.get(r["source"])} for r in rows}


def _iso(v: Any) -> Any:
    return sc.serialize(v) if v is not None else None


async def status() -> dict[str, Any]:
    outputs = bq.configured()
    if not outputs:
        return {"configured": False, "outputs": []}
    last = await latest()
    out = []
    for o in bq.OUTPUTS:
        if o not in outputs:
            continue
        r = last.get(o.name) or {}
        ok = r.get("last_ok") or {}
        out.append({
            "name": o.name, "label": o.label, "status": r.get("status") or "never", "message": r.get("message") or "",
            "dataAsOf": _iso(ok.get("data_as_of")), "importedAt": _iso(ok.get("imported_at")), "rows": ok.get("row_count"),
            "triedAt": _iso(r.get("imported_at")),
        })
    return {"configured": True, "outputs": out}


async def sync(force: bool = False) -> dict[str, Any]:
    """変わった出力を取り込む。返すのは、取り込んだ出力・取り込まなかった出力と理由・いまの状態"""
    global _last_check
    if not bq.configured():
        return {"configured": False, "imported": [], "failed": [], "outputs": []}
    async with _lock:
        if not force and time.monotonic() - _last_check < MIN_INTERVAL_S:
            return {"configured": True, "imported": [], "failed": [], "skipped": "recent", **(await status())}
        _last_check = time.monotonic()
        now = _now()
        outputs = [o for o in bq.OUTPUTS if o in bq.configured()]
        client = await asyncio.to_thread(bq.client)
        prev = await latest()

        # ① ② 変わった出力だけ読む
        modified: dict[str, datetime | None] = {}
        rows: dict[str, list[dict[str, Any]]] = {}
        failed: list[dict[str, str]] = []
        for o in outputs:
            try:
                modified[o.name] = await asyncio.to_thread(_modified, o, client)
                if force or changed(prev.get(o.name), modified[o.name], now):
                    rows[o.name] = await asyncio.to_thread(bv.fetch, o, client)
            except Exception as e:  # noqa: BLE001 — 見つからない・権限がない など。ほかの出力は続ける
                log.warning("BigQuery の %s を読めません: %s", o.name, e)
                failed.append({"name": o.name, "message": f"BigQuery を読めません({type(e).__name__}: {e})"})
                modified.setdefault(o.name, None)
        if not rows and not failed:
            return {"configured": True, "imported": [], "failed": [], **(await status())}

        # ③ 確かめる(SKU は SPU に、在庫は SKU に結びつくか。取り込まない側は、いまの DB の行と比べる)
        async with db() as conn:
            context = {n: rows[n] if n in rows else await _db_context(conn, n) for n in ("spu", "sku")}
        good: dict[str, list[dict[str, Any]]] = {}
        notes: dict[str, str] = {}
        for name in ORDER:
            if name not in rows:
                continue
            ctx = {"spu": context["spu"]} if name in ("sku", "weekly") else {"sku": context["sku"]} if name == "sku_stock" else {}
            issues = bv.validate(name, rows[name], ctx, now=now)
            if name == "spu":
                async with db() as conn:
                    existing = [dict(r) for r in (await conn.execute(text("SELECT product_code FROM products"))).mappings().all()]
                if (why := spu_mismatch(rows[name], existing)):
                    issues.append(bv.Issue(bv.NG, name, why))
            before = ((prev.get(name) or {}).get("last_ok") or {}).get("row_count")
            if before and before >= 10 and len(rows[name]) < before / 2:
                issues.append(bv.Issue(bv.NG, name, f"行数が前回の半分を切りました(前回 {before} 行 → 今回 {len(rows[name])} 行)。元のデータの不具合を疑って、取り込みを止めました"))
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
        async with db(write=True) as conn:
            got = (await conn.execute(text("SELECT pg_try_advisory_xact_lock(:k)"), {"k": LOCK_KEY})).scalar_one()
            if not got:
                return {"configured": True, "imported": [], "failed": [], "skipped": "busy", **(await status())}
            for name in ORDER:
                if name in good:
                    summary = await _write(conn, name, good[name])
                    imported.append({"name": name, "rows": len(good[name]), "summary": summary})
            if "sku" in good or "sku_stock" in good:
                await _sum_stock(conn)
            records = []
            for name in ORDER:
                if name in good:
                    stamp = "issued_at" if name == "forecast" else "as_of"
                    times = [t for t in (bv.as_ts(r.get(stamp)) for r in good[name]) if t]
                    records.append({"source": name, "status": "ok", "source_modified": modified.get(name), "data_as_of": max(times) if times else None,
                                    "row_count": len(good[name]), "message": notes.get(name) or None, "imported_at": now})
            for f in failed:
                records.append({"source": f["name"], "status": "error", "source_modified": modified.get(f["name"]), "data_as_of": None,
                                "row_count": len(rows.get(f["name"], [])), "message": f["message"][:2000], "imported_at": now})
            if records:
                await conn.execute(text("""
                    INSERT INTO bq_imports (source, status, source_modified, data_as_of, row_count, message, imported_at)
                    VALUES (:source, :status, :source_modified, :data_as_of, :row_count, :message, :imported_at)
                """), records)
            # 記録は、出力ごとに直近 50 件だけ残す(画面を開くたびに増えるため)
            await conn.execute(text("""
                DELETE FROM bq_imports WHERE id IN (
                  SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY source ORDER BY imported_at DESC) AS n FROM bq_imports) AS x WHERE n > 50
                )
            """))
        if imported or failed:
            log.info("BigQuery の取り込み: 取り込んだ %s / 止めた %s", [i["name"] for i in imported], [f["name"] for f in failed])
        return {"configured": True, "imported": imported, "failed": failed, **(await status())}


@router.get("/status")
async def get_status() -> dict[str, Any]:
    return {"success": True, "data": await status()}


@router.post("/sync")
async def post_sync(force: bool = False) -> dict[str, Any]:
    try:
        return {"success": True, "data": await sync(force)}
    except dbctl.DbNotReady:
        raise  # DB の起動中は、ほかの API と同じ「準備中」で返す(register_errors)
    except ImportError:
        return {"success": False, "error": {"message": "パッケージ google-cloud-bigquery がありません(server/requirements.txt)"}}
    except Exception as e:  # noqa: BLE001 — 認証が取れない など。画面に理由を出す(取り込みに失敗しても、画面は使える)
        log.exception("BigQuery の取り込みに失敗しました")
        return {"success": False, "error": {"message": f"BigQuery から取り込めませんでした({type(e).__name__}: {e})"}}
