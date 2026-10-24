import { statusRank } from '../status'

/** 次にやることの種類(ステータスから 1 つ。docs/SIMPLE_CARD.md の 9 章)。review = 承認の段階(承認する・差し戻す) */
export type NextStep = 'requestApproval' | 'review' | 'requestProduction' | 'openProduction'

// AI でまとめて作った中身の「確認した」はやめた(人の確認は承認で担う。2026-10-24 SU7)
export function nextStepOf(c: { status: string; handedOff: boolean }): NextStep {
  if (c.handedOff) return 'openProduction'
  // 比べるときは、文字のままではなく statusRank で(確定 confirmed も承認済みより後として扱う)
  if (statusRank(c.status) >= statusRank('approved')) return 'requestProduction'
  if (statusRank(c.status) >= statusRank('reviewing')) return 'review'
  return 'requestApproval'
}

/**
 * 右上の青いボタンに出す、自分がやること(SU11。2026-10-24 利用者と決めた)。ないときは null で、ボタンを出さない。
 * 承認の様子を見るだけのボタンにはしない(上の帯の承認の札が担う)。
 * 承認に出すのは作った人(担当)だけ。差し戻されたら、作った人が直して依頼し直す。承認の段階では、承認する番の人だけ
 */
export function myNextStep(step: NextStep, me: { author: boolean; myTurn: boolean; changesRequested: boolean }): NextStep | null {
  if (step === 'review') return me.myTurn ? 'review' : me.changesRequested && me.author ? 'requestApproval' : null
  if (step === 'requestApproval') return me.author ? step : null
  return step
}
