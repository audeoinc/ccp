// AB テスト(X55)。1 つの配信カードの中に、A 案(いまの配信そのもの)と、B・C 案(A と違うところだけ)を持つ。
// 実際に受信者を分けて送るのは、配信システム(CCP は送らない)。CCP は、テストの設計・案の中身・制作への受け渡し・案ごとの結果を受け持つ。
// 案ごとに持てるのは、メイン画像と商品だけ(比べる要素を絞るため)。テーマ・コピー・リンク先・時刻などは全案で共通。
// 保存先: テストの設定と B・C 案のメイン画像は delivery_cards.ab_test(JSON)、B・C 案の商品は delivery_products の variant 列('B'・'C'。A は空)
import { tr } from './i18n'

/** 案の記号。A はいまの配信そのもの */
export type VariantKey = 'A' | 'B' | 'C'
export const VARIANT_KEYS: VariantKey[] = ['A', 'B', 'C']
/** 案の数の上限(A・B・C) */
export const MAX_VARIANTS = 3

/** 比べる要素 */
export type AbTarget = 'hero' | 'products' | 'both'
/** 判定の指標 */
export type AbMetric = 'ctr' | 'rpr' | 'cvr' | 'open'
/** 送り方(winner = 一部に送って、勝った案を残りに自動で送る / even = 全員を均等に分ける) */
export type AbMode = 'winner' | 'even'

export interface VariantHero {
  heroId?: string
  heroReason?: string
}

export interface AbTest {
  v: 1
  /** A 以外の案(B・C)。並びは記号の順 */
  variants: VariantKey[]
  target: AbTarget
  metric: AbMetric
  mode: AbMode
  /** winner: テストに回す割合(全体の %。残りが勝った案を受け取る) */
  testShare: number
  /** winner: 勝ち負けを決めるまでの時間(時間) */
  waitHours: number
  /** 仮説(何を確かめたいか) */
  hypothesis: string
  /** B・C 案のメイン画像(比べる要素に画像を含むとき) */
  heroes: Partial<Record<VariantKey, VariantHero>>
}

/** はじめて AB テストにしたときの既定(利用者と決めた: 指標はクリック率、送り方は勝った案を残りに) */
export const newAbTest = (): AbTest => ({
  v: 1,
  variants: ['B'],
  target: 'hero',
  metric: 'ctr',
  mode: 'winner',
  testShare: 20,
  waitHours: 4,
  hypothesis: '',
  heroes: {},
})

export function parseAbTest(json?: string | null): AbTest | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as AbTest
    if (!v || v.v !== 1 || !Array.isArray(v.variants) || v.variants.length === 0) return null
    return { ...newAbTest(), ...v, heroes: v.heroes ?? {} }
  } catch {
    return null
  }
}

export const encodeAbTest = (ab: AbTest | null): string => (ab && ab.variants.length > 0 ? JSON.stringify(ab) : '')

/** 案ごとに商品を持つか / メイン画像を持つか */
export const ownsProducts = (ab: AbTest | null) => !!ab && (ab.target === 'products' || ab.target === 'both')
export const ownsHero = (ab: AbTest | null) => !!ab && (ab.target === 'hero' || ab.target === 'both')

/** A を含む、すべての案 */
export const allVariants = (ab: AbTest | null): VariantKey[] => (ab ? ['A', ...ab.variants] : ['A'])

/** 次に足す案の記号(空きがなければ undefined) */
export const nextVariant = (ab: AbTest): VariantKey | undefined => VARIANT_KEYS.slice(1).find((k) => !ab.variants.includes(k))

/** 案ごとの配分(%)。winner はテストの割合を案の数で割る(端数は A に寄せる) */
export function splitOf(ab: AbTest): Record<VariantKey, number> {
  const keys = allVariants(ab)
  const total = ab.mode === 'winner' ? ab.testShare : 100
  const each = Math.floor(total / keys.length)
  const out = { A: 0, B: 0, C: 0 } as Record<VariantKey, number>
  for (const k of keys) out[k] = each
  out.A += total - each * keys.length
  return out
}

export const targetLabel = (t: AbTarget) =>
  t === 'hero' ? tr('メイン画像', 'Hero image') : t === 'products' ? tr('商品', 'Products') : tr('メイン画像と商品', 'Hero image and products')

export const metricLabel = (m: AbMetric) =>
  m === 'ctr' ? tr('クリック率', 'Click rate') : m === 'rpr' ? tr('受信者あたりの売上', 'Revenue per recipient') : m === 'cvr' ? tr('注文率', 'Order rate') : tr('開封率', 'Open rate')

/** 制作・配信の担当に渡す、テストの設定の文(制作指示・制作の依頼の写しに入れる) */
export function abSummary(ab: AbTest): string {
  const keys = allVariants(ab)
  const split = splitOf(ab)
  const parts = keys.map((k) => `${k} ${split[k]}%`).join(' / ')
  const how =
    ab.mode === 'winner'
      ? tr(
          `一部に送って、勝った案を残りに送る(テスト ${ab.testShare}%: ${parts}。${ab.waitHours} 時間後に、${metricLabel(ab.metric)}で勝った案を残り ${100 - ab.testShare}% に)`,
          `Send to a test group, then the winner to the rest (test ${ab.testShare}%: ${parts}; after ${ab.waitHours} h, the winner by ${metricLabel(ab.metric)} goes to the remaining ${100 - ab.testShare}%)`,
        )
      : tr(`全員を均等に分ける(${parts}。判定は${metricLabel(ab.metric)})`, `Split everyone evenly (${parts}; judged by ${metricLabel(ab.metric)})`)
  return [
    tr(`AB テスト: ${keys.join('・')} の ${keys.length} 案。比べるのは${targetLabel(ab.target)}(それ以外は全案で共通)`, `A/B test: ${keys.length} variants (${keys.join(', ')}). Compares the ${targetLabel(ab.target).toLowerCase()} (everything else is shared)`),
    how,
    ab.hypothesis.trim() ? tr(`仮説: ${ab.hypothesis.trim()}`, `Hypothesis: ${ab.hypothesis.trim()}`) : '',
  ]
    .filter(Boolean)
    .join('\n')
}
