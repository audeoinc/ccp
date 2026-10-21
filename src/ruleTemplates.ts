// マーケティングの決まりの、画面で足すときのひな形(X61)
import type { RuleInput } from './data/policyEdit'

/** 週の上限の決まりの、ひな形(X61: 利用者の要望「週の上限を決まりでも設定したい」) */
export const LIMIT_TEMPLATE: RuleInput = {
  rule_id: 'R-LIMIT-001',
  title: '同じ商品は週 2 回まで',
  applies_to: 'selection',
  strength: 'must',
  market: '',
  channel: '',
  check_spec: '上限 週 2 回',
  body: '同じ商品を、同じ週に 3 本以上の配信に載せない(A/B テストの B・C 案も数える)。',
}

