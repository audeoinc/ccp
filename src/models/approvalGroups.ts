// 表 approval_groups(承認グループ)の、1 行の型と選択肢。列を変えたら、server/schema.json と一緒に直す(scripts/check-schema.mjs が食い違いを見つける)。
// 承認の依頼の相手。グループのだれか 1 人が承認すれば、そのグループは済み(休みの人がいても止まらない。docs/APPROVAL.md)。
// 配信の種別(販促 / CRM / EC)とは分けて持つ(どの部署の配信か と、だれが承認するか は別のため)

export const ApprovalGroupStatus = {
  active: '有効',
  inactive: '無効',
} as const
export type ApprovalGroupStatus = keyof typeof ApprovalGroupStatus

/** 書き込める列 */
export interface ApprovalGroupFields {
  name: string
  description?: string
  status?: ApprovalGroupStatus
  /** 承認する国のコードの配列(JSON。ST4)。空はすべての国。あとで「管理地域」に広げるときも、この列で複数の国を指す */
  countries?: string
}

/** 読んだ 1 行 */
export interface ApprovalGroup extends ApprovalGroupFields {
  id: string
  created_on?: string
  modified_on?: string
}
