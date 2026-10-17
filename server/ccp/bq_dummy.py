"""BigQuery の練習用のダミーデータ(docs/BIGQUERY.md の 11 章)。

  python -m ccp.cli bq-dummy [--dataset ccp_dummy] [--pack <ZIP>] [--yes]
  python -m ccp.cli bq-dummy --touch-stock --yes     在庫のスナップショットを 1 回分だけ足す(更新の検知を試す)

2 つのデータセットを作る:
  <dataset>_src  利用先の元データに似せた表。列の名前も粒度も、仕様(BIGQUERY_EXPORT.md)と違う
                 (SKU ごと・日ごとの販売、在庫のスナップショット、レビューの明細、天気の実績・予報 など)
  <dataset>      仕様の形の 5 つの出力(ビュー)。SQL は docs/bq_example/*.sql(利用先でビューを作るときの手本)

中身は、商品(既定は server/seed.json。--pack で、引っ越し用のパックの商品 = 本番の商品)から作る。日付は、実行した日を起点にする(実行し直すと、新しくなる)。
**本番で試すなら、必ず本番のパック(⚙ → データと画像を書き出す)から作る。** 2026-10-17 に、seed.json(本番とは別の 60 商品)から作ったダミーを
本番に取り込み、本番の週ごとの実績を消してしまった(取り込みは、SPU がいまの商品と合わなければ止めるように直したが、合わせて作るのが先)。
利用先の Claude には、元データ → ビュー の変換の手本・練習台として渡す(docs/BIGQUERY_CONVERT.md)。
"""
from __future__ import annotations

import json
import math
import random
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from . import bq

ROOT = Path(__file__).resolve().parents[2]
SEED_PATH = ROOT / "server" / "seed.json"
SQL_DIR = ROOT / "docs" / "bq_example"
VIEWS = ("spu", "sku", "sku_stock", "weekly", "forecast")
# ビューの更新を見る元の表(BQ_<名前>_WATCH)。ビューの最終更新の日時は、元のデータが変わっても変わらないため
WATCH = {"spu": "t_sales_daily", "sku": "m_item", "sku_stock": "t_inventory", "weekly": "t_sales_daily", "forecast": "t_weather_fcst"}
ENV = {"spu": "BQ_SPU", "sku": "BQ_SKU", "sku_stock": "BQ_SKU_STOCK", "weekly": "BQ_WEEKLY", "forecast": "BQ_FORECAST"}
DAYS = 400  # 前年の同じ 4 週(364〜392 日前)と、天気への反応(365 日)に足りる長さ

COUNTRY = {"JP": "JPN", "US": "USA"}
DEPT = {"outer": "OUTERWEAR", "tops": "TOPS", "bottoms": "BOTTOMS", "shoes": "FOOTWEAR", "accessories": "ACCESSORIES", "bags": "BAGS", "home": "HOME"}
CLASS = {"outer": "COAT", "tops": "KNIT", "bottoms": "PANTS", "shoes": "BOOTS", "accessories": "SCARF", "bags": "TOTE", "home": "LIVING"}
SEASON = {"autumn": "A", "winter": "W", "autumn_winter": "AW", "all_year": "ALL"}
COLORS = ["BLACK", "NAVY", "GRAY", "BEIGE", "BROWN", "IVORY"]

# 元データの表の列(利用先の表に似せて、仕様とは違う名前にしてある)
SCHEMAS: dict[str, list[tuple[str, str]]] = {
    "m_item": [("item_cd", "STRING"), ("style_cd", "STRING"), ("style_nm", "STRING"), ("cntry", "STRING"), ("div_nm", "STRING"), ("dept_nm", "STRING"),
               ("class_nm", "STRING"), ("color_nm", "STRING"), ("size_nm", "STRING"), ("inseam_nm", "STRING"), ("retail_price", "NUMERIC"),
               ("season_cd", "STRING"), ("item_txt", "STRING"), ("status_flg", "STRING")],
    "t_sales_daily": [("sales_dt", "DATE"), ("item_cd", "STRING"), ("cntry", "STRING"), ("sold_qty", "INT64"), ("sales_amt", "NUMERIC")],
    "t_inventory": [("item_cd", "STRING"), ("cntry", "STRING"), ("on_hand", "INT64"), ("allocated", "INT64"), ("snap_ts", "TIMESTAMP")],
    "t_inventory_hist": [("snap_dt", "DATE"), ("item_cd", "STRING"), ("on_hand", "INT64")],
    "t_pv_daily": [("pv_dt", "DATE"), ("style_cd", "STRING"), ("cntry", "STRING"), ("pv", "INT64"), ("order_cnt", "INT64")],
    "t_review": [("review_id", "STRING"), ("style_cd", "STRING"), ("cntry", "STRING"), ("star", "INT64"), ("comment_txt", "STRING"), ("post_ts", "TIMESTAMP")],
    "t_weather_obs": [("cntry", "STRING"), ("obs_dt", "DATE"), ("tmax_c", "FLOAT64"), ("tmin_c", "FLOAT64"), ("rain_mm", "FLOAT64")],
    "t_weather_fcst": [("cntry", "STRING"), ("fcst_dt", "DATE"), ("tmax_c", "FLOAT64"), ("tmin_c", "FLOAT64"), ("pop_pct", "FLOAT64"), ("wx_cd", "INT64"), ("issued_ts", "TIMESTAMP")],
}

# レビューの本文の見本(個人を特定できる情報は入れない)
REVIEWS = {
    "JP": {
        "good": ["とても暖かくて、毎日着ています。", "色がきれいで、写真のとおりでした。", "サイズ感がちょうどよく、動きやすいです。", "生地がしっかりしていて、長く使えそう。", "軽くて持ち運びが楽です。", "家族にも好評でした。"],
        "bad": ["思ったより薄手でした。", "袖が少し長く感じました。", "色が写真より暗めでした。", "毛玉ができやすいのが気になります。"],
    },
    "US": {
        "good": ["So warm, I wear it every day.", "The color is exactly like the photo.", "Fits true to size and easy to move in.", "Solid fabric, feels like it will last.", "Lightweight and easy to carry.", "Got compliments the first day."],
        "bad": ["Thinner than I expected.", "Sleeves run a little long.", "Color is darker than pictured.", "Pills a bit after a few washes."],
    },
}


def _poisson(rng: random.Random, lam: float) -> int:
    if lam <= 0:
        return 0
    if lam > 30:  # 大きいときは正規分布で近似する(数え上げが長くなるため)
        return max(0, round(rng.gauss(lam, math.sqrt(lam))))
    limit, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rng.random()
        if p <= limit:
            return k
        k += 1


def _sizes(category: str, market: str) -> tuple[list[str], list[str]]:
    """サイズと、レングス(丈。パンツだけ)"""
    if category in ("outer", "tops"):
        return ["S", "M", "L", "XL"], [""]
    if category == "bottoms":
        return ["S", "M", "L"], ["REG", "LONG"]
    if category == "shoes":
        return (["23.0", "24.0", "25.0", "26.0", "27.0"] if market == "JP" else ["7", "8", "9", "10", "11"]), [""]
    return ["F"], [""]


def _weather_obs(rng: random.Random, market: str, d: date) -> tuple[float, float, float]:
    """代表の地点の、その日の天気(最高・最低気温、降水量)。季節の波 + ばらつき"""
    doy = d.timetuple().tm_yday
    mean, amp, sd = (16.5, 10.5, 3.0) if market == "JP" else (16.0, 13.0, 4.0)
    tmax = mean + amp * math.sin(2 * math.pi * (doy - 110) / 365) + rng.gauss(0, sd)
    tmin = tmax - rng.uniform(5, 10)
    wet = 0.38 if 150 <= doy <= 270 and market == "JP" else 0.28
    rain = round(rng.expovariate(1 / 8), 1) if rng.random() < wet else 0.0
    return round(tmax, 1), round(tmin, 1), rain


def load_source(pack: Path | None) -> dict[str, list[dict[str, Any]]]:
    """商品と週ごとの実績の出どころ。パック(data.json の tables)か、seed.json"""
    if pack is None:
        return json.loads(SEED_PATH.read_text(encoding="utf-8"))
    from .pack import read_pack

    data, _ = read_pack(pack)
    return data["tables"]


def build(today: date, seed: int = 42, data: dict[str, list[dict[str, Any]]] | None = None) -> dict[str, list[dict[str, Any]]]:
    """元データの表(SCHEMAS)の行を作る"""
    rng = random.Random(seed)
    data = data if data is not None else load_source(None)
    weekly_units: dict[str, list[int]] = defaultdict(list)
    for w in data.get("weekly_performances", []):
        weekly_units[w["product_code"]].append(int(w.get("units") or 0))

    out: dict[str, list[dict[str, Any]]] = {k: [] for k in SCHEMAS}
    start = today - timedelta(days=DAYS)
    days = [start + timedelta(days=i) for i in range(DAYS)]

    # 天気の実績(過去)と予報(今日から 14 日)
    obs: dict[tuple[str, date], tuple[float, float, float]] = {}
    for m in COUNTRY:
        for d in days:
            obs[(m, d)] = _weather_obs(rng, m, d)
            t = obs[(m, d)]
            out["t_weather_obs"].append({"cntry": COUNTRY[m], "obs_dt": d.isoformat(), "tmax_c": t[0], "tmin_c": t[1], "rain_mm": t[2]})
        now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
        for issued in (now - timedelta(hours=24), now - timedelta(hours=3)):  # 予報は 2 回分。ビューは新しいほうだけを出す
            for i in range(14):
                d = today + timedelta(days=i)
                tmax, tmin, rain = _weather_obs(rng, m, d)
                pop = min(100.0, round(rain * 8 + rng.uniform(0, 30), 0))
                wx = 400 if rain > 0 and tmax < 3 else 300 if pop >= 50 else 200 if pop >= 30 else 100
                out["t_weather_fcst"].append({"cntry": COUNTRY[m], "fcst_dt": d.isoformat(), "tmax_c": tmax, "tmin_c": tmin, "pop_pct": pop, "wx_cd": wx, "issued_ts": issued.isoformat()})

    for p in data["products"]:
        m, code, cat = p.get("market") or "JP", p["product_code"], p.get("category") or "home"
        cn, price = COUNTRY[m], float(p.get("price") or 0)
        sizes, lengths = _sizes(cat, m)
        colors = rng.sample(COLORS, 3 if cat in ("outer", "tops", "bottoms") else 2)
        div = "HOME" if cat == "home" else rng.choice(["WOMEN", "MEN", "UNISEX"])
        skus: list[str] = []
        for c in colors:
            for s in sizes:
                for ln in lengths:
                    item = "-".join(x for x in (code, c[:2], s.replace(".", ""), ln[:1]) if x)
                    skus.append(item)
                    out["m_item"].append({
                        "item_cd": item, "style_cd": code, "style_nm": p["name"], "cntry": cn, "div_nm": div, "dept_nm": DEPT.get(cat, cat.upper()),
                        "class_nm": CLASS.get(cat, "OTHER"), "color_nm": c, "size_nm": s, "inseam_nm": ln,
                        "retail_price": price + (price * 0.1 if s in ("XL", "11", "27.0") else 0), "season_cd": SEASON.get(p.get("season") or "", "ALL"),
                        "item_txt": p.get("description") or "", "status_flg": "ACTIVE",
                    })
        # 販売をやめた SKU を 1 つ混ぜる(ビューで除くことを確かめるため)
        out["m_item"].append({**out["m_item"][-1], "item_cd": f"{code}-OLD", "color_nm": "RED", "status_flg": "DISC"})
        weights = [rng.uniform(0.5, 2.0) * (1.6 if "-M" in s or "-25" in s or "-9" in s else 1.0) for s in skus]

        # 日ごとの販売: 季節・天気・売上のトレンドで変える
        units_week = weekly_units.get(code) or [5]
        base = sum(units_week) / len(units_week) / 7
        season, wx, trend = p.get("season"), p.get("weather"), p.get("sales_trend")
        daily: dict[date, int] = {}
        for d in days:
            tmax, _, rain = obs[(m, d)]
            mult = 1.0
            if season in ("autumn_winter", "winter", "autumn"):
                mult *= 0.4 + min(1.0, max(0.0, (24 - tmax) / 14))
            if wx == "cold" and tmax <= 10:
                mult *= 1.5
            if wx == "rainy" and rain >= 1:
                mult *= 1.4
            if wx == "sunny" and tmax >= 25:
                mult *= 1.3
            age = (today - d).days
            if age <= 28:
                mult *= {"up": 1.35, "down": 0.65}.get(trend or "", 1.0)
            units = _poisson(rng, base * mult)
            daily[d] = units
            if units:
                per: dict[str, int] = defaultdict(int)
                for s in rng.choices(skus, weights=weights, k=units):
                    per[s] += 1
                for s, q in per.items():
                    out["t_sales_daily"].append({"sales_dt": d.isoformat(), "item_cd": s, "cntry": cn, "sold_qty": q, "sales_amt": round(q * price, 2)})

        # いまの在庫: seed の在庫を SKU に分ける。1 割ほどは在庫 0(欠けているサイズ・色の判定を試すため)
        total = int(p.get("stock") or 0)
        stock = {s: (0 if rng.random() < 0.1 else max(0, round(total * w / sum(weights)))) for s, w in zip(skus, weights)}
        now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
        for s in skus:
            for ago in (120, 0):  # スナップショットを 2 回分。ビューは新しいほうだけを出す
                extra = rng.randint(0, 3) if ago else 0
                out["t_inventory"].append({"item_cd": s, "cntry": cn, "on_hand": stock[s] + extra + 1, "allocated": 1, "snap_ts": (now - timedelta(minutes=ago)).isoformat()})
        # 週の終わり(日曜)の在庫: いまから過去へ、売れた分を足し戻す(ときどき入荷した分を引く)
        sunday = today - timedelta(days=(today.weekday() + 1) % 7 or 7)
        level = dict(stock)
        for k in range(13):
            snap = sunday - timedelta(weeks=k)
            for s in skus:
                out["t_inventory_hist"].append({"snap_dt": snap.isoformat(), "item_cd": s, "on_hand": level[s]})
            sold = sum(daily.get(snap - timedelta(days=i), 0) for i in range(7))
            restock = rng.random() < 0.15
            for s, w in zip(skus, weights):
                level[s] = max(0, level[s] + round(sold * w / sum(weights)) - (rng.randint(5, 20) if restock else 0))

        # 商品ページの閲覧と購入(直近 35 日)
        for i in range(1, 36):
            d = today - timedelta(days=i)
            orders = daily.get(d, 0)
            pv = max(orders, round((orders + 1) * rng.uniform(25, 60)))
            out["t_pv_daily"].append({"pv_dt": d.isoformat(), "style_cd": code, "cntry": cn, "pv": pv, "order_cnt": orders})

        # レビュー: seed の評価に近い星の分布で
        rating = float(p.get("rating") or 4.0)
        texts = REVIEWS[m]
        for i in range(rng.randint(3, 40)):
            star = max(1, min(5, round(rng.gauss(rating, 0.8))))
            body = rng.choice(texts["good"] if star >= 4 else texts["bad"]) + ("" if rng.random() < 0.6 else " " + rng.choice(texts["good"]))
            ts = datetime.now(timezone.utc) - timedelta(days=rng.uniform(0, 365))
            out["t_review"].append({"review_id": f"{code}-R{i:03d}", "style_cd": code, "cntry": cn, "star": star, "comment_txt": body, "post_ts": ts.isoformat()})
    return out


def touch_stock(latest: list[dict[str, Any]], seed: int | None = None) -> list[dict[str, Any]]:
    """在庫のスナップショットを 1 回分作る(いまの時刻。2 割ほどの SKU が売れて減る)。足すだけ(前の行は消さない)"""
    rng = random.Random(seed)
    now = datetime.now(timezone.utc).replace(second=0, microsecond=0).isoformat()
    rows = []
    for r in latest:
        sold = rng.randint(1, 4) if rng.random() < 0.2 else 0
        rows.append({**r, "on_hand": max(0, int(r["on_hand"]) - sold), "snap_ts": now})
    return rows


def _location(project: str, dataset: str, table: str) -> str:
    return f"{project}.{dataset}.{table}"


def run(dataset: str, location: str, yes: bool, touch: bool, pack: Path | None = None) -> None:
    from google.cloud import bigquery

    project = bq.job_project()
    if not project:
        raise SystemExit("プロジェクトが分かりません。環境変数 BQ_PROJECT か GOOGLE_CLOUD_PROJECT を設定してください")
    src = f"{dataset}_src"
    if touch:
        client = bq.client()
        table = _location(project, src, "t_inventory")
        latest = [dict(r) for r in client.query(
            f"SELECT item_cd, cntry, on_hand, allocated FROM `{table}` QUALIFY ROW_NUMBER() OVER (PARTITION BY item_cd ORDER BY snap_ts DESC) = 1"
        ).result()]
        rows = touch_stock(latest)
        print(f"在庫のスナップショット: {len(rows)} 行を {src}.t_inventory に足します(減る SKU: {sum(1 for a, b in zip(latest, rows) if a['on_hand'] != b['on_hand'])})")
        if not yes:
            print("確認だけです。足すときは --yes を付けて実行してください")
            return
        cfg = bigquery.LoadJobConfig(schema=[bigquery.SchemaField(n, t) for n, t in SCHEMAS["t_inventory"]], write_disposition="WRITE_APPEND")
        client.load_table_from_json(rows, _location(project, src, "t_inventory"), job_config=cfg).result()
        print("足しました(在庫の出力の更新を見る表が変わったので、CCP は次の確認で取り込む)")
        return

    source = load_source(pack)
    data = build(date.today(), data=source)
    print(f"プロジェクト {project} / 場所 {location}")
    print(f"商品の出どころ: {pack.name if pack else 'server/seed.json'}({len(source.get('products', []))} 点)")
    print(f"元データ({src}):")
    for name, rows in data.items():
        print(f"  {name}: {len(rows)} 行")
    print(f"仕様の形の出力({dataset}。ビュー): {', '.join(VIEWS)}")
    if not yes:
        print()
        print("確認だけです。BigQuery に作る(同じ名前の表は置き換える)ときは --yes を付けて実行してください")
        return

    client = bq.client()
    for ds in (src, dataset):
        d = bigquery.Dataset(f"{project}.{ds}")
        d.location = location
        d.description = "CCP の練習用のダミーデータ(python -m ccp.cli bq-dummy が作る。docs/BIGQUERY.md の 11 章)"
        client.create_dataset(d, exists_ok=True)
    for name, rows in data.items():
        cfg = bigquery.LoadJobConfig(schema=[bigquery.SchemaField(n, t) for n, t in SCHEMAS[name]], write_disposition="WRITE_TRUNCATE")
        client.load_table_from_json(rows, _location(project, src, name), job_config=cfg).result()
        print(f"  {src}.{name}: {len(rows)} 行を入れました")
    for v in VIEWS:
        sql = (SQL_DIR / f"{v}.sql").read_text(encoding="utf-8").replace("{src}", f"{project}.{src}")
        client.query(f"CREATE OR REPLACE VIEW `{_location(project, dataset, v)}` AS\n{sql}").result()
        print(f"  {dataset}.{v}: ビューを作りました")
    print()
    print("CCP の設定(環境変数)に、次を入れると、このダミーデータから取り込みます:")
    for v in VIEWS:
        print(f"  {ENV[v]}={_location(project, dataset, v)}")
        print(f"  {ENV[v]}_WATCH={_location(project, src, WATCH[v])}")
