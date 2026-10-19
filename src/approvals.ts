// 承認の依頼の判定(バックログ U4。docs/APPROVAL.md 2 章の決まり)。React もデータも使わない、純粋な関数だけ。
// 同じ判定を、サーバー(server/ccp/approvals.py)でも行う。2 つがずれないよう、server/tests/approval_cases.json の例を
// 両方で確かめる(Python は server/tests/test_approvals.py、こちらは scripts/check-approvals.mjs。npm run verify に含む)

export type ApprovalRule = 'all' | 'any'
export type ReviewerDecision = 'pending' | 'approved' | 'changes_requested'
export type RequestOutcome = 'open' | 'approved' | 'changes_requested'

export interface ReviewerLike {
  id: string
  user_id?: string | null
  approval_group_id?: string | null
  decision?: ReviewerDecision | null
}

/**
 * 依頼の結果。1 人でも差し戻したら止める(決まりが「1 人」でも)。
 * 全員 = 相手のそれぞれから承認が要る、1 人 = だれか 1 人の承認でよい
 */
export function requestOutcome(rule: ApprovalRule, decisions: (ReviewerDecision | null | undefined)[]): RequestOutcome {
  if (decisions.some((d) => d === 'changes_requested')) return 'changes_requested'
  if (decisions.length === 0) return 'open'
  const approved = decisions.filter((d) => d === 'approved').length
  return (rule === 'any' ? approved >= 1 : approved === decisions.length) ? 'approved' : 'open'
}

/**
 * その人が決められる、まだ未定の相手(行の id)。本人を指名した行 → 所属するグループの行の順(1 回の承認は 1 つの行の分だけ)。
 * 依頼した本人も、自分の依頼を承認できる(2026-10-19 に利用者の判断で変えた: 先に進めたいときに、自分で承認してよい。以前は承認できなかった)。
 * requesterId は、呼び出し側の形をそろえるために残している
 */
export function eligibleReviewers(reviewers: ReviewerLike[], actorId: string, actorGroupIds: Iterable<string>, requesterId?: string | null): string[] {
  void requesterId
  if (!actorId) return []
  const groups = new Set(actorGroupIds)
  const pending = reviewers.filter((r) => (r.decision ?? 'pending') === 'pending')
  const direct = pending.filter((r) => r.user_id === actorId)
  const viaGroup = pending.filter((r) => !r.user_id && r.approval_group_id && groups.has(r.approval_group_id))
  return [...direct, ...viaGroup].map((r) => r.id)
}

/** 依頼の相手の一覧から、グループと人の id の配列を読む(approval_rules の JSON の列) */
export function parseIds(json?: string | null): string[] {
  if (!json) return []
  try {
    const v: unknown = JSON.parse(json)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
