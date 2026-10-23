"""商品の画像を取り込む(docs/PRODUCT_IMAGES.md)。

Workbench のサーバーは、利用先の EC サイトを読めない。手元の PC で scripts/collect-product-images.py が
商品ページの画像(メインを含む)を集めて ZIP にし、それを Workbench に運んで、ここで取り込む:

  python -m ccp.cli import-images <ZIP>          中身を見るだけ(何も変えない)
  python -m ccp.cli import-images <ZIP> --yes    取り込む
  POST /api/product-images/import[?yes=1]        本文 = ZIP。画面の ⚙ から(コマンドを使えない環境: 本番)。yes がなければ確認だけ

- 画像は <images>/products/<中身の sha256 の頭>.<拡張子> に置く(同じ画像は 1 つだけ)。/img/products/… で配る
- 表 product_images に、商品ごとの画像を並べる。ZIP に入っている商品の行は、入れ替える(何度流しても同じ結果)
- 商品は、商品コード(と、ZIP に市場があれば市場)で探す。マスタにない商品は、飛ばして件数を出す
- 商品のマスタのメイン画像(products.image_url)は、空のときだけ、取り込んだメイン画像で埋める(--main-to-master なら置き換える)

見本の写真(AI で作った。scripts/sample-photos.py が作る ZIP。目録に "sample": true)も、同じ入口で取り込む:
- 行に source = sample と、見出し(alt)・説明の文(caption)・アングル(angle)を入れる。見本の ZIP は見本の行だけを、本物の ZIP は本物の行だけを入れ替える
  (本物の画像がある商品では、画面・見本の商品ページが本物を優先する。見本の SKU と同じ考え方)
- 商品のマスタのメイン画像は、空か仮の画像(placehold.co)のときにも、見本のメインで埋める。--main-to-master(⚙ では「メイン画像も置き換える」)なら
  今の画像も置き換え、前の画像は source = master の行に控える(元に戻すときは、その行の image_url を products.image_url に戻す)

メイン画像(ヒーロー)の見本の写真(sample-photos.py の spec が kind = heroes。目録に "kind": "heroes")も、同じ入口で取り込む:
- 画像は <images>/heroes/s-<中身の sha256 の頭>.jpg に置き、表 hero_images の行の image_url を差し替える。行は id(なければ画像コードと市場)で探す
- 前の画像は original_image_url に控える(最初の 1 度だけ。元に戻すときは、それを image_url に戻す)。前の画像のファイルは消さない
- 焦点(focal_*)は前の画像に合わせたものなので、空に戻す(真ん中から切り出す)

ファイル(ASSET_DIR)は Git に入らないので、コードを更新しても消えない。
本番のパックで DB を置き換えた(import-pack --yes)あとは、表 product_images の行が消えるので、同じ ZIP をもう一度取り込む。
"""
from __future__ import annotations

import asyncio
import io
import json
import zipfile
from pathlib import Path
from typing import Any, Callable

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text

from .data_api import db, fail, ok, require_db

router = APIRouter(dependencies=[Depends(require_db)])
# ZIP の大きさの上限(サーバーが 1 回で受け取れる大きさより小さく。大きいときは、ZIP を分ける)
MAX_ZIP = 30 * 1024 * 1024

# サーバーが配れる画像の種類(assets.CONTENT_TYPES・pack.IMG_URL と同じ)
SERVED = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
SAMPLE = "sample"
# 見本のメインで置き換える前の、商品のマスタのメイン画像の控え(元に戻すため。画面の候補には出さない)
MASTER = "master"
# 見本のデータの、仮の画像(見本の写真で置き換えてよいもの)
PLACEHOLDER = ("https://placehold.co/",)


HEROES = "heroes"


def hero_plan(manifest: dict[str, Any], heroes: list[dict[str, Any]]) -> dict[str, Any]:
    """ZIP のメイン画像を、表 hero_images の行に当てる(DB もファイルも変えない)"""
    by_id = {str(h["id"]): h for h in heroes}
    by_code = {(h.get("image_code"), h.get("market")): h for h in heroes if h.get("image_code")}
    items, missing = [], []
    for r in manifest.get("heroes", []):
        if r.get("content_type") not in SERVED:
            continue
        h = by_id.get(str(r.get("id"))) or by_code.get((r.get("image_code"), r.get("market")))
        if h:
            items.append({"hero": h, "image": r})
        else:
            missing.append(f"{r.get('market') or ''}/{r.get('image_code') or r.get('id')}")
    return {"items": items, "missing": missing}


def hero_file_name(img: dict[str, Any]) -> str:
    # 今のメイン画像(画像コードの名前)と重ならない名前にする(前の画像のファイルを残し、元に戻せるように)
    return f"s-{img['sha256'][:24]}.{SERVED[img['content_type']]}"


async def hero_apply(conn: Any, p: dict[str, Any]) -> int:
    for it in p["items"]:
        await conn.execute(
            text("UPDATE hero_images SET original_image_url = COALESCE(original_image_url, image_url), image_url = :u, "
                 "focal_x = NULL, focal_y = NULL, focal_zoom = NULL, modified_on = now() WHERE id = :id"),
            {"u": f"/img/heroes/{hero_file_name(it['image'])}", "id": it["hero"]["id"]},
        )
    return len(p["items"])


async def load_heroes(conn: Any) -> list[dict[str, Any]]:
    return [dict(r) for r in (await conn.execute(text("SELECT id, image_code, market FROM hero_images"))).mappings().all()]


def read_zip(path: Path) -> tuple[dict[str, Any], zipfile.ZipFile]:
    z = zipfile.ZipFile(path)
    try:
        manifest = json.loads(z.read("manifest.json").decode("utf-8"))
    except KeyError:
        raise SystemExit("manifest.json がありません(scripts/collect-product-images.py が作った ZIP を渡してください)")
    return manifest, z


def plan(manifest: dict[str, Any], products: list[dict[str, Any]]) -> dict[str, Any]:
    """ZIP の商品を、マスタの商品に当てる。取り込む画像の一覧と、飛ばすものを返す(DB もファイルも変えない)"""
    by_code: dict[str, list[dict[str, Any]]] = {}
    for p in products:
        by_code.setdefault(str(p["product_code"]), []).append(p)
    items, missing, unsupported, errors = [], [], 0, []
    for r in manifest.get("products", []):
        if r.get("error"):
            errors.append(f"{r.get('product_code')}: {r['error']}")
        imgs = [i for i in r.get("images", []) if i.get("content_type") in SERVED]
        unsupported += len(r.get("images", [])) - len(imgs)
        if not imgs:
            continue
        targets = [p for p in by_code.get(str(r["product_code"]), []) if not r.get("market") or p.get("market") == r["market"]]
        if not targets:
            missing.append(f"{r.get('market') or ''}{'/' if r.get('market') else ''}{r['product_code']}")
            continue
        for p in targets:
            items.append({"product": p, "images": imgs})
    return {"items": items, "missing": missing, "unsupported": unsupported, "errors": errors}


def file_name(img: dict[str, Any]) -> str:
    return f"{img['sha256'][:24]}.{SERVED[img['content_type']]}"


def local_put(images: Path) -> Callable[[str, bytes, str], bool]:
    """画像をフォルダ(<images>/products/)に置く。もうあれば置かない(置いたら True)"""
    dest = images / "products"
    dest.mkdir(parents=True, exist_ok=True)

    def put(name: str, data: bytes, content_type: str) -> bool:
        f = dest / name
        if f.exists():
            return False
        f.write_bytes(data)
        return True

    return put


async def apply(conn: Any, z: zipfile.ZipFile, p: dict[str, Any], put: Callable[[str, bytes, str], bool], main_to_master: bool, sample: bool = False) -> dict[str, int]:
    """取り込む。画像を置き(put)、商品ごとに product_images を入れ替え、空のメイン画像を埋める"""
    placed = rows = mains = 0
    for it in p["items"]:
        prod = it["product"]
        # 見本の ZIP は見本の行だけ、本物の ZIP は本物の行(source が空)だけを入れ替える。元のメイン画像の控え(master)は残す
        scope = "source = :s" if sample else "source IS NULL"
        await conn.execute(text(f"DELETE FROM product_images WHERE product_id = :id AND {scope}"), {"id": prod["id"], "s": SAMPLE})
        main_url = None
        for order, img in enumerate(it["images"], start=1):
            name = file_name(img)
            if put(name, z.read(f"products/{img['file']}"), img["content_type"]):
                placed += 1
            url = f"/img/products/{name}"
            if img.get("main") and not main_url:
                main_url = url
            await conn.execute(
                text("INSERT INTO product_images (name, product_code, market, image_url, sort_order, is_main, source_url, alt, sha256, caption, angle, source, product_id) "
                     "VALUES (:name, :code, :market, :url, :sort, :main, :src, :alt, :sha, :caption, :angle, :source, :pid)"),
                {"name": name, "code": prod["product_code"], "market": prod.get("market"), "url": url, "sort": order, "main": 1 if img.get("main") else 0,
                 "src": img.get("src"), "alt": (img.get("alt") or "")[:500], "sha": img["sha256"], "caption": (img.get("caption") or "")[:2000] or None,
                 "angle": img.get("angle") or None, "source": SAMPLE if sample else None, "pid": prod["id"]},
            )
            rows += 1
        current = str(prod.get("image_url") or "")
        if main_url and (main_to_master or not current or (sample and current.startswith(PLACEHOLDER))):
            if current and current != main_url and not current.startswith(PLACEHOLDER):
                # 置き換える前のメイン画像を、控え(source = master)として 1 度だけ残す(元に戻せるように。2 回目からは、最初の控えを残す)
                await conn.execute(
                    text("INSERT INTO product_images (name, product_code, market, image_url, sort_order, is_main, source, product_id) "
                         "SELECT :name, :code, :market, :url, 0, 0, :source, :pid WHERE NOT EXISTS (SELECT 1 FROM product_images WHERE product_id = :pid AND source = :source)"),
                    {"name": current.rsplit("/", 1)[-1][:200], "code": prod["product_code"], "market": prod.get("market"), "url": current, "source": MASTER, "pid": prod["id"]},
                )
            await conn.execute(text("UPDATE products SET image_url = :u, modified_on = now() WHERE id = :id"), {"u": main_url, "id": prod["id"]})
            mains += 1
    return {"placed": placed, "rows": rows, "mains": mains}


async def import_images(path: Path, images: Path, yes: bool, main_to_master: bool = False) -> None:
    from .cli import migrate
    from .db import get_engine

    manifest, z = read_zip(path)
    print(f"ZIP: {path.name}{'(見本の写真)' if manifest.get('sample') else ''}(作った日時 {manifest.get('made_at')}。商品 {len(manifest.get('products', []))}・画像 {manifest.get('images')} 枚)")
    # 表がまだない環境でも取り込めるよう、先に表を作る(何度実行してもよい)
    await migrate()
    engine = await get_engine()
    if manifest.get("kind") == HEROES:
        async with engine.connect() as conn:
            hp = hero_plan(manifest, await load_heroes(conn))
        print(f"  取り込む: メイン画像 {len(hp['items'])} 枚")
        if hp["missing"]:
            print(f"  表にないメイン画像(飛ばす): {len(hp['missing'])} 件(例: {', '.join(hp['missing'][:5])})")
        if not yes:
            print()
            print("確認だけです。取り込むときは --yes を付けて実行してください(メイン画像の image_url が差し替わります。前の画像は original_image_url に控えます)")
            return
        dest = images / HEROES
        dest.mkdir(parents=True, exist_ok=True)
        for it in hp["items"]:
            (dest / hero_file_name(it["image"])).write_bytes(z.read(f"heroes/{it['image']['file']}"))
        async with engine.begin() as conn:
            n = await hero_apply(conn, hp)
        print(f"取り込みました: メイン画像 {n} 枚を {dest} に置き、表 hero_images を差し替えました")
        print(f"サーバーは、環境変数 ASSET_DIR={images} で起動してください(画像をこのフォルダから配る)")
        return
    async with engine.connect() as conn:
        products = [dict(r) for r in (await conn.execute(text("SELECT id, product_code, market, image_url FROM products WHERE product_code IS NOT NULL"))).mappings().all()]
    p = plan(manifest, products)
    n_img = sum(len(i["images"]) for i in p["items"])
    print(f"  取り込む: 商品 {len(p['items'])} 件・画像 {n_img} 枚")
    if p["missing"]:
        print(f"  マスタにない商品(飛ばす): {len(p['missing'])} 件(例: {', '.join(p['missing'][:5])})")
    if p["unsupported"]:
        print(f"  配れない種類の画像(GIF・AVIF など。飛ばす): {p['unsupported']} 枚")
    if p["errors"]:
        print(f"  手元で読めなかったページ: {len(p['errors'])} 件(例: {p['errors'][0]})")
    if not yes:
        print()
        print("確認だけです。取り込むときは --yes を付けて実行してください(ZIP に入っている商品の画像の行は、入れ替わります)")
        return
    sample = bool(manifest.get("sample"))
    async with engine.begin() as conn:
        r = await apply(conn, z, p, local_put(images), main_to_master, sample)
    print(f"取り込みました: 画像のファイル {r['placed']} 点を {images / 'products'} に置き、行 {r['rows']} 件。商品のメイン画像を {r['mains']} 件埋めました")
    print(f"サーバーは、環境変数 ASSET_DIR={images} で起動してください(画像をこのフォルダから配る)")


def remote_put(name: str, data: bytes, content_type: str) -> bool:
    """画像を、サーバーの置き場所(ASSET_DIR のフォルダか、バケット)に置く。名前は中身から決まるので、上書きしてよい"""
    from .heroes import save

    save(name, data, content_type, kind="products")
    return True


def summary(manifest: dict[str, Any], p: dict[str, Any]) -> dict[str, Any]:
    return {"sample": bool(manifest.get("sample")), "products": len(p["items"]), "images": sum(len(i["images"]) for i in p["items"]),
            "missing": p["missing"], "unsupported": p["unsupported"], "errors": p["errors"][:20]}


@router.post("/api/product-images/import")
async def import_endpoint(request: Request, yes: int = 0, main: int = 0):
    """⚙ から商品の画像の ZIP(見本の写真・集めた画像)を取り込む。yes = 0 は確認だけ(DB もファイルも変えない)。
    main = 1 は、商品のマスタのメイン画像も、ZIP のメインで置き換える(前のメイン画像は source = master の行に控える)"""
    body = await request.body()
    if not body:
        return fail(400, "ZIP が空です", "empty")
    if len(body) > MAX_ZIP:
        return fail(400, f"ZIP が大きすぎます({MAX_ZIP // 1024 // 1024}MB まで。分けて取り込んでください)", "too_large")
    try:
        z = zipfile.ZipFile(io.BytesIO(body))
        manifest = json.loads(z.read("manifest.json").decode("utf-8"))
    except (zipfile.BadZipFile, KeyError, ValueError):
        return fail(400, "商品の画像の ZIP ではありません(manifest.json がありません)", "bad_zip")
    if manifest.get("kind") == HEROES:
        return await import_heroes(z, manifest, bool(yes))
    async with db() as conn:
        products = [dict(r) for r in (await conn.execute(text("SELECT id, product_code, market, image_url FROM products WHERE product_code IS NOT NULL"))).mappings().all()]
    p = plan(manifest, products)
    out = summary(manifest, p)
    if not yes:
        return ok(out)
    # 画像を置く間も DB の取引を開いたままにしないよう、先に画像を置く
    for it in p["items"]:
        for img in it["images"]:
            await asyncio.to_thread(remote_put, file_name(img), z.read(f"products/{img['file']}"), img["content_type"])
    async with db(write=True) as conn:
        r = await apply(conn, z, p, lambda *_: False, bool(main), out["sample"])
    return ok({**out, **r, "placed": sum(len(i["images"]) for i in p["items"])})


async def import_heroes(z: zipfile.ZipFile, manifest: dict[str, Any], yes: bool):
    """⚙ からメイン画像の見本の写真を取り込む(import_endpoint から。目録の kind = heroes)"""
    from .heroes import save

    async with db() as conn:
        hp = hero_plan(manifest, await load_heroes(conn))
    out = {"sample": True, "kind": HEROES, "products": 0, "images": len(hp["items"]), "missing": hp["missing"], "unsupported": 0, "errors": []}
    if not yes:
        return ok(out)
    for it in hp["items"]:
        await asyncio.to_thread(save, hero_file_name(it["image"]), z.read(f"heroes/{it['image']['file']}"), it["image"]["content_type"])
    async with db(write=True) as conn:
        n = await hero_apply(conn, hp)
    return ok({**out, "mains": n, "placed": n})
