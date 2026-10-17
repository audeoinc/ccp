-- SPU の出力(BIGQUERY_EXPORT.md の 2 章)を、練習用の元データから作るビューの手本。
-- 元データ(`{src}`)は `python -m ccp.cli bq-dummy` が作る、利用先の表に似せた表(列の名前も粒度も、仕様と違う)。
-- 利用先では、元のテーブルの名前・列に置き換えて書く。手順は docs/BIGQUERY_CONVERT.md。
WITH
params AS (SELECT CURRENT_DATE('Asia/Tokyo') AS today),

-- SKU のマスタ(販売中だけ)。国のコード(JPN / USA)を、仕様の市場(JP / US)に直す
item AS (
  SELECT
    CASE cntry WHEN 'JPN' THEN 'JP' WHEN 'USA' THEN 'US' END AS market,
    item_cd, style_cd, style_nm, div_nm, dept_nm, class_nm, season_cd, item_txt, retail_price
  FROM `{src}.m_item`
  WHERE status_flg = 'ACTIVE'
),

-- SKU をまとめて SPU に。価格は最安値に決める(仕様の 2 章: 最も多い価格か最安値のどちらか)
style AS (
  SELECT
    market,
    style_cd,
    ANY_VALUE(style_nm) AS name,
    ANY_VALUE(dept_nm) AS dept_nm,
    ANY_VALUE(CONCAT(div_nm, ' > ', dept_nm, ' > ', class_nm)) AS category_path,
    ANY_VALUE(season_cd) AS season_cd,
    ANY_VALUE(SUBSTR(item_txt, 1, 500)) AS description,
    MIN(retail_price) AS price
  FROM item
  GROUP BY market, style_cd
),

-- 日ごと・SPU ごとの販売。元は SKU ごとで、販売がない日は行がない
sales AS (
  SELECT i.market, i.style_cd, s.sales_dt, SUM(s.sold_qty) AS units, SUM(s.sales_amt) AS revenue
  FROM `{src}.t_sales_daily` AS s
  JOIN item AS i USING (item_cd)
  GROUP BY 1, 2, 3
),

-- 直近 4 週 = 今日を含めない 28 日。前年の同じ 4 週 = その 364 日前(曜日をそろえる)
sales4w AS (
  SELECT
    market,
    style_cd,
    SUM(IF(sales_dt >= DATE_SUB(today, INTERVAL 28 DAY), units, 0)) AS units_4w,
    SUM(IF(sales_dt >= DATE_SUB(today, INTERVAL 28 DAY), revenue, 0)) AS revenue_4w,
    SUM(IF(sales_dt >= DATE_SUB(today, INTERVAL 56 DAY) AND sales_dt < DATE_SUB(today, INTERVAL 28 DAY), units, 0)) AS units_prev_4w,
    SUM(IF(sales_dt >= DATE_SUB(today, INTERVAL 392 DAY) AND sales_dt < DATE_SUB(today, INTERVAL 364 DAY), revenue, 0)) AS revenue_ly_4w,
    MAX(sales_dt) AS last_sales_dt
  FROM sales, params
  WHERE sales_dt < today
  GROUP BY 1, 2
),

pv AS (
  SELECT
    CASE cntry WHEN 'JPN' THEN 'JP' WHEN 'USA' THEN 'US' END AS market,
    style_cd,
    SUM(pv) AS views_4w,
    SAFE_DIVIDE(SUM(order_cnt), SUM(pv)) AS cvr_4w
  FROM `{src}.t_pv_daily`, params
  WHERE pv_dt >= DATE_SUB(today, INTERVAL 28 DAY) AND pv_dt < today
  GROUP BY 1, 2
),

review AS (
  SELECT
    CASE cntry WHEN 'JPN' THEN 'JP' WHEN 'USA' THEN 'US' END AS market,
    style_cd,
    AVG(star) AS rating,
    COUNT(*) AS review_count,
    MAX(post_ts) AS last_review_at,
    ARRAY_TO_STRING(ARRAY_AGG(SUBSTR(comment_txt, 1, 300) ORDER BY post_ts DESC LIMIT 20), '\n---\n') AS review_texts
  FROM `{src}.t_review`
  GROUP BY 1, 2
),

-- 天気への反応(仕様の 7 章)。代表の 1 地点の、過去 365 日の実績
weather AS (
  SELECT CASE cntry WHEN 'JPN' THEN 'JP' WHEN 'USA' THEN 'US' END AS market, obs_dt AS dt, tmax_c, rain_mm
  FROM `{src}.t_weather_obs`, params
  WHERE obs_dt >= DATE_SUB(today, INTERVAL 365 DAY) AND obs_dt < today
),
-- 商品 × 日。販売がない日も 0 として数える(行がない日を落とすと、反応を大きく見積もるため)
grid AS (
  SELECT st.market, st.style_cd, st.dept_nm, w.dt, w.tmax_c, w.rain_mm, IFNULL(s.units, 0) AS units
  FROM style AS st
  JOIN weather AS w USING (market)
  LEFT JOIN sales AS s ON s.market = st.market AND s.style_cd = st.style_cd AND s.sales_dt = w.dt
),
lift_spu AS (
  SELECT
    market,
    style_cd,
    SAFE_DIVIDE(AVG(IF(tmax_c >= 25, units, NULL)), AVG(IF(tmax_c < 25, units, NULL))) - 1 AS lift_hot,
    SAFE_DIVIDE(AVG(IF(tmax_c <= 10, units, NULL)), AVG(IF(tmax_c > 10, units, NULL))) - 1 AS lift_cold,
    SAFE_DIVIDE(AVG(IF(rain_mm >= 1, units, NULL)), AVG(IF(rain_mm < 1, units, NULL))) - 1 AS lift_rain,
    COUNTIF(tmax_c >= 25) AS hot_days,
    COUNTIF(tmax_c <= 10) AS cold_days,
    COUNTIF(rain_mm >= 1) AS rain_days,
    SUM(units) AS units_365
  FROM grid
  GROUP BY 1, 2
),
-- データが少ない商品を補う、カテゴリ(部門 2)の値
lift_cat AS (
  SELECT
    market,
    dept_nm,
    SAFE_DIVIDE(AVG(IF(tmax_c >= 25, units, NULL)), AVG(IF(tmax_c < 25, units, NULL))) - 1 AS lift_hot,
    SAFE_DIVIDE(AVG(IF(tmax_c <= 10, units, NULL)), AVG(IF(tmax_c > 10, units, NULL))) - 1 AS lift_cold,
    SAFE_DIVIDE(AVG(IF(rain_mm >= 1, units, NULL)), AVG(IF(rain_mm < 1, units, NULL))) - 1 AS lift_rain
  FROM grid
  GROUP BY 1, 2
)

SELECT
  st.market,
  st.style_cd AS product_code,
  st.name,
  -- CCP のカテゴリ(いまは決まった選択肢)に合わせる。合わない値は、そのまま出す(CCP の確かめで分かる)
  CASE st.dept_nm
    WHEN 'OUTERWEAR' THEN 'outer'
    WHEN 'TOPS' THEN 'tops'
    WHEN 'BOTTOMS' THEN 'bottoms'
    WHEN 'FOOTWEAR' THEN 'shoes'
    WHEN 'ACCESSORIES' THEN 'accessories'
    WHEN 'BAGS' THEN 'bags'
    WHEN 'HOME' THEN 'home'
    ELSE LOWER(st.dept_nm)
  END AS category,
  st.category_path,
  CASE st.season_cd WHEN 'A' THEN 'autumn' WHEN 'W' THEN 'winter' WHEN 'AW' THEN 'autumn_winter' ELSE 'all_year' END AS season,
  st.price,
  st.description,
  -- 仕様の 2 章 ※2: 直近 4 週 ÷ その前の 4 週 が 1.15 以上なら up、0.85 以下なら down
  CASE
    WHEN IFNULL(s.units_prev_4w, 0) = 0 THEN IF(IFNULL(s.units_4w, 0) > 0, 'up', 'flat')
    WHEN s.units_4w / s.units_prev_4w >= 1.15 THEN 'up'
    WHEN s.units_4w / s.units_prev_4w <= 0.85 THEN 'down'
    ELSE 'flat'
  END AS sales_trend,
  IFNULL(s.units_4w, 0) AS units_4w,
  IFNULL(s.revenue_4w, 0) AS revenue_4w,
  SAFE_DIVIDE(s.revenue_4w, NULLIF(s.revenue_ly_4w, 0)) AS revenue_yoy,
  pv.views_4w,
  pv.cvr_4w,
  r.rating,
  r.review_count,
  r.last_review_at,
  r.review_texts,
  -- その条件の日が 10 日未満の商品は、カテゴリの値で補う(仕様の 7 章)
  IF(l.hot_days < 10, c.lift_hot, l.lift_hot) AS lift_hot,
  IF(l.cold_days < 10, c.lift_cold, l.lift_cold) AS lift_cold,
  IF(l.rain_days < 10, c.lift_rain, l.lift_rain) AS lift_rain,
  l.hot_days,
  l.cold_days,
  l.rain_days,
  IF(l.hot_days < 10 OR l.cold_days < 10 OR l.rain_days < 10, 'category', 'spu') AS weather_basis,
  -- データの時点 = 販売の最後の日の終わり(取り込んだ時刻ではない)
  TIMESTAMP(DATE_ADD((SELECT MAX(sales_dt) FROM `{src}.t_sales_daily`), INTERVAL 1 DAY), 'Asia/Tokyo') AS as_of
FROM style AS st
LEFT JOIN sales4w AS s USING (market, style_cd)
LEFT JOIN pv USING (market, style_cd)
LEFT JOIN review AS r USING (market, style_cd)
LEFT JOIN lift_spu AS l USING (market, style_cd)
LEFT JOIN lift_cat AS c ON c.market = st.market AND c.dept_nm = st.dept_nm
