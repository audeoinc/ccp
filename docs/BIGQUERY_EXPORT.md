# BigQuery から出してほしいデータの仕様(SQL を書く人向け)

CCP が利用先の BigQuery から取り込むデータの、**列の名前・型・意味**の仕様です。
設計の背景(なぜこの形か)は [BIGQUERY.md](BIGQUERY.md) にあります。

- 状態: 案(2026-10-15。2026-10-17 に `category_path`・`length`、2026-10-20 に販売順位(9 章)を足した)。CCP 側の取り込みは、できている(`server/ccp/bq_import.py`)
- 利用先のプロジェクト・データセット・テーブルの名前は、この文書にもコードにも書かない。CCP には設定(環境変数)で渡す

---

## 1. 全体のルール

| ルール | 内容 |
|---|---|
| 出力の数 | 下の **5 つ**(2〜6 章)と、結果の画面で使う販売順位(9 章。2026-10-20 に足した)。1 つの出力 = 1 つのテーブルかビュー |
| 列の名前 | この文書のとおりにする(`AS` で付け替える)。CCP は、名前をそのまま PostgreSQL の列に写す。余分な列は無視する |
| 1 行の単位(キー) | 各章の「キー」の列の組で、行が重複しないようにする。キーの列は空(NULL)にしない |
| 市場 | すべての出力に `market`(`'JP'` / `'US'` など。大文字の 2 文字)を付ける。CCP は、配信カードの国に合う市場の商品だけを、AI の選定に使う |
| データの時点 | `as_of`(TIMESTAMP)に、元のデータの時点を入れる(取り込んだ時刻ではない)。画面に「◯時点」と出す |
| 集計は BigQuery で | 生の明細は出さない。集計・相関の計算は、この SQL の中で済ませる |
| 文字コード・数値 | 文字列は UTF-8。金額は、その市場の通貨の値(円・ドル)のまま |

**更新の検知:** CCP は、出力の**最終更新の日時**を 1〜2 分ごとに見て、変わったときだけ読みます。

- 出力が**テーブル**(スケジュールされたクエリで作る など)なら、そのテーブルの最終更新の日時を見ます。おすすめはこちらです。
- 出力が**ビュー**の場合、ビューの最終更新の日時は、元のデータが変わっても変わりません。そのため、CCP の設定で「どのテーブルの更新を見るか」を指定します(在庫なら、在庫の元のテーブル)。

| 出力 | 章 | 粒度 | 更新の目安 |
|---|---|---|---|
| SPU | 2 | SPU | 1 日 1 回 |
| SKU | 3 | SKU | 1 日 1 回 |
| SKU の在庫 | 4 | SKU | 元の在庫の更新に合わせる(1 時間に数回) |
| 週ごとの実績 | 5 | SPU × 週 | 1 日 1 回 |
| 天気予報 | 6 | 日付(代表の 1 地点) | 予報の更新に合わせる |
| 販売チャネルごとの順位 | 9 | SPU × 週 × 販売チャネル | 1 日 1 回 |

---

## 2. SPU

**キー: `market`, `product_code`**

| 列 | 型 | 空を許す | 中身 |
|---|---|---|---|
| `market` | STRING | × | 市場 |
| `product_code` | STRING | × | SPU のコード |
| `name` | STRING | × | 商品名(その市場の言語) |
| `category` | STRING | ○ | カテゴリ(※1)。CCP が商品をまとめるときに使う段(1 つ) |
| `category_path` | STRING | ○ | カテゴリの階層を、上の段から ` > ` でつないだもの(例: `WOMEN > TOPS > KNIT`)。段の数は自由(※4) |
| `gender` | STRING | ○ | 商品の性別(`mens` / `womens` / `unisex`。`men`・`women`・`female`・`ladies`・`m`・`w` なども読み替える。空・読めない値は「どの対象にも出す」) |
| `season` | STRING | ○ | 季節(春 / 夏 / 秋 / 冬 / 通年 など。※1) |
| `price` | NUMERIC | ○ | 代表の価格(SKU で価格が違うなら、最も多い価格か最安値。どちらかに決める) |
| `description` | STRING | ○ | 商品の説明(長ければ 500 字ほどで切る) |
| `sales_trend` | STRING | ○ | `up` / `flat` / `down`(※2) |
| `units_4w` | INT64 | ○ | 直近 4 週の販売数 |
| `revenue_4w` | NUMERIC | ○ | 直近 4 週の売上 |
| `revenue_yoy` | FLOAT64 | ○ | 直近 4 週の売上 ÷ 前年の同じ 4 週の売上。前年がなければ空 |
| `views_4w` | INT64 | ○ | 直近 4 週の商品ページの閲覧数 |
| `cvr_4w` | FLOAT64 | ○ | 直近 4 週の購入率(購入数 ÷ 閲覧数。0〜1) |
| `rating` | FLOAT64 | ○ | レビューの平均(1〜5) |
| `review_count` | INT64 | ○ | レビューの件数 |
| `last_review_at` | TIMESTAMP | ○ | 最新のレビューの日時 |
| `review_texts` | STRING | ○ | 直近のレビューの本文、最大 20 件を新しい順に `\n---\n` でつなげたもの(1 件 300 字ほどで切る。※3) |
| `lift_hot` | FLOAT64 | ○ | 暑い日の売上の増減(7 章) |
| `lift_cold` | FLOAT64 | ○ | 寒い日の売上の増減(7 章) |
| `lift_rain` | FLOAT64 | ○ | 雨の日の売上の増減(7 章) |
| `hot_days` / `cold_days` / `rain_days` | INT64 | ○ | それぞれの条件の日数(計算に使った日数。確からしさとして使う) |
| `weather_basis` | STRING | ○ | `spu`(その商品の値)/ `category`(データが少ないので、カテゴリの値で補った) |
| `as_of` | TIMESTAMP | × | データの時点 |

- **※1** 実際に入る値の一覧(`SELECT DISTINCT`)を、別に共有してください。CCP の選択肢に合わせるか、自由な文字にするかを決めます。
- **※2** 判定のしかた(案): 直近 4 週の販売数 ÷ その前の 4 週の販売数 が 1.15 以上なら `up`、0.85 以下なら `down`、それ以外は `flat`。
- **※3** レビューの要約は、CCP が取り込みのときに Gemini で作ります(BigQuery では作らない)。CCP は、`review_count` と `last_review_at` が前回から変わった SPU だけ、作り直します。
- **※4** 利用先のカテゴリが、カテゴリ・サブカテゴリ・部門 1・部門 2 のように何段かに分かれている場合に使います。段の数が利用先ごとに違っても同じ列で受けられるよう、段ごとの列にはしません。`category` には、その中で、配信の企画で商品をまとめるのにいちばん使う段(例: `TOPS`)を入れてください。
- レビューの本文に個人を特定できる情報(名前・メールアドレス など)が入りうる場合は、ここで除いてください。

## 3. SKU

**キー: `market`, `sku_code`**

| 列 | 型 | 空を許す | 中身 |
|---|---|---|---|
| `market` | STRING | × | 市場 |
| `sku_code` | STRING | × | SKU のコード |
| `product_code` | STRING | × | 属する SPU のコード(2 章の SPU に、必ずあること) |
| `color` | STRING | ○ | 色 |
| `color_hex` | STRING | ○ | 色の番号(`#c8b29a` の形。テンプレートの箱のカラーチップに使う。ない列・空の行は、色の名前から引く。2026-10-23 に足した) |
| `size` | STRING | ○ | サイズ |
| `length` | STRING | ○ | レングス(丈。パンツの股下・スカートの丈 など。ない商品は空) |
| `price` | NUMERIC | ○ | SKU の価格(SPU の価格と同じなら空でよい) |
| `units_4w` | INT64 | ○ | 直近 4 週の販売数(売れ筋のサイズ・色を見るため) |
| `as_of` | TIMESTAMP | × | データの時点 |

- 販売をやめた SKU は、出さない(在庫のアラート・欠けているサイズの判定に、混ざらないように)。

## 4. SKU の在庫

**キー: `market`, `sku_code`**

| 列 | 型 | 空を許す | 中身 |
|---|---|---|---|
| `market` | STRING | × | 市場 |
| `sku_code` | STRING | × | SKU のコード(3 章の SKU に、必ずあること) |
| `stock` | INT64 | × | いまの在庫(販売できる数) |
| `as_of` | TIMESTAMP | × | 在庫の時点 |

- 1 SKU = 1 行(最新の値だけ)。履歴は出さない。
- 3 章の SKU に在庫の行がない場合、CCP は「在庫 0」として扱います。
- SPU の在庫は出さない(CCP が、この出力から SKU の合計を計算する)。

## 5. 週ごとの実績(SPU 単位)

**キー: `market`, `product_code`, `week_start`**

| 列 | 型 | 空を許す | 中身 |
|---|---|---|---|
| `market` | STRING | × | 市場 |
| `product_code` | STRING | × | SPU のコード |
| `week_start` | DATE | × | 週の始まり(月曜) |
| `units` | INT64 | × | その週の販売数(SKU の合計) |
| `revenue` | NUMERIC | × | その週の売上 |
| `stock` | INT64 | ○ | その週の終わりの在庫(SKU の合計) |
| `as_of` | TIMESTAMP | × | データの時点 |

- 期間は**直近 12 週**(終わっていない今週は含めない)。在庫のアラートは、直近 4 週の平均を「販売のペース」に使う。
- 販売がなかった週も、`units = 0` の行を出す(行がないと、ペースを高く見積もるため)。

## 6. 天気予報(代表の 1 地点)

**キー: `market`, `date`**

| 列 | 型 | 空を許す | 中身 |
|---|---|---|---|
| `market` | STRING | × | 市場(市場ごとに代表の地点が違うため) |
| `date` | DATE | × | 予報の対象の日 |
| `temp_max` | FLOAT64 | ○ | 最高気温(℃) |
| `temp_min` | FLOAT64 | ○ | 最低気温(℃) |
| `precip_prob` | FLOAT64 | ○ | 降水確率(0〜100) |
| `weather` | STRING | ○ | `sunny` / `cloudy` / `rain` / `snow` |
| `issued_at` | TIMESTAMP | × | 予報が出た時刻 |

- 今日から、予報のある最後の日まで(2 週間ほどあれば十分)。
- 1 つの日付に予報が複数ある場合は、いちばん新しいもの(`issued_at` が最大)だけを出す。

## 7. 天気への反応(2 章の `lift_*` の計算のしかた)

| 条件 | 定義 |
|---|---|
| 暑い日 | 最高気温 25℃ 以上 |
| 寒い日 | 最高気温 10℃ 以下 |
| 雨の日 | 降水量 1mm 以上 |

- 値 = (その条件の日の 1 日あたり販売数 ÷ それ以外の日の 1 日あたり販売数)− 1。**+0.3 なら売上 +30%、−0.15 なら −15%。**
- 期間は過去 365 日。天気は、代表の 1 地点の実績。
- **販売がなかった日も、0 として数える**(販売の行がない日を落とすと、反応を大きく見積もるため)。
- 可能なら、**在庫が 0 だった日は除く**(売れなかったのが天気のせいではないため)。
- その条件の日が **10 日未満**の商品は、同じカテゴリの全商品で計算した値を入れ、`weather_basis = 'category'` にする。
- しきい値(25℃・10℃・1mm・10 日)は、商品の性質に合わせて変えてかまいません。変えたら、CCP の開発側にも知らせてください(AI への説明文を合わせるため)。

SQL の骨組み(例。`<…>` は、利用先の実際のテーブルに置き換える):

```sql
WITH weather AS (            -- 代表の地点の、日ごとの天気の実績
  SELECT market, date, temp_max, precip_mm
  FROM `<天気の実績>`
  WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY) AND date < CURRENT_DATE()
),
grid AS (                    -- 商品 × 日(販売がない日も 1 行にするため)
  SELECT p.market, p.product_code, p.category, w.date, w.temp_max, w.precip_mm
  FROM `<SPU のマスタ>` AS p
  JOIN weather AS w USING (market)
),
daily AS (
  SELECT g.*, IFNULL(s.units, 0) AS units
  FROM grid AS g
  LEFT JOIN `<SPU ごと・日ごとの販売数>` AS s USING (market, product_code, date)
  -- 可能なら、在庫が 0 だった日を除く
)
SELECT
  market,
  product_code,
  SAFE_DIVIDE(AVG(IF(temp_max >= 25, units, NULL)), AVG(IF(temp_max < 25, units, NULL))) - 1 AS lift_hot,
  SAFE_DIVIDE(AVG(IF(temp_max <= 10, units, NULL)), AVG(IF(temp_max > 10, units, NULL))) - 1 AS lift_cold,
  SAFE_DIVIDE(AVG(IF(precip_mm >= 1, units, NULL)), AVG(IF(precip_mm < 1, units, NULL))) - 1 AS lift_rain,
  COUNTIF(temp_max >= 25) AS hot_days,
  COUNTIF(temp_max <= 10) AS cold_days,
  COUNTIF(precip_mm >= 1) AS rain_days
FROM daily
GROUP BY market, product_code
-- この結果を、同じ計算をカテゴリ単位で行ったものと合わせ、日数が 10 日未満の条件はカテゴリの値に置き換える
```

## 8. 共有してほしいもの

1. 各出力の、利用先での**場所**(プロジェクト・データセット・テーブル(ビュー)の名前)。ビューなら、更新を見る元のテーブルの名前も。→ CCP の設定(`server/workbench.env`)に入れる。リポジトリには書かない
2. `category`・`season` に入る値の一覧(2 章の ※1)
3. 各出力の、おおよその行数

## 9. 販売チャネルごとの順位(SPU × 週 × 販売チャネル)

配信の結果の画面で、載せた商品が、販売チャネルごとに何位だったか(配信前の 4 週で Top N に入った週の数、配信の週・翌週の順位)を見せるために使う(2026-10-20 に足した)。CCP の設定は `BQ_RANKING`(ビューなら、更新を見る元の販売の表を `BQ_RANKING_WATCH` に)。まだ出せないあいだは、`python -m ccp.cli ranking-dummy --yes` のダミーで画面を確かめられる(BigQuery から取り込んだ行があれば、ダミーは作らない)。

**キー: `market`, `product_code`, `week_start`, `channel`**

| 列 | 型 | 空を許す | 中身 |
|---|---|---|---|
| `market` | STRING | × | 市場 |
| `product_code` | STRING | × | SPU のコード |
| `week_start` | DATE | × | 週の始まり(月曜。5 章と同じ週) |
| `channel` | STRING | × | `all`(全社)/ `ec`(EC)/ `delivery`(配信経由) |
| `rank` | INT64 | × | その週・そのチャネルの、**売れた数量**の順位(市場の中で、1 が最も売れた) |
| `units` | INT64 | ○ | その週・そのチャネルで売れた数量 |
| `as_of` | TIMESTAMP | × | データの時点 |

- **順位は、市場の全 SPU の中で付ける**(CCP に取り込む商品の中だけで付けない)。同じ数量は同じ順位(`RANK()`)でよい。
- **配信経由**は、メール・アプリの**すべての配信**を通った売上(UTM などで配信から来たと分かる注文)。どの配信かは問わない。
- 期間は**直近 26 週**ほど(配信の 4 週前から翌週までを見るため、過去の配信の結果を見る期間に合わせる)。終わっていない今週は含めない。
- 行は、そのチャネルで 1 点以上売れた商品だけでよい(行がなければ、画面は「—」= 圏外として出す)。
- 「上位」とみなす線(Top 60 など)は、CCP の画面で決める(BigQuery では決めない)。

```sql
-- 例: 週 × チャネルごとに、数量で順位を付ける(元の表の名前・列は、利用先に合わせる)
SELECT market, product_code, week_start, channel, units,
       RANK() OVER (PARTITION BY market, week_start, channel ORDER BY units DESC) AS rank,
       (SELECT MAX(updated_at) FROM sales) AS as_of  -- 元の販売の表の時点(1 章。CURRENT_TIMESTAMP() は使わない)
FROM (
  SELECT market, product_code, DATE_TRUNC(order_date, WEEK(MONDAY)) AS week_start, 'all' AS channel, SUM(qty) AS units FROM sales GROUP BY 1, 2, 3
  UNION ALL
  SELECT market, product_code, DATE_TRUNC(order_date, WEEK(MONDAY)), 'ec', SUM(qty) FROM sales WHERE sales_channel = 'ec' GROUP BY 1, 2, 3
  UNION ALL
  SELECT market, product_code, DATE_TRUNC(order_date, WEEK(MONDAY)), 'delivery', SUM(qty) FROM sales WHERE from_delivery GROUP BY 1, 2, 3
)
WHERE units > 0
```
