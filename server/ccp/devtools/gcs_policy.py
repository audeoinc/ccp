"""ポリシーの文書: GCS のフォルダを見る・文書を文字にする・Gemini で CCP の決まりの形(POLICY_FORMAT.md)に書き直す"""
from __future__ import annotations

import asyncio
import json
import os
import re
from datetime import datetime
from typing import Any, AsyncIterator

from fastapi import APIRouter
from pydantic import BaseModel, Field

from . import common
from .ai_sql import ChatTurn, default_model
from .common import decode_text, doc, error_result, xlsx_text

router = APIRouter()


# ---- ポリシーの文書(DEVTOOLS.md の 3.2): GCS の文書を、CCP の決まりの形(POLICY_FORMAT.md)に書き直す
# GCS は読むだけ。確かめ・取り込みは、既存の /api/policies/preview・/api/policies/import を画面から呼ぶ(取り込みと同じ読み分け)

GCS = "https://storage.googleapis.com/storage/v1"
# 1 つのファイルの上限(Gemini にそのまま渡す PDF も、これに収める)
MAX_FILE = 20 * 1024**2
# 文字にした中身を Gemini に渡す上限(1 ファイル)
MAX_TEXT = 300_000
TEXT_EXT = (".md", ".txt", ".csv", ".tsv", ".json")


def _gcs_get(path: str, params: dict[str, Any] | None = None, raw: bool = False) -> Any:
    from ..assets import session

    r = session().get(f"{GCS}{path}", params=params, timeout=60)
    if r.status_code >= 400:
        raise RuntimeError(f"GCS {r.status_code}: {r.text[:300]}")
    return r.content if raw else r.json()


def _obj_path(bucket: str, name: str) -> str:
    from urllib.parse import quote

    return f"/b/{quote(bucket, safe='')}/o/{quote(name, safe='')}"


@router.get("/gcs/list")
async def gcs_list(bucket: str, prefix: str = "") -> dict[str, Any]:
    """バケットの、フォルダ 1 段分の一覧(フォルダと、ファイル)"""
    def go() -> dict[str, Any]:
        b = bucket.strip().removeprefix("gs://").strip("/")
        out = {"ok": True, "bucket": b, "prefix": prefix, "folders": [], "files": []}
        token = None
        while True:
            params = {"prefix": prefix, "delimiter": "/", "maxResults": 1000, **({"pageToken": token} if token else {})}
            v = _gcs_get(f"/b/{b}/o", params)
            out["folders"] += v.get("prefixes", [])
            out["files"] += [{"name": o["name"], "size": int(o.get("size", 0)), "updated": o.get("updated"), "type": o.get("contentType", "")}
                             for o in v.get("items", []) if not o["name"].endswith("/")]
            token = v.get("nextPageToken")
            if not token or len(out["files"]) >= 3000:
                break
        return out

    try:
        return await asyncio.to_thread(go)
    except Exception as e:  # noqa: BLE001
        return error_result(e)


def kind_of(name: str) -> str:
    n = name.lower()
    if n.endswith((".xlsx", ".xlsm")):
        return "xlsx"
    if n.endswith(".pdf"):
        return "pdf"
    if n.endswith(TEXT_EXT):
        return "text"
    return "other"


def read_doc(bucket: str, name: str) -> dict[str, Any]:
    """GCS の文書 1 つを読み、Gemini に渡せる形にする。PDF は中身をそのまま(Gemini が読める)"""
    k = kind_of(name)
    if k == "other":
        return {"name": name, "kind": k, "error": "この形式は読めません(Excel・PDF・CSV・テキストだけ。Word は PDF に書き出してください)"}
    meta = _gcs_get(_obj_path(bucket, name))
    size = int(meta.get("size", 0))
    if size > MAX_FILE:
        return {"name": name, "kind": k, "error": f"大きすぎます({size / 1024**2:.1f} MB。{MAX_FILE // 1024**2} MB まで)"}
    data = _gcs_get(_obj_path(bucket, name), {"alt": "media"}, raw=True)
    if k == "pdf":
        return {"name": name, "kind": k, "bytes": data, "size": size}
    text = xlsx_text(data) if k == "xlsx" else decode_text(data)
    cut = len(text) > MAX_TEXT
    return {"name": name, "kind": k, "text": text[:MAX_TEXT], "size": size, "chars": len(text), "truncated": cut}


class DocsIn(BaseModel):
    bucket: str = Field(min_length=1, max_length=300)
    names: list[str] = Field(min_length=1, max_length=20)


@router.post("/gcs/extract")
async def gcs_extract(body: DocsIn) -> dict[str, Any]:
    """選んだ文書を文字にして返す(画面で中身を確かめるため。PDF は文字にしない)"""
    def go() -> dict[str, Any]:
        out = []
        for n in body.names:
            try:
                d = read_doc(body.bucket.strip().removeprefix("gs://").strip("/"), n)
            except Exception as e:  # noqa: BLE001
                d = {"name": n, "kind": kind_of(n), "error": error_result(e)["error"]}
            d.pop("bytes", None)
            out.append(d)
        return {"ok": True, "docs": out}

    try:
        return await asyncio.to_thread(go)
    except Exception as e:  # noqa: BLE001
        return error_result(e)


POLICY_ROLE = """あなたは、マーケティングポリシー・文言のルールの文書を、Campaign Contents Planner(CCP)に取り込める形に書き直す専門家です。
渡された文書(Excel をシートごとに CSV の形にしたもの・PDF・テキスト)を読み、下の「取り込むファイルの形」(POLICY_FORMAT.md)のとおりに書き直してください。

返答は、次の形の JSON だけにしてください(```json で囲まない):
{"reply": "利用者への返事(日本語。Markdown を使ってよい。何をどのファイルに分けたか・決めきれなかったこと)",
 "files": [{"kind": "rules または sales", "filename": "取り込むときのファイル名(rules は .md、sales は .csv。元の文書の名前から)", "content": "ファイルの中身の全文"}],
 "questions": ["利用者に確かめたいこと(なければ空の配列)"]}

決まり:
- ルール系(表現・選定・口調などの決まり)は Markdown(rules)、販売系の方針(週 × 市場 × 商品やカテゴリの方針)は CSV(sales)。1 つの文書に両方あれば、2 つのファイルに分ける
- 文書にないことを足さない。読み取れない・解釈が分かれるところは questions で聞く
- 決まりごとに、元の文書のどこから取ったか(シート名・ページ・見出し)を、POLICY_FORMAT.md で使える項目(出どころ・メモなど)に書く。項目がなければ reply に書く
- 個人の名前は書かない(役割にする)
- 「確かめの結果」(読めなかった決まり・行と理由)が渡されたら、それを直した全文を返す
"""


class ConvertIn(BaseModel):
    bucket: str = Field(min_length=1, max_length=300)
    names: list[str] = Field(min_length=1, max_length=20)
    # 利用者からの頼み(どの市場の決まりか・どのシートを使うか など)。続けて話すときは、これまでの会話も
    messages: list[ChatTurn] = Field(default_factory=list, max_length=100)
    model: str | None = Field(None, max_length=200)


async def convert_events(body: ConvertIn) -> AsyncIterator[dict[str, Any]]:
    """文書を書き直す 1 回分を、起きた順に返す(会話と同じ形: start / step / thought / final / error)"""
    from google.genai import types

    from .. import ai

    model = body.model or await default_model()
    level = (os.getenv("DEVTOOLS_THINKING") or "high").upper()
    yield {"type": "start", "model": model, "thinking": level.lower()}
    bucket = body.bucket.strip().removeprefix("gs://").strip("/")
    parts: list[Any] = []
    for n in body.names:
        try:
            d = await asyncio.to_thread(read_doc, bucket, n)
        except Exception as e:  # noqa: BLE001
            yield {"type": "error", "error": f"{n} を読めません: {error_result(e)['error']}"}
            return
        if d.get("error"):
            yield {"type": "error", "error": f"{n}: {d['error']}"}
            return
        if d["kind"] == "pdf":
            parts.append(types.Part(text=f"## 文書: {n}(PDF)"))
            parts.append(types.Part.from_bytes(data=d["bytes"], mime_type="application/pdf"))
            yield {"type": "step", "text": f"{n} を読んだ(PDF、{d['size'] / 1024:.0f} KB。そのまま渡す)"}
        else:
            parts.append(types.Part(text=f"## 文書: {n}\n\n{d['text']}"))
            yield {"type": "step", "text": f"{n} を文字にした({d['chars']:,} 文字{'。長いので途中まで' if d.get('truncated') else ''})"}
    system = POLICY_ROLE + "\n\n## 取り込むファイルの形(POLICY_FORMAT.md)\n\n" + doc("POLICY_FORMAT.md")
    turns = body.messages or [ChatTurn(role="user", text="これらの文書を、取り込める形に書き直してください。")]
    # 文書は最初の発言に添える(続けて話すときも、毎回渡す。前の返事の中身は会話に入っている)
    contents = [types.Content(role="user", parts=[*parts, types.Part(text=turns[0].text)])]
    contents += [types.Content(role=t.role, parts=[types.Part(text=t.text)]) for t in turns[1:]]
    config = types.GenerateContentConfig(
        system_instruction=system,
        response_mime_type="application/json",
        thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel(level), include_thoughts=True),
    )
    text = ""
    try:
        stream = await ai.get_client().aio.models.generate_content_stream(model=model, contents=contents, config=config)
        async for chunk in stream:
            for cand in chunk.candidates or []:
                for p in (cand.content.parts if cand.content else None) or []:
                    if p.thought:
                        if p.text:
                            yield {"type": "thought", "text": p.text}
                    elif p.text:
                        text += p.text
    except Exception as e:  # noqa: BLE001
        yield {"type": "error", "error": f"{model} の呼び出しに失敗しました: {type(e).__name__}: {e}"[:2000]}
        return
    v = parse_files(text)
    if not v["files"] and not v["reply"]:
        yield {"type": "error", "error": "返答が空でした(安全フィルターなどで止まった可能性があります)"}
        return
    # 書き直したファイルは、作業フォルダにも残す(画面を閉じても、あとで見られるように)
    for f in v["files"]:
        try:
            p = common.DEVWORK / "policies" / re.sub(r"[\\/:*?\"<>|]", "_", f["filename"])
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(f["content"], encoding="utf-8")
        except OSError:
            pass
    yield {"type": "final", **v}


def parse_files(text: str) -> dict[str, Any]:
    """書き直しの返答(JSON)を読む。崩れていたら、本文を返事として扱う"""
    for c in (text, text[text.find("{"): text.rfind("}") + 1] if "{" in text else ""):
        try:
            v = json.loads(c)
        except ValueError:
            continue
        if isinstance(v, dict):
            files = []
            for f in v.get("files") or []:
                if not isinstance(f, dict) or not str(f.get("content") or "").strip():
                    continue
                kind = "sales" if str(f.get("kind")).lower() == "sales" else "rules"
                name = str(f.get("filename") or "").strip() or f"policy.{'csv' if kind == 'sales' else 'md'}"
                files.append({"kind": kind, "filename": name, "content": str(f["content"])})
            q = v.get("questions")
            return {"reply": str(v.get("reply") or ""), "files": files, "questions": [str(x) for x in q if x] if isinstance(q, list) else []}
    return {"reply": text, "files": [], "questions": []}


@router.get("/policy/drafts")
async def policy_drafts() -> dict[str, Any]:
    """前に書き直したファイル(server/devwork/policies/)の一覧と中身"""
    out = []
    for p in sorted((common.DEVWORK / "policies").glob("*"), key=lambda x: x.stat().st_mtime, reverse=True):
        if p.is_file():
            out.append({"filename": p.name, "kind": "sales" if p.suffix.lower() == ".csv" else "rules", "content": p.read_text(encoding="utf-8"),
                        "updated": datetime.fromtimestamp(p.stat().st_mtime).astimezone().isoformat(timespec="seconds")})
    return {"ok": True, "drafts": out}
