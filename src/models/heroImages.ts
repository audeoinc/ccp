// 表 hero_images の、1 行の型と選択肢。列を変えたら、server/schema.json と一緒に直す(scripts/check-schema.mjs が食い違いを見つける)。

export const HeroImagePurpose = {
  new: '新作',
  feature: '特集',
  sale: 'セール',
  member: '会員',
  event: 'イベント',
} as const
export type HeroImagePurpose = keyof typeof HeroImagePurpose

export const HeroImageSeason = {
  autumn: '秋',
  winter: '冬',
  autumn_winter: '秋冬',
  all_year: '通年',
} as const
export type HeroImageSeason = keyof typeof HeroImageSeason

export const HeroImageMarket = {
  JP: 'JP',
  US: 'US',
} as const
export type HeroImageMarket = keyof typeof HeroImageMarket

/** 書き込める列 */
export interface HeroImageFields {
  name: string
  image_code?: string
  purpose?: HeroImagePurpose
  season?: HeroImageSeason
  tags?: string
  description?: string
  image_url?: string
  market?: HeroImageMarket
  state_code?: number
}

/** 読んだ 1 行 */
export interface HeroImage extends HeroImageFields {
  id: string
  purpose_name?: string
  season_name?: string
  market_name?: string
  created_on?: string
  modified_on?: string
}
