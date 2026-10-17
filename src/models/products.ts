// 表 products の、1 行の型と選択肢。列を変えたら、server/schema.json と一緒に直す(scripts/check-schema.mjs が食い違いを見つける)。

export const ProductCategory = {
  outer: 'アウター',
  tops: 'トップス',
  bottoms: 'ボトムス',
  shoes: 'シューズ',
  accessories: '小物',
  bags: 'バッグ',
  home: 'ホーム',
} as const
export type ProductCategory = keyof typeof ProductCategory

export const ProductSeason = {
  autumn: '秋',
  winter: '冬',
  autumn_winter: '秋冬',
  all_year: '通年',
} as const
export type ProductSeason = keyof typeof ProductSeason

export const ProductSalesTrend = {
  up: '上昇',
  flat: '横ばい',
  down: '下降',
} as const
export type ProductSalesTrend = keyof typeof ProductSalesTrend

export const ProductWeather = {
  sunny: '晴れ',
  rainy: '雨の日',
  cold: '寒い日',
} as const
export type ProductWeather = keyof typeof ProductWeather

export const ProductMarket = {
  JP: 'JP',
  US: 'US',
} as const
export type ProductMarket = keyof typeof ProductMarket

/** 書き込める列 */
export interface ProductFields {
  name: string
  product_code?: string
  category?: ProductCategory
  price?: number
  stock?: number
  season?: ProductSeason
  sales_trend?: ProductSalesTrend
  rating?: number
  weather?: ProductWeather
  description?: string
  image_url?: string
  market?: ProductMarket
  // ここから下は、BigQuery の SPU の出力から取り込む列(docs/BIGQUERY_EXPORT.md の 2 章)。画面からは書かない
  /** カテゴリの階層(上の段から ' > ' でつないだもの) */
  category_path?: string
  units_4w?: number
  revenue_4w?: number
  /** 直近 4 週の売上 ÷ 前年の同じ 4 週 */
  revenue_yoy?: number
  views_4w?: number
  /** 直近 4 週の購入率(0〜1) */
  cvr_4w?: number
  review_count?: number
  last_review_at?: string
  review_texts?: string
  /** 暑い日・寒い日・雨の日の売上の増減(+0.3 = +30%) */
  lift_hot?: number
  lift_cold?: number
  lift_rain?: number
  hot_days?: number
  cold_days?: number
  rain_days?: number
  /** spu / category(データが少ないので、カテゴリの値で補った) */
  weather_basis?: string
  /** BigQuery 側のデータの時点 */
  as_of?: string
  /** レビューの要約(取り込みのときに Gemini で作る。B5) */
  review_summary?: string
  /** レビューのキーワード(要約と同じ呼び出しで作る。B5)。JSON の文字 `[{term, sentiment: 'good' | 'bad'}]`。読むときは `reviewKeywords(p)` */
  review_keywords?: string
  /** 要約を作ったときの「件数|最新の日時」(変わったら作り直す) */
  review_summary_basis?: string
  state_code?: number
}

/** 読んだ 1 行 */
export interface Product extends ProductFields {
  id: string
  category_name?: string
  season_name?: string
  sales_trend_name?: string
  weather_name?: string
  market_name?: string
  created_on?: string
  modified_on?: string
}
