// 週のレビューの確認の一覧(バックログ W4)。週の計画を確定する前に、見落としやすい点を、件数で出す。
// 判定はここにまとめ、画面(WeekChecklist)は結果を並べるだけにする(あとで条件を変えやすくするため)
import type { Cr854_deliverycards } from './generated/models/Cr854_deliverycardsModel'
import type { Cr854_products } from './generated/models/Cr854_productsModel'
import { cardMarket, productMarket } from './market'
import { tr } from './i18n'

/** 同じ商品を、週に何本の配信まで載せてよいか。設定(C3)ができるまでの、仮の値 */
export const WEEKLY_PRODUCT_LIMIT = 2

const EMAIL = 588230000
const PUSH = 588230001
const STATUS_APPROVED = 588230002

/** 商品の販売方針のうち、確認に使うもの(商品コードごと) */
export interface PolicyLite {
  stage?: string
  /** 販促の期間(「YYYY-MM-DD - YYYY-MM-DD」) */
  promoPeriod?: string
}

export type CheckKey = 'overLimit' | 'pushAlign' | 'leadMissing' | 'repeat' | 'openComments' | 'openQuestions' | 'approved'

export interface CheckItem {
  key: CheckKey
  /** 問題の数(approved だけは、承認済みの数) */
  count: number
  /** approved のときの分母(週の配信の数) */
  total?: number
  /** 問題がない状態か(approved は、すべて承認済みのとき) */
  ok: boolean
  /** 選んだときに目立たせる配信 */
  cardIds: string[]
  /** 選んだときに目立たせる商品 */
  productIds: string[]
  /** 選んだときに出す、中身の短い説明(商品名と回数・配信名 など) */
  details: string[]
}

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const norm = (s?: string) => (s ?? '').trim().replace(/\s+/g, ' ')
const time = (c: Cr854_deliverycards) => (c.cr854_scheduledat ? new Date(c.cr854_scheduledat).getTime() : 0)

/** 主力の商品か(方針の段階は、日本語・英語のどちらでも入っている) */
const isLead = (p?: PolicyLite) => p?.stage === '主力' || p?.stage === 'Core'

/** 販促の期間が、週(start〜end。YYYY-MM-DD)と重なるか。期間が読めないときは、重ならないとみなす */
function overlaps(period: string | undefined, start: string, end: string): boolean {
  const m = (period ?? '').match(/(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})/)
  if (!m) return false
  return m[1] <= end && m[2] >= start
}

export interface ChecklistInput {
  /** 週の初め(日曜日) */
  weekStart: Date
  /** この週の配信(絞り込みを反映しない、すべて) */
  weekCards: Cr854_deliverycards[]
  /** すべての配信(前の週の最後の配信との連続を見るため) */
  allCards: Cr854_deliverycards[]
  cardProducts: Map<string, string[]>
  products: Cr854_products[]
  /** 商品コード → 方針 */
  policies: Map<string, PolicyLite>
  /** 配信ごとの、未解決の質問の数 */
  questionCounts: Map<string, number>
  /** 配信ごとの、未対応のレビューのコメントの数 */
  commentCounts: Map<string, number>
  /** 配信を、説明の中で呼ぶ名前(曜日つき など)。画面の言語に合わせて、画面側で作る */
  cardLabel: (c: Cr854_deliverycards) => string
}

export function buildChecklist({ weekStart, weekCards, allCards, cardProducts, products, policies, questionCounts, commentCounts, cardLabel }: ChecklistInput): CheckItem[] {
  const start = ymd(weekStart)
  const end = ymd(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6))
  const productById = new Map(products.map((p) => [p.cr854_productid, p]))
  const name = (id: string) => productById.get(id)?.cr854_name ?? id
  const inWeek = new Set(weekCards.map((c) => c.cr854_deliverycardid))
  const ids = (c: Cr854_deliverycards) => cardProducts.get(c.cr854_deliverycardid) ?? []

  // ---- 週の上限を超えた商品: 1 本の配信に同じ商品が 2 回あっても、1 本と数える(配信の数で偏りを見る)
  const used = new Map<string, string[]>()
  for (const c of weekCards) {
    for (const pid of new Set(ids(c))) used.set(pid, [...(used.get(pid) ?? []), c.cr854_deliverycardid])
  }
  const over = [...used].filter(([, cs]) => cs.length > WEEKLY_PRODUCT_LIMIT).sort((a, b) => b[1].length - a[1].length)
  const overLimit: CheckItem = {
    key: 'overLimit',
    count: over.length,
    ok: over.length === 0,
    cardIds: [...new Set(over.flatMap(([, cs]) => cs))],
    productIds: over.map(([pid]) => pid),
    details: over.map(([pid, cs]) => `${name(pid)} ×${cs.length}`),
  }

  // ---- メールとプッシュ: 同じ日にメールがあるのに、プッシュのテーマが、その日のどのメールとも違う(またはテーマがない)
  const byDay = new Map<string, Cr854_deliverycards[]>()
  for (const c of weekCards) {
    if (!c.cr854_scheduledat) continue
    const k = ymd(new Date(c.cr854_scheduledat))
    byDay.set(k, [...(byDay.get(k) ?? []), c])
  }
  const misaligned: { push: Cr854_deliverycards; emails: Cr854_deliverycards[] }[] = []
  for (const list of byDay.values()) {
    const emails = list.filter((c) => c.cr854_channel === EMAIL)
    if (emails.length === 0) continue
    const themes = new Set(emails.map((c) => norm(c.cr854_theme)).filter(Boolean))
    for (const push of list.filter((c) => c.cr854_channel === PUSH)) {
      const th = norm(push.cr854_theme)
      if (!th || !themes.has(th)) misaligned.push({ push, emails })
    }
  }
  const pushAlign: CheckItem = {
    key: 'pushAlign',
    count: misaligned.length,
    ok: misaligned.length === 0,
    cardIds: [...new Set(misaligned.flatMap((m) => [m.push, ...m.emails].map((c) => c.cr854_deliverycardid)))],
    productIds: [],
    details: misaligned.map((m) => cardLabel(m.push)),
  }

  // ---- 主力の漏れ: 販促の期間が週と重なる主力の商品のうち、この週のどの配信にも載っていないもの。
  // 対象は、この週の配信の国に合う市場の商品だけ(国が未設定の配信があれば、すべての市場)
  const markets = new Set(weekCards.map((c) => cardMarket(String(c.cr854_country ?? ''))))
  const allMarkets = markets.has(null)
  const missing = products.filter((p) => {
    if (!weekCards.length) return false
    if (!allMarkets && !markets.has(productMarket(p))) return false
    const pol = p.cr854_productcode ? policies.get(p.cr854_productcode) : undefined
    return isLead(pol) && overlaps(pol?.promoPeriod, start, end) && !used.has(p.cr854_productid)
  })
  const leadMissing: CheckItem = {
    key: 'leadMissing',
    count: missing.length,
    ok: missing.length === 0,
    cardIds: [],
    productIds: missing.map((p) => p.cr854_productid),
    details: missing.map((p) => p.cr854_name),
  }

  // ---- テーマ・メイン画像の連続: 同じチャネルで、すぐ前の配信と同じテーマ、または同じメイン画像。
  // 前の週の最後の配信との連続も数える(週の境目で続くのも、受け取る側には同じ)。メールとプッシュがテーマをそろえるのは、狙いなので数えない
  const repeats: { prev: Cr854_deliverycards; cur: Cr854_deliverycards; what: 'theme' | 'hero' | 'both' }[] = []
  for (const ch of [EMAIL, PUSH]) {
    const seq = allCards.filter((c) => c.cr854_channel === ch && c.cr854_scheduledat).sort((a, b) => time(a) - time(b))
    for (let i = 1; i < seq.length; i++) {
      const [prev, cur] = [seq[i - 1], seq[i]]
      if (!inWeek.has(cur.cr854_deliverycardid)) continue
      const theme = !!norm(cur.cr854_theme) && norm(cur.cr854_theme) === norm(prev.cr854_theme)
      const hero = !!cur._cr854_heroimage_value && cur._cr854_heroimage_value === prev._cr854_heroimage_value
      if (theme || hero) repeats.push({ prev, cur, what: theme && hero ? 'both' : theme ? 'theme' : 'hero' })
    }
  }
  const repeat: CheckItem = {
    key: 'repeat',
    count: repeats.length,
    ok: repeats.length === 0,
    cardIds: [...new Set(repeats.flatMap((r) => [r.prev, r.cur].map((c) => c.cr854_deliverycardid)))],
    productIds: [],
    details: repeats.map((r) => {
      const what = r.what === 'both' ? tr('テーマ・メイン画像', 'theme & main image') : r.what === 'theme' ? tr('テーマ', 'theme') : tr('メイン画像', 'main image')
      return `${cardLabel(r.prev)} → ${cardLabel(r.cur)}(${what})`
    }),
  }

  // ---- 未対応のレビューのコメント・未解決の質問(配信ごとの数を足す)
  const openOf = (key: 'openComments' | 'openQuestions', counts: Map<string, number>): CheckItem => {
    const hit = weekCards.filter((c) => (counts.get(c.cr854_deliverycardid) ?? 0) > 0)
    const n = hit.reduce((sum, c) => sum + (counts.get(c.cr854_deliverycardid) ?? 0), 0)
    return {
      key,
      count: n,
      ok: n === 0,
      cardIds: hit.map((c) => c.cr854_deliverycardid),
      productIds: [],
      details: hit.map((c) => `${cardLabel(c)} ×${counts.get(c.cr854_deliverycardid)}`),
    }
  }
  const openComments = openOf('openComments', commentCounts)
  const openQuestions = openOf('openQuestions', questionCounts)

  // ---- 承認の数: 選んだときは、まだ承認されていない配信を出す(残りの作業が分かるように)
  const notApproved = weekCards.filter((c) => (c.cr854_status ?? 0) < STATUS_APPROVED)
  const approved: CheckItem = {
    key: 'approved',
    count: weekCards.length - notApproved.length,
    total: weekCards.length,
    ok: weekCards.length > 0 && notApproved.length === 0,
    cardIds: notApproved.map((c) => c.cr854_deliverycardid),
    productIds: [],
    details: notApproved.map(cardLabel),
  }

  return [overLimit, pushAlign, leadMissing, repeat, openComments, openQuestions, approved]
}
