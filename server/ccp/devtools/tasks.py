"""時間のかかる処理を裏で走らせ、画面は受付番号で進み具合を聞きに来る"""
from __future__ import annotations

import asyncio
import time
import uuid
from typing import Any, AsyncIterator

from fastapi import APIRouter
from pydantic import BaseModel, Field

from .ai_sql import ChatIn, chat_events
from .bq_tools import ProfileIn, SqlIn, dryrun, profile, run
from .gcs_policy import ConvertIn, DocsIn, convert_events, gcs_extract
from .work import CheckIn, check

router = APIRouter()


# ---- 時間のかかる処理は、裏で走らせて、画面は進み具合を聞きに来る(2026-10-23)
# Workbench の画面は Jupyter の中継を通る。中継は、返り終わらない要求を 100〜120 秒ほどで打ち切る(524)。
# 流し続ける返事(NDJSON)も、中継が最後までためてから返すと、合図が届かない。
# そこで、要求はすぐ返し(受付番号)、画面が 1 秒ごとに「ここまでの出来事」を聞きに来る形にする。どの要求もすぐ終わる。
# 受付はこのプロセスのメモリに置く(Workbench はサーバー 1 つ。開発用の画面は本番では使わない)

TASK_KEEP = 3600  # 終わった受付を残す秒(画面が結果を取りに来るまで)
_tasks: dict[str, dict[str, Any]] = {}


def _sweep() -> None:
    now = time.monotonic()
    for k in [k for k, v in _tasks.items() if v["done"] and now - v["ended"] > TASK_KEEP]:
        _tasks.pop(k, None)


def start_events(events: AsyncIterator[dict[str, Any]]) -> str:
    """出来事を順に出す処理(会話・書き直し)を裏で走らせ、受付番号を返す"""
    _sweep()
    tid = uuid.uuid4().hex
    task = {"events": [], "done": False, "ended": 0.0}
    _tasks[tid] = task

    async def go() -> None:
        try:
            async for ev in events:
                task["events"].append(ev)
        except Exception as e:  # noqa: BLE001 — 途中で落ちても、画面にエラーとして届ける
            task["events"].append({"type": "error", "error": f"{type(e).__name__}: {e}"[:2000]})
        finally:
            task["done"] = True
            task["ended"] = time.monotonic()

    task["job"] = asyncio.ensure_future(go())
    return tid


def start_call(coro: Any) -> str:
    """結果を 1 つ返す処理(流す・答え合わせ・列を調べる など)を裏で走らせ、受付番号を返す"""

    async def events() -> AsyncIterator[dict[str, Any]]:
        yield {"type": "result", "result": await coro}

    return start_events(events())


@router.get("/tasks/{tid}")
async def task_status(tid: str, after: int = 0) -> dict[str, Any]:
    """受付の、after 番めより後の出来事と、終わったか"""
    t = _tasks.get(tid)
    if t is None:
        return {"ok": False, "error": "受付が見つかりません(サーバーを起動し直した、または 1 時間以上たった)"}
    return {"ok": True, "events": t["events"][after:], "next": len(t["events"]), "done": t["done"]}


@router.post("/tasks/chat")
async def task_chat(body: ChatIn) -> dict[str, Any]:
    return {"ok": True, "task": start_events(chat_events(body))}


@router.post("/tasks/policy-convert")
async def task_policy_convert(body: ConvertIn) -> dict[str, Any]:
    return {"ok": True, "task": start_events(convert_events(body))}


class CallIn(BaseModel):
    path: str
    body: dict[str, Any] = Field(default_factory=dict)


@router.post("/tasks/call")
async def task_call(c: CallIn) -> dict[str, Any]:
    """時間のかかる窓口を、裏で呼ぶ(中身は、それぞれの窓口と同じ)"""
    handlers: dict[str, tuple[Any, Any]] = {
        "bq/run": (SqlIn, run),
        "bq/dryrun": (SqlIn, dryrun),
        "check": (CheckIn, check),
        "bq/profile": (ProfileIn, profile),
        "gcs/extract": (DocsIn, gcs_extract),
    }
    if c.path not in handlers:
        return {"ok": False, "error": f"裏で呼べない窓口です: {c.path}"}
    model, fn = handlers[c.path]
    try:
        body = model(**c.body)
    except Exception as e:  # noqa: BLE001 — 入力の誤りは、すぐ返す
        return {"ok": False, "error": f"入力が正しくありません: {e}"[:1000]}
    return {"ok": True, "task": start_call(fn(body))}
