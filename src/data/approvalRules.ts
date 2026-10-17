// 表 approval_rules の読み書き。サーバーの /api/data/approval_rules を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { ApprovalRule, ApprovalRuleFields } from '../models/approvalRules'
import { tableService } from '../gcp/services'

export const ApprovalRulesService = tableService<ApprovalRule, ApprovalRuleFields>('approval_rules')
