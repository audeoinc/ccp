// 表 approval_reviewers の読み書き。サーバーの /api/data/approval_reviewers を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { ApprovalReviewer, ApprovalReviewerFields } from '../models/approvalReviewers'
import { tableService } from '../gcp/services'

export const ApprovalReviewersService = tableService<ApprovalReviewer, ApprovalReviewerFields>('approval_reviewers')
