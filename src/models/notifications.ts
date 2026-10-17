// 表 notifications(通知の送る箱。バックログ U5。docs/APPROVAL.md)の、1 行の型と選択肢。列を変えたら、server/schema.json と一緒に直す。
// 承認の操作のたびに、サーバー(server/ccp/approvals.py)がここへ行を積む。実際にメールを送る仕組みは、まだない(U8。pending のまま残る)。
// 外につながらない環境(Workbench)でも困らないよう、積むだけで、送れなくても操作は止めない

export const NotificationKind = {
  /** 承認を依頼された(承認者・グループのメンバーへ) */
  review_requested: '承認の依頼',
  /** 承認がそろった(依頼した人へ) */
  approved: '承認された',
  /** 差し戻された(依頼した人へ) */
  changes_requested: '差し戻された',
  /** 依頼が取り下げられた(まだ決めていない承認者へ) */
  withdrawn: '依頼の取り下げ',
} as const
export type NotificationKind = keyof typeof NotificationKind

export const NotificationStatus = {
  pending: '未送信',
  sent: '送信済み',
  skipped: '送らない',
} as const
export type NotificationStatus = keyof typeof NotificationStatus

/** 書き込める列 */
export interface NotificationFields {
  /** 宛先のユーザー(users の id)と、積んだ時点のメールアドレス */
  user_id?: string
  email?: string
  kind?: NotificationKind
  subject?: string
  body?: string
  delivery_card_id?: string
  approval_request_id?: string
  status?: NotificationStatus
  sent_at?: string
}

/** 読んだ 1 行 */
export interface Notification extends NotificationFields {
  id: string
  created_on?: string
  modified_on?: string
}
