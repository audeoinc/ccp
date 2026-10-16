// 表 ai_requests の、1 行の型と選択肢。列を変えたら、server/schema.json と一緒に直す(scripts/check-schema.mjs が食い違いを見つける)。

export const AiRequestStatus = {
  waiting: '待機中',
  done: '完了',
  error: 'エラー',
} as const
export type AiRequestStatus = keyof typeof AiRequestStatus

/** 書き込める列 */
export interface AiRequestFields {
  name: string
  prompt?: string
  response?: string
  status?: AiRequestStatus
  state_code?: number
}

/** 読んだ 1 行 */
export interface AiRequest extends AiRequestFields {
  id: string
  status_name?: string
  created_on?: string
  modified_on?: string
}
