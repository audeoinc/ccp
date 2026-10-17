// 表 approval_group_members(だれが、どの承認グループにいるか)の、1 行の型。列を変えたら、server/schema.json と一緒に直す。
// 1 人が複数のグループに入ってよい(その人の 1 回の承認は、1 グループ分と数える。docs/APPROVAL.md)

/** 書き込める列 */
export interface ApprovalGroupMemberFields {
  approval_group_id: string
  user_id: string
}

/** 読んだ 1 行 */
export interface ApprovalGroupMember extends ApprovalGroupMemberFields {
  id: string
  created_on?: string
}
