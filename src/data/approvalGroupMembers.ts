// 表 approval_group_members の読み書き。サーバーの /api/data/approval_group_members を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { ApprovalGroupMember, ApprovalGroupMemberFields } from '../models/approvalGroupMembers'
import { tableService } from '../gcp/services'

export const ApprovalGroupMembersService = tableService<ApprovalGroupMember, ApprovalGroupMemberFields>('approval_group_members')
