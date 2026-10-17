-- SKU の出力(BIGQUERY_EXPORT.md の 3 章)の手本。元データは spu.sql と同じ(`{src}`)。
WITH
params AS (SELECT CURRENT_DATE('Asia/Tokyo') AS today),
sales4w AS (
  SELECT item_cd, SUM(sold_qty) AS units_4w
  FROM `{src}.t_sales_daily`, params
  WHERE sales_dt >= DATE_SUB(today, INTERVAL 28 DAY) AND sales_dt < today
  GROUP BY item_cd
)
SELECT
  CASE i.cntry WHEN 'JPN' THEN 'JP' WHEN 'USA' THEN 'US' END AS market,
  i.item_cd AS sku_code,
  i.style_cd AS product_code,
  i.color_nm AS color,
  i.size_nm AS size,
  -- レングス(丈)。元の表では股下の列。ない商品は空
  NULLIF(i.inseam_nm, '') AS length,
  i.retail_price AS price,
  IFNULL(s.units_4w, 0) AS units_4w,
  TIMESTAMP(DATE_ADD((SELECT MAX(sales_dt) FROM `{src}.t_sales_daily`), INTERVAL 1 DAY), 'Asia/Tokyo') AS as_of
FROM `{src}.m_item` AS i
LEFT JOIN sales4w AS s USING (item_cd)
-- 販売をやめた SKU は出さない(在庫のアラート・欠けているサイズの判定に混ざらないように)
WHERE i.status_flg = 'ACTIVE'
