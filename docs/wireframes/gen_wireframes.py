# ワイヤーフレームの生成(draw.io の図と、確認用の PNG)
#   python docs/wireframes/gen_wireframes.py
# 出力:
#   docs/wireframes/ccp-wireframes.drawio  … draw.io(Confluence の draw.io マクロで取り込む)。1 画面 = 1 ページ
#   docs/wireframes/img/NN-*.svg / .png    … 確認用の画像(PNG は Edge で変換。Edge がなければ SVG だけ)
# 図は、矩形と文字だけで描く(灰色の簡素な表現)。番号の丸は、WIREFRAMES.md の表の番号と対応する。

import html
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
W, H = 1440, 900
FONT = "Yu Gothic UI, Meiryo, sans-serif"

# 灰色の濃さで、種類を分ける
STYLE = {
    "frame": ("#FFFFFF", "#666666"),
    "pane": ("#FFFFFF", "#BBBBBB"),
    "bar": ("#F2F2F2", "#BBBBBB"),
    "input": ("#FFFFFF", "#999999"),
    "button": ("#EEEEEE", "#888888"),
    "primary": ("#9E9E9E", "#666666"),
    "image": ("#E0E0E0", "#999999"),
    "chip": ("#F5F5F5", "#AAAAAA"),
    "dark": ("#616161", "#616161"),
    "backdrop": ("#D6D6D6", "#D6D6D6"),
    "s0": ("#F5F5F5", "#BDBDBD"),  # 状態: 未起案
    "s1": ("#E0E0E0", "#9E9E9E"),  # 検討中
    "s2": ("#CCCCCC", "#757575"),  # 承認済み
    "s3": ("#B0B0B0", "#424242"),  # 確定
}


class Page:
    def __init__(self, name, slug):
        self.name, self.slug, self.items = name, slug, []

    def rect(self, x, y, w, h, label="", kind="button", align="center", size=12, bold=False, rounded=True, valign="middle", color=None):
        self.items.append(dict(t="rect", x=x, y=y, w=w, h=h, label=label, kind=kind, align=align, size=size, bold=bold, rounded=rounded, valign=valign, color=color))

    def text(self, x, y, w, label, size=12, bold=False, align="left", h=None, color="#333333"):
        self.items.append(dict(t="text", x=x, y=y, w=w, h=h or round(size * 1.5 * (label.count("\n") + 1)), label=label, size=size, bold=bold, align=align, color=color))

    def line(self, x1, y1, x2, y2, color="#BBBBBB", width=1):
        self.items.append(dict(t="line", x1=x1, y1=y1, x2=x2, y2=y2, color=color, width=width))

    def image(self, x, y, w, h, label="画像"):
        self.rect(x, y, w, h, label, kind="image", rounded=False, size=11)
        self.line(x, y, x + w, y + h, "#BDBDBD")
        self.line(x + w, y, x, y + h, "#BDBDBD")

    def select(self, x, y, w, label, h=24):
        self.rect(x, y, w, h, label, kind="input", align="left")
        self.text(x + w - 18, y + (h - 18) / 2, 14, "▾", size=11, color="#666666")

    def num(self, n, x, y):
        self.items.append(dict(t="num", n=n, x=x, y=y))


# ---------------------------------------------------------------- 1. 配信カレンダー
def calendar():
    p = Page("01 配信カレンダー", "01-calendar")
    p.rect(0, 0, W, H, kind="pane", rounded=False)
    p.rect(0, 0, W, 44, kind="bar", rounded=False)
    p.rect(14, 12, 20, 20, "", kind="image", rounded=False)
    p.text(42, 11, 200, "配信カレンダー", size=16, bold=True)
    p.rect(841, 10, 114, 24, "テンプレート")
    p.rect(970, 10, 52, 24, "日本語", kind="primary")
    p.rect(1022, 10, 60, 24, "English")
    p.rect(1096, 13, 34, 18, "", kind="primary")
    p.text(1136, 13, 190, "開いたとき自動で下書き  オン", size=11)
    p.rect(1330, 10, 90, 24, "＋ 新規作成", kind="primary", bold=True)

    for i, lab in enumerate(["国", "チャネル", "部署", "ステータス"]):
        x = 136 + i * 142
        p.text(x, 68, 130, lab, size=11)
        p.select(x, 89, 130, "すべて")
    p.text(1170, 92, 132, "30 / 30 件", size=12, align="right")

    p.rect(136, 130, 24, 24, "‹")
    p.text(166, 129, 124, "2026年10月", size=16, bold=True, align="center")
    p.rect(296, 130, 24, 24, "›")
    p.rect(340, 130, 48, 24, "月", kind="primary")
    p.rect(388, 130, 48, 24, "週")
    p.rect(436, 130, 48, 24, "一覧")
    p.rect(498, 130, 84, 24, "書き出し")
    for i, (lab, k) in enumerate([("未起案", "s0"), ("検討中", "s1"), ("承認済み", "s2"), ("確定", "s3")]):
        x = 1006 + i * 74
        p.rect(x, 130, 70, 24, "", kind="chip")
        p.rect(x + 8, 137, 10, 10, "", kind=k, rounded=False)
        p.text(x + 22, 134, 48, lab, size=11)

    gx, gy, cw, rh = 136, 163, 1166 / 7, 121
    p.rect(gx, gy, 1166, 32 + rh * 5, kind="frame", rounded=False)
    for i, d in enumerate("日月火水木金土"):
        p.text(gx + i * cw, gy + 8, cw, d, align="center", bold=True)
    p.line(gx, gy + 32, gx + 1166, gy + 32)
    for r in range(1, 5):
        p.line(gx, gy + 32 + r * rh, gx + 1166, gy + 32 + r * rh)
    for c in range(1, 7):
        p.line(gx + c * cw, gy, gx + c * cw, gy + 32 + rh * 5)

    cards = {  # 日付: [(時刻, 配信名, 状態)]
        1: [("10:00", "Fall Arrivals", "s2")], 2: [("10:00", "秋の新作ニット", "s2")],
        3: [("09:00", "Weekend Sale", "s3"), ("18:00", "Flash Deal", "s3")],
        4: [("09:00", "週末セール", "s3"), ("18:00", "タイムセール", "s3")],
        5: [("10:00", "秋の新作を先取り", "s1")], 6: [("10:00", "アウター特集", "s1")],
        7: [("12:00", "Rainy Day Picks", "s0")], 8: [("10:00", "Outerwear Guide", "s1")],
        9: [("12:00", "雨の日のおすすめ", "s0")], 10: [("10:00", "Member Week", "s3"), ("18:00", "Reminder", "s3")],
        11: [("10:00", "会員感謝ウィーク", "s3")], 12: [("10:00", "New Knits", "s0")], 13: [("10:00", "ブーツ特集", "s1")],
        14: [("12:00", "Price Drop", "s0")], 15: [("10:00", "Boots Edit", "s1")], 16: [("10:00", "ハロウィン企画", "s0")],
        17: [("09:00", "Weekend Sale", "s0")], 19: [("10:00", "Holiday Preview", "s0")], 20: [("10:00", "冬支度スタート", "s0")],
        22: [("18:00", "Flash Deal", "s0")], 23: [("10:00", "ルームウェア特集", "s0")], 24: [("10:00", "Halloween", "s0")],
        26: [("10:00", "Cozy Home", "s0")], 27: [("10:00", "ブラックフライデー予告", "s0")],
        29: [("10:00", "Early Black Friday", "s0")], 30: [("12:00", "ラストコール", "s0")], 31: [("12:00", "Last Call", "s0")],
    }
    for idx in range(35):
        r, c = divmod(idx, 7)
        day = idx - 3  # 9/27 から始まる
        x, y = gx + c * cw, gy + 32 + r * rh
        label = str(day) if day >= 1 else str(27 + idx)
        if day == 5:
            p.rect(x + 4, y + 5, 22, 22, label, kind="dark", size=11)
        else:
            p.text(x + 8, y + 7, 30, label, size=12, color="#999999" if day < 1 else "#333333")
        for k, (tm, name, st) in enumerate(cards.get(day, [])):
            cy = y + 33 + k * 38
            p.rect(x + 5, cy, cw - 10, 34, f"{tm} ・\n{name}", kind=st, align="left", size=11, rounded=False)
            p.rect(x + 5, cy, 4, 34, "", kind="dark", rounded=False)
    # 日付セルに重ねたときの「＋」(例として 21 日)
    x21, y21 = gx + 3 * cw, gy + 32 + 3 * rh
    p.rect(x21 + cw - 28, y21 + 5, 22, 22, "＋")

    for n, x, y in [(1, 160, 11), (2, 830, 0), (3, 958, 0), (4, 1084, 0), (5, 1318, 0), (6, 154, 64), (7, 1216, 90),
                    (8, 108, 131), (9, 328, 122), (10, 486, 122), (11, 994, 122), (12, x21 + cw - 40, y21 - 4),
                    (13, gx + 2 * cw - 22, gy + 32 + rh + 20), (14, gx + cw + 30, gy + 32 + rh + 5)]:
        p.num(n, x, y)
    return p


# ---------------------------------------------------------------- 2. 配信カード(全体)
def card():
    p = Page("02 配信カード(全体)", "02-card")
    p.rect(0, 0, W, H, kind="backdrop", rounded=False)
    p.rect(14, 36, 1411, 828, kind="frame")
    p.text(32, 52, 500, "秋の新作ニット", size=18, bold=True)
    p.rect(1256, 58, 78, 24, "工程 5 / 5", kind="chip", size=11)
    p.rect(1344, 58, 28, 24, "…")
    p.rect(1384, 56, 28, 28, "×")
    p.line(14, 104, 1425, 104)

    # 左: 配信情報と工程の要約
    p.line(326, 104, 326, 804)
    p.rect(31, 116, 268, 32, "✦ すべてAIで下書き", kind="primary", bold=True)
    p.text(31, 152, 268, "テーマ〜制作指示を、まとめてAIが下書きします", size=10, color="#666666")
    p.text(31, 178, 200, "配信情報", size=14, bold=True)
    p.text(31, 202, 200, "配信名 *", size=11)
    p.rect(31, 218, 268, 24, "秋の新作ニット", kind="input", align="left")
    p.text(31, 248, 200, "配信日時 *", size=11)
    p.rect(31, 264, 268, 24, "2026/10/02 10:00", kind="input", align="left")
    p.rect(277, 270, 14, 12, "", kind="chip", rounded=False)
    for row, (a, av, b, bv) in enumerate([("国", "JP", "チャネル", "メール"), ("部署", "販促", "ステータス", "承認済み"),
                                          ("担当者", "(選択)", "制作の締め切り", "2026/09/28")]):
        y = 294 + row * 50
        p.text(31, y, 128, a, size=11)
        p.text(171, y, 128, b, size=11)
        p.select(31, y + 16, 128, av)
        p.select(171, y + 16, 128, bv)
    p.text(31, 448, 200, "工程", size=14, bold=True)
    p.text(31, 472, 268, "テーマ(配信全体の前提。メールには出ない)", size=11)
    p.rect(31, 488, 268, 34, "ニットで重ねる、秋の新作", kind="input", align="left", valign="top", rounded=False)
    p.text(31, 526, 268, "AIの理由: 10月初旬で肌寒くなる時期…", size=10, color="#666666")
    p.text(31, 548, 268, "掲載商品: 4件(中央の「セクション」で選ぶ)", size=11)
    p.text(31, 572, 268, "ヘッドライン(メイン画像に載せる大見出し)", size=11)
    p.rect(31, 588, 268, 34, "ぬくもりを纏う、秋のニット", kind="input", align="left", valign="top", rounded=False)
    p.text(31, 628, 268, "コピー(ヘッドラインの下の導入文)", size=11)
    p.rect(31, 644, 268, 40, "重ねるほどに表情が変わる…", kind="input", align="left", valign="top", rounded=False)
    p.text(31, 688, 268, "切り口: 商品の魅力", size=10, color="#666666")
    p.text(31, 712, 268, "制作指示", size=11)
    p.rect(31, 728, 268, 60, "(制作担当への指示)", kind="input", align="left", valign="top", rounded=False)
    p.rect(316, 112, 4, 160, "", kind="dark", rounded=False)

    # 中央: 工程ごとの内容づくり
    p.line(749, 104, 749, 804)
    p.text(342, 116, 300, "コンテンツ生成", size=14, bold=True)
    for i, lab in enumerate(["✓ ①テーマ", "✓ ②テンプレート", "✓ ③ヒーロー", "✓ ④セクション", "✓ ⑤制作指示"]):
        p.rect(342 + i * 79, 144, 77, 28, lab, kind="chip" if i else "primary", size=10, rounded=False)
    p.rect(342, 186, 114, 24, "✦ AIで案を出す")
    p.text(342, 222, 300, "採用中のテーマ(配信全体の前提)", size=11)
    p.rect(560, 222, 44, 18, "採用中", kind="dark", size=10)
    p.rect(342, 244, 391, 40, "ニットで重ねる、秋の新作", kind="input", align="left", valign="top", rounded=False)
    p.text(342, 290, 391, "AIの理由: 10月初旬で肌寒くなる時期。売上上昇中のニット類が主役になる、季節感重視のテーマ。", size=10, h=30, color="#666666")
    for i in range(3):
        y = 330 + i * 58
        p.rect(342, y, 391, 50, "", kind="pane", rounded=False)
        p.text(352, y + 6, 300, f"案 {i + 1}: (テーマの案)", size=12, bold=True)
        p.text(352, y + 26, 300, "理由: (この時期に、このテーマを選ぶ理由)", size=10, color="#666666")
        p.rect(673, y + 13, 50, 24, "採用")
    p.rect(326, 560, 423, 30, "✦ AIチャット — テーマ", kind="bar", align="left", rounded=False)
    p.text(726, 566, 14, "▾", size=11, color="#666666")
    p.text(342, 600, 391, "このタブの案づくりに、指示を加えられます。", size=11, color="#666666")
    for i, (lab, w) in enumerate([("もっとカジュアルな切り口で", 160), ("季節感を強めて", 110)]):
        p.rect(342 + (0 if i == 0 else 168), 626, w, 24, lab, kind="chip", size=11)
    p.rect(342, 656, 160, 24, "売れ筋の商品を主役にして", kind="chip", size=11)
    p.rect(342, 748, 351, 40, "AIへの指示を入力(Enterで送信、Shift+Enterで改行)", kind="input", align="left", valign="top", size=11, rounded=False)
    p.rect(701, 752, 32, 32, "➤")

    # 右: プレビュー
    p.rect(766, 116, 58, 30, "メール", kind="primary")
    p.rect(824, 116, 72, 30, "プッシュ")
    p.rect(1040, 120, 50, 24, "PC", kind="primary", size=11)
    p.rect(1090, 120, 50, 24, "スマホ", size=11)
    p.rect(1158, 120, 24, 24, "−")
    p.rect(1188, 130, 80, 4, "", kind="dark", rounded=False)
    p.rect(1274, 120, 24, 24, "＋")
    p.text(1302, 123, 40, "70%", size=11)
    p.rect(1336, 120, 48, 24, "全体", size=11)
    p.text(934, 160, 400, "件名: 秋の新作ニット", size=10)
    p.text(934, 176, 400, "プリヘッダー: 重ねるほどに表情が変わる…", size=10, color="#666666")
    p.rect(934, 196, 277, 604, kind="pane", rounded=False)
    p.rect(934, 196, 277, 22, "SHOP", kind="dark", size=10, rounded=False)
    p.image(934, 218, 277, 120, "メイン画像")
    p.rect(934, 338, 277, 44, "ヘッドライン\nコピー", kind="s2", size=11, rounded=False)
    p.text(934, 388, 277, "セクションの見出し・コピー", size=10, align="center")
    for r in range(2):
        for c in range(2):
            x, y = 944 + c * 133, 408 + r * 170
            p.image(x, y, 125, 110, "商品画像")
            p.text(x, y + 114, 125, "商品名\n¥0,000", size=10)
            p.rect(x, y + 146, 125, 16, "詳細はこちら", kind="dark", size=9, rounded=False)
    p.line(1395, 104, 1395, 804)
    p.rect(1395, 104, 30, 700, "‹\n商\n品\n情\n報", kind="bar", size=11, rounded=False, valign="top")

    # 下: 保存
    p.line(14, 804, 1425, 804)
    p.rect(1213, 818, 90, 30, "キャンセル")
    p.rect(1313, 818, 96, 30, "保存", kind="primary", bold=True)

    for n, x, y in [(1, 180, 52), (2, 1284, 84), (3, 1347, 84), (4, 1387, 86), (5, 288, 106), (6, 100, 176), (7, 66, 446),
                    (8, 452, 114), (9, 462, 186), (10, 612, 220), (11, 330, 320), (12, 520, 564), (13, 900, 120),
                    (14, 1030, 96), (15, 1148, 96), (16, 900, 160), (17, 908, 200), (18, 1370, 160), (19, 1188, 822)]:
        p.num(n, x, y)
    return p


# ---------------------------------------------------------------- 出力
def drawio(pages):
    out = ['<mxfile host="app.diagrams.net">']
    for pi, p in enumerate(pages):
        out.append(f'<diagram id="p{pi + 1}" name="{html.escape(p.name)}"><mxGraphModel dx="1440" dy="900" grid="0" gridSize="10" guides="1" tooltips="1" connect="0" arrows="0" fold="1" page="1" pageScale="1" pageWidth="{W}" pageHeight="{H}" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>')
        for i, it in enumerate(p.items):
            cid = f"c{pi}_{i}"
            if it["t"] == "line":
                out.append(f'<mxCell id="{cid}" style="endArrow=none;html=1;strokeColor={it["color"]};strokeWidth={it["width"]};" edge="1" parent="1"><mxGeometry relative="1" as="geometry"><mxPoint x="{it["x1"]:.0f}" y="{it["y1"]:.0f}" as="sourcePoint"/><mxPoint x="{it["x2"]:.0f}" y="{it["y2"]:.0f}" as="targetPoint"/></mxGeometry></mxCell>')
                continue
            if it["t"] == "num":
                style = "ellipse;whiteSpace=wrap;html=1;fillColor=#212121;strokeColor=#FFFFFF;fontColor=#FFFFFF;fontSize=11;fontStyle=1;"
                value, x, y, w, h = str(it["n"]), it["x"], it["y"], 22, 22
            elif it["t"] == "text":
                style = f'text;html=1;strokeColor=none;fillColor=none;align={it["align"]};verticalAlign=top;whiteSpace=wrap;fontSize={it["size"]};fontColor={it["color"]};spacing=0;' + ("fontStyle=1;" if it["bold"] else "")
                value, x, y, w, h = it["label"], it["x"], it["y"], it["w"], it["h"]
            else:
                fill, stroke = STYLE[it["kind"]]
                fc = "#FFFFFF" if it["kind"] in ("dark", "primary") else "#333333"
                style = (f'rounded={1 if it["rounded"] else 0};arcSize=12;whiteSpace=wrap;html=1;fillColor={fill};strokeColor={stroke};fontColor={fc};'
                         f'fontSize={it["size"]};align={it["align"]};verticalAlign={it["valign"]};spacingLeft={6 if it["align"] == "left" else 0};spacingTop={4 if it["valign"] == "top" else 0};'
                         + ("fontStyle=1;" if it["bold"] else ""))
                value, x, y, w, h = it["label"], it["x"], it["y"], it["w"], it["h"]
            value = html.escape(html.escape(value).replace("\n", "<br>"))
            out.append(f'<mxCell id="{cid}" value="{value}" style="{style}" vertex="1" parent="1"><mxGeometry x="{x:.0f}" y="{y:.0f}" width="{w:.0f}" height="{h:.0f}" as="geometry"/></mxCell>')
        out.append("</root></mxGraphModel></diagram>")
    out.append("</mxfile>")
    return "\n".join(out)


def svg(p):
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="{FONT}">']

    def txt(x, y, w, h, label, size, bold, align, valign, color, pad=0):
        lines = label.split("\n")
        lh = size * 1.3
        anchor = {"left": "start", "center": "middle", "right": "end"}[align]
        tx = {"left": x + pad, "center": x + w / 2, "right": x + w}[align]
        top = y + (h - lh * len(lines)) / 2 if valign == "middle" else y + (4 if pad else 0)
        for i, ln in enumerate(lines):
            o.append(f'<text x="{tx:.1f}" y="{top + lh * i + size:.1f}" font-size="{size}" fill="{color}" text-anchor="{anchor}"{" font-weight=\"bold\"" if bold else ""}>{html.escape(ln)}</text>')

    for it in p.items:
        if it["t"] == "line":
            o.append(f'<line x1="{it["x1"]:.1f}" y1="{it["y1"]:.1f}" x2="{it["x2"]:.1f}" y2="{it["y2"]:.1f}" stroke="{it["color"]}" stroke-width="{it["width"]}"/>')
        elif it["t"] == "num":
            o.append(f'<circle cx="{it["x"] + 11}" cy="{it["y"] + 11}" r="11" fill="#212121" stroke="#FFFFFF" stroke-width="1.5"/>')
            o.append(f'<text x="{it["x"] + 11}" y="{it["y"] + 15}" font-size="11" font-weight="bold" fill="#FFFFFF" text-anchor="middle">{it["n"]}</text>')
        elif it["t"] == "text":
            txt(it["x"], it["y"], it["w"], it["h"], it["label"], it["size"], it["bold"], it["align"], "top", it["color"])
        else:
            fill, stroke = STYLE[it["kind"]]
            rx = 3 if it["rounded"] else 0
            o.append(f'<rect x="{it["x"]:.1f}" y="{it["y"]:.1f}" width="{it["w"]:.1f}" height="{it["h"]:.1f}" rx="{rx}" fill="{fill}" stroke="{stroke}"/>')
            if it["label"]:
                fc = "#FFFFFF" if it["kind"] in ("dark", "primary") else "#333333"
                txt(it["x"], it["y"], it["w"], it["h"], it["label"], it["size"], it["bold"], it["align"], it["valign"], fc, pad=6 if it["align"] == "left" or it["valign"] == "top" else 0)
    o.append("</svg>")
    return "\n".join(o)


def edge():
    for c in [shutil.which("msedge"), r"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", r"C:/Program Files/Microsoft/Edge/Application/msedge.exe"]:
        if c and Path(c).exists():
            return c
    return None


def main():
    pages = [calendar(), card()]
    (HERE / "ccp-wireframes.drawio").write_text(drawio(pages), encoding="utf-8")
    img = HERE / "img"
    img.mkdir(exist_ok=True)
    browser = edge()
    for p in pages:
        (img / f"{p.slug}.png").unlink(missing_ok=True)
        f = img / f"{p.slug}.svg"
        f.write_text(svg(p), encoding="utf-8")
        if browser:
            with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as prof:
                subprocess.run([browser, "--headless=new", "--disable-gpu", f"--user-data-dir={prof}", "--hide-scrollbars",
                                f"--window-size={W},{H}", f"--screenshot={img / (p.slug + '.png')}", f.as_uri()],
                               check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60)
                png = img / (p.slug + ".png")
                for _ in range(40):  # Edge は、書き出しを待たずに戻ることがある
                    if png.exists():
                        break
                    time.sleep(0.5)
    print("ok:", ", ".join(p.name for p in pages))


if __name__ == "__main__":
    main()
