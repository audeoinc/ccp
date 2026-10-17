// 表 approval_reviewers(依頼の相手ごとの状態。グループか人のどちらか)の、1 行の型と選択肢。列を変えたら、server/schema.json と一緒に直す。
// グループへの依頼は、グループのだれか 1 人が決めれば済み。だれが決めたかを decided_by に残す(docs/APPROVAL.md)

export const ApprovalReviewerDecision = {
  pending: '未定',
  approved: '承認済み',
  changes_requested: '差し戻し',
} as const
export type ApprovalReviewerDecision = keyof typeof ApprovalReviewerDecision

/** 書き込める列 */
export interface ApprovalReviewerFields {
  approval_request_id?: string
  /** 依頼の相手がグループのとき */
  approval_group_id?: string
  /** 依頼の相手が人のとき */
  user_id?: string
  /** 相手の名前(グループ名か人の名前。消しても読めるように、その時の名前) */
  reviewer_name?: string
  decision?: ApprovalReviewerDecision
  /** 決めた人(users の id と、その時の名前) */
  decided_by?: string
  decided_by_name?: string
  decided_at?: string
  /** 差し戻しの理由など */
  note?: string
}

/** 読んだ 1 行 */
export interface ApprovalReviewer extends ApprovalReviewerFields {
  id: string
  created_on?: string
  modified_on?: string
}
