"""運用用のコマンド。

  python -m ccp.cli migrate          テーブルを作る(なければ作り、足りない列は足す)
  python -m ccp.cli seed [--reset]   初期データ(server/seed.json)を入れる。--reset は、中身を消してから
  python -m ccp.cli counts           各テーブルの件数
  python -m ccp.cli check            動かす前の確認(設定・DB への接続・写真・画面のビルド。パスワードは出さない。何も変えない)
  python -m ccp.cli import-pack <ZIP> [--images <フォルダ>] [--add] [--yes]
                                     引っ越し用のパック(画面の ⚙ →「データと画像を書き出す」)を取り込む。
                                     DB の中身をパックの内容に置き換え、画像をフォルダ(既定: server/images)に展開する。
                                     --add は「足すだけ」: まだない行・ファイルだけを足し、いまの中身は変えない・消さない。
                                     --yes がなければ、件数を見せるだけで、何も変えない
  python -m ccp.cli import-metrics <CSV> [--yes]
                                     商品・カテゴリの週の指標の CSV(docs/METRICS_FORMAT.md)を取り込む。ファイルにある週 × 市場の行を置き換える。
                                     --yes がなければ、読めた件数と読めなかった行を見せるだけで、何も変えない
  python -m ccp.cli bq-check         BigQuery の出力を読み、値まで確かめる(キーの重複・空・範囲・SKU と SPU の結びつき。何も変えない)
  python -m ccp.cli bq-dummy [--dataset ccp_dummy] [--pack <ZIP>] [--touch-stock] [--yes]
                                     BigQuery に練習用のダミーデータ(元データに似せた表と、仕様の形のビュー)を作る(ccp/bq_dummy.py)。
                                     --pack は、商品をそのパック(本番の書き出し)から作る。本番で試すなら必ず付ける。
                                     --touch-stock は、在庫のスナップショットを 1 回分だけ足す(更新の検知を試す)
  python -m ccp.cli ranking-dummy [--yes]
                                     商品の販売順位のダミーを、DB の商品と配信から作る(ccp/ranking_dummy.py)。
                                     BigQuery から取り込んだ順位があれば、何もしない。--yes がなければ、件数を見せるだけ

接続先は、db.py の環境変数(DATABASE_URL)。
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

from sqlalchemy import text

from . import schema as sc
from .db import get_engine

SEED_PATH = Path(__file__).resolve().parent.parent / "seed.json"
DEFAULT_IMAGES = Path(__file__).resolve().parent.parent / "images"


async def migrate() -> None:
    engine = await get_engine()
    async with engine.begin() as conn:
        for stmt in sc.load().ddl():
            await conn.execute(text(stmt))
    print("テーブルを作成・更新しました")


async def seed(reset: bool) -> None:
    schema = sc.load()
    data = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    engine = await get_engine()
    async with engine.begin() as conn:
        order = schema.creation_order()
        if reset:
            for t in reversed(order):
                await conn.execute(text(f"DELETE FROM {t.pg}"))
        for t in order:
            rows = data.get(t.name, [])
            for rec in rows:
                values = t.to_db(rec)
                values["id"] = sc.coerce("uuid", rec["id"])
                cols = list(values)
                await conn.execute(
                    text(f"INSERT INTO {t.pg} ({', '.join(cols)}) VALUES ({', '.join(':' + c for c in cols)}) ON CONFLICT (id) DO NOTHING"),
                    values,
                )
            print(f"{t.pg}: {len(rows)} 件")


async def counts() -> None:
    engine = await get_engine()
    async with engine.connect() as conn:
        for t in sc.load().creation_order():
            n = (await conn.execute(text(f"SELECT count(*) FROM {t.pg}"))).scalar_one()
            print(f"{t.pg}: {n}")


async def import_metrics(path: Path, yes: bool) -> None:
    from .metrics import parse, save

    p = parse(path.read_text(encoding="utf-8-sig"))
    weeks = sorted({(r["week_start"], r["market"]) for r in p.rows})
    print(f"{'商品' if p.kind == 'product' else 'カテゴリ'}の指標: {len(p.rows)} 行(週 × 市場: {', '.join(f'{w} {m}' for w, m in weeks) or 'なし'})")
    for x in p.problems:
        print(f"  {x.line} 行目: {x.message}")
    if not p.rows:
        sys.exit(1)
    if not yes:
        print("確かめただけです。取り込むときは --yes を付けてください")
        return
    result = await save(p, path.name)
    print(f"取り込みました(置き換えた行 {result['replaced']}、入れた行 {result['saved']})")


async def import_pack(path: Path, images: Path, yes: bool, add: bool = False) -> None:
    from .pack import add_tables, read_pack, replace_tables

    data, files = read_pack(path)
    tables = data.get("tables", {})
    print(f"パック: {path.name}(書き出した日時 {data.get('exportedAt')})")
    for name, rows in tables.items():
        print(f"  {name}: {len(rows)} 件")
    print(f"  画像: {len(files)} 点")
    if data.get("missingImages"):
        print(f"  (書き出した環境で見つからなかった画像: {len(data['missingImages'])} 点)")
    if not yes:
        print()
        if add:
            print("確認だけです。まだない行・ファイルだけを足すときは --yes を付けて実行してください(いまの中身は変えません)")
        else:
            print("確認だけです。DB の中身を、このパックの内容に置き換えるときは --yes を付けて実行してください(いまの中身は消えます)")
        return
    written = 0
    for name, content in files:
        dest = images / Path(name).relative_to("images")
        # 足すだけのときは、すでにあるファイルは置き換えない
        if add and dest.exists():
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(content)
        written += 1
    print(f"画像・素材のファイルを {images} に {written} 点置きました")
    # テーブルがまだない・列が足りない環境でも取り込めるよう、先にテーブルを作る(何度実行してもよい)
    await migrate()
    if add:
        await add_tables(tables)
        print("足しました(すでにあった行・ファイルは、そのままです)")
    else:
        await replace_tables(tables)
    print()
    print(f"取り込みました。サーバーは、環境変数 ASSET_DIR={images} を付けて起動してください(画像をこのフォルダから配る)")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("migrate")
    s = sub.add_parser("seed")
    s.add_argument("--reset", action="store_true")
    sub.add_parser("counts")
    sub.add_parser("check")
    ip = sub.add_parser("import-pack")
    ip.add_argument("path", type=Path)
    ip.add_argument("--images", type=Path, default=DEFAULT_IMAGES)
    ip.add_argument("--yes", action="store_true")
    ip.add_argument("--add", action="store_true")
    im = sub.add_parser("import-metrics")
    im.add_argument("path", type=Path)
    im.add_argument("--yes", action="store_true")
    sub.add_parser("bq-check")
    bd = sub.add_parser("bq-dummy")
    bd.add_argument("--dataset", default="ccp_dummy")
    bd.add_argument("--location", default="asia-northeast1")
    bd.add_argument("--pack", type=Path, default=None)
    bd.add_argument("--touch-stock", action="store_true")
    bd.add_argument("--yes", action="store_true")
    ii = sub.add_parser("import-images")
    ii.add_argument("path", type=Path)
    ii.add_argument("--images", type=Path, default=DEFAULT_IMAGES)
    ii.add_argument("--yes", action="store_true")
    ii.add_argument("--main-to-master", action="store_true")
    rd = sub.add_parser("ranking-dummy")
    rd.add_argument("--yes", action="store_true")
    args = p.parse_args()
    if args.cmd == "migrate":
        asyncio.run(migrate())
    elif args.cmd == "seed":
        asyncio.run(seed(args.reset))
    elif args.cmd == "check":
        from .check import run

        sys.exit(1 if run() else 0)
    elif args.cmd == "bq-check":
        from .bq_validate import run_cli

        sys.exit(1 if run_cli() else 0)
    elif args.cmd == "bq-dummy":
        from .bq_dummy import run as bq_dummy

        bq_dummy(args.dataset, args.location, args.yes, args.touch_stock, args.pack)
    elif args.cmd == "ranking-dummy":
        from .ranking_dummy import run as ranking_dummy

        asyncio.run(ranking_dummy(args.yes))
    elif args.cmd == "import-metrics":
        asyncio.run(import_metrics(args.path, args.yes))
    elif args.cmd == "import-images":
        from .product_images import import_images

        asyncio.run(import_images(args.path, args.images, args.yes, args.main_to_master))
    elif args.cmd == "import-pack":
        asyncio.run(import_pack(args.path, args.images, args.yes, args.add))
    else:
        asyncio.run(counts())


if __name__ == "__main__":
    main()
