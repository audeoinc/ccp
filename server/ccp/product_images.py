"""商品の画像を取り込む(docs/PRODUCT_IMAGES.md)。

Workbench のサーバーは、利用先の EC サイトを読めない。手元の PC で scripts/collect-product-images.py が
商品ページの画像(メインを含む)を集めて ZIP にし、それを Workbench に運んで、ここで取り込む:

  python -m ccp.cli import-images <ZIP>          中身を見るだけ(何も変えない)
  python -m ccp.cli import-images <ZIP> --yes    取り込む

- 画像は <images>/products/<中身の sha256 の頭>.<拡張子> に置く(同じ画像は 1 つだけ)。/img/products/… で配る
- 表 product_images に、商品ごとの画像を並べる。ZIP に入っている商品の行は、入れ替える(何度流しても同じ結果)
- 商品は、商品コード(と、ZIP に市場があれば市場)で探す。マスタにない商品は、飛ばして件数を出す
- 商品のマスタのメイン画像(products.image_url)は、空のときだけ、取り込んだメイン画像で埋める(--main-to-master なら置き換える)

ファイル(ASSET_DIR)は Git に入らないので、コードを更新しても消えない。
本番のパックで DB を置き換えた(import-pack --yes)あとは、表 product_images の行が消えるので、同じ ZIP をもう一度取り込む。
"""
from __future__ import annotations

import json
import zipfile
from pathlib import Path
from typing import Any

from sqlalchemy import text

# サーバーが配れる画像の種類(assets.CONTENT_TYPES・pack.IMG_URL と同じ)
SERVED = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


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


async def apply(conn: Any, z: zipfile.ZipFile, p: dict[str, Any], images: Path, main_to_master: bool) -> dict[str, int]:
    """取り込む。画像を置き、商品ごとに product_images を入れ替え、空のメイン画像を埋める"""
    dest = images / "products"
    dest.mkdir(parents=True, exist_ok=True)
    placed = rows = mains = 0
    for it in p["items"]:
        prod = it["product"]
        await conn.execute(text("DELETE FROM product_images WHERE product_id = :id"), {"id": prod["id"]})
        main_url = None
        for order, img in enumerate(it["images"], start=1):
            name = file_name(img)
            f = dest / name
            if not f.exists():
                f.write_bytes(z.read(f"products/{img['file']}"))
                placed += 1
            url = f"/img/products/{name}"
            if img.get("main") and not main_url:
                main_url = url
            await conn.execute(
                text("INSERT INTO product_images (name, product_code, market, image_url, sort_order, is_main, source_url, alt, sha256, product_id) "
                     "VALUES (:name, :code, :market, :url, :sort, :main, :src, :alt, :sha, :pid)"),
                {"name": name, "code": prod["product_code"], "market": prod.get("market"), "url": url, "sort": order, "main": 1 if img.get("main") else 0,
                 "src": img.get("src"), "alt": (img.get("alt") or "")[:500], "sha": img["sha256"], "pid": prod["id"]},
            )
            rows += 1
        if main_url and (main_to_master or not prod.get("image_url")):
            await conn.execute(text("UPDATE products SET image_url = :u, modified_on = now() WHERE id = :id"), {"u": main_url, "id": prod["id"]})
            mains += 1
    return {"placed": placed, "rows": rows, "mains": mains}


async def import_images(path: Path, images: Path, yes: bool, main_to_master: bool = False) -> None:
    from .cli import migrate
    from .db import get_engine

    manifest, z = read_zip(path)
    print(f"ZIP: {path.name}(作った日時 {manifest.get('made_at')}。商品 {len(manifest.get('products', []))}・画像 {manifest.get('images')} 枚)")
    # 表がまだない環境でも取り込めるよう、先に表を作る(何度実行してもよい)
    await migrate()
    engine = await get_engine()
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
    async with engine.begin() as conn:
        r = await apply(conn, z, p, images, main_to_master)
    print(f"取り込みました: 画像のファイル {r['placed']} 点を {images / 'products'} に置き、行 {r['rows']} 件。商品のメイン画像を {r['mains']} 件埋めました")
    print(f"サーバーは、環境変数 ASSET_DIR={images} で起動してください(画像をこのフォルダから配る)")
