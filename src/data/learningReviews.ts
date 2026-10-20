// 表「学びの判定」(server/schema.json の learning_reviews)。学び(過去の配信の「次に生かすメモ」)ごとに、残す・様子を見る・外す を人が決める。
// 外した学びは、配信カードの「これまでの学び」にも、AI への依頼にも渡さない(効かない学びを淘汰するため)。学び 1 つにつき 1 行。
import { tableService } from '../gcp/services'

export const LearningReviewStatus = {
  keep: '残す',
  watch: '様子を見る',
  retired: '外した',
} as const
export type LearningReviewStatus = keyof typeof LearningReviewStatus

export interface LearningReviewFields {
  /** 学びの id(配信結果 delivery_results の id。メモ 1 つ = 学び 1 つ) */
  learning_id?: string
  status?: LearningReviewStatus
  /** 決めた理由(数字の要約など) */
  reason?: string
  decided_by?: string
  decided_at?: string
}

export interface LearningReview extends LearningReviewFields {
  id: string
  created_on?: string
}

export const LearningReviewsService = tableService<LearningReview, LearningReviewFields>('learning_reviews')
