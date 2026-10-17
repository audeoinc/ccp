-- 天気予報の出力(BIGQUERY_EXPORT.md の 6 章)の手本。元データは spu.sql と同じ(`{src}`)。
-- 元の表は、予報が出るたびに行が追記される。1 つの日付に予報が複数あれば、いちばん新しいものだけを出す。
SELECT
  CASE cntry WHEN 'JPN' THEN 'JP' WHEN 'USA' THEN 'US' END AS market,
  fcst_dt AS date,
  tmax_c AS temp_max,
  tmin_c AS temp_min,
  pop_pct AS precip_prob,
  -- 元の天気のコード(100 晴れ / 200 曇り / 300 雨 / 400 雪)を、仕様の値に直す
  CASE DIV(wx_cd, 100) WHEN 1 THEN 'sunny' WHEN 2 THEN 'cloudy' WHEN 3 THEN 'rain' WHEN 4 THEN 'snow' END AS weather,
  issued_ts AS issued_at
FROM `{src}.t_weather_fcst`
WHERE fcst_dt >= CURRENT_DATE('Asia/Tokyo')
QUALIFY ROW_NUMBER() OVER (PARTITION BY cntry, fcst_dt ORDER BY issued_ts DESC) = 1
