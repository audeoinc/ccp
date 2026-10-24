"""素材(Creative Assets)のファイル。配信ごとに、マーケ担当などが制作に渡す参考の画像・資料を置く(表 card_assets。X58)。

  POST   /api/creative/files?name=<元のファイル名>   本文 = ファイルそのもの(Content-Type 付き)。保存して、置き場所の名前を返す
  GET    /api/creative/files/{stored}                ファイルを返す(?download=<名前> で、その名前でダウンロード)
  DELETE /api/creative/files/{stored}                ファイルを消す(表の行は、画面が表の窓口で消す)

置き場所は、商品画像と同じ考え方: ASSET_DIR があればそのフォルダ(<ASSET_DIR>/creative/<名前>。Workbench)、
なければバケット(ASSET_BUCKET / STATE_BUCKET。本番。非公開)の creative/<名前>。どちらもなければ server/images/creative(手元の開発)。
ファイルは Git に入れない(取引先の画像などが入りうるため)。サイト全体と同じ Basic 認証がかかる。
受け付けるのは、画像(SVG は、中に処理を書けるので除く)・PDF・Office のファイルで、1 つ 20MB まで。multipart を使わず、本文にファイルをそのまま載せる(依存を増やさないため)。
"""
from __future__ import annotations

import asyncio
import re
import uuid
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

from . import assets
from .data_api import fail, ok

router = APIRouter(prefix="/api/creative")

MAX_BYTES = 20 * 1024 * 1024
# 拡張子 → 種類。ここにないものは受け付けない
TYPES = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "webp": "image/webp",
    "pdf": "application/pdf",
    "doc": "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xls": "application/vnd.ms-excel",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "ppt": "application/vnd.ms-powerpoint",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}
# 保存する名前(uuid + 拡張子)。これ以外の名前では読まない・消さない
STORED = re.compile(r"^[0-9a-f]{32}\.[a-z0-9]{2,5}$")
KIND = "creative"


def local_dir() -> Path | None:
    """フォルダに置くときの場所(ASSET_DIR、なければバケットもないときの server/images)。バケットに置くときは None"""
    return assets.local_folder(KIND)


def ext_of(name: str) -> str:
    return name.rsplit(".", 1)[-1].lower() if "." in name else ""


# 置き場所の読み書きは、商品画像・メイン画像と同じ(assets.put / get / delete)
def save(stored: str, data: bytes, content_type: str) -> None:
    assets.put(KIND, stored, data, content_type)


def load(stored: str) -> bytes | None:
    found = assets.get(KIND, stored)
    return found[0] if found else None


def remove(stored: str) -> None:
    assets.delete(KIND, stored)


@router.post("/files")
async def upload(request: Request, name: str):
    ext = ext_of(name)
    if ext not in TYPES:
        return fail(400, f"このファイルの種類は添付できません({ext or '拡張子なし'})。画像・PDF・Office のファイルを選んでください", "bad_type")
    data = await request.body()
    if not data:
        return fail(400, "ファイルが空です", "empty")
    if len(data) > MAX_BYTES:
        return fail(400, "ファイルが大きすぎます(1 つ 20MB まで)", "too_large")
    stored = f"{uuid.uuid4().hex}.{ext}"
    await asyncio.to_thread(save, stored, data, TYPES[ext])
    return ok({"stored": stored, "size": len(data), "contentType": TYPES[ext]})


@router.get("/files/{stored}")
async def download(stored: str, download: str | None = None):
    if not STORED.match(stored):
        raise HTTPException(404)
    data = await asyncio.to_thread(load, stored)
    if data is None:
        raise HTTPException(404)
    headers = {"Cache-Control": "private, max-age=3600"}
    if download:
        headers["Content-Disposition"] = f"attachment; filename*=UTF-8''{quote(download)}"
    return Response(content=data, media_type=TYPES.get(ext_of(stored), "application/octet-stream"), headers=headers)


@router.delete("/files/{stored}")
async def delete(stored: str):
    if not STORED.match(stored):
        raise HTTPException(404)
    await asyncio.to_thread(remove, stored)
    return ok({"stored": stored})
