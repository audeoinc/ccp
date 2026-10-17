-- 週ごとの実績の出力(BIGQUERY_EXPORT.md の 5 章)の手本。元データは spu.sql と同じ(`{src}`)。
-- 直近 12 週(終わっていない今週は含めない)。販売がなかった週も units = 0 の行を出す。
WITH
params AS (SELECT DATE_TRUNC(CURRENT_DATE('Asia/Tokyo'), WEEK(MONDAY)) AS this_week),
weeks AS (
  SELECT wk
  FROM params, UNNEST(GENERATE_DATE_ARRAY(DATE_SUB(this_week, INTERVAL 12 WEEK), DATE_SUB(this_week, INTERVAL 1 WEEK), INTERVAL 1 WEEK)) AS wk
),
style AS (
  SELECT DISTINCT CASE cntry WHEN 'JPN' THEN 'JP' WHEN 'USA' THEN 'US' END AS market, style_cd
  FROM `{src}.m_item`
  WHERE status_flg = 'ACTIVE'
),
sales AS (
  SELECT i.style_cd, DATE_TRUNC(s.sales_dt, WEEK(MONDAY)) AS wk, SUM(s.sold_qty) AS units, SUM(s.sales_amt) AS revenue
  FROM `{src}.t_sales_daily` AS s
  JOIN `{src}.m_item` AS i USING (item_cd)
  GROUP BY 1, 2
),
-- 週の終わり(日曜)の在庫。元の表は、SKU ごと・日曜ごとのスナップショット
stock AS (
  SELECT i.style_cd, DATE_SUB(h.snap_dt, INTERVAL 6 DAY) AS wk, SUM(h.on_hand) AS stock
  FROM `{src}.t_inventory_hist` AS h
  JOIN `{src}.m_item` AS i USING (item_cd)
  WHERE i.status_flg = 'ACTIVE'
  GROUP BY 1, 2
)
SELECT
  st.market,
  st.style_cd AS product_code,
  w.wk AS week_start,
  IFNULL(s.units, 0) AS units,
  IFNULL(s.revenue, 0) AS revenue,
  k.stock,
  TIMESTAMP(DATE_ADD((SELECT MAX(sales_dt) FROM `{src}.t_sales_daily`), INTERVAL 1 DAY), 'Asia/Tokyo') AS as_of
FROM style AS st
CROSS JOIN weeks AS w
LEFT JOIN sales AS s ON s.style_cd = st.style_cd AND s.wk = w.wk
LEFT JOIN stock AS k ON k.style_cd = st.style_cd AND k.wk = w.wk
