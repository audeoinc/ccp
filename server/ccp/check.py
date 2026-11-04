"""動かす前の確認(python -m ccp.cli check)。

中身は設定の健康診断(health.diagnose)と 1 つ。⚙ →「設定の状態」と同じ行を、ターミナルに出す(言うことがずれないように)。
設定が読めているか・DB につながるか・AI を呼べるか・BigQuery の表が仕様どおりか・写真と画面があるかを、まとめて確かめる。
パスワードは表示しない。何も変えない(DB には SELECT だけ。BigQuery は、テーブルの情報を読むのと、問い合わせの試し(dry run。料金なし)だけ)。
"""
from __future__ import annotations

import asyncio

from . import health

OK, NG, WARN = "OK  ", "NG  ", "注意"
MARK = {"ok": OK, "missing": NG, "failed": NG, "warn": WARN}
AREAS = {
    "net": "外へのつなぎ",
    "db": "DB",
    "google": "Google の認証",
    "ai": "AI(Vertex AI の Gemini。出口があれば、その層)",
    "bq": "BigQuery(利用先の本番のデータ。docs/BIGQUERY.md)",
    "sync": "定期の取り込み",
    "assets": "写真",
    "guard": "画面の守り",
    "static": "画面",
}


def _line(mark: str, text: str) -> None:
    print(f"  [{mark}] {text}")


def _print(i: health.Item) -> None:
    _line(MARK[i.status], i.text)
    if i.fix and i.status != "ok":
        print(f"         → {i.fix}")


def check_outlet() -> int:
    """AI の出口(⚙ →「AI の設定」の URL)に届くかだけを見る(AI は呼ばない)。NG の数を返す"""
    i = health.outlet_reach()
    _print(i)
    return 1 if i.status in ("missing", "failed") else 0


async def _run() -> list[health.Item]:
    try:
        return await health.diagnose(full=True)
    finally:
        # コマンドは 1 回で終わるので、DB の接続を閉じてから抜ける(閉じないと終わりぎわに警告が出る)
        from . import db

        if db._engine is not None:
            await db._engine.dispose()
            db._engine = None


def run() -> int:
    """確認して、NG(足りない・確認に失敗)の数を返す"""
    items = asyncio.run(_run())
    area = None
    for i in items:
        if i.area != area:
            area = i.area
            print(f"■ {AREAS.get(area, area)}")
        _print(i)
    ng = sum(1 for i in items if i.status in ("missing", "failed"))
    print()
    print("問題は見つかりませんでした" if ng == 0 else f"NG が {ng} 件あります。上の [NG] の行の → を直してください(画面では ⚙ →「設定の状態」)")
    return ng
