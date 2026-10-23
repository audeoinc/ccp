"""開発用の画面(/dev/)の「画像の一覧」(docs/DEVTOOLS.md の 9 章)。CCP が持つ画像を、種類ごとに 1 つの表で見る(読むだけ)。

  GET /api/dev/images?kind=heroes|parts|creative|products   画像の行・使われている所・登録元・登録日・ファイルがあるか

画像は表ごとに置き方も使われ方も違い、CCP の画面では探しにくい(メイン画像はライブラリ、部品の画像はテンプレートの中、
素材は配信カードの中、商品画像は商品の中)。見本の写真を取り込んだあと(B12)や、パックで DB を置き換えたあとに、
「どれがどこで使われているか」「ファイルが消えて壊れたリンクになっていないか」を、1 か所で確かめるため。

- ファイルがあるかは、置き場所(ASSET_DIR のフォルダか、バケット)の名前の一覧と比べる(1 枚ずつ読まない)。
  外の URL(https://…)は、Workbench からは読めないので確かめない(external)
- 使われている所: メイン画像は配信カード(hero_image_id と、AB テストの案)、部品の画像はテンプレート(今の版の sections)、
  素材は、それを置いた配信カード、商品画像は、配信に載せた商品(delivery_products.image_url。商品のメイン画像は、画像を替えずに載せた行も)
"""
from __future__ import annotations

import asyncio
import re
from pathlib import Path
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text

from . import assets, creative
from .data_api import db
from .devtools import require_enabled

router = APIRouter(prefix="/api/dev/images", dependencies=[Depends(require_enabled)])

KINDS = ("heroes", "parts", "creative", "products")
# 画面に返す行の上限(商品画像は、商品が多いと数千になる)
MAX_ROWS = 5000
IMG_URL = re.compile(r"^/img/(products|heroes|parts)/([^/?#]+)$")
CREATIVE_URL = re.compile(r"^/api/creative/files/([^/?#]+)$")


def _list_gcs(prefix: str) -> set[str]:
    names: set[str] = set()
    token = ""
    while True:
        url = f"{assets.GCS_API}/storage/v1/b/{assets.bucket()}/o?prefix={quote(prefix, safe='')}&fields=items(name),nextPageToken&maxResults=1000"
        r = assets.session().get(url + (f"&pageToken={quote(token, safe='')}" if token else ""), timeout=30)
        r.raise_for_status()
        j = r.json()
        names |= {i["name"][len(prefix):] for i in j.get("items", [])}
        token = j.get("nextPageToken") or ""
        if not token:
            return names


def stored_names(kind: str) -> set[str] | None:
    """置き場所にあるファイルの名前(kind = products / heroes / parts / creative)。確かめられない(置き場所がない)ときは None"""
    if kind == "creative":
        d, prefix = creative.local_dir(), "creative/"
    else:
        base = assets.asset_dir()
        d, prefix = (base / kind if base is not None else None), f"images/{kind}/"
        if d is None and not assets.bucket():
            # /img/… は ASSET_DIR かバケットからしか配らない(ccp/assets.py)。どちらもなければ、どの画像も出ない
            return set()
    if d is not None:
        return {p.name for p in Path(d).iterdir() if p.is_file()} if Path(d).is_dir() else set()
    return _list_gcs(prefix)


def link_state(url: str | None, names: dict[str, set[str] | None]) -> str:
    """ok = ファイルがある / missing = ない(壊れたリンク) / external = 外の URL(確かめない) / empty = 画像がない / unknown = 確かめられない"""
    u = (url or "").strip()
    if not u:
        return "empty"
    if u.startswith(("http://", "https://", "//")):
        return "external"
    if u.startswith("/sample-shop/"):
        return "ok"  # 見本の EC サイトの絵は、サーバーがその場で作る
    m = IMG_URL.match(u)
    kind, name = (m.group(1), m.group(2)) if m else ("creative", (CREATIVE_URL.match(u) or [None, None])[1])
    if not name:
        return "unknown"
    have = names.get(kind)
    if have is None:
        return "unknown"
    return "ok" if name in have else "missing"


def _iso(v: Any) -> Any:
    return v.isoformat() if hasattr(v, "isoformat") else v


def _rows(result: Any) -> list[dict[str, Any]]:
    return [{k: _iso(v) for k, v in dict(r).items()} for r in result.mappings().all()]


async def _heroes(conn: Any) -> list[dict[str, Any]]:
    rows = _rows(await conn.execute(text(
        "SELECT id, name, image_code, market, image_url, original_image_url, source, uploaded_by, usable_until, description, created_on "
        "FROM hero_images ORDER BY created_on DESC LIMIT :n"), {"n": MAX_ROWS}))
    cards = _rows(await conn.execute(text(
        "SELECT id, name, scheduled_at, country, hero_image_id, CAST(ab_test AS text) AS ab FROM delivery_cards "
        "WHERE hero_image_id IS NOT NULL OR ab_test IS NOT NULL")))
    for r in rows:
        r["used"] = [{"type": "card", "id": c["id"], "name": c["name"], "at": c["scheduled_at"]}
                     for c in cards if c["hero_image_id"] == r["id"] or (c["ab"] and str(r["id"]) in c["ab"])]
        r["origin"] = "AI の見本" if r.get("original_image_url") else (r.get("source") or ("上げた画像" if r.get("uploaded_by") else "最初から"))
    return rows


async def _parts(conn: Any) -> list[dict[str, Any]]:
    rows = _rows(await conn.execute(text(
        "SELECT id, name, kind, market, image_url, alt_text, source, uploaded_by, usable_until, created_on FROM part_images ORDER BY created_on DESC LIMIT :n"),
        {"n": MAX_ROWS}))
    temps = _rows(await conn.execute(text("SELECT id, name, CAST(sections AS text) AS sections FROM layout_templates WHERE hidden_at IS NULL")))
    for r in rows:
        r["used"] = [{"type": "template", "id": t["id"], "name": t["name"]} for t in temps if t["sections"] and str(r["id"]) in t["sections"]]
        r["origin"] = r.get("source") or ("上げた画像" if r.get("uploaded_by") else "")
    return rows


async def _creative(conn: Any) -> list[dict[str, Any]]:
    # 素材のうち、画像(ファイル)と、URL の見本カードの代表の画像。PDF・Office のファイルは画像ではないので出さない
    rows = _rows(await conn.execute(text(
        "SELECT a.id, a.name, a.kind, a.url, a.stored, a.content_type, a.size, a.preview_image, a.added_by, a.created_on, "
        "c.id AS card_id, c.name AS card_name, c.scheduled_at, c.country AS market "
        "FROM card_assets a LEFT JOIN delivery_cards c ON c.id = a.delivery_card_id "
        "WHERE (a.kind = 'file' AND a.content_type LIKE 'image/%') OR (a.kind = 'url' AND a.preview_image IS NOT NULL) "
        "ORDER BY a.created_on DESC LIMIT :n"), {"n": MAX_ROWS}))
    for r in rows:
        stored = r["stored"] if r["kind"] == "file" else r["preview_image"]
        r["image_url"] = f"/api/creative/files/{stored}" if stored else None
        r["used"] = [{"type": "card", "id": r["card_id"], "name": r["card_name"], "at": r["scheduled_at"]}] if r.get("card_id") else []
        r["origin"] = "ファイル" if r["kind"] == "file" else f"URL の見本({r.get('url') or ''})"
        r["uploaded_by"] = r.pop("added_by", None)
    return rows


async def _products(conn: Any) -> list[dict[str, Any]]:
    # 取り込んだ商品の画像(product_images)と、商品のマスタのメイン画像(products.image_url)。同じ URL は 1 行にまとめる
    imgs = _rows(await conn.execute(text(
        "SELECT i.id, i.image_url, i.is_main, i.alt, i.caption, i.angle, i.source, i.source_url, i.created_on, "
        "p.id AS product_id, p.name, p.product_code, p.market, p.image_url AS master_url "
        "FROM product_images i LEFT JOIN products p ON p.id = i.product_id ORDER BY p.product_code, i.sort_order LIMIT :n"), {"n": MAX_ROWS}))
    masters = _rows(await conn.execute(text(
        "SELECT id AS product_id, name, product_code, market, image_url, image_caption AS caption, created_on FROM products "
        "WHERE image_url IS NOT NULL AND image_url <> '' ORDER BY product_code LIMIT :n"), {"n": MAX_ROWS}))
    used = _rows(await conn.execute(text(
        "SELECT dp.image_url, dp.product_id, c.id AS card_id, c.name AS card_name, c.scheduled_at FROM delivery_products dp "
        "JOIN delivery_cards c ON c.id = dp.delivery_card_id")))
    seen = {(r["product_id"], r["image_url"]) for r in imgs}
    rows = [{**r, "role": "master" if r["source"] == "master" else ("main" if r["is_main"] else "sub"),
             "origin": {"sample": "AI の見本", "master": "置き換える前のメイン(控え)"}.get(r["source"] or "", "取り込んだ商品ページ")} for r in imgs]
    rows += [{**m, "id": f"master:{m['product_id']}", "role": "master_main", "origin": "商品のマスタ"} for m in masters if (m["product_id"], m["image_url"]) not in seen]
    for r in rows:
        is_master_main = r["image_url"] == r.get("master_url") or r["role"] == "master_main"
        r["used"] = [{"type": "card", "id": u["card_id"], "name": u["card_name"], "at": u["scheduled_at"]} for u in used
                     if u["image_url"] == r["image_url"] or (is_master_main and not u["image_url"] and u["product_id"] == r["product_id"])]
    return rows[:MAX_ROWS]


LOADERS = {"heroes": _heroes, "parts": _parts, "creative": _creative, "products": _products}


@router.get("")
async def images(kind: str) -> dict[str, Any]:
    if kind not in KINDS:
        raise HTTPException(400, f"kind は {' / '.join(KINDS)} のどれか")
    async with db() as conn:
        rows = await LOADERS[kind](conn)
    names: dict[str, set[str] | None] = {}
    note = ""
    for k in ("products", "heroes", "parts", "creative"):
        try:
            names[k] = await asyncio.to_thread(stored_names, k)
        except Exception as e:  # noqa: BLE001 — 置き場所を読めなくても、一覧は出す(リンクは「確かめられない」)
            names[k] = None
            note = f"画像の置き場所を読めませんでした({type(e).__name__})。リンクは確かめていません"
    for r in rows:
        r["link"] = link_state(r.get("image_url"), names)
    return {"kind": kind, "rows": rows, "truncated": len(rows) >= MAX_ROWS, "note": note,
            "store": "folder" if assets.asset_dir() is not None else ("bucket" if assets.bucket() else "none")}
