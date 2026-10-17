// 表 approval_requests の読み書き。サーバーの /api/data/approval_requests を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { ApprovalRequest, ApprovalRequestFields } from '../models/approvalRequests'
import { tableService } from '../gcp/services'

export const ApprovalRequestsService = tableService<ApprovalRequest, ApprovalRequestFields>('approval_requests')
