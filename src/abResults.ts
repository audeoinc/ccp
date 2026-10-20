// AB テストの結果の比べ(X55 の段階 2)。案ごとの行(delivery_results の variant・segment)から、
// 判定の指標(配信カードの ab_test.metric。配信カードの設定とそろえる)で勝ち案を決め、差が偶然でないかの目安を出す。
import type { DeliveryResult } from './data/deliveryResults'
import { metricLabel, type AbMetric, type AbTest } from './abTest'
import { tr } from './i18n'

/** 案 1 つの、テストに回した分の数字 */
export interface VariantStat {
  key: string
  recipients: number
  opens: number
  clicks: number
  orders: number
  revenue: number
  /** 判定の指標の値 */
  value?: number
}

/** 差が偶然でないかの目安 */
export type Confidence = 'sure' | 'likely' | 'notYet' | 'tooFew'

export interface AbVerdict {
  metric: AbMetric
  stats: VariantStat[]
  /** 勝ち案(指標がいちばん高い案。数字がなければ undefined) */
  winner?: VariantStat
  /** 勝ち案と比べた相手(2 番目に高い案) */
  runnerUp?: VariantStat
  /** 勝ち案の、相手に対する伸び(割合) */
  lift?: number
  /** 2 つの割合の z 検定の p 値(両側) */
  p?: number
  confidence: Confidence
  /** 売上の指標は割合でないので、偶然かどうかは注文率で見る */
  proxy: boolean
  /** 勝ち案を残りに送った分(送り方が winner のとき) */
  rollout: DeliveryResult[]
}

const n = (v?: number) => Number(v ?? 0)

/** 指標の分子(割合の指標だけ)と値 */
function measure(s: VariantStat, metric: AbMetric, push: boolean): { hits: number; value?: number } {
  const hits = metric === 'open' ? s.opens : metric === 'cvr' || metric === 'rpr' ? s.orders : push ? s.opens : s.clicks
  if (!s.recipients) return { hits }
  if (metric === 'rpr') return { hits, value: s.revenue / s.recipients }
  return { hits, value: hits / s.recipients }
}

/** 標準正規分布の累積分布(Abramowitz-Stegun の近似。目安なので、この精度で足りる) */
function phi(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989423 * Math.exp((-z * z) / 2)
  const q = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return z > 0 ? 1 - q : q
}

/** 2 つの割合の z 検定(両側の p 値)。数が少なすぎるときは undefined */
export function twoProportionP(x1: number, n1: number, x2: number, n2: number): number | undefined {
  if (!n1 || !n2) return undefined
  const p = (x1 + x2) / (n1 + n2)
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2))
  if (!se) return undefined
  const z = (x1 / n1 - x2 / n2) / se
  return 2 * (1 - phi(Math.abs(z)))
}

// 起きた数(クリック・注文など)がこれより少ない案があれば、検定の近似が当てにならないので「数が少ない」とする
const MIN_HITS = 20

export function abVerdict(parts: DeliveryResult[], ab: AbTest | null, push: boolean): AbVerdict {
  // 指標: 配信カードの設定。アプリには開封がないので、開封率ならクリック(タップ)率で見る
  const metric: AbMetric = ab?.metric === 'open' && push ? 'ctr' : (ab?.metric ?? 'ctr')
  // テストに回した分(送り方が even のときは、区分のない行が、そのまま案の全体)
  const test = parts.filter((r) => r.segment !== 'rollout')
  const keys = [...new Set(test.map((r) => r.variant ?? ''))].filter(Boolean).sort()
  const stats: VariantStat[] = keys.map((key) => {
    const rows = test.filter((r) => r.variant === key)
    const s: VariantStat = {
      key,
      recipients: rows.reduce((a, r) => a + n(r.recipients), 0),
      opens: rows.reduce((a, r) => a + n(r.opens), 0),
      clicks: rows.reduce((a, r) => a + n(r.clicks), 0),
      orders: rows.reduce((a, r) => a + n(r.orders), 0),
      revenue: rows.reduce((a, r) => a + n(r.revenue), 0),
    }
    return { ...s, value: measure(s, metric, push).value }
  })
  const ranked = stats.filter((s) => s.value !== undefined).sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  const winner = ranked[0]
  const runnerUp = ranked[1]
  const rollout = parts.filter((r) => r.segment === 'rollout')
  const base: AbVerdict = { metric, stats, winner, runnerUp, confidence: 'notYet', proxy: metric === 'rpr', rollout }
  if (!winner || !runnerUp) return base
  const lift = runnerUp.value ? (winner.value ?? 0) / runnerUp.value - 1 : undefined
  const w = measure(winner, metric, push)
  const r = measure(runnerUp, metric, push)
  if (Math.min(w.hits, r.hits) < MIN_HITS) return { ...base, lift, confidence: 'tooFew' }
  const p = twoProportionP(w.hits, winner.recipients, r.hits, runnerUp.recipients)
  const confidence: Confidence = p === undefined ? 'tooFew' : p < 0.05 ? 'sure' : p < 0.2 ? 'likely' : 'notYet'
  return { ...base, lift, p, confidence }
}

export function confidenceLabel(c: Confidence): string {
  return c === 'sure'
    ? tr('差は偶然とは言いにくい(95% の目安を超える)', 'Unlikely to be chance (passes the 95% check)')
    : c === 'likely'
      ? tr('差の傾向はあるが、まだ確かではない', 'Leaning, but not yet certain')
      : c === 'tooFew'
        ? tr('数が少なく、まだ判断できない', 'Too few events to judge yet')
        : tr('差は偶然の範囲。まだ判断できない', 'Within chance; cannot judge yet')
}

/** 1 通あたりの売上の表記。小さい数なので小数 2 桁で(通貨の記号は、売上と同じ。過去との比べ ResultCompare と同じ書き方) */
export const perRecipientMoney = (v: number, money: (v?: number) => string) => `${money(0).replace(/[\d,.]+/, '')}${v.toFixed(2)}`

/** 指標の値の表記 */
export function metricValue(metric: AbMetric, v: number | undefined, money: (v?: number) => string): string {
  if (v === undefined) return '—'
  return metric === 'rpr' ? perRecipientMoney(v, money) : `${(v * 100).toFixed(2)}%`
}

/** 「これまでの学び」(次に生かすメモ)に入れる文。勝ち案と、仮説が支持されたか */
export function learningText(v: AbVerdict, ab: AbTest | null, money: (v?: number) => string): string {
  if (!v.winner) return ''
  const label = metricLabel(v.metric)
  const vs = v.runnerUp ? ` vs ${v.runnerUp.key} ${metricValue(v.metric, v.runnerUp.value, money)}` : ''
  const lift = v.lift !== undefined ? `、${v.lift >= 0 ? '+' : ''}${Math.round(v.lift * 100)}%` : ''
  const liftEn = v.lift !== undefined ? `, ${v.lift >= 0 ? '+' : ''}${Math.round(v.lift * 100)}%` : ''
  const hypo = ab?.hypothesis.trim()
  // 仮説は「A 以外の案を試す理由」なので、A 以外が確かに勝てば支持、A が確かに勝てば支持されず
  const outcome =
    v.confidence !== 'sure'
      ? tr('判断できない(差が偶然の範囲)', 'inconclusive (within chance)')
      : v.winner.key === 'A'
        ? tr('支持されなかった(A が勝った)', 'not supported (A won)')
        : tr('支持された', 'supported')
  return [
    tr(
      `AB テスト: ${v.winner.key} 案が${v.confidence === 'sure' ? '勝ち' : '上(差は確かでない)'}。${label} ${metricValue(v.metric, v.winner.value, money)}${vs}${lift}。${confidenceLabel(v.confidence)}`,
      `A/B test: variant ${v.winner.key} ${v.confidence === 'sure' ? 'won' : 'led (not certain)'}. ${label} ${metricValue(v.metric, v.winner.value, money)}${vs}${liftEn}. ${confidenceLabel(v.confidence)}`,
    ),
    hypo ? tr(`仮説「${hypo}」は${outcome}`, `Hypothesis "${hypo}": ${outcome}`) : '',
  ]
    .filter(Boolean)
    .join('\n')
}
