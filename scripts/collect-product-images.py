#!/usr/bin/env python3
"""商品ページの画像を集めて、Workbench に運ぶ ZIP を作る(手元の PC で実行する。手順は docs/PRODUCT_IMAGES.md)。

Workbench のサーバーは、利用先の EC サイトを読めない。そこで、ページを読める手元の PC で画像を集め、
ZIP にして Workbench に運び、`python -m ccp.cli import-images <ZIP>` で商品につなぐ。

  python scripts/collect-product-images.py 商品.csv
  python scripts/collect-product-images.py 商品.csv --include "/products/" --exclude "thumb" --sleep 2

CSV の列(1 行目は列名):
  product_code   商品コード(必須)
  page_url       商品ページの URL(必須)
  main_image_url メイン画像の URL(あれば。先頭に「メイン」の印を付けて集める。ページ上の同じ画像は、重ねて集めない)
  market         市場(あれば。JP など。なければ、同じ商品コードのすべての市場の商品につなぐ)

ページの拾い方は、CCP の「商品ページから画像を選ぶ」(server/ccp/product_pages.py の extract)と同じ
(<img> の src・data-src・srcset のいちばん大きいもの、og:image。ロゴ・アイコンなどの小さな飾りは除く。
画像ごとの説明(description)は alt → title → <figcaption> → JSON-LD の順に拾い、目録の caption に入れる(取り込むと product_images.caption)。
画像の URL の大きさの指定 ?width= は外して、元の大きさで取る)。
直すときは、両方を合わせる。

Python の標準の機能だけで動く(追加のインストールは要らない)。
URL の決まり(どのページか・どの画像か)は、CSV と引数(--include / --exclude)にだけ持ち、このファイルには書かない。
途中で止めても、もう一度同じコマンドを流せば、済んだ商品を飛ばして続きから集める。
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
import time
import urllib.error
import urllib.request
import zipfile
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse

UA = "Mozilla/5.0 (compatible; CCP-product-images/1.0)"
MAX_PAGE = 5 * 1024**2
MAX_IMAGE = 15 * 1024**2
TIMEOUT = 30
EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif"}
# 飾り・ロゴ・計測用の小さな画像の目印(product_pages.py の NOISE と同じ)
NOISE = re.compile(r"(logo|icon|sprite|badge|banner|pixel|tracking|spacer|avatar|flag|payment|social)", re.I)


class ImageParser(HTMLParser):
    """<img>(src・data-src・srcset のいちばん大きいもの)と og:image を、出てきた順に拾う。
    画像ごとの説明(description)の材料として、alt・title・入っている <figure> の <figcaption>・JSON-LD(application/ld+json)も拾う
    (利用者の依頼 2026-10-23。本物のページは、画像のパスと一緒に説明を持つ。どこに書くかはサイトによるので、よくある場所を順に見る)"""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.found: list[dict] = []
        self.figures: list[dict] = []  # 開いている <figure>(中の画像と、figcaption の文)
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
            best = largest(a.get("srcset") or a.get("data-srcset") or "")
            w = to_int(a.get("width"))
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


def to_int(v):
    try:
        return int(str(v).strip().rstrip("px"))
    except (TypeError, ValueError):
        return None


def largest(srcset: str) -> str:
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


def ld_captions(blocks: list[str], base: str) -> dict:
    """JSON-LD の画像(ImageObject。Product の image の中など)の URL → 説明(caption → description → name)"""
    out: dict = {}

    def walk(o):
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


def extract(html: str, base: str) -> list[dict]:
    """ページの画像の一覧(src・alt・description)。description は alt → title → figcaption → JSON-LD の、最初にあるもの"""
    p = ImageParser()
    try:
        p.feed(html)
    except Exception:  # 壊れた HTML でも、拾えたところまで使う
        pass
    ld = ld_captions(p.ld, base)
    out, seen = [], set()
    for f in p.found:
        src = f["src"]
        if not src or src.startswith("data:"):
            continue
        # 大きさの指定(?width=)は外して、元の大きさの画像を拾う(product_pages.py と同じ)
        absolute = original_size(urljoin(base, src))
        if absolute in seen or NOISE.search(urlparse(absolute).path) or NOISE.search(f.get("alt") or ""):
            continue
        if f.get("width") is not None and f["width"] < 120:
            continue
        seen.add(absolute)
        desc = next((v for v in (f.get("alt"), f.get("title"), f.get("figcaption"), ld.get(absolute)) if v), "")
        out.append({"src": absolute, "alt": f.get("alt") or "", "description": desc})
    return out


def get(url: str, limit: int, accept: str) -> tuple[str, bytes, str, str]:
    """URL を読む。最後の URL・中身・種類・文字コード(ヘッダーにあれば)を返す"""
    if urlparse(url).scheme not in ("http", "https"):
        raise ValueError("http / https の URL だけを読みます")
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        data = r.read(limit + 1)
        if len(data) > limit:
            raise ValueError(f"大きすぎます({limit // 1024**2} MB まで)")
        ctype = (r.headers.get_content_type() or "").lower()
        return r.geturl(), data, ctype, r.headers.get_content_charset() or ""


def decode(data: bytes, charset: str) -> str:
    """ページの文字。ヘッダー → <meta charset> → UTF-8 → Shift_JIS の順に試す"""
    m = re.search(rb"<meta[^>]+charset=[\"']?([\w-]+)", data[:4096], re.I)
    for enc in [charset, m.group(1).decode() if m else "", "utf-8", "cp932", "euc-jp"]:
        if not enc:
            continue
        try:
            return data.decode(enc)
        except (LookupError, UnicodeDecodeError):
            continue
    return data.decode("utf-8", errors="replace")


def same_image(a: str, b: str) -> bool:
    """同じ画像の URL か(? の後ろ(大きさの指定 など)は見ない)"""
    pa, pb = urlparse(a), urlparse(b)
    return bool(a and b) and pa.netloc == pb.netloc and pa.path == pb.path


def read_rows(path: Path) -> list[dict]:
    text = None
    for enc in ("utf-8-sig", "cp932"):
        try:
            text = path.read_text(encoding=enc)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        sys.exit(f"{path} を読めません(UTF-8 か Shift_JIS で保存してください)")
    rows = list(csv.DictReader(text.splitlines()))
    if not rows or "product_code" not in rows[0] or "page_url" not in rows[0]:
        sys.exit("CSV の 1 行目に、列名 product_code と page_url が要ります(main_image_url・market はあれば)")
    return [{k: (v or "").strip() for k, v in r.items() if k} for r in rows if (r.get("product_code") or "").strip() and (r.get("page_url") or "").strip()]


def safe(name: str) -> str:
    return re.sub(r"[^\w.-]+", "_", name)[:80] or "_"


def collect(row: dict, out: Path, args) -> dict:
    """商品 1 つ分を集める。商品のフォルダに画像と result.json を置く"""
    code, page = row["product_code"], row["page_url"]
    folder = out / "products" / safe(f"{row.get('market') or 'ALL'}_{code}")
    folder.mkdir(parents=True, exist_ok=True)
    result = {"product_code": code, "market": row.get("market") or None, "page_url": page, "main_image_url": row.get("main_image_url") or None,
              "images": [], "skipped": [], "error": None, "collected_at": datetime.now().astimezone().isoformat(timespec="seconds")}
    try:
        final, data, ctype, charset = get(page, MAX_PAGE, "text/html,application/xhtml+xml")
        result["final_url"] = final
        if "html" not in ctype and not data.lstrip()[:15].lower().startswith((b"<!doctype", b"<html")):
            raise ValueError(f"HTML のページではありません({ctype})")
        found = extract(decode(data, charset), final)
    except Exception as e:  # 読めなかったページは、理由を残して次へ
        result["error"] = f"{type(e).__name__}: {e}"[:500]
        return result
    main = original_size(row.get("main_image_url") or "")
    seen_hash: set[str] = set()

    def keep(body: bytes, itype: str, src: str, alt: str, is_main: bool, caption: str = "") -> str:
        """画像を保存して、目録に足す。足さなかったときは、その理由を返す"""
        ext = EXT.get(itype)
        if not ext:
            return f"画像の種類が使えない({itype})"
        if not is_main and len(body) < args.min_bytes:
            return f"小さい({len(body)} バイト)"
        h = hashlib.sha256(body).hexdigest()
        if h in seen_hash:
            return "同じ中身の画像がもうある(メイン画像と同じ、など)"
        seen_hash.add(h)
        name = f"{len(result['images']) + 1:02d}_{'main_' if is_main else ''}{h[:12]}.{ext}"
        (folder / name).write_bytes(body)
        result["images"].append({"file": f"{folder.name}/{name}", "src": src, "alt": alt, "caption": caption, "bytes": len(body), "sha256": h, "content_type": itype, "main": is_main})
        return ""

    if main:
        # メイン画像(商品のマスタにある)を先頭に。ページ上の同じ画像は、URL か中身で見分けて重ねない
        try:
            _, body, itype, _ = get(main, MAX_IMAGE, "image/*")
            # メイン画像の説明は、ページの上の同じ画像の説明(なければ空)
            on_page = next((i for i in found if same_image(i["src"], main)), None)
            why = keep(body, itype, main, (on_page or {}).get("alt", ""), True, (on_page or {}).get("description", ""))
            if why:
                result["skipped"].append({"src": main, "reason": f"メイン画像: {why}"})
        except Exception as e:
            result["skipped"].append({"src": main, "reason": f"メイン画像を読めない({type(e).__name__})"})
        time.sleep(args.sleep)
    for img in found:
        src = img["src"]
        if args.include and not re.search(args.include, src):
            result["skipped"].append({"src": src, "reason": "--include に当たらない"})
            continue
        if args.exclude and re.search(args.exclude, src):
            result["skipped"].append({"src": src, "reason": "--exclude に当たった"})
            continue
        if main and same_image(src, main):
            result["skipped"].append({"src": src, "reason": "メイン画像(先頭に集めた)"})
            continue
        if len([i for i in result["images"] if not i["main"]]) >= args.max_per_product:
            result["skipped"].append({"src": src, "reason": f"1 商品 {args.max_per_product} 枚まで"})
            continue
        try:
            _, body, itype, _ = get(src, MAX_IMAGE, "image/*")
        except Exception as e:
            result["skipped"].append({"src": src, "reason": f"読めない({type(e).__name__})"})
            continue
        finally:
            time.sleep(args.sleep)
        why = keep(body, itype, src, img["alt"], False, img.get("description", ""))
        if why:
            result["skipped"].append({"src": src, "reason": why})
    return result


def main() -> int:
    ap = argparse.ArgumentParser(description="商品ページの画像を集めて、Workbench に運ぶ ZIP を作る")
    ap.add_argument("csv", type=Path, help="product_code, page_url(, main_image_url, market)の CSV")
    ap.add_argument("--out", type=Path, default=Path("product_images_out"), help="集めた画像を置くフォルダ(既定 product_images_out)")
    ap.add_argument("--zip", type=Path, default=None, help="作る ZIP(既定 product_images_<日時>.zip)")
    ap.add_argument("--sleep", type=float, default=1.0, help="1 回読むごとに待つ秒(相手のサイトに負担をかけないため。既定 1)")
    ap.add_argument("--max-per-product", type=int, default=30, help="1 商品あたりの上限(既定 30)")
    ap.add_argument("--min-bytes", type=int, default=8000, help="これより小さい画像は集めない(飾りを除くため。既定 8000)")
    ap.add_argument("--include", default="", help="この正規表現に当たる画像の URL だけを集める(例: 商品画像のフォルダ)")
    ap.add_argument("--exclude", default="", help="この正規表現に当たる画像の URL は集めない(例: サムネイル)")
    ap.add_argument("--limit", type=int, default=0, help="最初の N 商品だけ(試すとき)")
    ap.add_argument("--retry-errors", action="store_true", help="前に読めなかった商品も、もう一度読む")
    args = ap.parse_args()

    rows = read_rows(args.csv)
    if args.limit:
        rows = rows[: args.limit]
    out = args.out
    (out / "products").mkdir(parents=True, exist_ok=True)
    done_path = out / "results.jsonl"
    done: dict[str, dict] = {}
    if done_path.is_file():
        for line in done_path.read_text(encoding="utf-8").splitlines():
            try:
                r = json.loads(line)
                done[f"{r.get('market') or ''}|{r['product_code']}"] = r
            except (ValueError, KeyError):
                continue
    keys = [f"{r.get('market') or ''}|{r['product_code']}" for r in rows]
    print(f"{len(rows)} 商品。済み {sum(1 for k in keys if k in done)} 件は飛ばします")
    with done_path.open("a", encoding="utf-8") as log:
        for i, row in enumerate(rows, start=1):
            key = f"{row.get('market') or ''}|{row['product_code']}"
            if key in done and not (args.retry_errors and done[key].get("error")):
                continue
            r = collect(row, out, args)
            done[key] = r
            log.write(json.dumps(r, ensure_ascii=False) + "\n")
            log.flush()
            state = f"エラー: {r['error']}" if r["error"] else f"{len(r['images'])} 枚(飛ばした {len(r['skipped'])})"
            print(f"[{i}/{len(rows)}] {row['product_code']}: {state}")
            time.sleep(args.sleep)

    # 目録(商品ごとの最後の結果)と画像を、1 つの ZIP に
    results = [done[k] for k in done]
    manifest = {"made_at": datetime.now().astimezone().isoformat(timespec="seconds"), "products": results,
                "images": sum(len(r["images"]) for r in results), "errors": sum(1 for r in results if r["error"])}
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    zpath = args.zip or Path(f"product_images_{datetime.now():%Y%m%d_%H%M}.zip")
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(out / "manifest.json", "manifest.json")
        for r in results:
            for img in r["images"]:
                z.write(out / "products" / img["file"], f"products/{img['file']}")
    print(f"\n{len(results)} 商品・画像 {manifest['images']} 枚・読めなかったページ {manifest['errors']} 件 → {zpath}")
    print("この ZIP を Workbench に上げて、python -m ccp.cli import-images <ZIP> で取り込みます(docs/PRODUCT_IMAGES.md)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
