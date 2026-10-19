"""Cloud SQL への接続(Cloud SQL Python Connector 経由。認証・暗号化は、コネクタが行う)。

本番(Cloud Run): CLOUD_SQL_INSTANCE=<プロジェクト>:<リージョン>:<インスタンス> と DB_USER / DB_PASSWORD / DB_NAME。
DATABASE_URL があれば、こちらは使わない(ccp/db.py)。
"""
from __future__ import annotations

import asyncio
import os
from typing import Any

from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from ..creds import get_credentials


def create_engine() -> AsyncEngine:
    from google.cloud.sql.connector import Connector

    instance = os.environ["CLOUD_SQL_INSTANCE"]
    user, password, name = os.getenv("DB_USER", "ccp_app"), os.environ["DB_PASSWORD"], os.getenv("DB_NAME", "ccp")
    connector = Connector(loop=asyncio.get_running_loop(), refresh_strategy="lazy", credentials=get_credentials())

    async def creator() -> Any:
        return await connector.connect_async(instance, "asyncpg", user=user, password=password, db=name)

    return create_async_engine("postgresql+asyncpg://", async_creator=creator, pool_size=3, max_overflow=2, pool_pre_ping=True, pool_recycle=300)
