// 表 delivery_products の、1 行の型と選択肢。列を変えたら、server/schema.json と一緒に直す(scripts/check-schema.mjs が食い違いを見つける)。

export const DeliveryProductSource = {
  ai: 'AI',
  manual: '手動',
} as const
export type DeliveryProductSource = keyof typeof DeliveryProductSource

export const DeliveryProductState = {
  selected: '選定',
  candidate: '候補',
} as const
export type DeliveryProductState = keyof typeof DeliveryProductState

/** 書き込める列 */
export interface DeliveryProductFields {
  name: string
  reason?: string
  section?: number
  sort_order?: number
  source?: DeliveryProductSource
  state?: DeliveryProductState
  /** AB テストの案('B'・'C'。空は A = いまの配信そのもの。X55) */
  variant?: string
  /** この配信で使う商品の画像(空 = 商品のマスタの画像。X64)。/api/creative/files/… か /sample-shop/img/…、写せなかったときは元の URL */
  image_url?: string
  /** その画像を選んだ元(商品ページの URL など。どこから持ってきたかを残す) */
  image_source?: string
  /** 載る箱の部品 ID(表のテンプレートのときだけ。分析のために書くだけで、画面はテンプレートと並び順から求める。T8 段階 6) */
  part_id?: string
  /** delivery_cards の id(参照を外すときは null) */
  delivery_card_id?: string | null
  /** products の id(参照を外すときは null) */
  product_id?: string | null
  state_code?: number
}

/** 読んだ 1 行 */
export interface DeliveryProduct extends DeliveryProductFields {
  id: string
  source_name?: string
  state_name?: string
  created_on?: string
  modified_on?: string
}
