import { statusRank } from '../status'

/** 次にやることの種類(ステータスから 1 つ。docs/SIMPLE_CARD.md の 9 章) */
export type NextStep = 'requestApproval' | 'watchApproval' | 'requestProduction' | 'openProduction'

// AI でまとめて作った中身の「確認した」はやめた(人の確認は承認で担う。2026-10-24 SU7)
export function nextStepOf(c: { status: string; handedOff: boolean }): NextStep {
  if (c.handedOff) return 'openProduction'
  // 比べるときは、文字のままではなく statusRank で(確定 confirmed も承認済みより後として扱う)
  if (statusRank(c.status) >= statusRank('approved')) return 'requestProduction'
  if (statusRank(c.status) >= statusRank('reviewing')) return 'watchApproval'
  return 'requestApproval'
}
