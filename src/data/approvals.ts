// 承認の依頼・承認・差し戻し・取り下げ(バックログ U4)。サーバーの窓口 /api/approvals(server/ccp/approvals.py)を呼ぶ。
// 表(approval_requests・approval_reviewers)を画面から直接書かないのは、本人の確かめと、まとめての更新をサーバーで行うため(docs/APPROVAL.md 4 章)。
// 読むだけなら、表ごとのサービス(ApprovalRequestsService・ApprovalReviewersService)でよい。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、src/mock/approvals.ts(同じ判定をメモリ上で行う)に差し替える。
import { callApi } from '../gcp/services'
import type { ApprovalRequest, ApprovalRequestRule } from '../models/approvalRequests'
import type { ApprovalReviewer } from '../models/approvalReviewers'

export interface Actor {
  /** users の id */
  id: string
  name: string
}

export interface ApprovalView {
  request: ApprovalRequest
  reviewers: ApprovalReviewer[]
}

export interface RequestInput {
  delivery_card_id: string
  actor: Actor
  rule: ApprovalRequestRule
  group_ids: string[]
  user_ids: string[]
  note?: string
  /** 履歴に残す、配信の週(YYYY-MM-DD。画面の週の初めの計算に合わせるため、画面が渡す) */
  week_start?: string
}

export interface DecideInput {
  actor: Actor
  decision: 'approved' | 'changes_requested'
  /** どの相手の分として決めるか(省略は、決められる最初の相手) */
  reviewer_id?: string
  note?: string
  week_start?: string
}

interface Result<T> {
  success: boolean
  data?: T
  error?: { message: string; code?: string }
}

// 書いた人の印・混み合いのやり直しは、表の読み書きと同じ呼び方に任せる
const post = <T>(path: string, body: unknown) => callApi<T>('POST', `/api/approvals${path}`, body) as Promise<Result<T>>

export const ApprovalsService = {
  request: (input: RequestInput) => post<ApprovalView>('/requests', input),
  decide: (requestId: string, input: DecideInput) => post<ApprovalView>(`/requests/${encodeURIComponent(requestId)}/decide`, input),
  withdraw: (requestId: string, input: { actor: Actor; note?: string; week_start?: string }) => post<ApprovalView>(`/requests/${encodeURIComponent(requestId)}/withdraw`, input),
  /** 内容が変わったので、いまの依頼を古いものにする(配信のステータス・履歴は、保存の側で書く) */
  reset: (input: { delivery_card_id: string }) => post<{ stale: number }>('/reset', input),
}
