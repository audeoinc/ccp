// 表 policy_rules(ルール系の決まり。docs/POLICY.md の 3.2、取り込むファイルの形は docs/POLICY_FORMAT.md の 3 章)の、1 行の型。
// 列を変えたら、server/schema.json と一緒に直す(scripts/check-schema.mjs が食い違いを見つける)。
// 書き込みは server/ccp/policies.py だけ(取り込みはファイルごとに置き換える。画面で足す・直す・消すのは /api/policies/rules。X61)。

/** 決まりが効く依頼(POLICY.md の 4 章) */
export const RULE_TARGETS = ['theme', 'selection', 'hero', 'headline', 'copy', 'instructions', 'schedule'] as const
export type RuleTarget = (typeof RULE_TARGETS)[number]

/** 強さ。must = 必ず守る / should = なるべく / info = 背景として知っておく */
export const RULE_STRENGTHS = ['must', 'should', 'info'] as const
export type RuleStrength = (typeof RULE_STRENGTHS)[number]

/** 列 */
export interface PolicyRuleFields {
  /** 決まりの番号(ファイルをまたいで重ならないもの) */
  rule_id?: string
  title?: string
  /** 効く依頼。`,` 区切り(theme,selection など) */
  applies_to?: string
  strength?: string
  /** 市場。`,` 区切り。空はすべて */
  market?: string
  /** email / app。空は両方 */
  channel?: string
  period_start?: string
  period_end?: string
  /** 機械で確かめる書き方(含めない / 含める / 除く / 上限)。空は AI に伝えるだけ */
  check_spec?: string
  /** 決まりの本文(AI にそのまま渡す) */
  body?: string
  /** 取り込んだファイルの名前(版)。画面で足した決まりは「画面で作成」 */
  source_file?: string
  /** ファイルの中の順 */
  sort_order?: number
  imported_at?: string
  /** 画面で足した・直した日時と人(X61。取り込んだままの決まりは空。同じファイルを取り込み直すと、空に戻る) */
  edited_at?: string
  edited_by?: string
  state_code?: number
}

/** 読んだ 1 行 */
export interface PolicyRule extends PolicyRuleFields {
  id: string
  created_on?: string
  modified_on?: string
}
