"""入口の認証の、OIDC のアダプター(W2。Entra ID の SSO。Google・Okta など、標準の OIDC の発行元なら同じ部品で動く)。

ログインは CCP の中で行う(認可コード + PKCE)。手前の機械(ロードバランサーなど)に任せないのは、置き先ごとに受け取り方が変わり、汎用にならないため
(docs/ARCHITECTURE.md の 0.5 章)。

  GET /auth/login?next=/…   発行元のログインの画面へ送る(戻ったら next へ)
  GET /auth/callback        発行元から戻る所(発行元に登録する「戻り先の URL」)
  GET /auth/logout          ログアウト(発行元にも、ログアウトの窓口があればそこへ)

ログインしたあとは、署名つきのクッキー(だれが・いつまで)だけで人を見分ける。サーバーに状態を持たないので、サーバーが 2 台以上でも切れない
(どのサーバーも同じ鍵で確かめられる)。鍵は CCP_SESSION_SECRET、なければクライアントシークレットから作る(設定を 1 つ減らすため。
シークレットを替えると、全員がログインし直しになるだけ)。

設定(すべて環境変数。秘密は秘密の置き場所から環境変数で渡す):
  OIDC_ISSUER          発行元。Entra なら https://login.microsoftonline.com/<テナント ID>/v2.0(common・organizations は使えない。テナントを決めるため)
  OIDC_CLIENT_ID       アプリの登録の、クライアント ID
  OIDC_CLIENT_SECRET   アプリの登録の、クライアントシークレット(秘密)
  OIDC_SCOPES          既定 "openid email profile"
  CCP_PUBLIC_URL       画面のアドレス(例 https://ccp.example.com)。なければ、届いた依頼から求める(手前の機械が X-Forwarded-Proto・Host を付けていれば、それで)
  CCP_SESSION_SECRET   クッキーの署名の鍵(なければ、クライアントシークレットから)
  CCP_SESSION_HOURS    ログインが続く長さ(既定 12 時間。使っていれば、半分を過ぎたところで延びる)
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response

log = logging.getLogger("ccp.oidc")
router = APIRouter(prefix="/auth")

SESSION_COOKIE = "ccp_session"
# ログインの途中(発行元へ行って戻るまで)の、state・nonce・PKCE の鍵。10 分で切れる
FLOW_COOKIE = "ccp_oidc"
FLOW_SECONDS = 600
DISCOVERY_TTL_S = 3600


@dataclass(frozen=True)
class Config:
    issuer: str
    client_id: str
    client_secret: str
    scopes: str
    public_url: str
    session_key: bytes
    session_seconds: int


def missing() -> list[str]:
    """OIDC に要るのに、ない環境変数"""
    return [k for k in ("OIDC_ISSUER", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET") if not os.getenv(k, "").strip()]


def config() -> Config | None:
    if missing():
        return None
    secret = os.environ["OIDC_CLIENT_SECRET"].strip()
    key = os.getenv("CCP_SESSION_SECRET", "").strip() or "ccp-session:" + secret
    try:
        hours = float(os.getenv("CCP_SESSION_HOURS") or 12)
    except ValueError:
        hours = 12.0
    return Config(
        issuer=os.environ["OIDC_ISSUER"].strip().rstrip("/"),
        client_id=os.environ["OIDC_CLIENT_ID"].strip(),
        client_secret=secret,
        scopes=os.getenv("OIDC_SCOPES", "").strip() or "openid email profile",
        public_url=os.getenv("CCP_PUBLIC_URL", "").strip().rstrip("/"),
        session_key=hashlib.sha256(key.encode()).digest(),
        session_seconds=max(300, int(hours * 3600)),
    )


# ---- 署名つきの値(クッキーの中身)。サーバーに状態を持たないため、中身と署名を一緒に持つ


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def sign(payload: dict[str, Any], key: bytes) -> str:
    body = _b64(json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode())
    return body + "." + _b64(hmac.new(key, body.encode(), hashlib.sha256).digest())


def unsign(token: str | None, key: bytes, now: float | None = None) -> dict[str, Any] | None:
    """署名が合い、期限内なら中身。壊れている・期限切れ・鍵が違うは None"""
    if not token or "." not in token:
        return None
    body, _, mac = token.rpartition(".")
    try:
        if not hmac.compare_digest(_unb64(mac), hmac.new(key, body.encode(), hashlib.sha256).digest()):
            return None
        data = json.loads(_unb64(body))
    except Exception:  # noqa: BLE001 — 壊れたクッキーは、ないのと同じ
        return None
    if not isinstance(data, dict) or float(data.get("exp") or 0) <= (now or time.time()):
        return None
    return data


def email_from_claims(claims: dict[str, Any]) -> str | None:
    """メールアドレス。Entra は email が空で、preferred_username・upn に入ることがあるので、順に見る(発行元の違いを、ここで吸収する)"""
    for k in ("email", "preferred_username", "upn"):
        v = str(claims.get(k) or "").strip().lower()
        if "@" in v:
            return v
    return None


def session_of(request: Request, cfg: Config | None = None) -> dict[str, Any] | None:
    """ログインしている人のクッキーの中身({email, name, exp})。なければ None"""
    cfg = cfg or config()
    if cfg is None:
        return None
    data = unsign(request.cookies.get(SESSION_COOKIE), cfg.session_key)
    return data if data and data.get("email") else None


def set_session(resp: Response, cfg: Config, email: str, name: str, secure: bool) -> None:
    exp = int(time.time()) + cfg.session_seconds
    resp.set_cookie(SESSION_COOKIE, sign({"email": email, "name": name, "exp": exp}, cfg.session_key), max_age=cfg.session_seconds, httponly=True, secure=secure, samesite="lax", path="/")


def renew_if_half(request: Request, resp: Response, cfg: Config, session: dict[str, Any]) -> None:
    """使っているあいだは切れないように、半分を過ぎたら延ばす(使っていない人は、期限で切れる)"""
    if float(session["exp"]) - time.time() < cfg.session_seconds / 2:
        set_session(resp, cfg, session["email"], str(session.get("name") or ""), base_url(request, cfg).startswith("https://"))


# ---- 発行元


def base_url(request: Request, cfg: Config | None = None) -> str:
    """画面のアドレス(戻り先の URL の元)。設定があればそれ、なければ届いた依頼から"""
    if cfg and cfg.public_url:
        return cfg.public_url
    proto = request.headers.get("x-forwarded-proto", "").split(",")[0].strip() or request.url.scheme
    host = request.headers.get("x-forwarded-host", "").split(",")[0].strip() or request.headers.get("host") or request.url.netloc
    return f"{proto}://{host}{request.scope.get('root_path', '')}".rstrip("/")


def redirect_uri(request: Request, cfg: Config) -> str:
    return base_url(request, cfg) + "/auth/callback"


_discovery: dict[str, tuple[float, dict[str, Any]]] = {}


def _get_json(url: str) -> dict[str, Any]:
    import requests

    r = requests.get(url, timeout=10)
    r.raise_for_status()
    return r.json()


async def discover(cfg: Config, fresh: bool = False) -> dict[str, Any]:
    """発行元の設定(.well-known/openid-configuration)。1 時間は使い回す"""
    hit = _discovery.get(cfg.issuer)
    if hit and not fresh and time.time() - hit[0] < DISCOVERY_TTL_S:
        return hit[1]
    doc = await asyncio.to_thread(_get_json, cfg.issuer + "/.well-known/openid-configuration")
    for k in ("authorization_endpoint", "token_endpoint"):
        if not doc.get(k):
            raise ValueError(f"発行元の設定に {k} がありません")
    _discovery[cfg.issuer] = (time.time(), doc)
    return doc


def _post_form(url: str, data: dict[str, str]) -> dict[str, Any]:
    import requests

    r = requests.post(url, data=data, timeout=15, headers={"Accept": "application/json"})
    try:
        body = r.json()
    except ValueError:
        body = {}
    if r.status_code >= 400:
        raise ValueError(str(body.get("error_description") or body.get("error") or f"HTTP {r.status_code}"))
    return body


def claims_of(id_token: str, cfg: Config, issuer: str, nonce: str, now: float | None = None) -> dict[str, Any]:
    """ID トークンの中身を確かめる(発行元・宛先・期限・nonce)。
    署名は確かめない: トークンの窓口から HTTPS で直に受け取ったものは、TLS で発行元を確かめたことになる(OIDC Core 3.1.3.7 の 6)。
    鍵の取得と暗号の部品(依存)を増やさないため"""
    try:
        claims = json.loads(_unb64(id_token.split(".")[1]))
    except Exception as e:  # noqa: BLE001
        raise ValueError("ID トークンを読めません") from e
    now = now or time.time()
    aud = claims.get("aud")
    if str(claims.get("iss") or "").rstrip("/") != issuer.rstrip("/"):
        raise ValueError(f"発行元が違います({claims.get('iss')})")
    if cfg.client_id not in (aud if isinstance(aud, list) else [aud]):
        raise ValueError("宛先(クライアント ID)が違います")
    if float(claims.get("exp") or 0) < now - 60:
        raise ValueError("ID トークンの期限が切れています")
    if not nonce or claims.get("nonce") != nonce:
        raise ValueError("nonce が合いません")
    return claims


def safe_next(nxt: str | None) -> str:
    """戻り先は、同じサイトの中の道だけ(ほかのサイトへ飛ばされないように)"""
    nxt = (nxt or "/").strip()
    return nxt if nxt.startswith("/") and not nxt.startswith("//") and "\\" not in nxt else "/"


def _page(title: str, body: str, status: int = 400) -> HTMLResponse:
    from html import escape

    return HTMLResponse(
        f'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>{escape(title)}</title>'
        f'<body style="font-family:system-ui,sans-serif;max-width:40em;margin:3em auto;padding:0 16px;line-height:1.7">'
        f"<h1 style=\"font-size:20px\">{escape(title)}</h1>{body}</body>",
        status_code=status,
    )


def _retry(request: Request) -> str:
    return f'<p><a href="{base_url(request, config())}/auth/login">もう一度ログインする / Sign in again</a></p>'


@router.get("/login")
async def login(request: Request, next: str = "/"):
    cfg = config()
    if cfg is None:
        return _page("ログインの設定が足りません / Sign-in is not configured", f"<p>足りない環境変数: {', '.join(missing())}</p>", 503)
    try:
        doc = await discover(cfg)
    except Exception as e:  # noqa: BLE001
        log.warning("発行元の設定を読めません(%s): %s", cfg.issuer, e)
        return _page("ログインの発行元に届きません / Cannot reach the sign-in provider", f"<p>OIDC_ISSUER: {cfg.issuer}</p>" + _retry(request), 502)
    state, nonce, verifier = secrets.token_urlsafe(24), secrets.token_urlsafe(24), secrets.token_urlsafe(48)
    challenge = _b64(hashlib.sha256(verifier.encode()).digest())
    query = urlencode(
        {
            "response_type": "code",
            "client_id": cfg.client_id,
            "redirect_uri": redirect_uri(request, cfg),
            "scope": cfg.scopes,
            "state": state,
            "nonce": nonce,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
    )
    resp = RedirectResponse(f"{doc['authorization_endpoint']}?{query}", status_code=302)
    flow = sign({"state": state, "nonce": nonce, "verifier": verifier, "next": safe_next(next), "exp": int(time.time()) + FLOW_SECONDS}, cfg.session_key)
    # 発行元から戻る依頼は、ほかのサイトからの移動なので、SameSite=Lax(GET の移動なら付く)にする
    resp.set_cookie(FLOW_COOKIE, flow, max_age=FLOW_SECONDS, httponly=True, secure=base_url(request, cfg).startswith("https://"), samesite="lax", path="/")
    return resp


@router.get("/callback")
async def callback(request: Request):
    cfg = config()
    if cfg is None:
        return _page("ログインの設定が足りません / Sign-in is not configured", f"<p>足りない環境変数: {', '.join(missing())}</p>", 503)
    q = request.query_params
    if q.get("error"):
        # 発行元が断った(アプリに割り当てられていない・同意がない など)。理由は発行元の文をそのまま見せる
        log.warning("ログインが断られました: %s %s", q.get("error"), q.get("error_description"))
        from html import escape

        return _page("ログインできませんでした / Sign-in failed", f"<p>{escape(q.get('error_description') or q.get('error') or '')}</p>" + _retry(request), 403)
    flow = unsign(request.cookies.get(FLOW_COOKIE), cfg.session_key)
    if not flow or not q.get("state") or not hmac.compare_digest(str(flow.get("state")), q.get("state", "")):
        return _page("ログインをやり直してください / Please sign in again", "<p>ログインの途中の情報が見つからないか、時間が切れました。</p>" + _retry(request))
    try:
        doc = await discover(cfg)
        tokens = await asyncio.to_thread(
            _post_form,
            doc["token_endpoint"],
            {
                "grant_type": "authorization_code",
                "code": q.get("code", ""),
                "redirect_uri": redirect_uri(request, cfg),
                "code_verifier": str(flow["verifier"]),
                "client_id": cfg.client_id,
                "client_secret": cfg.client_secret,
            },
        )
        claims = claims_of(str(tokens.get("id_token") or ""), cfg, str(doc.get("issuer") or cfg.issuer), str(flow["nonce"]))
    except Exception as e:  # noqa: BLE001 — どこで失敗しても、ログに理由を残して、やり直しの案内を出す
        log.warning("ログインを終えられません: %s", e)
        return _page("ログインできませんでした / Sign-in failed", f"<p>{e}</p>" + _retry(request))
    email = email_from_claims(claims)
    if not email:
        return _page("メールアドレスが分かりません / No email address", "<p>発行元が、メールアドレス(email・preferred_username・upn)を返しませんでした。アプリの登録で、email の項目を足してください。</p>", 403)
    resp = RedirectResponse(base_url(request, cfg) + str(flow.get("next") or "/"), status_code=302)
    set_session(resp, cfg, email, str(claims.get("name") or ""), base_url(request, cfg).startswith("https://"))
    resp.delete_cookie(FLOW_COOKIE, path="/")
    log.info("ログイン: %s", email)
    return resp


@router.get("/logout")
async def logout(request: Request):
    cfg = config()
    home = base_url(request, cfg) + "/"
    target = home
    if cfg is not None:
        try:
            end = (await discover(cfg)).get("end_session_endpoint")
        except Exception:  # noqa: BLE001 — 発行元に届かなくても、CCP からはログアウトする
            end = None
        if end:
            target = f"{end}?{urlencode({'post_logout_redirect_uri': home, 'client_id': cfg.client_id})}"
    resp = RedirectResponse(target, status_code=302)
    resp.delete_cookie(SESSION_COOKIE, path="/")
    return resp
