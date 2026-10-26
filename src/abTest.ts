// AB テスト(X55)。1 つの配信カードの中に、A 案(いまの配信そのもの)と、B・C 案(A と違うところだけ)を持つ。
// 実際に受信者を分けて送るのは、配信システム(CCP は送らない)。CCP は、テストの設計・案の中身・制作への受け渡し・案ごとの結果を受け持つ。
// 案ごとに持てるのは、メイン画像と商品だけ(比べる要素を絞るため)。テーマ・コピー・リンク先・時刻などは全案で共通。
// 商品が全案で共通のときも、商品の画像(この配信で使う画像。X64)だけは案ごとに替えられる(ab_test の images。A と違う商品だけ持つ)。
// 保存先: テストの設定と B・C 案のメイン画像は delivery_cards.ab_test(JSON)、B・C 案の商品は delivery_products の variant 列('B'・'C'。A は空)
// 比べる要素が all(全体)のときは、テンプレートも案ごとに持てる(SU2 ⑤⑧。B・C 案のテンプレートは ab_test の templates。A は配信の layout_key・layout_version)
import { tr } from './i18n'
import type { PartContent } from './partContent'

/** 案の記号。A はいまの配信そのもの */
export type VariantKey = 'A' | 'B' | 'C'
export const VARIANT_KEYS: VariantKey[] = ['A', 'B', 'C']
/** 比べる要素(all = メイン画像・商品・文言(ヘッドライン・コピー・セクションの見出しとコピー・通知の文)のすべて) */
export type AbTarget = 'hero' | 'products' | 'both' | 'all' | 'subject'
/** 使い方(test = AB テスト: 全案を分けて送る / choose = 案から選ぶ: 決めた 1 案だけを送る。X57) */
export type AbPurpose = 'test' | 'choose'
/** 判定の指標 */
export type AbMetric = 'ctr' | 'rpr' | 'cvr' | 'open'
/** 送り方(winner = 一部に送って、勝った案を残りに自動で送る / even = 全員を均等に分ける) */
export type AbMode = 'winner' | 'even'

export interface VariantHero {
  heroId?: string
  heroReason?: string
}

/** 案ごとの文言(比べる要素が all のとき) */
export interface VariantText {
  headline: string
  copy: string
  pushTitle: string
  pushBody: string
  sectionTitles: string[]
  sectionCopies: string[]
  /** メールの件名・プリヘッダー(比べる要素が subject か all のとき。古いデータにはない) */
  subject?: string
  preheader?: string
  /** テンプレートの部品の、配信ごとの中身(T8 段階 6。比べる要素が all のとき。古いデータにはない = 配信の part_content と同じ) */
  parts?: PartContent
}

/** 案から選んだ結果(X57)。配信しなかった案は、中身ごと残す(あとで見返せるように) */
export interface AbDecision {
  /** 決めた案(配信の中身になった案) */
  variant: VariantKey
  at: string
  by: string
  target: AbTarget
  rejected: RejectedVariant[]
}
export interface RejectedVariant {
  key: VariantKey
  heroId?: string
  heroReason?: string
  productIds: string[]
  texts?: VariantText
  /** その案のテンプレート(鍵「ID@v版」。案ごとに持っていたときだけ) */
  template?: string
}

export interface AbTest {
  v: 1
  /** 使い方(古いデータにはない = test) */
  purpose?: AbPurpose
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
  /** B・C 案の文言(比べる要素が all のとき) */
  texts?: Partial<Record<VariantKey, VariantText>>
  /**
   * B・C 案のテンプレート(比べる要素が all のとき。A と同じ案は持たない)。鍵は版まで決めた「ID@v版」
   * (テンプレートを編集しても、保存した案の形が変わらないように。A の layout_version と同じ考え)
   */
  templates?: Partial<Record<VariantKey, string>>
  /**
   * B・C 案の商品の画像(X64 の e。商品が全案で共通のときだけ。商品を案ごとに持つときは、その案の商品の行に画像がある)。
   * A と違う商品だけ持つ。鍵は商品 ID、値はこの配信で使う画像の URL(空 = 商品のマスタの画像)
   */
  images?: Partial<Record<VariantKey, Record<string, string>>>
  /** 案から選んだ結果。決めたあとは variants が空になり、AB テスト(案を持つ配信)としては扱わない */
  decided?: AbDecision
}

/** はじめて AB テストにしたときの既定(利用者と決めた: 指標はクリック率、送り方は勝った案を残りに) */
export const newAbTest = (purpose: AbPurpose = 'test'): AbTest => ({
  v: 1,
  purpose,
  variants: ['B'],
  // 案から選ぶときは、クリエイティブ全体を変えられるように(利用者 2026-10-20: 全部変える)
  target: purpose === 'choose' ? 'all' : 'hero',
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

/** 案を持つ配信(AB テスト・案から選ぶ の途中)。決めたあと・しないときは null */
export const encodeAbTest = (ab: AbTest | null, decided?: AbDecision | null): string =>
  ab && ab.variants.length > 0 ? JSON.stringify(ab) : decided ? JSON.stringify({ v: 1, purpose: 'choose', variants: [], target: decided.target, metric: 'ctr', mode: 'even', testShare: 0, waitHours: 0, hypothesis: '', heroes: {}, decided }) : ''

/** 案から選んだ結果(決めたあとの配信だけ) */
export function parseDecision(json?: string | null): AbDecision | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as AbTest
    return v?.decided?.variant ? v.decided : null
  } catch {
    return null
  }
}

export const isChoose = (ab: AbTest | null) => ab?.purpose === 'choose'

/** 案ごとに商品を持つか / メイン画像を持つか */
export const ownsProducts = (ab: AbTest | null) => !!ab && (ab.target === 'products' || ab.target === 'both' || ab.target === 'all')
export const ownsHero = (ab: AbTest | null) => !!ab && (ab.target === 'hero' || ab.target === 'both' || ab.target === 'all')
export const ownsText = (ab: AbTest | null) => !!ab && ab.target === 'all'
/** 商品の画像を、案ごとに ab_test の images で持つか(商品が全案で共通のとき) */
export const ownsImages = (ab: AbTest | null) => !!ab && !ownsProducts(ab)

/** 案の商品の画像(A と違う分)を、商品の並びに重ねる(プレビュー・商品のフロートで、その案の画像を出す) */
export function withVariantImages<T extends { productId: string; imageUrl?: string }>(items: T[], over?: Record<string, string>): T[] {
  if (!over || Object.keys(over).length === 0) return items
  return items.map((i) => (i.productId in over ? { ...i, imageUrl: over[i.productId] || undefined } : i))
}

/** 案 k の商品の画像を決める。A と同じ画像なら持たない(A と違うところだけ持つ決まり) */
export function setVariantImage(ab: AbTest, k: VariantKey, productId: string, url: string, aUrl: string): AbTest {
  const cur = { ...(ab.images?.[k] ?? {}) }
  if (url === aUrl) delete cur[productId]
  else cur[productId] = url
  const images = { ...(ab.images ?? {}), [k]: cur }
  if (Object.keys(cur).length === 0) delete images[k]
  return { ...ab, images }
}

type ImageItem = { productId: string; imageUrl?: string }

/** 案の商品の並び(x)のうち、A にもある商品で、A と画像が違うもの(商品 ID → 画像の URL。空 = 商品のマスタの画像) */
export function imagesDiff(a: ImageItem[], x: ImageItem[]): Record<string, string> {
  const aUrl = new Map(a.map((i) => [i.productId, i.imageUrl ?? '']))
  return Object.fromEntries(x.filter((i) => aUrl.has(i.productId) && aUrl.get(i.productId) !== (i.imageUrl ?? '')).map((i) => [i.productId, i.imageUrl ?? '']))
}

/**
 * 保存する案の画像: 残っている案・いまの商品で、A と違うものだけ(商品を外した・案を消したときの残りを捨てる)。
 * variantItems があれば(シンプルな画面は、編集の間はどの案も商品の並びを持つ)、その並びの画像から作る
 */
export function pruneVariantImages(ab: AbTest, a: ImageItem[], variantItems?: (k: VariantKey) => ImageItem[]): AbTest['images'] {
  const out: NonNullable<AbTest['images']> = {}
  for (const k of ab.variants) {
    const diff = imagesDiff(a, variantItems ? variantItems(k) : withVariantImages(a, ab.images?.[k]))
    if (Object.keys(diff).length) out[k] = diff
  }
  return Object.keys(out).length ? out : undefined
}
/** 件名・プリヘッダーを案ごとに持つか(件名だけを比べる・すべてを変える) */
export const ownsSubject = (ab: AbTest | null) => !!ab && (ab.target === 'subject' || ab.target === 'all')
/** 文言(件名・プリヘッダーを含む)を、案ごとに保存するか */
export const ownsAnyText = (ab: AbTest | null) => ownsText(ab) || ownsSubject(ab)
/**
 * テンプレートを案ごとに持つか。全体を比べるときだけ(テンプレートが違えば、見出し・コピー・商品の枠も合わせて違うため。
 * 文言を案ごとに持たないのにテンプレートだけ違うと、セクションの番号で持つ見出し・コピーがずれる)
 */
export const ownsTemplate = (ab: AbTest | null) => ownsText(ab)

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
  t === 'hero'
    ? tr('メイン画像', 'Hero image')
    : t === 'products'
      ? tr('商品', 'Products')
      : t === 'both'
        ? tr('メイン画像と商品', 'Hero image and products')
        : t === 'subject'
          ? tr('件名・プリヘッダー', 'Subject and preheader')
          : tr('メイン画像・商品・文言(件名も)', 'Hero image, products and text (incl. subject)')

export const metricLabel = (m: AbMetric) =>
  m === 'ctr' ? tr('クリック率', 'Click rate') : m === 'rpr' ? tr('受信者あたりの売上', 'Revenue per recipient') : m === 'cvr' ? tr('注文率', 'Order rate') : tr('開封率', 'Open rate')

/** 制作・配信の担当に渡す、テストの設定の文(制作指示・制作の依頼の写しに入れる) */
export function abSummary(ab: AbTest): string {
  const keys = allVariants(ab)
  if (isChoose(ab))
    return tr(
      `案から選ぶ: ${keys.join('・')} の ${keys.length} 案から、1 案に決めて配信する(まだ決まっていません。配信カードで「この案に決める」)。違うのは${targetLabel(ab.target)}`,
      `Choose a variant: one of ${keys.length} variants (${keys.join(', ')}) will be sent (not decided yet; use "Go with this variant" in the delivery card). Differs in: ${targetLabel(ab.target).toLowerCase()}`,
    )
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
