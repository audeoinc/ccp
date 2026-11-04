"""データの入口の差し込み口(docs/ARCHITECTURE.md の 0.5 章)。

受け持つのは、次の 3 つだけ。確かめ(bq_validate)・DB への書き込み・いつ読むか(bq_import)は、この外にあり、どの置き先でも同じ。
いまのアダプターは BigQuery(bq.BigQuerySource)の 1 つ。別の置き先(Databricks など)に移ると決まったら、
この形のアダプターを足し、tests/test_contract_datasource.py に組み立てを 1 つ足して、open() で選ぶ。
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Protocol


class DataSource(Protocol):
    """場所(where)は、そのまま設定の値(BigQuery なら <プロジェクト>.<データセット>.<テーブルかビュー>)。読めなければ例外(理由は画面に出す)"""

    def columns(self, where: str) -> list[str]:
        """列の名前の一覧"""
        ...

    def last_updated(self, where: str, watch: str | None = None) -> datetime | None:
        """最後に更新された日時。分からない出力(ビューなど)は、更新を見る元の表(watch)の日時。それもなければ None"""
        ...

    def read_rows(self, where: str, columns: list[str]) -> list[dict[str, Any]]:
        """渡した列だけを、すべて読む。行の名前は小文字"""
        ...


def open() -> DataSource:  # noqa: A001 — datasource.open() と読むため
    """いまのアダプターを開く(つなぐので、スレッドで呼ぶ)"""
    from . import bq

    return bq.BigQuerySource(bq.client())
