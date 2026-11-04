"""入口の認証の差し込み口(identity.py)の契約テストと、OIDC のアダプター(oidc.py)のテスト(W2。docs/ARCHITECTURE.md の 0.5 章)。

どのアダプターでも、同じ形で答えることを確かめる:
  ログインした人がいれば Identity(小文字のメールアドレス, アダプターの名前)、いなければ None。
  入ってよい依頼には admit が None、だめな依頼には応答を返す(500 にしない)。
発行元(Entra など)への通信は差し替える。

  cd server && python -m unittest discover tests
"""
from __future__ import annotations

import asyncio
import base64
import json
import os
import sys
import time
import unittest
from pathlib import Path
from unittest import mock
from urllib.parse import parse_qs, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI, Request  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from ccp import identity, oidc  # noqa: E402

ISSUER = "https://login.example.com/tenant-1/v2.0"
OIDC_ENV = {"OIDC_ISSUER": ISSUER, "OIDC_CLIENT_ID": "client-1", "OIDC_CLIENT_SECRET": "s3cret"}
DOC = {"issuer": ISSUER, "authorization_endpoint": "https://login.example.com/authorize", "token_endpoint": "https://login.example.com/token", "end_session_endpoint": "https://login.example.com/logout"}


def run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


def req(path: str = "/", headers: dict[str, str] | None = None, client: str = "10.0.0.5", cookies: dict[str, str] | None = None, server: str = "10.0.0.2") -> Request:
    h = [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]
    if cookies:
        h.append((b"cookie", "; ".join(f"{k}={v}" for k, v in cookies.items()).encode()))
    h.append((b"host", b"ccp.example.com"))
    return Request({"type": "http", "method": "GET", "path": path, "query_string": b"", "headers": h, "client": (client, 1234), "scheme": "https", "server": (server, 443), "root_path": ""})


def session_cookie(email: str = "Mika.Tanaka@Example.com", exp: float | None = None) -> dict[str, str]:
    cfg = oidc.config()
    assert cfg is not None
    return {oidc.SESSION_COOKIE: oidc.sign({"email": email.lower(), "name": "Mika", "exp": exp or time.time() + 3600}, cfg.session_key)}


def id_token(claims: dict) -> str:
    enc = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).rstrip(b"=").decode()  # noqa: E731
    return f"{enc({'alg': 'RS256'})}.{enc(claims)}.sig"


# ---- 契約: アダプターごとに「ログインした人がいる依頼」「いない依頼」と、そのときの答え


class Case:
    def __init__(self, name: str, env: dict[str, str], signed_in, anonymous, email: str, source: str, patch=None) -> None:
        self.name, self.env, self.signed_in, self.anonymous, self.email, self.source, self.patch = name, env, signed_in, anonymous, email, source, patch


def _iap_verify(jwt, _req, audience, certs_url):  # noqa: ANN001
    if jwt != "good":
        raise ValueError("bad")
    return {"email": "Ken.Sato@Example.com"}


CASES = [
    Case("oidc", OIDC_ENV, lambda: req("/api/x", cookies=session_cookie()), lambda: req("/api/x"), "mika.tanaka@example.com", "oidc"),
    Case(
        "iap",
        {"CCP_IAP_AUDIENCE": "/projects/1/global/backendServices/2"},
        lambda: req("/api/x", headers={"x-goog-iap-jwt-assertion": "good"}),
        lambda: req("/api/x", headers={"x-goog-iap-jwt-assertion": "forged"}),
        "ken.sato@example.com",
        "iap",
        patch=lambda: mock.patch("google.oauth2.id_token.verify_token", side_effect=_iap_verify),
    ),
    # Basic は人が分からない。人は手元の CCP_DEV_USER_EMAIL から(いなければ None)
    Case("basic", {"APP_PASSWORD": "pw", "CCP_DEV_USER_EMAIL": " Aya@Example.com "}, lambda: req("/api/x"), None, "aya@example.com", "env"),
    Case("none", {"CCP_DEV_USER_EMAIL": "Aya@Example.com"}, lambda: req("/api/x", client="127.0.0.1"), None, "aya@example.com", "env"),
]


class AuthPortContractTest(unittest.TestCase):
    def test_mode_follows_settings(self) -> None:
        for case in CASES:
            with self.subTest(case.name), mock.patch.dict(os.environ, case.env, clear=True):
                self.assertEqual(identity.auth_mode(), case.name)

    def test_signed_in_and_anonymous_have_the_same_shape(self) -> None:
        for case in CASES:
            with self.subTest(case.name), mock.patch.dict(os.environ, case.env, clear=True), (case.patch() if case.patch else mock.patch.dict({})):
                ident = run(identity.current_identity(case.signed_in()))
                self.assertIsInstance(ident, identity.Identity)
                self.assertEqual((ident.email, ident.source), (case.email, case.source))
                if case.anonymous:
                    self.assertIsNone(run(identity.current_identity(case.anonymous())))
            # 人の設定がなければ、どのアダプターでも None
            env = {k: v for k, v in case.env.items() if k != "CCP_DEV_USER_EMAIL"}
            with self.subTest(case.name + " nobody"), mock.patch.dict(os.environ, env, clear=True), (case.patch() if case.patch else mock.patch.dict({})):
                self.assertIsNone(run(identity.current_identity(req("/api/x", client="127.0.0.1"))))

    def test_admit_answers_without_errors(self) -> None:
        for case in CASES:
            with self.subTest(case.name), mock.patch.dict(os.environ, case.env, clear=True):
                # 死活確認と内部の呼び出しは、どのアダプターでも通す
                self.assertIsNone(identity.admit(req("/ping")))
                self.assertIsNone(identity.admit(req("/internal/run")))
                r = identity.admit(req("/api/x"))
                self.assertTrue(r is None or 300 <= r.status_code < 600)


class AdmitTest(unittest.TestCase):
    def test_oidc_sends_pages_to_login_and_api_gets_401(self) -> None:
        with mock.patch.dict(os.environ, OIDC_ENV, clear=True):
            page = identity.admit(req("/plan"))
            self.assertEqual(page.status_code, 302)
            self.assertEqual(page.headers["location"], "https://ccp.example.com/auth/login?next=/plan")
            api = identity.admit(req("/api/data/users"))
            self.assertEqual(api.status_code, 401)
            self.assertEqual(json.loads(api.body)["error"]["code"], "login")
            self.assertIsNone(identity.admit(req("/auth/callback")))
            self.assertIsNone(identity.admit(req("/api/x", cookies=session_cookie())))

    def test_oidc_rejects_expired_or_forged_session(self) -> None:
        with mock.patch.dict(os.environ, OIDC_ENV, clear=True):
            self.assertEqual(identity.admit(req("/api/x", cookies=session_cookie(exp=time.time() - 1))).status_code, 401)
            forged = session_cookie()
            forged[oidc.SESSION_COOKIE] = forged[oidc.SESSION_COOKIE][:-3] + "AAA"
            self.assertEqual(identity.admit(req("/api/x", cookies=forged)).status_code, 401)

    def test_oidc_without_secret_stops_with_guidance(self) -> None:
        with mock.patch.dict(os.environ, {"OIDC_ISSUER": ISSUER}, clear=True):
            r = identity.admit(req("/"))
            self.assertEqual(r.status_code, 503)
            self.assertIn("OIDC_CLIENT_ID", r.body.decode())

    def test_no_auth_is_local_only_unless_declared(self) -> None:
        # 外から開ける状態で黙って動き出さない(0 章の 1)
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertIsNone(identity.admit(req("/", client="127.0.0.1")))
            self.assertIsNone(identity.admit(req("/", client="::1")))
            blocked = identity.admit(req("/", client="203.0.113.9"))
            self.assertEqual(blocked.status_code, 503)
            self.assertEqual(identity.admit(req("/api/x", client="203.0.113.9")).status_code, 503)
        with mock.patch.dict(os.environ, {"CCP_AUTH": "none"}, clear=True):
            self.assertIsNone(identity.admit(req("/", client="203.0.113.9")))

    def test_no_auth_stops_requests_through_a_relay(self) -> None:
        # 同じ機械の nginx・Jupyter などの中継: 相手も待ち受けも localhost に見えるが、その先は外かもしれない(抜け道だった。2026-11-03)
        relayed = [
            {"x-forwarded-for": "203.0.113.9"},
            {"x-real-ip": "203.0.113.9"},
            {"forwarded": "for=203.0.113.9;proto=https"},
            {"x-forwarded-host": "ccp.example.com"},
            {"x-forwarded-proto": "https"},
        ]
        with mock.patch.dict(os.environ, {}, clear=True):
            for h in relayed:
                with self.subTest(h):
                    r = identity.admit(req("/", headers=h, client="127.0.0.1", server="127.0.0.1"))
                    self.assertIsNotNone(r)
                    self.assertEqual(r.status_code, 503)
                    self.assertIn("CCP_AUTH=none", r.body.decode())
                    self.assertEqual(identity.admit(req("/api/x", headers=h, client="127.0.0.1", server="127.0.0.1")).status_code, 503)
            # 中継の印がなければ、これまでどおり中から
            self.assertIsNone(identity.admit(req("/", client="127.0.0.1", server="127.0.0.1")))
        # 中継の手前でログインしていると決めた置き先(Workbench の Jupyter の中継など)は、CCP_AUTH=none で開く
        with mock.patch.dict(os.environ, {"CCP_AUTH": "none"}, clear=True):
            for h in relayed:
                self.assertIsNone(identity.admit(req("/", headers=h, client="127.0.0.1", server="127.0.0.1")))

    def test_basic(self) -> None:
        with mock.patch.dict(os.environ, {"APP_PASSWORD": "pw"}, clear=True):
            self.assertEqual(identity.admit(req("/")).status_code, 401)
            ok = "Basic " + base64.b64encode(b"any:pw").decode()
            self.assertIsNone(identity.admit(req("/", headers={"authorization": ok})))
            self.assertEqual(identity.admit(req("/", headers={"authorization": "Basic !!"})).status_code, 401)
        with mock.patch.dict(os.environ, {"CCP_AUTH": "basic"}, clear=True):
            self.assertEqual(identity.admit(req("/")).status_code, 503)

    def test_oidc_wins_over_password_and_unknown_mode_stops(self) -> None:
        with mock.patch.dict(os.environ, {**OIDC_ENV, "APP_PASSWORD": "pw"}, clear=True):
            self.assertEqual(identity.auth_mode(), "oidc")
        with mock.patch.dict(os.environ, {"CCP_AUTH": "saml"}, clear=True):
            self.assertEqual(identity.admit(req("/", client="127.0.0.1")).status_code, 503)


# ---- OIDC のアダプターの中身


class OidcPartsTest(unittest.TestCase):
    def test_sign_roundtrip_and_tamper(self) -> None:
        key = b"k" * 32
        tok = oidc.sign({"email": "a@x", "exp": time.time() + 10}, key)
        self.assertEqual(oidc.unsign(tok, key)["email"], "a@x")
        self.assertIsNone(oidc.unsign(tok, b"other" * 8))
        self.assertIsNone(oidc.unsign(tok + "x", key))
        self.assertIsNone(oidc.unsign(oidc.sign({"exp": time.time() - 1}, key), key))
        self.assertIsNone(oidc.unsign("garbage", key))
        self.assertIsNone(oidc.unsign(None, key))

    def test_two_servers_share_the_session(self) -> None:
        # サーバーに状態を持たないので、別のサーバー(設定を読み直した別のプロセス)でも、同じクッキーで通る
        with mock.patch.dict(os.environ, OIDC_ENV, clear=True):
            cookie = session_cookie()
        with mock.patch.dict(os.environ, OIDC_ENV, clear=True):
            self.assertEqual(oidc.session_of(req("/", cookies=cookie))["email"], "mika.tanaka@example.com")
        with mock.patch.dict(os.environ, {**OIDC_ENV, "CCP_SESSION_SECRET": "explicit"}, clear=True):
            self.assertIsNone(oidc.session_of(req("/", cookies=cookie)))

    def test_email_from_entra_claims(self) -> None:
        self.assertEqual(oidc.email_from_claims({"email": "A@X.jp"}), "a@x.jp")
        # Entra は email が空で、preferred_username・upn に入ることがある
        self.assertEqual(oidc.email_from_claims({"email": "", "preferred_username": "B@X.jp"}), "b@x.jp")
        self.assertEqual(oidc.email_from_claims({"preferred_username": "not-an-email", "upn": "C@X.jp"}), "c@x.jp")
        self.assertIsNone(oidc.email_from_claims({"name": "D"}))

    def test_claims_checks(self) -> None:
        with mock.patch.dict(os.environ, OIDC_ENV, clear=True):
            cfg = oidc.config()
        good = {"iss": ISSUER, "aud": "client-1", "exp": time.time() + 60, "nonce": "n1", "email": "a@x"}
        self.assertEqual(oidc.claims_of(id_token(good), cfg, ISSUER, "n1")["email"], "a@x")
        for bad in ({"iss": "https://evil/v2.0"}, {"aud": "other"}, {"exp": time.time() - 3600}, {"nonce": "n2"}):
            with self.subTest(bad), self.assertRaises(ValueError):
                oidc.claims_of(id_token({**good, **bad}), cfg, ISSUER, "n1")
        with self.assertRaises(ValueError):
            oidc.claims_of("not-a-token", cfg, ISSUER, "n1")

    def test_safe_next(self) -> None:
        self.assertEqual(oidc.safe_next("/plan?x=1"), "/plan?x=1")
        for bad in ("//evil.example", "https://evil.example", "/\\evil", "", None):
            self.assertEqual(oidc.safe_next(bad), "/")


class OidcFlowTest(unittest.TestCase):
    """ログインの往復(発行元への通信は差し替える)"""

    def setUp(self) -> None:
        app = FastAPI()
        app.include_router(oidc.router)

        @app.middleware("http")
        async def guard(request: Request, call_next):  # noqa: ANN001
            if (denied := identity.admit(request)) is not None:
                return denied
            response = await call_next(request)
            identity.after(request, response)
            return response

        @app.get("/api/who")
        async def who(request: Request):
            ident = await identity.current_identity(request)
            return {"email": ident.email if ident else None}

        self.env = mock.patch.dict(os.environ, {**OIDC_ENV, "CCP_PUBLIC_URL": "https://ccp.example.com"}, clear=True)
        self.env.start()
        self.addCleanup(self.env.stop)
        oidc._discovery.clear()
        self.addCleanup(oidc._discovery.clear)
        p = mock.patch.object(oidc, "_get_json", return_value=DOC)
        p.start()
        self.addCleanup(p.stop)
        self.client = TestClient(app, base_url="https://ccp.example.com")

    def _login(self, token_claims: dict | None = None) -> tuple:
        r = self.client.get("/auth/login", params={"next": "/plan"}, follow_redirects=False)
        self.assertEqual(r.status_code, 302)
        loc = urlsplit(r.headers["location"])
        q = {k: v[0] for k, v in parse_qs(loc.query).items()}
        self.assertEqual(f"{loc.scheme}://{loc.netloc}{loc.path}", DOC["authorization_endpoint"])
        self.assertEqual((q["client_id"], q["redirect_uri"], q["code_challenge_method"]), ("client-1", "https://ccp.example.com/auth/callback", "S256"))
        sent = {}

        def post(url, data):  # noqa: ANN001
            sent.update(data)
            claims = {"iss": ISSUER, "aud": "client-1", "exp": time.time() + 600, "nonce": q["nonce"], "preferred_username": "Mika.Tanaka@Example.com", "name": "Mika"}
            return {"id_token": id_token({**claims, **(token_claims or {})})}

        with mock.patch.object(oidc, "_post_form", side_effect=post):
            r2 = self.client.get("/auth/callback", params={"code": "c1", "state": q["state"]}, follow_redirects=False)
        return q, sent, r2

    def test_login_roundtrip(self) -> None:
        self.assertEqual(self.client.get("/api/who").status_code, 401)
        q, sent, r = self._login()
        self.assertEqual(r.status_code, 302, r.text)
        self.assertEqual(r.headers["location"], "https://ccp.example.com/plan")
        # PKCE: 送った鍵から、最初の code_challenge が作れる
        import hashlib

        self.assertEqual(oidc._b64(hashlib.sha256(sent["code_verifier"].encode()).digest()), q["code_challenge"])
        self.assertEqual(sent["code"], "c1")
        self.assertEqual(self.client.get("/api/who").json(), {"email": "mika.tanaka@example.com"})
        # 画面の「ログインが切れました」から、別のタブでログインし直したときに着く所(ログインの確かめの対象外)
        self.assertEqual(self.client.get("/auth/done").status_code, 200)
        out = self.client.get("/auth/logout", follow_redirects=False)
        self.assertTrue(out.headers["location"].startswith(DOC["end_session_endpoint"]))
        self.assertEqual(self.client.get("/api/who").status_code, 401)

    def test_wrong_state_or_nonce_does_not_sign_in(self) -> None:
        r = self.client.get("/auth/callback", params={"code": "c1", "state": "guess"}, follow_redirects=False)
        self.assertEqual(r.status_code, 400)
        _, _, r = self._login({"nonce": "replayed"})
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.client.get("/api/who").status_code, 401)

    def test_provider_error_is_shown(self) -> None:
        self.client.get("/auth/login", follow_redirects=False)
        r = self.client.get("/auth/callback", params={"error": "access_denied", "error_description": "not assigned"}, follow_redirects=False)
        self.assertEqual(r.status_code, 403)
        self.assertIn("not assigned", r.text)


if __name__ == "__main__":
    unittest.main()
