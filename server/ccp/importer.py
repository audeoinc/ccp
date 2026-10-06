"""画像から、商品・ヒーロー画像のデータを作って、取り込む(手元で実行する運用ツール)。

置き場所(リポジトリには入れない。.gitignore 済み):
  import/products/jp/*  import/products/us/*   商品の画像(日本向け / US 向け)
  import/heroes/jp/*    import/heroes/us/*     メイン(ヒーロー)画像
  jp のフォルダが空なら、us の画像を日本向けにも使う(画像が共通のとき。日本語の名前・説明で、別の商品として作る)。
  jpg / png / webp / avif。商品コードは、6 桁の数字(4 から始まる。画像の内容から決まる)。ヒーロー画像は、ファイル名の順に H01.. / UH01..

手順(それぞれ、結果を import/out/ に残す。やり直しても、解析済みの画像は、再度 Gemini に頼まない):
  python -m ccp.importer analyze          Gemini が画像を見て、名前・カテゴリ・季節・説明などを作る
  python -m ccp.importer build            価格・在庫・売上の推移・販売方針を、デモ用に作って、データを組み立てる(import/out/*.json)
  python -m ccp.importer upload           画像を縮小して、GCS に置く(images/products/<コード>.jpg など)
  python -m ccp.importer apply --yes      DB の、商品・ヒーロー画像・週次実績・販売方針を置き換える(配信カードの、商品の選択も外す)
  python -m ccp.importer all --yes        上の 4 つを続けて実行
  --only us / --only jp                  build と apply で、その市場の画像・データだけを扱う(もう一方の市場は、そのまま)

画像から分かるのは、見た目の情報だけ(名前・カテゴリ・季節・天候・説明)。価格・在庫・売上・評価・販売方針は、
カテゴリと売上トレンドに合う、もっともらしいデモ用の値を、コードごとに決まった乱数で作る(同じ入力なら、同じ結果)。
接続先は、db.py / assets.py の環境変数(CLOUD_SQL_INSTANCE / DB_PASSWORD / STATE_BUCKET / GOOGLE_CLOUD_PROJECT など)。
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import io
import json
import os
import random
import re
import sys
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]  # server/ の 1 つ上 = アプリのルート
MODELS = ROOT / "src" / "generated" / "models"
IMG_EXT = {".jpg", ".jpeg", ".png", ".webp", ".avif"}
NS = uuid.UUID("6f1c2f3e-7a54-4b8e-9a77-0c6b8a1d2e10")  # 画像由来のデータの ID 用(同じコードなら、同じ ID)

# 週次実績の週(既存のデモデータと同じ 12 週)
WEEKS = [date(2026, 7, 13) + timedelta(weeks=i) for i in range(12)]


# ---------------------------------------------------------------- 選択肢(Dataverse の数値と名前)
def choices(model: str, const: str) -> dict[str, int]:
    """src/generated/models/<model>.ts の選択肢(名前 → 数値)"""
    text = (MODELS / f"{model}.ts").read_text(encoding="utf-8")
    block = re.search(rf"export const {const} = \{{(.*?)\}} as const", text, re.S)
    if not block:
        raise SystemExit(f"選択肢が見つかりません: {model}.{const}")
    return {name: int(num) for num, name in re.findall(r"(\d+):\s*'([^']*)'", block.group(1))}


def load_enums() -> dict[str, dict[str, int]]:
    return {
        "category": choices("Cr854_productsModel", "Cr854_productscr854_category"),
        "season": choices("Cr854_productsModel", "Cr854_productscr854_season"),
        "weather": choices("Cr854_productsModel", "Cr854_productscr854_weather"),
        "trend": choices("Cr854_productsModel", "Cr854_productscr854_salestrend"),
        "market": choices("Cr854_productsModel", "Cr854_productscr854_market"),
        "purpose": choices("Cr854_heroimagesModel", "Cr854_heroimagescr854_purpose"),
        "hero_season": choices("Cr854_heroimagesModel", "Cr854_heroimagescr854_season"),
    }


# ---------------------------------------------------------------- 画像の一覧
def list_images(base: Path, only: str | None = None) -> dict[str, list[Path]]:
    """画像の一覧(グループごと)。only='us' / 'jp' なら、その市場のグループだけ。

    jp のフォルダが空なら、同じ種類の us のフォルダの画像を、日本向けにも使う(画像が、US / JP 共通のとき。
    日本向けは、同じ画像から、日本語の名前・説明で、別の商品・ヒーロー画像として作る)。
    """
    groups = ["products/jp", "products/us", "heroes/jp", "heroes/us"]
    out: dict[str, list[Path]] = {}

    def files(g: str) -> list[Path]:
        d = base / g
        return sorted([p for p in d.glob("*") if p.suffix.lower() in IMG_EXT], key=lambda p: p.name.lower()) if d.is_dir() else []

    for g in groups:
        if only and not g.endswith(f"/{only}"):
            continue
        found = files(g)
        if not found and g.endswith("/jp"):
            found = files(g[: -len("/jp")] + "/us")  # 共通の画像
        out[g] = found
    return out


def digest_for(path: Path, group: str) -> str:
    """解析結果・商品コードの元になる値。US は画像の内容のハッシュ。JP は、それに市場の印を足したもの(同じ画像でも、別の商品にするため)"""
    h = hashlib.sha1(path.read_bytes()).hexdigest()
    return hashlib.sha1((h + ":jp").encode()).hexdigest() if group.endswith("/jp") else h


def product_code(digest: str, used: set[str]) -> str:
    """商品コード: 6 桁の数字で、4 から始まる(400000〜499999)。画像の内容(ハッシュ)から決まるので、画像を足しても、既存のコードは変わらない"""
    n = int(digest, 16) % 100000
    while True:
        code = f"4{n:05d}"
        if code not in used:
            used.add(code)
            return code
        n = (n + 1) % 100000  # 重なったときは、次の番号


def code_for(group: str, index: int) -> str:
    prefix = {"products/jp": "P", "products/us": "U", "heroes/jp": "H", "heroes/us": "UH"}[group]
    return f"{prefix}{index + 1:02d}"


# ---------------------------------------------------------------- 1. 解析(Gemini)
def prompt_for(group: str, enums: dict[str, dict[str, int]]) -> str:
    us = group.endswith("/us")
    if group.startswith("products"):
        cats = " / ".join(enums["category"])
        lang = (
            "name は英語の商品名(30 文字以内)、description は英語で 60〜140 文字(素材感・用途・合わせやすさ)。"
            if us
            else "name は日本語の商品名(全角 15 文字以内)、description は日本語で 40〜70 文字(素材感・用途・合わせやすさ)。"
        )
        return (
            "あなたは、ファッション・雑貨の通販サイトの、商品企画の担当者です。画像に写っている商品について、次の JSON だけを返してください。\n"
            f'{{"name":"商品名","category":"{cats} のどれか 1 つ","season":"{" / ".join(enums["season"])} のどれか 1 つ",'
            f'"weather":"{" / ".join(enums["weather"])} のどれか 1 つ(いちばん合う天候)","description":"商品の説明"}}\n'
            f"{lang}\ncategory・season・weather は、上の日本語の候補から、そのまま選ぶ。画像にない情報(ブランド名・価格)は書かない。"
        )
    lang = (
        "name は、人が読む自然な英語のタイトル(例: Autumn Trench Walk。各単語の先頭は大文字、区切りは空白。ハイフン・アンダースコア・小文字だけの書き方は使わない。25 文字以内)、"
        "tags は英語の単語を、カンマ区切りで 3〜5 個、description は英語で 60〜140 文字。"
        if us
        else "name は、人が読む自然な日本語のタイトル(全角 20 文字以内。英字の羅列やファイル名のような書き方は使わない)、tags は日本語の単語を、カンマ区切りで 3〜5 個、description は日本語で 40〜80 文字。"
    )
    return (
        "あなたは、ファッション通販の、メール・プッシュ用のメイン(ヒーロー)画像を管理する担当者です。画像について、次の JSON だけを返してください。\n"
        f'{{"name":"画像名","purpose":"{" / ".join(enums["purpose"])} のどれか 1 つ(いちばん合う用途)",'
        f'"season":"{" / ".join(enums["hero_season"])} のどれか 1 つ","tags":"タグ","description":"画像の説明(雰囲気・使いどころ)"}}\n'
        f"{lang}\npurpose・season は、上の日本語の候補から、そのまま選ぶ。"
    )


def to_jpeg(path: Path, max_side: int = 1024, quality: int = 88) -> bytes:
    """どの形式(jpg / png / webp / avif。拡張子と中身が違っていても、中身で判定)でも、Gemini に渡せる JPEG にする"""
    from PIL import Image, ImageOps

    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        im.thumbnail((max_side, max_side))
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=quality)
        return buf.getvalue()


def analyze_one(client: Any, model: str, path: Path, group: str, enums: dict[str, dict[str, int]]) -> dict[str, Any]:
    from google.genai import types

    resp = client.models.generate_content(
        model=model,
        contents=[types.Part.from_bytes(data=to_jpeg(path), mime_type="image/jpeg"), prompt_for(group, enums)],
        config=types.GenerateContentConfig(response_mime_type="application/json", thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel.LOW)),
    )
    return json.loads(resp.text or "{}")


def cmd_analyze(base: Path, out: Path) -> None:
    from google import genai
    from google.genai import types

    from .creds import get_credentials

    enums = load_enums()
    model = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
    client = genai.Client(
        vertexai=True,
        project=os.environ["GOOGLE_CLOUD_PROJECT"],
        location=os.getenv("GOOGLE_CLOUD_LOCATION", "global"),
        credentials=get_credentials(),
        http_options=types.HttpOptions(timeout=90_000, retry_options=types.HttpRetryOptions(attempts=5, initial_delay=2.0, max_delay=30.0, http_status_codes=[429, 500, 503, 504])),
    )
    out.mkdir(parents=True, exist_ok=True)
    cache_path = out / "analysis.json"
    cache: dict[str, Any] = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}
    todo: list[tuple[str, Path, str]] = []
    for group, paths in list_images(base).items():
        for p in paths:
            key = digest_for(p, group)
            if key not in cache:
                todo.append((group, p, key))
    print(f"解析する画像: {len(todo)} 点(解析済み: {len(cache)} 点)")

    def work(item: tuple[str, Path, str]) -> tuple[str, dict[str, Any] | None, str]:
        group, p, key = item
        try:
            return key, analyze_one(client, model, p, group, enums), p.name
        except Exception as e:  # noqa: BLE001 — 1 点の失敗で、全体を止めない(あとで、再実行すれば、残りだけ解析する)
            print(f"  失敗: {p.name}: {type(e).__name__}: {str(e)[:120]}")
            return key, None, p.name

    with ThreadPoolExecutor(max_workers=4) as pool:
        for key, result, name in pool.map(work, todo):
            if result is not None:
                cache[key] = result
                print(f"  OK: {name} → {result.get('name')}")
                cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
    print("解析の結果:", cache_path)


# ---------------------------------------------------------------- 2. データの組み立て
CATEGORY_PRICE = {  # (日本円の下限, 上限, ドルの下限, 上限, 1 週間の販売数の目安)
    "アウター": (19800, 39800, 120, 260, 6),
    "トップス": (4800, 12800, 35, 110, 14),
    "ボトムス": (6800, 14800, 45, 120, 10),
    "シューズ": (8800, 19800, 70, 160, 8),
    "小物": (1980, 5800, 15, 55, 20),
    "バッグ": (6800, 19800, 55, 180, 7),
    "ホーム": (2980, 9800, 25, 90, 9),
}
STAGE = {  # 売上トレンド → (日本語の段階, 英語の段階)
    "上昇": ("主力", "Core"),
    "横ばい": ("定番", "Staple"),
    "下降": ("在庫調整", "Clearance"),
}
POLICY = {
    "上昇": (
        "伸びている売れ筋。メールの上位枠で訴求し、関連商品とのセット提案を行う。",
        "Rising best seller: feature in top slots and pair with related items.",
        ["10/15週: ハロウィン企画に関連掲載", "10/29週: 早期セールの対象に追加", "11/16週: 在庫に応じて追加訴求"],
        ["Week of 10/12: feature in the Halloween push", "Week of 10/26: add to the early-sale lineup", "Week of 11/16: promote again depending on stock"],
    ),
    "横ばい": (
        "定番として、安定して供給する。季節の切り口で、継続して露出する。",
        "Staple: supply steadily and keep exposure with seasonal angles.",
        ["10/19週: 季節特集の中で掲載", "11/09週: 週末のプッシュで訴求"],
        ["Week of 10/19: include in the seasonal feature", "Week of 11/09: promote in the weekend push"],
    ),
    "下降": (
        "在庫消化を優先する。値ごろ感を打ち出し、まとめ買いの提案につなげる。",
        "Clearance: prioritize selling through stock; stress value and bundle offers.",
        ["10/22週: 価格訴求の特集に掲載", "11/12週: 在庫に応じて、セール対象を拡大"],
        ["Week of 10/22: include in a value-focused feature", "Week of 11/12: widen the sale depending on stock"],
    ),
}


def pick_trend(rng: random.Random) -> str:
    return rng.choices(["上昇", "横ばい", "下降"], weights=[35, 45, 20])[0]


def make_price(rng: random.Random, category: str, us: bool) -> int | float:
    lo_jp, hi_jp, lo_us, hi_us, _ = CATEGORY_PRICE.get(category, CATEGORY_PRICE["小物"])
    if us:
        return int(round(rng.uniform(lo_us, hi_us) / 2) * 2 - 2)  # 偶数 − 2(例: 98, 148)
    return int(round(rng.uniform(lo_jp, hi_jp) / 1000) * 1000 - 200)  # 千円 − 200(例: 9800)


def weekly_rows(rng: random.Random, code: str, category: str, price: float, stock_now: int, trend: str) -> list[dict[str, Any]]:
    base = CATEGORY_PRICE.get(category, CATEGORY_PRICE["小物"])[4]
    scale = rng.uniform(0.7, 1.3)
    n = len(WEEKS)
    units: list[int] = []
    for i in range(n):
        t = i / (n - 1)
        factor = {"上昇": 0.6 + 1.2 * t, "横ばい": 1.0, "下降": 1.4 - 0.9 * t}[trend]
        units.append(max(1, round(base * scale * factor * rng.uniform(0.85, 1.15))))
    rows = []
    for i, w in enumerate(WEEKS):
        stock = stock_now + sum(units[i + 1 :])  # 今の在庫から、さかのぼる(週ごとに、売れた分だけ減っている)
        rows.append({"cr854_weeklyperformanceid": str(uuid.uuid5(NS, f"weekly:{code}:{w.isoformat()}")), "cr854_name": f"{code} {w.isoformat()}", "cr854_productcode": code, "cr854_weekstart": w.isoformat(), "cr854_units": units[i], "cr854_revenue": round(units[i] * price, 2), "cr854_stock": stock})
    return rows


def cmd_build(base: Path, out: Path, only: str | None = None) -> None:
    enums = load_enums()
    cache = json.loads((out / "analysis.json").read_text(encoding="utf-8"))
    products: list[dict[str, Any]] = []
    heroes: list[dict[str, Any]] = []
    weekly: list[dict[str, Any]] = []
    policies: list[dict[str, Any]] = []
    manifest: list[dict[str, Any]] = []
    missing = 0
    used_codes: set[str] = set()
    for group, paths in list_images(base, only).items():
        us = group.endswith("/us")
        market = enums["market"]["US" if us else "JP"]
        for i, p in enumerate(paths):
            key = digest_for(p, group)
            a = cache.get(key)
            if a is None:
                print(f"  未解析: {p} (先に analyze を実行してください)")
                missing += 1
                continue
            kind = "products" if group.startswith("products") else "heroes"
            code = product_code(key, used_codes) if kind == "products" else code_for(group, i)
            url = f"/img/{kind}/{code}.jpg"
            manifest.append({"src": str(p), "kind": kind, "code": code})
            rng = random.Random(f"ccp-import:{code}")
            if kind == "products":
                category = a.get("category") if a.get("category") in enums["category"] else "小物"
                trend = pick_trend(rng)
                price = make_price(rng, category, us)
                stock = rng.randint(8, 45) if rng.random() < 0.12 else rng.randint(60, 320)
                products.append(
                    {
                        "cr854_productid": str(uuid.uuid5(NS, f"product:{code}")),
                        "cr854_productcode": code,
                        "cr854_name": a.get("name", code),
                        "cr854_category": enums["category"][category],
                        "cr854_price": price,
                        "cr854_stock": stock,
                        "cr854_season": enums["season"].get(a.get("season", ""), enums["season"]["通年"]),
                        "cr854_salestrend": enums["trend"][trend],
                        "cr854_rating": round(rng.uniform(3.8, 4.8), 1),
                        "cr854_weather": enums["weather"].get(a.get("weather", ""), enums["weather"]["晴れ"]),
                        "cr854_description": a.get("description", ""),
                        "cr854_imageurl": url,
                        "cr854_market": market,
                    }
                )
                weekly += weekly_rows(rng, code, category, price, stock, trend)
                jp, en, plan_jp, plan_en = POLICY[trend]
                stage_jp, stage_en = STAGE[trend]
                policies.append(
                    {
                        "cr854_productpolicyid": str(uuid.uuid5(NS, f"policy:{code}")),
                        "cr854_name": code,
                        "cr854_productcode": code,
                        "cr854_policy": en if us else jp,
                        "cr854_promoplan": "\n".join(plan_en if us else plan_jp),
                        "cr854_promoperiod": "2026-10-19 - 2026-12-14",
                        "cr854_stage": stage_en if us else stage_jp,
                    }
                )
            else:
                heroes.append(
                    {
                        "cr854_heroimageid": str(uuid.uuid5(NS, f"hero:{code}")),
                        "cr854_imagecode": code,
                        "cr854_name": a.get("name", code),
                        "cr854_purpose": enums["purpose"].get(a.get("purpose", ""), enums["purpose"]["特集"]),
                        "cr854_season": enums["hero_season"].get(a.get("season", ""), enums["hero_season"]["通年"]),
                        "cr854_tags": a.get("tags", ""),
                        "cr854_description": a.get("description", ""),
                        "cr854_imageurl": url,
                        "cr854_market": market,
                    }
                )
    if missing:
        raise SystemExit(f"未解析の画像が {missing} 点あります。analyze を実行してください")
    data = {"cr854_products": products, "cr854_heroimages": heroes, "cr854_weeklyperformances": weekly, "cr854_productpolicies": policies}
    (out / "data.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"組み立て: 商品 {len(products)} / ヒーロー画像 {len(heroes)} / 週次実績 {len(weekly)} / 販売方針 {len(policies)}  →  {out / 'data.json'}")
    print("内容を確認する場合は、data.json を開いてください(名前・カテゴリ・説明などは、直してから、upload / apply できます)")


# ---------------------------------------------------------------- 3. 画像を GCS へ
def cmd_upload(out: Path) -> None:
    from PIL import Image, ImageOps

    from . import assets

    manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
    for m in manifest:
        with Image.open(m["src"]) as im:
            im = ImageOps.exif_transpose(im).convert("RGB")
            im.thumbnail((1000, 1000) if m["kind"] == "products" else (1920, 1920))
            buf = io.BytesIO()
            im.save(buf, "JPEG", quality=85, optimize=True)
        assets.put_object(assets.object_name(m["kind"], f"{m['code']}.jpg"), buf.getvalue(), "image/jpeg")
        print(f"  アップロード: {m['kind']}/{m['code']}.jpg ({len(buf.getvalue()) // 1024} KB)")
    print(f"画像 {len(manifest)} 点を、バケット {assets.bucket()} に置きました")


# ---------------------------------------------------------------- 4. DB の置き換え
async def cmd_apply(out: Path, yes: bool, only: str | None = None) -> None:
    from sqlalchemy import text

    from . import schema as sc
    from .db import get_engine

    data = json.loads((out / "data.json").read_text(encoding="utf-8"))
    schema = sc.load()
    enums = load_enums()
    market = enums["market"]["US" if only == "us" else "JP"] if only else None
    if only:
        # --only で作ったデータ(その市場だけ)かを確かめる(別の市場を、巻き込んで消さないため)
        for dv in ("cr854_products", "cr854_heroimages"):
            if any(r["cr854_market"] != market for r in data.get(dv, [])):
                raise SystemExit(f"data.json に、{only.upper()} 以外の市場のデータがあります。build --only {only} でやり直してください")
    counts = ", ".join(f"{schema.table(k).pg} {len(v)} 件" for k, v in data.items())
    scope = f"{only.upper()} 向けだけ" if only else "全市場"
    print(f"置き換える範囲: {scope}")
    print(f"新しい内容: {counts}")
    print(f"あわせて、{scope}の商品・メイン画像を選んでいる配信カードの、選択を外します(カードの文章・日時・状態は、そのまま)")
    if not yes:
        print("--yes を付けると、実行します(いまは、確認だけ)")
        return
    engine = await get_engine()
    async with engine.begin() as conn:
        if only:
            p = {"m": market}
            await conn.execute(text("DELETE FROM delivery_products WHERE product_id IN (SELECT id FROM products WHERE market = :m)"), p)
            await conn.execute(text("UPDATE delivery_cards SET hero_image_id = NULL, hero_reason = NULL, modified_on = now() WHERE hero_image_id IN (SELECT id FROM hero_images WHERE market = :m)"), p)
            await conn.execute(text("DELETE FROM weekly_performances WHERE product_code IN (SELECT product_code FROM products WHERE market = :m)"), p)
            await conn.execute(text("DELETE FROM product_policies WHERE product_code IN (SELECT product_code FROM products WHERE market = :m)"), p)
            await conn.execute(text("DELETE FROM products WHERE market = :m"), p)
            await conn.execute(text("DELETE FROM hero_images WHERE market = :m"), p)
        else:
            await conn.execute(text("DELETE FROM delivery_products"))
            await conn.execute(text("UPDATE delivery_cards SET hero_image_id = NULL, hero_reason = NULL, modified_on = now()"))
            for dv in ("cr854_weeklyperformances", "cr854_productpolicies", "cr854_products", "cr854_heroimages"):
                await conn.execute(text(f"DELETE FROM {schema.table(dv).pg}"))
        for dv in ("cr854_heroimages", "cr854_products", "cr854_weeklyperformances", "cr854_productpolicies"):
            t = schema.table(dv)
            for rec in data.get(dv, []):
                values = t.to_db(rec)
                values["id"] = sc.coerce("uuid", rec[t.pk])
                cols = list(values)
                await conn.execute(text(f"INSERT INTO {t.pg} ({', '.join(cols)}) VALUES ({', '.join(':' + c for c in cols)})"), values)
    print("DB を置き換えました")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("step", choices=["analyze", "build", "upload", "apply", "all"])
    p.add_argument("--dir", default=str(ROOT / "import"), help="画像のフォルダ(既定: アプリのルートの import/)")
    p.add_argument("--yes", action="store_true", help="apply で、DB を実際に置き換える")
    p.add_argument("--only", choices=["jp", "us"], help="その市場の画像・データだけを扱う(build / apply)。もう一方の市場のデータは、そのまま残す")
    args = p.parse_args()
    base = Path(args.dir)
    out = base / "out"
    steps = ["analyze", "build", "upload", "apply"] if args.step == "all" else [args.step]
    for s in steps:
        if s == "analyze":
            cmd_analyze(base, out)
        elif s == "build":
            cmd_build(base, out, args.only)
        elif s == "upload":
            cmd_upload(out)
        else:
            asyncio.run(cmd_apply(out, args.yes, args.only))


if __name__ == "__main__":
    main()
