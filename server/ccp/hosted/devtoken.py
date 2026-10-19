"""手元(ローカル)の開発用の認証情報。環境変数 CCP_DEV_GCLOUD=1 のときだけ、
`gcloud auth print-access-token` の短期トークン(約 1 時間)を使う(ADC が期限切れでも使える)。本番では、この環境変数を設定しない。
"""
from __future__ import annotations

import os
import shutil
import subprocess

from google.auth.credentials import Credentials


def dev_credentials() -> Credentials | None:
    if os.getenv("CCP_DEV_GCLOUD") != "1":
        return None
    from google.oauth2.credentials import Credentials as UserCredentials

    gcloud = shutil.which("gcloud") or shutil.which("gcloud.cmd") or "gcloud"
    token = subprocess.run([gcloud, "auth", "print-access-token"], capture_output=True, text=True, check=True, shell=os.name == "nt").stdout.strip()
    return UserCredentials(token=token)
