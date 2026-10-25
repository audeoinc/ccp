"""Gemini と会話して SQL を組み立てる: 前提(system_instruction)・BigQuery を調べる道具・会話の 1 回分・使うモデル"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from typing import Any, AsyncIterator

from fastapi import APIRouter
from pydantic import BaseModel, Field

from .. import bq
from .bq_tools import profile_column, view_sources
from .common import DOCS, doc, dry_run, error_result, flatten_fields, max_bytes, only_select, plain, schema_columns
from .store import list_work_files, pinned_context, read_work_file, record_run, write_work_file

log = logging.getLogger("ccp.devtools")

router = APIRouter()


# ---- Gemini と SQL を組み立てる(DEVTOOLS.md の 4 章)
# 前提(system_instruction)は、毎回サーバーで組み立て直す。画面から送るのは、会話と「何を渡すか」の選択だけ。
# そうすると、表の列が変わっても、仕様の文書を直しても、次の発言から新しい前提で答える。
# Gemini には、BigQuery を調べる道具(関数)を渡す。「A データセットの ctlg を含む表から…」のように頼めば、
# Gemini が自分で表を探し、列を見て、SQL を確かめてから答える(利用者が表を 1 つずつ選んで渡さなくてよいように)。


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


ROLE = """あなたは BigQuery(GoogleSQL)の SQL を書く専門家です。利用者と会話しながら、SQL を組み立てます。
利用者は、Campaign Contents Planner(CCP)が読むデータ(下の「CCP が読む出力の仕様」の 6 つの出力)を、利用先の BigQuery の元の表から作ろうとしています。
元の表の列を、CCP のどの列に当てればよいかを一緒に考えるのも、あなたの仕事です。

BigQuery を調べる道具(関数)を使えます:
- list_datasets: プロジェクトのデータセットの一覧
- list_tables: データセットの表の一覧(name_contains で名前の一部で絞れる。大文字・小文字は区別しない)
- describe_table: 表の列・型・説明・パーティションと、先頭の数行
- dry_run: SQL を料金なしで確かめる(文法・列の有無・読む量)
- describe_view_sources: ビューが参照している元の表(ビューの中のビューもたどる)と、それぞれの列の定義
- profile_column: 列の中身(空の数・値の種類の数・最小・最大・よく出る値の上位)。CCP の列に当てる前に、値の形を確かめるのに使う
- run_select: SELECT を流して、先頭の行を見る(値の種類を確かめる SELECT DISTINCT など。読む量に上限がある)
推測で書かず、道具で表と列を確かめてから SQL を書いてください。SQL を返す前に、dry_run で通ることを確かめてください。
利用者が名前の一部しか言わないとき(「ctlg が含まれた表」など)は、list_tables で探してください。
ビューは、ビューの SQL(describe_table で見える)と、参照している元の表の列(describe_view_sources)をたどり、
CCP の列に合う元の列を探してください。ビューに出ていない列でも、元の表にあれば候補にし、どのビューに足せばよいか・元の表から直接読むべきかを考えてください。

最後の返答は、次の形の JSON だけにしてください(```json で囲まない):
{"reply": "利用者への返事(日本語。Markdown の見出し・箇条書き・**太字**・表を使ってよい。SQL はここに書かない)",
 "sqls": [{"title": "何の SQL か(短く。日本語)", "name": "保存するときのファイル名(title を英語にして短くしたもの。英小文字・数字・_ だけ。例: spu_from_ctlg)", "sql": "SQL の全文"}],
 "questions": ["決めきれなかったこと・利用者に確かめたいこと(なければ空の配列)"]}
sqls は、新しく書いた・直した SQL があるときだけ(なければ空の配列)。直すときも、部分ではなく、そのまま流せる全文。
値を確かめる SQL と、本番の SQL のように、いくつか出すときは並べる(利用者は 1 つずつ試す)。

決まり:
- 方言は GoogleSQL(BigQuery)。表は `プロジェクト.データセット.表` の形で、バッククォートで囲む
- 確かめた表と列だけを使う。ない列を推測で書かない(足りなければ、questions で聞く)
- CCP の列に当てるときは、仕様のとおりに AS で付け替える。当て方を表にして reply に書く(元の列 → CCP の列、変換、自信のなさ)
- 読む量を抑える(パーティションの列があれば、期間で絞る。SELECT * を避ける)
- 「いまの SQL」とエラーが渡されたら、まずエラーの原因を reply で短く説明し、直した全文を sql に入れる
- 「いつも渡すファイル」にコーディングルールがあれば、SQL はそれに必ず従う(名前の付け方・書き方・コメント など)。従えないところは reply で理由を書く
- 「いつも渡すファイル」に引き継ぎがあれば、その続きとして話す(決まったことを、もう一度聞かない)

作業ファイル(Workbench のフォルダ。利用者も画面で見られる)を使う道具もあります:
- list_files・read_file: 作業ファイルの一覧と中身
- save_file: 作業ファイルに保存する(.md / .sql / .txt / .csv)。利用者に「保存して」と頼まれたとき、引き継ぎを作るときに使う。
  同じ名前があると上書きするので、上書きしてよいか分からないときは、別の名前にする
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
    pinned = pinned_context()
    if pinned:
        parts.append(pinned)
    if client is not None:
        where = [f"- 接続しているプロジェクト(問い合わせを走らせるプロジェクト): `{client.project}`"]
        if body.dataset:
            where.append(f"- 画面で開いているデータセット: `{body.dataset}`")
        parts.append("## いまの接続\n\n" + "\n".join(where))
    parts.append("## CCP が読む出力の仕様(BIGQUERY_EXPORT.md)\n\n" + chapters(doc("BIGQUERY_EXPORT.md"), tuple(range(1, 20))))
    rules = chapters(doc("BIGQUERY_CONVERT.md"), (4,))
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
            sqls = [{"title": str(x.get("title") or ""), "name": str(x.get("name") or ""), "sql": str(x.get("sql") or "").strip()}
                    for x in (v.get("sqls") or []) if isinstance(x, dict)]
            # 1 つだけの形(sql)で返してきたときも受ける
            if isinstance(v.get("sql"), str) and v["sql"].strip():
                sqls.insert(0, {"title": "", "name": "", "sql": v["sql"].strip()})
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
        types.FunctionDeclaration(name="profile_column", description="列の中身を調べる(行数・空の数・値の種類の数・最小・最大・よく出る値の上位 20)。CCP の列に当てる前に、値の形を確かめるのに使う。その列を全件読む(読む量が多いときは止まる)",
                                  parameters=S(type=T.OBJECT, properties={"table": S(type=T.STRING, description="プロジェクト.データセット.表"), "column": S(type=T.STRING)}, required=["table", "column"])),
        types.FunctionDeclaration(name="list_files", description="作業ファイルの一覧(名前・大きさ・更新日時・いつも渡すか)",
                                  parameters=S(type=T.OBJECT, properties={})),
        types.FunctionDeclaration(name="read_file", description="作業ファイルの中身",
                                  parameters=S(type=T.OBJECT, properties={"name": S(type=T.STRING)}, required=["name"])),
        types.FunctionDeclaration(name="save_file", description="作業ファイルに保存する(.md / .sql / .txt / .csv)。同じ名前は上書き",
                                  parameters=S(type=T.OBJECT, properties={"name": S(type=T.STRING, description="ファイル名(例: 引き継ぎ_20261023.md、spu_from_ctlg.sql)"),
                                                                          "content": S(type=T.STRING)}, required=["name", "content"])),
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
        if name == "profile_column":
            ref = _qualify(c, str(args.get("table") or ""))
            col = str(args.get("column") or "")
            r = profile_column(c, ref, col, confirm=False)
            if r.get("needs_confirm"):
                return {"error": f"読む量が {r['bytes'] / 1024**3:.1f} GB あり、利用者の確かめが要ります。run_select で期間を絞って調べてください"}, f"列の中身を調べようとした({ref}.{col}。読む量が多いので止めた)"
            return r, f"列の中身を調べた({ref}.{col}、{(r.get('total') or 0):,} 行)"
        if name == "list_files":
            return {"files": list_work_files()}, "作業ファイルの一覧を見た"
        if name == "read_file":
            n = str(args.get("name") or "")
            return {"name": n, "content": read_work_file(n)}, f"作業ファイルを読んだ({n})"
        if name == "save_file":
            n = str(args.get("name") or "")
            existed = write_work_file(n, str(args.get("content") or ""))
            return {"saved": n, "overwritten": existed}, f"作業ファイルに保存した({n}{'。上書き' if existed else ''})"
        if name == "run_select":
            if not body.allow_run:
                return {"error": "利用者が、SQL を流すことを止めています。dry_run で確かめてください"}, "SELECT を流そうとした(止めてある)"
            sql = str(args.get("sql") or "")
            dry = dry_run(c, sql)
            if (why := only_select(dry.statement_type)) is not None:
                return {"error": why}, "SELECT 以外を流そうとした(止めた)"
            try:
                job = c.query(sql, job_config=bigquery.QueryJobConfig(maximum_bytes_billed=max_bytes()))
                it = job.result(max_results=TOOL_ROWS)
            except Exception as e:  # noqa: BLE001
                record_run("AI", sql, error=error_result(e)["error"])
                raise
            rows = [plain(dict(r.items())) for r in it]
            record_run("AI", sql, rows=it.total_rows, processed=job.total_bytes_processed, billed=job.total_bytes_billed)
            return ({"columns": schema_columns(it.schema), "rows": rows, "total_rows": it.total_rows},
                    f"SELECT を流した({it.total_rows or 0:,} 行、読んだ量 {job.total_bytes_processed or 0:,} バイト)")
        return {"error": f"知らない道具です: {name}"}, f"知らない道具 {name}"
    except Exception as e:  # noqa: BLE001 — エラーも Gemini に返して、直させる
        err = error_result(e)["error"]
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
        from .. import ai

        names: list[str] = []
        try:
            pager = await ai.get_client().aio.models.list(config={"query_base": True, "page_size": 200})
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
            from .. import ai

            try:
                await ai.get_client().aio.models.get(model=guess)
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


async def chat_events(body: ChatIn) -> AsyncIterator[dict[str, Any]]:
    """会話の 1 回分を、起きた順に返す(画面が、思考・調べたこと・返事を、届いたそばから出せるように)。
      {"type": "start", "model": …}       {"type": "thought", "text": …}(思考の要約。少しずつ届く)
      {"type": "step", "text": …}         {"type": "final", "reply": …, "sqls": […], "questions": […]}
      {"type": "error", "error": …}"""
    from google.genai import types

    from .. import ai

    if not body.messages or body.messages[-1].role != "user":
        yield {"type": "error", "error": "送る発言がありません"}
        return
    model = body.model or await default_model()
    level = (os.getenv("DEVTOOLS_THINKING") or "high").upper()
    yield {"type": "start", "model": model, "thinking": level.lower()}
    try:
        context, client = await _context(body)
    except Exception as e:  # noqa: BLE001
        yield {"type": "error", "error": error_result(e)["error"]}
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
            stream = await ai.get_client().aio.models.generate_content_stream(model=model, contents=contents, config=config)
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


@router.post("/ai/context")
async def context_preview(body: ChatIn) -> dict[str, Any]:
    """Gemini に渡す前提を、そのまま返す(画面の「前提を見る・コピー」。DEVTOOLS.md の 3.1 ③)"""
    try:
        return {"ok": True, "context": (await _context(body))[0]}
    except Exception as e:  # noqa: BLE001
        return error_result(e)
