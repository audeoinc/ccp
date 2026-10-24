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
import os
import re
import tempfile
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
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


def file_refs(tables: dict[str, list[dict[str, Any]]]) -> list[tuple[str, str]]:
    """パックに入れるファイル(種類・名前): /img/… の画像と、素材の置き場所のファイル"""
    # 素材のファイル・URL の見本カードの画像(preview_image)と、ピンを書いたときの様子の画像(card_notes.anchor_image。X65 (b))。どちらも素材の置き場所にある
    refs = [(r, k) for r in tables.get("card_assets", []) for k in ("stored", "preview_image")] + [(r, "anchor_image") for r in tables.get("card_notes", [])]
    stored = sorted({str(r[k]) for r, k in refs if r.get(k) and creative.STORED.match(str(r[k]))})
    return [*image_refs(tables), *((creative.KIND, n) for n in stored)]


def _read_file(kind: str, name: str) -> bytes | None:
    if kind == creative.KIND:
        return creative.load(name)
    found = assets.read_image(kind, name)
    return found[0] if found else None


# 返すときに一度に読む大きさ
CHUNK = 1024 * 1024


def stream_file(path: str) -> Any:
    """ファイルを CHUNK ずつ返して、返し終えたら(途中で切れても)消す"""
    try:
        with open(path, "rb") as f:
            while data := f.read(CHUNK):
                yield data
    finally:
        os.unlink(path)


# 一度に読むファイルの数(バケットからの読み込みを待つ間に、ほかを読む)。読んだものから ZIP に書いて、手放す
READ_AHEAD = 8


def write_pack(out: Any, tables: dict[str, list[dict[str, Any]]], now: datetime) -> None:
    """パックの ZIP を out(ファイル)に書く。画像は、まとめてメモリに載せずに、読んだ順に書き込む
    (これまでは、すべての画像と ZIP の全体をメモリに持ってから返していて、画像が多いとサーバーのメモリの上限に当たりやすかった。
    2026-10-25 の整理 第 2 段)。足りなかったファイルは、data.json の missingImages に書く(data.json は、最後に入れる)"""
    refs = file_refs(tables)
    missing: list[str] = []
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z, ThreadPoolExecutor(READ_AHEAD) as pool:
        for start in range(0, len(refs), READ_AHEAD):
            batch = refs[start:start + READ_AHEAD]
            for (kind, name), data in zip(batch, pool.map(lambda r: _read_file(*r), batch)):
                if data is None:
                    missing.append(f"{kind}/{name}")
                    continue
                # 画像は、すでに圧縮されているので、縮めずに入れる(時間だけかかって、小さくならないため)
                z.writestr(zipfile.ZipInfo(f"images/{kind}/{name}", date_time=now.timetuple()[:6]), data, compress_type=zipfile.ZIP_STORED)
        meta = {"version": PACK_VERSION, "exportedAt": now.isoformat(), "counts": {k: len(v) for k, v in tables.items()}, "missingImages": missing}
        with z.open("data.json", "w") as f, io.TextIOWrapper(f, encoding="utf-8") as w:
            json.dump({**meta, "tables": tables}, w, ensure_ascii=False)


@router.get("/api/export")
async def export_pack() -> StreamingResponse:
    tables = await read_tables()
    now = datetime.now(timezone.utc)
    # ZIP は一時ファイルに書いて、少しずつ返す(返し終えたら消す)。
    # 大きさ(Content-Length)を付けずに、分けて送る(chunked)。大きさを付けて返すと、サーバーの置き場所によっては
    # 応答の大きさの上限(32MiB など)に当たって、500 になるため(2026-10-25、写真が多い環境で書き出しが失敗した)
    fd, tmp = tempfile.mkstemp(prefix="ccp-pack-", suffix=".zip")
    try:
        with os.fdopen(fd, "wb") as out:
            await asyncio.to_thread(write_pack, out, tables, now)
    except BaseException:
        os.unlink(tmp)
        raise
    filename = f"ccp-pack-{now.strftime('%Y%m%d-%H%M')}.zip"
    return StreamingResponse(stream_file(tmp), media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


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


# まとめて INSERT する行の数(1 回の往復で送る大きさを抑える)
BATCH = 500


def batches(values: Any) -> Any:
    """取り込む行を、列の並びが同じで続くものごとに、BATCH 行ずつまとめる(並びの順は変えない。同じ表の中の参照のため)"""
    cols: list[str] | None = None
    batch: list[dict[str, Any]] = []
    for v in values:
        keys = list(v)
        if batch and (keys != cols or len(batch) >= BATCH):
            yield cols, batch
            batch = []
        cols = keys
        batch.append(v)
    if batch:
        yield cols, batch


def newest_per_unique(t: sc.Table, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """一意の組(schema.json の unique)が同じ行が重なっていれば、新しい(変えた日時の遅い)1 行だけを残す。並びの順は変えない。
    一意の決まりを足す前に書き出したパックにも、重なった行がありうるため(そのままでは、置き換えの取り込みが止まる)"""
    for cols in t.unique:
        best: dict[tuple[str, ...], dict[str, Any]] = {}
        for r in rows:
            if any(r.get(c) is None for c in cols):
                continue  # 空の値は、一意の決まりの外(PostgreSQL と同じ)
            key = tuple(str(r[c]) for c in cols)
            old = best.get(key)
            if old is None or (str(old.get("modified_on") or ""), str(old["id"])) < (str(r.get("modified_on") or ""), str(r["id"])):
                best[key] = r
        kept = {id(r) for r in best.values()}
        rows = [r for r in rows if id(r) in kept or any(r.get(c) is None for c in cols)]
    return rows


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
            rows = newest_per_unique(t, tables.get(t.name, []))
            conflict = " ON CONFLICT (id) DO NOTHING" if keep else ""
            for cols, batch in batches(repo.import_values(t, rec) for rec in rows):
                await conn.execute(text(repo.insert_sql(t, cols, conflict)), batch)
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
