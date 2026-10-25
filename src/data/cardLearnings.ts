// 表「配信の学びの装備」(server/schema.json の card_learnings。X78)。配信カードで、学びを付けた・外したことを残す。
// 行がなければ、いまの自動の選び方(同じチャネルで、同じテンプレートか同じ種類の学び)のまま。人が変えたものだけを持つ。
// 変えるたびに 1 行足す(配信と学びの組で、いちばん新しい行が、いまの値。country_applications と同じ形)。
import { tableService } from '../gcp/services'

export const CardLearningMode = {
  equip: '付けた',
  unequip: '外した',
} as const
export type CardLearningMode = keyof typeof CardLearningMode

export interface CardLearningFields {
  delivery_card_id?: string
  /** 学びの id(配信結果 delivery_results の id) */
  learning_id?: string
  mode?: CardLearningMode
  changed_by?: string
}

export interface CardLearning extends CardLearningFields {
  id: string
  created_on?: string
}

// 撮影用のビルドでは、このファイルはサービスだけの身代わりに差し替わる。ほかの関数は src/learningEquip.ts に置く
export const CardLearningsService = tableService<CardLearning, CardLearningFields>('card_learnings')
