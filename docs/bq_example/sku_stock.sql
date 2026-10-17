-- SKU の在庫の出力(BIGQUERY_EXPORT.md の 4 章)の手本。元データは spu.sql と同じ(`{src}`)。
-- 元の在庫の表は、1 時間に数回、SKU ごとの行が追記される(スナップショット)。最新の 1 行だけを出す。
-- ビューなので、CCP の設定 BQ_SKU_STOCK_WATCH に、元の在庫の表(`{src}.t_inventory`)を指定する。
SELECT
  CASE v.cntry WHEN 'JPN' THEN 'JP' WHEN 'USA' THEN 'US' END AS market,
  v.item_cd AS sku_code,
  -- 販売できる数 = 手元の数 − 引き当て済み
  GREATEST(v.on_hand - v.allocated, 0) AS stock,
  v.snap_ts AS as_of
FROM `{src}.t_inventory` AS v
JOIN `{src}.m_item` AS i USING (item_cd)
WHERE i.status_flg = 'ACTIVE'
QUALIFY ROW_NUMBER() OVER (PARTITION BY v.item_cd ORDER BY v.snap_ts DESC) = 1
