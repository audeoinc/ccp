"""BigQuery を見る(メタデータ・先頭の行)・SQL を試す・流す・止める・列の中身を調べる"""
from __future__ import annotations

import asyncio
import re
import time
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from .. import bq
from .common import (MAX_ROWS, PREVIEW_ROWS, cost_usd, dry_run, error_result, flatten_fields, max_bytes, only_select, plain,
                     price_per_tib, schema_columns, weight)
from .store import record_run

router = APIRouter()


class SqlIn(BaseModel):
    sql: str = Field(min_length=1, max_length=200_000)
    max_rows: int = Field(200, ge=1, le=MAX_ROWS)
    # 画面が付ける、この実行の印(「止める」で、どのジョブを止めるかを知るため)
    run_id: str = Field("", max_length=64, pattern=r"^[A-Za-z0-9_-]*$")


# 流している途中のジョブ(画面の run_id → (ジョブ ID, 場所))。「止める」で BigQuery のジョブそのものを止める
_running: dict[str, tuple[str, str | None]] = {}


# ---- BigQuery を見る(メタデータ・先頭の行。どれも料金なし)

@router.get("/bq/datasets")
async def datasets(project: str | None = None) -> dict[str, Any]:
    def go() -> dict[str, Any]:
        c = bq.client()
        p = project or c.project
        return {"ok": True, "project": p, "datasets": sorted(d.dataset_id for d in c.list_datasets(project=p))}

    try:
        return await asyncio.to_thread(go)
    except Exception as e:  # noqa: BLE001
        return error_result(e)


@router.get("/bq/tables")
async def tables(dataset: str) -> dict[str, Any]:
    def go() -> dict[str, Any]:
        c = bq.client()
        rows = []
        for t in c.list_tables(dataset.strip().strip("`")):
            rows.append({"id": t.table_id, "ref": f"{t.project}.{t.dataset_id}.{t.table_id}", "type": t.table_type})
        return {"ok": True, "tables": sorted(rows, key=lambda r: r["id"])}

    try:
        return await asyncio.to_thread(go)
    except Exception as e:  # noqa: BLE001
        return error_result(e)


def _sources_or_empty(t: Any) -> list[str]:
    """ビューなら参照している元の表(画面の「参照している元の表」)。分からなくても、表の説明は返す"""
    if not t.view_query:
        return []
    try:
        return view_sources(bq.client(), f"{t.project}.{t.dataset_id}.{t.table_id}")
    except Exception:  # noqa: BLE001
        return []


@router.get("/bq/table")
async def table(ref: str) -> dict[str, Any]:
    def go() -> dict[str, Any]:
        t = bq.client().get_table(ref.strip().strip("`"))
        part = t.time_partitioning
        return {
            "ok": True,
            "ref": f"{t.project}.{t.dataset_id}.{t.table_id}",
            "type": t.table_type,
            "description": t.description or "",
            "rows": t.num_rows,
            "bytes": t.num_bytes,
            "modified": plain(t.modified),
            "location": t.location,
            "partitioning": ({"type": part.type_, "field": part.field or "_PARTITIONTIME"} if part else None),
            "clustering": list(t.clustering_fields or []),
            "view_sql": t.view_query or "",
            "sources": _sources_or_empty(t),
            "columns": flatten_fields(t.schema),
        }

    try:
        return await asyncio.to_thread(go)
    except Exception as e:  # noqa: BLE001
        return error_result(e)


@router.get("/bq/preview")
async def preview(ref: str) -> dict[str, Any]:
    def go() -> dict[str, Any]:
        c = bq.client()
        t = c.get_table(ref.strip().strip("`"))
        if t.table_type != "TABLE":
            # ビューは list_rows で読めない。先頭の行は、SQL の試しで見る
            return {"ok": False, "error": f"{t.table_type} は先頭の行を読めません(SQL の試しで SELECT * … LIMIT 20 を流してください)"}
        it = c.list_rows(t, max_results=PREVIEW_ROWS)
        rows = [plain(dict(r.items())) for r in it]
        return {"ok": True, "columns": schema_columns(t.schema), "rows": rows}

    try:
        return await asyncio.to_thread(go)
    except Exception as e:  # noqa: BLE001
        return error_result(e)


# SQL の中の `プロジェクト.データセット.表` の形(参照したビューを見つけるため)
TABLE_REF = re.compile(r"`?([A-Za-z0-9_-]+\.[A-Za-z0-9_]+\.[A-Za-z0-9_$*]+)`?")


def referenced(c: Any, sql: str, job: Any) -> dict[str, list[str]]:
    """参照した表とビュー。BigQuery のジョブの記録には、ビューの中身(元の表)しか残らないので、
    SQL に書いた名前のうち、元の表に出てこないものを調べて、ビューを見つける"""
    tables = [f"{t.project}.{t.dataset_id}.{t.table_id}" for t in (job.referenced_tables or [])]
    views: list[str] = []
    for name in dict.fromkeys(TABLE_REF.findall(sql)):
        if name in tables or "*" in name:
            continue
        try:
            t = c.get_table(name)
        except Exception:  # noqa: BLE001 — 列の名前などが、たまたま同じ形だっただけ
            continue
        if t.table_type in ("VIEW", "MATERIALIZED_VIEW"):
            views.append(f"{t.project}.{t.dataset_id}.{t.table_id}")
    return {"tables": list(dict.fromkeys(tables)), "views": views}


def job_info(c: Any, sql: str, job: Any) -> dict[str, Any]:
    """ジョブの実行情報(重いのか・高いのか・どこを読んだのか)。画面の結果の下に出す"""
    elapsed = (job.ended - job.started).total_seconds() if job.started and job.ended else None
    try:
        refs = referenced(c, sql, job)
    except Exception:  # noqa: BLE001
        refs = {"tables": [], "views": []}
    return {
        "job_id": job.job_id,
        "location": job.location,
        "processed": job.total_bytes_processed,
        "billed": job.total_bytes_billed,
        "cost_usd": cost_usd(job.total_bytes_billed),
        "price_per_tib": price_per_tib(),
        "slot_ms": job.slot_millis,
        "elapsed": elapsed,
        "cached": bool(job.cache_hit),
        "weight": weight(job.total_bytes_processed, job.slot_millis),
        **refs,
    }


@router.post("/bq/dryrun")
async def dryrun(body: SqlIn) -> dict[str, Any]:
    def go() -> dict[str, Any]:
        c = bq.client()
        job = dry_run(c, body.sql)
        st = job.statement_type
        try:
            refs = referenced(c, body.sql, job)
        except Exception:  # noqa: BLE001
            refs = {"tables": [], "views": []}
        return {"ok": True, "statement_type": st, "bytes": job.total_bytes_processed, "columns": schema_columns(job.schema),
                "runnable": only_select(st) is None, "reason": only_select(st), "max_bytes": max_bytes(),
                # 流したときの概算(課金は最小 10 MB から。キャッシュに当たれば 0)
                "cost_usd": cost_usd(max(job.total_bytes_processed or 0, 10 * 1024**2)), "price_per_tib": price_per_tib(),
                "weight": weight(job.total_bytes_processed, None), **refs}

    try:
        return await asyncio.to_thread(go)
    except Exception as e:  # noqa: BLE001
        return error_result(e)


@router.post("/bq/run")
async def run(body: SqlIn) -> dict[str, Any]:
    def go() -> dict[str, Any]:
        from google.cloud import bigquery

        c = bq.client()
        dry = dry_run(c, body.sql)
        if (why := only_select(dry.statement_type)) is not None:
            return {"ok": False, "error": why}
        t0 = time.monotonic()
        job = c.query(body.sql, job_config=bigquery.QueryJobConfig(maximum_bytes_billed=max_bytes()))
        if body.run_id:
            _running[body.run_id] = (job.job_id, job.location)
        try:
            it = job.result(max_results=body.max_rows)
        finally:
            _running.pop(body.run_id, None)
        rows = [plain(dict(r.items())) for r in it]
        out = {
            "ok": True,
            "columns": schema_columns(it.schema),
            "rows": rows,
            "total_rows": it.total_rows,
            "bytes": job.total_bytes_processed,
            "billed": job.total_bytes_billed,
            "seconds": round(time.monotonic() - t0, 2),
            "cached": bool(job.cache_hit),
            "job": job_info(c, body.sql, job),
        }
        record_run("画面", body.sql, rows=it.total_rows, processed=job.total_bytes_processed, billed=job.total_bytes_billed, seconds=out["seconds"])
        return out

    try:
        r = await asyncio.to_thread(go)
        if not r.get("ok"):
            record_run("画面", body.sql, error=r.get("error", ""))
        return r
    except Exception as e:  # noqa: BLE001
        err = error_result(e)
        record_run("画面", body.sql, error=err["error"])
        return err


class CancelIn(BaseModel):
    run_id: str = Field(min_length=1, max_length=64)


@router.post("/bq/cancel")
async def cancel(body: CancelIn) -> dict[str, Any]:
    """流している途中の SELECT を止める(BigQuery のジョブを取り消す。止まるまでに読んだ分は、課金されることがある)"""
    got = _running.get(body.run_id)
    if not got:
        return {"ok": True, "cancelled": False, "note": "もう終わっています"}

    def go() -> dict[str, Any]:
        bq.client().cancel_job(got[0], location=got[1])
        return {"ok": True, "cancelled": True, "job_id": got[0]}

    try:
        return await asyncio.to_thread(go)
    except Exception as e:  # noqa: BLE001
        return error_result(e)


@router.get("/bq/projects")
async def projects() -> dict[str, Any]:
    """このアカウントが見られるプロジェクト(データセットを、プロジェクトの名前の一部でも探せるように)"""
    def go() -> dict[str, Any]:
        c = bq.client()
        ids = sorted({p.project_id for p in c.list_projects(max_results=500)} | ({c.project} if c.project else set()))
        return {"ok": True, "default": c.project, "projects": ids}

    try:
        return await asyncio.to_thread(go)
    except Exception as e:  # noqa: BLE001
        return error_result(e)


def view_sources(c: Any, ref: str) -> list[str]:
    """ビューが参照している元の表(料金なしの dry-run で BigQuery に聞く。ビューの中のビューも、元の表までたどった結果が返る)"""
    job = dry_run(c, f"SELECT * FROM `{ref}`")
    me = ref.replace(":", ".")
    out = []
    for t in job.referenced_tables or []:
        name = f"{t.project}.{t.dataset_id}.{t.table_id}"
        if name != me and name not in out:
            out.append(name)
    return out


# ---- 列の中身を調べる(CCP の列に当てる前に、値の形を見る)

PROFILE_TOP = 20
# これより多く読むときは、利用者に確かめてから流す
PROFILE_CONFIRM_BYTES = 1024**3
# 最小・最大を出せる型(並べられる型)
ORDERABLE = {"STRING", "INTEGER", "INT64", "FLOAT", "FLOAT64", "NUMERIC", "BIGNUMERIC", "DATE", "DATETIME", "TIME", "TIMESTAMP", "BOOLEAN", "BOOL"}


def _column_field(t: Any, column: str) -> Any:
    """列の定義(入れ子は a.b の形で探す)"""
    fields = t.schema or []
    found = None
    for part in column.split("."):
        found = next((f for f in fields if f.name.lower() == part.lower()), None)
        if found is None:
            return None
        fields = getattr(found, "fields", None) or []
    return found


def profile_sql(ref: str, column: str, field_type: str, repeated: bool) -> tuple[str, str]:
    """集計の SQL と、よく出る値の SQL。入れ子の列は、そのまま a.b で書ける(繰り返しの列は UNNEST する)"""
    col = ".".join(f"`{p}`" for p in column.split("."))
    src = f"`{ref}`"
    if repeated:
        # 繰り返しの列(配列)は、要素ごとに数える
        src = f"`{ref}` AS t, UNNEST(t.{col}) AS v"
        col = "v"
    stats = ["COUNT(*) AS total", f"COUNTIF({col} IS NULL) AS nulls"]
    if field_type in ORDERABLE:
        stats += [f"APPROX_COUNT_DISTINCT({col}) AS distinct_approx", f"CAST(MIN({col}) AS STRING) AS min_value", f"CAST(MAX({col}) AS STRING) AS max_value"]
    if field_type == "STRING":
        stats += [f"MIN(LENGTH({col})) AS min_len", f"MAX(LENGTH({col})) AS max_len"]
    summary = f"SELECT {', '.join(stats)} FROM {src}"
    top = (f"SELECT CAST({col} AS STRING) AS value, COUNT(*) AS n FROM {src} GROUP BY value ORDER BY n DESC LIMIT {PROFILE_TOP}"
           if field_type in ORDERABLE else "")
    return summary, top


def profile_column(c: Any, ref: str, column: str, confirm: bool) -> dict[str, Any]:
    from google.cloud import bigquery

    t = c.get_table(ref.strip("`"))
    f = _column_field(t, column)
    if f is None:
        return {"ok": False, "error": f"列 {column} が {ref} にありません"}
    if f.field_type in ("RECORD", "STRUCT"):
        return {"ok": False, "error": f"{column} は入れ子の列(RECORD)です。中の列(例: {column}.xxx)を調べてください"}
    full = f"{t.project}.{t.dataset_id}.{t.table_id}"
    summary, top = profile_sql(full, column, f.field_type, f.mode == "REPEATED")
    est = (dry_run(c, summary).total_bytes_processed or 0) + ((dry_run(c, top).total_bytes_processed or 0) if top else 0)
    base = {"ok": True, "table": full, "column": column, "type": f.field_type, "mode": f.mode or "NULLABLE", "description": f.description or "",
            "bytes": est, "cost_usd": cost_usd(max(est, 10 * 1024**2)), "sql": summary + (";\n\n" + top if top else "")}
    if est > PROFILE_CONFIRM_BYTES and not confirm:
        return {**base, "needs_confirm": True}
    cfg = bigquery.QueryJobConfig(maximum_bytes_billed=max_bytes())
    t0 = time.monotonic()
    row = next(iter(c.query(summary, job_config=cfg).result()), None)
    stats = plain(dict(row.items())) if row is not None else {}
    values = [plain(dict(r.items())) for r in c.query(top, job_config=cfg).result()] if top else []
    total = stats.get("total") or 0
    record_run("列を調べる", base["sql"], rows=total, processed=est, seconds=round(time.monotonic() - t0, 2))
    return {**base, **stats, "null_rate": (stats.get("nulls") or 0) / total if total else None, "top": values,
            "seconds": round(time.monotonic() - t0, 2)}


class ProfileIn(BaseModel):
    table: str = Field(min_length=3, max_length=500)
    column: str = Field(min_length=1, max_length=300)
    # 読む量が多いとき(1 GB 超)に、確かめたうえで流す
    confirm: bool = False


@router.post("/bq/profile")
async def profile(body: ProfileIn) -> dict[str, Any]:
    try:
        return await asyncio.to_thread(profile_column, bq.client(), body.table, body.column, body.confirm)
    except Exception as e:  # noqa: BLE001
        return error_result(e)
