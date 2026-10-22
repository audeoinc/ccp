"""開発用の画面(/dev/)の API(バックログ B10。設計は docs/DEVTOOLS.md)。

利用先の Workbench で、CCP が読むデータ(BigQuery の 6 つの出力・ポリシーの文書)を用意するための道具。
BigQuery に問い合わせを投げられるのは、Workbench で動くこのサーバーだけなので、試しと答え合わせをここに置く。

  GET  /api/dev/status          有効か・ジョブのプロジェクト・アカウント・作業フォルダ
  GET  /api/dev/settings        作業の設定(よく見るデータセット・出す先 など。server/devwork/settings.json)
  PUT  /api/dev/settings
  GET  /api/dev/bq/datasets     ?project=  データセットの一覧
  GET  /api/dev/bq/tables       ?dataset=<プロジェクト>.<データセット>  表とビューの一覧
  GET  /api/dev/bq/table        ?ref=<プロジェクト>.<データセット>.<表>  列(入れ子は a.b の形に開く)・行数・パーティション
  GET  /api/dev/bq/preview      ?ref=…  先頭の行(list_rows。問い合わせではないので料金なし)
  POST /api/dev/bq/dryrun       {sql}  料金なしの試し。文の種類・読む量・結果の列
  POST /api/dev/bq/run          {sql, max_rows}  SELECT だけを、読む量の上限を付けて流す

決まり(DEVTOOLS.md の 6 章):
  - 環境変数 CCP_DEVTOOLS=1 のときだけ動く。それ以外は、画面(/dev/)も API も 404
  - BigQuery は読むだけ。dry-run で文の種類が SELECT のものだけを流す(DDL・DML・複数の文は流さない)
  - 読む量の上限は DEVTOOLS_MAX_GB(既定 10 GB)。超える問い合わせは BigQuery が止める
  - 作業ファイルは server/devwork/(Git に入れない。利用先の表の名前を含むため)。DB に置かないのは、import-pack で DB を置き換えても消えないように
"""
from __future__ import annotations

import asyncio
import base64
import json
import os
import time
from datetime import date, datetime, time as dtime
from decimal import Decimal
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import bq

DEVWORK = Path(os.getenv("DEVTOOLS_DIR") or Path(__file__).resolve().parents[1] / "devwork")
# 画面に返す行の上限(多すぎるとブラウザが重くなる。全件の確かめは、別の段で行う)
MAX_ROWS = 1000
PREVIEW_ROWS = 20


def enabled() -> bool:
    return os.getenv("CCP_DEVTOOLS", "").strip().lower() in ("1", "true", "yes", "on")


def blocks(path: str) -> bool:
    """無効のとき、このパスを隠すか(画面の /dev/ と、API の /api/dev/)。main.py のミドルウェアから呼ぶ"""
    return not enabled() and (path == "/dev" or path.startswith("/dev/") or path.startswith("/api/dev/"))


def max_bytes() -> int:
    try:
        gb = float(os.getenv("DEVTOOLS_MAX_GB") or 10)
    except ValueError:
        gb = 10
    return int(gb * 1024**3)


async def require_enabled() -> None:
    if not enabled():
        raise HTTPException(404)


router = APIRouter(prefix="/api/dev", dependencies=[Depends(require_enabled)])


def plain(v: Any) -> Any:
    """BigQuery の値を、JSON にできる形にする(日時は ISO の文字、数値の Decimal は文字のまま桁を落とさない、バイト列は base64)"""
    if v is None or isinstance(v, (bool, int, float, str)):
        return v
    if isinstance(v, (datetime, date, dtime)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return str(v)
    if isinstance(v, bytes):
        return base64.b64encode(v).decode()
    if isinstance(v, dict):
        return {k: plain(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [plain(x) for x in v]
    return str(v)


def flatten_fields(fields: Any, prefix: str = "") -> list[dict[str, Any]]:
    """表の列(SchemaField)を、入れ子(RECORD)を a.b の形に開いて並べる。Gemini に渡す列の一覧にもそのまま使う"""
    out: list[dict[str, Any]] = []
    for f in fields or []:
        name = f"{prefix}{f.name}"
        out.append({"name": name, "type": f.field_type, "mode": f.mode or "NULLABLE", "description": f.description or ""})
        if getattr(f, "fields", None):
            out.extend(flatten_fields(f.fields, f"{name}."))
    return out


def schema_columns(fields: Any) -> list[dict[str, str]]:
    return [{"name": f.name, "type": f.field_type} for f in (fields or [])]


def only_select(statement_type: str | None) -> str | None:
    """流してよい文か。だめなら、理由を返す(画面にそのまま出す)"""
    if statement_type == "SELECT":
        return None
    if not statement_type:
        return "文の種類が分かりませんでした(複数の文・スクリプトは流せません)"
    return f"SELECT ではないので流しません(文の種類: {statement_type})。表を作る SQL は、BigQuery のコンソールで実行してください"


class SqlIn(BaseModel):
    sql: str = Field(min_length=1, max_length=200_000)
    max_rows: int = Field(200, ge=1, le=MAX_ROWS)


def _error(e: Exception) -> dict[str, Any]:
    # BigQuery のエラーは、本文(message)に行と列の位置が入っている。Gemini に返して直させるので、そのまま渡す
    msg = getattr(e, "message", None) or str(e)
    errors = getattr(e, "errors", None) or []
    detail = "; ".join(x.get("message", "") for x in errors if isinstance(x, dict) and x.get("message")) if errors else ""
    return {"ok": False, "error": f"{type(e).__name__}: {detail or msg}"[:4000]}


def _dry_run(client: Any, sql: str) -> Any:
    from google.cloud import bigquery

    return client.query(sql, job_config=bigquery.QueryJobConfig(dry_run=True, use_query_cache=False))


# ---- 設定・状態

def _settings_path() -> Path:
    return DEVWORK / "settings.json"


@router.get("/status")
async def status() -> dict[str, Any]:
    try:
        account = await asyncio.to_thread(bq.account)
    except Exception as e:  # noqa: BLE001 — 認証がない環境(手元)でも、画面は開けるように
        account = f"(認証を読めません: {type(e).__name__})"
    return {"enabled": True, "project": bq.job_project(), "account": account, "devwork": str(DEVWORK), "max_gb": max_bytes() / 1024**3}


@router.get("/settings")
async def get_settings() -> dict[str, Any]:
    p = _settings_path()
    if not p.is_file():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


@router.put("/settings")
async def put_settings(body: dict[str, Any]) -> dict[str, Any]:
    DEVWORK.mkdir(parents=True, exist_ok=True)
    _settings_path().write_text(json.dumps(body, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"ok": True}


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
        return _error(e)


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
        return _error(e)


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
            "columns": flatten_fields(t.schema),
        }

    try:
        return await asyncio.to_thread(go)
    except Exception as e:  # noqa: BLE001
        return _error(e)


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
        return _error(e)


# ---- SQL を試す

@router.post("/bq/dryrun")
async def dryrun(body: SqlIn) -> dict[str, Any]:
    def go() -> dict[str, Any]:
        job = _dry_run(bq.client(), body.sql)
        st = job.statement_type
        return {"ok": True, "statement_type": st, "bytes": job.total_bytes_processed, "columns": schema_columns(job.schema),
                "runnable": only_select(st) is None, "reason": only_select(st), "max_bytes": max_bytes()}

    try:
        return await asyncio.to_thread(go)
    except Exception as e:  # noqa: BLE001
        return _error(e)


@router.post("/bq/run")
async def run(body: SqlIn) -> dict[str, Any]:
    def go() -> dict[str, Any]:
        from google.cloud import bigquery

        c = bq.client()
        dry = _dry_run(c, body.sql)
        if (why := only_select(dry.statement_type)) is not None:
            return {"ok": False, "error": why}
        t0 = time.monotonic()
        job = c.query(body.sql, job_config=bigquery.QueryJobConfig(maximum_bytes_billed=max_bytes()))
        it = job.result(max_results=body.max_rows)
        rows = [plain(dict(r.items())) for r in it]
        return {
            "ok": True,
            "columns": schema_columns(it.schema),
            "rows": rows,
            "total_rows": it.total_rows,
            "bytes": job.total_bytes_processed,
            "billed": job.total_bytes_billed,
            "seconds": round(time.monotonic() - t0, 2),
            "cached": bool(job.cache_hit),
        }

    try:
        return await asyncio.to_thread(go)
    except Exception as e:  # noqa: BLE001
        return _error(e)
