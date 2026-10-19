"""利用先の BigQuery(本番のデータ)への接続(バックログ B1)。設計は docs/BIGQUERY.md、出してもらう列は docs/BIGQUERY_EXPORT.md。

いまは「つながるか・出力の場所と列が仕様どおりか」を確かめるところまで(python -m ccp.cli check の「■ BigQuery」)。
取り込み(B2 以降)は、これを土台に足す。

接続は、Workbench のサービスアカウント(creds.py の get_credentials。Gemini と同じ)で行う。PostgreSQL のアカウントは使わない。
出力の場所(<プロジェクト>.<データセット>.<テーブルかビュー>)は、利用先の名前を含むので、コードにもリポジトリにも書かず、環境変数で渡す:
  BQ_SPU / BQ_SKU / BQ_SKU_STOCK / BQ_WEEKLY / BQ_FORECAST   5 つの出力(BIGQUERY_EXPORT.md の 2〜6 章)
  BQ_<名前>_WATCH   出力がビューのとき、更新を見る元のテーブル(ビューの最終更新の日時は、元のデータが変わっても変わらないため)
  BQ_PROJECT       問い合わせ(ジョブ)を走らせるプロジェクト。なければ GOOGLE_CLOUD_PROJECT
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from .creds import get_credentials


@dataclass(frozen=True)
class Output:
    """BigQuery から出してもらう出力 1 つ(BIGQUERY_EXPORT.md の 1 章)"""

    name: str
    env: str
    label: str
    # 必ずある列(空を許さない列と、キー)。足りなければ取り込めない
    required: tuple[str, ...]
    # あると使う列(なくても取り込める。足りなければ注意だけ出す)
    optional: tuple[str, ...] = ()


OUTPUTS: tuple[Output, ...] = (
    Output(
        "spu", "BQ_SPU", "SPU",
        ("market", "product_code", "name", "as_of"),
        ("category", "category_path", "gender", "season", "price", "description", "sales_trend", "units_4w", "revenue_4w", "revenue_yoy", "views_4w", "cvr_4w",
         "rating", "review_count", "last_review_at", "review_texts", "lift_hot", "lift_cold", "lift_rain", "hot_days", "cold_days", "rain_days", "weather_basis"),
    ),
    Output("sku", "BQ_SKU", "SKU", ("market", "sku_code", "product_code", "as_of"), ("color", "size", "length", "price", "units_4w")),
    Output("sku_stock", "BQ_SKU_STOCK", "SKU の在庫", ("market", "sku_code", "stock", "as_of")),
    Output("weekly", "BQ_WEEKLY", "週ごとの実績", ("market", "product_code", "week_start", "units", "revenue", "as_of"), ("stock",)),
    Output("forecast", "BQ_FORECAST", "天気予報", ("market", "date", "issued_at"), ("temp_max", "temp_min", "precip_prob", "weather")),
)


def location(o: Output) -> str | None:
    """出力の場所(設定がなければ None)。`project.dataset.table` の形。バッククォートは外す"""
    v = (os.getenv(o.env) or "").strip().strip("`")
    return v or None


def watch_location(o: Output) -> str | None:
    v = (os.getenv(f"{o.env}_WATCH") or "").strip().strip("`")
    return v or None


def configured() -> list[Output]:
    return [o for o in OUTPUTS if location(o)]


def job_project() -> str | None:
    return os.getenv("BQ_PROJECT") or os.getenv("GOOGLE_CLOUD_PROJECT") or None


def client() -> Any:
    """BigQuery のクライアント(パッケージ google-cloud-bigquery。requirements.txt)"""
    from google.cloud import bigquery

    return bigquery.Client(project=job_project(), credentials=get_credentials())


def account() -> str:
    """接続に使うアカウント(サービスアカウントのメールアドレスなど。分からなければ、認証の種類)"""
    creds = get_credentials()
    return getattr(creds, "service_account_email", None) or type(creds).__name__


@dataclass
class Inspection:
    """出力 1 つを確かめた結果"""

    output: Output
    where: str
    ok: bool = True
    kind: str = ""  # TABLE / VIEW / MATERIALIZED_VIEW など
    modified: datetime | None = None
    rows: int | None = None
    missing: list[str] = field(default_factory=list)
    missing_optional: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    error: str = ""


def compare_columns(o: Output, columns: list[str]) -> tuple[list[str], list[str]]:
    """仕様の列のうち、出力にない列(必須 / あると使う)を返す。名前の大文字・小文字は区別しない(BigQuery の列名は区別しないため)"""
    have = {c.lower() for c in columns}
    return [c for c in o.required if c not in have], [c for c in o.optional if c not in have]


def inspect(o: Output, bq: Any) -> Inspection:
    """出力の種類・最終更新・行数・列を確かめる。ビューは、問い合わせの試し(dry run。料金はかからない)で、読めるか・ジョブを走らせる権限があるかも確かめる"""
    where = location(o) or ""
    r = Inspection(o, where)
    try:
        t = bq.get_table(where)
    except Exception as e:  # noqa: BLE001 — 見つからない・権限がない など。原因をそのまま見せる
        r.ok, r.error = False, f"{type(e).__name__}: {e}"
        return r
    r.kind = getattr(t, "table_type", "") or ""
    r.modified = getattr(t, "modified", None)
    r.rows = getattr(t, "num_rows", None)
    r.missing, r.missing_optional = compare_columns(o, [f.name for f in (getattr(t, "schema", None) or [])])
    if r.missing:
        r.ok = False
    if r.kind != "TABLE":
        w = watch_location(o)
        if w:
            try:
                wt = bq.get_table(w)
                r.modified = getattr(wt, "modified", None)
                r.notes.append(f"更新は {w} の最終更新で見ます")
            except Exception as e:  # noqa: BLE001
                r.ok = False
                r.notes.append(f"{o.env}_WATCH={w} を読めません({type(e).__name__}: {e})")
        else:
            r.notes.append(f"ビューなので、最終更新の日時が元のデータの更新を表しません。{o.env}_WATCH に、更新を見る元のテーブルを設定してください")
        try:
            from google.cloud import bigquery

            cols = ", ".join(f"`{c}`" for c in o.required)
            bq.query(f"SELECT {cols} FROM `{where}`", job_config=bigquery.QueryJobConfig(dry_run=True, use_query_cache=False))
            r.notes.append("問い合わせの試し(dry run)が通りました")
        except Exception as e:  # noqa: BLE001 — ジョブを走らせる権限がない(BigQuery ジョブユーザー)など
            r.ok = False
            r.notes.append(f"問い合わせの試しに失敗しました({type(e).__name__}: {e})")
    return r
