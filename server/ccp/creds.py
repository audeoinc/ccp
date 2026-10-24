"""Google Cloud の認証情報。サーバーを動かしているサービスアカウント(ADC)を使う。

手元の開発用の差し替え(ccp/hosted/devtoken.py)がある環境では、それを先に試す。
"""
from __future__ import annotations

import google.auth
from google.auth.credentials import Credentials
from . import optional

SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]


def get_credentials() -> Credentials:
    dev_credentials = optional.hosted("devtoken", "dev_credentials")
    if dev_credentials is not None and (creds := dev_credentials()) is not None:
        return creds
    creds, _ = google.auth.default(scopes=SCOPES)
    return creds
