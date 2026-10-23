"""商品ページから、配信で使う商品の画像を選ぶ(X64)。

AI が選んだ商品の画像は、最初は商品のマスタの 1 枚(products.image_url)。強みがもっと伝わる画像に替えたいとき、
商品ページの画像を集めて並べ、AI がアングル(正面・着用・ディテール など)を見分けて、この配信に合うものを勧める。
選んだ画像は、配信に載せた商品の行(delivery_products.image_url)に入れる(商品のマスタは変えない。配信ごと・AB テストの案ごと)。

  POST /api/product-pages/images    {"url": "..."}           ページを読み、載っている画像の一覧を返す
  POST /api/product-pages/suggest   {"images": [...], ...}   画像を Gemini に見せ、アングルと、この配信に合う画像(理由つき)を返す
  POST /api/product-pages/adopt     {"src": "..."}           選んだ画像を、素材の置き場所(ccp/creative.py)に写し、その URL を返す

取り込んだ商品の画像(表 product_images。B11。docs/PRODUCT_IMAGES.md)があれば、画面はページを読まずに、それを候補に並べる。
その画像(/img/products/…)は、AI に見せるときも、このサーバーの置き場所から読む(Workbench は EC サイトを読めないため)
  GET  /sample-shop/p/{code}                                 見本の商品ページ
  GET  /sample-shop/img/{code}/{angle}.svg                   見本の商品ページの画像

見本の EC サイト: 商品ページの URL は、いま仮の https://shop.example.com/p/<商品コード>(src/links.ts の SHOP_URL)。
外に出られない環境(Workbench)でも流れを最後まで試せるよう、その URL(と /sample-shop/ の下)は、通信せずに、ここで作った見本のページを読む。
ページの画像を拾う処理は、本物のページと同じものを通す。本物の URL は、サーバーが読む(ccp/linkpreview.py と同じ安全策。外に出られない環境では失敗する)。
見本の写真(AI で作った EC の商品写真。表 product_images の source = sample。scripts/sample-photos.py → ccp.cli import-images)があれば、
ページは本物の商品ページのように、メインの写真・素材やディテールの写真と、その説明の文を出す(左上に小さく「見本」)。写真は /img/products/… なので、
AI にも写真として見せられる。写真がない商品は、これまでの絵(SVG。sample_shop/ の型に、商品ごとの色を入れる)のページ。
絵は、AI には画像ではなく SVG のソースを文字で見せる(Gemini は SVG を画像として受け付けないため)。
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import re
import uuid
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse, Response
from google.genai import types
from pydantic import BaseModel
from sqlalchemy import text

from . import assets, creative, linkpreview
from . import schema as sc
from .ai import _get_client
from .data_api import db, fail, ok

log = logging.getLogger("ccp.product_pages")
router = APIRouter()

SAMPLE_HOST = "shop.example.com"
SAMPLE_DIR = Path(__file__).resolve().parent / "sample_shop"
ANGLES = ("front", "back", "worn", "detail", "texture", "scene")
# 見本のページの画像の説明(本物のページの alt と同じ役目。AI はこれではなく絵そのものを見る)
ALTS = {"front": "front view", "back": "back view", "worn": "on model", "detail": "close-up of buttons and stitching", "texture": "fabric texture", "scene": "lifestyle scene"}
SAMPLE_IMG = re.compile(r"^/sample-shop/img/([A-Za-z0-9_-]{1,40})/(" + "|".join(ANGLES) + r")\.svg$")
MAX_IMAGES = 24
MAX_SUGGEST = 8
RASTER = {"image/jpeg", "image/png", "image/webp"}


# ---- 見本の EC サイト ----


def _colors(code: str) -> dict[str, str]:
    """商品コードから、決まった色を作る(同じ商品は、いつも同じ色)"""
    h = int(hashlib.sha1(code.encode()).hexdigest()[:6], 16)
    hue = h % 360

    def hsl(s: int, l: int) -> str:
        return f"hsl({hue}, {s}%, {l}%)"

    return {"main": hsl(45, 52), "dark": hsl(50, 28), "light": hsl(40, 86), "bg": hsl(20, 95)}


def sample_svg(code: str, angle: str) -> str:
    src = (SAMPLE_DIR / f"{angle}.svg").read_text(encoding="utf-8")
    for k, v in _colors(code).items():
        src = src.replace("{{" + k + "}}", v)
    return src


async def _product(code: str) -> dict[str, Any] | None:
    """商品と、見本の写真(sort_order の順。先頭がメイン)"""
    t = sc.load().table("products")
    try:
        async with db() as conn:
            row = (await conn.execute(text(f"SELECT id, name, description, price, market FROM {t.pg} WHERE product_code = :c ORDER BY market LIMIT 1"), {"c": code})).mappings().first()
            if not row:
                return None
            photos = (await conn.execute(text(
                "SELECT image_url, alt, caption, angle, is_main FROM product_images WHERE product_id = :id AND source = 'sample' AND image_url IS NOT NULL ORDER BY sort_order"
            ), {"id": row["id"]})).mappings().all()
    except Exception:  # noqa: BLE001 — DB につながらなくても、見本のページは出す(名前は商品コード)
        return None
    return {**dict(row), "photos": [dict(x) for x in photos]}


def _price(product: dict[str, Any]) -> str:
    price = product.get("price")
    if price is None:
        return ""
    return f"${price:,.0f}" if product.get("market") == "US" else f"¥{price:,.0f}"


def sample_html(code: str, product: dict[str, Any] | None) -> str:
    if product and product.get("photos"):
        return photo_html(code, product)
    return svg_html(code, product)


def photo_html(code: str, product: dict[str, Any]) -> str:
    """見本の写真のページ。本物の EC の商品ページの形(メインの写真・小さな写真の列・名前・価格・説明・特長の写真と説明)。
    ページの画像を拾う処理(extract)が、本物のページと同じように読めるよう、<img> と og:image で書く"""
    en = product.get("market") == "US"
    name = escape(product.get("name") or code)
    desc = escape(product.get("description") or "")
    photos = product["photos"]
    # 画像は相対のパスで書く(/sample-shop/p/<code> から /img/products/…。Workbench の中継 /proxy/<port>/ の下でも見えるように)
    src = lambda ph: "../.." + escape(ph["image_url"])  # noqa: E731
    main = next((ph for ph in photos if ph.get("is_main")), photos[0])
    subs = [ph for ph in photos if ph is not main]
    # 画像ごとの説明(description)は、本物のページでよくある書き方(img の alt・<figure> の <figcaption>・JSON-LD の ImageObject)で書く。
    # ページを読む処理(extract)・手元の収集(collect-product-images.py)が、本物と同じ道で説明を拾えるように(利用者の依頼 2026-10-23)
    desc_of = lambda ph: ph.get("caption") or ph.get("alt") or product.get("name") or code  # noqa: E731
    thumbs = "".join(f'<img src="{src(ph)}" alt="{escape(desc_of(ph))}" width="72" height="96">' for ph in photos)
    feats = "\n".join(
        f'<section class="f"><figure><img src="{src(ph)}" alt="{escape(desc_of(ph))}" width="420" height="560" loading="lazy">'
        f'<figcaption>{escape(ph.get("caption") or "")}</figcaption></figure><div><h3>{escape(ph.get("alt") or "")}</h3><p>{escape(ph.get("caption") or "")}</p></div></section>'
        for ph in subs
    )
    ld = json.dumps({"@context": "https://schema.org", "@type": "Product", "name": product.get("name") or code, "sku": code,
                     "image": [{"@type": "ImageObject", "contentUrl": src(ph), "name": ph.get("alt") or "", "caption": desc_of(ph)} for ph in photos]},
                    ensure_ascii=False).replace("</", "<\\/")
    label = ("Sample", "This is a sample product page made by CCP for trying things out. Not a real shop or product.") if en else ("見本", "CCP が試すために作った見本の商品ページです(実在のお店・商品ではありません)。")
    return f"""<!doctype html>
<html lang="{'en' if en else 'ja'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{name} | Sample shop</title>
<meta property="og:title" content="{name}"><meta property="og:image" content="{src(main)}"><meta property="og:site_name" content="Sample shop">
<script type="application/ld+json">{ld}</script>
<style>
*{{box-sizing:border-box}}body{{font-family:"Helvetica Neue",Arial,"Hiragino Sans","Yu Gothic",sans-serif;margin:0;color:#222;background:#fff}}
.bar{{display:flex;align-items:center;gap:10px;padding:12px 24px;border-bottom:1px solid #eee;font-size:13px;letter-spacing:.2em}}
.tag{{font-size:11px;letter-spacing:0;padding:2px 8px;border:1px solid #c8a24a;color:#8a6d1f;border-radius:10px;background:#fff8e6}}
.wrap{{max-width:1080px;margin:0 auto;padding:24px}}.top{{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:40px}}
.main{{width:100%;aspect-ratio:3/4;object-fit:cover;background:#f6f6f6}}.th{{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}}.th img{{width:72px;height:96px;object-fit:cover;background:#f6f6f6}}
h1{{font-size:22px;font-weight:500;margin:8px 0}}.price{{font-size:20px;margin:8px 0 20px}}.desc{{line-height:1.8;font-size:14px}}
.code{{color:#888;font-size:12px}}.btn{{display:block;width:100%;padding:14px;margin:24px 0 8px;border:0;background:#222;color:#fff;font-size:14px;letter-spacing:.1em}}
.note{{color:#888;font-size:11px;line-height:1.6}}h2{{font-size:16px;font-weight:500;letter-spacing:.15em;margin:56px 0 8px;text-align:center}}
.f{{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:32px;align-items:center;margin:32px 0}}.f:nth-of-type(even) figure{{order:2}}
.f figure{{margin:0}}.f figcaption{{display:none}}.f img{{width:100%;aspect-ratio:3/4;object-fit:cover;background:#f6f6f6}}.f h3{{font-size:17px;font-weight:500;margin:0 0 10px}}.f p{{line-height:1.9;font-size:14px;margin:0}}
@media (max-width:720px){{.top,.f{{grid-template-columns:1fr;gap:16px}}.f:nth-of-type(even) figure{{order:0}}}}
</style>
</head><body>
<div class="bar"><span>SAMPLE SHOP</span><span class="tag" title="{label[1]}">{label[0]}</span></div>
<div class="wrap">
  <div class="top">
    <div><img class="main" src="{src(main)}" alt="{escape(desc_of(main))}" width="600" height="800"><div class="th">{thumbs}</div></div>
    <div>
      <div class="code">{escape(code)}</div>
      <h1>{name}</h1>
      <div class="price">{_price(product)}</div>
      <p class="desc">{desc}</p>
      <button class="btn" type="button" disabled>{'Add to bag' if en else 'カートに入れる'}</button>
      <p class="note">{label[1]}</p>
    </div>
  </div>
  <h2>{'FEATURES' if en else '特長'}</h2>
{feats}
</div>
</body></html>"""


def svg_html(code: str, product: dict[str, Any] | None) -> str:
    # 画像は相対のパスで書く(Workbench の中継 /proxy/<port>/ の下で、ブラウザで開いても見えるように)
    name = escape((product or {}).get("name") or code)
    desc = escape((product or {}).get("description") or "")
    imgs = "\n".join(f'    <figure><img src="../img/{escape(code)}/{a}.svg" alt="{ALTS[a]}" width="300" height="375"><figcaption>{ALTS[a]}</figcaption></figure>' for a in ANGLES)
    return f"""<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{name} | Sample shop</title>
<meta property="og:title" content="{name}"><meta property="og:image" content="../img/{escape(code)}/front.svg"><meta property="og:site_name" content="Sample shop">
<style>body{{font-family:sans-serif;margin:24px;background:#fafafa;color:#222}}.note{{padding:8px 12px;background:#fff4ce;border-radius:6px;font-size:13px}}.g{{display:flex;flex-wrap:wrap;gap:12px}}figure{{margin:0;background:#fff;padding:6px;border:1px solid #ddd}}figcaption{{font-size:12px;color:#666}}img{{display:block;width:240px;height:auto}}</style>
</head><body>
  <p class="note">This is a sample product page made by CCP (not a real shop).</p>
  <header><img src="../logo.svg" alt="logo" width="40" height="40" style="width:40px"></header>
  <h1>{name}</h1>
  <p>{desc}</p>
  <div class="g">
{imgs}
  </div>
</body></html>"""


@router.get("/sample-shop/p/{code}", response_class=HTMLResponse)
async def sample_page(code: str):
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,40}", code):
        raise HTTPException(404)
    return HTMLResponse(sample_html(code, await _product(code)))


@router.get("/sample-shop/logo.svg")
async def sample_logo():
    # ロゴのような小さい画像を、一覧から除けるかを試すためのもの
    return Response('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#444"/></svg>', media_type="image/svg+xml")


@router.get("/sample-shop/img/{code}/{angle}.svg")
async def sample_image(code: str, angle: str):
    m = SAMPLE_IMG.match(f"/sample-shop/img/{code}/{angle}.svg")
    if not m:
        raise HTTPException(404)
    return Response(sample_svg(m.group(1), m.group(2)), media_type="image/svg+xml", headers={"Cache-Control": "private, max-age=3600"})


def sample_code(url: str) -> str | None:
    """見本のサイトの商品ページなら、その商品コード"""
    u = urlparse(url.strip())
    if u.hostname and u.hostname != SAMPLE_HOST:
        return None
    m = re.fullmatch(r"(?:/sample-shop)?/p/([A-Za-z0-9_-]{1,40})/?", u.path)
    return m.group(1) if m else None


# ---- ページの画像を拾う ----


class ImageParser(HTMLParser):
    """<img>(src・data-src・srcset のいちばん大きいもの)と og:image を、出てきた順に拾う。
    画像ごとの説明(description)の材料として、alt・title・入っている <figure> の <figcaption>・JSON-LD(application/ld+json)も拾う
    (利用者の依頼 2026-10-23。本物のページは、画像のパスと一緒に説明を持つ。どこに書くかはサイトによるので、よくある場所を順に見る)"""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.found: list[dict[str, Any]] = []
        self.figures: list[dict[str, Any]] = []  # 開いている <figure>(中の画像と、figcaption の文)
        self.caption: list[str] | None = None  # 読んでいる <figcaption> の文
        self.ld: list[str] = []  # JSON-LD の中身
        self.in_ld = False

    def handle_starttag(self, tag, attrs):
        a = {k.lower(): (v or "") for k, v in attrs}
        if tag == "script" and a.get("type", "").lower() == "application/ld+json":
            self.in_ld = True
            self.ld.append("")
        elif tag == "figure":
            self.figures.append({"imgs": [], "caption": ""})
        elif tag == "figcaption":
            self.caption = []
        elif tag == "meta" and (a.get("property") or a.get("name") or "").lower() in ("og:image", "og:image:url") and a.get("content"):
            self.found.append({"src": a["content"].strip(), "alt": "", "og": True})
        elif tag in ("img", "source"):
            src = a.get("data-src") or a.get("data-original") or a.get("src") or ""
            best = _largest(a.get("srcset") or a.get("data-srcset") or "")
            w = _int(a.get("width"))
            item = {"src": (best or src).strip(), "alt": a.get("alt", "").strip()[:200], "title": a.get("title", "").strip()[:2000], "width": w}
            self.found.append(item)
            if self.figures:
                self.figures[-1]["imgs"].append(item)

    def handle_endtag(self, tag):
        if tag == "script":
            self.in_ld = False
        elif tag == "figcaption" and self.caption is not None:
            if self.figures:
                self.figures[-1]["caption"] = " ".join("".join(self.caption).split())[:2000]
            self.caption = None
        elif tag == "figure" and self.figures:
            fig = self.figures.pop()
            for item in fig["imgs"]:
                item["figcaption"] = fig["caption"]

    def handle_data(self, data):
        if self.in_ld:
            self.ld[-1] += data
        elif self.caption is not None:
            self.caption.append(data)


def ld_captions(blocks: list[str], base: str) -> dict[str, str]:
    """JSON-LD の画像(ImageObject。Product の image の中など)の URL → 説明(caption → description → name)"""
    out: dict[str, str] = {}

    def walk(o: Any) -> None:
        if isinstance(o, list):
            for x in o:
                walk(x)
        elif isinstance(o, dict):
            url = o.get("contentUrl") or o.get("url")
            if (o.get("@type") == "ImageObject" or "contentUrl" in o) and isinstance(url, str):
                d = next((v for v in (o.get("caption"), o.get("description"), o.get("name")) if isinstance(v, str) and v.strip()), "")
                if d:
                    out.setdefault(original_size(urljoin(base, url.strip())), d.strip()[:2000])
            for v in o.values():
                walk(v)

    for b in blocks:
        try:
            walk(json.loads(b))
        except ValueError:  # 壊れた JSON-LD は飛ばす
            continue
    return out


def _int(v: str | None) -> int | None:
    try:
        return int(str(v).strip().rstrip("px"))
    except (TypeError, ValueError):
        return None


def _largest(srcset: str) -> str:
    best, size = "", -1.0
    for part in srcset.split(","):
        bits = part.strip().split()
        if not bits:
            continue
        n = 1.0
        if len(bits) > 1:
            try:
                n = float(bits[1].rstrip("wx"))
            except ValueError:
                n = 1.0
        if n > size:
            best, size = bits[0], n
    return best


# 飾り・ロゴ・計測用の小さな画像の目印(本物のページの多くで、商品の画像と見分けられる)
NOISE = re.compile(r"(logo|icon|sprite|badge|banner|pixel|tracking|spacer|avatar|flag|payment|social)", re.I)


def original_size(url: str) -> str:
    """画像の URL から、大きさの指定のクエリ width(大文字・小文字は問わない)だけを外して、元の大きさで取る(利用者の指示 2026-10-23)。
    ほかのクエリは、書き方(エンコード)も含めてそのまま残す。width がなければ、URL はそのまま"""
    base, sep, query = url.partition("?")
    if not sep:
        return url
    query, hsep, frag = query.partition("#")
    parts = [p for p in query.split("&") if p]
    kept = [p for p in parts if p.split("=", 1)[0].lower() != "width"]
    if len(kept) == len(parts):
        return url
    return base + ("?" + "&".join(kept) if kept else "") + (hsep + frag if hsep else "")


def extract(html: str, base: str) -> list[dict[str, str]]:
    """ページの画像の一覧(src・alt・description)。description は alt → title → figcaption → JSON-LD の、最初にあるもの"""
    p = ImageParser()
    try:
        p.feed(html)
    except Exception:  # noqa: BLE001 — 壊れた HTML でも、拾えたところまで使う
        pass
    ld = ld_captions(p.ld, base)
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for f in p.found:
        src = f["src"]
        if not src or src.startswith("data:"):
            continue
        # 大きさの指定(?width=)は外して、元の大きさの画像を拾う(同じ画像の大きさ違いも、1 つにまとまる)
        absolute = original_size(urljoin(base, src))
        if absolute in seen or NOISE.search(urlparse(absolute).path) or NOISE.search(f.get("alt") or ""):
            continue
        if f.get("width") is not None and f["width"] < 120:
            continue
        seen.add(absolute)
        desc = next((v for v in (f.get("alt"), f.get("title"), f.get("figcaption"), ld.get(absolute)) if v), "")
        out.append({"src": absolute, "alt": f.get("alt") or "", "description": desc})
    return out[:MAX_IMAGES]


class ImagesIn(BaseModel):
    url: str


@router.post("/api/product-pages/images")
async def images(body: ImagesIn):
    url = body.url.strip()
    code = sample_code(url)
    if code:
        # 見本: 通信せずに、ここで作ったページを、本物と同じ処理で読む。画像の場所は、アプリの中のパス
        product = await _product(code)
        html = sample_html(code, product)
        # 見本の写真の説明の文は、ページの alt・figcaption・JSON-LD に書いてあり、本物のページと同じ処理で description に入る
        found = [{**i, "src": urlparse(i["src"]).path} for i in extract(html, f"https://{SAMPLE_HOST}/sample-shop/p/{code}")]
        return ok({"sample": True, "page": f"/sample-shop/p/{code}", "images": found})
    try:
        final, data, ctype = await asyncio.to_thread(linkpreview.fetch, url, linkpreview.MAX_PAGE, "text/html,application/xhtml+xml")
    except linkpreview.Blocked as e:
        return fail(400, str(e), "blocked")
    except Exception as e:  # noqa: BLE001 — 読めなければ、画像を貼る・ファイルを上げる で選んでもらう
        return fail(502, f"ページを読めませんでした(画像をコピーして貼る・ファイルを上げる、でも選べます): {type(e).__name__}", "fetch_failed")
    if "html" not in ctype and not data.lstrip()[:15].lower().startswith((b"<!doctype", b"<html")):
        return fail(400, "HTML のページではありません", "not_html")
    return ok({"sample": False, "page": final, "images": extract(data.decode("utf-8", errors="replace"), final)})


# ---- 画像の中身を読む(AI に見せる・写す) ----


def _read(src: str) -> tuple[bytes, str]:
    """画像の中身と種類。見本はここで作り、本物は安全策を通して読む"""
    m = SAMPLE_IMG.match(src)
    if m:
        return sample_svg(m.group(1), m.group(2)).encode("utf-8"), "image/svg+xml"
    s = STORED_IMG.match(src)
    if s:
        # 取り込んだ商品の画像(表 product_images。B11)は、このサーバーの置き場所から読む(外に出られない環境でも AI に見せられる)
        got = assets.read_image("products", s.group(1))
        if got is None:
            raise FileNotFoundError(src)
        return got
    _, data, ctype = linkpreview.fetch(src, linkpreview.MAX_IMAGE, "image/*")
    return data, ctype


# 取り込んだ商品の画像(/img/products/<ファイル>。pack.IMG_URL と同じ形)
STORED_IMG = re.compile(r"^/img/products/([A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp))$")


ANGLE_NAMES = "front(正面)・back(後ろ)・side(横)・worn(着用・人が身に着けている)・detail(ディテールの寄り: ボタン・縫い目・ポケットなど)・texture(素材の寄り)・scene(使っている場面・背景つき)・flat(平置き)・package(箱・付属品)・other"

PROMPT = """あなたは、EC のメール・アプリの配信で、商品の見せ方を決める担当です。
下に、ある商品の商品ページに載っている画像を、番号つきで並べます(写真のほか、SVG のソースで渡す絵もあります。SVG はソースから絵を思い浮かべて判断してください)。
1. それぞれの画像のアングルを、次から 1 つ選ぶ: %ANGLES%
2. この配信で伝えたいこと(下の「配信」。テーマ・見出し・コピー)と、商品の強み(下の「商品」)から、この配信の商品画像に合う画像を、よい順に最大 3 つ選び、理由を 1 文で書く。
   強みが素材なら素材の寄り、着たときの形ならシルエットが分かる着用、のように、伝えたいことが見て分かる画像を選ぶ。
返すのは JSON だけ: {"images": [{"index": 番号, "angle": 上の英語の値, "note": 写っているものを短く}], "picks": [{"index": 番号, "reason": 理由}]}
文字は %LANG% で書く。人物を特定する情報(名前など)は書かない。
"""


class SuggestImage(BaseModel):
    src: str
    alt: str = ""
    description: str = ""


class SuggestIn(BaseModel):
    images: list[SuggestImage]
    product: dict[str, Any] = {}
    delivery: dict[str, Any] = {}
    language: str = "ja"


@router.post("/api/product-pages/suggest")
async def suggest(body: SuggestIn):
    if not body.images:
        return fail(400, "画像がありません", "empty")
    picked = body.images[:MAX_SUGGEST]
    prompt = PROMPT.replace("%ANGLES%", ANGLE_NAMES).replace("%LANG%", "英語" if body.language == "en" else "日本語")
    contents: list[Any] = [prompt, "配信: " + json.dumps(body.delivery, ensure_ascii=False), "商品: " + json.dumps(body.product, ensure_ascii=False)]
    shown = 0
    for i, img in enumerate(picked):
        try:
            data, ctype = await asyncio.to_thread(_read, img.src)
        except Exception:  # noqa: BLE001 — 読めない画像は飛ばす(番号は変えない)
            continue
        note = img.description or img.alt
        label = f"画像 {i}" + (f"(ページの説明: {note})" if note else "")
        if ctype in RASTER:
            contents += [label, types.Part.from_bytes(data=data, mime_type=ctype)]
        elif ctype == "image/svg+xml":
            contents.append(f"{label}(SVG のソース):\n{data.decode('utf-8', errors='replace')[:6000]}")
        else:
            continue
        shown += 1
    if shown == 0:
        return fail(502, "画像を読めませんでした", "no_images")
    try:
        resp = await _get_client().aio.models.generate_content(
            model=os.getenv("GEMINI_MODEL", "gemini-3.5-flash"),
            contents=contents,
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        out = json.loads((resp.text or "").strip() or "{}")
    except Exception as e:  # noqa: BLE001 — 案がなくても、人が選べる
        log.exception("画像の案を作れませんでした")
        return fail(502, f"AI で画像の案を作れませんでした(一覧から選べます): {type(e).__name__}", "ai_failed")
    if not isinstance(out, dict):
        out = {}
    n = len(picked)
    imgs = [x for x in out.get("images") or [] if isinstance(x, dict) and isinstance(x.get("index"), int) and 0 <= x["index"] < n]
    picks = [x for x in out.get("picks") or [] if isinstance(x, dict) and isinstance(x.get("index"), int) and 0 <= x["index"] < n][:3]
    return ok({"images": imgs, "picks": picks})


class AdoptIn(BaseModel):
    src: str


@router.post("/api/product-pages/adopt")
async def adopt(body: AdoptIn):
    """選んだ画像を写す。本物のページの画像は、あとで消えたり替わったりするので、素材の置き場所に写して、その URL を返す"""
    src = body.src.strip()
    if SAMPLE_IMG.match(src) or STORED_IMG.match(src):
        # 見本の画像は、アプリの中でいつも同じものが作られる。取り込んだ商品の画像は、もうこのサーバーにある。どちらも写さない
        return ok({"image_url": src, "copied": False})
    try:
        data, ctype = await asyncio.to_thread(_read, src)
    except linkpreview.Blocked as e:
        return fail(400, str(e), "blocked")
    except Exception as e:  # noqa: BLE001 — 写せなければ、画面が URL のまま使うかを決める
        return fail(502, f"画像を写せませんでした: {type(e).__name__}", "fetch_failed")
    ext = linkpreview.IMAGE_TYPES.get(ctype)
    if not ext or not data:
        return fail(400, "この画像の種類は使えません(JPEG・PNG・WebP・GIF)", "bad_type")
    stored = f"{uuid.uuid4().hex}.{ext}"
    await asyncio.to_thread(creative.save, stored, data, ctype)
    return ok({"image_url": f"/api/creative/files/{stored}", "copied": True})
