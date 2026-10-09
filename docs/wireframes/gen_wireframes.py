# ワイヤーフレームの生成(draw.io の図と、確認用の PNG)。英語版・US 向け
#   python docs/wireframes/gen_wireframes.py
# 出力:
#   docs/wireframes/ccp-wireframes.drawio  … draw.io(Confluence の draw.io マクロで取り込む)。1 画面 = 1 ページ
#   docs/wireframes/img/NN-*.svg / .png    … 確認用の画像(PNG は Edge で変換。Edge がなければ SVG だけ)
# 図は、線と文字だけで描く(塗りなし)。黒い丸の番号は、WIREFRAMES.md の表の番号と対応する。

import html
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
W, H = 1440, 900
FONT = "Segoe UI, Arial, sans-serif"
INK, MUTED = "#222222", "#777777"

# 線の色・太さ・破線
LINE = {
    "frame": ("#222222", 1, False),
    "box": ("#444444", 1, False),
    "input": ("#888888", 1, False),
    "faint": ("#BBBBBB", 1, False),
    "sel": ("#222222", 2, False),
    "dash": ("#888888", 1, True),
}


class Page:
    def __init__(self, name, slug):
        self.name, self.slug, self.items = name, slug, []

    def rect(self, x, y, w, h, label="", kind="box", align="center", size=12, bold=False, rounded=True, valign="middle", color=INK):
        self.items.append(dict(t="rect", x=x, y=y, w=w, h=h, label=label, kind=kind, align=align, size=size, bold=bold, rounded=rounded, valign=valign, color=color))

    def text(self, x, y, w, label, size=12, bold=False, align="left", h=None, color=INK):
        self.items.append(dict(t="text", x=x, y=y, w=w, h=h or round(size * 1.5 * (label.count("\n") + 1)), label=label, size=size, bold=bold, align=align, color=color))

    def line(self, x1, y1, x2, y2, color="#888888", width=1):
        self.items.append(dict(t="line", x1=x1, y1=y1, x2=x2, y2=y2, color=color, width=width))

    def hline(self, x1, x2, y, color="#888888"):
        self.line(x1, y, x2, y, color)

    def vline(self, x, y1, y2, color="#888888"):
        self.line(x, y1, x, y2, color)

    def image(self, x, y, w, h, label="Image", kind="input"):
        self.rect(x, y, w, h, "", kind=kind, rounded=False)
        self.line(x, y, x + w, y + h, "#BBBBBB")
        self.line(x + w, y, x, y + h, "#BBBBBB")
        if label:
            self.text(x, y + h / 2 - 9, w, label, size=11, align="center", color=MUTED)

    def select(self, x, y, w, label, h=24):
        self.rect(x, y, w, h, label, kind="input", align="left")
        self.text(x + w - 18, y + (h - 18) / 2, 14, "▾", size=11, color=MUTED)

    def num(self, n, x, y):
        self.items.append(dict(t="num", n=n, x=x, y=y))


# ---------------------------------------------------------------- 1. Delivery calendar
def calendar():
    p = Page("01 Delivery calendar", "01-calendar")
    p.rect(0, 0, W, H, kind="faint", rounded=False)
    p.hline(0, W, 44)
    p.rect(14, 12, 20, 20, "▦", kind="input", size=11, rounded=False)
    p.text(42, 11, 220, "Delivery Calendar", size=16, bold=True)
    p.rect(841, 10, 114, 24, "Templates")
    p.rect(970, 10, 56, 24, "日本語", kind="input", size=11)
    p.rect(1026, 10, 60, 24, "English", kind="sel", size=11, bold=True)
    p.rect(1096, 13, 34, 18, "●", kind="box", size=10, align="right")
    p.text(1136, 13, 190, "Auto-draft on open: On", size=11)
    p.rect(1330, 10, 90, 24, "+ New", kind="sel", bold=True)

    for i, lab in enumerate(["Channel", "Department", "Status"]):
        x = 136 + i * 142
        p.text(x, 68, 130, lab, size=11)
        p.select(x, 89, 130, "All")
    p.text(1170, 92, 132, "30 / 30 items", size=12, align="right")

    p.rect(136, 130, 24, 24, "‹")
    p.text(162, 129, 132, "October 2026", size=16, bold=True, align="center")
    p.rect(296, 130, 24, 24, "›")
    p.rect(340, 130, 56, 24, "Month", kind="sel", bold=True, size=11)
    p.rect(396, 130, 56, 24, "Week", kind="input", size=11)
    p.rect(452, 130, 56, 24, "List", kind="input", size=11)
    p.rect(522, 130, 76, 24, "Export", size=11)
    p.text(902, 134, 400, "Status:  Not started · In review · Approved · Confirmed", size=11, align="right", color=MUTED)

    gx, gy, cw, rh = 136, 163, 1166 / 7, 121
    p.rect(gx, gy, 1166, 32 + rh * 5, kind="frame", rounded=False)
    for i, d in enumerate(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]):
        p.text(gx + i * cw, gy + 8, cw, d, align="center", bold=True)
    p.hline(gx, gx + 1166, gy + 32)
    for r in range(1, 5):
        p.hline(gx, gx + 1166, gy + 32 + r * rh, "#BBBBBB")
    for c in range(1, 7):
        p.vline(gx + c * cw, gy, gy + 32 + rh * 5, "#BBBBBB")

    NS, IR, AP, CF = "Not started", "In review", "Approved", "Confirmed"
    cards = {  # day: [(time, name, status)]
        1: [("10:00", "Fall Arrivals", AP)], 2: [("10:00", "Fall Knits", AP)],
        3: [("09:00", "Weekend Sale", CF), ("18:00", "Flash Deal", CF)],
        4: [("09:00", "Sunday Picks", CF), ("18:00", "Time Sale", CF)],
        5: [("10:00", "Fall Preview", IR)], 6: [("10:00", "Outerwear Edit", IR)],
        7: [("12:00", "Rainy Day Picks", NS)], 8: [("10:00", "Outerwear Guide", IR)],
        9: [("12:00", "Cozy Layers", NS)], 10: [("10:00", "Member Week", CF), ("18:00", "Reminder", CF)],
        11: [("10:00", "Member Thanks", CF)], 12: [("10:00", "New Knits", NS)], 13: [("10:00", "Boots Feature", IR)],
        14: [("12:00", "Price Drop", NS)], 15: [("10:00", "Boots Edit", IR)], 16: [("10:00", "Halloween Prep", NS)],
        17: [("09:00", "Weekend Sale", NS)], 19: [("10:00", "Holiday Preview", NS)], 20: [("10:00", "Winter Ready", NS)],
        22: [("18:00", "Flash Deal", NS)], 23: [("10:00", "Loungewear", NS)], 24: [("10:00", "Halloween", NS)],
        26: [("10:00", "Cozy Home", NS)], 27: [("10:00", "Black Friday Teaser", NS)],
        29: [("10:00", "Early Black Friday", NS)], 30: [("12:00", "Last Call", NS)], 31: [("12:00", "Last Chance", NS)],
    }
    for idx in range(35):
        r, c = divmod(idx, 7)
        day = idx - 3  # starts on Sep 27
        x, y = gx + c * cw, gy + 32 + r * rh
        label = str(day) if day >= 1 else str(27 + idx)
        if day == 5:
            p.rect(x + 4, y + 5, 22, 22, label, kind="sel", size=11, bold=True)
        else:
            p.text(x + 8, y + 7, 30, label, size=12, color=MUTED if day < 1 else INK)
        for k, (tm, name, st) in enumerate(cards.get(day, [])):
            cy = y + 33 + k * 38
            p.rect(x + 5, cy, cw - 10, 34, "", kind="box", rounded=False)
            p.text(x + 11, cy + 2, cw - 20, f"{tm} · {st}", size=10, color=MUTED)
            p.text(x + 11, cy + 17, cw - 20, name, size=11)
    # the "+" shown when hovering a day (example: the 21st)
    x21, y21 = gx + 3 * cw, gy + 32 + 3 * rh
    p.rect(x21 + cw - 28, y21 + 5, 22, 22, "+")

    for n, x, y in [(1, 200, 11), (2, 830, 0), (3, 958, 0), (4, 1084, 0), (5, 1318, 0), (6, 194, 64), (7, 1206, 90),
                    (8, 108, 131), (9, 328, 122), (10, 510, 122), (11, 1018, 131), (12, x21 + cw - 40, y21 - 4),
                    (13, gx + 2 * cw - 22, gy + 32 + rh + 20), (14, gx + cw + 30, gy + 32 + rh + 5)]:
        p.num(n, x, y)
    return p


# ---------------------------------------------------------------- 2. Delivery card (overall, product info open)
def card():
    p = Page("02 Delivery card (overall)", "02-card")
    p.rect(0, 0, W, H, kind="faint", rounded=False)
    p.rect(14, 36, 1411, 828, kind="frame")
    p.text(32, 52, 500, "Fall Knits", size=18, bold=True)
    p.rect(1256, 58, 78, 24, "Step 5 / 5", size=11)
    p.rect(1344, 58, 28, 24, "…")
    p.rect(1384, 56, 28, 28, "×")
    p.hline(14, 1425, 104)

    # left: delivery info and step summary
    p.vline(326, 104, 804)
    p.rect(31, 116, 268, 32, "✦ Draft all with AI", kind="sel", bold=True)
    p.text(31, 152, 268, "AI drafts every step, from theme to production notes", size=10, color=MUTED)
    p.text(31, 178, 200, "Delivery info", size=14, bold=True)
    p.text(31, 202, 200, "Name *", size=11)
    p.rect(31, 218, 268, 24, "Fall Knits", kind="input", align="left")
    p.text(31, 248, 200, "Date & time *", size=11)
    p.rect(31, 264, 268, 24, "10/02/2026 10:00 AM", kind="input", align="left")
    p.rect(277, 270, 14, 12, "", kind="input", rounded=False)
    for row, pair in enumerate([(("Channel", "Email"), ("Department", "Promotion")), (("Status", "Approved"), ("Owner", "(select)")),
                                (("Production due", "09/28/2026"),)]):
        y = 294 + row * 50
        for col, (lab, val) in enumerate(pair):
            x = 31 + col * 140
            p.text(x, y, 128, lab, size=11)
            p.select(x, y + 16, 128, val)
    p.text(31, 448, 200, "Steps", size=14, bold=True)
    p.text(31, 472, 268, "Theme (premise for the delivery; not in the email)", size=10)
    p.rect(31, 488, 268, 34, "Layer up in new fall knits", kind="input", align="left", valign="top", rounded=False)
    p.text(31, 526, 268, "AI reason: early October turns chilly…", size=10, color=MUTED)
    p.text(31, 548, 268, "Products: 4 (chosen in the Sections tab)", size=11)
    p.text(31, 572, 268, "Headline (large text on the main image)", size=10)
    p.rect(31, 588, 268, 34, "Wrap up in fall knits", kind="input", align="left", valign="top", rounded=False)
    p.text(31, 628, 268, "Copy (intro below the headline)", size=10)
    p.rect(31, 644, 268, 40, "New knits that change with every layer…", kind="input", align="left", valign="top", rounded=False)
    p.text(31, 688, 268, "Angle: product appeal", size=10, color=MUTED)
    p.text(31, 712, 268, "Production notes", size=10)
    p.rect(31, 728, 268, 60, "(notes for the production team)", kind="input", align="left", valign="top", rounded=False, color=MUTED)
    p.vline(318, 112, 272, "#444444")

    # middle: content by step
    p.vline(749, 104, 804)
    p.text(342, 116, 300, "Content", size=14, bold=True)
    for i, lab in enumerate(["✓ 1 Theme", "✓ 2 Template", "✓ 3 Hero", "✓ 4 Sections", "✓ 5 Production"]):
        x = 342 + i * 79
        p.text(x, 150, 77, lab, size=10, bold=(i == 0), align="center")
    p.hline(342, 733, 172)
    p.line(342, 172, 419, 172, INK, 2)
    p.rect(342, 186, 130, 24, "✦ Suggest with AI", size=11)
    p.text(342, 222, 300, "Current theme (premise for the delivery)", size=11)
    p.rect(586, 221, 56, 18, "Adopted", size=10)
    p.rect(342, 244, 391, 40, "Layer up in new fall knits", kind="input", align="left", valign="top", rounded=False)
    p.text(342, 290, 391, "AI reason: early October turns chilly and knits are trending up,\nso a seasonal theme with knits in the lead.", size=10, h=30, color=MUTED)
    for i in range(3):
        y = 330 + i * 58
        p.rect(342, y, 391, 50, "", kind="input", rounded=False)
        p.text(352, y + 6, 300, f"Option {i + 1}: (theme)", size=12, bold=True)
        p.text(352, y + 26, 300, "Reason: (why this theme, at this time)", size=10, color=MUTED)
        p.rect(673, y + 13, 50, 24, "Adopt", size=11)
    p.hline(326, 749, 560)
    p.text(342, 567, 360, "✦ AI chat — Theme", size=12, bold=True)
    p.text(726, 566, 14, "▾", size=11, color=MUTED)
    p.hline(326, 749, 590)
    p.text(342, 600, 391, "Add instructions to refine the suggestions in this tab.", size=11, color=MUTED)
    p.rect(342, 626, 130, 24, "More casual angle", size=11)
    p.rect(480, 626, 150, 24, "Stronger seasonal feel", size=11)
    p.rect(342, 656, 130, 24, "Feature best sellers", size=11)
    p.rect(342, 748, 351, 40, "Type an instruction (Enter to send, Shift+Enter for a new line)", kind="input", align="left", valign="top", size=10, rounded=False, color=MUTED)
    p.rect(701, 752, 32, 32, "➤")

    # right: preview
    px0, px1 = 749, 1110
    p.vline(px1, 104, 804)
    p.text(766, 118, 56, "Email", bold=True, align="center")
    p.text(826, 118, 56, "Push", align="center")
    p.line(766, 140, 822, 140, INK, 2)
    p.rect(940, 116, 74, 24, "Desktop", kind="sel", size=11)
    p.rect(1014, 116, 74, 24, "Mobile", kind="input", size=11)
    p.rect(766, 152, 22, 22, "−", size=11)
    p.line(794, 163, 864, 163, "#444444")
    p.rect(822, 157, 10, 12, "", kind="box", rounded=False)
    p.rect(870, 152, 22, 22, "+", size=11)
    p.text(898, 155, 40, "70%", size=11)
    p.rect(940, 152, 48, 22, "Fit", size=11)
    p.text(790, 184, 300, "Subject: Fall Knits", size=10)
    p.text(790, 199, 300, "Preheader: New knits that change with every layer…", size=10, color=MUTED)
    ex, ew = 790, 277
    p.rect(ex, 218, ew, 582, kind="box", rounded=False)
    p.rect(ex, 218, ew, 22, "SHOP", kind="box", size=10, bold=True, rounded=False)
    p.image(ex, 240, ew, 110, "Main image")
    p.rect(ex, 350, ew, 40, "Headline\nCopy", kind="box", size=11, rounded=False)
    p.text(ex, 396, ew, "Section heading · copy", size=10, align="center", color=MUTED)
    for r in range(2):
        for c in range(2):
            x, y = ex + 10 + c * 133, 416 + r * 172
            p.image(x, y, 125, 108, "Product image", kind="sel" if (r, c) == (0, 0) else "input")
            p.text(x, y + 112, 125, "Product name\n$00.00", size=10)
            p.rect(x, y + 144, 125, 18, "Shop now", size=9, rounded=False)

    # right edge: product info (open)
    qx = px1 + 12
    p.text(qx, 112, 240, "Product info", size=14, bold=True)
    p.rect(1394, 112, 22, 22, "›", size=12)
    p.text(qx, 140, 290, "Products in this delivery (email order)", size=10, color=MUTED)
    rows = [("Crewneck Knit", "$98.00"), ("Cable Knit", "$118.00"), ("Cardigan", "$108.00"), ("Turtleneck", "$88.00")]
    for i, (nm, pr) in enumerate(rows):
        y = 158 + i * 40
        p.rect(qx, y, 292, 36, "", kind="sel" if i == 0 else "input", rounded=False)
        p.image(qx + 4, y + 4, 28, 28, "")
        p.text(qx + 40, y + 4, 180, nm, size=11, bold=(i == 0))
        p.text(qx + 40, y + 19, 180, pr, size=10, color=MUTED)
        p.text(qx + 220, y + 10, 66, f"Sec. {1 + i // 2}", size=10, align="right", color=MUTED)
    y0 = 326
    p.hline(qx, qx + 292, y0)
    p.text(qx, y0 + 8, 292, "Crewneck Knit", size=13, bold=True)
    for i, (k, v, d) in enumerate([("Sales, last 4 wks", "1,240", "▲ 12%"), ("Stock covers", "6.5 wks", ""), ("12-wk sales", "$121.5K", "")]):
        x = qx + i * 99
        p.rect(x, y0 + 32, 94, 54, "", kind="input", rounded=False)
        p.text(x + 6, y0 + 36, 86, k, size=9, color=MUTED)
        p.text(x + 6, y0 + 52, 86, v, size=14, bold=True)
        if d:
            p.text(x + 52, y0 + 56, 40, d, size=9)
    cy0 = y0 + 98
    p.text(qx, cy0, 292, "Weekly sales (bars) / stock (line), 12 wks", size=10, color=MUTED)
    p.rect(qx, cy0 + 18, 292, 120, "", kind="input", rounded=False)
    base = cy0 + 128
    heights = [30, 36, 34, 42, 48, 46, 55, 60, 58, 66, 72, 78]
    for i, hgt in enumerate(heights):
        p.rect(qx + 12 + i * 23, base - hgt, 12, hgt, "", kind="box", rounded=False)
    stock = [96, 92, 90, 84, 80, 77, 70, 66, 62, 56, 50, 46]
    for i in range(len(stock) - 1):
        p.line(qx + 18 + i * 23, base - stock[i], qx + 18 + (i + 1) * 23, base - stock[i + 1], INK, 1.5)
    ty = cy0 + 150
    p.text(qx, ty, 292, "MD plan", size=11, bold=True)
    p.text(qx, ty + 18, 292, "Policy: lead item for fall\nPromotion: 10/01 – 10/31\nThis week: feature in email + push", size=10, h=48)
    p.text(qx, ty + 74, 292, "Attributes", size=11, bold=True)
    p.text(qx, ty + 92, 292, "Rating 4.6 (212) · Season: fall–winter\nWeather: cold days · New arrival", size=10, h=32)

    # bottom: save
    p.hline(14, 1425, 804)
    p.rect(1213, 818, 90, 30, "Cancel")
    p.rect(1313, 818, 96, 30, "Save", kind="sel", bold=True)

    for n, x, y in [(1, 120, 52), (2, 1284, 84), (3, 1347, 84), (4, 1387, 86), (5, 288, 106), (6, 128, 176), (7, 80, 446),
                    (8, 412, 114), (9, 478, 186), (10, 650, 219), (11, 330, 320), (12, 470, 565), (13, 888, 116),
                    (14, 1092, 116), (15, 990, 152), (16, 766, 184), (17, 766, 220), (18, 1236, 112), (19, 1396, 140),
                    (20, 1396, 358), (21, 1396, 442), (22, 1396, 572), (23, 1188, 822)]:
        p.num(n, x, y)
    return p


# ---------------------------------------------------------------- output
def drawio(pages):
    out = ['<mxfile host="app.diagrams.net">']
    for pi, p in enumerate(pages):
        out.append(f'<diagram id="p{pi + 1}" name="{html.escape(p.name)}"><mxGraphModel dx="1440" dy="900" grid="0" gridSize="10" guides="1" tooltips="1" connect="0" arrows="0" fold="1" page="1" pageScale="1" pageWidth="{W}" pageHeight="{H}" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>')
        for i, it in enumerate(p.items):
            cid = f"c{pi}_{i}"
            if it["t"] == "line":
                out.append(f'<mxCell id="{cid}" style="endArrow=none;html=1;strokeColor={it["color"]};strokeWidth={it["width"]};" edge="1" parent="1"><mxGeometry relative="1" as="geometry"><mxPoint x="{it["x1"]:.1f}" y="{it["y1"]:.1f}" as="sourcePoint"/><mxPoint x="{it["x2"]:.1f}" y="{it["y2"]:.1f}" as="targetPoint"/></mxGeometry></mxCell>')
                continue
            if it["t"] == "num":
                style = "ellipse;whiteSpace=wrap;html=1;fillColor=#222222;strokeColor=#FFFFFF;fontColor=#FFFFFF;fontSize=11;fontStyle=1;"
                value, x, y, w, h = str(it["n"]), it["x"], it["y"], 22, 22
            elif it["t"] == "text":
                style = f'text;html=1;strokeColor=none;fillColor=none;align={it["align"]};verticalAlign=top;whiteSpace=wrap;fontSize={it["size"]};fontColor={it["color"]};spacing=0;' + ("fontStyle=1;" if it["bold"] else "")
                value, x, y, w, h = it["label"], it["x"], it["y"], it["w"], it["h"]
            else:
                stroke, sw, dash = LINE[it["kind"]]
                style = (f'rounded={1 if it["rounded"] else 0};arcSize=12;whiteSpace=wrap;html=1;fillColor=none;strokeColor={stroke};strokeWidth={sw};dashed={1 if dash else 0};fontColor={it["color"]};'
                         f'fontSize={it["size"]};align={it["align"]};verticalAlign={it["valign"]};spacingLeft={6 if it["align"] == "left" else 0};spacingRight={4 if it["align"] == "right" else 0};spacingTop={4 if it["valign"] == "top" else 0};'
                         + ("fontStyle=1;" if it["bold"] else ""))
                value, x, y, w, h = it["label"], it["x"], it["y"], it["w"], it["h"]
            value = html.escape(html.escape(value).replace("\n", "<br>"))
            out.append(f'<mxCell id="{cid}" value="{value}" style="{style}" vertex="1" parent="1"><mxGeometry x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" as="geometry"/></mxCell>')
        out.append("</root></mxGraphModel></diagram>")
    out.append("</mxfile>")
    return "\n".join(out)


def svg(p):
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="{FONT}">',
         f'<rect x="0" y="0" width="{W}" height="{H}" fill="#FFFFFF"/>']

    def txt(x, y, w, h, label, size, bold, align, valign, color, pad=0):
        lines = label.split("\n")
        lh = size * 1.3
        anchor = {"left": "start", "center": "middle", "right": "end"}[align]
        tx = {"left": x + pad, "center": x + w / 2, "right": x + w - (4 if pad else 0)}[align]
        top = y + (h - lh * len(lines)) / 2 if valign == "middle" else y + (4 if pad else 0)
        for i, ln in enumerate(lines):
            o.append(f'<text x="{tx:.1f}" y="{top + lh * i + size:.1f}" font-size="{size}" fill="{color}" text-anchor="{anchor}"{" font-weight=\"bold\"" if bold else ""}>{html.escape(ln)}</text>')

    for it in p.items:
        if it["t"] == "line":
            o.append(f'<line x1="{it["x1"]:.1f}" y1="{it["y1"]:.1f}" x2="{it["x2"]:.1f}" y2="{it["y2"]:.1f}" stroke="{it["color"]}" stroke-width="{it["width"]}"/>')
        elif it["t"] == "num":
            o.append(f'<circle cx="{it["x"] + 11}" cy="{it["y"] + 11}" r="11" fill="#222222" stroke="#FFFFFF" stroke-width="1.5"/>')
            o.append(f'<text x="{it["x"] + 11}" y="{it["y"] + 15}" font-size="11" font-weight="bold" fill="#FFFFFF" text-anchor="middle">{it["n"]}</text>')
        elif it["t"] == "text":
            txt(it["x"], it["y"], it["w"], it["h"], it["label"], it["size"], it["bold"], it["align"], "top", it["color"])
        else:
            stroke, sw, dash = LINE[it["kind"]]
            rx = 3 if it["rounded"] else 0
            o.append(f'<rect x="{it["x"]:.1f}" y="{it["y"]:.1f}" width="{it["w"]:.1f}" height="{it["h"]:.1f}" rx="{rx}" fill="none" stroke="{stroke}" stroke-width="{sw}"{" stroke-dasharray=\"4 3\"" if dash else ""}/>')
            if it["label"]:
                txt(it["x"], it["y"], it["w"], it["h"], it["label"], it["size"], it["bold"], it["align"], it["valign"], it["color"], pad=6 if it["align"] != "center" or it["valign"] == "top" else 0)
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
        png = img / f"{p.slug}.png"
        png.unlink(missing_ok=True)
        f = img / f"{p.slug}.svg"
        f.write_text(svg(p), encoding="utf-8")
        if browser:
            with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as prof:
                subprocess.run([browser, "--headless=new", "--disable-gpu", f"--user-data-dir={prof}", "--hide-scrollbars",
                                f"--window-size={W},{H}", f"--screenshot={png}", f.as_uri()],
                               check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60)
                for _ in range(40):  # Edge は、書き出しを待たずに戻ることがある
                    if png.exists():
                        break
                    time.sleep(0.5)
    print("ok:", ", ".join(p.name for p in pages))


if __name__ == "__main__":
    main()
