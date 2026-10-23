#!/usr/bin/env python3
"""見本の商品の写真を AI(Vertex AI の Gemini の画像のモデル)で作り、取り込める ZIP にする(開発側の手元の PC で実行する)。

見本のデータの商品(server/seed.json)の画像を、EC の商品写真のような写真にし、見本の商品ページ(/sample-shop/p/<商品コード>)に
メインの画像・説明の中で使う画像(素材・ディテール・着用など)・その説明の文を出すため。外に出られない環境(Workbench)でも、
商品ページを読む機能・「この配信で使う画像」・AI の勧めを、本物のページのように試せる。

  python scripts/sample-photos.py generate                 足りない写真を作る(できた写真は飛ばすので、止めても続きから。1 枚ごとに費用がかかる)
  python scripts/sample-photos.py generate --only wool-coat --redo 2   1 商品の 2 枚目だけ作り直す
  python scripts/sample-photos.py draft --products 商品.json --spec import/prod.json   商品の一覧から、注文の文・見出し・説明を AI で下書きする
  python scripts/sample-photos.py generate --spec import/prod.json --out import/prod-photos   下書きで作る
  python scripts/sample-photos.py zip                      ZIP にする(⚙ →「商品の写真の ZIP を取り込む」か、python -m ccp.cli import-images で取り込む)
  python scripts/sample-photos.py fill-main --spec import/prod.json [--products 商品.json]   メインの写真に説明の文がなければ、AI で足す
  python scripts/sample-photos.py draft-heroes --products 商品.json --spec import/heroes.json   メイン画像(ヒーロー)の注文の文を下書きする
  python scripts/sample-photos.py generate --spec import/heroes.json --out import/hero-photos    ヒーローの写真(横長 1 枚)を作る。zip も同じ

- 何を作るかは scripts/sample-photos.json(商品ごとの注文の文・見出し・説明)。先頭の 1 枚がメイン。2 枚目からは、メインの画像を
  手本として渡し、同じ商品として作る(色・形がそろう)
- 写真は import/sample-photos/ に置く(Git に入れない)。ZIP の目録には「見本」の印(sample)を付ける。取り込むと、表 product_images の
  行に source = sample が入り、本物の画像を取り込んだ商品では、本物が優先される
- 本物の商品(利用先・本番の商品の一覧)に合わせて作るときは、draft で下書きを import/ の下に作る(商品の名前・説明は実データなので、
  リポジトリに入れない)。商品の一覧は、⚙ の「データと画像を書き出す」の ZIP の data.json の products(か、その形の JSON)
- メイン画像(表 hero_images)も、同じ流れで 1 枚ずつ作る(spec の kind = heroes)。ZIP は同じ入口で取り込み、hero_images の画像を差し替える
  (前の画像は original_image_url に控える)。行は id で探す(本番のパックから下書きしたなら、本番の行に当たる)
- 認証は、この PC の gcloud(gcloud auth print-access-token と、いまのプロジェクト)。プロジェクト ID・トークンは、ファイルに書かない
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
import zipfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEC = Path(__file__).with_suffix(".json")
OUT = ROOT / "import" / "sample-photos"
MODEL = "gemini-3-pro-image"  # --model で替えられる(gemini-2.5-flash-image は安く速いが、質は下がる)
TEXT_MODEL = "gemini-3.5-flash"
MAX_SIDE = 1200
HERO_SIDE = 1600  # メイン画像は横長で、テンプレートごとに切り出して大きく出すので、商品より大きく
PAUSE = 6  # 1 枚ごとに待つ秒(回数の上限に当たりにくくする)
MARKETS = ("JP", "US")  # sample-photos.json の codes・title・caption の並び(商品に markets がなければ)


def gcloud(*args: str) -> str:
    # Windows では gcloud は .cmd なので、シェルを通す
    return subprocess.run(["gcloud", *args], capture_output=True, text=True, check=True, shell=sys.platform == "win32").stdout.strip()


class Auth:
    """gcloud のトークンは 1 時間で切れるので、40 分ごとに取り直す(数時間かかる生成を、途中で全部失敗させないため)"""

    def __init__(self) -> None:
        self.project = gcloud("config", "get-value", "project")
        self.at = 0.0
        self._token = ""

    @property
    def token(self) -> str:
        if time.time() - self.at > 40 * 60:
            self._token, self.at = gcloud("auth", "print-access-token"), time.time()
        return self._token


def to_jpeg(data: bytes, side: int = MAX_SIDE) -> bytes:
    from PIL import Image

    im = Image.open(io.BytesIO(data)).convert("RGB")
    im.thumbnail((side, side))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=88, optimize=True, progressive=True)
    return buf.getvalue()


def ask(project: str, token: str, prompt: str, ref: bytes | None, aspect: str = "3:4") -> bytes:
    parts: list[dict] = []
    if ref is not None:
        parts.append({"inlineData": {"mimeType": "image/jpeg", "data": base64.b64encode(ref).decode()}})
    parts.append({"text": prompt})
    body = {"contents": [{"role": "user", "parts": parts}], "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": aspect}}}
    url = f"https://aiplatform.googleapis.com/v1/projects/{project}/locations/global/publishers/google/models/{MODEL}:generateContent"
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:
        j = json.loads(r.read())
    for p in (j.get("candidates") or [{}])[0].get("content", {}).get("parts", []):
        if p.get("inlineData"):
            return base64.b64decode(p["inlineData"]["data"])
    raise RuntimeError(f"画像が返りませんでした: {json.dumps(j, ensure_ascii=False)[:300]}")


def shot_file(prod: dict, i: int, shot: dict) -> Path:
    return OUT / prod["key"] / f"{i + 1:02d}-{shot['angle']}.jpg"


def generate(spec: dict, only: list[str], redo: list[int]) -> None:
    auth = Auth()
    hero = spec.get("kind") == "heroes"
    # 下書き(draft)には撮り方の決まりを持たせず、ここの sample-photos.json のものを使う(どの商品も同じ撮り方にそろえる)
    style = spec.get("style") or json.loads(SPEC.read_text(encoding="utf-8"))["style"]
    made = 0
    for prod in spec["products"]:
        if only and prod["key"] not in only:
            continue
        (OUT / prod["key"]).mkdir(parents=True, exist_ok=True)
        main_file = shot_file(prod, 0, prod["shots"][0])
        for i, shot in enumerate(prod["shots"]):
            f = shot_file(prod, i, shot)
            if f.exists() and (i + 1) not in redo:
                continue
            ref = None
            prompt = f"{shot['prompt']} {style[shot['style']]}"
            if i > 0 and not main_file.exists():
                # メインが作れなかった(429 が続いた など)。サブはメインを手本にするので、この商品は次に流したときに作る
                print(f"  {prod['key']}: メインがないので、サブは飛ばします")
                break
            if i > 0:
                # サブは、メインの画像を手本に渡して、同じ商品として作る
                ref = main_file.read_bytes()
                prompt = f"{style['reference']} {prompt}"
            for attempt in range(6):
                try:
                    t0 = time.time()
                    data = ask(auth.project, auth.token, prompt, ref, "4:3" if hero else "3:4")
                    break
                except (urllib.error.URLError, RuntimeError) as e:
                    # 429(1 分あたりの回数の上限)が出やすいので、長めに待ってやり直す
                    print(f"  {prod['key']} {i + 1}: やり直し({e})")
                    time.sleep(30 * (attempt + 1))
            else:
                print(f"  {prod['key']} {i + 1}: 作れませんでした")
                continue
            # 一時ファイルに書いてから名前を替える(途中で止めても、壊れた写真が「できた」として飛ばされないように)
            tmp = f.with_suffix(".tmp")
            tmp.write_bytes(to_jpeg(data, HERO_SIDE if hero else MAX_SIDE))
            tmp.replace(f)
            made += 1
            time.sleep(PAUSE)
            print(f"{prod['key']} {i + 1}/{len(prod['shots'])} {shot['angle']}: {f}({time.time() - t0:.0f} 秒)")
    print(f"作った写真: {made} 枚")


def make_hero_zip(spec: dict, path: Path, max_mb: float) -> None:
    """メイン画像の ZIP。目録の kind = heroes で、商品の ZIP と同じ入口(⚙・import-images)が見分ける。行は id(なければ画像コードと市場)で探す"""
    groups: list[list[dict]] = [[]]
    size = 0.0
    for h in spec["products"]:
        f = shot_file(h, 0, h["shots"][0])
        if not f.exists():
            print(f"  {h['key']}: 写真がないので入れません")
            continue
        mb = f.stat().st_size / 1024 / 1024
        if groups[-1] and size + mb > max_mb:
            groups.append([])
            size = 0.0
        groups[-1].append(h)
        size += mb
    for n, group in enumerate(groups, start=1):
        target = path if len(groups) == 1 else path.with_name(f"{path.stem}_{n}{path.suffix}")
        heroes = []
        with zipfile.ZipFile(target, "w", zipfile.ZIP_STORED) as z:
            for h in group:
                f = shot_file(h, 0, h["shots"][0])
                data = f.read_bytes()
                z.write(f, f"heroes/{h['key']}/{f.name}")
                heroes.append({"id": h.get("id"), "image_code": h.get("image_code"), "market": h.get("market"), "file": f"{h['key']}/{f.name}",
                               "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(), "content_type": "image/jpeg"})
            manifest = {"made_at": datetime.now().astimezone().isoformat(timespec="seconds"), "sample": True, "kind": "heroes", "heroes": heroes, "images": len(heroes)}
            z.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        print(f"メイン画像 {len(heroes)} 枚({target.stat().st_size / 1024 / 1024:.1f}MB) → {target}")


def make_zip(spec: dict, path: Path, max_mb: float) -> None:
    """collect-product-images.py と同じ形の目録(manifest.json)に、見本の印・見出し・説明・アングルを足す。
    ⚙ から取り込む(1 回で送れる大きさに上限がある)ため、max_mb を超えるときは、商品の切れ目で ZIP を分ける(_1・_2 …)"""
    groups: list[list[dict]] = [[]]
    size = 0.0
    for prod in spec["products"]:
        files = [shot_file(prod, i, s) for i, s in enumerate(prod["shots"])]
        if not all(f.exists() for f in files):
            print(f"  {prod['key']}: 写真がそろっていないので入れません")
            continue
        mb = sum(f.stat().st_size for f in files) / 1024 / 1024
        if groups[-1] and size + mb > max_mb:
            groups.append([])
            size = 0.0
        groups[-1].append(prod)
        size += mb
    for n, group in enumerate(groups, start=1):
        target = path if len(groups) == 1 else path.with_name(f"{path.stem}_{n}{path.suffix}")
        products = []
        with zipfile.ZipFile(target, "w", zipfile.ZIP_STORED) as z:
            for prod in group:
                files = [shot_file(prod, i, s) for i, s in enumerate(prod["shots"])]
                for f in files:
                    z.write(f, f"products/{prod['key']}/{f.name}")
                markets = prod.get("markets") or MARKETS
                for m, code in enumerate(prod["codes"]):
                    imgs = []
                    for i, (shot, f) in enumerate(zip(prod["shots"], files)):
                        data = f.read_bytes()
                        imgs.append({"file": f"{prod['key']}/{f.name}", "src": f"sample:{prod['key']}/{f.name}", "alt": (shot.get("title") or ["", ""])[m],
                                     "caption": (shot.get("caption") or ["", ""])[m], "angle": shot["angle"], "bytes": len(data),
                                     "sha256": hashlib.sha256(data).hexdigest(), "content_type": "image/jpeg", "main": i == 0})
                    products.append({"product_code": code, "market": markets[m], "images": imgs, "error": None})
            manifest = {"made_at": datetime.now().astimezone().isoformat(timespec="seconds"), "sample": True, "products": products,
                        "images": sum(len(p["images"]) for p in products), "errors": 0}
            z.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        print(f"{len(products)} 商品・画像 {manifest['images']} 枚({target.stat().st_size / 1024 / 1024:.1f}MB) → {target}")


DRAFT = """You plan photos for a sample e-commerce product page. The product below is a real item in a store's catalog; we need four
NEW, generic photos of a similar product (no brand, no logo, not a copy of any real product). Return JSON only:
{"shots": [
  {"angle": "front", "style": "product", "prompt": "<one English sentence: the item itself, color, material, shape, how it is shown (ghost mannequin, flat lay, pair at three-quarter angle, ...)>", "title": "<short heading>", "caption": "<one or two sentences describing the item as a whole>"},
  {"angle": "texture" | "detail", "style": "detail", "prompt": "<English: a macro close-up that shows the material or a key detail>", "title": "<short heading>", "caption": "<one or two sentences>"},
  {"angle": "worn" | "scene", "style": "worn" | "scene", "prompt": "<English: the item worn (face not visible) or in a calm lifestyle scene>", "title": "...", "caption": "..."},
  {"angle": "detail" | "texture" | "scene", "style": "detail" | "scene", "prompt": "<English: another strength>", "title": "...", "caption": "..."}
]}
- Base the strengths on the product description. Do not invent certifications, percentages or claims that are not in it.
- title and caption are what the product page shows next to each photo: write them in %LANG%, in the tone of a calm apparel store.
- Never describe people's faces, brands, logos or text in the prompts.
Product: %PRODUCT%"""


def ask_text(project: str, token: str, prompt: str) -> dict:
    body = {"contents": [{"role": "user", "parts": [{"text": prompt}]}], "generationConfig": {"responseMimeType": "application/json"}}
    url = f"https://aiplatform.googleapis.com/v1/projects/{project}/locations/global/publishers/google/models/{TEXT_MODEL}:generateContent"
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        j = json.loads(r.read())
    return json.loads(j["candidates"][0]["content"]["parts"][0]["text"])


def draft(products_path: Path, spec_path: Path) -> None:
    """商品の一覧から、商品ごとの注文の文・見出し・説明を AI で下書きする。済んだ商品は飛ばす(途中で止めても続きから)"""
    src = json.loads(products_path.read_text(encoding="utf-8"))
    rows = src.get("products") or src.get("tables", {}).get("products") or []
    spec = json.loads(spec_path.read_text(encoding="utf-8")) if spec_path.exists() else {"products": []}
    done = {p["key"] for p in spec["products"]}
    auth = Auth()
    for row in rows:
        code, market = str(row.get("product_code") or ""), row.get("market") or "JP"
        key = f"{market}-{code}".lower()
        if not code or key in done:
            continue
        info = {k: row.get(k) for k in ("name", "category", "gender", "season", "description")}
        prompt = DRAFT.replace("%LANG%", "Japanese" if market == "JP" else "English").replace("%PRODUCT%", json.dumps(info, ensure_ascii=False))
        out = None
        for attempt in range(4):
            try:
                out = ask_text(auth.project, auth.token, prompt)
                break
            except Exception as e:  # noqa: BLE001 — 429 などは待ってやり直す。だめなら飛ばし、あとで流し直す
                print(f"  {key}: やり直し({e})")
                time.sleep(20 * (attempt + 1))
        if out is None:
            continue
        shots = [{**sh, "title": [sh["title"]] if sh.get("title") else None, "caption": [sh["caption"]] if sh.get("caption") else None} for sh in out.get("shots", [])][:4]
        if len(shots) < 2 or shots[0].get("style") != "product":
            print(f"  {key}: 下書きの形が違うので飛ばします")
            continue
        spec["products"].append({"key": key, "codes": [code], "markets": [market], "shots": [{k: v for k, v in sh.items() if v is not None} for sh in shots]})
        spec_path.write_text(json.dumps(spec, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{key}: {row.get('name')}")
    print(f"下書き: {len(spec['products'])} 商品 → {spec_path}")


DRAFT_HERO = """You plan a NEW, generic seasonal key visual for an apparel online store. Below is the description of the store's current
key visual; write one English sentence for an image generator that keeps its idea (season, items, colors, setting, mood) but is a new
photograph (no brand, no logo, not a copy of any real photo). Return JSON only: {"prompt": "<one English sentence>"}
- Never describe people's faces, brands, logos or text. If people appear, show them from behind, turned away, or cropped below the face.
- Keep the apparel items clearly visible; they are what the campaign sells.
Key visual: %HERO%"""


def draft_heroes(products_path: Path, spec_path: Path) -> None:
    """メイン画像(hero_images)の一覧から、1 枚ずつの注文の文を AI で下書きする。済んだものは飛ばす"""
    src = json.loads(products_path.read_text(encoding="utf-8"))
    rows = src.get("hero_images") or src.get("tables", {}).get("hero_images") or []
    spec = json.loads(spec_path.read_text(encoding="utf-8")) if spec_path.exists() else {"kind": "heroes", "products": []}
    done = {p["key"] for p in spec["products"]}
    auth = Auth()
    for row in rows:
        key = f"hero-{row.get('market') or ''}-{row.get('image_code') or row['id'][:8]}".lower()
        if key in done:
            continue
        info = {k: row.get(k) for k in ("name", "season", "tags", "description")}
        out = None
        for attempt in range(4):
            try:
                out = ask_text(auth.project, auth.token, DRAFT_HERO.replace("%HERO%", json.dumps(info, ensure_ascii=False)))
                break
            except Exception as e:  # noqa: BLE001 — 429 などは待ってやり直す。だめなら飛ばし、あとで流し直す
                print(f"  {key}: やり直し({e})")
                time.sleep(20 * (attempt + 1))
        if not out or not out.get("prompt"):
            continue
        spec["products"].append({"key": key, "id": row["id"], "image_code": row.get("image_code"), "market": row.get("market"),
                                 "shots": [{"angle": "hero", "style": "hero", "prompt": out["prompt"]}]})
        spec_path.write_text(json.dumps(spec, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{key}: {row.get('name')}")
    print(f"下書き: メイン画像 {len(spec['products'])} 枚 → {spec_path}")


FILL_MAIN = """Write the description of the MAIN photo of an apparel product on a calm online store's product page. The photo shows
the item itself (no person). Return JSON only: {"items": [{"title": "<short heading>", "caption": "<one or two sentences describing the item as a whole>"}, ...]}
with one item per language, in this order: %LANGS%. Base it on the product and the photo order below; do not invent certifications,
percentages or claims. Product: %PRODUCT%"""


def fill_main(spec_path: Path, products_path: Path | None) -> None:
    """メインの写真に説明の文がない商品に、見出しと説明を AI で足す(画像 1 枚ごとに説明を持たせる。利用者の依頼 2026-10-23)。
    済んだ商品は飛ばす。商品の一覧(--products)があれば、名前・説明も材料に渡す"""
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    rows = {}
    if products_path:
        src = json.loads(products_path.read_text(encoding="utf-8"))
        rows = {f"{r.get('market') or 'JP'}-{r.get('product_code')}".lower(): r for r in src.get("products") or src.get("tables", {}).get("products") or []}
    auth = Auth()
    done = 0
    for prod in spec["products"]:
        main = prod["shots"][0]
        if main.get("caption"):
            continue
        markets = prod.get("markets") or MARKETS
        langs = ", ".join("Japanese" if m == "JP" else "English" for m in markets)
        row = rows.get(prod["key"]) or {}
        info = {**{k: row.get(k) for k in ("name", "category", "description") if row.get(k)}, "main_photo": main["prompt"],
                "other_photos": [(sh.get("title") or [""])[0] for sh in prod["shots"][1:]]}
        out = None
        for attempt in range(4):
            try:
                out = ask_text(auth.project, auth.token, FILL_MAIN.replace("%LANGS%", langs).replace("%PRODUCT%", json.dumps(info, ensure_ascii=False)))
                break
            except Exception as e:  # noqa: BLE001 — 429 などは待ってやり直す。だめなら飛ばし、あとで流し直す
                print(f"  {prod['key']}: やり直し({e})")
                time.sleep(20 * (attempt + 1))
        items = (out or {}).get("items") or []
        if len(items) != len(markets):
            print(f"  {prod['key']}: 説明を作れませんでした")
            continue
        main["title"] = [i.get("title") or "" for i in items]
        main["caption"] = [i.get("caption") or "" for i in items]
        spec_path.write_text(json.dumps(spec, ensure_ascii=False, indent=1), encoding="utf-8")
        done += 1
        print(f"{prod['key']}: {main['caption'][0][:60]}")
    print(f"メインの説明を足した商品: {done}")


def main() -> int:
    global OUT, MODEL
    ap = argparse.ArgumentParser(description="見本の商品の写真を AI で作り、取り込める ZIP にする")
    ap.add_argument("cmd", choices=["draft", "draft-heroes", "fill-main", "generate", "zip"])
    ap.add_argument("--spec", type=Path, default=SPEC, help="何を作るか(既定 scripts/sample-photos.json)")
    ap.add_argument("--out", type=Path, default=None, help="写真を置くフォルダ(既定 import/sample-photos)")
    ap.add_argument("--model", default=MODEL, help=f"画像のモデル(既定 {MODEL}。安く速くするなら gemini-2.5-flash-image。モデルを替えたら --out も替える)")
    ap.add_argument("--products", type=Path, help="draft: 商品の一覧の JSON(パックの data.json など)")
    ap.add_argument("--only", nargs="*", default=[], help="この商品(sample-photos.json の key)だけ")
    ap.add_argument("--redo", nargs="*", type=int, default=[], help="この番号の写真(1 がメイン)を作り直す")
    ap.add_argument("--zip", type=Path, default=None, help="作る ZIP(既定 <写真のフォルダ>/sample_photos.zip)")
    ap.add_argument("--max-mb", type=float, default=25, help="1 つの ZIP の大きさの上限(MB。⚙ から取り込むときの上限 30MB より小さく)")
    args = ap.parse_args()
    MODEL = args.model
    if args.out:
        OUT = args.out.resolve()
    if args.cmd == "fill-main":
        fill_main(args.spec, args.products)
        return 0
    if args.cmd in ("draft", "draft-heroes"):
        (draft if args.cmd == "draft" else draft_heroes)(args.products, args.spec)
        return 0
    spec = json.loads(args.spec.read_text(encoding="utf-8"))
    if args.cmd == "generate":
        generate(spec, args.only, args.redo)
    else:
        (make_hero_zip if spec.get("kind") == "heroes" else make_zip)(spec, args.zip or OUT / "sample_photos.zip", args.max_mb)
    return 0


if __name__ == "__main__":
    sys.exit(main())
