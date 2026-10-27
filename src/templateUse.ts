// テンプレートの最近の使用回数(X4。配信カードの ② テンプレートで選ぶとき)。
// 同じ国の配信のうち、取りやめていないものを数える。どの版を使っていても、同じテンプレートとして数える(管理画面の「N 本で使用」と同じ)
import { baseTemplateId, currentVersion, getTemplate, hasTemplate, splitTemplateKey, templateIdOfCard, type EmailTemplateId } from './templates'
import { appliesIn } from './countryApply'
import { weekKeyOf } from './weekLock'

/** テンプレートごとの使い方 */
export interface TemplateUse {
  /** この配信の配信日の前 4 週間(28 日)に使った配信の数 */
  recent: number
  /** この配信と同じ週に使っている配信の数(この配信は除く) */
  sameWeek: number
  /** この配信日より前で、最後に使った配信日(YYYY-MM-DD) */
  last?: string
}

export const RECENT_DAYS = 28

interface CardLike {
  id: string
  layout_key?: string
  channel?: string
  email_template?: string
  scheduled_at?: string
  country?: string
  cancelled_at?: string | null
}

/** 配信日 at(なければ今日)・国 country を基準に、テンプレートごとの最近の使い方を数える。exceptId の配信(いま開いている配信)は数えない */
export function templateUse(cards: CardLike[], at: string | undefined, country: string | undefined, exceptId?: string): Map<string, TemplateUse> {
  const base = at ? new Date(at) : new Date()
  const from = new Date(base.getTime() - RECENT_DAYS * 86400000)
  const week = weekKeyOf(base)
  const out = new Map<string, TemplateUse>()
  for (const c of cards) {
    if (c.id === exceptId || c.cancelled_at || !c.scheduled_at) continue
    if (country && c.country && c.country !== country) continue
    const d = new Date(c.scheduled_at)
    const id = templateIdOfCard(c)
    const u = out.get(id) ?? { recent: 0, sameWeek: 0 }
    if (weekKeyOf(d) === week) u.sameWeek++
    if (d < base) {
      if (d >= from) u.recent++
      const ymd = c.scheduled_at.slice(0, 10)
      if (!u.last || ymd > u.last) u.last = ymd
    }
    out.set(id, u)
  }
  return out
}

/**
 * この配信のテンプレートが、前の版・使わない(無効)・この国で使わない(ST1)のどれかなら、その様子。どれでもなければ null。
 * どれも選択肢の一覧には出ないので、選ぶ所の上に別に出して知らせる
 */
export function templateKeyState(template: EmailTemplateId, country?: string) {
  const cur = getTemplate(template)
  const { id: base, version } = splitTemplateKey(template)
  const old = version !== undefined
  const offCountry = !appliesIn('template', baseTemplateId(template), country)
  if (!old && !cur.hidden && !offCountry) return null
  return { cur, base, version, old, latest: currentVersion(base), canUpdate: old && hasTemplate(base) && !getTemplate(base).hidden }
}
export type TemplateKeyState = NonNullable<ReturnType<typeof templateKeyState>>
