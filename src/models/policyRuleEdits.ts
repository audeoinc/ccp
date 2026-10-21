// 表 policy_rule_edits(マーケティングの決まりを、画面で直した記録。X61)の、1 行の型。書き込みはサーバー(server/ccp/policies.py)だけ。
// 列を変えたら、server/schema.json と一緒に直す(scripts/check-schema.mjs が食い違いを見つける)。

export interface PolicyRuleEditFields {
  /** 決まりの番号 */
  rule_id?: string
  /** create(足した)/ update(直した)/ delete(消した) */
  action?: string
  /** 前後の中身(JSON。足したときの前・消したときのあとは空) */
  before_value?: string
  after_value?: string
  /** 直した人(画面で選んだ「あなた」の名前) */
  actor?: string
  /** その決まりの置き場所(取り込んだファイルの名前、または「画面で作成」) */
  source_file?: string
  state_code?: number
}

/** 読んだ 1 行(created_on = 直した日時) */
export interface PolicyRuleEdit extends PolicyRuleEditFields {
  id: string
  created_on?: string
  modified_on?: string
}
