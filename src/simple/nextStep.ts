import { statusRank } from '../status'

/** 次にやることの種類(ステータスから 1 つ。docs/SIMPLE_CARD.md の 9 章) */
export type NextStep = 'check' | 'requestApproval' | 'watchApproval' | 'requestProduction' | 'openProduction'

export function nextStepOf(c: { status: string; aiUnchecked: boolean; handedOff: boolean }): NextStep {
  if (c.aiUnchecked) return 'check'
  if (c.handedOff) return 'openProduction'
  // 比べるときは、文字のままではなく statusRank で(確定 confirmed も承認済みより後として扱う)
  if (statusRank(c.status) >= statusRank('approved')) return 'requestProduction'
  if (statusRank(c.status) >= statusRank('reviewing')) return 'watchApproval'
  return 'requestApproval'
}
