// 表 ad_spends(外部広告の出稿の記録。X49)の、1 行の型と選択肢。列を変えたら、server/schema.json と一緒に直す。
// 1 行 = 1 日・1 商品・1 媒体。いまは見本(server/ccp/ads.py・src/mock/ads.ts)。あとで BigQuery か CSV から取り込む

export const AdSpendMarket = {
  JP: 'JP',
  US: 'US',
} as const
export type AdSpendMarket = keyof typeof AdSpendMarket

export const AdSpendMedia = {
  google_shopping: 'Google ショッピング',
  google_search: 'Google 検索',
  meta: 'Meta',
  tiktok: 'TikTok',
} as const
export type AdSpendMedia = keyof typeof AdSpendMedia

/** 書き込める列 */
export interface AdSpendFields {
  /** 出稿した日(YYYY-MM-DD) */
  date?: string
  market?: AdSpendMarket
  product_code?: string
  media?: AdSpendMedia
  campaign?: string
  impressions?: number
  clicks?: number
  /** 費用(市場の通貨) */
  spend?: number
  /** 広告経由の購入の数と売上 */
  conversions?: number
  revenue?: number
}

/** 読んだ 1 行 */
export interface AdSpend extends AdSpendFields {
  id: string
  created_on?: string
}
