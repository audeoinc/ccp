// 表 approval_rules(種別ごとの、既定の承認者と決まり)の、1 行の型と選択肢。列を変えたら、server/schema.json と一緒に直す。
// 配信カードで「承認を依頼」を押したときの最初の値になる(依頼のときに足し引きできる。docs/APPROVAL.md)

export const ApprovalRuleRule = {
  /** 指名したグループ・人の、それぞれから 1 人ずつ承認が要る */
  all: '全員',
  /** 指名した中の、だれか 1 人が承認すればよい */
  any: '1 人',
} as const
export type ApprovalRuleRule = keyof typeof ApprovalRuleRule

/** 書き込める列 */
export interface ApprovalRuleFields {
  /** 配信の種別(delivery_cards.department の値)。1 種別に 1 行 */
  department?: string
  /** 国のコード(ST4)。空は、すべての国の共通の決まり。国の行があれば、その国の配信はそちらを使う */
  country?: string
  rule?: ApprovalRuleRule
  /** 既定の承認グループの id の配列(JSON) */
  group_ids?: string
  /** 既定の承認者(人)の id の配列(JSON) */
  user_ids?: string
}

/** 読んだ 1 行 */
export interface ApprovalRule extends ApprovalRuleFields {
  id: string
  created_on?: string
  modified_on?: string
}
