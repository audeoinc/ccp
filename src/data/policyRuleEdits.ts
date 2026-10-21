// 表 policy_rule_edits(決まりを画面で直した記録。X61)の読み込み。書き込みは、サーバー(/api/policies/rules)だけ。
import { makeService } from '../gcp/services'
import type { PolicyRuleEdit } from '../models/policyRuleEdits'

interface Result<T> {
  success: boolean
  data?: T
  error?: { message: string }
}

const svc = makeService('policy_rule_edits')

export const PolicyRuleEditsService = {
  getAll: (options?: { filter?: string; orderBy?: string[]; top?: number }) => svc.getAll(options) as Promise<Result<PolicyRuleEdit[]>>,
}
