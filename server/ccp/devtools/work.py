"""出力ごとの作業: SQL の版を残す・採用の版・出す先・答え合わせ(全件を流して bq_validate)"""
from __future__ import annotations

import asyncio
import re
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .. import bq
from . import common
from .bq_tools import job_info
from .common import cost_usd, dry_run, error_result, max_bytes, now_iso, only_select, price_per_tib, read_json, weight, write_json

router = APIRouter()


# ---- 出力ごとの作業: 版を残す・答え合わせ(DEVTOOLS.md の 3.1 の ④〜⑦)
# 版は server/devwork/outputs/<出力>/v<番号>.sql と .json(作った日時・メモ・答え合わせの結果)。
# 採用の印は、同じフォルダの index.json。DB に置かないのは、import-pack で DB を置き換えても消えないように。

OUTPUT_NAMES_ALL = tuple(o.name for o in bq.OUTPUTS)
# 全件の答え合わせで読む行の上限(これを超える出力は、集計の誤りを疑う。メモリを守るため)
CHECK_MAX_ROWS = 2_000_000


def _work_dir(name: str) -> Path:
    if name not in OUTPUT_NAMES_ALL:
        raise HTTPException(404, f"知らない出力です: {name}")
    return common.DEVWORK / "outputs" / name


def versions(name: str) -> list[dict[str, Any]]:
    d = _work_dir(name)
    out = []
    for p in sorted(d.glob("v*.json"), key=lambda x: int(re.sub(r"\D", "", x.stem) or 0)):
        meta = read_json(p, {})
        meta["v"] = int(re.sub(r"\D", "", p.stem) or 0)
        out.append(meta)
    return out


@router.get("/work")
async def work() -> dict[str, Any]:
    """6 つの出力の版の一覧・採用の版と、出す先の設定"""
    outs = {}
    for o in bq.OUTPUTS:
        outs[o.name] = {"label": o.label, "env": o.env, "versions": versions(o.name), "adopted": read_json(_work_dir(o.name) / "index.json", {}).get("adopted")}
    return {"ok": True, "outputs": outs, "target": read_json(common.DEVWORK / "target.json", {})}


class TargetIn(BaseModel):
    # 出す先のデータセット(<プロジェクト>.<データセット>)と、表の名前の頭(ccp_ なら ccp_spu)
    dataset: str = Field("", max_length=300)
    prefix: str = Field("ccp_", max_length=60)


@router.put("/work/target")
async def put_target(body: TargetIn) -> dict[str, Any]:
    write_json(common.DEVWORK / "target.json", body.model_dump())
    return {"ok": True}


class VersionIn(BaseModel):
    sql: str = Field(min_length=1, max_length=200_000)
    note: str = Field("", max_length=2000)


@router.post("/work/{name}")
async def save_version(name: str, body: VersionIn) -> dict[str, Any]:
    d = _work_dir(name)
    d.mkdir(parents=True, exist_ok=True)
    have = versions(name)
    # 直前の版と同じ SQL なら、版を増やさない(保存を何度押しても散らからないように)
    if have:
        last = have[-1]["v"]
        try:
            if (d / f"v{last}.sql").read_text(encoding="utf-8").strip() == body.sql.strip():
                return {"ok": True, "v": last, "same": True}
        except OSError:
            pass
    v = (have[-1]["v"] if have else 0) + 1
    (d / f"v{v}.sql").write_text(body.sql, encoding="utf-8")
    write_json(d / f"v{v}.json", {"created": now_iso(), "note": body.note, "check": None})
    return {"ok": True, "v": v, "same": False}


@router.get("/work/{name}/{v}")
async def get_version(name: str, v: int) -> dict[str, Any]:
    d = _work_dir(name)
    try:
        sql = (d / f"v{v}.sql").read_text(encoding="utf-8")
    except OSError:
        raise HTTPException(404, f"{name} の v{v} はありません")
    return {"ok": True, "v": v, "sql": sql, **read_json(d / f"v{v}.json", {})}


class AdoptIn(BaseModel):
    v: int | None = None


@router.put("/work/{name}/adopt")
async def adopt(name: str, body: AdoptIn) -> dict[str, Any]:
    write_json(_work_dir(name) / "index.json", {"adopted": body.v})
    return {"ok": True}


class CheckIn(BaseModel):
    output: str
    sql: str = Field(min_length=1, max_length=200_000)
    # 答え合わせの結果を、この版に残す(なければ残さない)
    version: int | None = None
    # 結びつき(SKU → SPU など)も確かめる。相手の出力の「採用の版」を流して、キーだけ読む
    with_context: bool = True
    # 読む量を見てから流す: false なら dry-run だけ(読む量・料金の概算を返す)
    run: bool = False


# 結びつきを確かめる相手(bq_validate.validate の context)
CONTEXT_OF = {"sku": ("spu",), "sku_stock": ("sku",), "weekly": ("spu",)}
CONTEXT_KEYS = {"spu": ("market", "product_code"), "sku": ("market", "sku_code")}


def _adopted_sql(name: str) -> str | None:
    v = read_json(_work_dir(name) / "index.json", {}).get("adopted")
    if not v:
        return None
    try:
        return (_work_dir(name) / f"v{v}.sql").read_text(encoding="utf-8")
    except OSError:
        return None


def _strip_sql(sql: str) -> str:
    """副問い合わせに包めるように、末尾の ; を外す"""
    return re.sub(r";\s*$", "", sql.strip())


def check_output(c: Any, body: CheckIn) -> dict[str, Any]:
    from google.cloud import bigquery

    from .. import bq_validate as bv

    if body.output not in OUTPUT_NAMES_ALL:
        return {"ok": False, "error": f"知らない出力です: {body.output}"}
    o = next(x for x in bq.OUTPUTS if x.name == body.output)
    dry = dry_run(c, body.sql)
    if (why := only_select(dry.statement_type)) is not None:
        return {"ok": False, "error": why}
    cols = [f.name for f in (dry.schema or [])]
    missing, missing_optional = bq.compare_columns(o, cols)
    # 結びつきの相手(採用の版があるものだけ)
    ctx_sqls = {}
    if body.with_context:
        for other in CONTEXT_OF.get(body.output, ()):
            s = _adopted_sql(other)
            if s:
                keys = ", ".join(CONTEXT_KEYS[other])
                ctx_sqls[other] = f"SELECT DISTINCT {keys} FROM (\n{_strip_sql(s)}\n)"
    est = dry.total_bytes_processed or 0
    for s in ctx_sqls.values():
        try:
            est += dry_run(c, s).total_bytes_processed or 0
        except Exception:  # noqa: BLE001 — 相手の版が流せないなら、結びつきは確かめない(下で伝える)
            pass
    base = {"ok": True, "output": body.output, "columns": cols, "missing": missing, "missing_optional": missing_optional,
            "bytes": est, "cost_usd": cost_usd(max(est, 10 * 1024**2)), "price_per_tib": price_per_tib(),
            "weight": weight(est, None), "context": sorted(ctx_sqls), "max_bytes": max_bytes()}
    if not body.run:
        return {**base, "ran": False}
    if missing:
        return {**base, "ran": False, "error": f"必須の列がありません: {', '.join(missing)}(列の名前は、仕様のとおりに AS で付け替えてください)"}
    cfg = bigquery.QueryJobConfig(maximum_bytes_billed=max_bytes())
    job = c.query(body.sql, job_config=cfg)
    it = job.result()
    if (it.total_rows or 0) > CHECK_MAX_ROWS:
        return {**base, "ran": False, "error": f"{it.total_rows:,} 行あります。答え合わせは {CHECK_MAX_ROWS:,} 行までです(集計の粒度を見直してください)"}
    rows = [{k.lower(): v for k, v in dict(r).items()} for r in it]
    context: dict[str, list[dict[str, Any]]] = {}
    notes: list[str] = []
    for other, s in ctx_sqls.items():
        try:
            context[other] = [{k.lower(): v for k, v in dict(r).items()} for r in c.query(s, job_config=cfg).result()]
        except Exception as e:  # noqa: BLE001
            notes.append(f"{other} の採用の版を流せなかったので、結びつきは確かめていません({error_result(e)['error'][:200]})")
    for other in CONTEXT_OF.get(body.output, ()):
        if body.with_context and other not in ctx_sqls:
            notes.append(f"{other} に採用の版がないので、{other} との結びつきは確かめていません")
    issues = bv.validate(body.output, rows, context)
    out_issues = [{"level": i.level, "message": i.message, "count": i.count, "examples": [str(x) for x in i.examples]} for i in issues]
    for col in missing_optional:
        out_issues.append({"level": bv.WARN, "message": f"あると使う列 {col} がありません", "count": 0, "examples": []})
    ng = sum(1 for i in out_issues if i["level"] == bv.NG)
    warn = len(out_issues) - ng
    result = {"checked_at": now_iso(), "rows": len(rows), "ng": ng, "warn": warn}
    if body.version:
        meta_p = _work_dir(body.output) / f"v{body.version}.json"
        if meta_p.is_file():
            meta = read_json(meta_p, {})
            meta["check"] = result
            write_json(meta_p, meta)
    return {**base, "ran": True, "rows": len(rows), "issues": out_issues, "ng": ng, "warn": warn, "notes": notes,
            "checked_at": result["checked_at"], "job": job_info(c, body.sql, job)}


@router.post("/check")
async def check(body: CheckIn) -> dict[str, Any]:
    """答え合わせ。run=false で読む量の見積もりだけ、run=true で全件を流して bq_validate にかける(CCP の取り込みと同じ確かめ)"""
    try:
        return await asyncio.to_thread(check_output, bq.client(), body)
    except Exception as e:  # noqa: BLE001
        return error_result(e)
