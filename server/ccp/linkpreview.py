"""素材の URL の見本カード(X58。利用者と決めた案 A: ページを埋め込めないので、題名・説明・代表の画像をカードで見せる)。

  POST /api/creative/preview   {"url": "https://..."}
      そのページを 1 回だけ読み、og:title / og:description / og:image / og:site_name(なければ <title> と description)を取り出す。
      代表の画像は、素材のファイルと同じ置き場所(ccp/creative.py)に保存し、その名前(stored)を返す。
      画面は、返ってきた値を素材の行(card_assets の preview_*)に書く。開くたびに相手のサイトを読みに行かない。

安全のため(サーバーから任意の URL を読むので):
  - http / https だけ。名前を引いたアドレスが、社内・自分自身・リンクローカルなどの公開でないアドレスなら読まない(転送先も、毎回確かめる)
  - 転送は 3 回まで、ページは 2MB・画像は 5MB まで、それぞれ 8 秒で打ち切る
外にアクセスできない環境(Workbench)では、読み取りに失敗するだけ(素材は URL のまま使える)。
"""
from __future__ import annotations

import asyncio
import ipaddress
import socket
import uuid
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

import requests
from fastapi import APIRouter
from pydantic import BaseModel

from . import creative
from .data_api import fail, ok

router = APIRouter(prefix="/api/creative")

TIMEOUT = 8
MAX_PAGE = 2 * 1024 * 1024
MAX_IMAGE = 5 * 1024 * 1024
MAX_REDIRECTS = 3
IMAGE_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}
UA = "Mozilla/5.0 (compatible; CCP-link-preview/1.0)"


class Blocked(Exception):
    """読んではいけないアドレス"""


def check_public(url: str) -> None:
    """http / https で、名前を引いたアドレスがすべて公開のアドレスか。そうでなければ Blocked"""
    u = urlparse(url)
    if u.scheme not in ("http", "https") or not u.hostname:
        raise Blocked("http / https の URL だけ読めます")
    try:
        infos = socket.getaddrinfo(u.hostname, u.port or (443 if u.scheme == "https" else 80), proto=socket.IPPROTO_TCP)
    except socket.gaierror as e:
        raise Blocked(f"アドレスを引けませんでした({u.hostname})") from e
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global or ip.is_multicast:
            raise Blocked("公開されていないアドレスは読めません")


def fetch(url: str, limit: int, accept: str) -> tuple[str, bytes, str]:
    """転送をたどりながら(毎回アドレスを確かめて)読む。返すのは、最後の URL・中身・Content-Type"""
    for _ in range(MAX_REDIRECTS + 1):
        check_public(url)
        r = requests.get(url, headers={"User-Agent": UA, "Accept": accept}, timeout=TIMEOUT, allow_redirects=False, stream=True)
        if r.is_redirect or r.status_code in (301, 302, 303, 307, 308):
            loc = r.headers.get("Location")
            r.close()
            if not loc:
                break
            url = urljoin(url, loc)
            continue
        r.raise_for_status()
        buf = bytearray()
        for chunk in r.iter_content(64 * 1024):
            buf.extend(chunk)
            if len(buf) > limit:
                r.close()
                raise ValueError("大きすぎるため、途中でやめました")
        return url, bytes(buf), (r.headers.get("Content-Type") or "").split(";")[0].strip().lower()
    raise ValueError("転送が多すぎます")


class MetaParser(HTMLParser):
    """<head> の meta と <title> だけを拾う"""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.meta: dict[str, str] = {}
        self.title = ""
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        a = {k.lower(): (v or "") for k, v in attrs}
        if tag == "meta":
            key = (a.get("property") or a.get("name") or "").lower()
            if key and a.get("content") and key not in self.meta:
                self.meta[key] = a["content"].strip()
        elif tag == "title":
            self._in_title = True

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._in_title and len(self.title) < 300:
            self.title += data


def parse(html: str, base: str) -> dict[str, str]:
    p = MetaParser()
    try:
        p.feed(html)
    except Exception:  # noqa: BLE001 — 壊れた HTML でも、拾えたところまで使う
        pass
    m = p.meta
    image = m.get("og:image") or m.get("og:image:url") or m.get("twitter:image") or ""
    return {
        "title": (m.get("og:title") or m.get("twitter:title") or p.title).strip()[:300],
        "description": (m.get("og:description") or m.get("twitter:description") or m.get("description") or "").strip()[:600],
        "site": (m.get("og:site_name") or urlparse(base).hostname or "").strip()[:120],
        "image": urljoin(base, image) if image else "",
    }


def build(url: str) -> dict[str, str]:
    final, body, ctype = fetch(url, MAX_PAGE, "text/html,application/xhtml+xml")
    if "html" not in ctype and not body.lstrip()[:15].lower().startswith((b"<!doctype", b"<html")):
        return {"title": "", "description": "", "site": urlparse(final).hostname or "", "image_stored": ""}
    info = parse(body.decode("utf-8", errors="replace"), final)
    stored = ""
    if info["image"]:
        try:
            _, data, itype = fetch(info["image"], MAX_IMAGE, "image/*")
            ext = IMAGE_TYPES.get(itype)
            if ext and data:
                stored = f"{uuid.uuid4().hex}.{ext}"
                creative.save(stored, data, itype)
        except Exception:  # noqa: BLE001 — 画像がなくても、題名と説明は出す
            stored = ""
    return {"title": info["title"], "description": info["description"], "site": info["site"], "image_stored": stored}


class PreviewIn(BaseModel):
    url: str


@router.post("/preview")
async def preview(body: PreviewIn):
    try:
        return ok(await asyncio.to_thread(build, body.url.strip()))
    except Blocked as e:
        return fail(400, str(e), "blocked")
    except Exception as e:  # noqa: BLE001 — 読めないページは、URL のまま使ってもらう
        return fail(502, f"ページを読めませんでした(URL のままでも使えます): {type(e).__name__}", "fetch_failed")
