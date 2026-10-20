// 表「AI の依頼の記録」(server/schema.json の ai_runs)。配信カードで AI の案を頼んだときに、どの学び(これまでの学び)を渡したかを残す。
// 学びを渡した配信と渡さなかった配信、AI の案をそのまま使った配信と人が直した配信を、あとで比べるため(結果の面の「効果」)。
// AI の案そのものは保存しない(CLAUDE.md の約束)。残すのは、渡した学びの id と、案の扱いだけ。
import { tableService } from '../gcp/services'

export const AiRunAdoption = {
  as_is: 'そのまま採用',
  edited: '人が直した',
  rejected: '使わなかった',
} as const
export type AiRunAdoption = keyof typeof AiRunAdoption

export interface AiRunFields {
  delivery_card_id?: string
  /** AI の依頼の種類(suggest_theme・select_products など) */
  task?: string
  /** 渡した学びの id(JSON の配列。学びの id は、配信結果 delivery_results の id)。空の配列 = 学びを渡さなかった */
  learning_ids?: string
  /** 案の扱い。空 = まだ分からない */
  adoption?: AiRunAdoption
  /** 1 = 見本の行(見本を作り直すときに、この行だけを消す) */
  sample?: number
}

export interface AiRun extends AiRunFields {
  id: string
  created_on?: string
}

// 撮影用のビルドでは、このファイルはサービスだけの身代わりに差し替わる。ほかの関数・定数は、ここに置かない(src/impact.ts に置く)
export const AiRunsService = tableService<AiRun, AiRunFields>('ai_runs')
