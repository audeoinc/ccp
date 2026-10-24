"""引っ越し用のパック: この環境の、すべてのデータと画像を 1 つの ZIP に書き出し、別の環境で取り込む。

外にアクセスできない環境(利用先の Vertex AI Workbench など)に、本番と同じデータ・画像を持ち込むため。
  書き出し: 画面の ⚙ →「データと画像を書き出す」(GET /api/export)。ブラウザで ZIP をダウンロードする
  取り込み: python -m ccp.cli import-pack <ZIP> --yes(DB の中身を置き換え、画像をフォルダに展開する)

取り込みには 2 つある:
  置き換え(既定)   DB の中身を、パックの内容に置き換える(いまの中身は消える)
  足すだけ(--add)  まだない行(id で見る)だけを足す。すでにある行は、中身が違っても変えない。消さない。
                    画像・素材のファイルも、まだないものだけを置く(Workbench で作業した内容を残したまま、本番で作った見本などを持ち込むため。X58)

ZIP の中身:
  data.json                 {"version": 2, "exportedAt": ..., "tables": {テーブル名: [行, ...]}}
                            (版 1 は、2026-10-16 より前の形。以前の名前(cr854_…)と選択肢の数。取り込むときに、いまの形に直す)
  images/<種類>/<ファイル名>  商品(products)・ヒーロー画像(heroes)・部品の画像(parts)の画像。DB の画像 URL(/img/<種類>/<名前>)のもの
  images/creative/<名前>    素材(Creative Assets。表 card_assets)のファイル(ccp/creative.py。取り込み先のフォルダの creative/ が、そのまま置き場所になる)
"""
from __future__ import annotations

import asyncio
import io
import json
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy import text

from . import assets, creative, repo, schema as sc
from .data_api import db, require_db

PACK_VERSION = 2
IMG_URL = re.compile(r"^/img/(products|heroes|parts)/([A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp))$")

router = APIRouter(dependencies=[Depends(require_db)])


async def read_tables() -> dict[str, list[dict[str, Any]]]:
    """すべてのテーブルの行を、画面と同じ形で読む"""
    out: dict[str, list[dict[str, Any]]] = {}
    async with db() as conn:
        for t in sc.load().creation_order():
            rows = (await conn.execute(text(f"SELECT * FROM {t.pg} ORDER BY created_on, id"))).mappings().all()
            out[t.name] = [t.to_api(dict(r)) for r in rows]
    return out


def image_refs(tables: dict[str, list[dict[str, Any]]]) -> list[tuple[str, str]]:
    """DB の画像 URL のうち、このサーバーが配っている画像(/img/…)の、種類とファイル名"""
    refs: set[tuple[str, str]] = set()
    # product_images: 商品ページから集めた画像(メインを含む)。パックで運ぶときも、画像のファイルを一緒に入れる
    for name in ("products", "hero_images", "part_images", "product_images"):
        for row in tables.get(name, []):
            m = IMG_URL.match(str(row.get("image_url") or ""))
            if m:
                refs.add((m.group(1), m.group(2)))
    return sorted(refs)


@router.get("/api/export")
async def export_pack() -> Response:
    tables = await read_tables()
    refs = image_refs(tables)
    # 画像は、同時に 8 枚ずつ読む(GCS からの読み込みを待つ間に、ほかの画像を読む)
    sem = asyncio.Semaphore(8)

    async def load(kind: str, name: str) -> tuple[str, str, bytes | None]:
        async with sem:
            found = await asyncio.to_thread(assets.read_image, kind, name)
        return kind, name, found[0] if found else None

    images = await asyncio.gather(*(load(k, n) for k, n in refs))

    # 素材(Creative Assets)のファイル
    async def load_creative(stored: str) -> tuple[str, str, bytes | None]:
        async with sem:
            data = await asyncio.to_thread(creative.load, stored)
        return creative.KIND, stored, data

    # 素材のファイル・URL の見本カードの画像(preview_image)と、ピンを書いたときの様子の画像(card_notes.anchor_image。X65 (b))。どちらも素材の置き場所にある
    refs = [(r, k) for r in tables.get("card_assets", []) for k in ("stored", "preview_image")] + [(r, "anchor_image") for r in tables.get("card_notes", [])]
    stored = sorted({str(r[k]) for r, k in refs if r.get(k) and creative.STORED.match(str(r[k]))})
    images = [*images, *await asyncio.gather(*(load_creative(n) for n in stored))]
    now = datetime.now(timezone.utc)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        meta = {"version": PACK_VERSION, "exportedAt": now.isoformat(), "counts": {k: len(v) for k, v in tables.items()}, "missingImages": [f"{k}/{n}" for k, n, b in images if b is None]}
        z.writestr("data.json", json.dumps({**meta, "tables": tables}, ensure_ascii=False))
        for kind, name, data in images:
            if data is not None:
                # 画像は、すでに圧縮されているので、縮めずに入れる(時間だけかかって、小さくならないため)
                z.writestr(zipfile.ZipInfo(f"images/{kind}/{name}", date_time=now.timetuple()[:6]), data, compress_type=zipfile.ZIP_STORED)
    filename = f"ccp-pack-{now.strftime('%Y%m%d-%H%M')}.zip"
    return Response(content=buf.getvalue(), media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


def read_pack(path: Path) -> tuple[dict[str, Any], list[tuple[str, bytes]]]:
    """パックを読む。返すのは、data.json の中身と、画像(ZIP の中の名前・中身)"""
    with zipfile.ZipFile(path) as z:
        data = json.loads(z.read("data.json").decode("utf-8"))
        if data.get("version") == 1:
            # 以前の形のパック: 名前と選択肢の値を、いまの形に直す
            data["tables"] = dict(sc.convert_legacy_rows(name, rows) for name, rows in data["tables"].items())
            data["version"] = PACK_VERSION
        if data.get("version") != PACK_VERSION:
            raise SystemExit(f"このパックの形式({data.get('version')})には対応していません(対応: 1、{PACK_VERSION})")
        images = [(n, z.read(n)) for n in z.namelist() if n.startswith("images/") and not n.endswith("/")]
    return data, images


# 入れ替えでも消さない表(その環境で書いたものを残す)。パックの行は、まだない行(id で見る)だけを足す。
# 開発へのリクエストは、使っている環境で書かれるので、本番のパックで入れ替えても残す(参照先の配信が消えると、配信への参照だけが空になる)
KEEP_ON_REPLACE = {"dev_requests", "dev_request_votes"}
# 人の設定(user_prefs。ST6)は残さない: ユーザー(users)と一緒に置き換わり、消えたユーザーの設定は参照先がなくなるため


async def replace_tables(tables: dict[str, list[dict[str, Any]]]) -> None:
    """DB の中身を、パックの内容に置き換える(作った日時・変えた日時も、元のまま残す)。KEEP_ON_REPLACE の表は消さずに足す"""
    from .db import cli_conn

    schema = sc.load()
    async with cli_conn() as conn:
        order = schema.creation_order()
        for t in reversed(order):
            if t.name in KEEP_ON_REPLACE:
                continue
            await conn.execute(text(f"DELETE FROM {t.pg}"))
        for t in order:
            keep = t.name in KEEP_ON_REPLACE
            rows = tables.get(t.name, [])
            for rec in rows:
                values = repo.import_values(t, rec)
                conflict = " ON CONFLICT (id) DO NOTHING" if keep else ""
                await conn.execute(text(repo.insert_sql(t, list(values), conflict)), values)
            print(f"{t.pg}: {len(rows)} 件" + ("(残して足した)" if keep else ""))


async def add_tables(tables: dict[str, list[dict[str, Any]]]) -> dict[str, tuple[int, int, int]]:
    """パックの行のうち、まだない行(id で見る)だけを足す。すでにある行は変えず、消さない(X58)。
    参照先がない・ほかの一意の決まりに当たる行は、その行だけ足さずに進める(1 行ずつ SAVEPOINT で試す)。
    返すのは、テーブルごとの(足した・すでにあった・足せなかった)の数"""
    from .db import cli_conn

    schema = sc.load()
    out: dict[str, tuple[int, int, int]] = {}
    async with cli_conn() as conn:
        for t in schema.creation_order():
            rows = tables.get(t.name, [])
            if not rows:
                continue
            have = {str(r[0]) for r in (await conn.execute(text(f"SELECT id FROM {t.pg}"))).all()}
            added = skipped = failed = 0
            for rec in rows:
                if str(rec["id"]) in have:
                    skipped += 1
                    continue
                values = repo.import_values(t, rec)
                try:
                    async with conn.begin_nested():
                        r = await conn.execute(text(repo.insert_sql(t, list(values), " ON CONFLICT DO NOTHING")), values)
                    if r.rowcount:
                        added += 1
                    else:
                        skipped += 1
                except Exception:  # noqa: BLE001 — 参照先がない行などは、その行だけ足さない
                    failed += 1
            out[t.pg] = (added, skipped, failed)
            print(f"{t.pg}: 足した {added} 件 / すでにあった {skipped} 件" + (f" / 足せなかった {failed} 件(参照先がない など)" if failed else ""))
    return out
