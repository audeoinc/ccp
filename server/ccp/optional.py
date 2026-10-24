"""環境ごとの追加(ccp/hosted/)を、あれば読み込む。

ccp/hosted/ は、ある環境だけにある(Workbench 版の ZIP には入らない)。ない環境では黙って使わない。
ただし、フォルダやファイルはあるのに読み込めない(中で使う依存が入っていない・書き間違い)ときは、
これまで黙って「ない」ことにしていたので、本番で依存が欠けても気づけなかった(2026-10-24 の整理)。
そのときは、理由をサーバーのログに 1 回だけ残す。
"""
from __future__ import annotations

import importlib
import logging
from functools import lru_cache
from typing import Any

log = logging.getLogger("ccp.optional")


@lru_cache(maxsize=None)
def hosted(module: str, attr: str) -> Any | None:
    """ccp/hosted/<module> の attr(module が空なら ccp/hosted そのもの)。なければ None"""
    full = f"{__package__}.hosted" + (f".{module}" if module else "")
    try:
        mod = importlib.import_module(full)
    except ModuleNotFoundError as e:
        # 読もうとしたもの(か、その親の ccp.hosted)がないだけなら、この環境では使わない
        if e.name and (full == e.name or full.startswith(e.name + ".")):
            return None
        log.warning("%s を読み込めませんでした(足りないもの: %s)。この環境の追加の機能は使いません", full, e.name)
        return None
    except Exception as e:  # noqa: BLE001 — 中の誤りでも、サーバーは起動させる(理由はログに)
        log.warning("%s を読み込めませんでした: %s: %s。この環境の追加の機能は使いません", full, type(e).__name__, e)
        return None
    value = getattr(mod, attr, None)
    if value is None:
        log.warning("%s に %s がありません", full, attr)
    return value
