"""運用用のコマンド。

  python -m ccp.cli migrate          テーブルを作る(なければ作り、足りない列は足す)
  python -m ccp.cli seed [--reset]   初期データ(server/seed.json)を入れる。--reset は、中身を消してから
  python -m ccp.cli counts           各テーブルの件数
  python -m ccp.cli import-pack <ZIP> [--images <フォルダ>] [--yes]
                                     引っ越し用のパック(画面の ⚙ →「データと画像を書き出す」)を取り込む。
                                     DB の中身をパックの内容に置き換え、画像をフォルダ(既定: server/images)に展開する。
                                     --yes がなければ、件数を見せるだけで、何も変えない

接続先は、db.py の環境変数(CLOUD_SQL_INSTANCE / DB_PASSWORD など、または DATABASE_URL)。
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
            rows = data.get(t.dv, [])
            for rec in rows:
                values = t.to_db(rec)
                values["id"] = sc.coerce("uuid", rec[t.pk])
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


async def import_pack(path: Path, images: Path, yes: bool) -> None:
    from .pack import read_pack, replace_tables

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
        print("確認だけです。DB の中身を、このパックの内容に置き換えるときは --yes を付けて実行してください(いまの中身は消えます)")
        return
    for name, content in files:
        dest = images / Path(name).relative_to("images")
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(content)
    print(f"画像を {images} に展開しました")
    # テーブルがまだない・列が足りない環境でも取り込めるよう、先にテーブルを作る(何度実行してもよい)
    await migrate()
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
    ip = sub.add_parser("import-pack")
    ip.add_argument("path", type=Path)
    ip.add_argument("--images", type=Path, default=DEFAULT_IMAGES)
    ip.add_argument("--yes", action="store_true")
    args = p.parse_args()
    if args.cmd == "migrate":
        asyncio.run(migrate())
    elif args.cmd == "seed":
        asyncio.run(seed(args.reset))
    elif args.cmd == "import-pack":
        asyncio.run(import_pack(args.path, args.images, args.yes))
    else:
        asyncio.run(counts())


if __name__ == "__main__":
    main()
