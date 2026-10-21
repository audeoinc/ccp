"""メイン画像のライブラリに、持っている画像を上げる(X59。表 hero_images)。

  POST /api/heroes/upload?name=<元のファイル名>   本文 = 画像そのもの。ライブラリの置き場所に保存し、画像の URL(/img/heroes/<名前>)を返す
  POST /api/heroes/describe                       {"image_url": "/img/heroes/<名前>", "language": "ja" | "en"}
                                                   画像を Gemini に見せて、名前・用途・季節・タグ・説明・色・写っているものの下書きを返す(人が確かめて直す)

置き場所は、商品画像・メイン画像と同じ(ccp/assets.py): ASSET_DIR があればそのフォルダの heroes/(Workbench)、なければバケットの images/heroes/(本番)。
どちらもなければ server/images/heroes に置く(手元の開発。この場合、/img からは配られない)。
受け付けるのは JPEG・PNG・WebP で、1 枚 15MB まで。
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Request
from google.genai import types
from pydantic import BaseModel

from . import assets
from .ai import _get_client
from .data_api import fail, ok

log = logging.getLogger("ccp.heroes")
router = APIRouter(prefix="/api/heroes")

MAX_BYTES = 15 * 1024 * 1024
TYPES = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}
URL = re.compile(r"^/img/heroes/([A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp))$")


def save(name: str, data: bytes, content_type: str) -> None:
    d = assets.asset_dir()
    if d is not None or not assets.bucket():
        folder = (d if d is not None else Path(__file__).resolve().parents[1] / "images") / "heroes"
        folder.mkdir(parents=True, exist_ok=True)
        (folder / name).write_bytes(data)
        return
    assets.put_object(assets.object_name("heroes", name), data, content_type)


@router.post("/upload")
async def upload(request: Request, name: str):
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext not in TYPES:
        return fail(400, "メイン画像に使えるのは JPEG・PNG・WebP です", "bad_type")
    data = await request.body()
    if not data:
        return fail(400, "画像が空です", "empty")
    if len(data) > MAX_BYTES:
        return fail(400, "画像が大きすぎます(1 枚 15MB まで)", "too_large")
    stored = f"up-{uuid.uuid4().hex}.{'jpg' if ext == 'jpeg' else ext}"
    await asyncio.to_thread(save, stored, data, TYPES[ext])
    return ok({"image_url": f"/img/heroes/{stored}", "size": len(data)})


class DescribeIn(BaseModel):
    image_url: str
    language: str = "ja"


PROMPT = """あなたは、EC のメール・アプリの配信で使うメイン画像のライブラリの担当です。この画像を見て、ライブラリに登録するための下書きを作ってください。
返すのは JSON だけ: {"name": 画像の名前(短く。例「秋の公園で重ね着の女性」), "purpose": "new" | "feature" | "sale" | "member" | "event" のどれか(新作 / 特集 / セール / 会員 / イベント),
"season": "autumn" | "winter" | "autumn_winter" | "all_year" のどれか, "tags": カンマ区切りのタグ(5〜8 個), "description": 2 文までの説明(雰囲気・構図・どんな配信に合うか),
"colors": 主な色の名前(3 つまで、カンマ区切り), "subjects": 写っているもの(人・商品の種類など。カンマ区切り), "focal": {"x": 0〜1, "y": 0〜1}(いちばん見せたい場所。左上が 0,0)}
文字は %LANG% で書く。人物を特定する情報(名前など)は書かない。"""


@router.post("/describe")
async def describe(body: DescribeIn):
    m = URL.match(body.image_url)
    if not m:
        return fail(400, "ライブラリの画像ではありません", "bad_url")
    found = await asyncio.to_thread(assets.read_image, "heroes", m.group(1))
    if found is None:
        # 手元の開発(バケットも ASSET_DIR もない)では、置いたフォルダから読む
        p = Path(__file__).resolve().parents[1] / "images" / "heroes" / m.group(1)
        found = (p.read_bytes(), TYPES.get(m.group(1).rsplit(".", 1)[-1], "image/jpeg")) if p.is_file() else None
    if found is None:
        return fail(404, "画像が見つかりません", "not_found")
    data, content_type = found
    prompt = PROMPT.replace("%LANG%", "英語" if body.language == "en" else "日本語")
    try:
        resp = await _get_client().aio.models.generate_content(
            model=os.getenv("GEMINI_MODEL", "gemini-3.5-flash"),
            contents=[types.Part.from_bytes(data=data, mime_type=content_type), prompt],
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        draft = json.loads((resp.text or "").strip() or "{}")
    except Exception as e:  # noqa: BLE001 — 下書きがなくても、人が書けば登録できる
        log.exception("画像の読み取りに失敗しました")
        return fail(502, f"AI で画像を読み取れませんでした(手で入れて登録できます): {type(e).__name__}", "ai_failed")
    return ok(draft if isinstance(draft, dict) else {})
