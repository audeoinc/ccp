"""/img/{products|heroes}/{ファイル名} — GCS のバケットにある、商品画像・ヒーロー画像を配信する。

バケットは非公開(外部からは見えない)。サーバーが、実行サービスアカウントの権限で読んで返す。
画像のアクセスにも、サイト全体と同じ Basic 認証がかかる(同じサイトから読む画像には、ブラウザが認証情報を付ける)。
バケット名は、ASSET_BUCKET(なければ STATE_BUCKET)。画像は、バケットの images/<種類>/<名前> に置く。

ASSET_DIR があれば、バケットではなく、そのフォルダ(<ASSET_DIR>/<種類>/<名前>)から配る。
外にアクセスできない環境(クライアントの Workbench など)で、引っ越し用のパック(ccp.pack)から展開した画像を使うため。
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
KINDS = ("products", "heroes")
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


def read_image(kind: str, name: str) -> tuple[bytes, str] | None:
    """画像を読む(ASSET_DIR があればフォルダから、なければバケットから)。見つからなければ None"""
    d = asset_dir()
    if d is not None:
        path = d / kind / name
        if not path.is_file():
            return None
        return path.read_bytes(), CONTENT_TYPES.get(name.rsplit(".", 1)[-1].lower(), "application/octet-stream")
    if not bucket():
        return None
    return _fetch(object_name(kind, name))


def session() -> Any:
    global _session
    if _session is None:
        from google.auth.transport.requests import AuthorizedSession

        _session = AuthorizedSession(get_credentials())
    return _session


def object_name(kind: str, name: str) -> str:
    return f"images/{kind}/{name}"


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
