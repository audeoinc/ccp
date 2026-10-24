"""DB が使える状態かどうか(DB を必要なときだけ起動する環境のための、差し込み口)。

DB を普段は止めておき、データの依頼が来たときに起動する環境では、その仕組みを ccp/hosted/ に置く。
ccp/hosted/ がない(または、その仕組みを有効にしていない)環境では、controller() が None を返し、何もしない。
DB につながらないときは、どの環境でも DbNotReady を投げる(画面には「準備中」か「つながらない理由」を返す)。
"""
from __future__ import annotations

from typing import Any, Protocol
from . import optional


class DbNotReady(RuntimeError):
    """DB が使えない(起動中・つながらないなど)。画面には、準備中として返す"""

    def __init__(self, state: str) -> None:
        super().__init__(state)
        self.state = state


class Controller(Protocol):
    async def ensure_running(self) -> None: ...
    async def touch(self) -> None: ...
    async def status(self, fresh: bool = False) -> str: ...


def controller() -> Any:
    """DB の起動・停止を受け持つものを返す。その仕組みがない環境では None"""
    db_controller = optional.hosted("", "db_controller")
    return db_controller() if db_controller is not None else None
