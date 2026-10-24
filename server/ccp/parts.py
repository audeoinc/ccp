"""部品の画像のライブラリ(X59 ③。表 part_images)。ボタン・バナー・ロゴ・アイコンなど、メールの中で使い回す画像。

  POST   /api/parts/upload?name=<元のファイル名>    本文 = 画像そのもの。置き場所に保存し、画像の URL(/img/parts/<名前>)を返す
  POST   /api/parts/describe-image?language=ja     本文 = 画像そのもの。名前・種類・タグ・説明・代替テキストの下書きを返す(人が確かめて直す)
  DELETE /api/parts/files/{name}                    上げた画像(up-…)のファイルを消す(表の行は画面が消す)

置き場所はメイン画像と同じ考え(ccp/heroes.py): ASSET_DIR があればそのフォルダの parts/、なければバケットの images/parts/。
受け付けるのは JPEG・PNG・WebP で、1 枚 15MB まで(ボタン・ロゴは透明を使うので、PNG のままにする)。
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid

from fastapi import APIRouter, Request
from google.genai import types

from . import assets, heroes
from .ai import _get_client
from .data_api import fail, ok

log = logging.getLogger("ccp.parts")
router = APIRouter(prefix="/api/parts")

KIND = "parts"

PROMPT = """あなたは、EC のメールで使う部品の画像(ボタン・バナー・ロゴ・アイコンなど)のライブラリの担当です。この画像を見て、ライブラリに登録するための下書きを作ってください。
返すのは JSON だけ: {"name": 画像の名前(短く。例「黒の『今すぐ見る』ボタン」), "kind": "button" | "banner" | "logo" | "icon" | "other" のどれか,
"tags": カンマ区切りのタグ(色・形・文言・用途。3〜6 個), "description": 1〜2 文の説明(見た目と、どんな場面で使うか),
"alt_text": メールの代替テキスト(画像が出ないときに代わりに出る文。画像の中の文字があればそれ。なければ短い説明)}
文字は %LANG% で書く。"""


@router.post("/upload")
async def upload(request: Request, name: str):
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext not in heroes.TYPES:
        return fail(400, "部品の画像に使えるのは JPEG・PNG・WebP です", "bad_type")
    data = await request.body()
    if not data:
        return fail(400, "画像が空です", "empty")
    if len(data) > heroes.MAX_BYTES:
        return fail(400, "画像が大きすぎます(1 枚 15MB まで)", "too_large")
    stored = f"up-{uuid.uuid4().hex}.{'jpg' if ext == 'jpeg' else ext}"
    await asyncio.to_thread(assets.put, KIND, stored, data, heroes.TYPES[ext])
    return ok({"image_url": f"/img/{KIND}/{stored}", "size": len(data)})


@router.post("/describe-image")
async def describe_image(request: Request, language: str = "ja"):
    content_type = (request.headers.get("content-type") or "").split(";")[0].strip().lower()
    if content_type not in heroes.IMAGE_TYPES:
        return fail(400, "AI に見せられるのは JPEG・PNG・WebP です", "bad_type")
    data = await request.body()
    if not data:
        return fail(400, "画像が空です", "empty")
    if len(data) > heroes.MAX_BYTES:
        return fail(400, "画像が大きすぎます(1 枚 15MB まで)", "too_large")
    prompt = PROMPT.replace("%LANG%", "英語" if language == "en" else "日本語")
    try:
        resp = await _get_client().aio.models.generate_content(
            model=os.getenv("GEMINI_MODEL", "gemini-3.5-flash"),
            contents=[types.Part.from_bytes(data=data, mime_type=content_type), prompt],
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        draft = json.loads((resp.text or "").strip() or "{}")
    except Exception as e:  # noqa: BLE001 — 下書きがなくても、人が書けば登録できる
        log.exception("部品の画像の読み取りに失敗しました")
        return fail(502, f"AI で画像を読み取れませんでした(手で入れて登録できます): {type(e).__name__}", "ai_failed")
    return ok(draft if isinstance(draft, dict) else {})


@router.delete("/files/{name}")
async def delete_file(name: str):
    """上げた画像(up-…)のファイルを消す。もとからある画像は消さない"""
    if not heroes.UPLOADED.match(name):
        return fail(400, "上げた画像だけ消せます", "not_uploaded")
    await asyncio.to_thread(assets.delete, KIND, name)
    return ok({"name": name})
