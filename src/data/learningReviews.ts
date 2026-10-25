// 表「学びの判定」(server/schema.json の learning_reviews)。学び(過去の配信の「次に生かすメモ」)ごとに、残す・様子を見る・外す・休ませる を人が決める。
// 外した学びは、配信カードの「これまでの学び」にも、AI への依頼にも渡さない(効かない学びを淘汰するため)。
// 休ませた学び(X78)も、自動では配信に付けず AI に渡さないが、学びの一覧(手札)には残す(季節が外れた学びなどを、あとで戻せるように)。
// 判定は学びと国の組ごと(ST5。国で客層が違い、ある国で効く学びが、ほかの国でも効くとは限らないため)。決め直すたびに行を足し、新しい行が今の判定。
import { tableService } from '../gcp/services'

export const LearningReviewStatus = {
  keep: '残す',
  watch: '様子を見る',
  retired: '外した',
  resting: '休ませる',
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
  /** どの国での判定か。空の行は国を分ける前の判定で、学びの出元の国の判定として読む */
  country?: string
}

export interface LearningReview extends LearningReviewFields {
  id: string
  created_on?: string
}

export const LearningReviewsService = tableService<LearningReview, LearningReviewFields>('learning_reviews')
