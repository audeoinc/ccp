"""入口の認証の差し込み口と、だれが開いているか(バックログ U7。docs/APPROVAL.md の 6 章・docs/ARCHITECTURE.md の 0.5 章)。

差し込み口が受け持つのは 2 つだけ: 入ってよいか(admit)と、ログインした人のメールアドレス(current_identity。だれもいなければ None)。
アダプターは設定だけで選ぶ(CCP_AUTH。なければ、ある設定から: OIDC_ISSUER → oidc / APP_PASSWORD → basic / CCP_IAP_AUDIENCE → iap / なし → none)。
  oidc   CCP の中でログインする(Entra ID などの SSO。ccp/oidc.py)。人はログインのクッキーから
  basic  画面のパスワード(APP_PASSWORD)。人は分からない(下の IAP・手元の人があれば、それ)
  iap    手前の IAP がログインを行う。IAP が付ける見出し X-Goog-IAP-JWT-Assertion を、Google の公開鍵で検証して人を知る
         (CCP_IAP_AUDIENCE に IAP の宛先を設定したときだけ。X-Goog-Authenticated-User-Email は、検証なしでは信じない)
  none   守りなし。外から開ける状態で黙って動き出さないように、CCP_AUTH=none と書いたとき以外は、このサーバーの中(localhost)から直に届いた依頼だけを通す
         (中継(nginx・Jupyter など)を通った依頼と、外から届いた依頼には、設定の案内を返す。docs/ARCHITECTURE.md の 0 章の 1)
手元では CCP_DEV_USER_EMAIL で、その人がログインしたことにできる(oidc 以外)。人がいなければ、これまでどおり画面で「あなた」を選ぶ。

  GET /api/me   ログインしている人(メールアドレス)と、それに当たるユーザー(users。なければ null)

メールアドレスが、本人を見分けるかぎ(users.email。大文字小文字は区別しない)。IAP を有効にする手順(ロードバランサ・OAuth の同意画面・
サーバーへの直接のアクセスを塞ぐ)は GCP の操作なので、人が行う。
"""
from __future__ import annotations

import asyncio
import base64
from contextvars import ContextVar
import logging
import os
import secrets
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote, unquote

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, PlainTextResponse, RedirectResponse, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from . import oidc
from . import schema as sc

log = logging.getLogger("ccp.identity")
router = APIRouter(prefix="/api")

IAP_CERTS_URL = "https://www.gstatic.com/iap/verify/public_key"
# ログインしているときだけ、管理者に限る表(ユーザー・承認グループ・メンバー・承認の決まり)
PEOPLE_TABLES = frozenset({"users", "approval_groups", "approval_group_members", "approval_rules"})


@dataclass(frozen=True)
class Identity:
    email: str
    # oidc = CCP の中のログイン / iap = IAP の JWT から / env = 手元の CCP_DEV_USER_EMAIL
    source: str


AUTH_MODES = ("oidc", "basic", "iap", "none")
# 認証の確かめをしない道(死活確認・内部の呼び出し(呼ばれる側で、署名つきトークンを確かめる))
OPEN_PATHS = ("/ping",)
OPEN_PREFIXES = ("/internal/",)
# このサーバーの中からの依頼(testclient は、テストの部品が付ける名前。ネットワークの相手には付かない)
LOCAL_HOSTS = frozenset({"127.0.0.1", "::1", "localhost", "testclient"})
# 中継が付ける印。付いていれば、元の相手は外にいるかもしれない
FORWARD_HEADERS = ("forwarded", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-real-ip")


def auth_mode() -> str:
    """使うアダプター。CCP_AUTH があればそれ(知らない値もそのまま返し、admit が止めて案内する)。なければ、ある設定から"""
    explicit = os.getenv("CCP_AUTH", "").strip().lower()
    if explicit:
        return explicit
    if os.getenv("OIDC_ISSUER", "").strip():
        return "oidc"
    if os.getenv("APP_PASSWORD"):
        return "basic"
    if os.getenv("CCP_IAP_AUDIENCE"):
        return "iap"
    return "none"


def _loopback(host: str) -> bool:
    return host in LOCAL_HOSTS or host.startswith("127.")


def _forwarded(request: Request) -> bool:
    return any(request.headers.get(h) for h in FORWARD_HEADERS)


def _is_local(request: Request) -> bool:
    """このサーバーの中から、直に届いた依頼か。
    中継の印があれば、相手が localhost でも中からとみなさない(同じ機械の nginx・Jupyter などの中継は、相手が localhost に見えるが、
    その先は外かもしれない。黙って開くより、止めて CCP_AUTH=none かログインを書いてもらう。2026-11-03 利用者)"""
    if _forwarded(request):
        return False
    return _loopback(request.client.host if request.client else "")


def _blocked(request: Request, title: str, fix: str) -> Response:
    """止めて、直し方を返す(画面なら読める文、API なら JSON)"""
    log.warning("入口の認証: %s(%s)", title, request.url.path)
    if request.url.path.startswith("/api/"):
        return JSONResponse({"success": False, "error": {"message": f"{title}。{fix}", "code": "auth_setup"}}, status_code=503)
    return PlainTextResponse(f"{title}\n\n{fix}\n\n(docs/WORKBENCH.md の 7.1・python -m ccp.cli check)\n", status_code=503)


def _basic_ok(request: Request) -> bool:
    header = request.headers.get("authorization", "")
    if not header.startswith("Basic "):
        return False
    try:
        _, _, pw = base64.b64decode(header[6:]).decode("utf-8").partition(":")
        return secrets.compare_digest(pw.encode(), os.getenv("APP_PASSWORD", "").encode())
    except Exception:  # noqa: BLE001 — 壊れた認証ヘッダーは、不一致として扱う
        return False


def admit(request: Request) -> Response | None:
    """入ってよいか。よければ None、だめなら返す応答(ログインへ送る・パスワードを求める・設定の案内)"""
    path = request.url.path
    if path in OPEN_PATHS or path.startswith(OPEN_PREFIXES):
        return None
    mode = auth_mode()
    if mode == "oidc":
        if path.startswith("/auth/"):
            return None
        cfg = oidc.config()
        if cfg is None:
            return _blocked(request, "ログイン(OIDC)の設定が足りません", f"環境変数 {', '.join(oidc.missing())} を設定して、サーバーを起動し直してください")
        if oidc.session_of(request, cfg):
            return None
        if path.startswith("/api/"):
            # 画面は、この印(code=login)を見て、ログインし直しを案内する
            return JSONResponse({"success": False, "error": {"message": "ログインが切れました。ページを開き直して、ログインしてください", "code": "login"}}, status_code=401)
        nxt = path + (f"?{request.url.query}" if request.url.query else "")
        return RedirectResponse(f"{oidc.base_url(request, cfg)}/auth/login?next={quote(nxt)}", status_code=302)
    if mode == "basic":
        if not os.getenv("APP_PASSWORD"):
            return _blocked(request, "画面のパスワードの設定が足りません(CCP_AUTH=basic)", "環境変数 APP_PASSWORD を設定してください")
        if _basic_ok(request):
            return None
        return PlainTextResponse("Unauthorized", status_code=401, headers={"WWW-Authenticate": 'Basic realm="ccp"'})
    if mode == "iap":
        # ログインは手前の IAP が行う(通らない依頼は、ここまで届かない)
        return None
    if mode == "none":
        if os.getenv("CCP_AUTH", "").strip().lower() == "none" or _is_local(request):
            return None
        return _blocked(
            request,
            "入口の認証が設定されていないため、外と中継(nginx・Jupyter の /proxy/ など)からは開けません",
            "ログイン(OIDC_ISSUER・OIDC_CLIENT_ID・OIDC_CLIENT_SECRET)か、画面のパスワード(APP_PASSWORD)を設定してください。"
            "中継の手前でログインしている(Workbench の Jupyter の中継など)ので、CCP では守らないと決めたなら、CCP_AUTH=none を設定して、サーバーを起動し直してください",
        )
    return _blocked(request, f"CCP_AUTH の値({mode})が分かりません", f"{' / '.join(AUTH_MODES)} のどれかにしてください")


def after(request: Request, response: Response) -> None:
    """応答を返す前に。ログイン(OIDC)を使っているあいだは、ログインが切れないように延ばす"""
    if auth_mode() != "oidc":
        return
    cfg = oidc.config()
    if cfg and (session := oidc.session_of(request, cfg)):
        oidc.renew_if_half(request, response, cfg, session)


async def current_identity(request: Request) -> Identity | None:
    """ログインしている人のメールアドレス。ログイン(OIDC)・IAP の JWT を確かめられたときと、手元の環境変数のときだけ。失敗・設定なしは None"""
    if auth_mode() == "oidc":
        # CCP の中のログインを使うときは、手元の人(CCP_DEV_USER_EMAIL)で上書きしない
        session = oidc.session_of(request)
        return Identity(str(session["email"]), "oidc") if session else None
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


# 開発用の画面の依頼を出した人(ログインしていれば。実行の履歴に残すため。developer_denied が依頼のはじめに入れる)
request_email: ContextVar[str] = ContextVar("request_email", default="")


async def developer_denied(request: Request) -> str | None:
    """開発用の画面(/dev/・/api/dev/)を開けない理由(X103)。開けるなら None。
    ログインしていれば、開発者(users.is_developer)だけ。画面で隠すだけでなく、サーバーで断る(BigQuery の SQL も流せるため)。
    ログインがなければ None(画面のパスワード + CCP_DEVTOOLS=1 のいまの運用を止めない。代わりに健康診断が注意を出す)"""
    ident = await current_identity(request)
    request_email.set(ident.email if ident else "")
    if ident is None:
        return None
    from .data_api import db

    try:
        async with db() as conn:
            row = (
                await conn.execute(
                    text("SELECT is_developer FROM users WHERE lower(email) = :e AND (status IS NULL OR status = 'active') ORDER BY created_on LIMIT 1"),
                    {"e": ident.email.lower()},
                )
            ).first()
    except Exception as e:  # noqa: BLE001 — 確かめられなければ、開けない側に倒す
        log.warning("開発者かを確かめられません: %s", e)
        return "開発者かを確かめられません(データベースにつながりません)"
    if row and row[0]:
        return None
    return f"開発用の画面は、開発者だけが開けます({ident.email} は開発者ではありません。⚙ →「ユーザーと承認グループ」で、開発者の印を付けてもらってください)"


async def no_admin_yet(conn: AsyncConnection) -> bool:
    """管理する人(管理者か開発者)が、まだ 1 人もいない。
    ログインを入れたばかりの置き先で、だれもユーザーを足せない(最初の管理者を作れない)ことにならないように、そのあいだだけ、ログインした人に任せる"""
    row = (await conn.execute(text("SELECT 1 FROM users WHERE (role = 'admin' OR is_developer) AND (status IS NULL OR status = 'active') LIMIT 1"))).first()
    return row is None


async def people_edit_denied(conn: AsyncConnection, request: Request, table: str) -> str | None:
    """ユーザー・承認グループなどの書き込みを、ログインしているときは管理者だけに限る。だめなら理由を返す(ログインなしは、だれでも可 = いまの運用)"""
    if table not in PEOPLE_TABLES:
        return None
    ident, user = await resolve_user(conn, request)
    if ident is None:
        return None
    if user is not None and user.get("role") == "admin":
        return None
    if await no_admin_yet(conn):
        log.warning("管理者がまだいないので、%s に %s の書き込みを任せます(最初の管理者を作るため)", ident.email, table)
        return None
    if user is None:
        return f"ログインした {ident.email} は、ユーザーに登録されていません"
    return "ユーザー・承認グループ・承認の決まりを変えられるのは、管理者だけです"


async def admin_denied(conn: AsyncConnection, request: Request) -> str | None:
    """管理する人(役割が admin か、開発者 is_developer。画面の FeaturesManager の canEdit と同じ)だけに限る操作。だめなら理由を返す。
    ログインしていれば、その人で決める。ログインがなければ、画面が選んだ「あなた」(見出し x-ccp-actor-id。いまの運用と同じく、画面の選択を信じる)"""
    ident, user = await resolve_user(conn, request)
    if ident is not None:
        if user is None:
            if await no_admin_yet(conn):
                return None
            return f"ログインした {ident.email} は、ユーザーに登録されていません"
        uid = user["id"]
    else:
        uid = request.headers.get("x-ccp-actor-id", "").strip()
        if not uid:
            return "管理する人だけができます(右上で、管理する人を「あなた」に選んでください)"
        try:
            sc.coerce("uuid", uid)
        except sc.BadRequest:
            return "管理する人だけができます(「あなた」が見つかりません)"
    row = (await conn.execute(text("SELECT role, is_developer FROM users WHERE id = :id"), {"id": uid})).mappings().first()
    if not row or (row["role"] != "admin" and not row["is_developer"]):
        if ident is not None and await no_admin_yet(conn):
            return None
        return "管理する人(管理者か開発者)だけができます"
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


async def request_actor(conn: AsyncConnection, body: dict[str, Any], request: Request) -> dict[str, str]:
    """操作した人。ログインしていれば(U7)、その人(画面が送った「あなた」は見ない。なりすましを防ぐ)。
    ログインがなければ、画面が選んだ「あなた」(users の id と名前)。名前は、なければ x-ccp-actor の見出しから"""
    ident, user = await resolve_user(conn, request)
    if ident is not None:
        if user is None:
            raise sc.BadRequest(f"ログインした {ident.email} は、ユーザーに登録されていません(⚙ →「ユーザーと承認グループ」で足してください)")
        return {"id": user["id"], "name": str(user.get("name") or ident.email)[:100]}
    a = body.get("actor") or {}
    user_id = str(a.get("id") or "").strip()
    name = str(a.get("name") or unquote(request.headers.get("x-ccp-actor", ""))).strip()[:100]
    if not user_id:
        raise sc.BadRequest("「あなた」を選んでください(承認の依頼・承認には、ユーザーの選択が要ります)")
    sc.coerce("uuid", user_id)
    return {"id": user_id, "name": name}
