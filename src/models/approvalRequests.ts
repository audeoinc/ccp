// 表 approval_requests(承認の依頼。配信カード 1 本に対する 1 回分)の、1 行の型と選択肢。列を変えたら、server/schema.json と一緒に直す。
// 書き込みは、画面から直接ではなく、サーバーの窓口 /api/approvals(src/data/approvals.ts)で行う(docs/APPROVAL.md 4 章)

export const ApprovalRequestRule = {
  all: '全員',
  any: '1 人',
} as const
export type ApprovalRequestRule = keyof typeof ApprovalRequestRule

export const ApprovalRequestStatus = {
  /** 承認待ち */
  open: '依頼中',
  /** 決まりを満たした */
  approved: '承認済み',
  /** 1 人でも差し戻した(直して、依頼し直す) */
  changes_requested: '差し戻し',
  /** 内容が変わった・依頼し直したので、この依頼は古い(記録として残す) */
  stale: '古い依頼',
  /** 依頼した人が取り下げた */
  withdrawn: '取り下げ',
} as const
export type ApprovalRequestStatus = keyof typeof ApprovalRequestStatus

/** 書き込める列 */
export interface ApprovalRequestFields {
  delivery_card_id?: string
  /** 配信の名前(配信を消しても、記録が読めるように、その時の名前) */
  card_name?: string
  /** 依頼した人(users の id と、その時の名前) */
  requested_by?: string
  requested_by_name?: string
  rule?: ApprovalRequestRule
  status?: ApprovalRequestStatus
  requested_at?: string
  /** 承認済み・差し戻し・古い・取り下げ になった日時 */
  closed_at?: string
  /** 依頼のひとこと */
  note?: string
}

/** 読んだ 1 行 */
export interface ApprovalRequest extends ApprovalRequestFields {
  id: string
  created_on?: string
  modified_on?: string
}
