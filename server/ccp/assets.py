"""/img/{products|heroes|parts}/{ファイル名} — GCS のバケットにある、商品画像・ヒーロー画像・部品の画像(X59 ③)を配信する。

バケットは非公開(外部からは見えない)。サーバーが、実行サービスアカウントの権限で読んで返す。
画像のアクセスにも、サイト全体と同じ Basic 認証がかかる(同じサイトから読む画像には、ブラウザが認証情報を付ける)。
バケット名は、ASSET_BUCKET(なければ STATE_BUCKET)。画像は、バケットの images/<種類>/<名前> に置く。

ASSET_DIR があれば、バケットではなく、そのフォルダ(<ASSET_DIR>/<種類>/<名前>)から配る。
外にアクセスできない環境(利用先の Workbench など)で、引っ越し用のパック(ccp.pack)から展開した画像を使うため。

ファイルの置き場所(画像・部品の画像・素材のファイル)の読み書きは、ここの put / get / delete だけを通す
(これまでメイン画像・素材・部品がそれぞれ、フォルダかバケットかを分けて書いていた。2026-10-25 の整理 第 2 段)。
ASSET_DIR もバケットもないとき(手元の開発)は、server/images/<種類>/ に置く(/img からは配らない。素材は /api/creative が配る)。
"""
from __future__ import annotations

import asyncio
import os
import re
from pathlib import Path
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from .creds import get_credentials

GCS_API = "https://storage.googleapis.com"
KINDS = ("products", "heroes", "parts")
# 手元の開発(ASSET_DIR もバケットもない)で置くフォルダ
DEV_DIR = Path(__file__).resolve().parents[1] / "images"
NAME = re.compile(r"^[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$")

router = APIRouter()
_session: Any = None


def bucket() -> str:
    return os.getenv("ASSET_BUCKET") or os.getenv("STATE_BUCKET", "")


def asset_dir() -> Path | None:
    """画像を置いたフォルダ(ASSET_DIR)。なければ None(バケットから配る)"""
    d = os.getenv("ASSET_DIR")
    return Path(d) if d else None


CONTENT_TYPES = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}


def local_folder(kind: str) -> Path | None:
    """フォルダに置くときの場所(ASSET_DIR、なければバケットもないときの server/images)。バケットに置くときは None"""
    d = asset_dir()
    if d is not None:
        return d / kind
    if bucket():
        return None
    return DEV_DIR / kind


def put(kind: str, name: str, data: bytes, content_type: str) -> None:
    """ファイルを置く(同じ名前があれば上書き)"""
    d = local_folder(kind)
    if d is not None:
        d.mkdir(parents=True, exist_ok=True)
        (d / name).write_bytes(data)
        return
    put_object(object_name(kind, name), data, content_type)


def get(kind: str, name: str) -> tuple[bytes, str] | None:
    """ファイルを読む(中身と種類)。見つからなければ None"""
    d = local_folder(kind)
    if d is not None:
        path = d / name
        if not path.is_file():
            return None
        return path.read_bytes(), CONTENT_TYPES.get(name.rsplit(".", 1)[-1].lower(), "application/octet-stream")
    return _fetch(object_name(kind, name))


def delete(kind: str, name: str) -> None:
    """ファイルを消す(なければ何もしない)"""
    d = local_folder(kind)
    if d is not None:
        (d / name).unlink(missing_ok=True)
        return
    r = session().delete(f"{GCS_API}/storage/v1/b/{bucket()}/o/{quote(object_name(kind, name), safe='')}", timeout=30)
    if r.status_code not in (200, 204, 404):
        r.raise_for_status()


def read_image(kind: str, name: str) -> tuple[bytes, str] | None:
    """/img で配る画像を読む(ASSET_DIR があればフォルダから、なければバケットから)。どちらもなければ配らない(None)"""
    if asset_dir() is None and not bucket():
        return None
    return get(kind, name)


def session() -> Any:
    global _session
    if _session is None:
        from google.auth.transport.requests import AuthorizedSession

        _session = AuthorizedSession(get_credentials())
    return _session


def object_name(kind: str, name: str) -> str:
    """バケットの中の名前。素材(creative)だけは、はじめから images/ の外に置いている"""
    return f"{kind}/{name}" if kind == "creative" else f"images/{kind}/{name}"


def put_object(name: str, data: bytes, content_type: str) -> None:
    r = session().post(f"{GCS_API}/upload/storage/v1/b/{bucket()}/o?uploadType=media&name={quote(name, safe='')}", data=data, headers={"Content-Type": content_type}, timeout=60)
    r.raise_for_status()


def _fetch(name: str) -> tuple[bytes, str] | None:
    r = session().get(f"{GCS_API}/storage/v1/b/{bucket()}/o/{quote(name, safe='')}?alt=media", timeout=30)
    if r.status_code == 404:
        return None
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "image/jpeg")


@router.get("/img/{kind}/{name}")
async def image(kind: str, name: str):
    if kind not in KINDS or not NAME.match(name):
        raise HTTPException(404)
    found = await asyncio.to_thread(read_image, kind, name)
    if found is None:
        raise HTTPException(404)
    data, content_type = found
    return Response(content=data, media_type=content_type, headers={"Cache-Control": "private, max-age=3600"})
