"""だれが開いているか(バックログ U7 の下地。docs/APPROVAL.md の 6 章)。

ログインそのものは、サーバーの前に置く IAP(Identity-Aware Proxy)が行う。IAP は、通した依頼に見出し X-Goog-IAP-JWT-Assertion を付けるので、
ここでは、その JWT を Google の公開鍵で検証して、メールアドレスを取り出す(環境変数 CCP_IAP_AUDIENCE に、IAP の宛先を設定したときだけ。
X-Goog-Authenticated-User-Email は、検証なしでは信じない)。手元では CCP_DEV_USER_EMAIL で、その人がログインしたことにできる。
どちらもなければ None = ログインなし(これまでどおり、画面で「あなた」を選ぶ)。

  GET /api/me   ログインしている人(メールアドレス)と、それに当たるユーザー(users。なければ null)

メールアドレスが、本人を見分けるかぎ(users.email。大文字小文字は区別しない)。IAP を有効にする手順(ロードバランサ・OAuth の同意画面・
サーバーへの直接のアクセスを塞ぐ)は GCP の操作なので、人が行う。
"""
from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass
from typing import Any

from fastapi import APIRouter, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

log = logging.getLogger("ccp.identity")
router = APIRouter(prefix="/api")

IAP_CERTS_URL = "https://www.gstatic.com/iap/verify/public_key"
# ログインしているときだけ、管理者に限る表(ユーザー・承認グループ・メンバー・承認の決まり)
PEOPLE_TABLES = frozenset({"users", "approval_groups", "approval_group_members", "approval_rules"})


@dataclass(frozen=True)
class Identity:
    email: str
    # iap = IAP の JWT から / env = 手元の CCP_DEV_USER_EMAIL
    source: str


async def current_identity(request: Request) -> Identity | None:
    """ログインしている人のメールアドレス。IAP の JWT を検証できたときと、手元の環境変数のときだけ。失敗・設定なしは None"""
    audience = os.getenv("CCP_IAP_AUDIENCE")
    jwt = request.headers.get("x-goog-iap-jwt-assertion")
    if audience and jwt:
        try:
            from google.auth.transport import requests as greq
            from google.oauth2 import id_token

            claims = await asyncio.to_thread(id_token.verify_token, jwt, greq.Request(), audience=audience, certs_url=IAP_CERTS_URL)
        except Exception as e:  # noqa: BLE001 — 署名・有効期限・宛先の不一致は、すべて「ログインなし」として扱う(500 にしない)
            log.warning("IAP の JWT を検証できません: %s", e)
            return None
        email = str(claims.get("email") or "").strip().lower()
        return Identity(email, "iap") if email else None
    dev = os.getenv("CCP_DEV_USER_EMAIL", "").strip().lower()
    return Identity(dev, "env") if dev else None


async def find_user(conn: AsyncConnection, email: str) -> dict[str, Any] | None:
    """メールアドレスに当たる、有効なユーザー(users)"""
    row = (
        await conn.execute(text("SELECT id, name, email, role, status FROM users WHERE lower(email) = :e AND (status IS NULL OR status = 'active') ORDER BY created_on LIMIT 1"), {"e": email.lower()})
    ).mappings().first()
    return {"id": str(row["id"]), "name": row["name"], "email": row["email"], "role": row["role"] or "member"} if row else None


async def resolve_user(conn: AsyncConnection, request: Request) -> tuple[Identity | None, dict[str, Any] | None]:
    ident = await current_identity(request)
    return (ident, await find_user(conn, ident.email)) if ident else (None, None)


async def people_edit_denied(conn: AsyncConnection, request: Request, table: str) -> str | None:
    """ユーザー・承認グループなどの書き込みを、ログインしているときは管理者だけに限る。だめなら理由を返す(ログインなしは、だれでも可 = いまの運用)"""
    if table not in PEOPLE_TABLES:
        return None
    ident, user = await resolve_user(conn, request)
    if ident is None:
        return None
    if user is None:
        return f"ログインした {ident.email} は、ユーザーに登録されていません"
    if user.get("role") != "admin":
        return "ユーザー・承認グループ・承認の決まりを変えられるのは、管理者だけです"
    return None


@router.get("/me")
async def me(request: Request):
    from .data_api import db, ok, require_db

    await require_db()
    ident = await current_identity(request)
    if ident is None:
        return ok({"email": None, "source": None, "user": None})
    async with db() as conn:
        user = await find_user(conn, ident.email)
    return ok({"email": ident.email, "source": ident.source, "user": user})
