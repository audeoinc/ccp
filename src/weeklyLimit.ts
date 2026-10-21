// 週の上限(同じ商品を、同じ週に何本の配信まで載せてよいか。C3)。
// 決め方(利用者と決めた 2026-10-21): マーケティングの決まり(⚙ の「方針・決まり」)に「上限 週 N 回」があり、配信の国・チャネル・配信日に当てはまれば、それを使う。
// なければ、⚙ のアラートの条件の「週の上限」(ブラウザごとに覚える。既定 2)。決まりは ⚙ の「方針・決まり」の「週の上限の決まりを足す」で画面から作れる(X61)
import { getAlertSettings } from './alertSettings'
import { tr } from './i18n'

/** 上限の決まり(policy_rules の行のうち、check_spec が「上限 週 N 回」のもの) */
interface LimitRule {
  title: string
  n: number
  market: string[]
  channel: string[]
  periodStart?: string
  periodEnd?: string
}

let rules: LimitRule[] = []
const listeners = new Set<() => void>()

/** 決まりを読み込んだときに呼ぶ(App の loadMarketingPolicies)。上限の決まりだけを残す */
export function setLimitRules(all: { title: string; checkSpec?: string; market: string[]; channel: string[]; periodStart?: string; periodEnd?: string }[]) {
  rules = all.flatMap((r) => {
    const m = (r.checkSpec ?? '').trim().match(/^上限\s+週\s+(\d+)\s*回$/)
    return m ? [{ title: r.title, n: Number(m[1]), market: r.market, channel: r.channel, periodStart: r.periodStart, periodEnd: r.periodEnd }] : []
  })
  for (const l of listeners) l()
}

/** 決まりが変わったら知らせる(上限を使う計算を、作り直すため) */
export function onLimitRulesChange(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const limitRulesVersion = () => rules

interface CardLike {
  country?: string | null
  channel?: string | null
  scheduled_at?: string | null
}

export interface WeeklyLimit {
  n: number
  /** どこから来た値か(決まりなら、その題名) */
  rule?: string
}

/** この配信に効く週の上限。配信を渡さないときは、アラートの条件の値 */
export function weeklyLimitFor(card?: CardLike): WeeklyLimit {
  if (card) {
    const day = (card.scheduled_at ?? '').slice(0, 10)
    const hit = rules.filter(
      (r) =>
        (r.market.length === 0 || !card.country || r.market.includes(card.country)) &&
        (r.channel.length === 0 || !card.channel || r.channel.includes(card.channel)) &&
        (!r.periodStart || !day || day >= r.periodStart) &&
        (!r.periodEnd || !day || day <= r.periodEnd),
    )
    // いくつも当てはまるときは、いちばん厳しい(小さい)もの
    if (hit.length) {
      const r = hit.reduce((a, b) => (b.n < a.n ? b : a))
      return { n: r.n, rule: r.title }
    }
  }
  return { n: getAlertSettings().weeklyLimit }
}

export const weeklyLimit = (card?: CardLike) => weeklyLimitFor(card).n

/** 画面に出す、上限の説明(例: 「上限 3 本(決まり: 年末セール)」) */
export function limitText(l: WeeklyLimit): string {
  return l.rule ? tr(`上限 ${l.n} 本(決まり: ${l.rule})`, `max ${l.n} (rule: ${l.rule})`) : tr(`上限 ${l.n} 本`, `max ${l.n}`)
}
