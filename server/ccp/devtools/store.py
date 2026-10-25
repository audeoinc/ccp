"""作業フォルダ(server/devwork/)に置くもの: 作業の設定・AI との会話・作業ファイル・実行の履歴"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .. import bq
from . import common
from .common import cost_usd, error_result, max_bytes, now_iso, read_json, write_json, xlsx_text

log = logging.getLogger("ccp.devtools")

router = APIRouter()


# ---- 設定・状態

def _settings_path() -> Path:
    return common.DEVWORK / "settings.json"


@router.get("/status")
async def status() -> dict[str, Any]:
    try:
        account = await asyncio.to_thread(bq.account)
    except Exception as e:  # noqa: BLE001 — 認証がない環境(手元)でも、画面は開けるように
        account = f"(認証を読めません: {type(e).__name__})"
    return {"enabled": True, "project": bq.job_project(), "account": account, "devwork": str(common.DEVWORK), "max_gb": max_bytes() / 1024**3}


@router.get("/settings")
async def get_settings() -> dict[str, Any]:
    p = _settings_path()
    if not p.is_file():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


@router.put("/settings")
async def put_settings(body: dict[str, Any]) -> dict[str, Any]:
    common.DEVWORK.mkdir(parents=True, exist_ok=True)
    _settings_path().write_text(json.dumps(body, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"ok": True}


# ---- AI との会話(セッション)を残す: server/devwork/chats/<id>.json
# ブラウザに残すだけだと、別のブラウザ・PC から続きを話せないので、Workbench のフォルダに置く(Git には入らない)

CHAT_ID = re.compile(r"^[A-Za-z0-9_-]{6,64}$")


def _chat_path(cid: str) -> Path:
    if not CHAT_ID.match(cid):
        raise HTTPException(400, "会話の ID の形が違います")
    return common.DEVWORK / "chats" / f"{cid}.json"


def chat_title(messages: list[dict[str, Any]]) -> str:
    """名前がないときは、最初の発言の頭から付ける"""
    first = next((str(m.get("text") or "") for m in messages if m.get("role") == "user"), "")
    t = re.sub(r"\s+", " ", first).strip()
    return (t[:40] + "…") if len(t) > 40 else (t or "新しい会話")


@router.get("/chats")
async def chats() -> dict[str, Any]:
    """会話の一覧(新しく話した順)。中身は返さない"""
    out = []
    for p in (common.DEVWORK / "chats").glob("*.json"):
        v = read_json(p, None)
        if not isinstance(v, dict):
            continue
        msgs = v.get("messages") or []
        out.append({"id": p.stem, "title": v.get("title") or chat_title(msgs), "created": v.get("created"), "updated": v.get("updated"),
                    "count": len(msgs), "output": v.get("output") or ""})
    out.sort(key=lambda x: x.get("updated") or "", reverse=True)
    return {"ok": True, "chats": out}


@router.get("/chats/{cid}")
async def get_chat(cid: str) -> dict[str, Any]:
    v = read_json(_chat_path(cid), None)
    if not isinstance(v, dict):
        raise HTTPException(404, "その会話はありません")
    return {"ok": True, "id": cid, **v}


class ChatSaveIn(BaseModel):
    title: str = Field("", max_length=200)
    output: str = Field("", max_length=40)
    # 画面の形のまま(思考・調べたこと・SQL も含めて)残す
    messages: list[dict[str, Any]] = Field(default_factory=list, max_length=500)


@router.put("/chats/{cid}")
async def save_chat(cid: str, body: ChatSaveIn) -> dict[str, Any]:
    p = _chat_path(cid)
    old = read_json(p, {}) if p.is_file() else {}
    now = now_iso()
    write_json(p, {"title": body.title.strip() or old.get("title") or chat_title(body.messages), "output": body.output,
                    "created": old.get("created") or now, "updated": now, "messages": body.messages})
    return {"ok": True}


@router.delete("/chats/{cid}")
async def delete_chat(cid: str) -> dict[str, Any]:
    p = _chat_path(cid)
    if p.is_file():
        p.unlink()
    return {"ok": True}


# ---- 作業ファイル(server/devwork/files/): 引き継ぎ・SQL・コーディングルールなど。AI も道具で読み書きする
# 「いつも渡す」の印を付けたファイルは、会話の前提に毎回入れる(コーディングルールを守らせる・引き継ぎから続ける)

FILE_NAME = re.compile(r"^[^\\/:*?\"<>|\x00-\x1f]{1,120}\.(md|sql|txt|csv)$", re.I)
# いつも渡すファイルの、前提に入れる量の上限(全部で)
PINNED_MAX = 200_000


def _files_dir() -> Path:
    return common.DEVWORK / "files"


def _file_path(name: str) -> Path:
    name = name.strip()
    if not FILE_NAME.match(name) or name.startswith("."):
        raise HTTPException(400, f"ファイル名は .md / .sql / .txt / .csv で、/ や \\ を含めない名前にしてください: {name}")
    return _files_dir() / name


def pinned_names() -> list[str]:
    v = read_json(_files_dir() / ".pinned.json", [])
    return [x for x in v if isinstance(x, str)] if isinstance(v, list) else []


def list_work_files() -> list[dict[str, Any]]:
    pins = set(pinned_names())
    out = []
    for p in _files_dir().glob("*"):
        if p.is_file() and not p.name.startswith(".") and FILE_NAME.match(p.name):
            st = p.stat()
            out.append({"name": p.name, "size": st.st_size, "updated": datetime.fromtimestamp(st.st_mtime).astimezone().isoformat(timespec="seconds"),
                        "pinned": p.name in pins})
    out.sort(key=lambda x: x["updated"], reverse=True)
    return out


def read_work_file(name: str) -> str:
    p = _file_path(name)
    if not p.is_file():
        raise HTTPException(404, f"{name} はありません")
    return p.read_text(encoding="utf-8")


def write_work_file(name: str, content: str) -> bool:
    """保存する。もとからあったか(上書きしたか)を返す"""
    p = _file_path(name)
    existed = p.is_file()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")
    return existed


def pinned_context() -> str:
    """いつも渡すファイルを、前提の 1 節にする(量の上限を超えたら、後ろを切って、切ったと書く)"""
    parts = []
    used = 0
    for n in pinned_names():
        try:
            text = read_work_file(n)
        except Exception:  # noqa: BLE001 — 消されたファイルは飛ばす
            continue
        room = PINNED_MAX - used
        if room <= 0:
            parts.append(f"### {n}\n(量の上限を超えたので、渡していません)")
            continue
        cut = text[:room]
        used += len(cut)
        parts.append(f"### {n}\n\n{cut}" + ("\n\n(量の上限で、ここまで)" if len(text) > room else ""))
    if not parts:
        return ""
    return "## いつも渡すファイル(守ること・引き継ぎ。利用者が印を付けたもの。必ず読んで従う)\n\n" + "\n\n".join(parts)


@router.get("/files")
async def files() -> dict[str, Any]:
    return {"ok": True, "files": list_work_files()}


@router.get("/files/{name}")
async def get_file(name: str) -> dict[str, Any]:
    return {"ok": True, "name": name, "content": read_work_file(name), "pinned": name in pinned_names()}


class FileIn(BaseModel):
    content: str = Field("", max_length=2_000_000)


@router.put("/files/{name}")
async def put_file(name: str, body: FileIn) -> dict[str, Any]:
    existed = write_work_file(name, body.content)
    return {"ok": True, "overwritten": existed}


@router.delete("/files/{name}")
async def delete_file(name: str) -> dict[str, Any]:
    p = _file_path(name)
    if p.is_file():
        p.unlink()
    write_json(_files_dir() / ".pinned.json", [x for x in pinned_names() if x != name])
    return {"ok": True}


class PinIn(BaseModel):
    pinned: bool


@router.put("/files/{name}/pin")
async def pin_file(name: str, body: PinIn) -> dict[str, Any]:
    _file_path(name)
    pins = [x for x in pinned_names() if x != name]
    if body.pinned:
        pins.append(name)
    write_json(_files_dir() / ".pinned.json", pins)
    return {"ok": True}


class XlsxIn(BaseModel):
    # PC から上げた Excel(base64)。コーディングルールが Excel のときに、シートごとの表の形の Markdown にして置く
    data: str = Field(min_length=1, max_length=30_000_000)


@router.post("/files/{name}/from-xlsx")
async def file_from_xlsx(name: str, body: XlsxIn) -> dict[str, Any]:
    try:
        text = await asyncio.to_thread(xlsx_text, base64.b64decode(body.data))
    except Exception as e:  # noqa: BLE001
        return error_result(e)
    existed = write_work_file(name, text)
    return {"ok": True, "overwritten": existed, "chars": len(text)}


# ---- 実行の履歴(server/devwork/history.jsonl): 流した SQL を、画面からも AI からも、成功も失敗も残す
# 「さっき流したあの SQL」に戻れるように。1 行 1 件の JSON を足していく(ファイルが大きくなったら、古い半分を落とす)

HISTORY_MAX = 5000


def _history_path() -> Path:
    return common.DEVWORK / "history.jsonl"


def record_run(source: str, sql: str, rows: int | None = None, processed: int | None = None, billed: int | None = None,
               seconds: float | None = None, error: str = "") -> None:
    try:
        p = _history_path()
        p.parent.mkdir(parents=True, exist_ok=True)
        entry = {"at": now_iso(), "source": source, "sql": sql, "ok": not error, "rows": rows, "processed": processed, "billed": billed,
                 "cost_usd": cost_usd(billed), "seconds": seconds, "error": error[:2000]}
        with p.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False, default=str) + "\n")
        if p.stat().st_size > 20 * 1024**2:
            lines = p.read_text(encoding="utf-8").splitlines()[-HISTORY_MAX // 2:]
            p.write_text("\n".join(lines) + "\n", encoding="utf-8")
    except OSError:
        log.info("実行の履歴を残せませんでした", exc_info=True)


# 履歴のファイルの、数え終えた所(パス → (数え終えた大きさ, そこまでの改行の数, 先頭の数バイト))。
# id(何行めか)を出すのに、行の数が要る。足していくだけのファイルなので、増えた分だけを数える。
# 先頭が変わったら(古い半分を落として書き直した)、数え直す
_history_count: dict[str, tuple[int, int, bytes]] = {}
HEAD_BYTES = 64
BLOCK = 64 * 1024


def _newlines_before(p: Path, size: int) -> int:
    with p.open("rb") as f:
        head = f.read(HEAD_BYTES)
        done, n, was = _history_count.get(str(p), (0, 0, b""))
        if done > size or head[: len(was)] != was:
            done, n = 0, 0
        f.seek(done)
        while done < size:
            chunk = f.read(min(BLOCK * 16, size - done))
            if not chunk:
                break
            n += chunk.count(b"\n")
            done += len(chunk)
    _history_count[str(p)] = (done, n, head)
    return n


def _lines_from_end(p: Path, size: int) -> Any:
    """(何行めか, 行) を、後ろの行から順に返す(新しい順に読むとき、ファイルの全体を読まずに済むように)"""
    idx = _newlines_before(p, size)
    with p.open("rb") as f:
        pos, rest, last = size, b"", True
        while pos > 0:
            step = min(BLOCK, pos)
            pos -= step
            f.seek(pos)
            parts = (f.read(step) + rest).split(b"\n")
            rest = parts[0]
            for line in reversed(parts[1:]):
                # 最後の改行の後ろが空なのは、行ではない
                if not (last and not line):
                    yield idx, line
                last = False
                idx -= 1
        if rest or not last:
            yield idx, rest


def read_history(limit: int = 300, q: str = "") -> list[dict[str, Any]]:
    p = _history_path()
    if not p.is_file():
        return []
    out = []
    key = q.strip().lower()
    for i, line in _lines_from_end(p, p.stat().st_size):
        try:
            v = json.loads(line.decode("utf-8"))
        except ValueError:
            continue
        if not isinstance(v, dict):
            continue
        if key and key not in str(v.get("sql", "")).lower() and key not in str(v.get("error", "")).lower():
            continue
        v["id"] = i
        out.append(v)
        if len(out) >= limit:
            break
    return out


@router.get("/history")
async def history(q: str = "", limit: int = 300) -> dict[str, Any]:
    """実行の履歴(新しい順)。q で SQL・エラーの文字を探す"""
    return {"ok": True, "runs": read_history(max(1, min(limit, 2000)), q)}
