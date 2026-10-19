"""PostgreSQL への接続。

- DATABASE_URL=postgresql+asyncpg://user:pass@host/db で、PostgreSQL に直接つなぐ。
- DATABASE_URL がないときは、ccp/hosted/ の接続(ある環境だけ)を使う。
"""
from __future__ import annotations

import asyncio
import os

from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

_engine: AsyncEngine | None = None
_lock: asyncio.Lock | None = None


async def reset_engine() -> None:
    """接続に失敗したとき、次の接続を、作り直した状態から始める(DB の再起動前の接続情報を、引きずらないため)"""
    global _engine
    engine, _engine = _engine, None
    if engine is not None:
        try:
            await engine.dispose()
        except Exception:  # noqa: BLE001 — 後始末の失敗は無視する
            pass


async def get_engine() -> AsyncEngine:
    global _engine, _lock
    if _lock is None:
        _lock = asyncio.Lock()
    async with _lock:
        if _engine is not None:
            return _engine
        url = os.getenv("DATABASE_URL")
        if url:
            _engine = create_async_engine(url, pool_size=3, max_overflow=2, pool_pre_ping=True)
            return _engine

        try:
            from .hosted.connect import create_engine
        except ImportError:
            # KeyError にして、DB につながらない理由として画面に出す(data_api.db)
            raise KeyError("DATABASE_URL") from None
        _engine = create_engine()
        return _engine
