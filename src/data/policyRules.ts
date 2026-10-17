// 表 policy_rules(ルール系の決まり)の読み込み。書き込みは、サーバーの取り込み(/api/policies)だけ。
import { makeService } from '../gcp/services'
import type { PolicyRule } from '../models/policyRules'

interface Result<T> {
  success: boolean
  data?: T
  error?: { message: string }
}

const svc = makeService('policy_rules')

export const PolicyRulesService = {
  getAll: (options?: { filter?: string; orderBy?: string[]; top?: number }) => svc.getAll(options) as Promise<Result<PolicyRule[]>>,
}
