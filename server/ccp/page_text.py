"""商品ページの本文を取り出す(X80 段 ②)。

「詳しく」にした商品の枠の説明文を、AI が商品ページの内容から書く(段 ③)。その材料にする本文を、ページの HTML から取り出す。
画像ごとの説明(alt・caption)は product_images に残しているが、ページの本文は残していなかった。
Workbench は外のページを読めないので、手元の PC で集める ZIP(scripts/collect-product-images.py)にも、同じ考え方で本文を入れる
(スクリプトは単独で動くように、同じ処理を持つ。直すときは両方を直す)。

- <main> か <article> があれば、その中だけを読む(本物の EC のページは、ナビ・おすすめ・フッターの文が多いため)
- script・style・nav・header・footer・form・button・figcaption(画像の説明は product_images にある)・aria-hidden・data-nosnippet の中は読まない
- 段落の区切り(p・li・h1〜h6・div など)で改行を入れ、空白をつめる
- JSON-LD の Product の description が本文になければ、先頭に足す(本文を JavaScript で描くサイトでも、説明は残るように)
"""
from __future__ import annotations

import json
import re
from html.parser import HTMLParser
from typing import Any

# 残す本文の長さの上限(AI に渡す材料。長い説明でも、素材・機能の説明はこの中に収まる)
MAX_TEXT = 8000

SKIP = {"head", "title", "script", "style", "noscript", "template", "svg", "nav", "header", "footer", "form", "button", "select", "iframe", "figcaption"}
BLOCK = {"p", "div", "section", "article", "main", "li", "ul", "ol", "dl", "dt", "dd", "tr", "table", "figure", "h1", "h2", "h3", "h4", "h5", "h6", "br", "hr", "blockquote"}
VOID = {"br", "hr", "img", "meta", "link", "input", "source", "wbr", "area", "base", "col", "embed", "param", "track"}


class TextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []  # ページ全体の文
        self.main: list[str] | None = None  # 最初の <main> / <article> の文
        self.main_depth = 0
        self.skip_depth = 0
        self.stack: list[tuple[str, bool, bool]] = []  # (タグ, 読まない所の始まりか, 本文の範囲を数えたか)
        self.title: list[str] | None = None
        self.title_text = ""
        self.ld: list[str] = []
        self.in_ld = False

    def _out(self, s: str) -> None:
        self.parts.append(s)
        if self.main is not None and self.main_depth > 0:
            self.main.append(s)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = {k: (v or "") for k, v in attrs}
        if tag == "script" and a.get("type", "").lower() == "application/ld+json":
            self.in_ld = True
            self.ld.append("")
        if tag == "title" and self.title is None:
            self.title = []
        if tag in VOID:
            if tag in BLOCK and self.skip_depth == 0:
                self._out("\n")
            return
        hidden = tag in SKIP or a.get("aria-hidden") == "true" or "data-nosnippet" in a or "hidden" in a
        if hidden:
            self.skip_depth += 1
        # 本文の範囲: 最初の <main> / <article>(中に入れ子があっても、最初のものが閉じるまで)
        counted = False
        if tag in ("main", "article") and self.skip_depth == 0 and (self.main is None or self.main_depth > 0):
            if self.main is None:
                self.main = []
            self.main_depth += 1
            counted = True
        self.stack.append((tag, hidden, counted))
        if tag in BLOCK and self.skip_depth == 0:
            self._out("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag == "script":
            self.in_ld = False
        if tag == "title" and self.title is not None and not self.title_text:
            self.title_text = " ".join("".join(self.title).split())
        if tag in VOID:
            return
        # 閉じ忘れのタグがあっても崩れないよう、同じ名前のタグまで戻る(開いていないタグを閉じるのは無視する)
        if not any(t == tag for t, _, _ in self.stack):
            return
        while self.stack:
            t, hidden, counted = self.stack.pop()
            if hidden:
                self.skip_depth -= 1
            if counted:
                self.main_depth -= 1
            if t == tag:
                break
        if tag in BLOCK and self.skip_depth == 0:
            self._out("\n")

    def handle_data(self, data: str) -> None:
        if self.in_ld and self.ld:
            self.ld[-1] += data
            return
        if self.title is not None and not self.title_text:
            self.title.append(data)
        if self.skip_depth == 0 and not self.in_ld:
            self._out(data)


def _tidy(parts: list[str]) -> str:
    lines = [" ".join(line.split()) for line in "".join(parts).split("\n")]
    out: list[str] = []
    for line in lines:
        if line and (not out or out[-1] != line):
            out.append(line)
    return "\n".join(out)


def ld_description(blocks: list[str]) -> str:
    """JSON-LD の Product の description(最初のもの)"""
    found = ""

    def walk(o: Any) -> None:
        nonlocal found
        if found:
            return
        if isinstance(o, list):
            for x in o:
                walk(x)
        elif isinstance(o, dict):
            kind = o.get("@type")
            kinds = kind if isinstance(kind, list) else [kind]
            if "Product" in kinds and isinstance(o.get("description"), str) and o["description"].strip():
                found = " ".join(o["description"].split())
                return
            for v in o.values():
                if isinstance(v, (list, dict)):
                    walk(v)

    for b in blocks:
        try:
            walk(json.loads(b))
        except Exception:  # noqa: BLE001 — 壊れた JSON-LD は飛ばす
            continue
    return found


def page_text(html: str) -> dict[str, str]:
    """ページの題(title)と本文(text)。読めなければ空の文字"""
    p = TextParser()
    try:
        p.feed(html)
        p.close()
    except Exception:  # noqa: BLE001 — 壊れた HTML でも、読めたところまで使う
        pass
    body = _tidy(p.main if p.main else p.parts)
    desc = ld_description(p.ld)
    if desc and desc not in " ".join(body.split()):
        body = f"{desc}\n{body}" if body else desc
    return {"title": p.title_text[:300], "text": body[:MAX_TEXT].strip()}
