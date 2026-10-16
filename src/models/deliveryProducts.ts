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
