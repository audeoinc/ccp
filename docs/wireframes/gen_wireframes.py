# ワイヤーフレームの生成(draw.io の図と、確認用の PNG)。英語版・US 向け
#   python docs/wireframes/gen_wireframes.py
# 出力:
#   docs/wireframes/drawio/NN-*.drawio     … draw.io(Confluence の draw.io マクロで取り込む)。1 画面 = 1 ファイル
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

NS, IR, AP, CF = "Not started", "In review", "Approved", "Confirmed"


class Page:
    def __init__(self, name, slug):
        self.name, self.slug, self.items = name, slug, []

    def rect(self, x, y, w, h, label="", kind="box", align="center", size=12, bold=False, rounded=True, valign="middle", color=INK):
        self.items.append(dict(t="rect", x=x, y=y, w=w, h=h, label=label, kind=kind, align=align, size=size, bold=bold, rounded=rounded, valign=valign, color=color))

    def text(self, x, y, w, label, size=12, bold=False, align="left", h=None, color=INK, rot=False):
        self.items.append(dict(t="text", x=x, y=y, w=w, h=h or round(size * 1.5 * (label.count("\n") + 1)), label=label, size=size, bold=bold, align=align, color=color, rot=rot))

    def line(self, x1, y1, x2, y2, color="#888888", width=1):
        self.items.append(dict(t="line", x1=x1, y1=y1, x2=x2, y2=y2, color=color, width=width))

    def hline(self, x1, x2, y, color="#888888"):
        self.line(x1, y, x2, y, color)

    def vline(self, x, y1, y2, color="#888888"):
        self.line(x, y1, x, y2, color)

    def image(self, x, y, w, h, label="Image", kind="input", size=11):
        self.rect(x, y, w, h, "", kind=kind, rounded=False)
        self.line(x, y, x + w, y + h, "#BBBBBB")
        self.line(x + w, y, x, y + h, "#BBBBBB")
        if label:
            self.text(x, y + h / 2 - size * 0.75, w, label, size=size, align="center", color=MUTED)

    def select(self, x, y, w, label, h=24, size=12):
        self.rect(x, y, w, h, label, kind="input", align="left", size=size)
        self.text(x + w - 18, y + (h - 18) / 2, 14, "▾", size=11, color=MUTED)

    def toggle(self, x, y, label, on=True):
        self.rect(x, y, 34, 18, "●" if on else "○", kind="box", size=10, align="right" if on else "left")
        self.text(x + 40, y, 260, label, size=11)

    def num(self, n, x, y):
        self.items.append(dict(t="num", n=n, x=x, y=y))

    def nums(self, pts):
        for i, (x, y) in enumerate(pts, 1):
            self.num(i, x, y)


# ---------------------------------------------------------------- shared parts
def app_header(p, title, back=False):
    """全画面の上部(画面名・各画面への入口・言語・自動下書き・新規作成)"""
    p.rect(0, 0, W, H, kind="faint", rounded=False)
    p.hline(0, W, 44)
    x = 14
    if back:
        p.rect(14, 10, 84, 24, "‹ Calendar", size=11)
        x = 110
    p.rect(x, 12, 20, 20, "▦", kind="input", size=11, rounded=False)
    p.text(x + 28, 11, 300, title, size=16, bold=True)
    p.rect(636, 10, 90, 24, "Alerts  2", size=11)
    p.rect(736, 10, 90, 24, "Results", size=11)
    p.rect(841, 10, 114, 24, "Templates", size=11)
    p.rect(970, 10, 56, 24, "日本語", kind="input", size=11)
    p.rect(1026, 10, 60, 24, "English", kind="sel", size=11, bold=True)
    p.toggle(1096, 13, "Auto-draft on open: On")
    p.rect(1330, 10, 90, 24, "+ New", kind="sel", bold=True)


def mini_email(p, x, y, w, h, products=("", "", "", ""), hero="", sel=()):
    """配信の縮小プレビュー(メール)。products は商品の略称、sel は太枠にする商品"""
    p.rect(x, y, w, h, "", kind="input", rounded=False)
    hh = round(h * 0.3)
    p.image(x + 4, y + 4, w - 8, hh, hero, size=9)
    pw, ph = (w - 12) / 2, (h - hh - 16) / 2
    for i, nm in enumerate(products[:4]):
        r, c = divmod(i, 2)
        bx, by = x + 4 + c * (pw + 4), y + hh + 8 + r * (ph + 4)
        p.rect(bx, by, pw, ph, nm, kind="sel" if nm in sel else "input", size=9, rounded=False, bold=nm in sel)


def mini_push(p, x, y, w, title):
    p.rect(x, y, w, 40, "", kind="input")
    p.text(x + 6, y + 4, w - 12, "APP · now", size=8, color=MUTED)
    p.text(x + 6, y + 18, w - 12, title, size=10, bold=True)


def card_frame(p, title, tabs, sel_tab, done=5):
    """配信カードの枠(上部・左右の区切り・工程のタブ・下部)"""
    p.rect(0, 0, W, H, kind="faint", rounded=False)
    p.rect(14, 36, 1411, 828, kind="frame")
    p.text(32, 52, 600, title, size=18, bold=True)
    p.rect(1256, 58, 78, 24, f"Step {done} / {len(tabs)}", size=11)
    p.rect(1344, 58, 28, 24, "…")
    p.rect(1384, 56, 28, 28, "×")
    p.hline(14, 1425, 104)
    p.vline(326, 104, 804)
    p.vline(749, 104, 804)
    p.text(342, 116, 300, "Content", size=14, bold=True)
    tw = 391 / len(tabs)
    for i, lab in enumerate(tabs):
        p.text(342 + i * tw, 150, tw - 2, lab, size=10, bold=(i == sel_tab), align="center")
    p.hline(342, 733, 172)
    p.line(342 + sel_tab * tw, 172, 342 + (sel_tab + 1) * tw - 2, 172, INK, 2)
    p.hline(14, 1425, 804)
    p.rect(1213, 818, 90, 30, "Cancel")
    p.rect(1313, 818, 96, 30, "Save", kind="sel", bold=True)


def left_email(p):
    """配信カードの左(メールの配信情報と、工程の要約)"""
    p.rect(31, 116, 268, 32, "✦ Draft all with AI", kind="sel", bold=True)
    p.text(31, 152, 268, "AI drafts every step, from theme to production notes", size=10, color=MUTED)
    p.text(31, 178, 200, "Delivery info", size=14, bold=True)
    p.text(31, 202, 200, "Name *", size=11)
    p.rect(31, 218, 268, 24, "Fall Knits", kind="input", align="left")
    p.text(31, 248, 200, "Date & time *", size=11)
    p.rect(31, 264, 268, 24, "10/02/2026 10:00 AM", kind="input", align="left")
    p.rect(277, 270, 14, 12, "", kind="input", rounded=False)
    for row, pair in enumerate([(("Channel", "Email"), ("Type", "Promotion")), (("Status", AP), ("Owner", "(select)")),
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


def chat_collapsed(p, step):
    p.hline(326, 749, 770)
    p.text(342, 779, 360, f"✦ AI chat — {step}", size=12, bold=True)
    p.text(726, 779, 14, "▸", size=11, color=MUTED)



def email_preview(p, x0, x1, badges=None, sel=None, top=116):
    """右のプレビュー(メール)。badges: {(行, 列): 文字}、sel: 太枠にする商品 (行, 列)"""
    p.text(x0 + 17, top + 2, 56, "Email", bold=True, align="center")
    p.text(x0 + 77, top + 2, 56, "Push", align="center")
    p.line(x0 + 17, top + 24, x0 + 73, top + 24, INK, 2)
    p.rect(x1 - 170, top, 74, 24, "Desktop", kind="sel", size=11)
    p.rect(x1 - 96, top, 74, 24, "Mobile", kind="input", size=11)
    p.rect(x0 + 17, top + 36, 22, 22, "−", size=11)
    p.line(x0 + 45, top + 47, x0 + 115, top + 47, "#444444")
    p.rect(x0 + 73, top + 41, 10, 12, "", kind="box", rounded=False)
    p.rect(x0 + 121, top + 36, 22, 22, "+", size=11)
    p.text(x0 + 149, top + 39, 40, "70%", size=11)
    p.rect(x0 + 191, top + 36, 48, 22, "Fit", size=11)
    ew = 277
    ex = round((x0 + x1) / 2 - ew / 2) if x1 - x0 > 400 else x0 + 41
    p.text(ex, top + 68, 300, "Subject: Fall Knits", size=10)
    p.text(ex, top + 83, 320, "Preheader: New knits that change with every layer…", size=10, color=MUTED)
    p.rect(ex, 218, ew, 582, kind="box", rounded=False)
    p.rect(ex, 218, ew, 22, "SHOP", kind="box", size=10, bold=True, rounded=False)
    p.image(ex, 240, ew, 110, "Main image")
    p.rect(ex, 350, ew, 40, "Headline\nCopy", kind="box", size=11, rounded=False)
    p.text(ex, 396, ew, "Section heading · copy", size=10, align="center", color=MUTED)
    names = [["Crewneck Knit", "Cable Knit"], ["Cardigan", "Turtleneck"]]
    for r in range(2):
        for c in range(2):
            x, y = ex + 10 + c * 133, 416 + r * 172
            p.image(x, y, 125, 108, "Product image", kind="sel" if sel == (r, c) else "input")
            p.text(x, y + 112, 125, f"{names[r][c]}\n$00.00", size=10)
            p.rect(x, y + 144, 125, 18, "Shop now", size=9, rounded=False)
            if badges and (r, c) in badges:
                p.rect(x + 4, y + 4, 117, 18, badges[(r, c)], kind="box", size=9, rounded=False)
    return ex


def product_panel(p, px1=1110):
    """右端の商品情報(開いた状態)。どの配信カードでも開いたまま表示する"""
    p.vline(px1, 104, 804)
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
    for i, hgt in enumerate([30, 36, 34, 42, 48, 46, 55, 60, 58, 66, 72, 78]):
        p.rect(qx + 12 + i * 23, base - hgt, 12, hgt, "", kind="box", rounded=False)
    stock = [96, 92, 90, 84, 80, 77, 70, 66, 62, 56, 50, 46]
    for i in range(len(stock) - 1):
        p.line(qx + 18 + i * 23, base - stock[i], qx + 18 + (i + 1) * 23, base - stock[i + 1], INK, 1.5)
    ty = cy0 + 150
    p.text(qx, ty, 292, "MD plan", size=11, bold=True)
    p.text(qx, ty + 18, 292, "Policy: lead item for fall\nPromotion: 10/01 – 10/31\nThis week: feature in email + push", size=10, h=48)
    p.text(qx, ty + 74, 292, "Attributes", size=11, bold=True)
    p.text(qx, ty + 92, 292, "Rating 4.6 (212) · Season: fall–winter\nWeather: cold days · New arrival", size=10, h=32)


def phone(p, x, y, w=170, h=330, caption=""):
    p.rect(x, y, w, h, "", kind="box")
    p.hline(x + w / 2 - 20, x + w / 2 + 20, y + 10, "#444444")
    if caption:
        p.text(x, y + h + 6, w, caption, size=10, align="center", color=MUTED)


# ---------------------------------------------------------------- 01 Delivery calendar
def calendar():
    p = Page("01 Delivery calendar", "01-calendar")
    app_header(p, "Delivery Calendar")

    for i, lab in enumerate(["Channel", "Type", "Status"]):
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
    x21, y21 = gx + 3 * cw, gy + 32 + 3 * rh
    p.rect(x21 + cw - 28, y21 + 5, 22, 22, "+")

    p.nums([(200, 11), (830, 0), (958, 0), (1084, 0), (1318, 0), (194, 64), (1206, 90), (108, 131), (328, 122), (510, 122),
            (1018, 131), (x21 + cw - 40, y21 - 4), (gx + 2 * cw - 22, gy + 32 + rh + 20), (gx + cw + 30, gy + 32 + rh + 5),
            (624, 0), (724, 0)])
    return p


# ---------------------------------------------------------------- 02 Delivery card — Theme (product info open)
def card_theme():
    p = Page("02 Delivery card — Theme", "02-card-theme")
    card_frame(p, "Fall Knits", ["✓ 1 Theme", "✓ 2 Template", "✓ 3 Hero", "✓ 4 Sections", "✓ 5 Production"], 0)
    left_email(p)
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

    px1 = 1110
    email_preview(p, 749, px1, sel=(0, 0))

    product_panel(p, px1)

    p.nums([(120, 52), (1284, 84), (1347, 84), (1387, 86), (288, 106), (128, 176), (80, 446), (412, 114), (478, 186), (650, 219),
            (330, 320), (470, 565), (888, 116), (1092, 116), (990, 152), (766, 184), (766, 220), (1236, 112), (1396, 140),
            (1396, 358), (1396, 442), (1396, 572), (1188, 822)])
    return p


TABS = ["✓ 1 Theme", "✓ 2 Template", "✓ 3 Hero", "✓ 4 Sections", "✓ 5 Production"]


def card_step(name, slug, tab):
    p = Page(name, slug)
    card_frame(p, "Fall Knits", TABS, tab)
    left_email(p)
    product_panel(p)
    return p


# ---------------------------------------------------------------- 03 Template step
def card_template():
    p = card_step("03 Delivery card — Template", "03-card-template", 1)
    p.rect(342, 186, 130, 24, "✦ Suggest with AI", size=11)
    p.text(342, 220, 391, "AI pick: Grid 2×2 — reason: four new knits side by side;\nsuits a new-arrival theme.", size=10, h=30, color=MUTED)
    tpls = [("Grid 2×2", "Main image + 4\nproducts in a grid", "4 products · used 3× in last 4 wks", [2, 2]),
            ("Feature + list", "One lead product,\nthen a short list", "5 products · used 1×", [1, 4]),
            ("Two sections", "Two themes, two\nproducts each", "4 products · used 0×", [2, 2]),
            ("Story", "Large images with\ntext, top to bottom", "3 products · used 2×", [1, 1, 1]),
            ("Sale grid 3×2", "Prices first;\nfor sales", "6 products · used 4×", [3, 3]),
            ("Lookbook", "Styled photos with\nlinked products", "4 products · used 0×", [2, 2])]
    for i, (nm, desc, use, rows) in enumerate(tpls):
        r, c = divmod(i, 2)
        x, y = 342 + c * 199, 258 + r * 166
        p.rect(x, y, 192, 158, "", kind="sel" if i == 0 else "input", rounded=False)
        ox, oy, ow = x + 8, y + 8, 64
        p.rect(ox, oy, ow, 92, "", kind="faint", rounded=False)
        p.rect(ox + 4, oy + 4, ow - 8, 22, "", kind="input", rounded=False)
        ry = oy + 30
        for n in rows:
            bw = (ow - 8 - (n - 1) * 3) / n
            for k in range(n):
                p.rect(ox + 4 + k * (bw + 3), ry, bw, 16, "", kind="input", rounded=False)
            ry += 20
        p.text(x + 80, y + 8, 106, nm, size=12, bold=True)
        p.text(x + 80, y + 28, 106, desc, size=10, h=46, color=MUTED)
        p.text(x + 8, y + 108, 176, use, size=10)
        p.rect(x + 8, y + 128, 80, 22, "Selected" if i == 0 else "Select", kind="sel" if i == 0 else "box", size=10)
    chat_collapsed(p, "Template")
    email_preview(p, 749, 1110)
    p.nums([(478, 186), (318, 220), (318, 258), (512, 262), (318, 362), (430, 386), (766, 228)])
    return p


# ---------------------------------------------------------------- 04 Hero step
def card_hero():
    p = card_step("04 Delivery card — Hero", "04-card-hero", 2)
    p.rect(342, 186, 130, 24, "✦ Suggest with AI", size=11)
    p.text(342, 220, 200, "Main image (AI pick)", size=11, bold=True)
    p.image(342, 238, 391, 140, "Main image — knit layers, warm tone")
    p.text(342, 384, 391, "Reason: warm, layered styling matches the theme; knits are front and center.", size=10, h=30, color=MUTED)
    p.text(342, 414, 391, "Not used this week or last week.", size=10)
    p.rect(342, 434, 70, 22, "Remove", size=10)
    p.rect(418, 434, 110, 22, "Reset to AI pick", size=10)
    p.text(342, 470, 300, "Other candidates", size=11, bold=True)
    for i in range(3):
        x = 342 + i * 132
        p.image(x, 490, 125, 76, f"Candidate {i + 1}", size=10)
        p.text(x, 568, 125, "Brighter; outdoor" if i == 0 else ("Close-up texture" if i == 1 else "Used last week"), size=9, color=MUTED)
        p.rect(x, 584, 125, 20, "Use this", size=10)
    p.text(342, 618, 200, "Library", size=11, bold=True)
    p.rect(342, 636, 240, 24, "Search images (e.g. knit, coat)", kind="input", align="left", size=10, color=MUTED)
    p.select(588, 636, 70, "All", size=10)
    p.rect(664, 636, 69, 24, "+ Upload", size=10)
    for i in range(5):
        p.image(342 + i * 79, 668, 74, 54, "", size=9)
    p.text(342, 728, 391, "Drag an image onto the preview to place it.", size=10, color=MUTED)
    chat_collapsed(p, "Hero")
    email_preview(p, 749, 1110)
    p.nums([(478, 186), (318, 238), (318, 384), (318, 410), (532, 434), (318, 490), (318, 636), (722, 626), (766, 252)])
    return p


# ---------------------------------------------------------------- 05 Sections step
def card_sections():
    p = card_step("05 Delivery card — Sections", "05-card-sections", 3)
    p.rect(342, 184, 80, 24, "Section 1", kind="sel", size=11, bold=True)
    p.rect(426, 184, 80, 24, "Section 2", kind="input", size=11)
    p.text(514, 188, 220, "2 sections in this template", size=10, color=MUTED)
    p.text(342, 218, 200, "Heading & copy", size=11, bold=True)
    p.rect(613, 214, 120, 22, "✦ Suggest", size=10)
    p.rect(342, 240, 391, 24, "Soft knits for cool mornings", kind="input", align="left", size=11)
    p.text(342, 268, 391, "Option 2: Layers that work all day   ·   Option 3: Your new fall staples", size=10, color=MUTED)
    p.text(342, 296, 200, "Products (2)", size=11, bold=True)
    p.rect(573, 292, 160, 22, "✦ Choose with AI", size=10)
    rows = [("Crewneck Knit", "$98.00", "Reason: sales ▲12%, 6.5 wks of stock", "This week: 3rd (Mon, Tue) · Last week: 1"),
            ("Cable Knit", "$118.00", "Reason: lead item in the MD plan", "This week: 1st · Last week: 1")]
    for i, (nm, pr, why, exp) in enumerate(rows):
        y = 320 + i * 82
        p.rect(342, y, 391, 76, "", kind="input", rounded=False)
        p.text(348, y + 26, 12, "≡", size=12, color=MUTED)
        p.image(364, y + 6, 54, 54, "")
        p.text(426, y + 6, 240, f"{nm}   {pr}", size=11, bold=True)
        p.text(426, y + 22, 280, why, size=10, color=MUTED)
        p.rect(426, y + 40, 300, 30, exp, kind="dash", align="left", size=9, rounded=False)
        p.text(706, y + 4, 22, "⋯", size=12, align="center")
    p.text(342, 490, 300, "Other candidates", size=11, bold=True)
    for i, nm in enumerate(["Turtleneck", "Mock-neck Knit", "Knit Vest"]):
        x = 342 + i * 132
        p.rect(x, 508, 125, 60, "", kind="input", rounded=False)
        p.image(x + 4, 512, 40, 40, "")
        p.text(x + 48, 512, 76, f"{nm}\n$00.00", size=9)
        p.rect(x + 48, 544, 72, 18, "Swap in", size=9)
    p.text(342, 580, 300, "Add a product", size=11, bold=True)
    p.rect(342, 598, 300, 24, "Search by name or category", kind="input", align="left", size=10, color=MUTED)
    p.select(648, 598, 85, "Category", size=10)
    p.text(342, 630, 391, "AI keeps a product in one section only within a delivery.", size=10, color=MUTED)
    chat_collapsed(p, "Sections")
    email_preview(p, 749, 1110, badges={(0, 0): "3rd this week", (0, 1): "1st this week"}, sel=(0, 0))
    p.nums([(318, 184), (318, 240), (318, 294), (548, 292), (318, 334), (634, 364), (722, 312), (318, 508), (318, 598), (766, 416)])
    return p


# ---------------------------------------------------------------- 06 Production step
def card_production():
    p = card_step("06 Delivery card — Production notes", "06-card-production", 4)
    p.rect(342, 186, 130, 24, "✦ Suggest with AI", size=11)
    p.text(342, 220, 300, "Production notes (adopted)", size=11)
    p.rect(342, 238, 391, 64, "Keep the main image warm and soft. Show knit texture up close.\nUse calm neutral colors; avoid sale-style red.", kind="input", align="left", valign="top", size=10, rounded=False)
    p.text(342, 306, 391, "Angle: tone and texture", size=10, color=MUTED)
    for i, ang in enumerate(["Angle: product details first", "Angle: styling and layering", "Angle: tone and texture"]):
        y = 328 + i * 40
        p.rect(342, y, 391, 34, "", kind="input", rounded=False)
        p.text(352, y + 9, 300, f"Option {i + 1} — {ang}", size=11)
        p.rect(673, y + 6, 50, 22, "Adopt", size=10)
    p.hline(342, 733, 456, "#BBBBBB")
    p.text(342, 466, 300, "Handoff to production", size=12, bold=True)
    p.text(342, 488, 120, "Assignee", size=10)
    p.select(342, 504, 150, "(select)", size=11)
    p.text(500, 488, 120, "Due", size=10)
    p.rect(500, 504, 110, 24, "09/28/2026", kind="input", align="left", size=11)
    p.rect(618, 504, 115, 24, "Notify production", kind="sel", size=10, bold=True)
    p.text(342, 540, 300, "Link URLs", size=11, bold=True)
    for i, (k, v) in enumerate([("Main image", "https://…/fall-knits"), ("Shop now · Crewneck Knit", "https://…/p/410233"),
                                ("Shop now · Cable Knit", "https://…/p/418870")]):
        y = 558 + i * 28
        p.text(342, y + 4, 150, k, size=10)
        p.rect(500, y, 233, 24, v, kind="input", align="left", size=10)
    p.text(342, 650, 300, "Questions from production (1 open)", size=11, bold=True)
    p.rect(342, 668, 391, 44, "Q: Use the cable knit close-up for the hero?\nA: (reply)", kind="input", align="left", valign="top", size=10, rounded=False)
    p.rect(663, 716, 70, 22, "Reply", size=10)
    chat_collapsed(p, "Production notes")
    email_preview(p, 749, 1110)
    p.nums([(478, 186), (318, 238), (318, 328), (318, 466), (722, 494), (318, 556), (318, 668)])
    return p


# ---------------------------------------------------------------- 07 Push delivery card
def card_push():
    p = Page("07 Delivery card — Push", "07-card-push")
    card_frame(p, "Fall Knits — Push", ["✓ 1 Theme", "2 Message", "3 Timing & audience"], 1, done=1)
    p.rect(31, 116, 268, 32, "✦ Draft all with AI", kind="sel", bold=True)
    p.text(31, 178, 200, "Delivery info", size=14, bold=True)
    p.text(31, 202, 200, "Name *", size=11)
    p.rect(31, 218, 268, 24, "Fall Knits — Push", kind="input", align="left")
    p.text(31, 248, 200, "Date & time *", size=11)
    p.rect(31, 264, 268, 24, "10/02/2026 11:00 AM", kind="input", align="left")
    for row, pair in enumerate([(("Channel", "Push"), ("Type", "Promotion")), (("Status", IR), ("Owner", "(select)"))]):
        y = 294 + row * 50
        for col, (lab, val) in enumerate(pair):
            x = 31 + col * 140
            p.text(x, y, 128, lab, size=11)
            p.select(x, y + 16, 128, val)
    p.text(31, 404, 200, "Linked email", size=14, bold=True)
    p.rect(31, 428, 268, 150, "", kind="box", rounded=False)
    p.text(41, 436, 250, "Fall Knits · Email · 10/02 10:00 AM", size=11, bold=True)
    p.text(41, 454, 250, AP, size=10, color=MUTED)
    p.text(41, 476, 250, "Theme:  same ✓\nProducts:  3 of 4 shared\nSend order:  Email 10:00 → Push 11:00 ✓\nThis week:  2nd push to this audience", size=10, h=64)
    p.rect(41, 546, 90, 22, "Open email", size=10)
    p.rect(137, 546, 60, 22, "Unlink", size=10)
    p.rect(31, 590, 268, 24, "+ Link another delivery", size=10)

    p.rect(342, 186, 130, 24, "✦ Suggest with AI", size=11)
    p.text(342, 222, 120, "Title", size=11)
    p.text(613, 222, 120, "28 / 40", size=10, align="right", color=MUTED)
    p.rect(342, 238, 391, 24, "New fall knits just landed", kind="input", align="left", size=11)
    p.text(342, 270, 120, "Body", size=11)
    p.text(613, 270, 120, "62 / 120", size=10, align="right", color=MUTED)
    p.rect(342, 286, 391, 44, "Soft layers for cool mornings. Tap to see the crewneck and cable knits.", kind="input", align="left", valign="top", size=10, rounded=False)
    for i in range(3):
        y = 344 + i * 52
        p.rect(342, y, 391, 46, "", kind="input", rounded=False)
        p.text(352, y + 5, 300, f"Option {i + 1}: (title) / (body)", size=11, bold=True)
        p.text(352, y + 24, 300, "Angle: (urgency / product / season)", size=10, color=MUTED)
        p.rect(673, y + 11, 50, 24, "Adopt", size=11)
    p.text(342, 510, 200, "Timing & audience", size=11, bold=True)
    for i, (lab, val) in enumerate([("Send time", "10/02 11:00 AM"), ("Tap opens", "Product list: Fall Knits"), ("Audience", "All app users")]):
        y = 532 + i * 30
        p.text(342, y + 4, 120, lab, size=10)
        p.select(470, y, 263, val, size=10)
    chat_collapsed(p, "Message")

    p.text(766, 118, 56, "Email", align="center")
    p.text(826, 118, 56, "Push", bold=True, align="center")
    p.line(826, 140, 882, 140, INK, 2)
    p.rect(950, 116, 74, 24, "iOS", kind="sel", size=11)
    p.rect(1024, 116, 74, 24, "Android", kind="input", size=11)
    phone(p, 766, 170, w=156, caption="Lock screen")
    p.text(766, 200, 156, "9:41", size=20, bold=True, align="center")
    p.rect(772, 250, 144, 64, "", kind="box")
    p.text(778, 256, 132, "SHOP · now", size=8, color=MUTED)
    p.text(778, 270, 132, "New fall knits just landed", size=10, bold=True)
    p.text(778, 285, 132, "Soft layers for cool morn… Tap", size=9)
    p.text(772, 318, 144, "Cut off after 2 lines on this device", size=8, color=MUTED)
    phone(p, 938, 170, w=156, caption="After tap")
    p.rect(944, 190, 144, 22, "Fall Knits", kind="box", size=10, rounded=False)
    for r in range(2):
        for c in range(2):
            p.image(948 + c * 70, 220 + r * 92, 64, 66, "", size=8)
            p.text(948 + c * 70, 288 + r * 92, 64, "Name  $00", size=8)
    product_panel(p)
    p.nums([(240, 400), (300, 470), (300, 512), (478, 186), (318, 238), (318, 344), (318, 532), (886, 110), (926, 106), (752, 250), (924, 190)])
    return p


# ---------------------------------------------------------------- 08 Week view & review
WEEK = [  # (day, [(time, channel, name, status, products, comments)])
    ("Sun 4", [("09:00", "Email", "Sunday Picks", CF, ("Parka", "Boots", "Scarf", "Beanie"), 0), ("18:00", "Push", "Time Sale", CF, (), 0)]),
    ("Mon 5", [("10:00", "Email", "Fall Preview", IR, ("Crew", "Cable", "Coat", "Boots"), 1)]),
    ("Tue 6", [("10:00", "Email", "Outerwear Edit", IR, ("Parka", "Crew", "Coat", "Vest"), 1)]),
    ("Wed 7", [("12:00", "Email", "Rainy Day Picks", AP, ("Boots", "Rain Jkt", "Umbr.", "Crew"), 0)]),
    ("Thu 8", [("10:00", "Email", "Outerwear Guide", IR, ("Parka", "Coat", "Vest", "Scarf"), 0)]),
    ("Fri 9", [("12:00", "Email", "Cozy Layers", AP, ("Cardi", "Turtle", "Cable", "Socks"), 0)]),
    ("Sat 10", [("10:00", "Email", "Member Week", CF, ("Coat", "Boots", "Cardi", "Beanie"), 0), ("18:00", "Push", "Reminder", CF, (), 0)]),
]


def week_review():
    p = Page("08 Week view & review", "08-week-review")
    app_header(p, "Delivery Calendar")
    p.rect(16, 60, 24, 24, "‹")
    p.text(46, 60, 200, "Oct 4 – Oct 10, 2026", size=16, bold=True)
    p.rect(232, 60, 24, 24, "›")
    p.rect(272, 60, 56, 24, "Month", kind="input", size=11)
    p.rect(328, 60, 56, 24, "Week", kind="sel", size=11, bold=True)
    p.rect(384, 60, 56, 24, "List", kind="input", size=11)
    p.rect(456, 60, 190, 24, "Compare with previous week", size=11)
    p.select(662, 60, 130, "Channel: All", size=11)
    cw = 154
    for i, (day, items) in enumerate(WEEK):
        x = 16 + i * cw
        p.text(x, 100, cw, day, bold=True, align="center")
        p.vline(x, 96, 790, "#BBBBBB")
        y = 126
        for tm, ch, nm, st, prods, com in items:
            p.rect(x + 6, y, cw - 12, 72 if ch == "Push" else 214, "", kind="box", rounded=False)
            p.text(x + 12, y + 4, cw - 24, f"{tm} · {ch} · {st}", size=9, color=MUTED)
            if ch == "Push":
                mini_push(p, x + 12, y + 22, cw - 24, nm)
                y += 80
                continue
            p.text(x + 12, y + 18, cw - 24, nm, size=11, bold=True)
            mini_email(p, x + 12, y + 38, cw - 24, 150, prods)
            if com:
                p.text(x + 12, y + 194, cw - 24, f"Comments {com}", size=9)
            y += 222
    p.vline(16 + 7 * cw, 96, 790, "#BBBBBB")
    rx = 1110
    p.vline(rx, 44, H)
    p.text(rx + 14, 58, 300, "Week of Oct 4", size=14, bold=True)
    p.text(rx + 14, 80, 300, "Week status: In review · submitted 10/01", size=10, color=MUTED)
    p.rect(rx + 14, 102, 128, 26, "Submit for review", size=10)
    p.rect(rx + 148, 102, 96, 26, "Confirm week", kind="sel", size=10, bold=True)
    p.rect(rx + 250, 102, 50, 26, "PDF", size=10)
    p.text(rx + 14, 146, 300, "Review checklist", size=12, bold=True)
    checks = [("Products over the weekly limit", "1"), ("Email / push to align", "1"), ("Lead items not featured", "2"),
              ("Same main image or theme in a row", "0"), ("Open comments", "2"), ("Approved deliveries", "6 / 9")]
    for i, (k, v) in enumerate(checks):
        y = 168 + i * 32
        p.rect(rx + 14, y, 290, 28, k, kind="input", align="left", size=10, rounded=False)
        p.text(rx + 250, y + 6, 30, v, size=11, bold=True, align="right")
        p.text(rx + 286, y + 6, 12, "›", size=11)
    p.text(rx + 14, 372, 300, "Comments", size=12, bold=True)
    for i, (who, txt) in enumerate([("Tue · Outerwear Edit — MD", "Parka stock is low; swap for the wool coat?"),
                                    ("Mon · Fall Preview — CRM", "Same crewneck as Tue and Wed. Change one?")]):
        y = 394 + i * 76
        p.rect(rx + 14, y, 290, 70, "", kind="input", rounded=False)
        p.text(rx + 22, y + 6, 270, who, size=10, bold=True)
        p.text(rx + 22, y + 22, 270, txt, size=10, h=30)
        p.rect(rx + 240, y + 44, 58, 20, "Resolve", size=9)
    p.rect(rx + 14, 548, 290, 24, "Add a comment…", kind="input", align="left", size=10, color=MUTED)
    p.text(rx + 14, 590, 300, "Approval history", size=12, bold=True)
    p.text(rx + 14, 612, 290, "10/01  Submitted for review — Marketing\n09/30  Sunday Picks approved — Manager\n09/30  Member Week approved — Manager", size=10, h=48)
    p.nums([(4, 86), (444, 50), (796, 50), (300, 128), (300, 200), (152, 368), (250, 318), (rx - 11, 96), (rx - 11, 160), (rx - 11, 384), (rx - 11, 590)])
    return p


# ---------------------------------------------------------------- 09 Compare weeks (product exposure)
PREV = [("Sep 27", "Fall Arrivals", ("Crew", "Cardi", "Coat", "Scarf")), ("Sep 28", "", ()), ("Sep 29", "", ()), ("Sep 30", "", ()),
        ("Oct 1", "Fall Arrivals", ("Crew", "Cable", "Parka", "Boots")), ("Oct 2", "Fall Knits", ("Crew", "Cable", "Cardi", "Turtle")),
        ("Oct 3", "Weekend Sale", ("Parka", "Boots", "Vest", "Socks"))]


def compare_weeks():
    p = Page("09 Compare weeks", "09-compare-weeks")
    app_header(p, "Compare Weeks", back=True)
    p.text(16, 60, 600, "This week vs previous week · Email", size=16, bold=True)
    p.rect(380, 60, 24, 24, "‹")
    p.rect(408, 60, 24, 24, "›")
    p.select(450, 60, 150, "Channel: Email", size=11)
    p.rect(616, 60, 260, 24, "Limit: same product max 2 per week   Edit", size=10)
    lx, cw = 110, 140
    for c in range(7):
        p.text(lx + c * cw, 100, cw, ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][c], bold=True, align="center")
    rows = [("Previous week\nSep 27 – Oct 3", [(d, n, pr) for d, n, pr in PREV]),
            ("This week\nOct 4 – Oct 10", [(d.split()[1], it[0][2], it[0][4]) for d, it in WEEK])]
    for r, (lab, cells) in enumerate(rows):
        y = 126 + r * 330
        p.rect(16, y, 1080, 320, "", kind="frame", rounded=False)
        p.text(22, y + 10, 84, lab, size=11, bold=True, h=40)
        for c, (d, nm, prods) in enumerate(cells):
            x = lx + c * cw
            p.vline(x, y, y + 320, "#BBBBBB")
            p.text(x + 6, y + 6, cw - 12, d, size=10, color=MUTED)
            if nm:
                p.text(x + 6, y + 22, cw - 12, nm, size=11, bold=True)
                mini_email(p, x + 6, y + 44, cw - 12, 200, prods, sel=("Crew",))
                p.text(x + 6, y + 252, cw - 12, "Theme: " + ("Layer up" if "Crew" in prods else "Outerwear"), size=9, color=MUTED)
    rx = 1110
    p.vline(rx, 44, H)
    p.text(rx + 14, 58, 300, "Product exposure", size=14, bold=True)
    p.text(rx + 14, 80, 300, "Times featured · select a row to outline it", size=10, color=MUTED)
    p.text(rx + 14, 104, 150, "Product", size=10, bold=True)
    p.text(rx + 180, 104, 50, "This wk", size=10, bold=True, align="right")
    p.text(rx + 240, 104, 60, "Prev wk", size=10, bold=True, align="right")
    data = [("Crewneck Knit", "3  over", "3", True), ("Parka", "3  over", "2", False), ("Boots", "3  over", "2", False),
            ("Wool Coat", "4  over", "1", False), ("Cable Knit", "2", "2", False), ("Cardigan", "2", "2", False), ("Vest", "2", "1", False)]
    for i, (nm, a, b, s) in enumerate(data):
        y = 122 + i * 28
        p.rect(rx + 14, y, 290, 26, "", kind="sel" if s else "input", rounded=False)
        p.text(rx + 20, y + 5, 150, nm, size=10, bold=s)
        p.text(rx + 160, y + 5, 70, a, size=10, align="right")
        p.text(rx + 240, y + 5, 58, b, size=10, align="right")
    p.text(rx + 14, 334, 300, "Lead items not featured", size=12, bold=True)
    p.text(rx + 14, 354, 290, "Chelsea Boots (lead) · 0 this week\nCashmere Scarf (lead) · 0 this week", size=10, h=32)
    p.text(rx + 14, 400, 300, "Repeated in a row", size=12, bold=True)
    p.text(rx + 14, 420, 290, "Theme: Outerwear — Tue, Thu\nMain image: none", size=10, h=32)
    p.text(rx + 14, 466, 300, "Selected: Crewneck Knit", size=12, bold=True)
    p.text(rx + 14, 486, 290, "This week: Mon Fall Preview, Tue Outerwear Edit,\nWed Rainy Day Picks\nPrevious week: Sun, Thu, Fri", size=10, h=48)
    p.rect(rx + 14, 540, 140, 24, "Open Tue delivery", size=10)
    p.nums([(4, 84), (604, 50), (86, 130), (126, 490), (rx - 11, 52), (rx - 11, 116), (rx - 11, 328), (rx - 11, 394), (rx - 11, 460)])
    return p


# ---------------------------------------------------------------- 10 Templates
def templates():
    p = Page("10 Template management", "10-templates")
    app_header(p, "Templates", back=True)
    p.rect(16, 58, 70, 24, "Email", kind="sel", size=11, bold=True)
    p.rect(86, 58, 70, 24, "Push", kind="input", size=11)
    p.text(16, 96, 260, "Standard (read-only)", size=11, bold=True)
    for i, nm in enumerate(["Grid 2×2", "Feature + list", "Story", "Sale grid 3×2"]):
        p.rect(16, 116 + i * 30, 260, 26, f"{nm}   (locked)", kind="input", align="left", size=11, rounded=False)
    p.text(16, 246, 260, "Custom", size=11, bold=True)
    for i, nm in enumerate(["Two sections", "Lookbook", "Holiday gift grid"]):
        p.rect(16, 266 + i * 30, 260, 26, nm, kind="sel" if i == 0 else "input", align="left", size=11, rounded=False)
    p.rect(16, 366, 126, 26, "+ New template", size=11)
    p.rect(150, 366, 126, 26, "Duplicate", size=11)
    p.vline(292, 44, H)

    x0 = 322
    p.text(x0, 58, 300, "Two sections", size=16, bold=True)
    p.text(x0 + 380, 62, 280, "Used by 5 deliveries", size=11, align="right", color=MUTED)
    p.text(x0, 92, 200, "Name", size=11)
    p.rect(x0, 108, 660, 24, "Two sections", kind="input", align="left")
    p.text(x0, 140, 200, "Description", size=11)
    p.rect(x0, 156, 660, 40, "Two themes, two products each. For deliveries that pair two ideas.", kind="input", align="left", valign="top", size=11, rounded=False)
    p.text(x0, 210, 200, "Hero", size=12, bold=True)
    p.text(x0, 232, 200, "Image frame", size=10)
    p.select(x0, 248, 200, "Wide (3:1)", size=11)
    p.text(x0 + 220, 232, 200, "Headline style", size=10)
    p.select(x0 + 220, 248, 200, "Overlay, bottom", size=11)
    p.text(x0, 292, 200, "Sections", size=12, bold=True)
    secs = [("Section 1", "Grid 2 columns", "2 products", "Heading ✓  Copy ✓"), ("Section 2", "Grid 2 columns", "2 products", "Heading ✓  Copy —")]
    for i, (nm, lay, cnt, opt) in enumerate(secs):
        y = 314 + i * 70
        p.rect(x0, y, 660, 62, "", kind="input", rounded=False)
        p.text(x0 + 8, y + 22, 14, "≡", size=12, color=MUTED)
        p.text(x0 + 28, y + 8, 120, nm, size=12, bold=True)
        p.select(x0 + 28, y + 30, 160, lay, size=10)
        p.select(x0 + 196, y + 30, 110, cnt, size=10)
        p.text(x0 + 320, y + 34, 200, opt, size=10)
        p.text(x0 + 630, y + 8, 22, "⋯", size=12, align="center")
    p.rect(x0, 458, 140, 26, "+ Add section", size=11)
    p.text(x0, 500, 200, "Buttons", size=12, bold=True)
    for i, (k, pos, sty, link) in enumerate([("Shop now", "Below each product", "Outline", "Product page"),
                                             ("See all knits", "End of Section 2", "Filled", "Category page")]):
        y = 522 + i * 34
        p.rect(x0, y, 120, 28, k, kind="input", align="left", size=11, rounded=False)
        p.select(x0 + 128, y + 2, 170, pos, size=10)
        p.select(x0 + 306, y + 2, 110, sty, size=10)
        p.select(x0 + 424, y + 2, 160, link, size=10)
        p.text(x0 + 630, y + 6, 22, "⋯", size=12, align="center")
    p.rect(x0, 596, 120, 26, "+ Add button", size=11)
    p.text(x0, 632, 660, "Link URLs are set per delivery (in Production notes).", size=10, color=MUTED)
    p.rect(x0, 812, 100, 30, "Delete", size=11)
    p.rect(x0 + 460, 812, 90, 30, "Cancel")
    p.rect(x0 + 560, 812, 100, 30, "Save", kind="sel", bold=True)
    p.vline(990, 44, H)

    ox, ow = 1060, 300
    p.text(1006, 58, 300, "Layout preview", size=12, bold=True)
    p.rect(ox, 90, ow, 680, "", kind="box", rounded=False)
    p.image(ox + 10, 100, ow - 20, 100, "Hero (wide)")
    p.rect(ox + 10, 200, ow - 20, 30, "Headline overlay", kind="input", size=10, rounded=False)
    for s in range(2):
        y = 246 + s * 250
        p.rect(ox + 10, y, ow - 20, 20, f"Section {s + 1} heading", kind="input", size=10, rounded=False)
        if s == 0:
            p.rect(ox + 10, y + 24, ow - 20, 16, "Copy", kind="faint", size=9, rounded=False)
        for c in range(2):
            p.image(ox + 10 + c * 145, y + 46, 135, 130, "Product", size=10)
            p.rect(ox + 10 + c * 145, y + 182, 135, 18, "Shop now", kind="input", size=9, rounded=False)
    p.rect(ox + 70, 740, 160, 22, "See all knits", kind="box", size=10, rounded=False)
    p.nums([(160, 58), (150, 92), (70, 242), (281, 368), (x0 - 24, 58), (x0 + 600, 40), (x0 - 24, 108), (x0 - 24, 248), (x0 - 24, 314),
            (x0 - 24, 460), (x0 - 24, 522), (x0 - 24, 816), (1112, 54)])
    return p


# ---------------------------------------------------------------- 11 Results
def results():
    p = Page("11 Results", "11-results")
    app_header(p, "Results", back=True)
    p.select(16, 60, 200, "Period: Sep 2026", size=11)
    p.select(226, 60, 150, "Channel: All", size=11)
    p.text(400, 64, 70, "Group by", size=11)
    for i, g in enumerate(["Delivery", "Theme", "Template", "Product"]):
        p.rect(462 + i * 76, 60, 76, 24, g, kind="sel" if i == 0 else "input", size=11, bold=(i == 0))
    p.rect(800, 60, 90, 24, "Export", size=11)
    cols = [("Date", 16, 70), ("Delivery", 86, 180), ("Ch.", 266, 50), ("Theme", 316, 160), ("Template", 476, 110),
            ("Open", 586, 70), ("Click", 656, 70), ("Revenue", 726, 100), ("vs prev wk", 826, 90), ("vs last yr", 916, 90)]
    p.rect(16, 100, 1074, 30, "", kind="box", rounded=False)
    for nm, x, w in cols:
        p.text(x + 6, 108, w - 8, nm, size=10, bold=True, align="right" if x >= 586 else "left")
    data = [("09/05", "Back to Fall", "Email", "Fall wardrobe reset", "Grid 2×2", "38.2%", "4.1%", "$84,200", "▲ 6%", "▲ 11%"),
            ("09/06", "Back to Fall", "Push", "Fall wardrobe reset", "—", "—", "6.8%", "$12,900", "▲ 2%", "—"),
            ("09/12", "Denim Days", "Email", "Denim for every day", "Feature + list", "35.1%", "3.2%", "$61,500", "▼ 8%", "▲ 3%"),
            ("09/19", "First Layers", "Email", "Layer up for fall", "Two sections", "40.6%", "4.8%", "$97,300", "▲ 14%", "▲ 18%"),
            ("09/20", "Weekend Sale", "Email", "Weekend savings", "Sale grid 3×2", "33.4%", "5.2%", "$110,800", "▲ 4%", "▼ 2%"),
            ("09/26", "Cozy Knits", "Email", "Layer up for fall", "Grid 2×2", "41.3%", "4.5%", "$102,600", "▲ 5%", "▲ 9%")]
    for i, row in enumerate(data):
        y = 130 + i * 30
        p.rect(16, y, 1074, 30, "", kind="sel" if i == 3 else "faint", rounded=False)
        for (nm, x, w), v in zip(cols, row):
            p.text(x + 6, y + 8, w - 8, v, size=10, align="right" if x >= 586 else "left", bold=(i == 3 and x == 86))
    p.text(16, 330, 600, "Totals: 6 deliveries · revenue $469,300 · ▲ 5% vs previous month", size=11, color=MUTED)
    rx = 1110
    p.vline(rx, 44, H)
    p.text(rx + 14, 58, 300, "First Layers · 09/19 Email", size=14, bold=True)
    for i, (k, v) in enumerate([("Open", "40.6%"), ("Click", "4.8%"), ("Revenue", "$97.3K")]):
        x = rx + 14 + i * 99
        p.rect(x, 84, 94, 50, "", kind="input", rounded=False)
        p.text(x + 6, 88, 86, k, size=9, color=MUTED)
        p.text(x + 6, 104, 86, v, size=14, bold=True)
    p.text(rx + 14, 148, 300, "Products: sales after the delivery", size=12, bold=True)
    for i, (nm, d) in enumerate([("Crewneck Knit", "+38% in 7 days · stock 5.1 wks"), ("Cable Knit", "+22% · stock 7.0 wks"),
                                 ("Cardigan", "+9% · stock 9.4 wks"), ("Turtleneck", "+3% · stock 11 wks")]):
        y = 170 + i * 30
        p.text(rx + 14, y, 140, nm, size=10, bold=True)
        p.text(rx + 140, y, 170, d, size=10)
    p.text(rx + 14, 300, 300, "Adopted AI suggestions", size=12, bold=True)
    p.text(rx + 14, 320, 290, "Theme: Layer up for fall (AI option 1)\nTemplate: Two sections (AI pick)\nHeadline: AI option 2 (edited)", size=10, h=48)
    p.text(rx + 14, 380, 300, "Notes for next time", size=12, bold=True)
    p.rect(rx + 14, 400, 290, 90, "Knits did well with a layering angle." + chr(10) + "Try again early Oct with the crewneck in the hero.", kind="input", align="left", valign="top", size=10, rounded=False)
    p.rect(rx + 234, 496, 70, 24, "Save", size=10)
    p.nums([(378, 61), (768, 61), (892, 61), (1060, 104), (1060, 224), (420, 328), (rx - 11, 84), (rx - 11, 144), (rx - 11, 296), (rx - 11, 376)])
    return p


# ---------------------------------------------------------------- 12 Alerts (changes & exceptions)
def alerts():
    p = Page("12 Alerts", "12-alerts")
    app_header(p, "Alerts", back=True)
    p.text(16, 58, 300, "Changes that affect deliveries", size=12, bold=True)
    items = [("Out of stock", "Parka — from 10/05", "3 deliveries"), ("MD policy changed", "Cardigan — now clearance", "2 deliveries"),
             ("Low stock", "Crewneck Knit — 1.8 wks left", "3 deliveries"), ("Date changed", "Member Week moved to 10/11", "1 delivery")]
    for i, (k, d, n) in enumerate(items):
        y = 82 + i * 66
        p.rect(16, y, 300, 60, "", kind="sel" if i == 0 else "input", rounded=False)
        p.text(24, y + 6, 200, k, size=11, bold=True)
        p.text(24, y + 24, 280, d, size=10)
        p.text(24, y + 40, 280, n, size=10, color=MUTED)
    p.vline(332, 44, H)
    x0 = 350
    p.text(x0, 58, 600, "Out of stock: Parka — from 10/05", size=16, bold=True)
    p.text(x0, 84, 600, "Deliveries that include this product (not yet sent)", size=11, color=MUTED)
    cols = [("Date", 0, 90), ("Delivery", 90, 200), ("Ch.", 290, 60), ("Status", 350, 110), ("Where", 460, 140), ("Action", 600, 430)]
    p.rect(x0, 110, 1060, 30, "", kind="box", rounded=False)
    for nm, x, w in cols:
        p.text(x0 + x + 6, 118, w, nm, size=10, bold=True)
    rows = [("10/06 Tue", "Outerwear Edit", "Email", IR, "Section 1"), ("10/08 Thu", "Outerwear Guide", "Email", IR, "Section 1 · hero"),
            ("10/10 Sat", "Member Week", "Email", CF, "Section 2")]
    for i, (d, nm, ch, st, wh) in enumerate(rows):
        y = 140 + i * 44
        p.rect(x0, y, 1060, 44, "", kind="faint", rounded=False)
        for (cn, x, w), v in zip(cols, (d, nm, ch, st, wh)):
            p.text(x0 + x + 6, y + 14, w, v, size=11, bold=(cn == "Delivery"))
        p.rect(x0 + 606, y + 10, 120, 24, "Replace product", size=10)
        p.rect(x0 + 732, y + 10, 70, 24, "Open", size=10)
        p.rect(x0 + 808, y + 10, 80, 24, "Postpone", size=10)
        p.rect(x0 + 894, y + 10, 70, 24, "Cancel", size=10)
    p.text(x0, 290, 600, "Replace product — Outerwear Edit · Section 1", size=12, bold=True)
    p.rect(x0, 312, 620, 220, "", kind="box", rounded=False)
    p.text(x0 + 12, 322, 300, "AI suggestions (in stock, same category)", size=10, color=MUTED)
    for i, nm in enumerate(["Wool Coat", "Puffer Vest", "Quilted Jacket"]):
        x = x0 + 12 + i * 200
        p.image(x, 342, 70, 70, "")
        p.text(x + 78, 342, 120, f"{nm}\n$00.00\nStock 8 wks", size=10, h=46)
        p.rect(x + 78, 392, 70, 22, "Use", size=10)
    p.text(x0 + 12, 430, 300, "Reason for the change", size=10)
    p.rect(x0 + 12, 446, 596, 40, "Parka out of stock from 10/05", kind="input", align="left", valign="top", size=10, rounded=False)
    p.toggle(x0 + 12, 498, "Send back to review after the change", on=True)
    p.rect(x0 + 640, 312, 420, 120, "Postpone / Cancel asks for a new date or a reason,\nand records it in the delivery's history.", kind="dash", size=10, rounded=False)
    p.nums([(305, 84), (x0 + 300, 60), (1412, 150), (x0 + 600, 128), (x0 + 270, 290), (x0 + 130, 428), (x0 + 628, 306)])
    return p


# ---------------------------------------------------------------- 13 List view
def list_view():
    p = Page("13 List view", "13-list")
    app_header(p, "Delivery Calendar")
    for i, lab in enumerate(["Channel", "Type", "Status"]):
        x = 16 + i * 142
        p.text(x, 54, 130, lab, size=11)
        p.select(x, 72, 130, "All")
    p.rect(450, 72, 56, 24, "Month", kind="input", size=11)
    p.rect(506, 72, 56, 24, "Week", kind="input", size=11)
    p.rect(562, 72, 56, 24, "List", kind="sel", size=11, bold=True)
    p.select(640, 72, 170, "October 2026", size=11)
    p.rect(1220, 72, 90, 24, "Columns", size=11)
    p.rect(1320, 72, 100, 24, "Export CSV", size=11)
    cols = [("Date ▲", 0, 90), ("Time", 90, 60), ("Name", 150, 200), ("Channel", 350, 80), ("Type", 430, 100), ("Status", 530, 100),
            ("Owner", 630, 110), ("Theme", 740, 220), ("Products", 960, 70), ("Production due", 1030, 120), ("Steps", 1150, 80), ("", 1230, 174)]
    x0 = 16
    p.rect(x0, 112, 1404, 30, "", kind="box", rounded=False)
    for nm, x, w in cols:
        p.text(x0 + x + 6, 120, w, nm, size=10, bold=True)
    rows = [("10/01", "10:00", "Fall Arrivals", "Email", "Promotion", AP, "Owner A", "New season, new layers", "4", "09/26", "5 / 5"),
            ("10/02", "10:00", "Fall Knits", "Email", "Promotion", AP, "Owner B", "Layer up in new fall knits", "4", "09/28", "5 / 5"),
            ("10/02", "11:00", "Fall Knits — Push", "Push", "Promotion", IR, "Owner B", "Layer up in new fall knits", "—", "—", "1 / 3"),
            ("10/03", "09:00", "Weekend Sale", "Email", "EC", CF, "Owner C", "Weekend savings", "6", "09/29", "5 / 5"),
            ("10/03", "18:00", "Flash Deal", "Push", "EC", CF, "Owner C", "Last hours", "—", "—", "3 / 3"),
            ("10/04", "09:00", "Sunday Picks", "Email", "CRM", CF, "Owner A", "Outerwear for the weekend", "4", "09/30", "5 / 5"),
            ("10/05", "10:00", "Fall Preview", "Email", "Promotion", IR, "Owner B", "First look at fall", "4", "10/01", "4 / 5"),
            ("10/06", "10:00", "Outerwear Edit", "Email", "Promotion", IR, "Owner A", "Outerwear for cool days", "4", "10/02", "4 / 5"),
            ("10/07", "12:00", "Rainy Day Picks", "Email", "CRM", NS, "—", "", "0", "10/03", "0 / 5")]
    for i, r in enumerate(rows):
        y = 142 + i * 34
        p.rect(x0, y, 1404, 34, "", kind="faint", rounded=False)
        for (nm, x, w), v in zip(cols, r):
            p.text(x0 + x + 6, y + 10, w - 8, v, size=10, bold=(nm == "Name"))
        if r[-1] == "0 / 5":
            p.text(x0 + 1236, y + 10, 170, "Due soon — not started", size=10, bold=True)
    p.text(16, 460, 600, "30 deliveries · select a row to open its delivery card", size=11, color=MUTED)
    p.nums([(64, 52), (440, 48), (628, 48), (1208, 48), (1308, 48), (1414, 120), (1392, 424)])
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
                style = (f'text;html=1;strokeColor=none;fillColor=none;align={it["align"]};verticalAlign=top;whiteSpace=wrap;fontSize={it["size"]};fontColor={it["color"]};spacing=0;'
                         + ("fontStyle=1;" if it["bold"] else "") + ("horizontal=0;align=center;verticalAlign=middle;" if it["rot"] else ""))
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
        elif it["t"] == "text" and it["rot"]:
            cx, cy = it["x"] + it["w"] / 2, it["y"] + it["h"] / 2
            o.append(f'<text x="{cx:.1f}" y="{cy + it["size"] * 0.35:.1f}" font-size="{it["size"]}" fill="{it["color"]}" text-anchor="middle" transform="rotate(-90 {cx:.1f} {cy:.1f})">{html.escape(it["label"])}</text>')
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
    pages = [calendar(), card_theme(), card_template(), card_hero(), card_sections(), card_production(), card_push(),
             week_review(), compare_weeks(), templates(), results(), alerts(), list_view()]
    out = HERE / "drawio"  # 1 画面 = 1 ファイル
    out.mkdir(exist_ok=True)
    for old in out.glob("*.drawio"):
        old.unlink()
    for p in pages:
        (out / f"{p.slug}.drawio").write_text(drawio([p]), encoding="utf-8")
    img = HERE / "img"
    img.mkdir(exist_ok=True)
    for old in img.glob("*"):
        old.unlink()
    browser = edge()
    for p in pages:
        png = img / f"{p.slug}.png"
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
