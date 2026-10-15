"""引っ越し用のパック: この環境の、すべてのデータと画像を 1 つの ZIP に書き出し、別の環境で取り込む。

外にアクセスできない環境(クライアントの Vertex AI Workbench など)に、本番と同じデータ・画像を持ち込むため。
  書き出し: 画面の ⚙ →「データと画像を書き出す」(GET /api/export)。ブラウザで ZIP をダウンロードする
  取り込み: python -m ccp.cli import-pack <ZIP> --yes(DB の中身を置き換え、画像をフォルダに展開する)

ZIP の中身:
  data.json                 {"version": 1, "exportedAt": ..., "tables": {テーブル名(Dataverse の名前): [行, ...]}}
  images/<種類>/<ファイル名>  商品(products)・ヒーロー画像(heroes)の画像。DB の画像 URL(/img/<種類>/<名前>)のもの
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

from . import assets, schema as sc
from .data_api import db, require_db

PACK_VERSION = 1
IMG_URL = re.compile(r"^/img/(products|heroes)/([A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp))$")

router = APIRouter(dependencies=[Depends(require_db)])


async def read_tables() -> dict[str, list[dict[str, Any]]]:
    """すべてのテーブルの行を、画面と同じ形(Dataverse の名前)で読む"""
    out: dict[str, list[dict[str, Any]]] = {}
    async with db() as conn:
        for t in sc.load().creation_order():
            rows = (await conn.execute(text(f"SELECT * FROM {t.pg} ORDER BY created_on, id"))).mappings().all()
            out[t.dv] = [t.to_api(dict(r)) for r in rows]
    return out


def image_refs(tables: dict[str, list[dict[str, Any]]]) -> list[tuple[str, str]]:
    """DB の画像 URL のうち、このサーバーが配っている画像(/img/…)の、種類とファイル名"""
    refs: set[tuple[str, str]] = set()
    for name in ("cr854_products", "cr854_heroimages"):
        for row in tables.get(name, []):
            m = IMG_URL.match(str(row.get("cr854_imageurl") or ""))
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
        if data.get("version") != PACK_VERSION:
            raise SystemExit(f"このパックの形式({data.get('version')})には対応していません(対応: {PACK_VERSION})")
        images = [(n, z.read(n)) for n in z.namelist() if n.startswith("images/") and not n.endswith("/")]
    return data, images


async def replace_tables(tables: dict[str, list[dict[str, Any]]]) -> None:
    """DB の中身を、パックの内容に置き換える(作った日時・変えた日時も、元のまま残す)"""
    from .db import get_engine

    schema = sc.load()
    engine = await get_engine()
    async with engine.begin() as conn:
        order = schema.creation_order()
        for t in reversed(order):
            await conn.execute(text(f"DELETE FROM {t.pg}"))
        for t in order:
            rows = tables.get(t.dv, [])
            for rec in rows:
                values = t.to_db(rec)
                values["id"] = sc.coerce("uuid", rec[t.pk])
                # 作った日時は、確定後の変更・承認の履歴の並びに使うので、元のまま残す
                for dv, pg in (("createdon", "created_on"), ("modifiedon", "modified_on")):
                    if rec.get(dv):
                        values[pg] = sc.coerce("timestamptz", rec[dv])
                cols = list(values)
                await conn.execute(text(f"INSERT INTO {t.pg} ({', '.join(cols)}) VALUES ({', '.join(':' + c for c in cols)})"), values)
            print(f"{t.pg}: {len(rows)} 件")
