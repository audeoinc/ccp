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
  GET  /api/dev/bq/projects     見られるプロジェクト(データセットを、名前の一部で探すため)
  POST /api/dev/ai/chat         Gemini と会話して SQL を組み立てる。前提(仕様・手本・表の列・まとめ・いまの SQL)はサーバーで組み立てる。
                                思考・調べたこと・返事を、起きた順に NDJSON で返す
  GET  /api/dev/ai/models       使えるモデル(賢い順)と既定
  POST /api/dev/ai/context      Gemini に渡す前提を、そのまま返す(見る・コピーする)

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
import logging
import os
import re
import time
from datetime import date, datetime, time as dtime
from decimal import Decimal
from pathlib import Path
from typing import Any, AsyncIterator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from . import bq

log = logging.getLogger("ccp.devtools")

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

def price_per_tib() -> float:
    """オンデマンドの料金(1 TiB あたりのドル)。場所や契約で違うので、設定(DEVTOOLS_PRICE_PER_TIB)で変えられる"""
    try:
        return float(os.getenv("DEVTOOLS_PRICE_PER_TIB") or 6.25)
    except ValueError:
        return 6.25


def cost_usd(n: int | None) -> float | None:
    return None if n is None else round(n / 1024**4 * price_per_tib(), 4)


def weight(processed: int | None, slot_ms: int | None) -> str:
    """重さの目安(読む量とスロット時間から。画面に一言で出す)"""
    gb = (processed or 0) / 1024**3
    slot_s = (slot_ms or 0) / 1000
    if gb >= 100 or slot_s >= 3600:
        return "重い"
    if gb >= 1 or slot_s >= 60:
        return "ふつう"
    return "軽い"


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
        job = _dry_run(c, body.sql)
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
            "job": job_info(c, body.sql, job),
        }

    try:
        return await asyncio.to_thread(go)
    except Exception as e:  # noqa: BLE001
        return _error(e)


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
        return _error(e)


# ---- Gemini と SQL を組み立てる(DEVTOOLS.md の 4 章)
# 前提(system_instruction)は、毎回サーバーで組み立て直す。画面から送るのは、会話と「何を渡すか」の選択だけ。
# そうすると、表の列が変わっても、仕様の文書を直しても、次の発言から新しい前提で答える。
# Gemini には、BigQuery を調べる道具(関数)を渡す。「A データセットの ctlg を含む表から…」のように頼めば、
# Gemini が自分で表を探し、列を見て、SQL を確かめてから答える(利用者が表を 1 つずつ選んで渡さなくてよいように)。

DOCS = Path(__file__).resolve().parents[2] / "docs"
OUTPUT_NAMES = ("spu", "sku", "sku_stock", "weekly", "forecast", "ranking")
# 先頭の行を Gemini に渡すとき、外す列(個人を特定できる・自由な文章の列。名前で見分ける)
PRIVATE = re.compile(r"(name|_nm$|mail|phone|tel|addr|birth|zip|postal|review|comment|memo|note|text|txt|氏名|名前|住所|電話|メール|誕生|郵便|レビュー|コメント)", re.I)
SAMPLE_ROWS = 5
# Gemini が道具を使う回数の上限(1 回の発言につき)。表を探す → 列を見る → 確かめる、で足りる数
MAX_TOOL_ROUNDS = 16
# Gemini が流す SELECT の、返す行の上限
TOOL_ROWS = 20


def chapters(md: str, numbers: tuple[int, ...]) -> str:
    """Markdown から「## <番号>. …」の章だけを抜き出す"""
    out: list[str] = []
    for part in re.split(r"(?m)^(?=## )", md):
        m = re.match(r"## (\d+)\.", part)
        if m and int(m.group(1)) in numbers:
            out.append(part.strip().rstrip("-").strip())
    return "\n\n".join(out)


def _doc(name: str) -> str:
    try:
        return (DOCS / name).read_text(encoding="utf-8")
    except OSError:
        return ""


ROLE = """あなたは BigQuery(GoogleSQL)の SQL を書く専門家です。利用者と会話しながら、SQL を組み立てます。
利用者は、Campaign Contents Planner(CCP)が読むデータ(下の「CCP が読む出力の仕様」の 6 つの出力)を、利用先の BigQuery の元の表から作ろうとしています。
元の表の列を、CCP のどの列に当てればよいかを一緒に考えるのも、あなたの仕事です。

BigQuery を調べる道具(関数)を使えます:
- list_datasets: プロジェクトのデータセットの一覧
- list_tables: データセットの表の一覧(name_contains で名前の一部で絞れる。大文字・小文字は区別しない)
- describe_table: 表の列・型・説明・パーティションと、先頭の数行
- dry_run: SQL を料金なしで確かめる(文法・列の有無・読む量)
- describe_view_sources: ビューが参照している元の表(ビューの中のビューもたどる)と、それぞれの列の定義
- run_select: SELECT を流して、先頭の行を見る(値の種類を確かめる SELECT DISTINCT など。読む量に上限がある)
推測で書かず、道具で表と列を確かめてから SQL を書いてください。SQL を返す前に、dry_run で通ることを確かめてください。
利用者が名前の一部しか言わないとき(「ctlg が含まれた表」など)は、list_tables で探してください。
ビューは、ビューの SQL(describe_table で見える)と、参照している元の表の列(describe_view_sources)をたどり、
CCP の列に合う元の列を探してください。ビューに出ていない列でも、元の表にあれば候補にし、どのビューに足せばよいか・元の表から直接読むべきかを考えてください。

最後の返答は、次の形の JSON だけにしてください(```json で囲まない):
{"reply": "利用者への返事(日本語。Markdown の見出し・箇条書き・**太字**・表を使ってよい。SQL はここに書かない)",
 "sqls": [{"title": "何の SQL か(短く)", "sql": "SQL の全文"}],
 "questions": ["決めきれなかったこと・利用者に確かめたいこと(なければ空の配列)"]}
sqls は、新しく書いた・直した SQL があるときだけ(なければ空の配列)。直すときも、部分ではなく、そのまま流せる全文。
値を確かめる SQL と、本番の SQL のように、いくつか出すときは並べる(利用者は 1 つずつ試す)。

決まり:
- 方言は GoogleSQL(BigQuery)。表は `プロジェクト.データセット.表` の形で、バッククォートで囲む
- 確かめた表と列だけを使う。ない列を推測で書かない(足りなければ、questions で聞く)
- CCP の列に当てるときは、仕様のとおりに AS で付け替える。当て方を表にして reply に書く(元の列 → CCP の列、変換、自信のなさ)
- 読む量を抑える(パーティションの列があれば、期間で絞る。SELECT * を避ける)
- 「いまの SQL」とエラーが渡されたら、まずエラーの原因を reply で短く説明し、直した全文を sql に入れる
"""

TABLE_POLICY = """## 出力の方針(利用者が決めたこと)
- 出力は、ビューではなく表にする。最終的に `CREATE OR REPLACE TABLE <出す先> AS SELECT …` で作り、BigQuery のスケジュールされたクエリで定期的に更新する
- ただし、この会話で書くのは **SELECT の部分だけ**(この画面では SELECT しか流せない。表を作る形は、合格したあとで作る)
- 何度流しても同じ結果になる書き方にする
- `as_of` には元のデータの時点を入れる(CURRENT_TIMESTAMP() にしない)
- 出す先は、元の表と同じ場所(リージョン)
"""


class ChatTurn(BaseModel):
    role: str = Field(pattern="^(user|model)$")
    text: str = Field(max_length=200_000)


class ChatIn(BaseModel):
    messages: list[ChatTurn] = Field(default_factory=list, max_length=200)
    # 使うモデル(画面で選ぶ)。なければ既定(default_model)
    model: str | None = Field(None, max_length=200)
    # 作ろうとしている出力(spu など)。手本の SQL を渡す。なしでも、仕様はいつも全文を渡す
    output: str | None = None
    # 画面で開いているデータセット(「このデータセット」と言ったときの手がかり)
    dataset: str = ""
    tables: list[str] = Field(default_factory=list, max_length=20)
    sample_rows: bool = True
    # Gemini に SELECT を流させるか(読む量の上限つき)。切ると dry_run だけ
    allow_run: bool = True
    notes: str = Field("", max_length=200_000)
    sql: str = Field("", max_length=200_000)
    last: str = Field("", max_length=50_000)


def _sample(c: Any, t: Any) -> list[str]:
    """先頭の数行(Markdown の表)。名前から個人の情報・自由な文章と見られる列は外す"""
    if t.table_type != "TABLE":
        return []
    try:
        rows = [plain(dict(r.items())) for r in c.list_rows(t, max_results=SAMPLE_ROWS)]
    except Exception:  # noqa: BLE001 — 行が読めなくても、列だけで続ける
        return []
    cols = [f.name for f in t.schema if not PRIVATE.search(f.name)]
    hidden = [f.name for f in t.schema if PRIVATE.search(f.name)]
    if not rows or not cols:
        return []
    out = ["", f"先頭の {len(rows)} 行(値の形を見るため。外した列: {', '.join(hidden) or 'なし'}):", "", "| " + " | ".join(cols) + " |", "|" + "---|" * len(cols)]
    out += ["| " + " | ".join(str(r.get(k, ""))[:60].replace("|", " ").replace("\n", " ") for k in cols) + " |" for r in rows]
    return out


def view_sources(c: Any, ref: str) -> list[str]:
    """ビューが参照している元の表(料金なしの dry-run で BigQuery に聞く。ビューの中のビューも、元の表までたどった結果が返る)"""
    job = _dry_run(c, f"SELECT * FROM `{ref}`")
    me = ref.replace(":", ".")
    out = []
    for t in job.referenced_tables or []:
        name = f"{t.project}.{t.dataset_id}.{t.table_id}"
        if name != me and name not in out:
            out.append(name)
    return out


def describe(c: Any, ref: str, with_rows: bool) -> str:
    """表 1 つの説明(Gemini に渡す形)"""
    try:
        t = c.get_table(ref.strip().strip("`"))
    except Exception as e:  # noqa: BLE001 — 読めない表は、読めないことを伝えて続ける
        return f"### `{ref}`\n(読めませんでした: {type(e).__name__}: {e})"[:1000]
    part = t.time_partitioning
    lines = [f"### `{t.project}.{t.dataset_id}.{t.table_id}`({t.table_type}、約 {t.num_rows or 0:,} 行、{t.location})"]
    if t.description:
        lines.append(t.description)
    if part:
        lines.append(f"パーティション: {part.field or '_PARTITIONTIME'}({part.type_})")
    if t.clustering_fields:
        lines.append(f"クラスタ: {', '.join(t.clustering_fields)}")
    if t.view_query:
        lines += ["", "ビューの SQL(DDL の本体):", "```sql", t.view_query.strip()[:8000], "```"]
        try:
            src = view_sources(c, f"{t.project}.{t.dataset_id}.{t.table_id}")
            if src:
                lines += ["", "このビューが参照している元の表(列は describe_view_sources で見られる): " + ", ".join(f"`{x}`" for x in src)]
        except Exception:  # noqa: BLE001 — 参照先が分からなくても、ビューの SQL は渡せる
            pass
    lines += ["", "| 列 | 型 | モード | 説明 |", "|---|---|---|---|"]
    lines += [f"| {f['name']} | {f['type']} | {f['mode']} | {f['description'].replace('|', ' ')} |" for f in flatten_fields(t.schema)]
    if with_rows:
        lines += _sample(c, t)
    return "\n".join(lines)


def build_context(body: ChatIn, client: Any | None) -> str:
    """Gemini に渡す前提(DEVTOOLS.md の 4 章の順。上ほど変わらない内容)"""
    parts = [ROLE, TABLE_POLICY]
    if client is not None:
        where = [f"- 接続しているプロジェクト(問い合わせを走らせるプロジェクト): `{client.project}`"]
        if body.dataset:
            where.append(f"- 画面で開いているデータセット: `{body.dataset}`")
        parts.append("## いまの接続\n\n" + "\n".join(where))
    parts.append("## CCP が読む出力の仕様(BIGQUERY_EXPORT.md)\n\n" + chapters(_doc("BIGQUERY_EXPORT.md"), tuple(range(1, 20))))
    rules = chapters(_doc("BIGQUERY_CONVERT.md"), (4,))
    if rules:
        parts.append(rules)
    if body.output in OUTPUT_NAMES:
        example = DOCS / "bq_example" / f"{body.output}.sql"
        parts.append(f"## いま作ろうとしている出力: {body.output}")
        if example.is_file():
            parts.append("## 手本の SQL(練習用の元データ `{src}` から作った例。元の表の名前・列は、利用先と違う)\n\n```sql\n" + example.read_text(encoding="utf-8") + "\n```")
    if body.tables and client is not None:
        parts.append("## 利用者が選んで渡した表\n\n" + "\n\n".join(describe(client, r, body.sample_rows) for r in body.tables))
    if body.notes.strip():
        parts.append("## 仕様のまとめ(利用先の資料から、利用者がまとめたもの)\n\n" + body.notes.strip())
    if body.sql.strip():
        parts.append("## いまの SQL(画面のエディタの中身)\n\n```sql\n" + body.sql.strip() + "\n```")
    if body.last.strip():
        parts.append("## いまの SQL を流した結果(エラー、または結果の先頭)\n\n" + body.last.strip())
    return "\n\n".join(parts)


def parse_reply(text: str) -> dict[str, Any]:
    """Gemini の最後の返答(JSON)を読む。```json で囲まれていても、前後に文があっても拾う。崩れていたら、本文をそのまま返事にする"""
    candidates = [text]
    m = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.S)
    if m:
        candidates.append(m.group(1))
    a, b = text.find("{"), text.rfind("}")
    if 0 <= a < b:
        candidates.append(text[a : b + 1])
    for c in candidates:
        try:
            v = json.loads(c)
        except ValueError:
            continue
        if isinstance(v, dict) and ("reply" in v or "sql" in v or "sqls" in v):
            q = v.get("questions")
            sqls = [{"title": str(x.get("title") or ""), "sql": str(x.get("sql") or "").strip()} for x in (v.get("sqls") or []) if isinstance(x, dict)]
            # 1 つだけの形(sql)で返してきたときも受ける
            if isinstance(v.get("sql"), str) and v["sql"].strip():
                sqls.insert(0, {"title": "", "sql": v["sql"].strip()})
            return {"reply": str(v.get("reply") or ""), "sqls": [x for x in sqls if x["sql"]],
                    "questions": [str(x) for x in q if x] if isinstance(q, list) else []}
    return {"reply": text, "sqls": [], "questions": []}


# ---- Gemini が使う道具(どれも読むだけ。BigQuery に書き込むものはない)

def tool_declarations() -> list[Any]:
    from google.genai import types

    S = types.Schema
    T = types.Type
    return [types.Tool(function_declarations=[
        types.FunctionDeclaration(name="list_datasets", description="プロジェクトのデータセットの一覧。project を省くと、接続しているプロジェクト",
                                  parameters=S(type=T.OBJECT, properties={"project": S(type=T.STRING)})),
        types.FunctionDeclaration(name="list_tables", description="データセットの表・ビューの一覧。name_contains で、名前の一部(大文字・小文字は区別しない)で絞れる",
                                  parameters=S(type=T.OBJECT, properties={"dataset": S(type=T.STRING, description="プロジェクト.データセット、またはデータセットだけ(接続しているプロジェクト)"),
                                                                          "name_contains": S(type=T.STRING)}, required=["dataset"])),
        types.FunctionDeclaration(name="describe_table", description="表の列・型・説明・パーティション・行数と、先頭の数行",
                                  parameters=S(type=T.OBJECT, properties={"table": S(type=T.STRING, description="プロジェクト.データセット.表")}, required=["table"])),
        types.FunctionDeclaration(name="describe_view_sources", description="ビューが参照している元の表(ビューの中のビューもたどる)と、それぞれの列の定義",
                                  parameters=S(type=T.OBJECT, properties={"view": S(type=T.STRING, description="プロジェクト.データセット.ビュー")}, required=["view"])),
        types.FunctionDeclaration(name="dry_run", description="SQL を料金なしで確かめる。文の種類・読む量・結果の列、またはエラー",
                                  parameters=S(type=T.OBJECT, properties={"sql": S(type=T.STRING)}, required=["sql"])),
        types.FunctionDeclaration(name="run_select", description=f"SELECT を流して、先頭 {TOOL_ROWS} 行を見る(値の種類・件数の確かめ)。SELECT 以外と、読む量が上限を超えるものは流れない",
                                  parameters=S(type=T.OBJECT, properties={"sql": S(type=T.STRING)}, required=["sql"])),
    ])]


def _qualify(c: Any, name: str) -> str:
    """データセットだけなら、接続しているプロジェクトを付ける"""
    name = name.strip().strip("`")
    return name if "." in name else f"{c.project}.{name}"


def run_tool(c: Any, name: str, args: dict[str, Any], body: ChatIn) -> tuple[dict[str, Any], str]:
    """道具を 1 つ使う。Gemini に返す結果と、画面に出す 1 行(何をしたか)を返す"""
    from google.cloud import bigquery

    try:
        if name == "list_datasets":
            p = (args.get("project") or c.project).strip()
            ids = sorted(d.dataset_id for d in c.list_datasets(project=p))
            return {"project": p, "datasets": ids}, f"データセットの一覧を見た({p}、{len(ids)} 件)"
        if name == "list_tables":
            ds = _qualify(c, str(args.get("dataset") or body.dataset))
            key = str(args.get("name_contains") or "").lower()
            rows = [{"table": f"{t.project}.{t.dataset_id}.{t.table_id}", "type": t.table_type} for t in c.list_tables(ds) if key in t.table_id.lower()]
            more = len(rows) > 300
            return {"dataset": ds, "tables": rows[:300], "truncated": more}, f"表を探した({ds}{f'、「{key}」を含む' if key else ''}、{len(rows)} 件)"
        if name == "describe_table":
            ref = _qualify(c, str(args.get("table") or ""))
            return {"description": describe(c, ref, body.sample_rows)}, f"表の列を見た({ref})"
        if name == "describe_view_sources":
            ref = _qualify(c, str(args.get("view") or ""))
            src = view_sources(c, ref)[:12]
            # 元の表は列だけ(先頭の行は、必要なら describe_table で個別に見る。量を抑えるため)
            return {"view": ref, "sources": [describe(c, x, False) for x in src]}, f"ビューの参照先を見た({ref}、元の表 {len(src)} 件)"
        if name == "dry_run":
            job = c.query(str(args.get("sql") or ""), job_config=bigquery.QueryJobConfig(dry_run=True, use_query_cache=False))
            return ({"statement_type": job.statement_type, "bytes": job.total_bytes_processed, "columns": schema_columns(job.schema)},
                    f"SQL を確かめた(通った。読む量 {job.total_bytes_processed or 0:,} バイト)")
        if name == "run_select":
            if not body.allow_run:
                return {"error": "利用者が、SQL を流すことを止めています。dry_run で確かめてください"}, "SELECT を流そうとした(止めてある)"
            sql = str(args.get("sql") or "")
            dry = _dry_run(c, sql)
            if (why := only_select(dry.statement_type)) is not None:
                return {"error": why}, "SELECT 以外を流そうとした(止めた)"
            job = c.query(sql, job_config=bigquery.QueryJobConfig(maximum_bytes_billed=max_bytes()))
            it = job.result(max_results=TOOL_ROWS)
            rows = [plain(dict(r.items())) for r in it]
            return ({"columns": schema_columns(it.schema), "rows": rows, "total_rows": it.total_rows},
                    f"SELECT を流した({it.total_rows or 0:,} 行、読んだ量 {job.total_bytes_processed or 0:,} バイト)")
        return {"error": f"知らない道具です: {name}"}, f"知らない道具 {name}"
    except Exception as e:  # noqa: BLE001 — エラーも Gemini に返して、直させる
        err = _error(e)["error"]
        return {"error": err}, f"{name} がエラーになった({err[:120]})"


async def _context(body: ChatIn) -> tuple[str, Any]:
    client = await asyncio.to_thread(bq.client)
    return await asyncio.to_thread(build_context, body, client), client


def _version(name: str) -> tuple[float, int]:
    """モデルの名前から、新しさを比べる値(gemini-3.5-pro → 3.5。preview は、同じ版の正式より後ろ)"""
    m = re.search(r"gemini-(\d+(?:\.\d+)?)", name)
    return (float(m.group(1)) if m else 0.0, 0 if "preview" in name else 1)


def pick_models(names: list[str]) -> list[str]:
    """Vertex AI のモデルの一覧から、会話に使える Gemini を、賢い順(Pro → Flash、新しい版が先)に並べる"""
    keep = []
    for n in names:
        n = n.split("/")[-1]
        if not n.startswith("gemini-") or not re.search(r"-(pro|flash)\b", n):
            continue
        if re.search(r"(image|tts|audio|live|embedding|lite|exp|thinking-exp)", n):
            continue
        keep.append(n)
    return sorted(set(keep), key=lambda n: (0 if "-pro" in n else 1, tuple(-x for x in _version(n))))


_models_cache: list[str] | None = None


async def available_models() -> list[str]:
    """使えるモデル(Vertex AI に聞く。聞けなければ設定のモデルだけ)。プロセスの間は覚えておく"""
    global _models_cache
    if _models_cache is None:
        from . import ai

        names: list[str] = []
        try:
            pager = await ai._get_client().aio.models.list(config={"query_base": True, "page_size": 200})
            async for m in pager:
                names.append(m.name or "")
        except Exception:  # noqa: BLE001 — 一覧を出せない環境でも、設定のモデルで動く
            log.info("Vertex AI のモデルの一覧を読めませんでした", exc_info=True)
        _models_cache = pick_models(names)
    pinned = [m for m in (os.getenv("DEVTOOLS_GEMINI_MODEL"), _pro_guess or None, os.getenv("GEMINI_MODEL")) if m]
    return list(dict.fromkeys(pinned[:-1] + _models_cache + pinned[-1:]))


async def default_model() -> str:
    """開発用の画面の既定のモデル。設定(DEVTOOLS_GEMINI_MODEL)があればそれ、なければ一覧でいちばん賢いもの。
    SQL を組み立てるのは、配信の下書きと違って 1 回ずつの呼び出しなので、速さより賢さを取る"""
    global _pro_guess
    if os.getenv("DEVTOOLS_GEMINI_MODEL"):
        return os.environ["DEVTOOLS_GEMINI_MODEL"]
    models = await available_models()
    pros = [m for m in (_models_cache or []) if "-pro" in m]
    if pros:
        return pros[0]
    # 一覧を読めない環境: CCP のモデル(GEMINI_MODEL)の Flash を Pro に置き換えた名前が、使えるかを 1 度だけ聞く
    base = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")
    if _pro_guess is None:
        _pro_guess = ""
        guess = pro_of(base)
        if guess:
            from . import ai

            try:
                await ai._get_client().aio.models.get(model=guess)
                _pro_guess = guess
            except Exception:  # noqa: BLE001 — その Pro がない・権限がない。CCP のモデルのまま
                log.info("%s は使えませんでした。%s を使います", guess, base)
    if _pro_guess:
        return _pro_guess
    return models[0] if models else base


def pro_of(name: str) -> str | None:
    """Flash の名前から、同じ版の Pro の名前を作る(gemini-3.8-flash → gemini-3.8-pro)。作れなければ None"""
    guess = re.sub(r"-flash(-lite)?", "-pro", name, count=1)
    return guess if guess != name else None


_pro_guess: str | None = None


@router.get("/ai/models")
async def models() -> dict[str, Any]:
    return {"ok": True, "default": await default_model(), "models": await available_models(),
            "thinking": (os.getenv("DEVTOOLS_THINKING") or "high").lower()}


def _line(obj: dict[str, Any]) -> bytes:
    return (json.dumps(obj, ensure_ascii=False) + "\n").encode("utf-8")


async def chat_events(body: ChatIn) -> AsyncIterator[dict[str, Any]]:
    """会話の 1 回分を、起きた順に返す(画面が、思考・調べたこと・返事を、届いたそばから出せるように)。
      {"type": "start", "model": …}       {"type": "thought", "text": …}(思考の要約。少しずつ届く)
      {"type": "step", "text": …}         {"type": "final", "reply": …, "sqls": […], "questions": […]}
      {"type": "error", "error": …}"""
    from google.genai import types

    from . import ai

    if not body.messages or body.messages[-1].role != "user":
        yield {"type": "error", "error": "送る発言がありません"}
        return
    model = body.model or await default_model()
    level = (os.getenv("DEVTOOLS_THINKING") or "high").upper()
    yield {"type": "start", "model": model, "thinking": level.lower()}
    try:
        context, client = await _context(body)
    except Exception as e:  # noqa: BLE001
        yield {"type": "error", "error": _error(e)["error"]}
        return
    config = types.GenerateContentConfig(
        system_instruction=context,
        tools=tool_declarations(),
        # 道具の呼び出しは、ここで 1 つずつ行う(画面に「何をしたか」を出し、回数に上限を付けるため)
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        # 思考の要約も受け取る(利用者が、どう考えて SQL にしたかを確かめながら進めるため)
        thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel(level), include_thoughts=True),
    )
    contents: list[Any] = [types.Content(role=m.role, parts=[types.Part(text=m.text)]) for m in body.messages]
    text = ""
    try:
        for round_ in range(MAX_TOOL_ROUNDS + 1):
            if round_ == MAX_TOOL_ROUNDS:
                # 道具を使う回数の上限。ここまでで分かったことで答えさせる(道具を渡さずに、もう 1 回)
                contents.append(types.Content(role="user", parts=[types.Part(text="道具を使う回数の上限に達しました。ここまでで分かったことで、決まりの JSON で答えてください。")]))
                config = config.model_copy(update={"tools": None, "automatic_function_calling": None})
            parts: list[Any] = []
            calls: list[Any] = []
            text = ""
            stream = await ai._get_client().aio.models.generate_content_stream(model=model, contents=contents, config=config)
            async for chunk in stream:
                for cand in chunk.candidates or []:
                    for p in (cand.content.parts if cand.content else None) or []:
                        if p.thought:
                            if p.text:
                                yield {"type": "thought", "text": p.text}
                            # 思考の署名(thought_signature)は、次の呼び出しに戻す必要がある
                            if p.thought_signature:
                                parts.append(p)
                            continue
                        parts.append(p)
                        if p.function_call:
                            calls.append(p.function_call)
                        elif p.text:
                            text += p.text
            if not calls:
                break
            # 返答(思考の署名を含む)をそのまま履歴に戻してから、道具の結果を足す
            contents.append(types.Content(role="model", parts=parts))
            results = []
            for call in calls:
                out, step = await asyncio.to_thread(run_tool, client, call.name or "", dict(call.args or {}), body)
                yield {"type": "step", "text": step}
                results.append(types.Part.from_function_response(name=call.name or "", response=out))
            contents.append(types.Content(role="user", parts=results))
    except Exception as e:  # noqa: BLE001 — Vertex AI のエラーは種類が多い。原因をそのまま見せる
        yield {"type": "error", "error": f"{model} の呼び出しに失敗しました: {type(e).__name__}: {e}"[:2000]}
        return
    text = text.strip()
    if not text:
        yield {"type": "error", "error": "返答が空でした(安全フィルターなどで止まった可能性があります)"}
        return
    yield {"type": "final", **parse_reply(text), "context_chars": len(context)}


@router.post("/ai/chat")
async def chat(body: ChatIn) -> StreamingResponse:
    """会話の 1 回分。1 行 1 つの JSON(NDJSON)で、起きた順に返す。考えている間も、15 秒ごとに合図を送る
    (中継(Jupyter のプロキシ)が、黙っている接続を切らないように。画面も「止まっていない」と分かる)"""

    async def gen() -> AsyncIterator[bytes]:
        events = chat_events(body).__aiter__()
        pending = asyncio.ensure_future(events.__anext__())
        while True:
            done, _ = await asyncio.wait({pending}, timeout=15)
            if not done:
                yield _line({"type": "ping"})
                continue
            try:
                ev = pending.result()
            except StopAsyncIteration:
                return
            yield _line(ev)
            pending = asyncio.ensure_future(events.__anext__())

    # X-Accel-Buffering: 途中の中継が、まとめて送らないように
    return StreamingResponse(gen(), media_type="application/x-ndjson", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/ai/context")
async def context_preview(body: ChatIn) -> dict[str, Any]:
    """Gemini に渡す前提を、そのまま返す(画面の「前提を見る・コピー」。DEVTOOLS.md の 3.1 ③)"""
    try:
        return {"ok": True, "context": (await _context(body))[0]}
    except Exception as e:  # noqa: BLE001
        return _error(e)
