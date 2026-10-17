// 表 weather_forecast(BigQuery から取り込む天気予報。市場ごとの代表の 1 地点)の、1 行の型。列を変えたら、server/schema.json と一緒に直す。

/** 列 */
export interface WeatherForecastFields {
  market?: string
  /** 予報の対象の日(YYYY-MM-DD) */
  date?: string
  temp_max?: number
  temp_min?: number
  /** 降水確率(0〜100) */
  precip_prob?: number
  /** sunny / cloudy / rain / snow */
  weather?: string
  issued_at?: string
  state_code?: number
}

/** 読んだ 1 行 */
export interface WeatherForecast extends WeatherForecastFields {
  id: string
  created_on?: string
  modified_on?: string
}
