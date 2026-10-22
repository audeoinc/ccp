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

/** 商品の性別(BigQuery の SPU の gender。配信の対象の性別で、商品の候補を絞る。src/target.ts) */
export const ProductGender = {
  mens: 'メンズ',
  womens: 'ウィメンズ',
  unisex: 'ユニセックス',
} as const
export type ProductGender = keyof typeof ProductGender

/** 書き込める列 */
export interface ProductFields {
  name: string
  product_code?: string
  category?: ProductCategory
  price?: number
  /** 元の価格(セールの前の価格。任意)。テンプレートの箱で「セール」の見せ方を選んだとき、取り消し線で出す */
  regular_price?: number
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
  /** 性別(mens / womens / unisex)。ない商品は、どの対象にも出す */
  gender?: ProductGender
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
