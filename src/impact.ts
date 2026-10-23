// 配信の効果(結果の面の「効果」)の計算。配信が売上をどれだけ増やしたか(ホールドアウトとの差)と、
// AI に渡した学びが効いているか(学びあり / なし、AI の案の扱い、学びごと)を、配信の単位で比べる。
// 数字は配信ごとの値の平均で比べ、差が偶然の範囲かどうかの目安(95% のおおよその幅)を添える。件数が少ないうちは「材料不足」と言う。
import type { DeliveryCard } from './models/deliveryCards'
import type { DeliveryResult } from './data/deliveryResults'
import type { AiRun, AiRunAdoption, AiRunFields } from './data/aiRuns'
import type { DeliveryLift, DeliveryLiftFields } from './data/deliveryLifts'
import type { LearningReview, LearningReviewStatus } from './data/learningReviews'

// 撮影用のビルドでは、このファイルを src/mock/db.ts が読む。表のサービスを読むファイル(cancel.ts など)を import すると、読み込みが循環するので、型だけを読む
const isCancelled = (c: Pick<DeliveryCard, 'cancelled_at'>) => !!c.cancelled_at

/** 渡した学びの id の一覧(壊れた値は、渡さなかったとみなす) */
export function learningIdsOf(run: Pick<AiRun, 'learning_ids'>): string[] {
  try {
    const v = JSON.parse(run.learning_ids ?? '[]') as unknown
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}

export type Market = 'JP' | 'US'
const marketOf = (c: DeliveryCard): Market => (String(c.country ?? '') === 'US' ? 'US' : 'JP')

/** 配信 1 本の、効果の見方に使う数字 */
export interface DeliveryImpact {
  card: DeliveryCard
  result: DeliveryResult
  lift?: DeliveryLift
  market: Market
  sentAt: string
  /** AI の依頼の記録(この配信の分) */
  runs: AiRun[]
  /** 渡した学びの id(すべての依頼を合わせたもの) */
  learningIds: string[]
  /** 学びを渡したか。null = AI の依頼の記録がない */
  withLearnings: boolean | null
  /** AI の案の扱い(依頼の中でいちばん多かった扱い。同じ数なら 直した → そのまま → 使わず の順。分からなければ null) */
  adoption: AiRunAdoption | null
  recipients: number
  ctr: number | null
  cvr: number | null
  /** 1 通あたりの売上(配信を通った売上) */
  rpr: number | null
  /** 送った群の 1 人あたりの売上 − 送らなかった群の 1 人あたりの売上 */
  incPerUser: number | null
  /** 増えた売上(1 人あたりの差 × 送った人数) */
  incRevenue: number | null
  /** 送らなかった群に比べて、何割多いか(0.1 = 10%) */
  liftRate: number | null
}

const ratio = (a?: number, b?: number) => (a != null && b ? a / b : null)

/** ホールドアウトとの比べ 1 行から、1 人あたりの差・増えた売上・リフト率を出す(比べがなければ null) */
export function liftOf(lift?: DeliveryLift): { incPerUser: number; incRevenue: number; liftRate: number | null } | null {
  const tRpu = ratio(lift?.treated_revenue, lift?.treated_users)
  const hRpu = ratio(lift?.holdout_revenue, lift?.holdout_users)
  if (tRpu == null || hRpu == null) return null
  const inc = tRpu - hRpu
  return { incPerUser: inc, incRevenue: inc * (lift?.treated_users ?? 0), liftRate: hRpu ? inc / hRpu : null }
}

// 詳しい結果の「効果で見る」から、結果の面の見せ方「効果」の、決まったタブを開く。
// 見せ方を切り替えるのは App なので、URL を書き換えて「戻る」と同じ知らせ(popstate)を出し、App に読み直させる。
// 開くタブは、見せ方「効果」がすでに出ていれば知らせ(IMPACT_TAB_EVENT)で、まだなら開いたときに受け取る
export const IMPACT_TAB_EVENT = 'ccp:impact-tab'
let pendingTab: string | null = null
export function openImpactView(tab: string) {
  pendingTab = tab
  const q = new URLSearchParams(window.location.search)
  q.set('page', 'results')
  q.set('view', 'impact')
  for (const k of ['result', 'card', 'tab', 'production', 'alerts']) q.delete(k)
  window.history.pushState(null, '', `${window.location.pathname}?${q.toString()}`)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.dispatchEvent(new CustomEvent(IMPACT_TAB_EVENT, { detail: tab }))
}
export function takePendingImpactTab(): string | null {
  const t = pendingTab
  pendingTab = null
  return t
}

/** results は、配信ごとに 1 行にまとめたもの(results.ts の mergeResultsByCard を通す。AB テストの配信は、案ごとに行が分かれるため) */
export function buildImpacts(cards: DeliveryCard[], results: DeliveryResult[], runs: AiRun[], lifts: DeliveryLift[]): DeliveryImpact[] {
  const byCard = new Map(cards.map((c) => [c.id, c]))
  const runsBy = groupBy(runs, (r) => r.delivery_card_id ?? '')
  const liftBy = new Map(lifts.map((l) => [l.delivery_card_id ?? '', l]))
  // AB テストの配信は、案ごとに結果の行が分かれる。効果は配信の単位で見るので、送った数・クリック・売上を足し合わせる
  const resultBy = new Map<string, DeliveryResult>()
  for (const r of results) {
    const id = r.delivery_card_id ?? ''
    const prev = resultBy.get(id)
    resultBy.set(
      id,
      prev
        ? { ...prev, recipients: (prev.recipients ?? 0) + (r.recipients ?? 0), clicks: (prev.clicks ?? 0) + (r.clicks ?? 0), orders: (prev.orders ?? 0) + (r.orders ?? 0), revenue: (prev.revenue ?? 0) + (r.revenue ?? 0) }
        : r,
    )
  }
  const out: DeliveryImpact[] = []
  for (const [id, r] of resultBy) {
    const card = byCard.get(id)
    if (!card || isCancelled(card) || !r.recipients) continue
    const cardRuns = runsBy.get(id) ?? []
    const ids = [...new Set(cardRuns.flatMap(learningIdsOf))]
    const adoption = mainAdoption(cardRuns)
    const lift = liftBy.get(id)
    const l = liftOf(lift)
    out.push({
      card,
      result: r,
      lift,
      market: marketOf(card),
      sentAt: r.sent_at ?? card.scheduled_at ?? '',
      runs: cardRuns,
      learningIds: ids,
      withLearnings: cardRuns.length ? ids.length > 0 : null,
      adoption,
      recipients: r.recipients,
      ctr: ratio(r.clicks, r.recipients),
      cvr: ratio(r.orders, r.clicks),
      rpr: ratio(r.revenue, r.recipients),
      incPerUser: l?.incPerUser ?? null,
      incRevenue: l?.incRevenue ?? null,
      liftRate: l?.liftRate ?? null,
    })
  }
  return out.sort((a, b) => b.sentAt.localeCompare(a.sentAt))
}

function mainAdoption(runs: AiRun[]): AiRunAdoption | null {
  const order: AiRunAdoption[] = ['edited', 'as_is', 'rejected']
  const count = (a: AiRunAdoption) => runs.filter((r) => r.adoption === a).length
  const best = order.reduce((a, b) => (count(b) > count(a) ? b : a))
  return count(best) > 0 ? best : null
}

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const r of rows) {
    const k = key(r)
    m.set(k, [...(m.get(k) ?? []), r])
  }
  return m
}

// ---- 比べる(2 つの群の平均の差と、偶然の範囲の目安)

export interface Stat {
  n: number
  mean: number | null
}
export function stat(values: (number | null)[]): Stat & { sd: number } {
  const v = values.filter((x): x is number => x != null && Number.isFinite(x))
  const n = v.length
  if (!n) return { n, mean: null, sd: 0 }
  const mean = v.reduce((a, b) => a + b, 0) / n
  const sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0
  return { n, mean, sd }
}

/** 差の見立て。few = 材料不足(どちらかが 3 本未満)、up / down = 偶然の範囲を超えて上 / 下、flat = 偶然の範囲 */
export type Verdict = 'few' | 'up' | 'down' | 'flat'
export interface Diff {
  a: Stat
  b: Stat
  diff: number | null
  low: number | null
  high: number | null
  verdict: Verdict
}

/** a − b の差。幅は Welch の方法のおおよそ(t 値は 1.96 + 2.4 / 自由度 で近似。目安として出すだけなので、厳密さより分かりやすさ) */
export function compare(a: (number | null)[], b: (number | null)[], minN = 3): Diff {
  const sa = stat(a)
  const sb = stat(b)
  if (sa.mean == null || sb.mean == null || sa.n < minN || sb.n < minN) return { a: sa, b: sb, diff: sa.mean != null && sb.mean != null ? sa.mean - sb.mean : null, low: null, high: null, verdict: 'few' }
  const va = sa.sd ** 2 / sa.n
  const vb = sb.sd ** 2 / sb.n
  const se = Math.sqrt(va + vb)
  const df = se > 0 ? (va + vb) ** 2 / ((va ** 2) / (sa.n - 1) + (vb ** 2) / (sb.n - 1)) : sa.n + sb.n - 2
  const crit = 1.96 + 2.4 / Math.max(1, df)
  const diff = sa.mean - sb.mean
  const low = diff - crit * se
  const high = diff + crit * se
  return { a: sa, b: sb, diff, low, high, verdict: low > 0 ? 'up' : high < 0 ? 'down' : 'flat' }
}

// ---- 学びごとの評価

export interface LearningEval {
  /** 学びの id(配信結果の id) */
  id: string
  notes: string
  source: DeliveryCard
  sourceAt: string
  /** どの国で評価したか(画面で国を選んでいればその国、すべての国なら出元の国) */
  country: string
  /** 出元がほかの国の学び(この国で「使う」と決めて渡したもの。ST5) */
  foreign: boolean
  /** この学びを渡した配信(評価する国の配信) */
  used: DeliveryImpact[]
  /** 比べる相手: 評価する国の、出元と同じチャネルで、この学びができたあとに送り、この学びを渡さなかった配信(ほかの学びは渡していてもよい) */
  baseline: DeliveryImpact[]
  lift: Diff
  ctr: Diff
  /** この国での判定 */
  review?: LearningReview
  /** 数字から見た、おすすめの扱い */
  suggestion: LearningReviewStatus
}

const reviewTime = (r: LearningReview) => String(r.decided_at ?? r.created_on ?? '')

/**
 * 学びと国の組の、いまの判定(ST5)。その国の行のうち新しいもの。
 * なければ、出元の国なら、国を分ける前の行(国が空。分ける前は、学びは出元の国でしか使っていなかったため)
 */
export function reviewIn(reviews: LearningReview[], id: string, country: string, origin: string): LearningReview | undefined {
  const mine = reviews.filter((r) => r.learning_id === id).sort((a, b) => reviewTime(b).localeCompare(reviewTime(a)))
  return mine.find((r) => r.country === country) ?? (country === origin ? mine.find((r) => !r.country) : undefined)
}

/**
 * 評価する国の、学びの評価。country が空(すべての国)なら、学びごとに出元の国で評価する。
 * 国を決めていれば、その国の学びと、その国で使うと決めたほかの国の学びを並べる。
 * usableIn: 学びをその国で使うか(learningUsableIn。この部品は撮影用の見本のデータからも読まれるので、国の適用の表はここで読まない)
 */
export function evaluateLearnings(
  allCards: DeliveryCard[],
  results: DeliveryResult[],
  impacts: DeliveryImpact[],
  reviews: LearningReview[],
  country: string,
  usableIn: (id: string, origin: string, country: string) => boolean,
): LearningEval[] {
  const byCard = new Map(allCards.map((c) => [c.id, c]))
  const out: LearningEval[] = []
  for (const r of results) {
    const source = r.delivery_card_id ? byCard.get(r.delivery_card_id) : undefined
    if (!source || !r.notes?.trim()) continue
    const origin = String(source.country ?? '')
    const at = country || origin
    if (country && origin !== country && !usableIn(r.id, origin, country)) continue
    const used = impacts.filter((d) => d.learningIds.includes(r.id) && String(d.card.country ?? '') === at)
    const sentAt = r.sent_at ?? source.scheduled_at ?? ''
    const baseline = impacts.filter((d) => d.withLearnings != null && !d.learningIds.includes(r.id) && d.sentAt > sentAt && String(d.card.country ?? '') === at && d.card.channel === source.channel)
    const lift = compare(
      used.map((d) => d.liftRate),
      baseline.map((d) => d.liftRate),
    )
    const ctr = compare(
      used.map((d) => d.ctr),
      baseline.map((d) => d.ctr),
    )
    const suggestion: LearningReviewStatus = lift.verdict === 'up' ? 'keep' : lift.verdict === 'down' ? 'retired' : lift.verdict === 'flat' && lift.a.n >= 6 ? 'retired' : 'watch'
    out.push({ id: r.id, notes: r.notes.trim(), source, sourceAt: sentAt, country: at, foreign: at !== origin, used, baseline, lift, ctr, review: reviewIn(reviews, r.id, at, origin), suggestion })
  }
  return out.sort((a, b) => b.used.length - a.used.length || b.sourceAt.localeCompare(a.sourceAt))
}

/**
 * その国で外した学び(配信カードの「これまでの学び」と AI への依頼から除く)。判定は学びと国の組ごと(ST5)。
 * originOf: 学びの出元の国(国を分ける前の判定を、出元の国の判定として読むため)。country が空なら、出元の国の判定を見る
 */
export function retiredLearningIds(reviews: LearningReview[], country: string, originOf: (id: string) => string): Set<string> {
  const ids = new Set(reviews.map((r) => r.learning_id).filter((x): x is string => !!x))
  return new Set([...ids].filter((id) => reviewIn(reviews, id, country || originOf(id), originOf(id))?.status === 'retired'))
}

// ---- 見本(撮影用のビルドの初期データ。サーバーの server/ccp/impact.py と同じ考え方)

/** AI の依頼の種類(見本で、配信ごとに 1 回ずつ頼んだことにする) */
export const SAMPLE_TASKS = ['suggest_theme', 'suggest_copy', 'select_products', 'select_hero']

// 決まった種から作る乱数(mulberry32)。同じ配信なら、いつも同じ見本になる
function rand(seedText: string) {
  let h = 2166136261
  for (let i = 0; i < seedText.length; i++) h = Math.imul(h ^ seedText.charCodeAt(i), 16777619)
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 学びの「効き目」(見本の中だけの、隠れた値。効く学び・効かない学び・逆効果の学びが混ざるように) */
const learningQuality = (id: string) => rand(`learning:${id}`)() * 0.14 - 0.05

/**
 * 見本を作る。送った配信ごとに、AI の依頼 4 回(学びは 7 割の配信で渡す。渡せる学びのうち、それぞれ 7 割の確率で選んで渡す。
 * 学びごとの効き目を切り分けられるように、いつも同じ組み合わせにはしない)と、
 * 1 割のホールドアウトとの比べを作る。増分は、学びの効き目と、人が直したかで少し変わるようにする(画面で差が見えるように)
 */
export function sampleImpact(cards: DeliveryCard[], results: DeliveryResult[]): { runs: AiRunFields[]; lifts: DeliveryLiftFields[] } {
  const byCard = new Map(cards.map((c) => [c.id, c]))
  const sentAt = (r: DeliveryResult) => r.sent_at ?? byCard.get(r.delivery_card_id ?? '')?.scheduled_at ?? ''
  const noted = results.filter((r) => r.notes?.trim() && byCard.has(r.delivery_card_id ?? ''))
  const runs: AiRunFields[] = []
  const lifts: DeliveryLiftFields[] = []
  const seen = new Set<string>()
  for (const r of results) {
    const card = byCard.get(r.delivery_card_id ?? '')
    if (!card || isCancelled(card) || !r.recipients || seen.has(card.id)) continue
    seen.add(card.id)
    // AB テストの配信は、案ごとの行を足し合わせる(案の行があれば、配信全体の行は数えない。二重に数えないため。results.ts の mergeRows と同じ決まり)
    const all = results.filter((x) => x.delivery_card_id === card.id)
    const rows = all.some((x) => x.variant) ? all.filter((x) => x.variant) : all
    const recipients = rows.reduce((a, x) => a + (x.recipients ?? 0), 0)
    const revenue = rows.reduce((a, x) => a + (x.revenue ?? 0), 0)
    const orders = rows.reduce((a, x) => a + (x.orders ?? 0), 0)
    const rng = rand(`impact:${card.id}`)
    const at = sentAt(r)
    const candidates = noted
      .filter((n) => {
        const c = byCard.get(n.delivery_card_id ?? '')!
        return c.id !== card.id && c.country === card.country && c.channel === card.channel && sentAt(n) < at
      })
      .sort((a, b) => sentAt(b).localeCompare(sentAt(a)))
      .slice(0, 8)
    const pass = candidates.length > 0 && rng() < 0.7
    const picked = candidates.filter(() => rng() < 0.7)
    const ids = pass ? (picked.length ? picked : candidates.slice(0, 1)).map((n) => n.id) : []
    let edited = 0
    for (const task of SAMPLE_TASKS) {
      const x = rng()
      const adoption: AiRunAdoption = x < 0.45 ? 'as_is' : x < 0.85 ? 'edited' : 'rejected'
      if (adoption === 'edited') edited++
      runs.push({ delivery_card_id: card.id, task, learning_ids: JSON.stringify(ids), adoption, sample: 1 })
    }
    // 学びの効き目は足し合わせる(効く学びが多いほど、増分が増える。逆効果の学びは減らす)
    const quality = ids.reduce((a, id) => a + learningQuality(id), 0)
    const share = Math.min(0.6, Math.max(0.01, 0.1 + (pass ? quality : 0) + (edited >= 2 ? 0.02 : 0) + (rng() - 0.5) * 0.08))
    // 送った群の売上は、配信を通った売上の 2.5〜3.5 倍(店舗・EC・配信を通らない分も数えるため)
    const treatedRevenue = revenue * (2.5 + rng())
    const holdoutUsers = Math.round((recipients * 0.1) / 0.9)
    const holdoutRpu = (treatedRevenue / recipients) * (1 - share)
    const treatedOrders = Math.round(orders * (2.5 + rng()))
    lifts.push({
      delivery_card_id: card.id,
      holdout_rate: 0.1,
      window_days: 7,
      treated_users: recipients,
      holdout_users: holdoutUsers,
      treated_orders: treatedOrders,
      holdout_orders: Math.round((treatedOrders / recipients) * holdoutUsers * (1 - share)),
      treated_revenue: Math.round(treatedRevenue * 100) / 100,
      holdout_revenue: Math.round(holdoutRpu * holdoutUsers * 100) / 100,
      sample: 1,
    })
  }
  return { runs, lifts }
}
