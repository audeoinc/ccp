"""PostgreSQL への接続。

- DATABASE_URL=postgresql+asyncpg://user:pass@host/db で、PostgreSQL に直接つなぐ。
- DATABASE_URL がないときは、ccp/hosted/ の接続(ある環境だけ)を使う。
"""
from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, create_async_engine
from . import dbready, optional

_engine: AsyncEngine | None = None
# CLI が、DB の起動を待つ長さ(秒)と、確かめる間隔
CLI_WAIT_S = 15 * 60
CLI_POLL_S = 15
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

        create_engine = optional.hosted("connect", "create_engine")
        if create_engine is None:
            # KeyError にして、DB につながらない理由として画面に出す(data_api.db)
            raise KeyError("DATABASE_URL")
        _engine = create_engine()
        return _engine


async def _wait_ready() -> None:
    """DB を必要なときだけ起動する環境(dbready)で、止まっていれば起動を頼んで、使えるまで待つ。その仕組みがなければ何もしない"""
    c = dbready.controller()
    if c is None:
        return
    loop = asyncio.get_running_loop()
    until = loop.time() + CLI_WAIT_S
    told = False
    while True:
        try:
            await c.ensure_running()
            await c.touch()
            return
        except dbready.DbNotReady:
            if loop.time() > until:
                raise
            if not told:
                print("データベースを起動しています。使えるようになるまで待ちます(10 分ほどかかることがあります)")
                told = True
            await asyncio.sleep(CLI_POLL_S)


@asynccontextmanager
async def cli_conn(write: bool = True) -> AsyncIterator[AsyncConnection]:
    """コマンド(ccp.cli・取り込みの道具)から DB を使う接続(write なら、1 つのトランザクション。抜けるときに確定する)。
    これまでコマンドごとに直接つないでいて、DB を必要なときだけ起動する環境では、止まっている DB につながらずに失敗していた
    (画面の窓口は data_api.db が起動を頼む)。コマンドも、ここで起動を待ってからつなぐ(2026-10-25 の整理 第 2 段)"""
    await _wait_ready()
    engine = await get_engine()
    if write:
        async with engine.begin() as conn:
            yield conn
    else:
        async with engine.connect() as conn:
            yield conn
