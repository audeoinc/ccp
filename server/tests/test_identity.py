"""identity.py の、DB・IAP を使わない部分(だれがログインしているかの判定)の単体テスト。

  cd server && python -m unittest discover tests
"""
from __future__ import annotations

import asyncio
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ccp.identity import current_identity  # noqa: E402


class FakeRequest:
    def __init__(self, headers: dict[str, str] | None = None) -> None:
        self.headers = headers or {}


def run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


class CurrentIdentityTest(unittest.TestCase):
    def test_nothing_configured_is_anonymous(self) -> None:
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertIsNone(run(current_identity(FakeRequest())))

    def test_dev_email_signs_in(self) -> None:
        with mock.patch.dict(os.environ, {"CCP_DEV_USER_EMAIL": " Mika.Tanaka@Example.com "}, clear=True):
            ident = run(current_identity(FakeRequest()))
        self.assertIsNotNone(ident)
        self.assertEqual((ident.email, ident.source), ("mika.tanaka@example.com", "env"))

    def test_unverified_iap_header_is_not_trusted(self) -> None:
        # X-Goog-Authenticated-User-Email だけでは信じない(検証できる JWT と宛先の設定がないとき)
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertIsNone(run(current_identity(FakeRequest({"x-goog-authenticated-user-email": "accounts.google.com:x@example.com"}))))

    def test_bad_jwt_is_anonymous_not_error(self) -> None:
        with mock.patch.dict(os.environ, {"CCP_IAP_AUDIENCE": "/projects/1/global/backendServices/2"}, clear=True):
            self.assertIsNone(run(current_identity(FakeRequest({"x-goog-iap-jwt-assertion": "not.a.jwt"}))))


if __name__ == "__main__":
    unittest.main()
