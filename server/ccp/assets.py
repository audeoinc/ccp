"""/img/{products|heroes}/{ファイル名} — GCS のバケットにある、商品画像・ヒーロー画像を配信する。

バケットは非公開(外部からは見えない)。サーバーが、実行サービスアカウントの権限で読んで返す。
画像のアクセスにも、サイト全体と同じ Basic 認証がかかる(同じサイトから読む画像には、ブラウザが認証情報を付ける)。
バケット名は、ASSET_BUCKET(なければ STATE_BUCKET)。画像は、バケットの images/<種類>/<名前> に置く。
"""
from __future__ import annotations

import asyncio
import os
import re
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
    if kind not in KINDS or not NAME.match(name) or not bucket():
        raise HTTPException(404)
    found = await asyncio.to_thread(_fetch, object_name(kind, name))
    if found is None:
        raise HTTPException(404)
    data, content_type = found
    return Response(content=data, media_type=content_type, headers={"Cache-Control": "private, max-age=3600"})
