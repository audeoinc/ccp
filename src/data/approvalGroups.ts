// 表 approval_groups の読み書き。サーバーの /api/data/approval_groups を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { ApprovalGroup, ApprovalGroupFields } from '../models/approvalGroups'
import { tableService } from '../gcp/services'

export const ApprovalGroupsService = tableService<ApprovalGroup, ApprovalGroupFields>('approval_groups')
