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
  /** 出どころ(自社撮影 / 取引先から / 素材サイト / その他 と、ひとこと。上げた画像。X59) */
  source?: string
  /** 使える期限(YYYY-MM-DD。過ぎたら、選ぶ候補・AI の候補から外す。空は期限なし) */
  usable_until?: string | null
  /** 焦点(いちばん見せたい場所。0〜1、左上が 0,0。テンプレートの縦横比に合わせて切り出すときの中心) */
  focal_x?: number | null
  focal_y?: number | null
  /** 上げた人と、最初に使った配信(delivery_cards の id。参照にはしない) */
  uploaded_by?: string
  first_card_id?: string
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
