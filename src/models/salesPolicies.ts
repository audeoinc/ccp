// 表 sales_policies(販売系の方針。週ごと・市場ごと。docs/POLICY.md の 3.1、CSV の形は docs/POLICY_FORMAT.md の 2 章)の、1 行の型。
// 列を変えたら、server/schema.json と一緒に直す。画面からは書き込まない(取り込みは server/ccp/policies.py。週ごとに置き換える)。

/** 何についての方針か。product = 商品 / category = カテゴリ / all = その週・市場の全体 */
export const SALES_SCOPES = ['product', 'category', 'all'] as const
export type SalesScope = (typeof SALES_SCOPES)[number]

/** 列 */
export interface SalesPolicyFields {
  /** 週の始まり(月曜。YYYY-MM-DD) */
  week_start?: string
  market?: string
  scope?: string
  /** product なら商品コード、category ならカテゴリの名前、all なら空 */
  target?: string
  stage?: string
  /** 1 が最も高い。空は普通 */
  priority?: number
  promo_period?: string
  /** その週の重点・重点の顧客(主に all) */
  focus?: string
  note?: string
  source_file?: string
  imported_at?: string
  state_code?: number
}

/** 読んだ 1 行 */
export interface SalesPolicy extends SalesPolicyFields {
  id: string
  created_on?: string
  modified_on?: string
}
